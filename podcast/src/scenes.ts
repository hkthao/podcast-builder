import {
  DEFAULT_SCENE,
  SCENE_TYPES,
  type MoodKey,
  type SceneType,
} from "./theme";
import type { Transcript } from "../../shared/transcribe/transcribe";

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

/** Quy tắc cắt cho podcast 15–20 phút: cảnh không vụn cũng không quá dài.
 *
 * Retention pass 1: thay vì 1 set thresholds cố định, nới `min` xuống cho
 * đoạn high-energy (nói nhanh, WPM ≥ HIGH) → nhịp gãy thường xuyên hơn.
 * Đoạn low-energy (chậm, suy ngẫm) tăng `maxSentences` cho phép cảnh dài.
 * WPM thay cho audio energy vì transcript đã có sẵn, không cần ffmpeg pass.
 */
const MIN_SCENE_DURATION_MS_FAST = 4_000;
const MIN_SCENE_DURATION_MS_DEFAULT = 8_000;
const MAX_SCENE_DURATION_MS = 120_000;
const GAP_THRESHOLD_MS = 2_000;
const MAX_SENTENCES_PER_SCENE = 6;
const MAX_SENTENCES_PER_SCENE_SLOW = 8;
const SENTENCE_END = /[.!?…]/g;

const HIGH_WPM_THRESHOLD = 200;
const LOW_WPM_THRESHOLD = 100;

const wpmOf = (text: string, durationMs: number): number => {
  if (durationMs <= 0) return 0;
  const wordCount = text.trim().split(/\s+/).filter(Boolean).length;
  return (wordCount / (durationMs / 1000)) * 60;
};

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
  // ──────── 10 scene mới ────────
  OnAir:
    /\b(hôm nay|bắt đầu|tuyên bố|chia sẻ|kể bạn|nói thẳng|tôi muốn nói|hôm nay tôi|mở đầu|tuyên ngôn)\b/gi,
  DualMic:
    /\b(đối thoại|tranh luận|hai phía|phản biện|đối lập|bàn luận|trao đổi|hai góc nhìn|đôi bên|debate)\b/gi,
  Journal:
    /\b(ghi chép|nhật ký|viết xuống|liệt kê|danh sách|to-do|tự hỏi|nhìn lại|reflect|kiểm điểm)\b/gi,
  Morning:
    /\b(buổi sáng|cà phê|tỉnh dậy|khởi đầu|chậm rãi|hiện diện|tận hưởng|sống chậm|bình yên|thư thái)\b/gi,
  Listening:
    /\b(lắng nghe|nghe thấy|đồng cảm|im lặng|thấu hiểu|cảm thông|chú tâm|chú ý|nghe lòng|nghe nhau)\b/gi,
  Voices:
    /\b(tiếng nói|chatter|self-talk|đầu óc|suy nghĩ rối|nội tâm ồn|tiếng vọng|hỗn loạn|nhiều giọng|tự nói)\b/gi,
  Growth:
    /\b(trưởng thành|phát triển|lớn lên|tiến bộ|kiên nhẫn|nuôi dưỡng|từng bước|hành trình|becoming|hành trang)\b/gi,
  Quote:
    /\b(châm ngôn|trích dẫn|câu nói|lời thầy|danh ngôn|triết lý sống|câu chuyện hay|smile bài học|wisdom|insight)\b/gi,
  Doubt:
    /\b(hoài nghi|không chắc|liệu rằng|có thật|do dự|băn khoăn|mơ hồ|bối rối|chần chừ|uncertainty)\b/gi,
  LettingGo:
    /\b(buông bỏ|từ bỏ|chia tay|mất đi|kết thúc|chấp nhận mất|giải phóng|nhẹ lòng|thanh thản|release)\b/gi,
  // ──────── Phase 3 (giving/transform) ────────
  Sacrifice:
    /\b(cho đi|trao đi|hy sinh|nhường|tặng|dâng hiến|phép trừ|khan hiếm|tước đoạt|vơi đi|đong đếm)\b/gi,
  Metamorphosis:
    /\b(biến thái|lột xác|chuyển hóa|hóa bướm|kén|tan chảy|rũ bỏ|tái sinh|tái cấu trúc|metabola)\b/gi,
  Bridge:
    /\b(cầu nối|nối liền|hai bờ|bắc cầu|khoảng cách|chuyển giao|vượt qua|gắn kết sâu sắc|nối bờ)\b/gi,
  Mirror:
    /\b(soi gương|tấm gương|phản chiếu|phản gương|nhìn lại mình|nội tâm hóa|looking glass|gương)\b/gi,
  Threshold:
    /\b(ngưỡng cửa|bước qua|ranh giới|chuyển giao|nghi thức|thiêng liêng|thế giới bên kia|liên minh)\b/gi,
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

    // WPM tính trên buffer hiện tại — nói nhanh = cut sớm, nói chậm = giữ dài.
    // Bias chỉ trigger khi buffer đã đủ chữ (≥10 từ) để WPM ổn định, không
    // bị nhiễu bởi câu ngắn đầu cảnh.
    const wordCount = bufText.trim().split(/\s+/).filter(Boolean).length;
    const reliableWpm = wordCount >= 10 ? wpmOf(bufText, duration) : 150;
    const minDuration =
      reliableWpm >= HIGH_WPM_THRESHOLD
        ? MIN_SCENE_DURATION_MS_FAST
        : MIN_SCENE_DURATION_MS_DEFAULT;
    const maxSentences =
      reliableWpm <= LOW_WPM_THRESHOLD
        ? MAX_SENTENCES_PER_SCENE_SLOW
        : MAX_SENTENCES_PER_SCENE;

    const shouldCut =
      !isFirst &&
      duration >= minDuration &&
      (gap >= GAP_THRESHOLD_MS ||
        sentenceCount >= maxSentences ||
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
