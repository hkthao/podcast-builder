/**
 * Gallery render pipeline — Phase 4d.
 *
 * Render 1 chapter của gallery plan thành MP4 16:9 @ 24fps:
 *  1. Resolve mỗi visualBeat → ResolvedBeat (startFrame + durationFrames +
 *     assetUrl từ assetIdRef).
 *  2. Bundle gallery/src/index.ts qua @remotion/bundler.
 *  3. selectComposition("GalleryChapter") với calculateMetadata.
 *  4. renderMedia → tmp/gallery-{planId}-ch{idx}.mp4.
 *
 * Asset URL: dùng remote URL trực tiếp (Wikimedia CDN/Met). Slow nhưng OK
 * cho v1. Phase 4d.x sẽ add local prefetch cache.
 *
 * Beat timing: sentenceIdx → startMs qua chia transcript thành sentences
 * + map word index của câu đầu → wordTimestamps[i].startMs.
 */
import path from "node:path";
import fs from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import {
  getStoryboard,
  updateChapterVideo,
  type Storyboard,
} from "./gallery-storyboard-store";
import { prepareChapterRenderAudio, resolveAmbienceBed } from "./gallery-bgm-mix";
import { prefetchAssetsBatch } from "./gallery-asset-prefetch";
import { bus } from "./events";
import { getAsset } from "./gallery-asset-store";
import { PATHS } from "./paths";
import type { Shot } from "../../gallery/src/shot";
import type { WordTimestamp } from "../../gallery/src/word-timestamp";
import type {
  GalleryChapterProps,
  ResolvedBeat,
} from "../../gallery/src/GalleryChapter";

const FPS = 24;
const execFileAsync = promisify(execFile);

/** Đo độ dài THẬT (ms) của file audio/video bằng ffprobe. 0 nếu lỗi. */
async function ffprobeDurationMs(filePath: string): Promise<number> {
  try {
    const { stdout } = await execFileAsync("ffprobe", [
      "-v", "error", "-show_entries", "format=duration",
      "-of", "default=nw=1:nk=1", filePath,
    ]);
    const sec = parseFloat(stdout.trim());
    return Number.isFinite(sec) && sec > 0 ? Math.round(sec * 1000) : 0;
  } catch {
    return 0;
  }
}

const ENTRY_POINT = path.resolve("gallery/src/index.ts");
const COMPOSITION_ID = "GalleryChapter";

export const galleryChapterVideoFilename = (
  planId: string,
  chapterIdx: number,
): string => `gallery-${planId}-ch${String(chapterIdx).padStart(2, "0")}.mp4`;

/**
 * Tính sentenceIdx → startMs bằng cách:
 *   1. Split transcript thành sentences (giống countSentences).
 *   2. Đếm word count cumulative cho mỗi sentence boundary.
 *   3. wordTimestamps[Ni].startMs = đầu sentence i+1.
 *
 * Giả định: số word trong transcript ≈ số word trong wordTimestamps (sau
 * subword merge ở Phase 4b). Nếu lệch lớn, beats vẫn render được nhưng
 * timing không chuẩn (offset 0.5-2s).
 */
function computeSentenceStartMs(
  transcript: string,
  wordTimestamps: WordTimestamp[],
  audioDurationMs: number,
): number[] {
  const sentences = transcript
    .split(/[.!?]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (sentences.length === 0) return [];

  // Cumulative word count tại biên mỗi sentence
  const cumulativeWords: number[] = [0]; // sentence 0 starts at word 0
  for (const s of sentences) {
    const words = s.split(/\s+/).filter((w) => w.length > 0);
    cumulativeWords.push(cumulativeWords[cumulativeWords.length - 1] + words.length);
  }
  // cumulativeWords[i] = word index của câu i bắt đầu

  return sentences.map((_, i) => {
    const wordIdx = cumulativeWords[i];
    if (wordIdx < wordTimestamps.length) {
      return wordTimestamps[wordIdx].startMs;
    }
    // Fallback: nếu hết word timestamp → estimate proportionally
    const totalWords = cumulativeWords[cumulativeWords.length - 1];
    if (totalWords === 0) return 0;
    return Math.round((wordIdx / totalWords) * audioDurationMs);
  });
}

/**
 * Suy ra motion recipe name của 1 shot. Chỉ shot assetType="motion" mới có
 * recipe. Nguồn ưu tiên: field motionRecipe (nếu data có) → keyword (storyboard
 * prompt quy ước motion keyword = tên recipe, vd "Quote") → "Quote" default
 * (recipe duy nhất hiện render). Recipe khác trả về tên nhưng render chưa
 * implement → fallback placeholder ở GalleryChapter.
 */
function deriveMotionRecipe(b: Shot): string | undefined {
  if (b.assetType !== "motion") return undefined;
  const explicit = (b as { motionRecipe?: string }).motionRecipe;
  if (explicit && explicit.trim()) return explicit.trim();
  const kw = b.keyword.trim();
  if (!kw) return "Quote";
  if (/quote/i.test(kw)) return "Quote";
  return kw.split(/\s+/)[0];
}

/**
 * Tính endMs cho beat thứ i = startMs của beat i+1 hoặc audio end.
 */
function computeBeatRanges(
  beats: Shot[],
  sentenceStartMs: number[],
  audioDurationMs: number,
): Array<{ startMs: number; endMs: number }> {
  const ranges = beats.map((b) => {
    const idx = Math.max(0, Math.min(sentenceStartMs.length - 1, b.sentenceIdx));
    return { startMs: sentenceStartMs[idx] ?? 0, endMs: 0 };
  });
  for (let i = 0; i < ranges.length; i++) {
    ranges[i].endMs =
      i + 1 < ranges.length ? ranges[i + 1].startMs : audioDurationMs;
    // Override nếu beat có durationMs explicit
    const beatDur = beats[i].durationMs;
    if (beatDur !== null) {
      ranges[i].endMs = ranges[i].startMs + beatDur;
    }
  }
  return ranges;
}

/**
 * Resolve 1 chapter thành props pass vào composition.
 */
export async function buildChapterProps(
  plan: Storyboard,
  chapterIdx: number,
  audioUrlBase: string,
): Promise<GalleryChapterProps> {
  const chapter = plan.chapters[chapterIdx];
  if (!chapter) {
    throw new Error(`Chapter ${chapterIdx} không tồn tại`);
  }

  const audioDurationMs = chapter.audioDurationMs ?? 0;

  // Phase 4e.x: prepare audio (mix với BGM nếu plan có, hoặc music chapter BGM segment)
  const audioPrep = await prepareChapterRenderAudio({
    planId: plan.id,
    chapterIdx,
    chapterKind: chapter.kind,
    voiceFilename: chapter.audioFilename,
    // Music interlude: interludeSeconds override (cho phép <1 phút) → đổi sang
    // "phút" phân số để bgm-mix trim đúng. Narration không dùng field này.
    chapterMinutes: chapter.interludeSeconds
      ? chapter.interludeSeconds / 60
      : chapter.minutes,
    bgmFilename: plan.bgmFilename,
    // Ambience bed: tự nhặt input/sfx/ambience.* nếu user đã bỏ file vào.
    ambiencePath: resolveAmbienceBed(),
  });
  // GỐC RỄ "mất câu cuối": file .aac (ADTS) KHÔNG lưu duration trong header,
  // ffprobe/Remotion ước lượng SAI (thường THIẾU ~1-1.5s) → Remotion render
  // audio đúng độ dài-sai → cắt câu kết. Fix: chuyển sang .m4a (MP4 container,
  // duration chính xác trong moov) + apad im lặng cuối. Remotion đọc đúng độ
  // dài → render trọn lời. Composition lấy đúng độ dài .m4a này.
  const AUDIO_TAIL_SILENCE_MS = 3000;
  let renderAudioFilename = audioPrep.filename;
  let realAudioMs = audioPrep.filename
    ? await ffprobeDurationMs(path.join(PATHS.TMP_DIR, audioPrep.filename))
    : 0;
  if (audioPrep.filename && realAudioMs > 0) {
    const paddedName = audioPrep.filename.replace(/\.aac$/, ".render.m4a");
    const srcPath = path.join(PATHS.TMP_DIR, audioPrep.filename);
    const padPath = path.join(PATHS.TMP_DIR, paddedName);
    const padSec = (AUDIO_TAIL_SILENCE_MS / 1000).toFixed(2);
    try {
      await execFileAsync("ffmpeg", [
        "-y", "-i", srcPath,
        "-af", `apad=pad_dur=${padSec}`,
        "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", padPath,
      ]);
      const m4aMs = await ffprobeDurationMs(padPath);
      if (m4aMs > 0) {
        renderAudioFilename = paddedName;
        // m4a duration CHÍNH XÁC (= nội dung thật + 3s silence). Dùng làm
        // composition luôn → Remotion render trọn file, lời kết (trước 3s
        // silence) chắc chắn được render.
        realAudioMs = m4aMs;
      }
    } catch {
      /* pad fail → dùng file gốc .aac */
    }
  }
  const audioUrl = renderAudioFilename
    ? `${audioUrlBase}/tmp/${encodeURIComponent(renderAudioFilename)}`
    : null;

  let resolvedBeats: ResolvedBeat[] = [];
  if (chapter.kind === "narration" && chapter.transcript && audioDurationMs > 0) {
    const sentenceStartMs = computeSentenceStartMs(
      chapter.transcript,
      chapter.wordTimestamps,
      audioDurationMs,
    );
    const ranges = computeBeatRanges(
      chapter.shots,
      sentenceStartMs,
      audioDurationMs,
    );

    // Sentences cho motion "Quote" — text hiển thị = câu narration tại
    // sentenceIdx (split y hệt computeSentenceStartMs để index khớp).
    const sentences = chapter.transcript
      .split(/[.!?]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    // Phase 4d.x: prefetch assets về local /tmp/ trước render để Remotion
    // fetch từ localhost (tránh Wikimedia/Met CDN timeout/UA-block).
    const assetsToFetch: Array<{ assetId: string; remoteUrl: string }> = [];
    for (const b of chapter.shots) {
      if (!b.assetIdRef) continue;
      const asset = getAsset(b.assetIdRef);
      if (asset?.fullUrl) {
        assetsToFetch.push({
          assetId: asset.id,
          remoteUrl: asset.fullUrl,
        });
      }
    }
    const localPathMap = await prefetchAssetsBatch(assetsToFetch);

    resolvedBeats = chapter.shots.map((b, i) => {
      const range = ranges[i];
      const startFrame = Math.floor((range.startMs / 1000) * FPS);
      const endFrame = Math.floor((range.endMs / 1000) * FPS);
      const asset = b.assetIdRef ? getAsset(b.assetIdRef) : null;
      // Use local cached URL nếu prefetch thành công, fallback remote
      const localPath = asset ? localPathMap.get(asset.id) : undefined;
      const assetUrl = localPath
        ? `${audioUrlBase}${localPath}`
        : (asset?.fullUrl ?? null);
      const motionRecipe = deriveMotionRecipe(b);
      const quoteText =
        motionRecipe === "Quote"
          ? (sentences[
              Math.max(0, Math.min(sentences.length - 1, b.sentenceIdx))
            ] ?? "")
          : undefined;
      return {
        startFrame,
        durationFrames: Math.max(1, endFrame - startFrame),
        keyword: b.keyword,
        kenBurns: b.kenBurns,
        assetUrl,
        assetIsVideo: asset?.kind === "video",
        assetTitle: asset?.title ?? "",
        assetAuthor: asset?.author ?? "",
        assetYear: asset?.year ?? "",
        assetProvider: asset?.provider ?? "",
        assetLicense: asset?.license ?? "",
        motionRecipe,
        quoteText,
      };
    });
  }

  // Total frames = audio duration (narration) hoặc interludeSeconds/minutes (music)
  const musicMs = chapter.interludeSeconds
    ? chapter.interludeSeconds * 1000
    : chapter.minutes * 60_000;
  // Narration: realAudioMs = độ dài .m4a CHÍNH XÁC (nội dung + 3s silence). File
  // .m4a có duration đúng → Remotion render trọn nội dung. +0.5s buffer nhỏ.
  const TAIL_PAD_MS = 500;
  const narrationMs = Math.max(realAudioMs, audioDurationMs);
  const totalMs = narrationMs > 0 ? narrationMs + TAIL_PAD_MS : musicMs;
  const totalFrames = Math.max(FPS, Math.ceil((totalMs / 1000) * FPS));

  return {
    title: chapter.title,
    kind: chapter.kind,
    audioUrl,
    musicCue: chapter.musicCue ?? "",
    resolvedBeats,
    totalFrames,
  };
}

export type RenderProgress = (percent: number, message: string) => void;

export async function renderChapter(input: {
  planId: string;
  chapterIdx: number;
  /** Base URL cho audio file — vd "http://127.0.0.1:3001". Audio Remotion fetch từ studio server. */
  audioUrlBase: string;
  onProgress?: RenderProgress;
}): Promise<{ outputPath: string; durationMs: number }> {
  const plan = await getStoryboard(input.planId);
  if (!plan) {
    const err = new Error(`Plan không tồn tại: ${input.planId}`) as Error & {
      code: string;
    };
    err.code = "NOT_FOUND";
    throw err;
  }

  // Helper emit progress qua cả callback (cho CLI) + SSE bus (cho UI)
  const emit = (percent: number, message: string) => {
    input.onProgress?.(percent, message);
    bus.emit("gallery-render:progress", {
      planId: input.planId,
      chapterIdx: input.chapterIdx,
      percent,
      message,
    });
  };

  emit(3, "Tải ảnh từ Wikimedia/Met…");
  const props = await buildChapterProps(
    plan,
    input.chapterIdx,
    input.audioUrlBase,
  );

  // GATE: chỉ render khi MỌI shot có asset. Shot motion (Quote…) tự vẽ nên
  // không cần asset; shot stock/archive/ai mà assetUrl=null = thiếu asset →
  // chặn render (tránh xuất video dính "[Missing asset]"). User resolve đủ
  // hoặc attach tay rồi render lại.
  const missingBeats = props.resolvedBeats.filter(
    (b) => !b.motionRecipe && !b.assetUrl,
  );
  if (missingBeats.length > 0) {
    const sample = missingBeats
      .slice(0, 6)
      .map((b) => `"${b.keyword}"`)
      .join(", ");
    const err = new Error(
      `Chương còn ${missingBeats.length}/${props.resolvedBeats.length} shot THIẾU ASSET: ${sample}${
        missingBeats.length > 6 ? "…" : ""
      }. Resolve đủ assets (hoặc attach tay) trước khi render.`,
    ) as Error & { code: string };
    err.code = "VALIDATION";
    throw err;
  }

  if (!fs.existsSync(PATHS.TMP_DIR)) {
    fs.mkdirSync(PATHS.TMP_DIR, { recursive: true });
  }
  const outFilename = galleryChapterVideoFilename(plan.id, input.chapterIdx);
  const outPath = path.join(PATHS.TMP_DIR, outFilename);

  emit(10, "Bundle Remotion…");
  const serveUrl = await bundle({
    entryPoint: ENTRY_POINT,
    publicDir: path.resolve("public"),
  });

  // Timeout rộng: b-roll video (Pexels/Pixabay 5-26MB) load/seek qua <Video>
  // có thể chậm > 28s mặc định → delayRender timeout làm render fail/treo.
  const RENDER_TIMEOUT_MS = 120_000;

  emit(25, "Select composition…");
  const composition = await selectComposition({
    serveUrl,
    id: COMPOSITION_ID,
    inputProps: props,
    timeoutInMilliseconds: RENDER_TIMEOUT_MS,
  });

  emit(30, "Rendering frames…");
  await renderMedia({
    serveUrl,
    composition,
    codec: "h264",
    outputLocation: outPath,
    inputProps: props,
    audioCodec: "aac",
    videoBitrate: "8000K",
    audioBitrate: "192K",
    timeoutInMilliseconds: RENDER_TIMEOUT_MS,
    onProgress: ({ progress }) => {
      const pct = 30 + progress * 65;
      const frame = Math.floor(progress * composition.durationInFrames);
      emit(pct, `frame ${frame}/${composition.durationInFrames}`);
    },
  });
  emit(98, "Đang ghi DB…");

  const durationMs = Math.round((composition.durationInFrames / FPS) * 1000);

  // Phase 4d.2: persist video filename + duration vào DB
  await updateChapterVideo(plan.id, input.chapterIdx, {
    videoFilename: outFilename,
    videoDurationMs: durationMs,
  });

  emit(100, "Hoàn tất");
  return {
    outputPath: outPath,
    durationMs,
  };
}
