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
import {
  VisualBeatSchema,
  type VisualBeat,
} from "../../gallery/src/visual-beat";
import {
  WordTimestampSchema,
  type WordTimestamp,
} from "../../gallery/src/word-timestamp";
import { safeParseJson } from "../lib/safe-json";

/**
 * Chapter trong plan = GalleryChapter + transcript + visualBeats + status.
 * Phase 4a: thêm visualBeats sidecar (anchored theo sentenceIdx trong transcript).
 */
export type GalleryPlanChapter = GalleryChapter & {
  /** Voiceover script tiếng Việt cho narration. "" cho music interlude. */
  transcript: string;
  /**
   * Phase 4a: visual beats sidecar — LLM gen kèm transcript trong 1 LLM call.
   * Anchor bằng sentenceIdx → align với TTS word timestamps tại render.
   * [] cho music chapter và cho chapter chưa gen.
   */
  visualBeats: VisualBeat[];
  /** Trạng thái review user: chưa gen / đang draft / đã approve. */
  status: "pending" | "draft" | "approved";
  /**
   * Phase 4b: filename audio TTS đã gen (cách filename dạng
   * "gallery-{planId}-ch{idx}.aac" trong TMP_DIR). null = chưa gen.
   * Music chapter có thể null (sẽ dùng BGM trong render thay vì TTS).
   */
  audioFilename: string | null;
  /** Phase 4b: thời lượng audio file (ms) — ffprobe sau khi TTS xong. */
  audioDurationMs: number | null;
  /**
   * Phase 4b: word-level timestamps từ Whisper ngược trên audio file.
   * Render engine align beat.sentenceIdx với timestamp tại render time.
   * [] khi chưa gen audio hoặc music chapter.
   */
  wordTimestamps: WordTimestamp[];
  /**
   * Phase 4d: filename video MP4 sau khi render qua Remotion. Dạng
   * "gallery-{planId}-ch{idx}.mp4" trong TMP_DIR. null = chưa render.
   */
  videoFilename: string | null;
  /** Phase 4d: thời lượng video (ms) — từ composition.durationInFrames / fps. */
  videoDurationMs: number | null;
  /** Phase 4d: ISO timestamp lần render cuối. null = chưa render. */
  renderedAt: string | null;
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

const rowToPlan = (r: DbRow): GalleryChapterPlan => {
  const chapters = JSON.parse(r.chapters_json) as Array<
    GalleryPlanChapter & {
      visualBeats?: unknown;
      audioFilename?: unknown;
      audioDurationMs?: unknown;
      wordTimestamps?: unknown;
      videoFilename?: unknown;
      videoDurationMs?: unknown;
      renderedAt?: unknown;
    }
  >;
  for (const ch of chapters) {
    // Phase 4a: backfill visualBeats=[]
    if (!Array.isArray(ch.visualBeats)) {
      ch.visualBeats = [];
    } else {
      ch.visualBeats = (ch.visualBeats as unknown[])
        .map((b) => {
          const r = VisualBeatSchema.safeParse(b);
          return r.success ? r.data : null;
        })
        .filter((b): b is VisualBeat => b !== null);
    }
    // Phase 4b: backfill audio fields
    if (typeof ch.audioFilename !== "string") ch.audioFilename = null;
    if (typeof ch.audioDurationMs !== "number") ch.audioDurationMs = null;
    if (!Array.isArray(ch.wordTimestamps)) {
      ch.wordTimestamps = [];
    } else {
      ch.wordTimestamps = (ch.wordTimestamps as unknown[])
        .map((w) => {
          const r = WordTimestampSchema.safeParse(w);
          return r.success ? r.data : null;
        })
        .filter((w): w is WordTimestamp => w !== null);
    }
    // Phase 4d: backfill video fields
    if (typeof ch.videoFilename !== "string") ch.videoFilename = null;
    if (typeof ch.videoDurationMs !== "number") ch.videoDurationMs = null;
    if (typeof ch.renderedAt !== "string") ch.renderedAt = null;
  }
  return {
    id: r.id,
    brainstormId: r.brainstorm_id,
    ideaIdx: r.idea_idx,
    ideaSnapshot: JSON.parse(r.idea_snapshot_json) as GalleryBrainstormIdea,
    chapters: chapters as GalleryPlanChapter[],
    provider: (r.provider ?? null) as LLMProvider | null,
    model: r.model,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
};

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
    visualBeats: [], // Phase 4a: empty cho đến khi gen
    audioFilename: null, // Phase 4b
    audioDurationMs: null,
    wordTimestamps: [],
    videoFilename: null, // Phase 4d
    videoDurationMs: null,
    renderedAt: null,
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
  patch: {
    transcript?: string;
    status?: GalleryPlanChapter["status"];
    visualBeats?: VisualBeat[];
  },
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
  if (patch.visualBeats !== undefined) {
    // Validate qua zod để filter beat invalid + apply default
    ch.visualBeats = patch.visualBeats
      .map((b) => {
        const r = VisualBeatSchema.safeParse(b);
        return r.success ? r.data : null;
      })
      .filter((b): b is VisualBeat => b !== null);
  }
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

const TRANSCRIPT_SYSTEM_PROMPT = `Bạn là biên kịch voiceover tài liệu nghệ thuật tiếng Việt + visual director. Bạn vừa viết voiceover, vừa chỉ định hình ảnh nào hiện song song với từng phần của voiceover — như Khan Academy Smarthistory hoặc Waldemar Januszczak.

Nhiệm vụ: viết VOICEOVER + VISUAL BEATS cho 1 chương của video tài liệu nghệ thuật.

PHẦN 1 — VOICEOVER (field "transcript", prose tiếng Việt):

Cấu trúc bắt buộc:
1. Hook mở chương (1-2 câu) — câu hỏi hoặc statement chương sắp giải đáp.
2. Phần thân — bám sát summary + key works của chương:
   - Nhắc TÊN cụ thể: họa sĩ, tác phẩm, bảo tàng, năm sáng tác.
   - Giải thích kỹ thuật/innovation cụ thể (vd "Giotto dùng axial perspective trong Isaac Blessing Jacob — đường thẳng song song lùi vào không gian").
   - Đưa ngữ cảnh lịch sử + ý nghĩa văn hoá khi cần.
   - Trích quote ngắn từ nhà phê bình/sử gia nếu phù hợp.
3. Bridge sang chương sau (1 câu).

Kỹ thuật:
- Tốc độ voiceover Việt ~150-180 từ/phút. Chapter X phút → viết ~X * 160 từ.
- Câu ngắn-vừa (10-25 từ/câu).
- Dùng "chúng ta" thay vì "bạn".
- KHÔNG markdown, KHÔNG bullet, KHÔNG heading. Pure prose để TTS đọc liền.
- Giữ NGUYÊN GỐC tên Anh/Ý/Pháp (Lamentation, Arena Chapel, không dịch).
- KHÔNG cụm sáo rỗng: "không thể phủ nhận", "trong cuộc sống hối hả".
- Mỗi câu kết thúc bằng dấu chấm/chấm hỏi/chấm than ĐÚNG — để parser split câu chính xác.

PHẦN 2 — VISUAL BEATS (field "visualBeats", array):

Mỗi beat = 1 hình ảnh sẽ hiện song song voiceover. Tốc độ thay đổi hình:
- Trung bình 1 hình mỗi 6-12 giây (~1 beat mỗi 2-4 câu của voiceover).
- 10 phút voiceover (~80 câu) → ~25-40 beats.

Mỗi beat phải có:
- "sentenceIdx": index 0-based của câu trong transcript khi beat bắt đầu. Câu 1 = sentenceIdx 0. Beat phải MONOTONIC TĂNG (sentenceIdx[i+1] > sentenceIdx[i]).
- "keyword": mô tả ảnh NGẮN bằng TIẾNG ANH (để search Wikimedia/Met ra đúng). Phải có tên tác phẩm gốc + chi tiết focus.
  TỐT: "Giotto Lamentation full fresco Arena Chapel", "Mary cradling Christ head close-up detail", "Arena Chapel interior wide angle".
  TỆ: "buc tranh dep", "Giotto art", "fresco" (quá generic).
- "kenBurns": camera motion phù hợp với loại ảnh:
  * "zoom-in": cho ảnh chân dung họa sĩ hoặc detail-shot (default)
  * "zoom-out": reveal toàn cảnh từ chi tiết
  * "pan-left" / "pan-right": cho fresco tường dài hoặc landscape
  * "pan-up": cho tranh dọc/altarpiece cao
  * "pan-down": từ trời xuống đất (rare)
  * "static": chỉ dùng cho text overlay/diagram (hiếm)
- "note": (optional, "" nếu không cần) — gợi ý cho asset team, vd "ưu tiên ảnh restoration 2002".

Quy tắc beat:
- Beat đầu (sentenceIdx=0) PHẢI có — establish shot mở chương.
- Khi voiceover nhắc TÊN 1 tác phẩm cụ thể trong câu → ngay câu đó hoặc câu kế NÊN có beat của tác phẩm đó.
- KHÔNG để gap > 4 câu giữa 2 beats (khán giả sẽ nhìn 1 hình quá lâu).
- Đa dạng kenBurns — không dồn hết zoom-in.

OUTPUT JSON CHẶT (KHÔNG markdown wrap, KHÔNG meta-text):

{
  "transcript": "Câu 1. Câu 2. ... Câu N.",
  "visualBeats": [
    {"sentenceIdx": 0, "keyword": "...", "kenBurns": "zoom-in", "note": ""},
    {"sentenceIdx": 3, "keyword": "...", "kenBurns": "pan-right", "note": ""},
    ...
  ]
}`;

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
    jsonMode: true,
  });

  // Phase 4a: LLM trả JSON {transcript, visualBeats[]}
  const parsed = safeParseJson<{
    transcript?: unknown;
    visualBeats?: unknown;
  }>(content);
  const transcript =
    typeof parsed.transcript === "string" ? parsed.transcript.trim() : "";
  if (!transcript) {
    throw new Error(
      "LLM response không có 'transcript' string — không parse được.",
    );
  }
  const sentenceCount = countSentences(transcript);
  const visualBeats: VisualBeat[] = Array.isArray(parsed.visualBeats)
    ? (parsed.visualBeats as unknown[])
        .map((b) => {
          const r = VisualBeatSchema.safeParse(b);
          return r.success ? r.data : null;
        })
        .filter((b): b is VisualBeat => b !== null)
        // Bound sentenceIdx vào [0, sentenceCount-1] để không trỏ ra ngoài
        .map((b) => ({
          ...b,
          sentenceIdx: Math.max(0, Math.min(sentenceCount - 1, b.sentenceIdx)),
        }))
        // Đảm bảo monotonic tăng — LLM đôi khi lộn xộn
        .sort((a, b) => a.sentenceIdx - b.sentenceIdx)
    : [];

  chapter.transcript = transcript;
  chapter.visualBeats = visualBeats;
  chapter.status = "draft";
  plan.provider = input.provider;
  plan.model = input.model;
  plan.updatedAt = new Date().toISOString();
  savePlan(plan);
  return plan;
}

/**
 * Đếm sentence trong transcript bằng split [.!?]. Đơn giản nhưng đủ cho
 * Vietnamese — Phase 4a anchor beat.
 */
export function countSentences(transcript: string): number {
  if (!transcript.trim()) return 0;
  return transcript
    .split(/[.!?]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0).length;
}

// ────── Phase 4b: TTS + Whisper alignment ──────

/** Tên file cố định theo (planId, chapterIdx) — flat trong TMP_DIR. */
export const galleryChapterAudioFilename = (
  planId: string,
  chapterIdx: number,
): string => `gallery-${planId}-ch${String(chapterIdx).padStart(2, "0")}.aac`;

/**
 * Phase 4d: Save video fields sau khi Remotion render xong.
 */
export async function updateChapterVideo(
  planId: string,
  chapterIdx: number,
  video: { videoFilename: string; videoDurationMs: number },
): Promise<GalleryChapterPlan | null> {
  const plan = await getPlan(planId);
  if (!plan) return null;
  if (chapterIdx < 0 || chapterIdx >= plan.chapters.length) {
    const err = new Error("chapterIdx out of range") as Error & { code: string };
    err.code = "VALIDATION";
    throw err;
  }
  const ch = plan.chapters[chapterIdx];
  ch.videoFilename = video.videoFilename;
  ch.videoDurationMs = video.videoDurationMs;
  ch.renderedAt = new Date().toISOString();
  plan.updatedAt = ch.renderedAt;
  savePlan(plan);
  return plan;
}

/**
 * Save audio fields cho 1 chapter sau khi TTS + Whisper xong.
 */
export async function updateChapterAudio(
  planId: string,
  chapterIdx: number,
  audio: {
    audioFilename: string;
    audioDurationMs: number;
    wordTimestamps: WordTimestamp[];
  },
): Promise<GalleryChapterPlan | null> {
  const plan = await getPlan(planId);
  if (!plan) return null;
  if (chapterIdx < 0 || chapterIdx >= plan.chapters.length) {
    const err = new Error("chapterIdx out of range") as Error & { code: string };
    err.code = "VALIDATION";
    throw err;
  }
  const ch = plan.chapters[chapterIdx];
  ch.audioFilename = audio.audioFilename;
  ch.audioDurationMs = audio.audioDurationMs;
  ch.wordTimestamps = audio.wordTimestamps;
  plan.updatedAt = new Date().toISOString();
  savePlan(plan);
  return plan;
}
