import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { bundle, type BundleOptions } from "@remotion/bundler";
import {
  renderMedia,
  renderStill,
  selectComposition,
} from "@remotion/renderer";
import { processAudio } from "../../scripts/process-audio";
import { transcribeAudio } from "../../scripts/transcribe";
import { spellFix } from "../../scripts/spell-fix";
import { planEpisode } from "../../scripts/plan-episode";
import { getModel } from "../../scripts/whisper-config";
import { bus } from "./events";
import { PATHS, type EpisodeStatus, getEpisode } from "./episode-store";

const COMPOSITION_ID = "Podcast";
const PUBLIC_DIR = path.resolve("public");
const THEME_PATH = path.resolve("src/theme.ts");
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

export type RenderJob = {
  id: string;
  episodeName: string;
  preview: boolean;
  status: RenderPhase;
  percent: number;
  message: string;
  startedAt: number;
  finishedAt: number | null;
  outputPath: string | null;
  error: string | null;
};

type JobInternal = RenderJob & {
  abort: AbortController;
};

const jobs = new Map<string, JobInternal>();
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
  }
  return true;
}

export async function startRender(
  episodeName: string,
  opts: { preview: boolean },
): Promise<RenderJob> {
  const ep = await getEpisode(episodeName);
  if (!ep) throw new Error(`Episode không tồn tại: ${episodeName}`);
  if (!ep.audioPath) throw new Error(`Episode "${episodeName}" chưa có audio`);

  const id = `job_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`;
  const job: JobInternal = {
    id,
    episodeName,
    preview: opts.preview,
    status: "queued",
    percent: 0,
    message: "",
    startedAt: Date.now(),
    finishedAt: null,
    outputPath: null,
    error: null,
    abort: new AbortController(),
  };
  jobs.set(id, job);
  queue.push(id);
  emitProgress(job);
  processQueue();
  const { abort: _abort, ...pub } = job;
  return pub;
}

function processQueue() {
  while (activeCount < MAX_PARALLEL && queue.length > 0) {
    const jobId = queue.shift()!;
    const job = jobs.get(jobId);
    if (!job || job.status !== "queued") continue;
    activeCount++;
    runJob(job).finally(() => {
      activeCount--;
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

  const transcriptJson = path.join(PATHS.TMP_DIR, `${baseName}.json`);
  const correctedJson = path.join(PATHS.TMP_DIR, `${baseName}.corrected.json`);
  const planJsonPath = path.join(PATHS.TMP_DIR, `${baseName}.plan.json`);

  try {
    // 1. Process audio
    setPhase(job, "process-audio", 5, "Normalizing loudness…");
    const { whisperWav, renderWav } = await processAudio(ep.audioPath);
    checkAbort();

    // 2. Transcribe
    setPhase(job, "transcribe", 15, "Whisper transcribing…");
    await transcribeAudio(whisperWav, transcriptJson);
    checkAbort();

    // 3. Spell fix
    setPhase(job, "spell-fix", 30, "Sửa chính tả qua OpenAI…");
    await spellFix(transcriptJson, correctedJson);
    checkAbort();

    // 4. Plan episode
    setPhase(job, "plan-episode", 40, "Cắt cảnh + gán sceneType…");
    await planEpisode(correctedJson, ep.config, planJsonPath);
    checkAbort();

    // 5. Copy public assets
    const audioPublicName = `${baseName}.audio.wav`;
    const transcriptPublicName = `${baseName}.transcript.json`;
    const planPublicName = `${baseName}.plan.json`;
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

    let bgmPublicName: string | null = null;
    if (ep.config.bgm && ep.audioPath) {
      const bgmAbsPath = path.resolve(
        path.dirname(ep.audioPath),
        ep.config.bgm,
      );
      if (fs.existsSync(bgmAbsPath)) {
        bgmPublicName = `${baseName}.bgm${path.extname(ep.config.bgm)}`;
        fs.copyFileSync(bgmAbsPath, path.join(PUBLIC_DIR, bgmPublicName));
        cleanupList.push(bgmPublicName);
      }
    }

    const inputProps = {
      audioSrc: audioPublicName,
      transcriptSrc: transcriptPublicName,
      planSrc: planPublicName,
      bgmSrc: bgmPublicName,
      episode: ep.config,
    };

    try {
      // 6. Bundle
      setPhase(job, "bundle", 45, "Bundling Remotion…");
      const bundleOptions: BundleOptions = {
        entryPoint: path.resolve("src/index.ts"),
        publicDir: PUBLIC_DIR,
      };
      const serveUrl = await bundle(bundleOptions);
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
        job.preview ? `${baseName}.preview.mp4` : `${baseName}.mp4`,
      );

      const renderOpts = {
        serveUrl,
        composition,
        codec: "h264" as const,
        outputLocation: outputPath,
        inputProps,
        audioCodec: "aac" as const,
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
          `${baseName}.thumb.jpg`,
        );
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

        // 9. Lock file
        setPhase(job, "lock", 96, "Ghi lock file…");
        const lockPath = path.join(PATHS.OUTPUT_DIR, `${baseName}.lock.json`);
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
    if (signal.aborted || (e as Error).name === "AbortError") {
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
