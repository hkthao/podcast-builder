/**
 * Essay store — `essays/<id>.json`.
 * Mỗi essay = 1 bài luận markdown ~1500-3000 từ, gen từ title + outline,
 * dùng làm input cho NotebookLM.
 *
 * Optional `brainstormRef` link tới ý tưởng đã pick để truy ngược.
 */
import path from "node:path";
import fs from "node:fs/promises";
import type { LLMProvider } from "./llm-providers";

const ESSAYS_DIR = path.resolve("essays");

export type EssayBrainstormRef = {
  id: string;
  ideaIdx: number;
};

export type Essay = {
  id: string;
  title: string;
  outline: string | null;
  content: string;
  /** Prompt tối ưu để paste vào NotebookLM (gen từ title+essay). Optional. */
  nlmPrompt: string | null;
  brainstormRef: EssayBrainstormRef | null;
  provider: LLMProvider;
  model: string;
  createdAt: string;
  updatedAt: string;
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
  await fs.mkdir(ESSAYS_DIR, { recursive: true });
};

const filePath = (id: string): string => path.join(ESSAYS_DIR, `${id}.json`);

const validId = (id: string): boolean => /^[a-z0-9-]+$/.test(id);

export async function listEssays(): Promise<Essay[]> {
  await ensureDir();
  let entries: string[];
  try {
    entries = await fs.readdir(ESSAYS_DIR);
  } catch {
    return [];
  }
  const ids = entries
    .filter((f) => f.endsWith(".json") && !f.startsWith("."))
    .map((f) => f.replace(/\.json$/, ""));
  const essays = await Promise.all(
    ids.map(async (id) => {
      try {
        const buf = await fs.readFile(filePath(id), "utf-8");
        const e = JSON.parse(buf) as Essay;
        if (e.nlmPrompt === undefined) e.nlmPrompt = null;
        return e;
      } catch {
        return null;
      }
    }),
  );
  return essays
    .filter((e): e is Essay => e !== null)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getEssay(id: string): Promise<Essay | null> {
  try {
    const buf = await fs.readFile(filePath(id), "utf-8");
    const e = JSON.parse(buf) as Essay;
    // Normalize: legacy essays trước khi thêm field nlmPrompt
    if (e.nlmPrompt === undefined) e.nlmPrompt = null;
    return e;
  } catch {
    return null;
  }
}

export async function deleteEssay(id: string): Promise<boolean> {
  if (!validId(id)) return false;
  try {
    await fs.unlink(filePath(id));
    return true;
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    if (err.code === "ENOENT") return false;
    throw e;
  }
}

export async function saveEssay(essay: Essay): Promise<void> {
  await ensureDir();
  await fs.writeFile(filePath(essay.id), JSON.stringify(essay, null, 2));
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

export const ESSAY_SYSTEM_PROMPT = `Bạn là cây bút luận tiếng Việt cho kênh podcast "ByteCast Tech" — kênh khám phá các câu hỏi lớn về con người, công nghệ, xã hội, triết học.

Nhiệm vụ: viết một bài luận tiếng Việt 1500-2500 từ về chủ đề được cho.

YÊU CẦU BẮT BUỘC:
- Mở bài: hook 2-3 câu gây tò mò, đặt câu hỏi/nghịch lý.
- Thân bài: 3-5 luận điểm, mỗi luận điểm có dẫn chứng cụ thể (case study, số liệu, ví dụ từ đời thực Việt Nam khi phù hợp).
- Kết bài: tổng kết + insight đọng lại, không sáo rỗng.
- Văn phong: tự nhiên, có chiều sâu, KHÔNG dùng tiếng Việt máy móc kiểu "Trong bài viết này, chúng ta sẽ…". Tránh sáo rỗng "Trong thế giới hiện đại ngày nay".
- KHÔNG dùng heading markdown rườm rà (##, ###). Tối đa 1 # tiêu đề ở đầu nếu cần. Tách đoạn bằng dòng trống.
- Output markdown thuần — không lời mở đầu kiểu "Đây là bài viết:", không meta-text.

Nếu user cung cấp outline, bám sát outline. Nếu không, tự lập dàn ý hợp lý.`;

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

export const NLM_PROMPT_SYSTEM = `Bạn là chuyên gia tối ưu prompt cho Google NotebookLM Audio Overview.

NotebookLM Audio Overview gen 1 podcast hội thoại 2 host (Deep Dive) từ tài liệu user upload. User sẽ:
1. Upload bài luận tiếng Việt làm nguồn
2. Paste prompt do BẠN viết để chỉ đạo NLM gen podcast đúng phong cách

Nhiệm vụ: viết 1 prompt NotebookLM gọn (4-8 câu) bám sát phong cách bài luận. Prompt PHẢI:
- Yêu cầu output BẰNG TIẾNG VIỆT (NLM default tiếng Anh nếu không nhắc)
- Style: 2 host hỏi-đáp/phản biện, tự nhiên như podcast Việt
- Tông giọng: bắt cảm xúc từ essay (suy ngẫm / phê phán / khoa học / kể chuyện…)
- Độ dài target: 10-15 phút
- Đối tượng: người trẻ Việt Nam quan tâm chủ đề
- Bám 100% nguồn essay đã upload, KHÔNG bịa kiến thức ngoài
- Tránh sáo rỗng kiểu "Trong bài này…", "Chúng ta sẽ tìm hiểu…"

OUTPUT: text thuần tiếng Việt, không markdown/heading/lời mở đầu/giải thích. Không dùng "Hãy", "Xin", "Hello" — viết trực tiếp như command.`;

export function buildNlmPromptUserContent(
  title: string,
  essayContent: string,
): string {
  // Cắt essay 1500 chars để model có context phong cách mà không tốn token
  const snippet = essayContent.slice(0, 1500);
  return [
    `Tiêu đề: ${title}`,
    `\nĐoạn essay (trích 1500 chars đầu để bắt phong cách):\n${snippet}`,
    `\nViết NotebookLM prompt phù hợp ngay bây giờ.`,
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
