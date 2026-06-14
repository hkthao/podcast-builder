/**
 * Gallery chapter plan store — Phase 3d.
 *
 * Sau khi user pick 1 gallery brainstorm idea, ta tạo 1 "plan" = expanded
 * chapter list với transcript voiceover đầy đủ cho mỗi narration chapter.
 *
 * Plan keyed bởi (brainstormId, ideaIdx) — UNIQUE để không tạo trùng.
 *
 * Workflow: pick idea → POST /api/gallery/plans → empty transcripts → user
 * click "Gen transcript" cho từng chapter → LLM stream về → user edit + approve
 * → feed vào TTS (Phase 3d nối với gen-audio-tts.ts).
 */
import { getDb } from "./db";
import { chat, type LLMProvider } from "./llm-providers";
import type {
  GalleryBrainstormIdea,
  GalleryChapter,
} from "../../gallery/src/brainstorm-idea";

/** Chapter trong plan = GalleryChapter + transcript + status review. */
export type GalleryPlanChapter = GalleryChapter & {
  /** Voiceover script tiếng Việt cho narration. "" cho music interlude. */
  transcript: string;
  /** Trạng thái review user: chưa gen / đang draft / đã approve. */
  status: "pending" | "draft" | "approved";
};

export type GalleryChapterPlan = {
  id: string;
  brainstormId: string;
  ideaIdx: number;
  /** Snapshot idea lúc tạo plan — stable kể cả khi brainstorm bị edit/xoá. */
  ideaSnapshot: GalleryBrainstormIdea;
  chapters: GalleryPlanChapter[];
  provider: LLMProvider | null;
  model: string | null;
  createdAt: string;
  updatedAt: string;
};

type DbRow = {
  id: string;
  brainstorm_id: string;
  idea_idx: number;
  idea_snapshot_json: string;
  chapters_json: string;
  provider: string | null;
  model: string | null;
  created_at: string;
  updated_at: string;
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

const rowToPlan = (r: DbRow): GalleryChapterPlan => ({
  id: r.id,
  brainstormId: r.brainstorm_id,
  ideaIdx: r.idea_idx,
  ideaSnapshot: JSON.parse(r.idea_snapshot_json) as GalleryBrainstormIdea,
  chapters: JSON.parse(r.chapters_json) as GalleryPlanChapter[],
  provider: (r.provider ?? null) as LLMProvider | null,
  model: r.model,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

const savePlan = (p: GalleryChapterPlan): void => {
  getDb()
    .prepare(
      `INSERT OR REPLACE INTO gallery_chapter_plans
        (id, brainstorm_id, idea_idx, idea_snapshot_json, chapters_json,
         provider, model, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      p.id,
      p.brainstormId,
      p.ideaIdx,
      JSON.stringify(p.ideaSnapshot),
      JSON.stringify(p.chapters),
      p.provider,
      p.model,
      p.createdAt,
      p.updatedAt,
    );
};

export async function listPlans(
  filter: { brainstormId?: string } = {},
): Promise<GalleryChapterPlan[]> {
  let sql = "SELECT * FROM gallery_chapter_plans";
  const params: string[] = [];
  if (filter.brainstormId) {
    sql += " WHERE brainstorm_id = ?";
    params.push(filter.brainstormId);
  }
  sql += " ORDER BY updated_at DESC";
  const rows = getDb().prepare(sql).all(...params) as DbRow[];
  return rows.map(rowToPlan);
}

export async function getPlan(
  id: string,
): Promise<GalleryChapterPlan | null> {
  const row = getDb()
    .prepare("SELECT * FROM gallery_chapter_plans WHERE id = ?")
    .get(id) as DbRow | undefined;
  return row ? rowToPlan(row) : null;
}

export async function findPlanBySource(
  brainstormId: string,
  ideaIdx: number,
): Promise<GalleryChapterPlan | null> {
  const row = getDb()
    .prepare(
      "SELECT * FROM gallery_chapter_plans WHERE brainstorm_id = ? AND idea_idx = ?",
    )
    .get(brainstormId, ideaIdx) as DbRow | undefined;
  return row ? rowToPlan(row) : null;
}

export async function deletePlan(id: string): Promise<boolean> {
  if (!/^[a-z0-9-]+$/.test(id)) return false;
  const result = getDb()
    .prepare("DELETE FROM gallery_chapter_plans WHERE id = ?")
    .run(id);
  return result.changes > 0;
}

/**
 * Tạo plan mới từ gallery idea — chỉ scaffold chapters với transcript="" +
 * status="pending". User click "Gen transcript" sau cho từng chương.
 *
 * Nếu plan đã tồn tại với (brainstormId, ideaIdx) → return plan cũ (idempotent).
 */
export async function createPlanFromIdea(input: {
  brainstormId: string;
  ideaIdx: number;
  idea: GalleryBrainstormIdea;
}): Promise<GalleryChapterPlan> {
  // Idempotent: nếu đã có plan cho (brainstormId, ideaIdx), return cũ
  const existing = await findPlanBySource(input.brainstormId, input.ideaIdx);
  if (existing) return existing;

  const now = new Date();
  const ts =
    now.getFullYear() +
    String(now.getMonth() + 1).padStart(2, "0") +
    String(now.getDate()).padStart(2, "0") +
    "-" +
    String(now.getHours()).padStart(2, "0") +
    String(now.getMinutes()).padStart(2, "0") +
    String(now.getSeconds()).padStart(2, "0");
  const id = `${ts}-${slugify(input.idea.title) || "plan"}`;

  const chapters: GalleryPlanChapter[] = input.idea.chapters.map((ch) => ({
    ...ch,
    transcript: "",
    // Music interlude không cần gen transcript → mark draft luôn cho user
    // approve nhanh; narration thì pending chờ gen.
    status: ch.kind === "music" ? "draft" : "pending",
  }));

  const plan: GalleryChapterPlan = {
    id,
    brainstormId: input.brainstormId,
    ideaIdx: input.ideaIdx,
    ideaSnapshot: input.idea,
    chapters,
    provider: null,
    model: null,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
  savePlan(plan);
  return plan;
}

/**
 * Save sửa transcript / status cho 1 chapter cụ thể của plan.
 */
export async function updateChapter(
  planId: string,
  chapterIdx: number,
  patch: { transcript?: string; status?: GalleryPlanChapter["status"] },
): Promise<GalleryChapterPlan | null> {
  const plan = await getPlan(planId);
  if (!plan) return null;
  if (chapterIdx < 0 || chapterIdx >= plan.chapters.length) {
    const err = new Error("chapterIdx out of range") as Error & { code: string };
    err.code = "VALIDATION";
    throw err;
  }
  const ch = plan.chapters[chapterIdx];
  if (patch.transcript !== undefined) ch.transcript = patch.transcript;
  if (patch.status !== undefined) ch.status = patch.status;
  plan.updatedAt = new Date().toISOString();
  savePlan(plan);
  return plan;
}

/**
 * Save toàn bộ chapters (bulk edit từ UI sau khi user sửa nhiều chương).
 */
export async function updatePlanChapters(
  planId: string,
  chapters: GalleryPlanChapter[],
): Promise<GalleryChapterPlan | null> {
  const plan = await getPlan(planId);
  if (!plan) return null;
  if (chapters.length !== plan.chapters.length) {
    const err = new Error(
      `Chapter count mismatch: plan có ${plan.chapters.length}, payload ${chapters.length}`,
    ) as Error & { code: string };
    err.code = "VALIDATION";
    throw err;
  }
  plan.chapters = chapters;
  plan.updatedAt = new Date().toISOString();
  savePlan(plan);
  return plan;
}

// ────── LLM gen transcript per chapter ──────

const TRANSCRIPT_SYSTEM_PROMPT = `Bạn là biên kịch voiceover tài liệu nghệ thuật tiếng Việt. Bạn viết script cho narrator giọng trầm ấm, chiêm nghiệm, học thuật nhưng dễ nghe — phong cách Khan Academy Smarthistory + Waldemar Januszczak Vietnamese localization.

Nhiệm vụ: viết NGUYÊN VĂN VOICEOVER cho 1 chương của video tài liệu nghệ thuật, dựa trên thông tin chương + bối cảnh video tổng thể.

CẤU TRÚC TỪNG CHƯƠNG (bắt buộc trong voiceover):
1. Hook mở chương (1-2 câu) — gợi mở câu hỏi hoặc statement chương sắp giải đáp
2. Phần thân — bám sát summary + key works của chương:
   - Nhắc TÊN cụ thể: họa sĩ, tác phẩm, bảo tàng, năm sáng tác
   - Giải thích kỹ thuật/innovation cụ thể của tác phẩm (vd: "Giotto dùng axial perspective trong Isaac Blessing Jacob — kỹ thuật cho phép đường thẳng song song lùi vào không gian")
   - Đưa ngữ cảnh lịch sử + ý nghĩa văn hoá khi cần
   - Trích quote ngắn từ nhà phê bình/sử gia nếu phù hợp
3. Bridge sang chương sau (1 câu) — nối liền narrative arc

KỸ THUẬT VIẾT BẮT BUỘC:
- Tốc độ đọc voiceover Việt: ~150-180 từ/phút. Chapter X phút → viết ~X * 160 từ.
- Câu ngắn-vừa (10-25 từ/câu). Tránh câu dài lê thê khó đọc.
- Dùng "chúng ta" thay vì "bạn" để invoking shared viewing experience.
- KHÔNG markdown, KHÔNG bullet, KHÔNG heading. Pure prose để TTS đọc liền mạch.
- KHÔNG ngoặc kép "" cho dialogue trừ khi quote nhà phê bình.
- KHÔNG xuống dòng giữa câu. Mỗi đoạn 3-6 câu, phân tách bằng dòng trắng.
- Giữ NGUYÊN GỐC tên họa sĩ + tác phẩm + bảo tàng tiếng Anh/Ý/Pháp (vd "Lamentation", "Arena Chapel", không dịch thành "Bài than khóc", "Nhà nguyện Arena").
- KHÔNG dùng cụm sáo rỗng: "không thể phủ nhận", "trong cuộc sống hối hả", "bài học sâu sắc".

OUTPUT: chỉ riêng đoạn voiceover prose. KHÔNG lời mở đầu kiểu "Đây là voiceover:", KHÔNG meta-text, KHÔNG dấu --- ngăn cách.`;

const buildTranscriptUserPrompt = (
  idea: GalleryBrainstormIdea,
  chapter: GalleryPlanChapter,
  chapterIdx: number,
  adjacentChapters: GalleryPlanChapter[],
): string => {
  // Truncate keyWorks list theo chapter để giảm context
  const chapterKeyWorks = idea.keyWorks.filter((kw) =>
    chapter.keyWorks.some(
      (ref) => kw.title.toLowerCase() === ref.toLowerCase(),
    ),
  );
  const prevTitle = adjacentChapters[chapterIdx - 1]?.title;
  const nextTitle = adjacentChapters[chapterIdx + 1]?.title;

  const payload = {
    video: {
      title: idea.title,
      archetype: idea.archetype,
      era: idea.era,
      region: idea.region,
      hookOverall: idea.hook,
      uniqueAngle: idea.uniqueAngle,
    },
    chapter: {
      index: chapterIdx + 1,
      total: adjacentChapters.length,
      title: chapter.title,
      minutes: chapter.minutes,
      summary: chapter.summary,
      keyWorks: chapterKeyWorks.length > 0 ? chapterKeyWorks : undefined,
    },
    narrativeFlow: {
      previousChapter: prevTitle,
      nextChapter: nextTitle,
    },
    targetWords: chapter.minutes * 160,
    instruction: `Viết voiceover NGUYÊN VĂN cho chương "${chapter.title}" — ~${chapter.minutes * 160} từ.`,
  };
  return JSON.stringify(payload, null, 2);
};

export async function generateChapterTranscript(input: {
  planId: string;
  chapterIdx: number;
  provider: LLMProvider;
  model: string;
}): Promise<GalleryChapterPlan> {
  const plan = await getPlan(input.planId);
  if (!plan) {
    const err = new Error(`Plan không tồn tại: ${input.planId}`) as Error & {
      code: string;
    };
    err.code = "NOT_FOUND";
    throw err;
  }
  if (input.chapterIdx < 0 || input.chapterIdx >= plan.chapters.length) {
    const err = new Error("chapterIdx out of range") as Error & {
      code: string;
    };
    err.code = "VALIDATION";
    throw err;
  }
  const chapter = plan.chapters[input.chapterIdx];
  if (chapter.kind === "music") {
    const err = new Error(
      "Music interlude không có voiceover — chỉ điền musicCue.",
    ) as Error & { code: string };
    err.code = "VALIDATION";
    throw err;
  }

  const content = await chat({
    provider: input.provider,
    model: input.model,
    systemPrompt: TRANSCRIPT_SYSTEM_PROMPT,
    userContent: buildTranscriptUserPrompt(
      plan.ideaSnapshot,
      chapter,
      input.chapterIdx,
      plan.chapters,
    ),
    temperature: 0.75,
  });

  chapter.transcript = content.trim();
  chapter.status = "draft";
  plan.provider = input.provider;
  plan.model = input.model;
  plan.updatedAt = new Date().toISOString();
  savePlan(plan);
  return plan;
}
