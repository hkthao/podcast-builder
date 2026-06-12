import crypto from "node:crypto";
import type { MoodKey } from "./theme";
import { MOOD_PROMPT_HINTS, STYLE_SUFFIX } from "./theme";
import { applyMoodOverrides, pickMood, type Scene as RawScene } from "./scenes";
import type { Transcript } from "../scripts/transcribe";
import type { EpisodeConfig } from "./episode";

export type VisualScene = {
  index: number;
  startMs: number;
  endMs: number;
  mood: MoodKey;
  text: string;
  /** Prompt sẽ truyền cho image gen API (đã ghép STYLE_SUFFIX). */
  visualPrompt: string;
  /** SHA-256 của prompt — dùng làm filename cache. */
  imageHash: string;
};

export type VisualPlan = {
  version: 1;
  generatedAt: string;
  scenes: VisualScene[];
};

const promptHash = (prompt: string): string =>
  crypto.createHash("sha256").update(prompt).digest("hex").slice(0, 16);

/**
 * Tạo prompt cho 1 cảnh từ nội dung tiếng Việt + mood.
 * Để OpenAI tự dịch/diễn giải tiếng Việt — không cần LLM pre-translate.
 */
export const buildPromptForScene = (text: string, mood: MoodKey): string => {
  const snippet = text.trim().replace(/\s+/g, " ").slice(0, 320);
  return [
    "Create a cinematic abstract conceptual image inspired by this Vietnamese passage:",
    `"${snippet}"`,
    MOOD_PROMPT_HINTS[mood],
    STYLE_SUFFIX,
  ]
    .filter(Boolean)
    .join(" ");
};

/**
 * Quy tắc cắt scene cho video DÀI (15-20 phút):
 *   - min 8s/cảnh (không vụn)
 *   - max 90s/cảnh (chống chán)
 *   - mặc định cắt theo gap ≥ 2s, hoặc ≥ 6 câu, hoặc đạt max
 * Khác `splitScenes` cũ (4s/25s) phù hợp cho podcast ngắn.
 */
const splitForLongVideo = (transcript: Transcript): RawScene[] => {
  const MIN_MS = 8_000;
  const MAX_MS = 90_000;
  const GAP_THRESHOLD_MS = 2_000;
  const MAX_SENTENCES = 6;
  const SENTENCE_END = /[.!?…]/g;

  const segments = transcript.transcription
    .filter((t) => t.text.trim().length > 0)
    .map((t) => ({ startMs: t.offsets.from, endMs: t.offsets.to, text: t.text }));

  if (segments.length === 0) return [];

  const scenes: RawScene[] = [];
  let bufText = "";
  let bufStart = segments[0]!.startMs;
  let bufEnd = segments[0]!.endMs;
  let prevEnd = segments[0]!.endMs;

  const flush = () => {
    if (!bufText) return;
    scenes.push({
      startMs: bufStart,
      endMs: bufEnd,
      text: bufText.trim(),
      mood: pickMood(bufText),
    });
    bufText = "";
  };

  for (const seg of segments) {
    const isFirst = bufText === "";
    const gap = seg.startMs - prevEnd;
    const duration = bufEnd - bufStart;
    const sentenceCount = (bufText.match(SENTENCE_END) ?? []).length;

    const shouldCut =
      !isFirst &&
      duration >= MIN_MS &&
      (gap >= GAP_THRESHOLD_MS ||
        sentenceCount >= MAX_SENTENCES ||
        duration >= MAX_MS);

    if (shouldCut) {
      flush();
      bufStart = seg.startMs;
    }
    if (bufText === "") bufStart = seg.startMs;
    bufText += seg.text;
    bufEnd = seg.endMs;
    prevEnd = seg.endMs;
  }
  flush();
  return scenes;
};

export const buildVisualPlan = (
  transcript: Transcript,
  episode: EpisodeConfig,
): VisualPlan => {
  const raw = splitForLongVideo(transcript);
  const moodAdjusted = applyMoodOverrides(
    raw,
    episode.moodOverride,
    episode.sceneOverrides,
  );

  const scenes: VisualScene[] = moodAdjusted.map((s, idx) => {
    const prompt = buildPromptForScene(s.text, s.mood);
    return {
      index: idx,
      startMs: s.startMs,
      endMs: s.endMs,
      mood: s.mood,
      text: s.text,
      visualPrompt: prompt,
      imageHash: promptHash(prompt),
    };
  });

  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    scenes,
  };
};
