/**
 * Essay store — `essays/<id>.json`.
 * Mỗi essay = 1 bài luận markdown ~1500-3000 từ, gen từ title + outline,
 * dùng làm input cho NotebookLM.
 *
 * Optional `brainstormRef` link tới ý tưởng đã pick để truy ngược.
 */
import type { LLMProvider } from "../../../shared/studio-core/llm-providers";
import { getDb } from "../../../shared/studio-core/db";
import type { SuggestedRef } from "./reference-store";

export type EssayBrainstormRef = {
  id: string;
  ideaIdx: number;
};

/** Phase 2: workspace style — mirror brainstorm/episode Style. */
export type Style = "podcast" | "gallery";

export type ShortsScript = {
  duration: number; // target seconds
  hook: string;
  body: string;
  cta: string;
};

export type EssayDerivatives = {
  /** 3 short-form scripts cho Reels/Shorts/TikTok */
  shorts: ShortsScript[];
  /** 5 FB post ngắn, viral-style */
  fbPosts: string[];
  /** 10 câu đắt quotable */
  quotes: string[];
  /** Blog post markdown (subheadings + SEO-friendly) */
  blog: string | null;
  /** Newsletter markdown (email-friendly, có lời chào kết) */
  newsletter: string | null;
};

export type Essay = {
  id: string;
  title: string;
  outline: string | null;
  content: string;
  /** Prompt tối ưu để paste vào NotebookLM (gen từ title+essay). Optional. */
  nlmPrompt: string | null;
  brainstormRef: EssayBrainstormRef | null;
  /** Suggestions từ LLM refs-suggest — cache để load lại không gen tiếp. */
  suggestedRefs: SuggestedRef[];
  /** Phase E: tái sử dụng nội dung — 5 derivatives. */
  derivatives: EssayDerivatives;
  provider: LLMProvider;
  model: string;
  createdAt: string;
  updatedAt: string;
  /** Phase 2: workspace style — default "podcast" cho legacy. */
  style: Style;
};


const slugify = (s: string): string =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);

const validId = (id: string): boolean => /^[a-z0-9-]+$/.test(id);

type DbRow = {
  id: string;
  title: string;
  outline: string | null;
  content: string;
  nlm_prompt: string | null;
  brainstorm_ref_json: string | null;
  suggested_refs_json: string | null;
  shorts_scripts_json: string | null;
  fb_posts_json: string | null;
  quotes_json: string | null;
  blog_md: string | null;
  newsletter_md: string | null;
  provider: string;
  model: string;
  created_at: string;
  updated_at: string;
  style: string;
};

const rowToEssay = (r: DbRow): Essay => ({
  id: r.id,
  title: r.title,
  outline: r.outline,
  content: r.content,
  nlmPrompt: r.nlm_prompt,
  brainstormRef: r.brainstorm_ref_json
    ? (JSON.parse(r.brainstorm_ref_json) as EssayBrainstormRef)
    : null,
  suggestedRefs: r.suggested_refs_json
    ? (JSON.parse(r.suggested_refs_json) as SuggestedRef[])
    : [],
  derivatives: {
    shorts: r.shorts_scripts_json
      ? (JSON.parse(r.shorts_scripts_json) as ShortsScript[])
      : [],
    fbPosts: r.fb_posts_json
      ? (JSON.parse(r.fb_posts_json) as string[])
      : [],
    quotes: r.quotes_json ? (JSON.parse(r.quotes_json) as string[]) : [],
    blog: r.blog_md,
    newsletter: r.newsletter_md,
  },
  provider: r.provider as LLMProvider,
  model: r.model,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  style: (r.style === "gallery" ? "gallery" : "podcast") as Style,
});

export async function listEssays(
  filter: { style?: Style } = {},
): Promise<Essay[]> {
  let sql = "SELECT * FROM essays";
  const params: string[] = [];
  if (filter.style) {
    sql += " WHERE style = ?";
    params.push(filter.style);
  }
  sql += " ORDER BY updated_at DESC";
  const rows = getDb().prepare(sql).all(...params) as DbRow[];
  return rows.map(rowToEssay);
}

export async function getEssay(id: string): Promise<Essay | null> {
  const row = getDb()
    .prepare("SELECT * FROM essays WHERE id = ?")
    .get(id) as DbRow | undefined;
  return row ? rowToEssay(row) : null;
}

export async function deleteEssay(id: string): Promise<boolean> {
  if (!validId(id)) return false;
  const result = getDb()
    .prepare("DELETE FROM essays WHERE id = ?")
    .run(id);
  return result.changes > 0;
}

export async function saveEssay(essay: Essay): Promise<void> {
  const d = essay.derivatives;
  getDb()
    .prepare(
      `INSERT OR REPLACE INTO essays
         (id, title, outline, content, nlm_prompt, brainstorm_ref_json,
          suggested_refs_json, shorts_scripts_json, fb_posts_json, quotes_json,
          blog_md, newsletter_md,
          provider, model, created_at, updated_at, style)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      essay.id,
      essay.title,
      essay.outline,
      essay.content,
      essay.nlmPrompt,
      essay.brainstormRef ? JSON.stringify(essay.brainstormRef) : null,
      essay.suggestedRefs.length > 0
        ? JSON.stringify(essay.suggestedRefs)
        : null,
      d.shorts.length > 0 ? JSON.stringify(d.shorts) : null,
      d.fbPosts.length > 0 ? JSON.stringify(d.fbPosts) : null,
      d.quotes.length > 0 ? JSON.stringify(d.quotes) : null,
      d.blog,
      d.newsletter,
      essay.provider,
      essay.model,
      essay.createdAt,
      essay.updatedAt,
      essay.style ?? "podcast",
    );
}

export type DerivativeType =
  | "shorts"
  | "fbPosts"
  | "quotes"
  | "blog"
  | "newsletter";

export async function saveEssayDerivative<K extends DerivativeType>(
  id: string,
  type: K,
  value: EssayDerivatives[K],
): Promise<Essay | null> {
  const e = await getEssay(id);
  if (!e) return null;
  (e.derivatives[type] as EssayDerivatives[K]) = value;
  e.updatedAt = new Date().toISOString();
  await saveEssay(e);
  return e;
}

export async function saveEssaySuggestedRefs(
  id: string,
  suggestedRefs: SuggestedRef[],
): Promise<Essay | null> {
  const e = await getEssay(id);
  if (!e) return null;
  e.suggestedRefs = suggestedRefs;
  e.updatedAt = new Date().toISOString();
  await saveEssay(e);
  return e;
}

export async function updateEssayContent(
  id: string,
  patch: {
    title?: string;
    content?: string;
    outline?: string | null;
    nlmPrompt?: string | null;
  },
): Promise<Essay | null> {
  const e = await getEssay(id);
  if (!e) return null;
  if (patch.title !== undefined) e.title = patch.title;
  if (patch.content !== undefined) e.content = patch.content;
  if (patch.outline !== undefined) e.outline = patch.outline;
  if (patch.nlmPrompt !== undefined) e.nlmPrompt = patch.nlmPrompt;
  e.updatedAt = new Date().toISOString();
  await saveEssay(e);
  return e;
}

export const ESSAY_SYSTEM_PROMPT = `Bạn là cây bút luận tiếng Việt cho kênh podcast "ByteCast Tech" — kênh khám phá các câu hỏi lớn về con người, công nghệ, xã hội, triết học. Phong cách viết: chiêm nghiệm, sâu sắc, mộc mạc, KHÔNG sáo rỗng.

Nhiệm vụ: viết một bài luận tiếng Việt 1800-2500 từ về chủ đề được cho.

CẤU TRÚC BẮT BUỘC:

1. Mở bài (3-6 dòng):
   - 1 câu hook đặt nghịch lý/quan sát kỳ lạ.
   - 2-3 dòng mô tả nghịch lý cụ thể bằng ví dụ đời thường.
   - 1 dòng đặt câu hỏi cốt lõi của bài (in nguyên 1 dòng riêng để nhấn).

2. Thân bài: 5-7 đoạn (section), MỖI section:
   - Header dạng câu hỏi hoặc khẳng định (vd "Bộ Não Được Thiết Kế Để Tìm Kiếm, Không Phải Để Biết Ơn"). KHÔNG dùng markdown ## hay ###.
   - 3-6 đoạn ngắn (1-4 câu/đoạn) phát triển ý.
   - Phải có ÍT NHẤT 1 đoạn DUY NHẤT 1 dòng (line-break emphasis) để nhấn câu chốt. VD:
     "Cho đến một ngày, chúng biến mất."
   - Trong 5-7 section, có ÍT NHẤT 2 section nhắc tên cụ thể của 1 framework/thinker/concept (Heidegger, Hedonic Adaptation, Byung-Chul Han, Sherry Turkle, Stoicism, FOMO, dopamine loop, v.v.) khi phù hợp chủ đề.
   - Có ÍT NHẤT 1 section có khía cạnh công nghệ/AI/mạng xã hội (cho ByteCast Tech).

3. Kết bài (3-7 dòng):
   - Reframe câu hỏi mở bài thành câu hỏi sâu hơn ("Có lẽ câu hỏi không phải: ... Mà là: ...").
   - 1-2 dòng final insight đậm tính chiêm nghiệm.
   - KHÔNG kêu gọi hành động, KHÔNG "hãy nhớ rằng".
   - KHÔNG bắt đầu bằng "Tóm lại", "Cuối cùng", "Kết luận là".

KỸ THUẬT VIẾT BẮT BUỘC:
- Đoạn ngắn — TRUNG BÌNH 1-3 câu/đoạn. KHÔNG viết đoạn dài 5+ câu.
- Dùng line-break emphasis (1 dòng riêng) cho câu chốt — ÍT NHẤT 4-6 lần trong toàn bài.
- Dùng cấu trúc PARALLEL/REPETITION (1-2 lần) để nhấn — vd:
  "Đã từng có thời gian.
  Đã từng có cơ hội.
  Đã từng có những con người yêu thương mình."
- Tách 2 loại "hiểu" hoặc 2 mặt nghịch lý rõ ràng khi phù hợp.
- KHÔNG dùng heading markdown (##, ###).
- KHÔNG mở đầu bằng "Trong thế giới hiện đại", "Trong bài viết này", "Chúng ta sẽ tìm hiểu".
- KHÔNG dùng cụm sáo rỗng: "không thể phủ nhận", "trong cuộc sống hối hả", "guồng quay cuộc sống", "thời đại 4.0".
- Văn Việt mộc mạc, không Hán-Việt rườm rà.

OUTPUT: markdown thuần, KHÔNG lời mở đầu kiểu "Đây là bài viết:", KHÔNG meta-text, KHÔNG dấu --- ngăn cách. Section header viết trực tiếp như tiêu đề thường (1 dòng, không # prefix).

DÀN Ý INPUT có thể chứa các SECTION PHỤ LỤC sau dấu "---" — TẬN DỤNG TRIỆT ĐỂ:
- "QUAN SÁT GỐC" → dùng làm hook mở bài (1 quan sát đời thường cụ thể).
- "PHẢN BIỆN" → BẮT BUỘC có 1 section thân bài làm steel-man phản biện + rebuttal. Essay 2 chiều mới sâu.
- "NHÂN VẬT/SỰ KIỆN LỊCH SỬ" → dùng làm anchor cho ÍT NHẤT 1 section thân bài (1 ví dụ lịch sử đáng nhớ hơn 10 phút lý thuyết).
- "STORY BANK" → chèn 1-2 câu chuyện cụ thể vào essay để thay vì lý thuyết suông. Đặc biệt giữ những câu "[Cá nhân]" đời thường VN làm điểm chạm cảm xúc.
- "FUTURE/AGI ENDING" → dùng làm 1 section gần cuối hoặc gài vào kết bài. AI/AGI projection là DNA kênh, đoạn kết mạnh.

Nếu user cung cấp outline, bám sát outline. Nếu không, tự lập dàn ý hợp lý theo cấu trúc trên.`;

export function buildEssayUserPrompt(
  title: string,
  outline: string | null,
): string {
  const parts: string[] = [];
  parts.push(`Tiêu đề: ${title}`);
  if (outline) {
    parts.push(`\nDàn ý gợi ý:\n${outline}`);
  }
  parts.push("\nViết bài luận hoàn chỉnh ngay bây giờ.");
  return parts.join("");
}

export const NLM_PROMPT_SYSTEM = `You are an expert prompt designer for Google NotebookLM Audio Overview ("Deep Dive" 2-host podcast).

🚫 AVOID THE DEFAULT NLM TONE 🚫
Default NLM podcast sounds like 2 enthusiastic researchers reading a textbook — fast, hyped, lecture-y. We want the OPPOSITE: a SLOW, WARM, REFLECTIVE conversation between 2 life-experienced friends having coffee, gently surfacing realizations the listener has lived but never named.

User uploads a Vietnamese essay as source, then pastes YOUR prompt to direct NotebookLM's output style. Your job: produce 1 ENGLISH prompt (NLM follows English directives more precisely) that steers NLM toward this "warm coffee chat" style for the given essay.

═══ OUTPUT TEMPLATE — fill ALL {PLACEHOLDERS} from essay content ═══

---

Create a long-form, deeply reflective, and warm podcast discussion in Vietnamese based ON THE PROVIDED SOURCES. The two hosts must sound like mature, life-experienced friends ({AUDIENCE_DESCRIPTION — see Audience block below}) having a calm conversation over coffee, looking back at how {CORE_PHENOMENON_FROM_ESSAY — vd "modern life has silently mutated", "what we call love has shifted", "memory itself has changed shape"}. Avoid any fast-paced, hype, or textbook tone.

Topic: "{ESSAY_TITLE}" ({1_LINE_ENGLISH_SUBTITLE_CAPTURING_DEEPER_QUESTION}).

Target Audience & Tone:
- Audience: {1-2 sentences describing WHO they are + WHAT SHARED EXPERIENCE binds them — focus on what they remember from "ngày xưa". Default to "Adults aged 40-65 who lived through both the pre-internet era and the AI boom — they remember rotary phones, paper dictionaries, and handwritten letters" if essay is about modernity/technology/change. If essay is timeless (love, death, meaning), tailor to who would resonate.}
- Tone: warm, unhurried, deeply contemplative, balanced. Neither optimistic nor pessimistic about {THE_SUBJECT}. Slow pacing — moments of silence are OK.
- Host Dynamics: friendly, personal storytelling. They constantly contrast {PRIMARY_CONTRAST_PATTERN — default "Ngày xưa" (The Past) with "Ngày nay" (The Present) if essay is about change. If essay is timeless, use another binary contrast that fits — vd "Cái mình nghĩ vs Cái thực sự là", "Bề mặt vs Bản chất", "Lý trí vs Trực giác"} to evoke "Aha!" moments of recognition (not lecture, not advice).

The Conversational Arc (3 Mature Movements — group essay's sub-points into themes, do NOT list points one by one):

1. {MOVEMENT_1_TITLE — phenomenological / everyday observations}:
{3-5 sentences: open with a relatable everyday "ngày xưa" observation rooted in essay. Group 2-4 of essay's key points under this movement. What does each host notice/argue? Keep it concrete, not abstract.}

2. {MOVEMENT_2_TITLE — deeper structure / emotional architecture / hidden mechanism}:
{3-5 sentences: name specific concepts/frameworks/thinkers from essay verbatim (Heidegger, Hedonic Adaptation, Byung-Chul Han, dopamine loop, FOMO…). Continue the contrast pattern. What does each host see that the other misses?}

3. {MOVEMENT_3_TITLE — meaning / philosophy / what does this mean for being human}:
{3-5 sentences: thread philosophical lenses naturally when essay allows — Phật giáo (Vô thường — impermanence), Lão Tử (flowing with change), Trang Tử (fluid identity), Darwin (adaptation > strength), Stoicism, etc. These are flavors not lectures. Connect to essay's deepest insight.}

Mandatory Structural Transitions:
The hosts must naturally use these EXACT Vietnamese phrases (in this exact spelling) to bridge ideas. Sprinkle 4-6 times across the conversation:
- "Nhưng điều thú vị là..."
- "Điều ít người nhận ra là..."
- "Và đây mới là phần đáng suy nghĩ..."
- "Nếu nhìn từ một góc độ khác..."
- "Nhưng câu chuyện không dừng lại ở đó..."

Ending:
Do NOT judge if this evolution/change/phenomenon is good or bad. Do NOT give advice ("hãy trân trọng…"). End with a lingering, profound Vietnamese question that opens MORE questions than answers: {1_OPEN_ENDED_VIETNAMESE_QUESTION — typically "Nếu…, liệu…?" pattern, drawn from essay's deepest insight}. Leave the listeners with curiosity, suy ngẫm, not conclusions.

Language & Style:
- Language: the entire spoken conversation must be in Vietnamese — chậm rãi, sâu lắng, mộc mạc, giàu chất tự sự, không học thuật.
- Prioritize emotional resonance and nostalgic contrast over information density.
- Tránh: cụm sáo rỗng ("không thể phủ nhận", "trong cuộc sống hối hả", "guồng quay cuộc sống", "thời đại 4.0"), tone động viên kiểu self-help, lời khuyên cụ thể, thuật ngữ chuyên môn dày đặc.

---

═══ RULES ═══

R1. Fill EVERY {PLACEHOLDER} with concrete content drawn from the essay. KHÔNG để placeholder trống.

R2. Group essay's sub-points (vd nếu essay có 10 ý → gộp thành 3 movement mỗi cái 3-4 ý). Movement title = THEME, không phải chapter abstract.

R3. "Ngày xưa vs Ngày nay" contrast là BẮT BUỘC nếu essay nói về sự thay đổi / hiện đại / công nghệ / AI. Nếu essay timeless (triết học tình yêu/chết/ý nghĩa) → substitute với binary contrast khác phù hợp essay.

R4. Audience profile phải CỤ THỂ — không chung chung. Default 40-65 với pre-internet memory cho essay về modernity. Đổi nếu essay nhắm audience khác (vd essay về parenthood → "Cha mẹ 30-50 đang nuôi con thời TikTok").

R5. Movement 3 PHẢI có philosophy thread tự nhiên (Phật/Lão Tử/Trang Tử/Darwin/Stoicism…) — pick 1-2 lens phù hợp essay, KHÔNG dump tất cả.

R6. Mandatory Vietnamese transition phrases (5 phrases ở trên) phải xuất hiện VERBATIM trong output prompt — để NLM dùng đúng.

R7. Final question PHẢI là Vietnamese open-ended (dạng "Nếu…, liệu…?" hoặc "Có phải…?" / "Liệu…có còn…?"), KHÔNG advice, KHÔNG yes/no.

R8. Output: filled prompt only, in English (Vietnamese chỉ trong các phần: quoted title, transition phrases, final question, adjective register list). KHÔNG markdown headers, KHÔNG preamble ("Here is the prompt:"), KHÔNG closing notes.`;

export function buildNlmPromptUserContent(
  title: string,
  essayContent: string,
): string {
  // Cần đủ context để LLM rút ra 3-4 movement + 2 lens + concrete concepts.
  // 3500 chars (~700-900 từ) đủ bao quát mở/thân/kết essay điển hình.
  const snippet = essayContent.slice(0, 3500);
  return [
    `Essay title: ${title}`,
    `\nEssay content (first 3500 chars to capture argument structure + concrete concepts):\n${snippet}`,
    `\nWrite the filled NotebookLM prompt now.`,
  ].join("");
}

/** Build id mới từ title + timestamp. Slug-only để filename an toàn. */
export function newEssayId(title: string): string {
  const now = new Date();
  const ts =
    now.getFullYear() +
    String(now.getMonth() + 1).padStart(2, "0") +
    String(now.getDate()).padStart(2, "0") +
    "-" +
    String(now.getHours()).padStart(2, "0") +
    String(now.getMinutes()).padStart(2, "0") +
    String(now.getSeconds()).padStart(2, "0");
  return `${ts}-${slugify(title) || "untitled"}`;
}
