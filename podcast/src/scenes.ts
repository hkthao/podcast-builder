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
  // ──────── Phase triết học (lô 1) ────────
  CaveShadows:
    /\b(ảo ảnh|ảo tưởng|sự thật|cái bóng|thực tại|che giấu|nhìn nhận|hang|Plato|lầm tưởng|tưởng lầm)\b/gi,
  MementoMori:
    /\b(cái chết|hữu hạn|sinh tử|mong manh|kiếp người|kết thúc|hư vô của đời|ngắn ngủi|phù du|tử thần)\b/gi,
  Sisyphus:
    /\b(phi lý|nỗ lực|vượt qua|đỉnh|gian nan|leo|đẩy|lặp lại|vô vọng|bền bỉ|Sisyphus|kiên trì)\b/gi,
  Scales:
    /\b(đạo đức|đúng sai|công bằng|lương tâm|thiện ác|thiện và ác|giá trị|cân nhắc|chuẩn mực đạo đức|phán xét)\b/gi,
  MachineMind:
    /\b(trí tuệ nhân tạo|máy móc|thuật toán|robot|dữ liệu|công nghệ|tự động hóa|máy tính|kỹ thuật số|hậu nhân loại)\b/gi,
  // ──────── Phase triết học (lô 2) ────────
  Seesaw:
    /\b(dopamine|khoái cảm|khoái lạc|nghiện|phần thưởng|thỏa mãn|cai nghiện|bập bênh|cân bằng não|kích thích|lướt điện thoại|mạng xã hội|đau và sướng)\b/gi,
  Compass:
    /\b(ý nghĩa|mục đích|lẽ sống|phương hướng|lạc hướng|kim chỉ nam|định hướng|tìm đường đời|sứ mệnh)\b/gi,
  Void:
    /\b(hư vô|trống rỗng|vô nghĩa|hư không|vực thẳm|hư vô chủ nghĩa|chông chênh|mất phương hướng|tê liệt)\b/gi,
  StoicPillar:
    /\b(khắc kỷ|điềm tĩnh|vững vàng|chấp nhận|kiên định|bình thản|stoic|không thể kiểm soát|an nhiên|chịu đựng)\b/gi,
  Owl:
    /\b(minh triết|khôn ngoan|trí tuệ|hiền triết|thông thái|thông tuệ|chiêm nghiệm sâu|uyên bác|lẽ phải)\b/gi,
  ThirdEye:
    /\b(ý thức|nhận biết|quan sát|tỉnh giác|tự nhận thức|tỉnh thức|chú tâm|soi vào trong|giác quan thứ sáu)\b/gi,
  // ──────── Phase triết học (lô 3) ────────
  TimeRiver:
    /\b(thời gian|trôi qua|khoảnh khắc|dòng chảy|quá khứ|tương lai|đồng hồ|năm tháng|thời khắc|tích tắc)\b/gi,
  Wave:
    /\b(con sóng|sóng biển|tan biến|phù du|biển cả|cuốn trôi|gợn sóng|đại dương|trôi đi)\b/gi,
  Cosmos:
    /\b(vũ trụ|bao la|nhỏ bé|vì sao|không gian|vô tận|choáng ngợp|thiên hà|ngân hà|bầu trời sao)\b/gi,
  Labyrinth:
    /\b(lạc lối|rối ren|phức tạp|mê cung|hoang mang|bế tắc|loanh quanh|rối bời|mắc kẹt)\b/gi,
  Burden:
    /\b(gánh nặng|trách nhiệm|áp lực|mang vác|nặng nề|đè nén|oằn vai|gồng gánh|sức ép)\b/gi,
  Fate:
    /\b(định mệnh|số phận|nhân quả|tất yếu|an bài|quy luật|dây chuyền|hệ quả|kết cục|sắp đặt)\b/gi,
  Enlightenment:
    /\b(khai sáng|giác ngộ|ánh sáng|soi rọi|bừng sáng|lý trí|sáng tỏ|vỡ lẽ|thông suốt)\b/gi,
  Paradox:
    /\b(nghịch lý|mâu thuẫn|trái ngược|oái oăm|đối nghịch|tréo ngoe|vừa.{0,6}vừa|ngược đời)\b/gi,
  BrokenChains:
    /\b(tự do|giải phóng|xiềng xích|ràng buộc|bứt phá|tự chủ|thoát khỏi|gông cùm|cởi trói|giải thoát)\b/gi,
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

/** Cửa sổ chống lặp: không tái dùng sceneType trong N cảnh gần nhất. */
const RECENT_WINDOW = 3;

/**
 * Gán sceneType cho CẢ chuỗi cảnh, ưu tiên keyword nhưng ĐA DẠNG HOÁ:
 *  1. Ứng viên theo keyword (điểm > 0), chọn cái điểm cao nhất KHÔNG nằm trong
 *     N cảnh gần đây → tránh lặp liền kề + tránh dồn 1 scene.
 *  2. Câu không trúng keyword (hoặc mọi ứng viên đều vừa dùng) → xoay vòng
 *     deterministic qua toàn bộ 22 scene, bỏ qua N cảnh gần đây (thay vì luôn
 *     rơi về PodcastDesk).
 *
 * Đây là gốc rễ fix "hình ảnh lặp đi lặp lại": trước đây câu thiếu keyword đều
 * thành PodcastDesk và không có luật chống lặp.
 */
export const assignSceneTypes = (texts: string[]): SceneType[] => {
  const out: SceneType[] = [];
  const recent: SceneType[] = [];
  let rrCursor = 0;

  const notRecent = (t: SceneType) => !recent.includes(t);
  const remember = (t: SceneType) => {
    recent.push(t);
    if (recent.length > RECENT_WINDOW) recent.shift();
  };

  for (const text of texts) {
    const ranked = SCENE_TYPES.filter((t) => t !== "PodcastDesk")
      .map((t) => ({
        t,
        score: countMatches(text, SCENE_KEYWORDS[t as Exclude<SceneType, "PodcastDesk">]),
      }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score);

    let chosen: SceneType | undefined = ranked.find((x) => notRecent(x.t))?.t;

    if (!chosen) {
      // Round-robin đa dạng qua toàn bộ scene, bỏ qua N cảnh gần đây.
      for (let k = 0; k < SCENE_TYPES.length; k++) {
        const cand = SCENE_TYPES[(rrCursor + k) % SCENE_TYPES.length];
        if (notRecent(cand)) {
          chosen = cand;
          rrCursor = (rrCursor + k + 1) % SCENE_TYPES.length;
          break;
        }
      }
    }

    const final = chosen ?? DEFAULT_SCENE;
    out.push(final);
    remember(final);
  }
  return out;
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

  // Gán sceneType cả chuỗi (chống lặp + đa dạng) thay vì pickScene từng câu.
  const sceneTypes = assignSceneTypes(raw.map((r) => r.text));

  return raw.map((r, index) => ({
    index,
    startMs: r.startMs,
    endMs: r.endMs,
    text: r.text,
    mood: pickMood(r.text),
    sceneType: sceneTypes[index] ?? DEFAULT_SCENE,
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
