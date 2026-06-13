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
    provider,
    model,
  };
  await ensureDir();
  await fs.writeFile(filePath(id), JSON.stringify(session, null, 2));
  return session;
}
