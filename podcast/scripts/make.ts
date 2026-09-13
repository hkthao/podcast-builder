import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { bundle, type BundleOptions } from "@remotion/bundler";
import {
  renderMedia,
  renderStill,
  selectComposition,
} from "@remotion/renderer";
import dotenv from "dotenv";
import {
  buildEpisodeTemplate,
  EpisodeConfigSchema,
  type EpisodeConfig,
} from "../src/episode";
import { processAudio } from "../../shared/audio/process-audio";
import { transcribeAudio } from "../../shared/transcribe/transcribe";
import { getModel } from "../../shared/transcribe/whisper-config";
import { spellFix } from "./spell-fix";
import { planEpisode } from "./plan-episode";
import { generateEditorial } from "./gen-editorial";
import { stageFootageClips } from "./footage-clips";
import { buildFootageBg, compositeChunk, muxAudio, concatVideos } from "./footage-composite";
import { mixBgmIntoVoice } from "../../shared/audio/bgm-mix";

dotenv.config();

const PUBLIC_DIR = path.resolve("public");
const OUTPUT_DIR = path.resolve("output");
const TMP_DIR = path.resolve("tmp");
const THEME_PATH = path.resolve("podcast/src/theme.ts");

const COMPOSITION_ID = "Podcast";

type Args = {
  audioPath: string;
  preview: boolean;
  noThumb: boolean;
  planOnly: boolean;
  /** Giới hạn render N giây đầu (preview-style). null = full / 10s khi --preview. */
  seconds: number | null;
  /** Bắt đầu render từ giây thứ N (cửa sổ giữa video). 0 = từ đầu. */
  fromSeconds: number;
};

const parseArgs = (argv: string[]): Args => {
  const positional = argv.filter((a) => !a.startsWith("--"));
  const flags = new Set(argv.filter((a) => a.startsWith("--")));
  const secondsArg = argv.find((a) => /^--seconds=\d+$/.test(a));
  const seconds = secondsArg ? Number(secondsArg.split("=")[1]) : null;
  const fromArg = argv.find((a) => /^--from=\d+$/.test(a));
  const fromSeconds = fromArg ? Number(fromArg.split("=")[1]) : 0;
  const audio = positional[0];
  if (!audio) {
    console.error(
      "Usage: tsx scripts/make.ts <audio> [--preview] [--seconds=N] [--from=N] [--no-thumb] [--plan-only]",
    );
    process.exit(1);
  }
  return {
    audioPath: path.resolve(audio),
    // --seconds / --from ngụ ý preview-style (frame range giới hạn, bỏ thumb/lock).
    preview: flags.has("--preview") || seconds !== null || fromSeconds > 0,
    noThumb: flags.has("--no-thumb"),
    planOnly: flags.has("--plan-only"),
    seconds,
    fromSeconds,
  };
};

const ensureDir = (p: string) => {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
};

const sha256File = (p: string): string => {
  const h = crypto.createHash("sha256");
  h.update(fs.readFileSync(p));
  return h.digest("hex");
};

const sha256Object = (obj: unknown): string => {
  const h = crypto.createHash("sha256");
  h.update(JSON.stringify(obj));
  return h.digest("hex");
};

const loadOrTemplate = (audioPath: string): EpisodeConfig => {
  const base = path.basename(audioPath).replace(/\.[^.]+$/, "");
  const jsonPath = path.join(path.dirname(audioPath), `${base}.json`);
  if (!fs.existsSync(jsonPath)) {
    const template = buildEpisodeTemplate(base);
    fs.writeFileSync(jsonPath, JSON.stringify(template, null, 2));
    console.error(
      `\n[make] Chưa có episode config — đã tạo template:\n  ${jsonPath}\nHãy điền 'title' + 'hook' rồi chạy lại.\n`,
    );
    process.exit(1);
  }
  const raw = JSON.parse(fs.readFileSync(jsonPath, "utf-8"));
  const parsed = EpisodeConfigSchema.safeParse(raw);
  if (!parsed.success) {
    console.error(`[make] Episode config lỗi schema (${jsonPath}):`);
    console.error(parsed.error.format());
    process.exit(1);
  }
  return parsed.data;
};

const copyToPublic = (src: string, name: string): string => {
  ensureDir(PUBLIC_DIR);
  const dst = path.join(PUBLIC_DIR, name);
  fs.copyFileSync(src, dst);
  return name;
};

const cleanupPublic = (names: string[]) => {
  for (const n of names) {
    const p = path.join(PUBLIC_DIR, n);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }
};

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const t0 = Date.now();

  if (!fs.existsSync(args.audioPath)) {
    throw new Error(`File audio không tồn tại: ${args.audioPath}`);
  }
  const baseName = path.basename(args.audioPath).replace(/\.[^.]+$/, "");
  ensureDir(OUTPUT_DIR);
  ensureDir(TMP_DIR);

  console.log(`\n[make] ===== ${baseName} ${args.preview ? "(PREVIEW)" : ""} =====`);

  // 1. Load episode config
  const episode = loadOrTemplate(args.audioPath);
  console.log(`[make] episode: "${episode.title}" #${episode.episodeNumber}`);

  // 2. Process audio (loudness normalize)
  const { whisperWav, renderWav } = await processAudio(args.audioPath);

  // 3. Transcribe (cache-aware)
  const transcriptJson = path.join(TMP_DIR, `${baseName}.json`);
  await transcribeAudio(whisperWav, transcriptJson);

  // 3.5. Spell fix — sửa chính tả tiếng Việt qua OpenAI, giữ timestamps + ý nghĩa.
  // Cache theo tồn tại file → user sửa tay xong xoá file để force.
  const correctedJson = path.join(TMP_DIR, `${baseName}.corrected.json`);
  await spellFix(transcriptJson, correctedJson);

  // 4. Plan episode — đọc transcript đã sửa.
  const planJsonPath = path.join(TMP_DIR, `${baseName}.plan.json`);
  await planEpisode(correctedJson, episode, planJsonPath);

  if (args.planOnly) {
    console.log(`[make] --plan-only: dừng ở đây. Sửa ${planJsonPath} rồi chạy lại.`);
    return;
  }

  // 5. Copy assets vào public/ cho Remotion staticFile().
  // Caption đọc bản đã sửa chính tả (fallback raw nếu spell-fix skip).
  const audioPublicName = `${baseName}.audio.wav`;
  const transcriptPublicName = `${baseName}.transcript.json`;
  const planPublicName = `${baseName}.plan.json`;
  const transcriptSource = fs.existsSync(correctedJson) ? correctedJson : transcriptJson;
  copyToPublic(renderWav, audioPublicName);
  copyToPublic(transcriptSource, transcriptPublicName);
  copyToPublic(planJsonPath, planPublicName);
  const cleanupList = [audioPublicName, transcriptPublicName, planPublicName];

  // 5.5 Editorial overlay (LLM) — lớp biên tập gốc trên màn hình.
  // Graceful: thiếu OPENAI_API_KEY / lỗi LLM → editorial rỗng, overlay tắt.
  let editorialPublicName: string | null = null;
  if (episode.showEditorial) {
    const editorialJsonPath = path.join(TMP_DIR, `${baseName}.editorial.json`);
    await generateEditorial(transcriptSource, episode, editorialJsonPath);
    editorialPublicName = `${baseName}.editorial.json`;
    copyToPublic(editorialJsonPath, editorialPublicName);
    cleanupList.push(editorialPublicName);
  }

  let bgmPublicName: string | null = null;
  if (episode.bgm) {
    const bgmAbsPath = path.resolve(path.dirname(args.audioPath), episode.bgm);
    if (!fs.existsSync(bgmAbsPath)) {
      throw new Error(`BGM không tồn tại: ${bgmAbsPath}`);
    }
    bgmPublicName = `${baseName}.bgm${path.extname(episode.bgm)}`;
    copyToPublic(bgmAbsPath, bgmPublicName);
    cleanupList.push(bgmPublicName);
  }

  // Cover image — IntroCard dùng staticFile(episode.coverImage) nên file phải
  // nằm trong public/ với ĐÚNG tên coverImage. Copy giữ nguyên tên.
  if (episode.coverImage) {
    const coverAbsPath = path.resolve(
      path.dirname(args.audioPath),
      episode.coverImage,
    );
    if (!fs.existsSync(coverAbsPath)) {
      throw new Error(`Cover không tồn tại: ${coverAbsPath}`);
    }
    copyToPublic(coverAbsPath, episode.coverImage);
    cleanupList.push(episode.coverImage);
  }

  // 5.7 Footage nền (nếu tập bật) — copy input/footage → public + probe.
  const { clips: footageClips, publicNames: footagePublicNames } =
    stageFootageClips(
      episode,
      path.resolve(path.dirname(args.audioPath), "footage"),
      PUBLIC_DIR,
      baseName,
    );
  cleanupList.push(...footagePublicNames);

  // 6. Build props (Hướng A thuần — không còn availableImages)
  const inputProps = {
    audioSrc: audioPublicName,
    transcriptSrc: transcriptPublicName,
    planSrc: planPublicName,
    bgmSrc: bgmPublicName,
    editorialSrc: editorialPublicName,
    footageClips,
    episode,
  };

  try {
    // 7. Bundle Remotion project (1 lần / run)
    console.log(`[make] bundling Remotion project...`);
    const bundleOptions: BundleOptions = {
      entryPoint: path.resolve("podcast/src/index.ts"),
      publicDir: PUBLIC_DIR,
    };
    const serveUrl = await bundle(bundleOptions);

    // 8. Select composition (resolve duration qua calculateMetadata)
    const composition = await selectComposition({
      serveUrl,
      id: COMPOSITION_ID,
      inputProps,
    });
    console.log(
      `[make] composition: ${composition.width}×${composition.height}, ` +
        `${composition.durationInFrames} frames (${(composition.durationInFrames / composition.fps).toFixed(2)}s)`,
    );

    // 9. Render
    const outputPath = path.join(
      OUTPUT_DIR,
      args.preview ? `${baseName}.preview.mp4` : `${baseName}.mp4`,
    );

    if (args.preview) {
      const previewSecs = args.seconds ?? 10;
      const startFrame = Math.min(
        composition.durationInFrames - 1,
        Math.max(0, Math.round(args.fromSeconds * composition.fps)),
      );
      const lastFrame = Math.min(
        composition.durationInFrames - 1,
        startFrame + composition.fps * previewSecs - 1,
      );
      console.log(
        `[make] preview frameRange [${startFrame}, ${lastFrame}] (${args.fromSeconds}s → +${previewSecs}s)`,
      );
      await renderMedia({
        serveUrl,
        composition,
        codec: "h264",
        outputLocation: outputPath,
        inputProps,
        frameRange: [startFrame, lastFrame],
        videoBitrate: "4000K",
        audioBitrate: "128K",
        audioCodec: "aac",
      });
    } else if (footageClips.length > 0) {
      // 2-PASS footage — Remotion giải mã footage video CRASH trên render dài.
      // Pass A: render ĐỒ HOẠ nền TRONG SUỐT (ProRes 4444 alpha, KHÔNG footage)
      //         → ổn định như bản sticker. Pass B: ffmpeg dựng nền footage +
      //         phủ lớp đồ hoạ + audio. Xem footage-composite.ts.
      // 2-PASS footage — Remotion giải mã footage video CRASH/quá chậm trên
      // render dài. Cách chạy: (A) render ĐỒ HOẠ nền TRONG SUỐT bằng ProRes 4444
      // alpha (nhanh ~0.08s/frame, KHÔNG footage) THEO ĐOẠN; mỗi đoạn ghép NGAY
      // với nền footage (ffmpeg) → chunk h264 rồi XOÁ ProRes → đỉnh đĩa nhỏ (VP8
      // quá chậm ~0.7s/frame; ProRes 1 file ~13GB vượt đĩa → phải ghép từng đoạn).
      // (B) nối chunk h264 + mux audio. Xem footage-composite.ts.
      const footageBg = path.join(TMP_DIR, `${baseName}.footagebg.mp4`);
      const workDir = path.join(TMP_DIR, `${baseName}.fchunks`);
      fs.rmSync(workDir, { recursive: true, force: true });
      ensureDir(workDir);
      // RE-SELECT composition với overlay props (renderMedia KHÔNG override props
      // qua inputProps → phải select lại để overlayMode=true + footageClips=[]).
      const overlayInputProps = { ...inputProps, overlayMode: true, footageClips: [] };
      const overlayComposition = await selectComposition({
        serveUrl,
        id: COMPOSITION_ID,
        inputProps: overlayInputProps,
      });
      const durationSec = overlayComposition.durationInFrames / overlayComposition.fps;
      const total = overlayComposition.durationInFrames;
      // B1: dựng nền footage full (ffmpeg — decode footage native, nhanh + ổn).
      console.log(`[make] footage 2-pass: dựng nền footage (ffmpeg)...`);
      const footageAbs = episode.footage
        .map((f) => path.resolve(path.dirname(args.audioPath), "footage", f))
        .filter((f) => fs.existsSync(f));
      buildFootageBg(footageAbs, durationSec, footageBg);
      // B2: render ProRes alpha theo đoạn + ghép ngay + xoá ProRes.
      const OCHUNK = Number(process.env.RENDER_OVERLAY_CHUNK ?? 1500);
      const nOchunks = Math.ceil(total / OCHUNK);
      console.log(
        `[make] footage 2-pass: overlay ProRes + ghép — ${nOchunks} đoạn × ${OCHUNK} frame...`,
      );
      const videoChunks: string[] = [];
      for (let start = 0, idx = 0; start < total; start += OCHUNK, idx++) {
        const end = Math.min(total - 1, start + OCHUNK - 1);
        const prChunk = path.join(workDir, `pr-${String(idx).padStart(3, "0")}.mov`);
        const vChunk = path.join(workDir, `v-${String(idx).padStart(3, "0")}.mp4`);
        const cT0 = Date.now();
        await renderMedia({
          serveUrl,
          composition: overlayComposition,
          codec: "prores",
          proResProfile: "4444",
          pixelFormat: "yuva444p10le",
          imageFormat: "png",
          outputLocation: prChunk,
          frameRange: [start, end],
          inputProps: overlayInputProps,
          concurrency: Number(process.env.RENDER_OVERLAY_CONCURRENCY ?? 3),
          timeoutInMilliseconds: Number(process.env.RENDER_TIMEOUT_MS ?? 120000),
        });
        compositeChunk(footageBg, start / overlayComposition.fps, (end - start + 1) / overlayComposition.fps, prChunk, vChunk);
        fs.rmSync(prChunk, { force: true }); // xoá ProRes nặng ngay
        videoChunks.push(vChunk);
        console.log(
          `[make]   đoạn ${idx + 1}/${nOchunks} [${start},${end}] ✓ (${((Date.now() - cT0) / 1000).toFixed(0)}s)`,
        );
      }
      // B3: nối chunk h264 + mux audio. Có BGM → mix nhạc nền (ducking) vào
      // voice trước (footage path KHÔNG dùng BGMTrack của Remotion).
      const silentVideo = path.join(workDir, `silent.mp4`);
      concatVideos(videoChunks, silentVideo);
      let audioForMux = renderWav;
      if (episode.bgm) {
        const bgmAbs = path.resolve(path.dirname(args.audioPath), episode.bgm);
        if (fs.existsSync(bgmAbs)) {
          console.log(`[make] mix nhạc nền (ducking): ${episode.bgm}`);
          const mixed = await mixBgmIntoVoice({
            voicePath: renderWav,
            bgmPath: bgmAbs,
            episodeName: baseName,
            bgmVolumeDb: episode.bgmVolumeDb,
          });
          audioForMux = mixed.outputPath;
        } else {
          console.warn(`[make] BGM không tồn tại, bỏ qua: ${bgmAbs}`);
        }
      }
      muxAudio(silentVideo, audioForMux, outputPath);
      fs.rmSync(workDir, { recursive: true, force: true });
      fs.rmSync(footageBg, { force: true });
    } else {
      await renderMedia({
        serveUrl,
        composition,
        codec: "h264",
        outputLocation: outputPath,
        inputProps,
        videoBitrate: "8000K",
        audioBitrate: "192K",
        audioCodec: "aac",
        concurrency: Number(process.env.RENDER_CONCURRENCY ?? 3),
        timeoutInMilliseconds: Number(process.env.RENDER_TIMEOUT_MS ?? 120000),
      });
    }
    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(`[make] ✓ ${outputPath} (${elapsed}s)`);

    // 10. Thumbnail (skip preview hoặc --no-thumb)
    if (!args.preview && !args.noThumb) {
      const thumbPath = path.join(OUTPUT_DIR, `${baseName}.thumb.jpg`);
      const thumbFrame = Math.min(
        composition.durationInFrames - 1,
        Math.round(composition.fps * 4.5),
      );
      await renderStill({
        serveUrl,
        composition,
        output: thumbPath,
        inputProps,
        frame: thumbFrame,
        imageFormat: "jpeg",
        jpegQuality: 85,
      });
      console.log(`[make] ✓ ${thumbPath}`);
    }

    // 11. Lock file
    if (!args.preview) {
      const lockPath = path.join(OUTPUT_DIR, `${baseName}.lock.json`);
      const plan = JSON.parse(fs.readFileSync(planJsonPath, "utf-8"));
      const lock = {
        renderedAt: new Date().toISOString(),
        themeHash: `sha256:${sha256File(THEME_PATH)}`,
        episodeHash: `sha256:${sha256Object(episode)}`,
        planHash: `sha256:${sha256Object(plan)}`,
        audioHash: `sha256:${sha256File(args.audioPath)}`,
        whisperModel: getModel(),
      };
      fs.writeFileSync(lockPath, JSON.stringify(lock, null, 2));
      console.log(`[make] ✓ ${lockPath}`);
    }
  } finally {
    // 12. Cleanup public/ — giữ brand/
    cleanupPublic(cleanupList);
  }
}

const isMain = (() => {
  try {
    return process.argv[1] === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
})();

if (isMain) {
  main().catch((e: unknown) => {
    console.error("[make] FAIL:", e);
    process.exit(1);
  });
}
