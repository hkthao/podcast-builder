/**
 * Prompt override store — centralized management cho mọi system prompt
 * trong app. User edit qua UI page /prompts → save vào DB table
 * `prompt_overrides`. Gen functions gọi `getEffectivePrompt(key)` thay
 * vì dùng default constant trực tiếp.
 *
 * Resolution order:
 *   1. Per-call override (vd brainstorm.systemPromptOverride) — wins
 *   2. DB override (prompt_overrides table) — fallback
 *   3. Default constant trong code — final fallback
 *
 * Default constants vẫn export để có thể truy cập trực tiếp khi cần (vd
 * UI hiển thị diff giữa default và override).
 */
import { getDb } from "./db";
import { PODCAST_SYSTEM_PROMPT, PODCAST_EXPAND_SYSTEM_PROMPT } from "../../podcast/server/lib/brainstorm-store";
import { ESSAY_SYSTEM_PROMPT, NLM_PROMPT_SYSTEM } from "../../podcast/server/lib/essay-store";
import { SCRIPT_SYSTEM_PROMPT } from "../../podcast/server/lib/script-store";
import { COVER_PROMPT_SYSTEM_PROMPT } from "../../podcast/server/lib/cover-prompt-store";
import { GALLERY_SYSTEM_PROMPT } from "../../gallery/src/brainstorm-idea";
import { TRANSCRIPT_SYSTEM_PROMPT } from "./gallery-plan-store";

export type PromptKey =
  | "podcast.brainstorm"
  | "podcast.brainstorm-expand"
  | "podcast.essay"
  | "podcast.nlm-prompt"
  | "podcast.script"
  | "podcast.cover-prompt"
  | "gallery.brainstorm"
  | "gallery.transcript";

export type PromptMeta = {
  key: PromptKey;
  label: string;
  description: string;
  /** Module nào trong code dùng prompt này. Giúp user trace. */
  usedBy: string;
  /** Default value từ code constant — never null. */
  defaultValue: string;
  /** Override hiện tại — null nếu user chưa edit. */
  override: string | null;
  /** ISO timestamp khi user save override cuối. */
  updatedAt: string | null;
};

const REGISTRY: Array<{
  key: PromptKey;
  label: string;
  description: string;
  usedBy: string;
  getDefault: () => string;
}> = [
  {
    key: "podcast.brainstorm",
    label: "Brainstorm podcast (sinh ý tưởng)",
    description:
      "System prompt khi LLM brainstorm ý tưởng tập podcast. Sinh ra 13 field schema. Placeholder {N} thay = số ý tưởng yêu cầu.",
    usedBy: "podcast/server/lib/brainstorm-store.ts → generateAndSave (mode brainstorm)",
    getDefault: () => PODCAST_SYSTEM_PROMPT,
  },
  {
    key: "podcast.brainstorm-expand",
    label: "Brainstorm podcast (expand mode)",
    description:
      "System prompt khi user paste danh sách ý có sẵn → LLM expand mỗi ý thành 13 field. KHÔNG dùng {N}.",
    usedBy: "podcast/server/lib/brainstorm-store.ts → generateAndSave (mode expand)",
    getDefault: () => PODCAST_EXPAND_SYSTEM_PROMPT,
  },
  {
    key: "podcast.essay",
    label: "Bài luận podcast (gen essay từ outline)",
    description:
      "System prompt khi LLM viết bài luận tiếng Việt 1800-2500 từ theo ByteCast Framework v1 — 12 mục bắt buộc.",
    usedBy: "podcast/server/routes/essay.ts → essay generation stream",
    getDefault: () => ESSAY_SYSTEM_PROMPT,
  },
  {
    key: "podcast.nlm-prompt",
    label: "NotebookLM prompt designer",
    description:
      "Meta prompt — chỉ định LLM viết PROMPT (tiếng Anh) để paste vào NotebookLM. Hiện rewrite theo style 'coffee chat 40-65 + Ngày xưa vs Ngày nay'.",
    usedBy: "podcast/server/routes/essay.ts → genNlmPrompt",
    getDefault: () => NLM_PROMPT_SYSTEM,
  },
  {
    key: "podcast.script",
    label: "Kịch bản podcast (2 host dialogue)",
    description:
      "System prompt khi LLM viết kịch bản dialogue 2 host (Host Nam + Host Nữ) cho tab Kịch bản. Output JSON {turns: [...]}. Inject audio tags inline.",
    usedBy: "podcast/server/lib/script-store.ts → generateScript",
    getDefault: () => SCRIPT_SYSTEM_PROMPT,
  },
  {
    key: "podcast.cover-prompt",
    label: "Prompt tạo ảnh cover thumbnail",
    description:
      "Meta prompt — chỉ định LLM viết prompt cho AI image generator (Midjourney/Flux/DALL-E) tạo thumbnail 9:16 style 3D clay render pastel ByteCast. Fill title + 5 tickets + 1 notebook phrase theo nội dung tập.",
    usedBy: "podcast/server/routes/episodes.ts → cover-prompt endpoint",
    getDefault: () => COVER_PROMPT_SYSTEM_PROMPT,
  },
  {
    key: "gallery.brainstorm",
    label: "Brainstorm gallery (documentary art)",
    description:
      "System prompt khi LLM brainstorm ý tưởng video tài liệu nghệ thuật. Sinh chapters + key works + license risk + asset sources. Placeholder {N} thay = số ý.",
    usedBy: "podcast/server/lib/brainstorm-store.ts → generateGalleryAndSave",
    getDefault: () => GALLERY_SYSTEM_PROMPT,
  },
  {
    key: "gallery.transcript",
    label: "Gallery transcript (voiceover + visual beats)",
    description:
      "System prompt cho LLM viết voiceover tiếng Việt cho 1 chương + visual beats sidecar. Khan Academy Smarthistory style.",
    usedBy: "shared/studio-core/gallery-plan-store.ts → generateChapterTranscript",
    getDefault: () => TRANSCRIPT_SYSTEM_PROMPT,
  },
];

type DbRow = {
  key: string;
  value: string;
  updated_at: string;
};

/** Lookup override row (null nếu chưa set). */
function getOverrideRow(key: PromptKey): DbRow | null {
  const row = getDb()
    .prepare("SELECT * FROM prompt_overrides WHERE key = ?")
    .get(key) as DbRow | undefined;
  return row ?? null;
}

/**
 * Resolve effective prompt: override nếu có, fallback default constant.
 * Đây là hàm các gen functions PHẢI gọi (không dùng constant trực tiếp).
 */
export function getEffectivePrompt(key: PromptKey): string {
  const row = getOverrideRow(key);
  if (row?.value) return row.value;
  const meta = REGISTRY.find((r) => r.key === key);
  if (!meta) {
    throw new Error(`Unknown prompt key: ${key}`);
  }
  return meta.getDefault();
}

/** List tất cả prompt với default + override. */
export function listAllPrompts(): PromptMeta[] {
  return REGISTRY.map((r) => {
    const row = getOverrideRow(r.key);
    return {
      key: r.key,
      label: r.label,
      description: r.description,
      usedBy: r.usedBy,
      defaultValue: r.getDefault(),
      override: row?.value ?? null,
      updatedAt: row?.updated_at ?? null,
    };
  });
}

export function getPrompt(key: PromptKey): PromptMeta | null {
  const r = REGISTRY.find((x) => x.key === key);
  if (!r) return null;
  const row = getOverrideRow(key);
  return {
    key: r.key,
    label: r.label,
    description: r.description,
    usedBy: r.usedBy,
    defaultValue: r.getDefault(),
    override: row?.value ?? null,
    updatedAt: row?.updated_at ?? null,
  };
}

/**
 * Save override. Nếu value === defaultValue → xoá row (về default thay vì
 * lưu redundant copy).
 */
export function setOverride(key: PromptKey, value: string): PromptMeta {
  const meta = REGISTRY.find((r) => r.key === key);
  if (!meta) throw new Error(`Unknown prompt key: ${key}`);
  const trimmed = value.replace(/\r\n/g, "\n");
  const defaultValue = meta.getDefault();
  if (trimmed.trim() === "" || trimmed === defaultValue) {
    // Empty hoặc identical với default → xoá row
    getDb()
      .prepare("DELETE FROM prompt_overrides WHERE key = ?")
      .run(key);
  } else {
    const now = new Date().toISOString();
    getDb()
      .prepare(
        `INSERT INTO prompt_overrides (key, value, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      )
      .run(key, trimmed, now);
  }
  return getPrompt(key)!;
}

export function deleteOverride(key: PromptKey): PromptMeta {
  const meta = REGISTRY.find((r) => r.key === key);
  if (!meta) throw new Error(`Unknown prompt key: ${key}`);
  getDb().prepare("DELETE FROM prompt_overrides WHERE key = ?").run(key);
  return getPrompt(key)!;
}

export function isValidPromptKey(key: string): key is PromptKey {
  return REGISTRY.some((r) => r.key === key);
}
