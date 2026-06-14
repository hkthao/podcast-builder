/**
 * Podcast script store — Phase script gen + audio gen cho podcast 2 host.
 *
 * Mục tiêu: tái tạo style NotebookLM Audio Overview (2 host trò chuyện tự
 * nhiên) bằng tiếng Việt. Pipeline:
 *
 *   [Essay + Brainstorm idea + Extra notes]
 *     ↓ LLM (gpt-4o / ollama, JSON mode, temperature 0.75)
 *   [PodcastScript: {turns: [{speaker, text}]}]
 *     ↓ TTS per-turn (2 voice, audio tags inline)
 *   [input/{slug}.aac]  ← override audio, feed vào make.ts pipeline cũ
 *
 * Script lưu sidecar JSON `input/{slug}.script.json` cạnh `{slug}.json` config.
 * Tách khỏi EpisodeConfig vì script có thể lớn (>10KB) và không cần load mỗi
 * lần listEpisodes().
 */
import fs from "node:fs/promises";
import path from "node:path";
import { PATHS } from "../../../shared/studio-core/paths";
import { chat, type LLMProvider } from "../../../shared/studio-core/llm-providers";
import { safeParseJson } from "../../../shared/lib/safe-json";
import { getEssay } from "./essay-store";
import { getSession as getBrainstormSession } from "./brainstorm-store";
import type { BrainstormIdea } from "./brainstorm-store";

const { INPUT_DIR } = PATHS;

export type Speaker = "host_nam" | "host_nu";

export type ScriptTurn = {
  speaker: Speaker;
  /**
   * Lời thoại tiếng Việt văn nói. Có thể chèn audio tags inline để TTS render
   * biểu cảm: [laughs], [sighs], [whispers], v.v. Gemini AI Studio hiểu
   * bracketed prefix là director's note, không đọc thành tiếng.
   */
  text: string;
};

export type ScriptSource = {
  essayId: string | null;
  brainstormRef: { id: string; ideaIdx: number } | null;
  /** User paste tài liệu bổ sung (PDF excerpt, link summary…) trước khi gen. */
  extraNotes: string;
};

export type PodcastScript = {
  /** Tên episode (slug) — match `input/{slug}.json`. */
  episodeName: string;
  turns: ScriptTurn[];
  source: ScriptSource;
  provider: LLMProvider | null;
  model: string | null;
  /** ISO timestamp lần gen LLM cuối. null = chưa gen, mới create rỗng. */
  generatedAt: string | null;
  /** ISO timestamp lần sửa cuối (gen hoặc user edit). */
  updatedAt: string;
};

const scriptPath = (episodeName: string): string =>
  path.join(INPUT_DIR, `${episodeName}.script.json`);

/**
 * Load script — null nếu chưa có. KHÔNG auto-create empty để phân biệt
 * "chưa gen lần nào" với "đã reset về rỗng".
 */
export async function loadScript(
  episodeName: string,
): Promise<PodcastScript | null> {
  try {
    const raw = await fs.readFile(scriptPath(episodeName), "utf-8");
    return JSON.parse(raw) as PodcastScript;
  } catch {
    return null;
  }
}

const validateTurn = (raw: unknown): ScriptTurn | null => {
  if (typeof raw !== "object" || raw === null) return null;
  const t = raw as { speaker?: unknown; text?: unknown };
  // Accept cả "host_nam"/"host_nu" và "host"/"cohost" (LLM hay nhầm)
  const speakerRaw = typeof t.speaker === "string" ? t.speaker.toLowerCase() : "";
  let speaker: Speaker | null = null;
  if (speakerRaw === "host_nam" || speakerRaw === "host" || speakerRaw === "nam") {
    speaker = "host_nam";
  } else if (
    speakerRaw === "host_nu" ||
    speakerRaw === "cohost" ||
    speakerRaw === "nu" ||
    speakerRaw === "co_host"
  ) {
    speaker = "host_nu";
  }
  if (!speaker) return null;
  if (typeof t.text !== "string" || !t.text.trim()) return null;
  return { speaker, text: t.text.trim() };
};

export async function saveScript(
  episodeName: string,
  patch: {
    turns?: ScriptTurn[];
    source?: ScriptSource;
    provider?: LLMProvider;
    model?: string;
    bumpGeneratedAt?: boolean;
  },
): Promise<PodcastScript> {
  const existing = (await loadScript(episodeName)) ?? {
    episodeName,
    turns: [],
    source: { essayId: null, brainstormRef: null, extraNotes: "" },
    provider: null,
    model: null,
    generatedAt: null,
    updatedAt: new Date().toISOString(),
  };
  const now = new Date().toISOString();
  const next: PodcastScript = {
    ...existing,
    turns:
      patch.turns !== undefined
        ? patch.turns
            .map(validateTurn)
            .filter((t): t is ScriptTurn => t !== null)
        : existing.turns,
    source: patch.source ?? existing.source,
    provider: patch.provider ?? existing.provider,
    model: patch.model ?? existing.model,
    generatedAt: patch.bumpGeneratedAt ? now : existing.generatedAt,
    updatedAt: now,
  };
  await fs.mkdir(INPUT_DIR, { recursive: true });
  await fs.writeFile(scriptPath(episodeName), JSON.stringify(next, null, 2));
  return next;
}

export async function deleteScript(episodeName: string): Promise<boolean> {
  try {
    await fs.unlink(scriptPath(episodeName));
    return true;
  } catch {
    return false;
  }
}

// ────── LLM gen ──────

const SCRIPT_SYSTEM_PROMPT = `Bạn là Gemini Podcast Studio Vietnam — chuyên giả lập NotebookLM Audio Overview style nhưng bằng tiếng Việt. Nhiệm vụ: viết kịch bản hội thoại podcast cực kỳ tự nhiên giữa 2 host dựa trên TÀI LIỆU NGUỒN do user cung cấp.

2 HOST:
1. Host Nam (giọng Bắc, thông minh, đặt câu hỏi gợi mở, phong cách dí dỏm, hay thắc mắc "thật vậy à?", "thế ạ", "nhưng mà...").
2. Host Nữ (giọng Bắc, sắc sảo, chuyên gia giải thích bản chất vấn đề, hay tóm tắt + đưa ẩn dụ dễ hiểu).

QUY TẮC ĐÀM THOẠI BẮT BUỘC:

1. Văn nói thuần Việt — KHÔNG văn viết học thuật. Câu ngắn 5-20 từ. Tránh câu phức nhiều mệnh đề.

2. Chèn từ đệm tự nhiên người Việt: "à", "vâng", "thế ạ", "đấy", "thực ra là...", "chính xác!", "ờm", "mà này", "thật ra", "ừ thì", "cái này hay này", "đúng rồi đúng rồi".

3. Audio tags inline — chèn TRỰC TIẾP vào field text để TTS render biểu cảm:
   - [laughs] — khi 1 host bật cười tự nhiên trước ý hài hước
   - [sighs] — khi nói tới số liệu/sự thật đáng buồn, lo ngại
   - [whispers] — chia sẻ bí mật, mẹo nhỏ, điểm nhấn intimate
   Dùng tiết kiệm — mỗi turn tối đa 1 tag, không lạm dụng.

4. Turn-taking 2-4 câu/lượt — KHÔNG monologue dài. Cross-talk:
   - Host này nói 2-4 câu → host kia phản ứng/đào sâu/đặt câu hỏi tiếp.
   - Có lúc cắt ngang lịch sự: "À nhưng mà chờ đã,..." / "Em xin lỗi cắt ngang nhé,..."

5. Cấu trúc:
   - Mở: Host Nam mở hook lôi cuốn, đặt câu hỏi cốt lõi (1-2 turn).
   - Thân: Host Nữ tung hứng nối tiếp, giải thích bản chất, đưa ẩn dụ. 2 host bàn luận sâu, có ít nhất 1 lần Host Nam phản biện/nghi vấn Host Nữ.
   - Kết: Host Nữ chốt insight + Host Nam đặt câu hỏi mở để khán giả ngẫm.

6. KHÔNG dùng cụm sáo rỗng: "không thể phủ nhận", "trong cuộc sống hối hả", "guồng quay cuộc sống", "thời đại 4.0", "thân chào quý vị", "hẹn gặp lại ở tập tiếp theo".

7. Nhắc tên cụ thể: nếu tài liệu nguồn có nhân vật/khái niệm/framework — BẮT BUỘC 1 trong 2 host nhắc đúng tên gốc ít nhất 1 lần (Heidegger, Stoicism, dopamine loop, FOMO, v.v. — không dịch).

8. Mỗi turn KHÔNG quá 80 từ (TTS chia chunk hợp lý).

OUTPUT JSON CHẶT (KHÔNG markdown wrap, KHÔNG meta-text):

{
  "turns": [
    {"speaker": "host_nam", "text": "..."},
    {"speaker": "host_nu", "text": "..."},
    ...
  ]
}

Speaker chỉ được là "host_nam" hoặc "host_nu". Tổng số turn = ~30-60 (podcast 6-12 phút @ ~150 từ/phút). Không có turn nào trống.`;

const buildUserPrompt = (input: {
  title: string;
  hook: string | null;
  essayContent: string | null;
  brainstormIdea: BrainstormIdea | null;
  extraNotes: string;
  targetMinutes: number;
}): string => {
  const parts: string[] = [];
  parts.push(`Tiêu đề tập: "${input.title}"`);
  if (input.hook) parts.push(`Hook: "${input.hook}"`);
  parts.push(`Độ dài mục tiêu: ${input.targetMinutes} phút (~${input.targetMinutes * 150} từ tổng).`);

  if (input.essayContent) {
    // Truncate vừa phải để không nổ context — ~6000 chars (~1500 từ) đủ
    // bao quát essay 1800-2500 từ điển hình.
    const snippet = input.essayContent.slice(0, 6000);
    parts.push(`\n--- ESSAY NGUỒN ---\n${snippet}`);
    if (input.essayContent.length > 6000) {
      parts.push(`[... đã cắt ${input.essayContent.length - 6000} ký tự ...]`);
    }
  }

  if (input.brainstormIdea) {
    const idea = input.brainstormIdea;
    const ideaPayload = {
      title: idea.title,
      hook: idea.hook,
      angle: idea.angle,
      why: idea.why,
      observation: idea.observation,
      contrarianView: idea.contrarianView,
      historicalExamples: idea.historicalExamples,
      storyBank: idea.storyBank,
      futureConnection: idea.futureConnection,
      outline: idea.outline,
    };
    parts.push(
      `\n--- BRAINSTORM IDEA ---\n${JSON.stringify(ideaPayload, null, 2)}`,
    );
  }

  if (input.extraNotes.trim()) {
    parts.push(`\n--- TÀI LIỆU BỔ SUNG (user paste) ---\n${input.extraNotes.trim()}`);
  }

  parts.push(
    "\n---\nViết kịch bản hoàn chỉnh ngay bây giờ. Trả JSON đúng schema, KHÔNG markdown wrap.",
  );
  return parts.join("\n");
};

export type GenScriptInput = {
  episodeName: string;
  /** Nếu cung cấp → fetch essay content. Optional. */
  essayId: string | null;
  /** Nếu cung cấp → fetch brainstorm idea. Optional. */
  brainstormRef: { id: string; ideaIdx: number } | null;
  /** Tài liệu user paste — luôn có (default ""). */
  extraNotes: string;
  /** Title từ episode config. */
  title: string;
  /** Hook từ episode config. */
  hook: string | null;
  /** Độ dài target podcast (phút). Default 8. */
  targetMinutes?: number;
  provider: LLMProvider;
  model: string;
};

export async function generateScript(
  input: GenScriptInput,
): Promise<PodcastScript> {
  // Fetch source content
  let essayContent: string | null = null;
  if (input.essayId) {
    const essay = await getEssay(input.essayId);
    if (!essay) {
      const err = new Error(`Essay không tồn tại: ${input.essayId}`) as Error & {
        code: string;
      };
      err.code = "VALIDATION";
      throw err;
    }
    essayContent = essay.content;
  }

  let brainstormIdea: BrainstormIdea | null = null;
  if (input.brainstormRef) {
    const session = await getBrainstormSession(input.brainstormRef.id);
    if (!session) {
      const err = new Error(
        `Brainstorm session không tồn tại: ${input.brainstormRef.id}`,
      ) as Error & { code: string };
      err.code = "VALIDATION";
      throw err;
    }
    if (session.style !== "podcast") {
      const err = new Error(
        "Brainstorm phải style 'podcast' — gallery idea không dùng được cho podcast script.",
      ) as Error & { code: string };
      err.code = "VALIDATION";
      throw err;
    }
    const idea = (session.ideas as BrainstormIdea[])[input.brainstormRef.ideaIdx];
    if (!idea) {
      const err = new Error(
        `ideaIdx out of range: ${input.brainstormRef.ideaIdx}`,
      ) as Error & { code: string };
      err.code = "VALIDATION";
      throw err;
    }
    brainstormIdea = idea;
  }

  if (!essayContent && !brainstormIdea && !input.extraNotes.trim()) {
    const err = new Error(
      "Cần ít nhất 1 nguồn: essay, brainstorm idea, hoặc tài liệu bổ sung.",
    ) as Error & { code: string };
    err.code = "VALIDATION";
    throw err;
  }

  const targetMinutes = input.targetMinutes ?? 8;
  const userPrompt = buildUserPrompt({
    title: input.title,
    hook: input.hook,
    essayContent,
    brainstormIdea,
    extraNotes: input.extraNotes,
    targetMinutes,
  });

  const content = await chat({
    provider: input.provider,
    model: input.model,
    systemPrompt: SCRIPT_SYSTEM_PROMPT,
    userContent: userPrompt,
    temperature: 0.75,
    jsonMode: true,
  });

  const parsed = safeParseJson<{ turns?: unknown }>(content);
  if (!Array.isArray(parsed.turns) || parsed.turns.length === 0) {
    throw new Error(
      `LLM response không có field 'turns' hoặc rỗng. Raw: ${content.slice(0, 200)}…`,
    );
  }
  const turns = (parsed.turns as unknown[])
    .map(validateTurn)
    .filter((t): t is ScriptTurn => t !== null);
  if (turns.length === 0) {
    throw new Error(
      "LLM trả turns nhưng không có turn nào hợp lệ (speaker/text sai format).",
    );
  }

  return saveScript(input.episodeName, {
    turns,
    source: {
      essayId: input.essayId,
      brainstormRef: input.brainstormRef,
      extraNotes: input.extraNotes,
    },
    provider: input.provider,
    model: input.model,
    bumpGeneratedAt: true,
  });
}

/** Tổng số từ trong tất cả turns — UI hiển thị estimate độ dài. */
export function countScriptWords(script: PodcastScript): number {
  return script.turns.reduce(
    (sum, t) => sum + t.text.trim().split(/\s+/).filter(Boolean).length,
    0,
  );
}
