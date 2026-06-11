import fs from "node:fs";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const TARGET_LUFS = -16;
const TARGET_TP = -1.5;
const TARGET_LRA = 11;

export type ProcessedAudio = {
  whisperWav: string;
  renderWav: string;
};

const ensureDir = (p: string) => {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
};

const isCacheValid = (out: string, input: string): boolean => {
  if (!fs.existsSync(out)) return false;
  return fs.statSync(out).mtimeMs >= fs.statSync(input).mtimeMs;
};

const ffmpegSync = (args: string[]): string => {
  const result = execFileSync("ffmpeg", args, {
    stdio: ["ignore", "pipe", "pipe"],
  });
  return result.toString();
};

type LoudnormStats = {
  measured_I: string;
  measured_TP: string;
  measured_LRA: string;
  measured_thresh: string;
  offset: string;
};

const measureLoudnorm = (input: string): LoudnormStats => {
  const result = spawnSync(
    "ffmpeg",
    [
      "-hide_banner",
      "-nostats",
      "-i",
      input,
      "-af",
      `loudnorm=I=${TARGET_LUFS}:TP=${TARGET_TP}:LRA=${TARGET_LRA}:print_format=json`,
      "-f",
      "null",
      "-",
    ],
    { encoding: "utf-8" },
  );
  if (result.status !== 0) {
    throw new Error(`ffmpeg loudnorm pass 1 fail (exit ${result.status}):\n${result.stderr}`);
  }
  const match = result.stderr.match(/\{[\s\S]*?\}/);
  if (!match) {
    throw new Error("[process-audio] Không parse được output loudnorm pass 1");
  }
  const parsed = JSON.parse(match[0]) as {
    input_i: string;
    input_tp: string;
    input_lra: string;
    input_thresh: string;
    target_offset: string;
  };
  return {
    measured_I: parsed.input_i,
    measured_TP: parsed.input_tp,
    measured_LRA: parsed.input_lra,
    measured_thresh: parsed.input_thresh,
    offset: parsed.target_offset,
  };
};

export async function processAudio(audioPath: string): Promise<ProcessedAudio> {
  if (!fs.existsSync(audioPath)) {
    throw new Error(`File audio không tồn tại: ${audioPath}`);
  }
  const tmpDir = path.resolve("tmp");
  ensureDir(tmpDir);
  const base = path.basename(audioPath).replace(/\.[^.]+$/, "");
  const whisperWav = path.join(tmpDir, `${base}.normalized.16k.wav`);
  const renderWav = path.join(tmpDir, `${base}.normalized.48k.wav`);

  if (isCacheValid(whisperWav, audioPath) && isCacheValid(renderWav, audioPath)) {
    console.log(`[process-audio] [cache] skip ${base}`);
    return { whisperWav, renderWav };
  }

  console.log(`[process-audio] pass 1 (đo loudness): ${audioPath}`);
  const stats = measureLoudnorm(audioPath);

  console.log(
    `  measured: I=${stats.measured_I} LUFS, TP=${stats.measured_TP} dBTP, LRA=${stats.measured_LRA}`,
  );

  const loudnormFilter = [
    `loudnorm=I=${TARGET_LUFS}`,
    `TP=${TARGET_TP}`,
    `LRA=${TARGET_LRA}`,
    `measured_I=${stats.measured_I}`,
    `measured_TP=${stats.measured_TP}`,
    `measured_LRA=${stats.measured_LRA}`,
    `measured_thresh=${stats.measured_thresh}`,
    `offset=${stats.offset}`,
    `linear=true`,
    `print_format=summary`,
  ].join(":");

  console.log(`[process-audio] pass 2 (apply) → 48kHz stereo + 16kHz mono`);
  ffmpegSync([
    "-y",
    "-hide_banner",
    "-loglevel",
    "warning",
    "-i",
    audioPath,
    "-af",
    loudnormFilter,
    "-ac",
    "2",
    "-ar",
    "48000",
    renderWav,
  ]);
  ffmpegSync([
    "-y",
    "-hide_banner",
    "-loglevel",
    "warning",
    "-i",
    renderWav,
    "-ac",
    "1",
    "-ar",
    "16000",
    whisperWav,
  ]);

  console.log(`  ✓ ${renderWav}`);
  console.log(`  ✓ ${whisperWav}`);
  return { whisperWav, renderWav };
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
    console.error("Usage: tsx scripts/process-audio.ts <audio-file>");
    process.exit(1);
  }
  processAudio(path.resolve(audio)).catch((e: unknown) => {
    console.error("[process-audio] FAIL:", e);
    process.exit(1);
  });
}
