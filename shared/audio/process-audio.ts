import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
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

type FfmpegResult = { stdout: string; stderr: string };

const ffmpegRun = (
  args: string[],
  signal?: AbortSignal,
): Promise<FfmpegResult> =>
  new Promise<FfmpegResult>((resolve, reject) => {
    if (signal?.aborted) {
      const err = new Error("Cancelled by user");
      err.name = "AbortError";
      reject(err);
      return;
    }
    const child = spawn("ffmpeg", args, {
      stdio: ["ignore", "pipe", "pipe"],
      signal,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d: Buffer) => {
      stdout += d.toString("utf-8");
    });
    child.stderr.on("data", (d: Buffer) => {
      stderr += d.toString("utf-8");
    });
    child.on("error", (e) => {
      // AbortError from spawn signal — surface so caller can detect cancellation.
      reject(e);
    });
    child.on("close", (code, exitSignal) => {
      if (signal?.aborted) {
        const err = new Error("Cancelled by user");
        err.name = "AbortError";
        reject(err);
        return;
      }
      if (code !== 0) {
        reject(
          new Error(
            `ffmpeg exit ${code}${exitSignal ? ` (signal ${exitSignal})` : ""}:\n${stderr}`,
          ),
        );
        return;
      }
      resolve({ stdout, stderr });
    });
  });

type LoudnormStats = {
  measured_I: string;
  measured_TP: string;
  measured_LRA: string;
  measured_thresh: string;
  offset: string;
};

const measureLoudnorm = async (
  input: string,
  signal?: AbortSignal,
): Promise<LoudnormStats> => {
  const { stderr } = await ffmpegRun(
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
    signal,
  );
  const match = stderr.match(/\{[\s\S]*?\}/);
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

export async function processAudio(
  audioPath: string,
  { signal }: { signal?: AbortSignal } = {},
): Promise<ProcessedAudio> {
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
  const stats = await measureLoudnorm(audioPath, signal);

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
  await ffmpegRun(
    [
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
    ],
    signal,
  );
  await ffmpegRun(
    [
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
    ],
    signal,
  );

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
