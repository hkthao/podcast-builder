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
import OpenAI from "openai";

const BRAINSTORM_DIR = path.resolve("brainstorm");
const MODEL = process.env.BRAINSTORM_MODEL ?? "gpt-4o-mini";

export type BrainstormIdea = {
  title: string;
  hook: string;
  angle: string;
  why: string;
};

export type BrainstormSession = {
  id: string;
  topic: string;
  tone: string;
  ideas: BrainstormIdea[];
  createdAt: string;
  pickedIdx: number | null;
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
        return JSON.parse(buf) as BrainstormSession;
      } catch {
        return null;
      }
    }),
  );
  return sessions
    .filter((s): s is BrainstormSession => s !== null)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getSession(
  id: string,
): Promise<BrainstormSession | null> {
  try {
    const buf = await fs.readFile(filePath(id), "utf-8");
    return JSON.parse(buf) as BrainstormSession;
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

const SYSTEM_PROMPT = `Bạn là trợ lý brainstorm cho kênh podcast "ByteCast Tech" — kênh tiếng Việt khám phá những câu hỏi lớn về con người, công nghệ, xã hội, triết học.

Cho 1 chủ đề (topic) + 1 tone (giọng điệu), hãy đề xuất {N} ý tưởng tập podcast KHÁC NHAU. Mỗi ý tưởng phải có:
- "title": tiêu đề tiếng Việt cụ thể, gợi tò mò, 5-12 từ. KHÔNG dùng clickbait sáo rỗng ("BẠN SẼ KHÔNG TIN…"). Ưu tiên câu hỏi/khẳng định có chất.
- "hook": 1-2 câu mở đầu (15-30 từ) thiết kế để giữ người xem trong 3 giây đầu Reels — đặt 1 câu hỏi nhức nhối hoặc tuyên bố nghịch lý.
- "angle": góc nhìn riêng của ý tưởng này, khác biệt với cách thông thường mà chủ đề được nói tới.
- "why": lý do ngắn (1 câu) tại sao chủ đề này resonate với khán giả Việt Nam cụ thể.

Output JSON CHẶT theo schema: {"ideas": [{"title":"...","hook":"...","angle":"...","why":"..."}, ...]}. Không thêm field, không markdown, không lời mở đầu.`;

export type GenerateInput = {
  topic: string;
  tone: string;
  count?: number;
};

/**
 * Gen ideas qua OpenAI + save vào `brainstorm/<id>.json`.
 * Throws nếu OPENAI_API_KEY missing hoặc LLM trả response không parse được.
 */
export async function generateAndSave(
  input: GenerateInput,
): Promise<BrainstormSession> {
  if (!process.env.OPENAI_API_KEY) {
    const err = new Error("Thiếu OPENAI_API_KEY trong .env") as Error & { code: string };
    err.code = "VALIDATION";
    throw err;
  }
  const topic = input.topic.trim();
  const tone = input.tone.trim();
  const count = input.count ?? 5;
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

  const openai = new OpenAI();
  const response = await openai.chat.completions.create({
    model: MODEL,
    temperature: 0.9,
    messages: [
      { role: "system", content: SYSTEM_PROMPT.replace("{N}", String(count)) },
      { role: "user", content: JSON.stringify({ topic, tone }) },
    ],
    response_format: { type: "json_object" },
  });
  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error("LLM trả về empty response");
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
      hook: o.hook.trim(),
      angle: o.angle.trim(),
      why: o.why.trim(),
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
  };
  await ensureDir();
  await fs.writeFile(filePath(id), JSON.stringify(session, null, 2));
  return session;
}
