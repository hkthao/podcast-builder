import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildScenePlan, type ScenePlan } from "../src/scenes";
import { EpisodeConfigSchema, buildEpisodeTemplate, type EpisodeConfig } from "../src/episode";
import type { Transcript } from "../../shared/transcribe/transcribe";

const ensureDir = (p: string) => {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
};

const loadEpisode = (audioPath: string): EpisodeConfig => {
  const base = path.basename(audioPath).replace(/\.[^.]+$/, "");
  const jsonPath = path.join(path.dirname(audioPath), `${base}.json`);
  if (!fs.existsSync(jsonPath)) {
    return EpisodeConfigSchema.parse(buildEpisodeTemplate(base));
  }
  const raw = JSON.parse(fs.readFileSync(jsonPath, "utf-8"));
  return EpisodeConfigSchema.parse(raw);
};

/**
 * Sinh `tmp/<name>.plan.json` từ transcript.
 *
 * Cache-aware: nếu plan đã tồn tại và không có `--force` → giữ nguyên
 * (cho phép user sửa tay sceneType/mood trước khi render).
 */
export async function planEpisode(
  transcriptPath: string,
  episode: EpisodeConfig,
  planPath: string,
  { force = false }: { force?: boolean } = {},
): Promise<ScenePlan> {
  if (!fs.existsSync(transcriptPath)) {
    throw new Error(`Transcript không tồn tại: ${transcriptPath}`);
  }
  if (fs.existsSync(planPath) && !force) {
    const cached = JSON.parse(fs.readFileSync(planPath, "utf-8")) as ScenePlan;
    console.log(
      `[plan-episode] [cache] skip ${planPath} (${cached.scenes.length} scenes)`,
    );
    return cached;
  }

  const transcript = JSON.parse(fs.readFileSync(transcriptPath, "utf-8")) as Transcript;
  console.log(`[plan-episode] đọc ${transcript.transcription.length} segments...`);
  const plan = buildScenePlan(transcript, episode.moodOverride, episode.sceneOverrides);

  ensureDir(path.dirname(planPath));
  fs.writeFileSync(planPath, JSON.stringify(plan, null, 2));

  const totalSec = plan.scenes.reduce(
    (sum, s) => sum + (s.endMs - s.startMs) / 1000,
    0,
  );
  console.log(
    `  ✓ ${plan.scenes.length} scenes, ${(totalSec / 60).toFixed(1)} phút, ` +
      `${(totalSec / Math.max(1, plan.scenes.length)).toFixed(1)}s/scene trung bình`,
  );
  plan.scenes.forEach((s) => {
    const dur = ((s.endMs - s.startMs) / 1000).toFixed(1);
    console.log(
      `   #${String(s.index).padStart(2, "0")} [${dur}s ${s.mood}/${s.sceneType}] ${s.text.slice(0, 60)}${s.text.length > 60 ? "…" : ""}`,
    );
  });
  return plan;
}

const isMain = (() => {
  try {
    return process.argv[1] === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
})();

if (isMain) {
  const audio = process.argv[2];
  if (!audio) {
    console.error("Usage: tsx scripts/plan-episode.ts <audio-file> [--force]");
    process.exit(1);
  }
  const force = process.argv.includes("--force");
  const audioPath = path.resolve(audio);
  const name = path.basename(audioPath).replace(/\.[^.]+$/, "");
  const transcriptPath = path.resolve("tmp", `${name}.json`);
  const planPath = path.resolve("tmp", `${name}.plan.json`);
  const episode = loadEpisode(audioPath);

  planEpisode(transcriptPath, episode, planPath, { force }).catch((e: unknown) => {
    console.error("[plan-episode] FAIL:", e);
    process.exit(1);
  });
}
