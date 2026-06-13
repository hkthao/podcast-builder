/**
 * Brainstorm session store — JSON file per session ở `brainstorm/<id>.json`.
 * Mỗi session = 1 lần user click Generate, lưu lại topic/tone + 5 ý tưởng
 * + index user pick. KHÔNG cache binary (consistent với Reference Library).
 *
 * Idea schema cố tình tổng quát (title/hook/angle/why) để dùng cho cả
 * Vietnamese ByteCast Tech lẫn các kênh khác sau này.
 */
import path from "node:path";
import fs from "node:fs/promises";
import { chat, type LLMProvider } from "./llm-providers";

const BRAINSTORM_DIR = path.resolve("brainstorm");
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

export type BrainstormSession = {
  id: string;
  topic: string;
  tone: string;
  ideas: BrainstormIdea[];
  createdAt: string;
  pickedIdx: number | null;
  /** Provider+model dùng để gen. Optional cho session cũ. */
  provider?: LLMProvider;
  model?: string;
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

const ensureDir = async () => {
  await fs.mkdir(BRAINSTORM_DIR, { recursive: true });
};

const filePath = (id: string): string =>
  path.join(BRAINSTORM_DIR, `${id}.json`);

export async function listSessions(): Promise<BrainstormSession[]> {
  await ensureDir();
  let entries: string[];
  try {
    entries = await fs.readdir(BRAINSTORM_DIR);
  } catch {
    return [];
  }
  const ids = entries
    .filter((f) => f.endsWith(".json") && !f.startsWith("."))
    .map((f) => f.replace(/\.json$/, ""));
  const sessions = await Promise.all(
    ids.map(async (id) => {
      try {
        const buf = await fs.readFile(filePath(id), "utf-8");
        return normalizeSession(JSON.parse(buf) as BrainstormSession);
      } catch {
        return null;
      }
    }),
  );
  return sessions
    .filter((s): s is BrainstormSession => s !== null)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
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
  // Backfill cho idea legacy (trước v2)
  for (const idea of s.ideas) {
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
  try {
    const buf = await fs.readFile(filePath(id), "utf-8");
    return normalizeSession(JSON.parse(buf) as BrainstormSession);
  } catch {
    return null;
  }
}

export async function deleteSession(id: string): Promise<boolean> {
  // Whitelist: id phải khớp với pattern slug-only (no path chars)
  if (!/^[a-z0-9-]+$/.test(id)) return false;
  try {
    await fs.unlink(filePath(id));
    return true;
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    if (err.code === "ENOENT") return false;
    throw e;
  }
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
  await fs.writeFile(filePath(s.id), JSON.stringify(s, null, 2));
  return s;
}

const SYSTEM_PROMPT = `Bạn là trợ lý brainstorm cho kênh podcast "ByteCast Tech" — kênh tiếng Việt khám phá những câu hỏi lớn về con người, công nghệ, xã hội, triết học. Phong cách: chiêm nghiệm, sâu sắc, mộc mạc, KHÔNG sáo rỗng.

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

Output JSON CHẶT theo schema:
{"ideas": [{"title":"...","hook":"...","angle":"...","why":"...","observation":"...","scores":{"universal":<int>,"emotional":<int>,"philosophical":<int>,"aiRelevance":<int>,"originality":<int>},"knowledgeMap":["...","..."],"contrarianView":"...","thumbnailHooks":["...","...","..."],"futureConnection":"...","historicalExamples":["...","..."],"storyBank":["[Hiện đại] ...","[Cá nhân] ..."],"outline":"..."}, ...]}

Không thêm field, không markdown wrap toàn JSON, không lời mở đầu.`;

export type GenerateInput = {
  topic: string;
  tone: string;
  count?: number;
  provider?: LLMProvider;
  model?: string;
};

/**
 * Gen ideas qua LLM provider (OpenAI hoặc Ollama) + save `brainstorm/<id>.json`.
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
  if (!topic) {
    const err = new Error("Thiếu topic") as Error & { code: string };
    err.code = "VALIDATION";
    throw err;
  }
  if (count < 3 || count > 10) {
    const err = new Error("count phải trong 3..10") as Error & { code: string };
    err.code = "VALIDATION";
    throw err;
  }

  const content = await chat({
    provider,
    model,
    systemPrompt: SYSTEM_PROMPT.replace("{N}", String(count)),
    userContent: JSON.stringify({ topic, tone }),
    temperature: 0.9,
    jsonMode: true,
  });
  const parsed = JSON.parse(content) as { ideas?: unknown };
  if (!Array.isArray(parsed.ideas) || parsed.ideas.length === 0) {
    throw new Error("LLM response thiếu mảng 'ideas'");
  }
  const ideas: BrainstormIdea[] = [];
  for (const raw of parsed.ideas as unknown[]) {
    const o = raw as Partial<BrainstormIdea>;
    if (
      typeof o.title !== "string" ||
      typeof o.hook !== "string" ||
      typeof o.angle !== "string" ||
      typeof o.why !== "string"
    ) {
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
      angle: o.angle.trim(),
      why: o.why.trim(),
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
  if (ideas.length === 0) {
    throw new Error("LLM response không có idea nào parse được");
  }

  // Stable timestamp-based id để sort dễ, kèm slug topic
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

  const session: BrainstormSession = {
    id,
    topic,
    tone,
    ideas,
    createdAt: now.toISOString(),
    pickedIdx: null,
    provider,
    model,
  };
  await ensureDir();
  await fs.writeFile(filePath(id), JSON.stringify(session, null, 2));
  return session;
}
