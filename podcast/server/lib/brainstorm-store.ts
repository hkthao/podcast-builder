/**
 * Brainstorm session store — JSON file per session ở `brainstorm/<id>.json`.
 * Mỗi session = 1 lần user click Generate, lưu lại topic/tone + 5 ý tưởng
 * + index user pick. KHÔNG cache binary (consistent với Reference Library).
 *
 * Idea schema cố tình tổng quát (title/hook/angle/why) để dùng cho cả
 * Vietnamese ByteCast Tech lẫn các kênh khác sau này.
 */
import { chat, type LLMProvider } from "../../../shared/studio-core/llm-providers";
import { getDb } from "../../../shared/studio-core/db";
import { getEffectivePrompt } from "../../../shared/studio-core/prompt-overrides-store";
import { safeParseJson } from "../../../shared/lib/safe-json";
const DEFAULT_PROVIDER: LLMProvider =
  (process.env.BRAINSTORM_PROVIDER as LLMProvider) ?? "openai";
const DEFAULT_MODEL = process.env.BRAINSTORM_MODEL ?? "gpt-4o-mini";

export type BrainstormScores = {
  /** Bao nhiêu người từng trải qua? (1-10) */
  universal: number;
  /** Đánh vào cảm xúc không? (1-10) */
  emotional: number;
  /** Dẫn tới câu hỏi lớn về con người không? (1-10) */
  philosophical: number;
  /** Liên hệ được với AI hiện đại? (1-10) */
  aiRelevance: number;
  /** Đã có quá nhiều người làm chưa? (1-10, 10 = rất original) */
  originality: number;
};

export type BrainstormIdea = {
  title: string;
  hook: string;
  angle: string;
  why: string;
  /**
   * Step A v2: quan sát đời thường nền tảng của idea (1 câu, không phải ý tưởng).
   * VD: "Người ta chỉ tiếc khi mất đi.", "Người thành công vẫn trống rỗng."
   */
  observation: string;
  /**
   * Step F v2: chấm điểm 5 chiều 1-10. Tổng / 5 = avg.
   */
  scores: BrainstormScores;
  /**
   * Step I v2 (Knowledge Map): các lĩnh vực liên quan để tra cứu nguồn.
   * VD: ["Tâm lý học", "Triết học hiện sinh", "Khoa học thần kinh", "AI"]
   */
  knowledgeMap: string[];
  /**
   * Phase A mục 3: Contrarian View — luận điểm phản biện chính.
   * 1-2 câu nghi vấn lại idea chính → essay sâu hơn.
   */
  contrarianView: string;
  /**
   * Phase A mục 7: Thumbnail hooks — 3-5 alt hook ngắn (10-20 từ)
   * tách khỏi title, dùng làm overlay text thumbnail Reels.
   */
  thumbnailHooks: string[];
  /**
   * Phase A mục 9: Future Connection — projection AI/AGI ending.
   * 1-2 câu: "Nếu AI biết..., điều gì xảy ra?"
   */
  futureConnection: string;
  /**
   * Phase B mục 4: Historical Layer — 3-5 nhân vật lịch sử + 1 dòng context.
   * VD: "Caesar — bị ám sát bởi chính tay người tin cẩn nhất."
   */
  historicalExamples: string[];
  /**
   * Phase B mục 5: Story Bank — 3-4 câu chuyện cụ thể (mix lịch sử/hiện
   * đại/cá nhân). Prefix loại: "[Hiện đại] …", "[Lịch sử] …", "[Cá nhân] …"
   * VD: "[Hiện đại] Steve Jobs ung thư tuyến tuỵ + bài diễn văn Stanford 2005."
   */
  storyBank: string[];
  /**
   * Dàn ý đầy đủ theo ByteCast Topic Framework v1 — 12 mục.
   */
  outline: string;
};

const DEFAULT_SCORES: BrainstormScores = {
  universal: 5,
  emotional: 5,
  philosophical: 5,
  aiRelevance: 5,
  originality: 5,
};

/**
 * Phase C: Topic Database — category enum cố định để tránh fragmentation.
 * Mỗi session 1-3 category. UI dùng để filter + dedup check.
 */
export const TOPIC_CATEGORIES = [
  "Meaning",
  "Psychology",
  "Time",
  "AI",
  "Loss",
  "Freedom",
  "Self",
  "Death",
  "Memory",
  "Connection",
  "Power",
  "Technology",
  "Happiness",
  "Solitude",
  "Ethics",
  "Future",
] as const;
export type TopicCategory = (typeof TOPIC_CATEGORIES)[number];

/** Video style — chỉ còn podcast (gallery đã gỡ; giữ field để khỏi migrate DB). */
export type Style = "podcast";

/**
 * Brainstorm session schema (podcast): ideas = BrainstormIdea[] (philosophical,
 * 13 fields). `categories` lấy từ TOPIC_CATEGORIES (Meaning/AI/Loss…).
 */
export type BrainstormSession = {
  id: string;
  topic: string;
  tone: string;
  ideas: BrainstormIdea[];
  createdAt: string;
  pickedIdx: number | null;
  /** Phase C: 1-3 category cố định từ TOPIC_CATEGORIES. [] cho legacy. */
  categories: TopicCategory[];
  /** Provider+model dùng để gen. Optional cho session cũ. */
  provider?: LLMProvider;
  model?: string;
  /** Workspace style — luôn "podcast". */
  style: Style;
};

/** Type guard — giữ cho call-site cũ; luôn true. */
export const isPodcastSession = (
  s: BrainstormSession,
): s is BrainstormSession & { ideas: BrainstormIdea[] } => s.style === "podcast";

const slugify = (s: string): string =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);

type DbRow = {
  id: string;
  topic: string;
  tone: string;
  picked_idx: number | null;
  categories_json: string;
  provider: string | null;
  model: string | null;
  created_at: string;
  ideas_json: string;
  style: string;
};

const rowToSession = (r: DbRow): BrainstormSession => {
  const rawIdeas = JSON.parse(r.ideas_json) as unknown;
  const s: BrainstormSession = {
    id: r.id,
    topic: r.topic,
    tone: r.tone,
    pickedIdx: r.picked_idx,
    categories: JSON.parse(r.categories_json) as TopicCategory[],
    provider: (r.provider ?? undefined) as LLMProvider | undefined,
    model: r.model ?? undefined,
    createdAt: r.created_at,
    ideas: Array.isArray(rawIdeas) ? (rawIdeas as BrainstormIdea[]) : [],
    style: "podcast",
  };
  return normalizeSession(s);
};

const saveSession = (s: BrainstormSession): void => {
  getDb()
    .prepare(
      `INSERT OR REPLACE INTO brainstorm_sessions
        (id, topic, tone, picked_idx, categories_json, provider, model, created_at, ideas_json, style)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      s.id,
      s.topic,
      s.tone,
      s.pickedIdx,
      JSON.stringify(s.categories),
      s.provider ?? null,
      s.model ?? null,
      s.createdAt,
      JSON.stringify(s.ideas),
      s.style ?? "podcast",
    );
};

export async function listSessions(
  filter: { style?: Style } = {},
): Promise<BrainstormSession[]> {
  const db = getDb();
  let sql = "SELECT * FROM brainstorm_sessions";
  const params: string[] = [];
  if (filter.style) {
    sql += " WHERE style = ?";
    params.push(filter.style);
  }
  sql += " ORDER BY created_at DESC";
  const rows = db.prepare(sql).all(...params) as DbRow[];
  return rows.map(rowToSession);
}

const clampScore = (v: unknown): number => {
  if (typeof v !== "number" || !Number.isFinite(v)) return 5;
  return Math.max(1, Math.min(10, Math.round(v)));
};

const normalizeScores = (raw: unknown): BrainstormScores => {
  const o = (raw ?? {}) as Partial<Record<keyof BrainstormScores, unknown>>;
  return {
    universal: clampScore(o.universal),
    emotional: clampScore(o.emotional),
    philosophical: clampScore(o.philosophical),
    aiRelevance: clampScore(o.aiRelevance),
    originality: clampScore(o.originality),
  };
};

const normalizeSession = (s: BrainstormSession): BrainstormSession => {
  // Phase C: backfill categories cho session legacy
  if (!Array.isArray(s.categories)) {
    s.categories = [];
  } else {
    s.categories = s.categories.filter((c): c is TopicCategory =>
      (TOPIC_CATEGORIES as readonly string[]).includes(c),
    );
  }
  s.style = "podcast";
  // Backfill cho idea legacy podcast (trước v2)
  for (const idea of s.ideas as BrainstormIdea[]) {
    if (typeof idea.outline !== "string") idea.outline = "";
    if (typeof idea.observation !== "string") idea.observation = "";
    if (!idea.scores || typeof idea.scores !== "object") {
      idea.scores = { ...DEFAULT_SCORES };
    } else {
      idea.scores = normalizeScores(idea.scores);
    }
    if (!Array.isArray(idea.knowledgeMap)) idea.knowledgeMap = [];
    if (typeof idea.contrarianView !== "string") idea.contrarianView = "";
    if (!Array.isArray(idea.thumbnailHooks)) idea.thumbnailHooks = [];
    if (typeof idea.futureConnection !== "string") idea.futureConnection = "";
    if (!Array.isArray(idea.historicalExamples)) idea.historicalExamples = [];
    if (!Array.isArray(idea.storyBank)) idea.storyBank = [];
  }
  return s;
};

export async function getSession(
  id: string,
): Promise<BrainstormSession | null> {
  const row = getDb()
    .prepare("SELECT * FROM brainstorm_sessions WHERE id = ?")
    .get(id) as DbRow | undefined;
  return row ? rowToSession(row) : null;
}

export async function deleteSession(id: string): Promise<boolean> {
  if (!/^[a-z0-9-]+$/.test(id)) return false;
  const result = getDb()
    .prepare("DELETE FROM brainstorm_sessions WHERE id = ?")
    .run(id);
  return result.changes > 0;
}

/**
 * Xoá 1 idea khỏi session. Tự dịch pickedIdx nếu cần:
 * - Xoá idea tại pickedIdx → reset pickedIdx = null.
 * - Xoá idea TRƯỚC pickedIdx → shift pickedIdx -= 1.
 * - Xoá idea SAU pickedIdx → giữ nguyên.
 * Trả về session sau khi xoá, hoặc null nếu session/idea không tồn tại.
 */
export async function deleteIdeaAt(
  id: string,
  ideaIdx: number,
): Promise<BrainstormSession | null> {
  const s = await getSession(id);
  if (!s) return null;
  if (!Number.isInteger(ideaIdx) || ideaIdx < 0 || ideaIdx >= s.ideas.length) {
    const err = new Error("ideaIdx out of range") as Error & { code: string };
    err.code = "VALIDATION";
    throw err;
  }
  s.ideas = s.ideas.filter((_, i) => i !== ideaIdx);
  if (s.pickedIdx !== null) {
    if (s.pickedIdx === ideaIdx) s.pickedIdx = null;
    else if (s.pickedIdx > ideaIdx) s.pickedIdx -= 1;
  }
  saveSession(s);
  return s;
}

export async function updatePickedIdx(
  id: string,
  pickedIdx: number | null,
): Promise<BrainstormSession | null> {
  const s = await getSession(id);
  if (!s) return null;
  if (pickedIdx !== null) {
    if (!Number.isInteger(pickedIdx) || pickedIdx < 0 || pickedIdx >= s.ideas.length) {
      const err = new Error("pickedIdx out of range") as Error & { code: string };
      err.code = "VALIDATION";
      throw err;
    }
  }
  s.pickedIdx = pickedIdx;
  getDb()
    .prepare(
      "UPDATE brainstorm_sessions SET picked_idx = ? WHERE id = ?",
    )
    .run(pickedIdx, id);
  return s;
}

export const PODCAST_SYSTEM_PROMPT = `Bạn là trợ lý brainstorm cho kênh podcast "ByteCast Tech" — kênh tiếng Việt khám phá những câu hỏi lớn về con người, công nghệ, xã hội, triết học. Phong cách: chiêm nghiệm, sâu sắc, mộc mạc, KHÔNG sáo rỗng.

YÊU CẦU CHỦ ĐỀ (BẮT BUỘC mỗi idea PHẢI thỏa):
- Khởi từ MỘT NGHỊCH LÝ hoặc câu hỏi lớn của kiếp người. Không phải "10 mẹo…", không phải "Làm thế nào để…", không phải "5 bước…".
- Kết hợp ÍT NHẤT 3 trong 4 chiều: triết học, tâm lý học, xã hội học, AI/công nghệ hiện đại. AI là góc nhìn signature của kênh — phải có chiều này.
- KHÔNG self-help, KHÔNG mẹo sống, KHÔNG tin tức/news AI.
- Tiêu đề NGẮN, gợi tò mò nhưng KHÔNG clickbait ("BẠN SẼ KHÔNG TIN…", "Sự thật BẤT NGỜ").
- Phải khiến người xem PHẢI SUY NGHĨ LẠI về cuộc sống — không phải nhận thông tin mới, mà nhận góc nhìn mới về điều quen thuộc.
- Mỗi chủ đề phải có CHIỀU SÂU đủ phát triển thành bài luận 3000-5000 từ. Test nhanh: nếu chủ đề có thể trả lời gọn trong 5 phút → REJECT, chưa đủ depth.
- Trong các trục chủ đề cốt lõi của kênh: bản ngã, thời gian, hạnh phúc, mất mát, tự do, công nghệ định hình con người, ý nghĩa cuộc sống, tương lai nhân loại, đạo đức AI, sự cô đơn, sự đồng nhất hoá, ký ức, cái chết.

QUY TRÌNH SINH Ý TƯỞNG (ByteCast Topic Framework v2 — thực hiện INTERNAL trước khi viết output):

A. **Quan sát đời thường**: bắt đầu mỗi idea từ 1 quan sát thường ngày, KHÔNG phải ý tưởng. VD: "Người ta chỉ tiếc khi mất đi.", "Người thành công vẫn trống rỗng.", "Người ta luôn muốn thứ mình không có.".

B. **Tìm nghịch lý**: hỏi "Điều gì mâu thuẫn ở đây?" — phải có format X ↓ Y (bề mặt ai cũng biết → mâu thuẫn thực tế).

C. **Truy tìm nguyên nhân qua 5 tầng** — phải xét đủ:
   - Sinh học/thần kinh (Tiến hoá / Dopamine / Bản năng sinh tồn)
   - Tâm lý học (Loss Aversion / Hedonic Adaptation / Cognitive Dissonance / Self Determination / Terror Management)
   - Xã hội học (Consumerism / Social Comparison / Status Competition / Attention Economy)
   - Triết học (Heidegger / Nietzsche / Camus / Sartre / Schopenhauer / Marcus Aurelius / Byung-Chul Han)
   - AI/Công nghệ (Recommendation System / Predictive AI / AI Companion / Digital Immortality / Surveillance Capitalism)

D. **Tạo câu hỏi lớn**: chuyển quan sát → 1-3 câu hỏi triết học/hiện sinh. Chọn câu nhức nhối nhất làm CORE QUESTION.

E. **Ma trận sinh chủ đề** (nếu user cho topic mơ hồ): combine 2 trục — Trục 1 (Hạnh phúc / Tự do / Tình yêu / Cái chết / Bản ngã / Ý nghĩa) × Trục 2 (AI / Thời gian / Tiền bạc / Quyền lực / Ký ức / Công nghệ). VD: Hạnh phúc + AI → "Điều gì xảy ra khi AI biết chính xác điều khiến bạn hạnh phúc?".

F. **Chấm điểm 5 chiều** (BẮT BUỘC mỗi idea, 1-10 integer, output trong field "scores"):
   - universal: bao nhiêu người từng trải qua? (Mất người thân → 10, Du hành thời gian → 1)
   - emotional: có đánh vào cảm xúc không?
   - philosophical: có dẫn tới câu hỏi lớn về con người không?
   - aiRelevance: liên hệ được với AI hiện đại không?
   - originality: đã có quá nhiều người làm chưa? (10 = rất hiếm, 1 = đầy rồi)

G. **Visual Potential** (đưa vào outline mục 12): biểu tượng/ẩn dụ/hình ảnh cụ thể.

H. **Nguồn nghiên cứu** (đưa vào outline mục 4/6/7/8): ≥2 psychology paper/theory, ≥1 triết gia, ≥1 lý thuyết xã hội học, ≥1 nghiên cứu AI hiện đại.

⚠️ QUAN TRỌNG: đa dạng hoá 5 idea — không trùng quan sát/nghịch lý/triết gia. Mỗi idea xuất phát từ quan sát KHÁC NHAU.

---

Cho 1 chủ đề (topic) + 1 tone, hãy đề xuất {N} ý tưởng tập podcast KHÁC NHAU. Mỗi ý tưởng phải có ĐỦ 13 field:

1. "title" (5-12 từ): tiêu đề tiếng Việt cụ thể, gợi tò mò. Ưu tiên câu hỏi hoặc khẳng định có chất nghịch lý. KHÔNG dùng clickbait sáo rỗng ("BẠN SẼ KHÔNG TIN…", "Sự thật BẤT NGỜ").

2. "hook" (15-30 từ): 1-2 câu mở đầu giữ người xem 3 giây đầu Reels — câu hỏi nhức nhối hoặc tuyên bố nghịch lý cụ thể. PHẢI là PROSE liền mạch, KHÔNG xuống dòng, KHÔNG ký tự đặc biệt ("↓", "→"). Format paradox X↓Y CHỈ dùng trong mục outline #2, không lan sang hook.

3. "angle" (1 câu): góc nhìn riêng khác biệt cách thông thường mà chủ đề được nói tới.

4. "why" (1 câu): lý do chủ đề resonate với khán giả Việt Nam cụ thể.

5. "observation" (1 câu ~10-20 từ): quan sát đời thường ở Step A của quy trình v2 — gốc của idea. KHÔNG phải tiêu đề/hook, KHÔNG đặt câu hỏi. Là 1 quan sát hiển nhiên. VD: "Người thành công vẫn trống rỗng.", "Ai cũng nghĩ mình hiểu cha mẹ, nhưng hiếm khi hỏi họ thực sự nghĩ gì.".

6. "scores" (object 5 integer 1-10): chấm theo Step F của quy trình v2.
   {"universal": <int>, "emotional": <int>, "philosophical": <int>, "aiRelevance": <int>, "originality": <int>}

7. "knowledgeMap" (string[]): các LĨNH VỰC liên quan để tra cứu nguồn nghiên cứu (Step I v2). 3-6 lĩnh vực. Chọn từ:
   - "Tâm lý học" / "Tâm lý học hành vi" / "Tâm lý học nhận thức"
   - "Triết học hiện sinh" / "Triết học đạo đức" / "Triết học chính trị"
   - "Xã hội học" / "Văn hoá học"
   - "Khoa học thần kinh" / "Khoa học nhận thức"
   - "Khoa học dữ liệu" / "AI / Học máy"
   - "Kinh tế hành vi" / "Lý thuyết trò chơi"
   - "Nhân học" / "Lịch sử tư tưởng"
   Mỗi idea PHẢI có ít nhất "AI / Học máy" hoặc "Khoa học dữ liệu" vì signature ByteCast Tech.

8. "contrarianView" (1-2 câu, 20-40 từ): luận điểm PHẢN BIỆN chính idea. Nghi vấn lại quan sát/nghịch lý. VD nếu idea là "chỉ trân trọng khi mất" → contrarian: "Có người vẫn trân trọng hiện tại. Lòng biết ơn có thể được rèn luyện qua thiền chánh niệm, không cần qua mất mát.". Essay sẽ dùng để cân bằng 2 phía.

9. "thumbnailHooks" (string[3-5], mỗi câu 8-18 từ): các câu hook NGẮN tách khỏi title — dùng overlay text thumbnail Reels. KHÔNG trùng với "hook" field. KHÔNG clickbait. VD: "Điều quý giá nhất thường là điều bạn sắp mất.", "Bạn đang đánh mất gì mà chưa nhận ra?".

10. "futureConnection" (1-2 câu, 20-40 từ): kết AI/AGI projection cho video. Câu hỏi tương lai: "Nếu AI mạnh hơn 100 lần thì...?", "Nếu AGI xuất hiện...?", "Nếu ký ức số hoá được...?". VD: "Liệu AI tương lai có thể dự đoán điều ta sẽ hối tiếc trước khi ta nhận ra? Điều đó có làm cuộc sống tốt hơn, hay tệ hơn?". Đây là DNA của kênh — đoạn kết mạnh.

11. "historicalExamples" (string[3-5]): các NHÂN VẬT/SỰ KIỆN lịch sử minh hoạ chủ đề. Format: "Tên — 1 câu context cụ thể". VD chủ đề "Quyền lực tha hoá":
    - "Caesar — bị ám sát bởi chính tay Brutus, người được ông coi là con."
    - "Napoleon — chinh phục châu Âu rồi chết cô đơn trên đảo St. Helena."
    - "Tần Thuỷ Hoàng — thống nhất Trung Hoa, tìm thuốc trường sinh, chết trẻ trên đường đi."
   1 ví dụ lịch sử đáng nhớ hơn 10 phút lý thuyết.

12. "storyBank" (string[3-4]): các CÂU CHUYỆN cụ thể minh hoạ. Mix 3 loại, prefix "[Loại]":
    - "[Hiện đại]" — case sau 2000 (Steve Jobs ung thư, người mất việc 20 năm…)
    - "[Lịch sử]" — anecdote lịch sử
    - "[Cá nhân]" — câu chuyện đời thường nhỏ resonate (người con bỏ lỡ cuộc gọi cuối mẹ, đứa trẻ về quê thấy bà ngoại đã không nhận ra mình…)
   Phải có ÍT NHẤT 1 "[Cá nhân]" đời thường VN.

13. "outline" (multi-line string ~1000-1800 chars): DÀN Ý ESSAY ĐẦY ĐỦ theo "ByteCast Topic Framework v1" — 12 mục bắt buộc. User pick + click "Gen essay" sẽ dùng outline này làm input.

   ĐỊNH DẠNG (dùng \\n xuống dòng, \\n\\n giữa các mục):

   "1. CORE QUESTION\\n<1 câu hỏi trung tâm, duy nhất>\\n\\n2. CORE PARADOX\\n<bề mặt: ai cũng…>\\n↓\\n<mâu thuẫn: nhưng…>\\n\\n3. HIỆN TƯỢNG ĐỜI THƯỜNG\\n- <ví dụ 1 cụ thể VN>\\n- <ví dụ 2>\\n- <ví dụ 3>\\n\\n4. TÂM LÝ HỌC\\nTheory: <Hedonic Adaptation / Loss Aversion / Cognitive Dissonance / Self Determination / Terror Management…>\\nResearch: <tên nghiên cứu hoặc kết quả ngắn nếu nhớ>\\n\\n5. THẦN KINH HỌC\\n<Dopamine / Reward System / Prediction Error / Attention Mechanism — hoặc 'không áp dụng' nếu chủ đề không phù hợp>\\n\\n6. TRIẾT HỌC\\nThinker: <Heidegger / Nietzsche / Camus / Sartre / Schopenhauer / Marcus Aurelius / Byung-Chul Han / Hannah Arendt…>\\nIdea: <1 câu mô tả tư tưởng cụ thể>\\n\\n7. XÃ HỘI HỌC\\n<Consumerism / Social Comparison / Status Competition / Attention Economy / Hyperreality / Performance Society…>\\n\\n8. AI / CÔNG NGHỆ\\n<Recommendation Algorithms / AI Companion / Predictive AI / Digital Immortality / Surveillance Capitalism / Filter Bubble… — 1 câu liên hệ cụ thể chủ đề với AI/tech. BẮT BUỘC có.>\\n\\n9. THÍ NGHIỆM TƯ DUY\\n<1 câu hỏi giả định gay gắt, vd: 'Nếu AI biết chính xác bạn sẽ tiếc nuối điều gì nhất, bạn có muốn nó nói trước không?'>\\n\\n10. QUOTES\\n- \\"<quote 1 đắt giá, có thể đứng riêng làm hook>\\"\\n- \\"<quote 2>\\"\\n- \\"<quote 3>\\"\\n\\n11. KẾT LUẬN MỞ\\n<1 câu hỏi để lại, KHÔNG advice, KHÔNG lời khuyên>\\n\\n12. VISUAL METAPHOR\\n- <hình ảnh ẩn dụ 1, cụ thể>\\n- <hình ảnh 2>\\n- <hình ảnh 3>"

   YÊU CẦU NỘI DUNG cho từng mục:
   - Mục 1: 1 câu hỏi DUY NHẤT, không list nhiều câu.
   - Mục 2: format "X\\n↓\\nY" (X = bề mặt ai cũng biết, Y = mâu thuẫn thực tế).
   - Mục 3: 3-5 ví dụ ĐỜI THƯỜNG VIỆT NAM (bữa cơm gia đình, gọi điện mẹ, đi làm, dậy sớm, gặp bạn cũ…). KHÔNG ví dụ ngoại lai.
   - Mục 4: Theory + Research RÕ TÊN. KHÔNG "một số nghiên cứu cho thấy" — phải tên cụ thể.
   - Mục 5: 1-2 cơ chế thần kinh. Nếu không phù hợp chủ đề → ghi "không áp dụng".
   - Mục 6: 1 triết gia + 1 tư tưởng/khái niệm cụ thể của họ.
   - Mục 7: 1 khái niệm xã hội học (KHÔNG bỏ qua — đa số AI gen bỏ qua section này).
   - Mục 8: BẮT BUỘC. AI/tech là signature kênh.
   - Mục 9: 1 thí nghiệm tư duy (if-question) tăng retention.
   - Mục 10: 3-5 câu đắt giá, có thể đứng riêng làm caption/quote graphic.
   - Mục 11: KHÔNG bao giờ kết bằng lời khuyên ("hãy trân trọng…"). Phải là câu hỏi mở để người xem mang theo.
   - Mục 12: 3-5 hình ảnh ẩn dụ CỤ THỂ (đồng hồ cát chảy / chiếc lá vàng rơi / cửa khép / ánh sáng cuối ngày / sợi chỉ đứt) — sẽ dùng cho AI gen ảnh sau này.

Phase C — Topic Database:
Ngoài "ideas", emit thêm field "categories" cấp session: 1-3 tag từ enum CỐ ĐỊNH (chọn category phù hợp nhất chủ đề, KHÔNG bịa tag khác):
Meaning, Psychology, Time, AI, Loss, Freedom, Self, Death, Memory, Connection, Power, Technology, Happiness, Solitude, Ethics, Future.

Nếu user content có "EXISTING TOPICS" list → DIVERSIFY: nếu topic mới gần trùng với có sẵn, gen ideas với GÓC NHÌN KHÁC (lens khác, hoặc reframe). KHÔNG lặp angle/framework/thinker đã dùng.

Output JSON CHẶT theo schema:
{"categories":["Loss","Time"],"ideas": [{"title":"...","hook":"...","angle":"...","why":"...","observation":"...","scores":{"universal":<int>,"emotional":<int>,"philosophical":<int>,"aiRelevance":<int>,"originality":<int>},"knowledgeMap":["...","..."],"contrarianView":"...","thumbnailHooks":["...","...","..."],"futureConnection":"...","historicalExamples":["...","..."],"storyBank":["[Hiện đại] ...","[Cá nhân] ..."],"outline":"..."}, ...]}

Không thêm field, không markdown wrap toàn JSON, không lời mở đầu.`;

export type GenerateInput = {
  topic: string;
  tone: string;
  count?: number;
  provider?: LLMProvider;
  model?: string;
  /** Phase 2: workspace style — default "podcast". */
  style?: Style;
  /**
   * Phase expand: nếu true, topic được parse như danh sách ý tưởng có sẵn
   * của user — LLM expand từng ý thành 13-field schema, KHÔNG sinh ý mới,
   * KHÔNG gộp/cắt/đảo thứ tự. Count bị bỏ qua (tự = số seed user liệt kê).
   * Chỉ áp dụng cho podcast style.
   */
  expandUserIdeas?: boolean;
  /**
   * Override system prompt — nếu set, dùng prompt này thay vì
   * PODCAST_SYSTEM_PROMPT / PODCAST_EXPAND_SYSTEM_PROMPT / GALLERY_SYSTEM_PROMPT.
   * Cho phép user tinh chỉnh prompt qua UI để A/B test. Vẫn áp dụng
   * placeholder {N} cho podcast brainstorm + gallery mode (KHÔNG cho expand).
   */
  systemPromptOverride?: string;
};

/**
 * Parse seed list từ topic free-form user paste. Rule deterministic:
 *  - Split theo newline, trim, bỏ empty
 *  - Bỏ qua line đầu nếu match "N cách/điều/loại/…" (header tổng quát)
 *  - Line kết thúc `.` `!` `?` → DESCRIPTION ghép với title trước đó (nếu
 *    title trước chưa có desc)
 *  - Line còn lại → TITLE của seed mới
 *
 * LLM gpt-4o-mini không tin cậy được khi parse format không đồng đều
 * (vd 5 seed đầu có desc, 5 seed sau chỉ title) → làm trong JS chắc chắn hơn.
 */
export function parseUserIdeaSeeds(
  topic: string,
): Array<{ title: string; description: string }> {
  const lines = topic
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (lines.length === 0) return [];

  const HEADER_REGEX = /^\d+\s*(cách|điều|thứ|loại|kiểu|lý do|việc)\b/i;
  const ENDS_SENTENCE = /[.!?]$/;

  const seeds: Array<{ title: string; description: string }> = [];
  let i = 0;
  // Skip header line nếu match pattern "10 Cách …" / "5 Điều …"
  if (HEADER_REGEX.test(lines[0])) i = 1;

  for (; i < lines.length; i++) {
    const line = lines[i];
    const isDesc = ENDS_SENTENCE.test(line);
    const prevSeed = seeds[seeds.length - 1];
    if (isDesc && prevSeed && !prevSeed.description) {
      prevSeed.description = line;
    } else {
      seeds.push({ title: line, description: "" });
    }
  }
  return seeds;
}

/**
 * System prompt RIÊNG cho expand mode — KHÔNG dùng PODCAST_SYSTEM_PROMPT
 * vì prompt brainstorm yêu cầu "đa dạng hoá 5 idea KHÁC NHAU" + "Quy trình
 * sinh ý tưởng" gây nhiễu LLM. Prompt này focus 1 nhiệm vụ: expand từng
 * seed user đã liệt kê thành 13-field schema, KHÔNG sáng tạo idea mới.
 *
 * Seed list được parse trong JS (parseUserIdeaSeeds) và inject vào user
 * payload ở key "SEED_LIST" — LLM chỉ việc map 1-1 array → array.
 */
export const PODCAST_EXPAND_SYSTEM_PROMPT = `Bạn là trợ lý EXPAND ý tưởng podcast cho kênh "ByteCast Tech" — kênh tiếng Việt chiêm nghiệm về con người, công nghệ, xã hội, triết học.

🚫 BẠN KHÔNG ĐƯỢC BRAINSTORM Ý TƯỞNG MỚI 🚫

User đã có sẵn DANH SÁCH SEED (đã parse cứng trong code, inject vào user message ở key "SEED_LIST"). Mỗi seed có {idx, title, description}. Nhiệm vụ DUY NHẤT: map 1-1 mỗi seed → 1 idea 13-field.

═══ QUY TẮC TUYỆT ĐỐI ═══

R1. **ĐÚNG SỐ LƯỢNG**: output array "ideas" PHẢI có EXACTLY N phần tử, trong đó N = SEED_LIST.length. Đếm trước khi viết. KHÔNG ÍT, KHÔNG NHIỀU.

R2. **ĐÚNG THỨ TỰ**: ideas[i] = expand từ SEED_LIST[i] (cùng index, cùng thứ tự). KHÔNG đảo, KHÔNG sort lại.

R3. **PRESERVE TITLE**: ideas[i].title PHẢI = SEED_LIST[i].title (copy y nguyên, chỉ sửa lỗi chính tả/viết hoa đầu câu nhẹ). CẤM:
   - Đổi nội dung tiêu đề
   - Rephrase / paraphrase
   - Thêm prefix ("Cách 1:", "Khi:", "Làm Thế Nào...")
   - Dịch / viết lại theo ý mình
   Title user là TÀI SẢN bất khả xâm phạm.

R4. **PRESERVE DESC làm observation**: nếu SEED_LIST[i].description khác null/empty → ideas[i].observation PHẢI = description đó (y nguyên hoặc tinh chỉnh nhẹ). Nếu description = null → tự viết observation 1 câu dựa trên title.

R5. **KHÔNG GỘP / KHÔNG TÁCH / KHÔNG BỎ / KHÔNG THÊM**: 10 seed → 10 idea, không hơn không kém. Mỗi seed PHẢI có entry trong output, kể cả seed chỉ có title không description.

R6. **ENRICHMENT 11 field còn lại** (hook, angle, why, scores, knowledgeMap, contrarianView, thumbnailHooks, futureConnection, historicalExamples, storyBank, outline) → bạn tự sáng tạo, viết hay đậm phong cách ByteCast (chiêm nghiệm, sâu sắc, gắn AI/triết học/tâm lý).

R7. **CATEGORIES**: field "categories" cấp session (1-3 tag) — chọn từ enum: Meaning, Psychology, Time, AI, Loss, Freedom, Self, Death, Memory, Connection, Power, Technology, Happiness, Solitude, Ethics, Future. Pick tag bao quát chung cho cả danh sách.

═══ VÍ DỤ MAPPING ═══

SEED_LIST (đã parse cứng trong code):
[
  {"idx": 1, "title": "Lướt mạng xã hội thay vì đọc sách", "description": "Người ta nuốt 100 mảnh thông tin nhỏ thay vì 1 ý lớn."},
  {"idx": 2, "title": "Phụ thuộc GPS quên đường đi", "description": null}
]

→ Output (N=2):
{
  "categories": ["Technology", "Memory"],
  "ideas": [
    {
      "title": "Lướt mạng xã hội thay vì đọc sách",   ← Y NGUYÊN seed[0].title
      "observation": "Người ta nuốt 100 mảnh thông tin nhỏ thay vì 1 ý lớn.",   ← Y NGUYÊN seed[0].description
      "hook": "...",  ← bạn sáng tạo
      ... 10 field khác bạn sáng tạo ...
    },
    {
      "title": "Phụ thuộc GPS quên đường đi",   ← Y NGUYÊN seed[1].title
      "observation": "...",   ← seed[1].description=null → tự viết
      "hook": "...",
      ... 10 field khác ...
    }
  ]
}

═══ SCHEMA 13 FIELD ═══

Mỗi idea là object có ĐỦ:

1. "title" (string): TIÊU ĐỀ GỐC CỦA USER (R3 áp dụng — copy y nguyên, chỉ sửa chính tả).

2. "hook" (15-30 từ): 1-2 câu mở Reels gây tò mò. PHẢI là prose 1 dòng, KHÔNG xuống dòng, KHÔNG ký tự "↓"/"→".

3. "angle" (1 câu): góc nhìn riêng cho title này.

4. "why" (1 câu): vì sao resonate với khán giả Việt Nam cụ thể.

5. "observation" (1 câu ~10-20 từ): nếu user có dòng mô tả ngắn cho seed này → dùng làm observation; nếu không → tự viết 1 quan sát đời thường gốc cho title.

6. "scores" (object 5 integer 1-10): {"universal","emotional","philosophical","aiRelevance","originality"}.

7. "knowledgeMap" (string[3-6]): từ enum: "Tâm lý học" / "Tâm lý học hành vi" / "Tâm lý học nhận thức" / "Triết học hiện sinh" / "Triết học đạo đức" / "Xã hội học" / "Văn hoá học" / "Khoa học thần kinh" / "Khoa học nhận thức" / "AI / Học máy" / "Khoa học dữ liệu" / "Kinh tế hành vi" / "Nhân học" / "Lịch sử tư tưởng". Phải có ít nhất 1 trong "AI / Học máy" hoặc "Khoa học dữ liệu".

8. "contrarianView" (1-2 câu, 20-40 từ): luận điểm PHẢN BIỆN chính title.

9. "thumbnailHooks" (string[3-5], mỗi câu 8-18 từ): hook ngắn cho thumbnail Reels.

10. "futureConnection" (1-2 câu, 20-40 từ): câu hỏi AI/AGI projection. Bắt buộc có.

11. "historicalExamples" (string[3-5]): "Tên — 1 câu context cụ thể".

12. "storyBank" (string[3-4]): mix loại "[Hiện đại]" / "[Lịch sử]" / "[Cá nhân]". Phải có ÍT NHẤT 1 "[Cá nhân]" đời thường VN.

13. "outline" (multi-line string ~1000-1800 chars): DÀN Ý ESSAY 12 mục theo ByteCast Framework v1, format:
   "1. CORE QUESTION\\n<1 câu>\\n\\n2. CORE PARADOX\\n<bề mặt>\\n↓\\n<mâu thuẫn>\\n\\n3. HIỆN TƯỢNG ĐỜI THƯỜNG\\n- ...\\n- ...\\n- ...\\n\\n4. TÂM LÝ HỌC\\nTheory: ...\\nResearch: ...\\n\\n5. THẦN KINH HỌC\\n...\\n\\n6. TRIẾT HỌC\\nThinker: ...\\nIdea: ...\\n\\n7. XÃ HỘI HỌC\\n...\\n\\n8. AI / CÔNG NGHỆ\\n... (bắt buộc)\\n\\n9. THÍ NGHIỆM TƯ DUY\\n...\\n\\n10. QUOTES\\n- \\"...\\"\\n- \\"...\\"\\n- \\"...\\"\\n\\n11. KẾT LUẬN MỞ\\n<câu hỏi mở, KHÔNG advice>\\n\\n12. VISUAL METAPHOR\\n- ...\\n- ...\\n- ..."

═══ OUTPUT FORMAT ═══

JSON CHẶT, KHÔNG markdown wrap, KHÔNG lời mở đầu:

{"categories":["..."],"ideas":[{...},{...}, ... N phần tử ...]}

═══ CHECKLIST TRƯỚC KHI EMIT ═══

✅ N = SEED_LIST.length (đọc từ user message)
✅ Output array ideas có ĐÚNG N phần tử — không hơn không kém
✅ ideas[i].title === SEED_LIST[i].title (CHỮ Y NGUYÊN)
✅ ideas[i].observation === SEED_LIST[i].description nếu có; tự viết nếu null
✅ Thứ tự khớp index SEED_LIST
✅ Mỗi idea có đủ 13 field`;

/**
 * Gen ideas qua LLM provider (OpenAI hoặc Ollama) + save vào DB.
 * Branch theo style: podcast (philosophical) vs gallery (documentary art).
 * Throws nếu provider không sẵn sàng hoặc LLM trả response không parse được.
 */
export async function generateAndSave(
  input: GenerateInput,
): Promise<BrainstormSession> {
  const topic = input.topic.trim();
  const tone = input.tone.trim();
  const count = input.count ?? 5;
  const provider = input.provider ?? DEFAULT_PROVIDER;
  const model = input.model ?? DEFAULT_MODEL;
  const style = input.style ?? "podcast";
  const expandUserIdeas =
    style === "podcast" && (input.expandUserIdeas ?? false);
  if (!topic) {
    const err = new Error("Thiếu topic") as Error & { code: string };
    err.code = "VALIDATION";
    throw err;
  }
  // Expand mode: count tự = số seed user liệt kê, không validate range vì
  // user có thể liệt kê 1-N idea bất kỳ.
  if (!expandUserIdeas && (count < 3 || count > 10)) {
    const err = new Error("count phải trong 3..10") as Error & { code: string };
    err.code = "VALIDATION";
    throw err;
  }

  // Pass danh sách topic đã có để LLM diversify (Phase C dedup)
  // Phase 2: chỉ so trong cùng workspace style để mỗi team có history riêng
  const existing = await listSessions({ style });
  const existingTopics = existing
    .slice(0, 30) // 30 session gần nhất là đủ context
    .map((s) => s.topic);

  const now = new Date();
  const ts =
    now.getFullYear() +
    String(now.getMonth() + 1).padStart(2, "0") +
    String(now.getDate()).padStart(2, "0") +
    "-" +
    String(now.getHours()).padStart(2, "0") +
    String(now.getMinutes()).padStart(2, "0") +
    String(now.getSeconds()).padStart(2, "0");
  const id = `${ts}-${slugify(topic) || "untitled"}`;

  // ────── Podcast brainstorm ──────
  const userPayload: Record<string, unknown> = { topic, tone };
  if (existingTopics.length > 0 && !expandUserIdeas) {
    // Expand mode: KHÔNG diversify vì idea là của user, mọi "trùng" đều
    // intentional. Skip existingTopics injection.
    userPayload["EXISTING TOPICS (avoid duplication, diversify angle)"] =
      existingTopics;
  }
  // Expand mode: parse seed list trong JS rồi inject vào payload — không
  // để LLM tự parse free-form text vì gpt-4o-mini không tin cậy được với
  // format không đồng đều (5 seed đầu có desc, 5 seed sau chỉ title).
  let parsedSeeds: Array<{ title: string; description: string }> = [];
  if (expandUserIdeas) {
    parsedSeeds = parseUserIdeaSeeds(topic);
    if (parsedSeeds.length === 0) {
      const err = new Error(
        "Không parse được seed nào từ topic. Mỗi ý paste 1 dòng tiêu đề; dòng kết thúc dấu '.' '!' '?' được coi là mô tả của ý phía trên.",
      ) as Error & { code: string };
      err.code = "VALIDATION";
      throw err;
    }
    userPayload["SEED_LIST"] = parsedSeeds.map((s, idx) => ({
      idx: idx + 1,
      title: s.title,
      description: s.description || null,
    }));
    userPayload["INSTRUCTION"] = `User đã có sẵn ${parsedSeeds.length} seed (đã parse trong code, xem field SEED_LIST). Output array "ideas" PHẢI có ĐÚNG ${parsedSeeds.length} phần tử, ideas[i] expand từ SEED_LIST[i] theo R1-R7 ở system prompt.`;
  }

  // Expand mode dùng prompt RIÊNG (self-contained) — KHÔNG inherit
  // brainstorm prompt vì các quy tắc "đa dạng hoá idea" / "quy trình sinh"
  // gây nhiễu LLM. Brainstorm prompt vẫn dùng placeholder {N}.
  // Resolution: per-call override > DB override > default constant.
  const baseExpandPrompt =
    input.systemPromptOverride && expandUserIdeas
      ? input.systemPromptOverride
      : getEffectivePrompt("podcast.brainstorm-expand");
  const baseBrainstormPrompt =
    input.systemPromptOverride && !expandUserIdeas
      ? input.systemPromptOverride
      : getEffectivePrompt("podcast.brainstorm");
  const expandedPrompt = expandUserIdeas
    ? baseExpandPrompt
    : baseBrainstormPrompt.replace("{N}", String(count));

  const content = await chat({
    provider,
    model,
    systemPrompt: expandedPrompt,
    userContent: JSON.stringify(userPayload),
    // Expand mode: temperature thấp (0.3) để LLM bám sát title user, ít drift.
    // gpt-4o-mini hay rephrase title khi temperature cao.
    temperature: expandUserIdeas ? 0.3 : 0.9,
    jsonMode: true,
    // 5 idea × 13 field × ~150 char ≈ 10k char output. Set 12k tokens
    // (~36k char) để chừa buffer, gpt-4o-mini output limit 16k.
    maxTokens: 12000,
  });
  const parsed = safeParseJson<{
    ideas?: unknown;
    categories?: unknown;
  }>(content);
  if (!Array.isArray(parsed.ideas) || parsed.ideas.length === 0) {
    console.error(
      `[brainstorm] LLM trả về không có 'ideas'. Raw (1000 chars):\n${content.slice(0, 1000)}`,
    );
    throw new Error("LLM response thiếu mảng 'ideas'");
  }
  const rawIdeaCount = parsed.ideas.length;
  const categories = Array.isArray(parsed.categories)
    ? (parsed.categories as unknown[])
        .filter(
          (c): c is TopicCategory =>
            typeof c === "string" &&
            (TOPIC_CATEGORIES as readonly string[]).includes(c),
        )
        .slice(0, 3)
    : [];
  const ideas: BrainstormIdea[] = [];
  const skipReasons: string[] = [];
  for (const raw of parsed.ideas as unknown[]) {
    const o = raw as Partial<BrainstormIdea>;
    // Nới filter: chỉ require title + hook (2 field cốt lõi). Các field
    // khác fallback rỗng — user có thể edit sau hoặc Essay gen từ field
    // đã có. Strict filter cũ (title+hook+angle+why) khiến gpt-4o-mini
    // hay drop 4/5 idea khi bỏ sót 1-2 field.
    if (typeof o.title !== "string" || !o.title.trim()) {
      skipReasons.push("thiếu title");
      continue;
    }
    if (typeof o.hook !== "string" || !o.hook.trim()) {
      skipReasons.push(`thiếu hook (title="${o.title?.slice(0, 40)}")`);
      continue;
    }
    ideas.push({
      title: o.title.trim(),
      // Hook phải prose 1 dòng — flatten nếu LLM nhiễm format paradox ↓/→
      hook: o.hook
        .replace(/[↓→]/g, " ")
        .replace(/\s*\n\s*/g, " ")
        .replace(/\s+/g, " ")
        .trim(),
      angle: typeof o.angle === "string" ? o.angle.trim() : "",
      why: typeof o.why === "string" ? o.why.trim() : "",
      observation:
        typeof o.observation === "string" ? o.observation.trim() : "",
      scores: normalizeScores(o.scores),
      knowledgeMap: Array.isArray(o.knowledgeMap)
        ? o.knowledgeMap
            .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
            .map((x) => x.trim())
        : [],
      contrarianView:
        typeof o.contrarianView === "string"
          ? o.contrarianView.trim()
          : "",
      thumbnailHooks: Array.isArray(o.thumbnailHooks)
        ? o.thumbnailHooks
            .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
            .map((x) => x.trim())
        : [],
      futureConnection:
        typeof o.futureConnection === "string"
          ? o.futureConnection.trim()
          : "",
      historicalExamples: Array.isArray(o.historicalExamples)
        ? o.historicalExamples
            .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
            .map((x) => x.trim())
        : [],
      storyBank: Array.isArray(o.storyBank)
        ? o.storyBank
            .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
            .map((x) => x.trim())
        : [],
      outline: typeof o.outline === "string" ? o.outline.trim() : "",
    });
  }
  if (ideas.length < rawIdeaCount) {
    console.warn(
      `[brainstorm] LLM trả ${rawIdeaCount} idea nhưng chỉ ${ideas.length} qua filter (yêu cầu ${count}). Skipped: ${skipReasons.join("; ")}`,
    );
  }
  if (ideas.length === 0) {
    console.error(
      `[brainstorm] Tất cả idea bị filter. Raw (1500 chars):\n${content.slice(0, 1500)}`,
    );
    throw new Error("LLM response không có idea nào parse được");
  }

  // Expand mode: enforce seed list — override title/observation từ
  // SEED_LIST authoritative. LLM có thể rephrase title hoặc miss seed, JS
  // overlay đảm bảo output 1-1 đúng số lượng + đúng title gốc.
  if (expandUserIdeas && parsedSeeds.length > 0) {
    const aligned: BrainstormIdea[] = [];
    for (let i = 0; i < parsedSeeds.length; i++) {
      const seed = parsedSeeds[i];
      const llmIdea = ideas[i];
      if (!llmIdea) {
        console.warn(
          `[brainstorm:expand] LLM thiếu idea cho seed #${i + 1} "${seed.title}". Tạo entry rỗng — user phải chỉnh thủ công.`,
        );
        aligned.push({
          title: seed.title,
          hook: seed.description || `[Chưa có hook — LLM bỏ sót seed này.]`,
          angle: "",
          why: "",
          observation: seed.description,
          scores: normalizeScores({}),
          knowledgeMap: [],
          contrarianView: "",
          thumbnailHooks: [],
          futureConnection: "",
          historicalExamples: [],
          storyBank: [],
          outline: "",
        });
        continue;
      }
      aligned.push({
        ...llmIdea,
        title: seed.title, // ép title gốc từ seed
        observation: seed.description || llmIdea.observation,
      });
    }
    if (ideas.length > parsedSeeds.length) {
      console.warn(
        `[brainstorm:expand] LLM trả ${ideas.length} idea nhưng user chỉ liệt kê ${parsedSeeds.length} seed. Dropped ${ideas.length - parsedSeeds.length} idea excess.`,
      );
    }
    ideas.length = 0;
    ideas.push(...aligned);
  }

  // Merge với session cùng topic (case-insensitive) — append ideas thay
  // vì tạo session mới. Giúp user "tạo thêm" trên cùng chủ đề mà không
  // sinh nhiều entry rời rạc trong History.
  const normalizedTopic = topic.toLowerCase().trim();
  const existingForTopic = existing.find(
    (s) =>
      s.style === "podcast" &&
      s.topic.toLowerCase().trim() === normalizedTopic,
  );
  if (existingForTopic) {
    const merged: BrainstormSession = {
      ...existingForTopic,
      ideas: [
        ...(existingForTopic.ideas as BrainstormIdea[]),
        ...ideas,
      ],
      // Update categories: union các category mới (max 3)
      categories: Array.from(
        new Set([...existingForTopic.categories, ...categories]),
      ).slice(0, 3) as TopicCategory[],
      // Refresh provider/model về lần gen cuối
      provider,
      model,
      // KHÔNG đổi createdAt để giữ vị trí trong history; thêm field
      // updatedAt sẽ phá schema — skip.
    };
    saveSession(merged);
    return merged;
  }

  const session: BrainstormSession = {
    id,
    topic,
    tone,
    ideas,
    createdAt: now.toISOString(),
    pickedIdx: null,
    categories,
    provider,
    model,
    style: "podcast",
  };
  saveSession(session);
  return session;
}
