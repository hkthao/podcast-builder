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

User uploads a Vietnamese essay as source, then pastes YOUR prompt to direct NotebookLM's output style.

Write a prompt in ENGLISH (NLM responds more precisely to English directives) instructing NLM to generate a Vietnamese audio podcast. The prompt MUST follow this exact structure:

---

Create a long-form, deeply reflective, and {ADJECTIVES_FROM_ESSAY} podcast discussion in Vietnamese based ON THE PROVIDED SOURCES. The two hosts must engage in an intimate, intellectual journey exploring {CORE_THEME}, avoiding any motivational clichés or lecture-like tone.

Topic: "{ESSAY_TITLE}" ({ENGLISH_SUBTITLE_CAPTURING_DEEPER_QUESTION}).

Host Dynamics & Emotional Resonance:
- Host A (The {LENS_A_NAME} Lens): {ONE_SENTENCE_DESCRIBING_HOST_A_FOCUS — pick a lens that matches essay content: psychological/tech, scientific/data, historical, sociological, economic, etc.}
- Host B (The {LENS_B_NAME} Lens): {ONE_SENTENCE_DESCRIBING_HOST_B_FOCUS — pick a complementary lens: existential/philosophical, ethical/spiritual, poetic/personal, etc.}
- The tone must be {2-3 ADJECTIVES}. The hosts should challenge each other's assumptions gently but deeply, allowing moments of silence or contemplative pacing.

The Narrative Arc (Structured in {3 OR 4} Movements):

1. {MOVEMENT_1_TITLE}:
{2-4 sentences setting up the opening question/paradox, what each host argues, key concepts/examples from essay}

2. {MOVEMENT_2_TITLE}:
{2-4 sentences with explicit framework name if essay mentions one (Heidegger, Stoicism, etc.) or concrete case from essay. Specify what each host argues.}

3. {MOVEMENT_3_TITLE}:
{2-4 sentences continuing tension/exploration. If essay has tech/AI/modern angle, weave it here.}

[Optional 4. {MOVEMENT_4_TITLE}:
{2-4 sentences — thought experiments, applied implications, or counter-arguments.}]

Ending:
Conclude with a {ADJECTIVE} and memorable reflection: {1-SENTENCE_KEY_INSIGHT_FROM_ESSAY}. Leave the listeners with the final question: {1_OPEN_QUESTION}?

Tone & Language:
- Language: The entire spoken discussion must be in Vietnamese ({3-5 Vietnamese adjectives describing register, e.g., sâu sắc, mộc mạc, đậm chất chiêm nghiệm, không sáo rỗng}).
- Prioritize insight and emotional depth over information density.

---

RULES:
- Fill EVERY {PLACEHOLDER} with concrete content drawn from the essay. Do NOT leave any placeholder unfilled.
- Pick movement titles that map directly to essay's actual argument structure, not generic ones.
- Host lens names must reflect the essay's domain (e.g., "Neuroscience" + "Phenomenology" cho essay về consciousness; "Behavioral Economics" + "Confucian Ethics" cho essay về tiêu dùng).
- Include at least 1 specific concept/framework/thinker NAME from the essay in a movement.
- Final question must be open-ended Vietnamese, not yes/no.
- Output: the FILLED prompt only, in English (except the Vietnamese title trong quotes + final Vietnamese adjective list). No markdown headers, no preamble like "Here is the prompt:", no closing notes.`;

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
