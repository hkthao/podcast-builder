/**
 * Render thumbnail .jpg cho từng scene trong plan.
 *
 * Prerequisite (đều có sau khi user click "Render preview" lần đầu):
 *   - tmp/<name>.plan.json
 *   - tmp/<name>.normalized.48k.wav
 *   - tmp/<name>.corrected.json (hoặc .json fallback)
 *
 * Output:
 *   - tmp/<name>.scene-XX.jpg (scale 0.3 → ~324×576, ~30-80KB/file)
 *
 * Cost: ~10s bundle + ~1-2s/scene. 30 scene = 30-60s tổng.
 */
import path from "node:path";
import fs from "node:fs";
import { bundle } from "@remotion/bundler";
import { renderStill, selectComposition } from "@remotion/renderer";
import { PATHS, getEpisode } from "./episode-store";

const COMPOSITION_ID = "Podcast";
const PUBLIC_DIR = path.resolve("public");

export type SceneThumbProgress = {
  total: number;
  done: number;
  current: string;
};

export async function listSceneThumbnails(
  episodeName: string,
): Promise<string[]> {
  try {
    const entries = await fs.promises.readdir(PATHS.TMP_DIR);
    return entries
      .filter((f) => {
        const re = new RegExp(
          `^${escapeRegex(episodeName)}\\.scene-(\\d{2})\\.jpg$`,
        );
        return re.test(f);
      })
      .sort()
      .map((f) => `/tmp/${f}`);
  } catch {
    return [];
  }
}

export async function genSceneThumbnails(
  episodeName: string,
  onProgress?: (p: SceneThumbProgress) => void,
): Promise<{ urls: string[] }> {
  const ep = await getEpisode(episodeName);
  if (!ep) {
    const err = new Error(`Episode không tồn tại: ${episodeName}`) as Error & {
      code: string;
    };
    err.code = "VALIDATION";
    throw err;
  }
  if (!ep.audioPath) {
    const err = new Error("Episode chưa có audio") as Error & { code: string };
    err.code = "VALIDATION";
    throw err;
  }

  const baseName = episodeName;
  const planJsonPath = path.join(PATHS.TMP_DIR, `${baseName}.plan.json`);
  const correctedJson = path.join(PATHS.TMP_DIR, `${baseName}.corrected.json`);
  const transcriptJson = path.join(PATHS.TMP_DIR, `${baseName}.json`);
  const renderWav = path.join(PATHS.TMP_DIR, `${baseName}.normalized.48k.wav`);

  for (const required of [planJsonPath, renderWav] as const) {
    if (!fs.existsSync(required)) {
      const err = new Error(
        `Thiếu artifact ${path.basename(required)}. Chạy "Render preview" trước để tạo plan + audio normalized.`,
      ) as Error & { code: string };
      err.code = "VALIDATION";
      throw err;
    }
  }
  const transcriptSource = fs.existsSync(correctedJson)
    ? correctedJson
    : fs.existsSync(transcriptJson)
      ? transcriptJson
      : null;
  if (!transcriptSource) {
    const err = new Error(
      "Thiếu transcript (raw + corrected). Chạy Render preview trước.",
    ) as Error & { code: string };
    err.code = "VALIDATION";
    throw err;
  }

  const planObj = JSON.parse(fs.readFileSync(planJsonPath, "utf-8")) as {
    scenes?: Array<{
      index: number;
      startMs: number;
      endMs: number;
      sceneType: string;
      mood: string;
      text: string;
    }>;
  };
  if (!Array.isArray(planObj.scenes) || planObj.scenes.length === 0) {
    const err = new Error("Plan có 0 scenes") as Error & { code: string };
    err.code = "VALIDATION";
    throw err;
  }
  const scenes = planObj.scenes;

  // Copy public files (giống render pipeline)
  const audioPublicName = `${baseName}.audio.wav`;
  const transcriptPublicName = `${baseName}.transcript.json`;
  const planPublicName = `${baseName}.plan.json`;
  fs.mkdirSync(PUBLIC_DIR, { recursive: true });
  fs.copyFileSync(renderWav, path.join(PUBLIC_DIR, audioPublicName));
  fs.copyFileSync(
    transcriptSource,
    path.join(PUBLIC_DIR, transcriptPublicName),
  );
  fs.copyFileSync(planJsonPath, path.join(PUBLIC_DIR, planPublicName));
  const cleanupList = [audioPublicName, transcriptPublicName, planPublicName];

  const inputProps = {
    audioSrc: audioPublicName,
    transcriptSrc: transcriptPublicName,
    planSrc: planPublicName,
    bgmSrc: null,
    episode: ep.config,
  };

  // Xoá thumbs cũ
  for (const f of await fs.promises.readdir(PATHS.TMP_DIR)) {
    if (
      new RegExp(`^${escapeRegex(baseName)}\\.scene-\\d{2}\\.jpg$`).test(f)
    ) {
      try {
        fs.unlinkSync(path.join(PATHS.TMP_DIR, f));
      } catch {
        /* ignore */
      }
    }
  }

  try {
    const serveUrl = await bundle({
      entryPoint: path.resolve("podcast/src/index.ts"),
      publicDir: PUBLIC_DIR,
    });
    const composition = await selectComposition({
      serveUrl,
      id: COMPOSITION_ID,
      inputProps,
    });

    const urls: string[] = [];
    for (let i = 0; i < scenes.length; i++) {
      const scene = scenes[i];
      // Render frame 1s sau khi scene bắt đầu (qua fade-in), bounded
      const sceneDurMs = scene.endMs - scene.startMs;
      const offsetMs = Math.min(1000, Math.max(200, sceneDurMs / 2));
      const targetFrame = Math.max(
        0,
        Math.min(
          composition.durationInFrames - 1,
          Math.round(((scene.startMs + offsetMs) / 1000) * composition.fps),
        ),
      );
      const fn = `${baseName}.scene-${String(i).padStart(2, "0")}.jpg`;
      const outPath = path.join(PATHS.TMP_DIR, fn);
      await renderStill({
        serveUrl,
        composition,
        output: outPath,
        inputProps,
        frame: targetFrame,
        imageFormat: "jpeg",
        jpegQuality: 75,
        scale: 0.3,
      });
      urls.push(`/tmp/${fn}`);
      onProgress?.({
        total: scenes.length,
        done: i + 1,
        current: scene.sceneType,
      });
    }
    return { urls };
  } finally {
    for (const f of cleanupList) {
      try {
        fs.unlinkSync(path.join(PUBLIC_DIR, f));
      } catch {
        /* ignore */
      }
    }
  }
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
