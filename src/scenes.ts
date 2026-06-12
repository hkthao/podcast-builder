import {
  DEFAULT_SCENE,
  SCENE_TYPES,
  type MoodKey,
  type SceneType,
} from "./theme";
import type { Transcript } from "../scripts/transcribe";

export type Scene = {
  index: number;
  startMs: number;
  endMs: number;
  mood: MoodKey;
  sceneType: SceneType;
  text: string;
};

export type ScenePlan = {
  version: 2;
  generatedAt: string;
  scenes: Scene[];
};

/** Quy tắc cắt cho podcast 15–20 phút: cảnh không vụn cũng không quá dài. */
const MIN_SCENE_DURATION_MS = 8_000;
const MAX_SCENE_DURATION_MS = 120_000;
const GAP_THRESHOLD_MS = 2_000;
const MAX_SENTENCES_PER_SCENE = 6;
const SENTENCE_END = /[.!?…]/g;

const MOOD_KEYWORDS: Record<MoodKey, RegExp> = {
  social:
    /\b(kết nối|xã hội|đám đông|cộng đồng|mạng|quan hệ|người khác|chúng ta|ai đó|cùng nhau)\b/i,
  healing:
    /\b(im lặng|chữa lành|thiền|tĩnh|đơn giản|chiêm nghiệm|hơi thở|nghỉ ngơi|tự nhiên|chậm rãi|lắng nghe)\b/i,
  contemplative:
    /\b(ý nghĩa|vô nghĩa|chết|tồn tại|hư vô|thời gian|vĩnh viễn|hư không|sinh tử|kiếp người|suy ngẫm|sâu sắc)\b/i,
  energetic:
    /\b(tự do|bứt phá|năng lượng|hành động|mạnh mẽ|quyết tâm|thay đổi|cuồng nhiệt|đỉnh cao)\b/i,
  positive: /^/i,
};

export const pickMood = (text: string): MoodKey => {
  if (MOOD_KEYWORDS.energetic.test(text)) return "energetic";
  if (MOOD_KEYWORDS.contemplative.test(text)) return "contemplative";
  if (MOOD_KEYWORDS.healing.test(text)) return "healing";
  if (MOOD_KEYWORDS.social.test(text)) return "social";
  return "positive";
};

/** Đếm số lần regex match — đếm match mới mỗi lần vì regex global. */
const countMatches = (text: string, pattern: RegExp): number => {
  const re = new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`);
  return (text.match(re) ?? []).length;
};

/** Bảng từ khoá → sceneType (Mục 11.3 trong PLAN). */
const SCENE_KEYWORDS: Record<Exclude<SceneType, "PodcastDesk">, RegExp> = {
  Idea: /\b(ý tưởng|khái niệm|nhận thức|à há|phát hiện|tỉnh ngộ|hiểu ra|nhận ra|suy nghĩ|lý trí|logic|tư duy)\b/gi,
  Connection:
    /\b(kết nối|quan hệ|giao tiếp|yêu thương|tình bạn|lan truyền|liên kết|chia sẻ|trò chuyện|gắn bó)\b/gi,
  Crowd:
    /\b(đám đông|xã hội|chuẩn mực|công chúng|tập thể|số đông|nhiều người|mọi người|cộng đồng)\b/gi,
  InnerSelf:
    /\b(cảm xúc|ý thức|vô thức|bản ngã|chữa lành|tổn thương|nội tâm|im lặng|tâm hồn|bên trong|cô đơn|sợ hãi|nỗi đau)\b/gi,
  Choice:
    /\b(lựa chọn|tự do|quyết định|ngã ba|hướng đi|nghịch lý|đối mặt|chọn lựa|từ chối|chấp nhận)\b/gi,
  Knowledge:
    /\b(sách|tri thức|học|đọc|thiền|chiêm nghiệm|suy ngẫm|hiểu biết|nghiên cứu|triết học|tâm lý học|khoa học)\b/gi,
};

export const pickScene = (text: string): SceneType => {
  let best: SceneType = DEFAULT_SCENE;
  let bestScore = 0;
  for (const sceneType of SCENE_TYPES) {
    if (sceneType === "PodcastDesk") continue;
    const pattern = SCENE_KEYWORDS[sceneType as Exclude<SceneType, "PodcastDesk">];
    const score = countMatches(text, pattern);
    if (score > bestScore) {
      bestScore = score;
      best = sceneType;
    }
  }
  return best;
};

type Segment = { startMs: number; endMs: number; text: string };

const collectSegments = (transcript: Transcript): Segment[] =>
  transcript.transcription
    .filter((t) => t.text.trim().length > 0)
    .map((t) => ({ startMs: t.offsets.from, endMs: t.offsets.to, text: t.text }));

/** Chia transcript thành scenes theo gap / số câu / max duration. */
export const splitScenes = (transcript: Transcript): Scene[] => {
  const segments = collectSegments(transcript);
  if (segments.length === 0) return [];

  const raw: Array<{ startMs: number; endMs: number; text: string }> = [];
  let bufText = "";
  let bufStart = segments[0]!.startMs;
  let bufEnd = segments[0]!.endMs;
  let prevEnd = segments[0]!.endMs;

  const flush = () => {
    if (!bufText) return;
    raw.push({ startMs: bufStart, endMs: bufEnd, text: bufText.trim() });
    bufText = "";
  };

  for (const seg of segments) {
    const isFirst = bufText === "";
    const gap = seg.startMs - prevEnd;
    const duration = bufEnd - bufStart;
    const sentenceCount = (bufText.match(SENTENCE_END) ?? []).length;

    const shouldCut =
      !isFirst &&
      duration >= MIN_SCENE_DURATION_MS &&
      (gap >= GAP_THRESHOLD_MS ||
        sentenceCount >= MAX_SENTENCES_PER_SCENE ||
        duration >= MAX_SCENE_DURATION_MS);

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

  return raw.map((r, index) => ({
    index,
    startMs: r.startMs,
    endMs: r.endMs,
    text: r.text,
    mood: pickMood(r.text),
    sceneType: pickScene(r.text),
  }));
};

export type SceneOverride = {
  startMs: number;
  mood?: MoodKey;
  sceneType?: SceneType;
};

/** Áp moodOverride / sceneOverrides từ episode config sau khi auto-plan. */
export const applyOverrides = (
  scenes: Scene[],
  moodOverride: MoodKey | null,
  perScene: ReadonlyArray<SceneOverride> | null,
): Scene[] => {
  let out = scenes;
  if (moodOverride) out = out.map((s) => ({ ...s, mood: moodOverride }));
  if (perScene && perScene.length > 0) {
    out = out.map((s) => {
      const o = perScene.find(
        (p) => p.startMs >= s.startMs && p.startMs < s.endMs,
      );
      if (!o) return s;
      return {
        ...s,
        mood: o.mood ?? s.mood,
        sceneType: o.sceneType ?? s.sceneType,
      };
    });
  }
  return out;
};

export const buildScenePlan = (
  transcript: Transcript,
  moodOverride: MoodKey | null,
  sceneOverrides: ReadonlyArray<SceneOverride> | null,
): ScenePlan => {
  const raw = splitScenes(transcript);
  const adjusted = applyOverrides(raw, moodOverride, sceneOverrides);
  return {
    version: 2,
    generatedAt: new Date().toISOString(),
    scenes: adjusted,
  };
};
