/**
 * Phase 4b — TTS + loudnorm + Whisper alignment cho 1 gallery plan chapter.
 *
 * Pipeline:
 *   chapter.transcript
 *     → OpenAI TTS (chunked nếu > 4000 chars) → AAC buffers
 *     → concat thành 1 raw AAC stream
 *     → ffmpeg loudnorm + re-encode AAC (LUFS -16, true peak -1.5dB)
 *     → ffprobe duration
 *     → Whisper.cpp ngược trên file đã loudnorm (tokenLevelTimestamps=true, vi)
 *     → flatten tokens → WordTimestamp[]
 *     → updateChapterAudio() DB
 *
 * Run-time ~30-60s/chapter (TTS ~20s + Whisper ~20s cho audio 5-10 phút).
 */
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { execFile, execFileSync } from "node:child_process";
import { promisify } from "node:util";
import OpenAI from "openai";
import {
  galleryChapterAudioFilename,
  getPlan,
  updateChapterAudio,
  type GalleryChapterPlan,
} from "./gallery-plan-store";
import { transcribeAudio } from "../transcribe/transcribe";
import { PATHS } from "./paths";
import type { WordTimestamp } from "../../gallery/src/word-timestamp";

const execFileAsync = promisify(execFile);

const VALID_VOICES = [
  "alloy",
  "echo",
  "fable",
  "onyx",
  "nova",
  "shimmer",
] as const;
type Voice = (typeof VALID_VOICES)[number];

const VALID_TTS_MODELS = ["tts-1", "tts-1-hd"] as const;
type TtsModel = (typeof VALID_TTS_MODELS)[number];

export const DEFAULT_VOICE: Voice = "nova";
export const DEFAULT_TTS_MODEL: TtsModel = "tts-1-hd";

const CHUNK_LIMIT = 4000;

const chunkText = (text: string): string[] => {
  // Split theo sentence boundary nếu > CHUNK_LIMIT
  if (text.length <= CHUNK_LIMIT) return [text];
  const sentences = text.split(/(?<=[.!?])\s+/);
  const chunks: string[] = [];
  let buf = "";
  for (const s of sentences) {
    if ((buf + " " + s).length > CHUNK_LIMIT && buf.length > 0) {
      chunks.push(buf.trim());
      buf = s;
    } else {
      buf = buf ? `${buf} ${s}` : s;
    }
  }
  if (buf) chunks.push(buf.trim());
  return chunks;
};

const ffprobeDurationMs = (filePath: string): number => {
  // ffprobe -v error -show_entries format=duration -of csv=p=0 input.aac
  const out = execFileSync(
    "ffprobe",
    [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "csv=p=0",
      filePath,
    ],
    { encoding: "utf-8" },
  );
  const sec = parseFloat(out.trim());
  if (!Number.isFinite(sec)) return 0;
  return Math.round(sec * 1000);
};

const loudnormAndReencode = async (
  rawAacPath: string,
  outPath: string,
): Promise<void> => {
  // Two-pass loudnorm would be ideal nhưng pass đơn LUFS -16 đã đủ tốt
  // cho voiceover. AAC bitrate 192k cho chất lượng cao.
  await execFileAsync("ffmpeg", [
    "-y",
    "-i",
    rawAacPath,
    "-af",
    "loudnorm=I=-16:TP=-1.5:LRA=11",
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    "-movflags",
    "+faststart",
    outPath,
  ]);
};

export type GenAudioInput = {
  planId: string;
  chapterIdx: number;
  voice?: Voice;
  ttsModel?: TtsModel;
  force?: boolean;
};

/**
 * Gen audio + word timestamps cho 1 chapter. Idempotent — nếu audio đã tồn
 * tại với cùng filename + transcript chưa đổi → skip (trừ khi force=true).
 *
 * Sau khi xong, chapter trong DB sẽ có audioFilename + audioDurationMs +
 * wordTimestamps[] đầy đủ.
 */
export async function generateChapterAudio(
  input: GenAudioInput,
): Promise<GalleryChapterPlan> {
  const plan = await getPlan(input.planId);
  if (!plan) {
    const err = new Error(`Plan không tồn tại: ${input.planId}`) as Error & {
      code: string;
    };
    err.code = "NOT_FOUND";
    throw err;
  }
  const chapter = plan.chapters[input.chapterIdx];
  if (!chapter) {
    const err = new Error("chapterIdx out of range") as Error & {
      code: string;
    };
    err.code = "VALIDATION";
    throw err;
  }
  if (chapter.kind === "music") {
    const err = new Error(
      "Music interlude không gen TTS — chỉ narration mới có voiceover.",
    ) as Error & { code: string };
    err.code = "VALIDATION";
    throw err;
  }
  const transcript = chapter.transcript.trim();
  if (!transcript) {
    const err = new Error(
      "Chapter chưa có transcript — gen transcript trước rồi mới gen audio.",
    ) as Error & { code: string };
    err.code = "VALIDATION";
    throw err;
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    const err = new Error(
      "Thiếu OPENAI_API_KEY — không gen được TTS.",
    ) as Error & { code: string };
    err.code = "VALIDATION";
    throw err;
  }

  const voice: Voice = input.voice ?? DEFAULT_VOICE;
  const ttsModel: TtsModel = input.ttsModel ?? DEFAULT_TTS_MODEL;
  const force = input.force ?? false;

  const outFilename = galleryChapterAudioFilename(plan.id, input.chapterIdx);
  const outPath = path.join(PATHS.TMP_DIR, outFilename);

  // Cache check — file tồn tại + chapter đã có wordTimestamps → skip (trừ
  // khi --force). Ko hash transcript vì user có thể edit nhẹ chính tả;
  // user re-gen thủ công khi cần.
  if (
    !force &&
    fs.existsSync(outPath) &&
    chapter.audioFilename === outFilename &&
    chapter.wordTimestamps.length > 0
  ) {
    return plan;
  }

  if (!fs.existsSync(PATHS.TMP_DIR)) {
    await fsp.mkdir(PATHS.TMP_DIR, { recursive: true });
  }

  // 1. TTS từng chunk
  const chunks = chunkText(transcript);
  const openai = new OpenAI({ apiKey });
  const audioBuffers: Buffer[] = [];
  for (let i = 0; i < chunks.length; i++) {
    const response = await openai.audio.speech.create({
      model: ttsModel,
      voice,
      input: chunks[i]!,
      response_format: "aac",
    });
    const arrayBuf = await response.arrayBuffer();
    audioBuffers.push(Buffer.from(arrayBuf));
  }

  // 2. Concat raw AAC (sequential AAC streams chainable ở file level)
  const rawPath = path.join(PATHS.TMP_DIR, `${outFilename}.raw`);
  await fsp.writeFile(rawPath, Buffer.concat(audioBuffers));

  // 3. Loudnorm + re-encode (-16 LUFS broadcast standard)
  await loudnormAndReencode(rawPath, outPath);
  await fsp.unlink(rawPath).catch(() => {
    /* ignore */
  });

  // 4. ffprobe duration
  const durationMs = ffprobeDurationMs(outPath);

  // 5. Whisper ngược để lấy word timestamps
  const transcriptJsonPath = path.join(
    PATHS.TMP_DIR,
    `${outFilename}.whisper.json`,
  );
  const result = await transcribeAudio(outPath, transcriptJsonPath);

  // 6. Flatten tokens → WordTimestamp[]
  //
  // Whisper.cpp output có 2 vấn đề:
  // 1. Special tokens (`[_BEG_]`, `[_TT_*]`, `[_NOT_]`) — filter ra.
  // 2. Subword tokenization: "Rembrandt" → ["Rem", "brand", "t"]. Merge
  //    subword (token KHÔNG bắt đầu bằng space) vào token trước (nếu có)
  //    → restore word boundaries cho align với sentenceIdx tốt hơn.
  const SPECIAL_TOKEN_RE = /^\[_[A-Z]+(_\d+)?_?\]$/;
  const wordTimestamps: WordTimestamp[] = [];
  for (const segment of result.transcription) {
    if (Array.isArray(segment.tokens)) {
      for (const token of segment.tokens) {
        const rawText = token.text ?? "";
        const trimmed = rawText.trim();
        if (!trimmed) continue;
        if (SPECIAL_TOKEN_RE.test(trimmed)) continue;

        const startMs = token.offsets?.from ?? 0;
        const endMs = token.offsets?.to ?? startMs;

        // Subword merge: nếu rawText không bắt đầu bằng space (whisper
        // dùng leading space để mark word boundary) → merge vào token trước
        const isSubword =
          !/^\s/.test(rawText) && wordTimestamps.length > 0;
        if (isSubword) {
          const prev = wordTimestamps[wordTimestamps.length - 1];
          prev.word += trimmed;
          prev.endMs = endMs;
        } else {
          wordTimestamps.push({ word: trimmed, startMs, endMs });
        }
      }
    } else {
      // Fallback nếu tokens không có (không gọi với tokenLevelTimestamps=true)
      wordTimestamps.push({
        word: segment.text.trim(),
        startMs: segment.offsets.from,
        endMs: segment.offsets.to,
      });
    }
  }

  // 7. Save vào DB
  const updated = await updateChapterAudio(plan.id, input.chapterIdx, {
    audioFilename: outFilename,
    audioDurationMs: durationMs,
    wordTimestamps,
  });
  if (!updated) {
    throw new Error("Plan biến mất giữa chừng khi update audio");
  }
  return updated;
}
