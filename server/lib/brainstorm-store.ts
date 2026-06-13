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

export type BrainstormIdea = {
  title: string;
  hook: string;
  angle: string;
  why: string;
  /**
   * Dàn ý đầy đủ cho bài essay nếu user pick idea này — 5-7 section.
   * Mỗi section 1 header + 1-2 câu mô tả + framework/thinker cụ thể.
   * Format markdown plain, không ## prefix.
   */
  outline: string;
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

const normalizeSession = (s: BrainstormSession): BrainstormSession => {
  // Legacy idea trước khi thêm field outline
  for (const idea of s.ideas) {
    if (typeof idea.outline !== "string") idea.outline = "";
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

Cho 1 chủ đề (topic) + 1 tone, hãy đề xuất {N} ý tưởng tập podcast KHÁC NHAU. Mỗi ý tưởng phải có ĐỦ 5 field:

1. "title" (5-12 từ): tiêu đề tiếng Việt cụ thể, gợi tò mò. Ưu tiên câu hỏi hoặc khẳng định có chất nghịch lý. KHÔNG dùng clickbait sáo rỗng ("BẠN SẼ KHÔNG TIN…", "Sự thật BẤT NGỜ").

2. "hook" (15-30 từ): 1-2 câu mở đầu giữ người xem 3 giây đầu Reels — câu hỏi nhức nhối hoặc tuyên bố nghịch lý cụ thể. PHẢI là PROSE liền mạch, KHÔNG xuống dòng, KHÔNG ký tự đặc biệt ("↓", "→"). Format paradox X↓Y CHỈ dùng trong mục outline #2, không lan sang hook.

3. "angle" (1 câu): góc nhìn riêng khác biệt cách thông thường mà chủ đề được nói tới.

4. "why" (1 câu): lý do chủ đề resonate với khán giả Việt Nam cụ thể.

5. "outline" (multi-line string ~1000-1800 chars): DÀN Ý ESSAY ĐẦY ĐỦ theo "ByteCast Topic Framework v1" — 12 mục bắt buộc. User pick + click "Gen essay" sẽ dùng outline này làm input.

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

Output JSON CHẶT theo schema: {"ideas": [{"title":"...","hook":"...","angle":"...","why":"...","outline":"..."}, ...]}. Không thêm field, không markdown wrap toàn JSON, không lời mở đầu.`;

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
