import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { bundle, type BundleOptions } from "@remotion/bundler";
import {
  makeCancelSignal,
  renderMedia,
  renderStill,
  selectComposition,
} from "@remotion/renderer";
import { processAudio } from "../../../shared/audio/process-audio";
import { transcribeAudio } from "../../../shared/transcribe/transcribe";
import { spellFix } from "../../scripts/spell-fix";
import { planEpisode } from "../../scripts/plan-episode";
import { INTRO_SECONDS, hookSeconds, HEAD_MUSIC_EXTRA_SECONDS } from "../../src/timing";
import { generateEditorial } from "../../scripts/gen-editorial";
import { stageFootageClips } from "../../scripts/footage-clips";
import {
  buildFootageBg,
  compositeChunk,
  muxAudio,
  concatVideos,
  makeYoutubeThumb,
  padLeadingSilence,
  renderResumeKey,
  openChunkWorkDir,
  chunkDone,
} from "../../scripts/footage-composite";
import { speechLeadFrames } from "../../src/episode";
import { FORMATS, type VideoFormat } from "../../src/layout";
import { mixBgmIntoVoice } from "@shared/audio/bgm-mix";
import { getModel } from "../../../shared/transcribe/whisper-config";
import { bus } from "../../../shared/studio-core/events";
import { PATHS, type EpisodeStatus, getEpisode } from "./episode-store";
import { autoCleanupIfLow } from "./cleanup";

const COMPOSITION_ID = "Podcast";
const PUBLIC_DIR = path.resolve("public");
const THEME_PATH = path.resolve("podcast/src/theme.ts");
const MAX_PARALLEL = Number(process.env.STUDIO_RENDER_PARALLEL ?? 2);

export type RenderPhase =
  | "queued"
  | "process-audio"
  | "transcribe"
  | "spell-fix"
  | "plan-episode"
  | "bundle"
  | "render"
  | "thumbnail"
  | "lock"
  | "done"
  | "error"
  | "cancelled";

export type JobType = "transcribe" | "plan" | "render";

export type RenderJob = {
  id: string;
  episodeName: string;
  jobType: JobType;
  preview: boolean;
  status: RenderPhase;
  percent: number;
  message: string;
  startedAt: number;
  finishedAt: number | null;
  outputPath: string | null;
  error: string | null;
  /** Cho jobType="render": force re-run transcribe phases dù corrected.json đã có. */
  regenTranscribe: boolean;
  /** Cho jobType="render": force re-run plan phase dù plan.json đã có. */
  regenPlan: boolean;
  /** Khung render: "vertical" 9:16 (FB) hoặc "landscape" 16:9 (YouTube, output <slug>.yt.*). */
  format: VideoFormat;
};

type JobInternal = RenderJob & {
  abort: AbortController;
};

const jobs = new Map<string, JobInternal>();

/**
 * Khoá theo TẬP cho phần chuẩn bị dùng chung giữa 2 khung (normalize audio,
 * transcript, plan, editorial — cùng file tmp/<slug>.*). Render dọc + ngang của
 * 1 tập chạy song song được: job sau chờ job trước xong phần chuẩn bị rồi mới
 * đọc/ghi các file đó; phần render (output tách <slug>.* / <slug>.yt.*) song song.
 */
const episodePrepLocks = new Map<string, Promise<void>>();
async function acquireEpisodePrepLock(name: string): Promise<() => void> {
  const prev = episodePrepLocks.get(name) ?? Promise.resolve();
  let release!: () => void;
  const mine = new Promise<void>((r) => (release = r));
  const tail = prev.then(() => mine);
  episodePrepLocks.set(name, tail);
  await prev;
  let done = false;
  return () => {
    if (done) return;
    done = true;
    release();
    if (episodePrepLocks.get(name) === tail) episodePrepLocks.delete(name);
  };
}
const queue: string[] = [];
let activeCount = 0;

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
const ensureDir = (p: string) => {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
};

const emitProgress = (job: JobInternal) => {
  bus.emit("render:progress", {
    jobId: job.id,
    episodeName: job.episodeName,
    status: job.status,
    percent: job.percent,
    message: job.message,
    elapsedMs: Date.now() - job.startedAt,
    finishedAt: job.finishedAt,
    outputPath: job.outputPath,
    error: job.error,
    preview: job.preview,
    format: job.format,
  });
};

const setPhase = (
  job: JobInternal,
  status: RenderPhase,
  percent: number,
  message = "",
) => {
  if (job.status === "cancelled" || job.status === "error") return;
  job.status = status;
  job.percent = percent;
  job.message = message;
  emitProgress(job);
};

export function listJobs(): RenderJob[] {
  return Array.from(jobs.values()).map((j) => {
    const { abort: _abort, ...pub } = j;
    return pub;
  });
}

export function getJob(jobId: string): RenderJob | null {
  const j = jobs.get(jobId);
  if (!j) return null;
  const { abort: _abort, ...pub } = j;
  return pub;
}

/**
 * Force-reset queue + activeCount. Hủy tất cả job đang chạy/queue, reset
 * counter về 0. Dùng khi worker thread bị wedged (ffmpeg/whisper hung) khiến
 * queue không drain được. Subprocess đang chạy vẫn tiếp tục → resource leak
 * cho tới khi subprocess tự kết thúc, nhưng queue mới sẽ chạy ngay.
 */
export function resetQueue(): { cancelledJobs: number } {
  let cancelled = 0;
  for (const job of jobs.values()) {
    if (
      job.status === "done" ||
      job.status === "error" ||
      job.status === "cancelled"
    ) {
      continue;
    }
    try {
      job.abort.abort();
    } catch {
      /* ignore */
    }
    job.status = "cancelled";
    job.finishedAt = Date.now();
    job.error = "Force reset by user";
    emitProgress(job);
    cancelled++;
  }
  queue.length = 0;
  activeCount = 0;
  return { cancelledJobs: cancelled };
}

export function cancelJob(jobId: string): boolean {
  const job = jobs.get(jobId);
  if (!job) return false;
  if (job.status === "done" || job.status === "error" || job.status === "cancelled") {
    return false;
  }
  job.abort.abort();
  if (job.status === "queued") {
    // Pop khỏi queue ngay
    const i = queue.indexOf(jobId);
    if (i >= 0) queue.splice(i, 1);
    job.status = "cancelled";
    job.finishedAt = Date.now();
    emitProgress(job);
  } else {
    // Đang chạy — phát tín hiệu "đang huỷ" để UI feedback ngay, không đợi
    // subprocess (whisper/ffmpeg/remotion) thực sự kết thúc. Status thật sẽ
    // chuyển sang "cancelled" trong runJob catch block khi subprocess die.
    job.message = "Đang huỷ…";
    emitProgress(job);
  }
  return true;
}

async function enqueueJob(
  episodeName: string,
  jobType: JobType,
  opts: {
    preview?: boolean;
    regenTranscribe?: boolean;
    regenPlan?: boolean;
    format?: VideoFormat;
  },
): Promise<RenderJob> {
  const ep = await getEpisode(episodeName);
  if (!ep) throw new Error(`Episode không tồn tại: ${episodeName}`);
  if (!ep.audioPath) throw new Error(`Episode "${episodeName}" chưa có audio`);
  // Bản 16:9 chỉ hỗ trợ nền footage (scene sticker vẽ cố định cho khung dọc).
  if (jobType === "render" && opts.format === "landscape" && ep.config.footageLandscape.length === 0) {
    throw new Error(
      `Bản YouTube 16:9 cần footage ngang. Chạy: npx tsx podcast/scripts/footage-plan.ts ${episodeName} --landscape --apply`,
    );
  }

  // Pre-check phụ thuộc: plan job cần corrected transcript đã có
  if (jobType === "plan") {
    const correctedJson = path.join(
      PATHS.TMP_DIR,
      `${episodeName}.corrected.json`,
    );
    const rawJson = path.join(PATHS.TMP_DIR, `${episodeName}.json`);
    if (!fs.existsSync(correctedJson) && !fs.existsSync(rawJson)) {
      throw new Error(
        `Cần transcript trước khi tạo plan. Chạy "Tạo transcript" tab Transcript.`,
      );
    }
  }

  const id = `job_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`;
  const job: JobInternal = {
    id,
    episodeName,
    jobType,
    preview: opts.preview ?? false,
    status: "queued",
    percent: 0,
    message: "",
    startedAt: Date.now(),
    finishedAt: null,
    outputPath: null,
    error: null,
    regenTranscribe: opts.regenTranscribe ?? false,
    regenPlan: opts.regenPlan ?? false,
    format: opts.format ?? "vertical",
    abort: new AbortController(),
  };
  jobs.set(id, job);
  queue.push(id);
  emitProgress(job);
  processQueue();
  const { abort: _abort, ...pub } = job;
  return pub;
}

export async function startRender(
  episodeName: string,
  opts: {
    preview: boolean;
    regenTranscribe?: boolean;
    regenPlan?: boolean;
    format?: VideoFormat;
  },
): Promise<RenderJob> {
  return enqueueJob(episodeName, "render", opts);
}

export async function startTranscribe(
  episodeName: string,
): Promise<RenderJob> {
  return enqueueJob(episodeName, "transcribe", {});
}

export async function startPlan(episodeName: string): Promise<RenderJob> {
  return enqueueJob(episodeName, "plan", {});
}

function processQueue() {
  if (activeCount === 0 && queue.length > 0) {
    try {
      const r = autoCleanupIfLow();
      if (r) console.log(`[render-runner] ổ trống < 25GB → tự dọn mục an toàn, giải phóng ${(r.freedBytes / 1024 ** 3).toFixed(1)}GB`);
    } catch (e) {
      console.warn("[render-runner] tự dọn ổ lỗi (bỏ qua):", e);
    }
  }
  while (activeCount < MAX_PARALLEL && queue.length > 0) {
    const jobId = queue.shift()!;
    const job = jobs.get(jobId);
    if (!job || job.status !== "queued") continue;
    activeCount++;
    runJob(job).finally(() => {
      // Guard <0: resetQueue() có thể đã set activeCount=0 trong khi job này
      // chưa hoàn tất subprocess, khi nó thực sự settle thì .finally()
      // sẽ kéo activeCount âm → kẹt mãi.
      activeCount = Math.max(0, activeCount - 1);
      processQueue();
    });
  }
}

async function runJob(job: JobInternal): Promise<void> {
  const baseName = job.episodeName;
  const ep = await getEpisode(baseName);
  if (!ep || !ep.audioPath) {
    job.status = "error";
    job.error = "Episode không tồn tại hoặc thiếu audio";
    job.finishedAt = Date.now();
    emitProgress(job);
    return;
  }

  ensureDir(PATHS.OUTPUT_DIR);
  ensureDir(PATHS.TMP_DIR);

  const signal = job.abort.signal;
  const checkAbort = () => {
    if (signal.aborted) {
      const err = new Error("Cancelled by user");
      err.name = "AbortError";
      throw err;
    }
  };

  // Chờ job khác CÙNG tập (vd khung kia) chuẩn bị xong rồi mới xét cache
  // transcript/plan → không chạy trùng / ghi đè file tmp đang dùng.
  const releasePrep = await acquireEpisodePrepLock(baseName);

  const transcriptJson = path.join(PATHS.TMP_DIR, `${baseName}.json`);
  const correctedJson = path.join(PATHS.TMP_DIR, `${baseName}.corrected.json`);
  const planJsonPath = path.join(PATHS.TMP_DIR, `${baseName}.plan.json`);

  // Logic skip phases — chỉ áp dụng cho jobType="render". transcribe/plan
  // jobs luôn re-run phần của mình (user explicit gọi qua nút riêng).
  const hasCorrected =
    fs.existsSync(correctedJson) || fs.existsSync(transcriptJson);
  const hasPlan = fs.existsSync(planJsonPath);
  const runTranscribe =
    job.jobType === "transcribe" ||
    (job.jobType === "render" && (job.regenTranscribe || !hasCorrected));
  const runPlan =
    job.jobType === "plan" ||
    (job.jobType === "render" && (job.regenPlan || !hasPlan));
  // ProcessAudio cần cho whisperWav (transcribe) hoặc renderWav (render).
  // Plan-only job → không cần.
  const needAudioPipeline = job.jobType !== "plan";

  try {
    let whisperWav: string | undefined;
    let renderWav: string | undefined;

    // 1. Process audio
    if (needAudioPipeline) {
      setPhase(job, "process-audio", 5, "Normalizing loudness…");
      const audioOut = await processAudio(ep.audioPath, { signal });
      whisperWav = audioOut.whisperWav;
      renderWav = audioOut.renderWav;
      checkAbort();
    }

    // 2. Transcribe
    if (runTranscribe && whisperWav) {
      setPhase(job, "transcribe", 15, "Whisper transcribing…");
      await transcribeAudio(whisperWav, transcriptJson, { signal });
      checkAbort();

      // 3. Spell fix
      setPhase(job, "spell-fix", 30, "Gom câu transcript (sửa chính tả bằng Claude)…");
      await spellFix(transcriptJson, correctedJson, { signal });
      checkAbort();
    } else if (job.jobType === "render") {
      // Skip transcribe phases — UI sẽ thấy phases này done (currentOrder vượt qua)
      setPhase(job, "spell-fix", 32, "Reuse existing transcript (cached)");
    }

    // Job transcribe-only → kết thúc ở đây
    if (job.jobType === "transcribe") {
      job.finishedAt = Date.now();
      setPhase(job, "done", 100, "Tạo transcript xong");
      return;
    }

    // 4. Plan episode
    if (runPlan) {
      setPhase(job, "plan-episode", 40, "Cắt cảnh + gán sceneType…");
      await planEpisode(correctedJson, ep.config, planJsonPath);
      checkAbort();
    } else if (job.jobType === "render") {
      setPhase(job, "plan-episode", 42, "Reuse existing plan (cached)");
    }

    // Job plan-only → kết thúc ở đây
    if (job.jobType === "plan") {
      job.finishedAt = Date.now();
      setPhase(job, "done", 100, "Tạo plan cảnh xong");
      return;
    }

    // jobType === "render": tiếp tục phases 5-9
    if (!renderWav) {
      throw new Error("Internal: renderWav undefined cho render job");
    }

    // Bản YouTube 16:9 → mọi file output/tmp/public mang tiền tố "<slug>.yt"
    // để không đè bản dọc (và render 2 bản song song không xoá file của nhau).
    const landscape = job.format === "landscape";
    const outBase = landscape ? `${baseName}.yt` : baseName;

    // 5. Copy public assets
    const audioPublicName = `${outBase}.audio.wav`;
    const transcriptPublicName = `${outBase}.transcript.json`;
    const planPublicName = `${outBase}.plan.json`;
    const transcriptSource = fs.existsSync(correctedJson)
      ? correctedJson
      : transcriptJson;
    ensureDir(PUBLIC_DIR);
    fs.copyFileSync(renderWav, path.join(PUBLIC_DIR, audioPublicName));
    fs.copyFileSync(
      transcriptSource,
      path.join(PUBLIC_DIR, transcriptPublicName),
    );
    fs.copyFileSync(planJsonPath, path.join(PUBLIC_DIR, planPublicName));
    const cleanupList = [audioPublicName, transcriptPublicName, planPublicName];

    // 5.5 Editorial overlay (LLM) — lớp biên tập gốc. Regen cùng lúc với plan
    // (runPlan) để bám transcript mới; graceful nếu thiếu key/lỗi LLM.
    // editorialLocked = chương do kịch bản sinh sẵn → chỉ đọc cache, không regen.
    let editorialPublicName: string | null = null;
    if (ep.config.showEditorial) {
      const editorialJsonPath = planJsonPath.replace(
        /\.plan\.json$/,
        ".editorial.json",
      );
      await generateEditorial(transcriptSource, ep.config, editorialJsonPath, {
        force: runPlan && !ep.config.editorialLocked,
      });
      editorialPublicName = `${outBase}.editorial.json`;
      fs.copyFileSync(
        editorialJsonPath,
        path.join(PUBLIC_DIR, editorialPublicName),
      );
      cleanupList.push(editorialPublicName);
      checkAbort();
    }
    // Hết phần dùng chung tmp/<slug>.* → nhả khoá cho khung kia của tập.
    releasePrep();

    let bgmPublicName: string | null = null;
    if (ep.config.bgm && ep.audioPath) {
      const bgmAbsPath = path.resolve(
        path.dirname(ep.audioPath),
        ep.config.bgm,
      );
      if (fs.existsSync(bgmAbsPath)) {
        bgmPublicName = `${outBase}.bgm${path.extname(ep.config.bgm)}`;
        fs.copyFileSync(bgmAbsPath, path.join(PUBLIC_DIR, bgmPublicName));
        cleanupList.push(bgmPublicName);
      }
    }

    // Cover image — copy từ input/ sang public/, giữ nguyên filename để
    // `staticFile(episode.coverImage)` trong IntroCard resolve được.
    let episodeConfig = ep.config;
    // Cover bản 16:9 dùng trong intro: cover ngang nếu có (cover-fit), không thì
    // cover dọc (contain + nền mờ). Copy dưới tên riêng "<slug>.yt.cover.*".
    let landscapeCoverAbs: string | null = null;
    if (landscape) {
      // Ưu tiên cover ngang; file đã bị xoá tay → lùi về cover dọc.
      const abs = [ep.config.coverImageLandscape, ep.config.coverImage]
        .filter((f): f is string => !!f)
        .map((f) => path.join(PATHS.INPUT_DIR, f))
        .find((f) => fs.existsSync(f));
      if (abs) {
        const pub = `${outBase}.cover${path.extname(abs)}`;
        fs.copyFileSync(abs, path.join(PUBLIC_DIR, pub));
        cleanupList.push(pub);
        const isLandscapeCover =
          !!ep.config.coverImageLandscape &&
          abs === path.join(PATHS.INPUT_DIR, ep.config.coverImageLandscape);
        if (isLandscapeCover) landscapeCoverAbs = abs;
        episodeConfig = {
          ...ep.config,
          coverImage: pub,
          coverFit: isLandscapeCover ? "cover" : "contain",
          coverPosition: "center",
        };
      } else {
        episodeConfig = { ...ep.config, coverImage: null };
      }
    } else if (ep.config.coverImage) {
      const coverAbsPath = path.join(PATHS.INPUT_DIR, ep.config.coverImage);
      if (fs.existsSync(coverAbsPath)) {
        const coverPublicName = ep.config.coverImage;
        fs.copyFileSync(coverAbsPath, path.join(PUBLIC_DIR, coverPublicName));
        cleanupList.push(coverPublicName);
      } else {
        // File đã bị xóa thủ công — fallback: bỏ cover, render intro auto-gen
        episodeConfig = { ...ep.config, coverImage: null };
      }
    }

    // Footage nền (nếu tập bật) — copy input/footage → public + probe.
    const { clips: footageClips, publicNames: footagePublicNames } =
      stageFootageClips(
        ep.config,
        path.join(PATHS.INPUT_DIR, "footage"),
        PUBLIC_DIR,
        outBase,
        landscape,
      );
    cleanupList.push(...footagePublicNames);
    if (landscape && footageClips.length === 0) {
      throw new Error(
        "Bản 16:9: không tìm thấy file footage ngang nào (footageLandscape) trong input/footage — chạy lại footage-plan --landscape --apply",
      );
    }

    const inputProps = {
      audioSrc: audioPublicName,
      transcriptSrc: transcriptPublicName,
      planSrc: planPublicName,
      bgmSrc: bgmPublicName,
      editorialSrc: editorialPublicName,
      footageClips,
      format: job.format,
      episode: episodeConfig,
    };

    // Bridge AbortSignal → Remotion's CancelSignal so renderMedia/renderStill
    // actually tear down Chrome workers when user clicks Hủy.
    const remotionCancel = makeCancelSignal();
    const onAbortForRemotion = () => remotionCancel.cancel();
    if (signal.aborted) remotionCancel.cancel();
    else signal.addEventListener("abort", onAbortForRemotion, { once: true });

    // Thư mục bundle Remotion ($TMPDIR/remotion-webpack-bundle-*, chép cả public/ → 0.3–1GB/lần)
    // — xoá khi job kết thúc, trước đây bỏ lại → tích 5GB+ sau vài chục lần render.
    let bundleDir: string | null = null;
    try {
      // 6. Bundle
      setPhase(job, "bundle", 45, "Bundling Remotion…");
      const bundleOptions: BundleOptions = {
        entryPoint: path.resolve("podcast/src/index.ts"),
        publicDir: PUBLIC_DIR,
      };
      const serveUrl = await bundle(bundleOptions);
      bundleDir = serveUrl;
      checkAbort();

      const composition = await selectComposition({
        serveUrl,
        id: COMPOSITION_ID,
        inputProps,
      });
      checkAbort();

      // 7. Render
      const outputPath = path.join(
        PATHS.OUTPUT_DIR,
        job.preview ? `${outBase}.preview.mp4` : `${outBase}.mp4`,
      );

      const renderOpts = {
        serveUrl,
        composition,
        codec: "h264" as const,
        outputLocation: outputPath,
        inputProps,
        audioCodec: "aac" as const,
        cancelSignal: remotionCancel.cancelSignal,
        // Video dài (15-20') dễ crash/timeout browser Remotion do memory —
        // concurrency=2 (không phải 3) để tránh page treo khi RAM trống thấp;
        // timeout 300s cho scene nặng (Ken Burns + visualizer) khi máy bận.
        concurrency: Number(process.env.RENDER_CONCURRENCY ?? 1),
        timeoutInMilliseconds: Number(process.env.RENDER_TIMEOUT_MS ?? 300000),
      };

      if (job.preview) {
        const lastFrame = Math.min(
          composition.durationInFrames - 1,
          composition.fps * 10 - 1,
        );
        await renderMedia({
          ...renderOpts,
          frameRange: [0, lastFrame],
          videoBitrate: "4000K",
          audioBitrate: "128K",
          onProgress: ({ progress }) => {
            if (signal.aborted) throw new Error("AbortError");
            const renderPct = 45 + progress * 45; // 45 → 90
            setPhase(
              job,
              "render",
              renderPct,
              `frame ${Math.floor(progress * lastFrame)}/${lastFrame}`,
            );
          },
        });
      } else if (footageClips.length > 0) {
        // 2-PASS footage — giống make.ts: ffmpeg dựng nền footage + Remotion
        // render đồ hoạ trong suốt ProRes alpha THEO ĐOẠN + ghép ngay + xoá
        // ProRes → tránh crash browser trên render dài, đĩa gọn. Progress hiện
        // trên UI theo từng đoạn. Xem footage-composite.ts.
        const footageBg = path.join(PATHS.TMP_DIR, `${outBase}.footagebg.mp4`);
        const workDir = path.join(PATHS.TMP_DIR, `${outBase}.fchunks`);
        const overlayInputProps = {
          ...inputProps,
          overlayMode: true,
          footageClips: [],
        };
        const overlayComposition = await selectComposition({
          serveUrl,
          id: COMPOSITION_ID,
          inputProps: overlayInputProps,
        });
        const total = overlayComposition.durationInFrames;
        const durationSec = total / overlayComposition.fps;
        const footageAbs = (landscape ? episodeConfig.footageLandscape : episodeConfig.footage)
          .map((f) => path.join(PATHS.INPUT_DIR, "footage", f))
          .filter((f) => fs.existsSync(f));
        const OCHUNK = Number(process.env.RENDER_OVERLAY_CHUNK ?? 1500);
        const nOchunks = Math.ceil(total / OCHUNK);

        // Render TIẾP: đầu vào không đổi so với lần dở trước (server restart /
        // huỷ) → giữ nền footage + đoạn đã ghép, chỉ làm phần còn thiếu.
        const resumeKey = renderResumeKey({
          props: overlayInputProps as unknown as Record<string, unknown>,
          files: [
            transcriptSource,
            planJsonPath,
            planJsonPath.replace(/\.plan\.json$/, ".editorial.json"),
            renderWav,
            // Cover GỐC trong input/ (bản copy public/ đổi mtime mỗi lần render).
            ...[ep.config.coverImage, ep.config.coverImageLandscape]
              .filter((f): f is string => !!f)
              .map((f) => path.join(PATHS.INPUT_DIR, f)),
            ...footageAbs,
          ],
          extra: { total, OCHUNK, format: job.format, footageAbs },
        });
        const { resumed } = openChunkWorkDir(workDir, footageBg, resumeKey);
        const doneBefore = Array.from({ length: nOchunks }, (_, k) =>
          chunkDone(path.join(workDir, `v-${String(k).padStart(3, "0")}.mp4`)),
        ).filter(Boolean).length;

        if (resumed && fs.existsSync(footageBg)) {
          setPhase(job, "render", 46, `Render tiếp: giữ nền footage + ${doneBefore}/${nOchunks} đoạn đã xong`);
        } else {
          setPhase(job, "render", 46, "Dựng nền footage (ffmpeg)…");
          await buildFootageBg(footageAbs, durationSec, footageBg, {
            themeColor: episodeConfig.accentColor,
            size: FORMATS[job.format],
          });
        }
        checkAbort();

        const videoChunks: string[] = [];
        for (let start = 0, idx = 0; start < total; start += OCHUNK, idx++) {
          const end = Math.min(total - 1, start + OCHUNK - 1);
          const prChunk = path.join(workDir, `pr-${String(idx).padStart(3, "0")}.mov`);
          const vChunk = path.join(workDir, `v-${String(idx).padStart(3, "0")}.mp4`);
          if (chunkDone(vChunk)) {
            videoChunks.push(vChunk);
            setPhase(job, "render", 46 + ((idx + 1) / nOchunks) * 44, `footage đoạn ${idx + 1}/${nOchunks} (đã có)`);
            continue;
          }
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
            cancelSignal: remotionCancel.cancelSignal,
            concurrency: Number(process.env.RENDER_OVERLAY_CONCURRENCY ?? 2),
            timeoutInMilliseconds: Number(process.env.RENDER_TIMEOUT_MS ?? 300000),
          });
          await compositeChunk(
            footageBg,
            start / overlayComposition.fps,
            (end - start + 1) / overlayComposition.fps,
            prChunk,
            vChunk,
          );
          fs.rmSync(prChunk, { force: true });
          videoChunks.push(vChunk);
          setPhase(
            job,
            "render",
            46 + ((idx + 1) / nOchunks) * 44, // 46 → 90
            `footage đoạn ${idx + 1}/${nOchunks}`,
          );
          checkAbort();
        }
        const silentVideo = path.join(workDir, "silent.mp4");
        await concatVideos(videoChunks, silentVideo);
        // Có BGM → mix nhạc nền (ducking) vào voice (footage path không dùng BGMTrack).
        // Giọng bắt đầu SAU intro + hook (đoạn đầu chỉ có nhạc) — khớp Video.tsx.
        const leadSec = speechLeadFrames(episodeConfig, overlayComposition.fps) / overlayComposition.fps;
        const leadVoice = await padLeadingSilence(
          renderWav,
          leadSec,
          path.join(PATHS.TMP_DIR, `${outBase}.voice-lead.wav`),
        );
        let audioForMux = leadVoice;
        if (episodeConfig.bgm && ep.audioPath) {
          const bgmAbs = path.resolve(path.dirname(ep.audioPath), episodeConfig.bgm);
          if (fs.existsSync(bgmAbs)) {
            setPhase(job, "render", 90, "Mix nhạc nền (ducking)…");
            const headMusicSec =
              episodeConfig.bgmMode === "headtail"
                ? (episodeConfig.showIntro ? INTRO_SECONDS : 0) +
                  hookSeconds(episodeConfig.hook) +
                  HEAD_MUSIC_EXTRA_SECONDS
                : undefined;
            const mixed = await mixBgmIntoVoice({
              voicePath: leadVoice,
              leadSec,
              bgmPath: bgmAbs,
              episodeName: outBase,
              bgmVolumeDb: episodeConfig.bgmVolumeDb,
              tailSec: episodeConfig.outroTailSec,
              headSec: headMusicSec,
            });
            audioForMux = mixed.outputPath;
          }
        }
        await muxAudio(silentVideo, audioForMux, outputPath);
        if (leadVoice !== renderWav) fs.rmSync(leadVoice, { force: true });
        fs.rmSync(workDir, { recursive: true, force: true });
        fs.rmSync(footageBg, { force: true });
      } else {
        const totalFrames = composition.durationInFrames;
        await renderMedia({
          ...renderOpts,
          videoBitrate: "8000K",
          audioBitrate: "192K",
          onProgress: ({ progress }) => {
            if (signal.aborted) throw new Error("AbortError");
            const renderPct = 45 + progress * 45;
            setPhase(
              job,
              "render",
              renderPct,
              `frame ${Math.floor(progress * totalFrames)}/${totalFrames}`,
            );
          },
        });
      }
      checkAbort();

      // 8. Thumbnail (skip preview)
      if (!job.preview) {
        setPhase(job, "thumbnail", 92, "Render thumbnail…");
        const thumbPath = path.join(
          PATHS.OUTPUT_DIR,
          `${outBase}.thumb.jpg`,
        );
        if (landscapeCoverAbs) {
          // YouTube: thumbnail = chính cover 16:9 (1280×720, <2MB).
          await makeYoutubeThumb(landscapeCoverAbs, thumbPath);
        } else {
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
            cancelSignal: remotionCancel.cancelSignal,
          });
        }

        // 9. Lock file
        setPhase(job, "lock", 96, "Ghi lock file…");
        const lockPath = path.join(PATHS.OUTPUT_DIR, `${outBase}.lock.json`);
        const planObj = JSON.parse(fs.readFileSync(planJsonPath, "utf-8"));
        const lock = {
          renderedAt: new Date().toISOString(),
          themeHash: `sha256:${sha256File(THEME_PATH)}`,
          episodeHash: `sha256:${sha256Object(ep.config)}`,
          planHash: `sha256:${sha256Object(planObj)}`,
          audioHash: `sha256:${sha256File(ep.audioPath)}`,
          whisperModel: getModel(),
        };
        fs.writeFileSync(lockPath, JSON.stringify(lock, null, 2));
      }

      job.outputPath = outputPath;
      job.finishedAt = Date.now();
      setPhase(job, "done", 100, "Hoàn tất");
    } finally {
      signal.removeEventListener("abort", onAbortForRemotion);
      if (bundleDir && path.basename(bundleDir).startsWith("remotion-webpack-bundle-")) {
        fs.rmSync(bundleDir, { recursive: true, force: true });
      }
      // Cleanup public assets
      for (const n of cleanupList) {
        const p = path.join(PUBLIC_DIR, n);
        if (fs.existsSync(p)) {
          try {
            fs.unlinkSync(p);
          } catch {
            /* ignore */
          }
        }
      }
    }
  } catch (e) {
    if (
      signal.aborted ||
      (e as Error).name === "AbortError" ||
      ((e as Error).message ?? "").includes("Render was cancelled")
    ) {
      job.status = "cancelled";
      job.finishedAt = Date.now();
      emitProgress(job);
      return;
    }
    job.status = "error";
    job.error = (e as Error).message;
    job.finishedAt = Date.now();
    emitProgress(job);
  } finally {
    releasePrep();
    // Cleanup after 1 hour to avoid memory bloat
    setTimeout(
      () => {
        if (
          jobs.get(job.id)?.status &&
          ["done", "error", "cancelled"].includes(jobs.get(job.id)!.status)
        ) {
          jobs.delete(job.id);
        }
      },
      60 * 60 * 1000,
    );
  }
}

/** Forward `episodes:changed` after render done (status badge update). */
bus.on("render:progress", (ev: unknown) => {
  const e = ev as { status?: RenderPhase };
  if (e.status === "done" || e.status === "cancelled" || e.status === "error") {
    bus.emit("episodes:changed", { type: "episodes:changed", reason: "change", path: "render" });
  }
});

const _status: EpisodeStatus = "draft"; // silence unused import — TS Bundler resolution
void _status;
