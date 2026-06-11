import type { MoodKey } from "./theme";
import type { Transcript } from "../scripts/transcribe";

export type Scene = {
  startMs: number;
  endMs: number;
  mood: MoodKey;
  text: string;
};

const GAP_THRESHOLD_MS = 1500;
const MAX_SENTENCES_PER_SCENE = 4;
const MAX_SCENE_DURATION_MS = 25_000;
const MIN_SCENE_DURATION_MS = 4_000;

const MOOD_KEYWORDS: Record<MoodKey, RegExp> = {
  emotional: /\b(yêu|mất|buồn|đau|nhớ|cô đơn|lạc lõng|nước mắt|khóc|chia ly|tan vỡ)\b/i,
  existential:
    /\b(ý nghĩa|vô nghĩa|chết|tồn tại|hư vô|thời gian|vĩnh viễn|hư không|sinh tử|kiếp người)\b/i,
  contemplative:
    /\b(tự nhiên|im lặng|tĩnh|thiền|đơn giản|chiêm nghiệm|lắng nghe|chậm rãi|hơi thở)\b/i,
  social: /^/i,
};

export const pickMood = (text: string): MoodKey => {
  if (MOOD_KEYWORDS.emotional.test(text)) return "emotional";
  if (MOOD_KEYWORDS.existential.test(text)) return "existential";
  if (MOOD_KEYWORDS.contemplative.test(text)) return "contemplative";
  return "social";
};

type Segment = { startMs: number; endMs: number; text: string };

const collectSegments = (transcript: Transcript): Segment[] => {
  return transcript.transcription
    .filter((t) => t.text.trim().length > 0)
    .map((t) => ({
      startMs: t.offsets.from,
      endMs: t.offsets.to,
      text: t.text,
    }));
};

const countSentenceEnds = (text: string): number => {
  const m = text.match(/[.!?…]/g);
  return m ? m.length : 0;
};

export const splitScenes = (transcript: Transcript): Scene[] => {
  const segments = collectSegments(transcript);
  if (segments.length === 0) return [];

  const scenes: Scene[] = [];
  let bufferText = "";
  let bufferStart = segments[0]!.startMs;
  let bufferEnd = segments[0]!.endMs;
  let prevEnd = segments[0]!.endMs;

  const flush = () => {
    if (!bufferText) return;
    scenes.push({
      startMs: bufferStart,
      endMs: bufferEnd,
      text: bufferText.trim(),
      mood: pickMood(bufferText),
    });
    bufferText = "";
  };

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]!;
    const isFirst = bufferText === "";
    const gap = seg.startMs - prevEnd;
    const sceneDuration = bufferEnd - bufferStart;
    const sentenceCount = countSentenceEnds(bufferText);

    const shouldCut =
      !isFirst &&
      sceneDuration >= MIN_SCENE_DURATION_MS &&
      (gap >= GAP_THRESHOLD_MS ||
        sentenceCount >= MAX_SENTENCES_PER_SCENE ||
        sceneDuration >= MAX_SCENE_DURATION_MS);

    if (shouldCut) {
      flush();
      bufferStart = seg.startMs;
    }
    if (bufferText === "") bufferStart = seg.startMs;
    bufferText += seg.text;
    bufferEnd = seg.endMs;
    prevEnd = seg.endMs;
  }
  flush();
  return scenes;
};

export const applyMoodOverrides = (
  scenes: Scene[],
  override: MoodKey | null,
  perScene: ReadonlyArray<{ startMs: number; mood: MoodKey }> | null,
): Scene[] => {
  if (override) return scenes.map((s) => ({ ...s, mood: override }));
  if (!perScene || perScene.length === 0) return scenes;
  return scenes.map((s) => {
    const o = perScene.find(
      (p) => p.startMs >= s.startMs && p.startMs < s.endMs,
    );
    return o ? { ...s, mood: o.mood } : s;
  });
};
