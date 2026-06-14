import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { transcribe, type TranscriptionJson } from "@remotion/install-whisper-cpp";
import { WHISPER_CPP_VERSION, WHISPER_PATH, getModel } from "./whisper-config";

export type Transcript = TranscriptionJson<true>;

const ensureDir = (p: string) => {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
};

const toWav16kMono = (input: string): string => {
  const outDir = path.resolve("tmp");
  ensureDir(outDir);
  const base = path.basename(input).replace(/\.[^.]+$/, "");
  const outPath = path.join(outDir, `${base}.16k.wav`);
  if (
    fs.existsSync(outPath) &&
    fs.statSync(outPath).mtimeMs >= fs.statSync(input).mtimeMs
  ) {
    return outPath;
  }
  execFileSync(
    "ffmpeg",
    ["-y", "-i", input, "-ac", "1", "-ar", "16000", outPath],
    { stdio: ["ignore", "ignore", "ignore"] },
  );
  return outPath;
};

const isCacheValid = (jsonPath: string, audioPath: string): boolean => {
  if (!fs.existsSync(jsonPath)) return false;
  return fs.statSync(jsonPath).mtimeMs >= fs.statSync(audioPath).mtimeMs;
};

export async function transcribeAudio(
  audioPath: string,
  jsonPath: string,
): Promise<Transcript> {
  if (!fs.existsSync(audioPath)) {
    throw new Error(`File audio không tồn tại: ${audioPath}`);
  }
  if (isCacheValid(jsonPath, audioPath)) {
    console.log(`[transcribe] [cache] skip ${jsonPath}`);
    return JSON.parse(fs.readFileSync(jsonPath, "utf-8")) as Transcript;
  }

  if (!fs.existsSync(WHISPER_PATH)) {
    throw new Error(
      `whisper.cpp chưa cài. Chạy: npm run setup`,
    );
  }

  const wavPath = toWav16kMono(audioPath);
  const model = getModel();
  console.log(`[transcribe] ${audioPath} → ${jsonPath} (model: ${model})`);

  const result = await transcribe({
    inputPath: wavPath,
    whisperPath: WHISPER_PATH,
    whisperCppVersion: WHISPER_CPP_VERSION,
    model,
    tokenLevelTimestamps: true,
    language: "vi",
    printOutput: false,
  });

  ensureDir(path.dirname(jsonPath));
  fs.writeFileSync(jsonPath, JSON.stringify(result, null, 2));
  console.log(
    `  ✓ ${result.transcription.length} segments`,
  );
  return result;
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
    console.error("Usage: tsx scripts/transcribe.ts <audio-file>");
    process.exit(1);
  }
  const name = path.basename(audio).replace(/\.[^.]+$/, "");
  const out = path.resolve("tmp", `${name}.json`);
  transcribeAudio(path.resolve(audio), out).catch((e: unknown) => {
    console.error("[transcribe] FAIL:", e);
    process.exit(1);
  });
}
