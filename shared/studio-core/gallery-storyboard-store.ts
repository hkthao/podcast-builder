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
import { getEffectivePrompt } from "./prompt-overrides-store";
import type {
  GalleryBrainstormIdea,
  GalleryChapter,
} from "../../gallery/src/brainstorm-idea";
import {
  ShotSchema,
  type Shot,
} from "../../gallery/src/shot";
import {
  classifyBeatSync,
  loadKnowledgeGraph,
} from "../../gallery/src/shot-heuristic";
import {
  WordTimestampSchema,
  type WordTimestamp,
} from "../../gallery/src/word-timestamp";
import { safeParseJson } from "../lib/safe-json";

/**
 * Chapter trong plan = GalleryChapter + transcript + shots + status.
 *
 * Field name `shots` (thuật ngữ video-making, ViMax-aligned). Legacy data
 * trong DB có field `visualBeats` — rowToPlan tự migrate khi load.
 */
export type StoryboardChapter = GalleryChapter & {
  /** Voiceover script tiếng Việt cho narration. "" cho music interlude. */
  transcript: string;
  /**
   * Shots sidecar — LLM gen kèm transcript trong 1 LLM call. Anchor bằng
   * sentenceIdx → align với TTS word timestamps tại render. [] cho music
   * chapter và cho chapter chưa gen.
   *
   * Legacy DB field: `visualBeats` (đổi tên Phase storyboard refactor).
   */
  shots: Shot[];
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

export type Storyboard = {
  id: string;
  brainstormId: string;
  ideaIdx: number;
  /** Snapshot idea lúc tạo plan — stable kể cả khi brainstorm bị edit/xoá. */
  ideaSnapshot: GalleryBrainstormIdea;
  chapters: StoryboardChapter[];
  provider: LLMProvider | null;
  model: string | null;
  createdAt: string;
  updatedAt: string;
  /** Phase 4e: filename video final sau khi concat. null = chưa export. */
  outputFilename: string | null;
  outputDurationMs: number | null;
  exportedAt: string | null;
  /**
   * Phase 4e.x: filename nhạc nền plan-level. mp3/m4a/wav trong TMP_DIR.
   * Narration chapter mix với voice ở volume thấp; music chapter dùng full
   * volume + loop tới hết duration.
   */
  bgmFilename: string | null;
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
  output_filename: string | null;
  output_duration_ms: number | null;
  exported_at: string | null;
  bgm_filename: string | null;
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

const rowToStoryboard = (r: DbRow): Storyboard => {
  const chapters = JSON.parse(r.chapters_json) as Array<
    StoryboardChapter & {
      visualBeats?: unknown;
      shots?: unknown;
      audioFilename?: unknown;
      audioDurationMs?: unknown;
      wordTimestamps?: unknown;
      videoFilename?: unknown;
      videoDurationMs?: unknown;
      renderedAt?: unknown;
    }
  >;
  for (const ch of chapters) {
    // Storyboard rename migration: legacy field `visualBeats` → new `shots`.
    // Đọc cả 2, prefer `shots`. Nếu chỉ có legacy → migrate inline (next
    // savePlan sẽ ghi field mới, không phải migration explicit).
    const beatSource = Array.isArray(ch.shots)
      ? ch.shots
      : Array.isArray(ch.visualBeats)
        ? ch.visualBeats
        : null;
    if (beatSource === null) {
      ch.shots = [];
    } else {
      ch.shots = (beatSource as unknown[])
        .map((b) => {
          const r = ShotSchema.safeParse(b);
          return r.success ? r.data : null;
        })
        .filter((b): b is Shot => b !== null);
    }
    delete ch.visualBeats; // drop legacy field — JSON.stringify sẽ skip undefined
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
    chapters: chapters as StoryboardChapter[],
    provider: (r.provider ?? null) as LLMProvider | null,
    model: r.model,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    outputFilename: r.output_filename,
    outputDurationMs: r.output_duration_ms,
    exportedAt: r.exported_at,
    bgmFilename: r.bgm_filename,
  };
};

const saveStoryboard = (p: Storyboard): void => {
  getDb()
    .prepare(
      `INSERT OR REPLACE INTO gallery_chapter_plans
        (id, brainstorm_id, idea_idx, idea_snapshot_json, chapters_json,
         provider, model, created_at, updated_at,
         output_filename, output_duration_ms, exported_at, bgm_filename)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      p.outputFilename,
      p.outputDurationMs,
      p.exportedAt,
      p.bgmFilename,
    );
};

/** Phase 4e.x: filename cố định cho BGM file uploaded. */
export const storyboardBgmFilename = (
  planId: string,
  ext: string,
): string => `gallery-${planId}-bgm.${ext.toLowerCase().replace(/^\./, "")}`;

/**
 * Phase 4e.x: set BGM filename cho plan. File phải đã được lưu trong TMP_DIR
 * trước khi gọi (route handler responsibility).
 */
export async function setStoryboardBgm(
  planId: string,
  filename: string,
): Promise<Storyboard | null> {
  const plan = await getStoryboard(planId);
  if (!plan) return null;
  plan.bgmFilename = filename;
  plan.updatedAt = new Date().toISOString();
  saveStoryboard(plan);
  return plan;
}

export async function clearStoryboardBgm(
  planId: string,
): Promise<Storyboard | null> {
  const plan = await getStoryboard(planId);
  if (!plan) return null;
  plan.bgmFilename = null;
  plan.updatedAt = new Date().toISOString();
  saveStoryboard(plan);
  return plan;
}

/**
 * Phase 4e: persist plan-level final output sau khi concat xong.
 */
export async function updateStoryboardOutput(
  planId: string,
  output: { outputFilename: string; outputDurationMs: number },
): Promise<Storyboard | null> {
  const plan = await getStoryboard(planId);
  if (!plan) return null;
  plan.outputFilename = output.outputFilename;
  plan.outputDurationMs = output.outputDurationMs;
  plan.exportedAt = new Date().toISOString();
  plan.updatedAt = plan.exportedAt;
  saveStoryboard(plan);
  return plan;
}

export async function listStoryboards(
  filter: { brainstormId?: string } = {},
): Promise<Storyboard[]> {
  let sql = "SELECT * FROM gallery_chapter_plans";
  const params: string[] = [];
  if (filter.brainstormId) {
    sql += " WHERE brainstorm_id = ?";
    params.push(filter.brainstormId);
  }
  sql += " ORDER BY updated_at DESC";
  const rows = getDb().prepare(sql).all(...params) as DbRow[];
  return rows.map(rowToStoryboard);
}

export async function getStoryboard(
  id: string,
): Promise<Storyboard | null> {
  const row = getDb()
    .prepare("SELECT * FROM gallery_chapter_plans WHERE id = ?")
    .get(id) as DbRow | undefined;
  return row ? rowToStoryboard(row) : null;
}

export async function findStoryboardBySource(
  brainstormId: string,
  ideaIdx: number,
): Promise<Storyboard | null> {
  const row = getDb()
    .prepare(
      "SELECT * FROM gallery_chapter_plans WHERE brainstorm_id = ? AND idea_idx = ?",
    )
    .get(brainstormId, ideaIdx) as DbRow | undefined;
  return row ? rowToStoryboard(row) : null;
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
export async function createStoryboardFromIdea(input: {
  brainstormId: string;
  ideaIdx: number;
  idea: GalleryBrainstormIdea;
}): Promise<Storyboard> {
  // Idempotent: nếu đã có plan cho (brainstormId, ideaIdx), return cũ
  const existing = await findStoryboardBySource(input.brainstormId, input.ideaIdx);
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

  const chapters: StoryboardChapter[] = input.idea.chapters.map((ch) => ({
    ...ch,
    transcript: "",
    shots: [], // empty cho đến khi gen
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

  const plan: Storyboard = {
    id,
    brainstormId: input.brainstormId,
    ideaIdx: input.ideaIdx,
    ideaSnapshot: input.idea,
    chapters,
    provider: null,
    model: null,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    outputFilename: null,
    outputDurationMs: null,
    exportedAt: null,
    bgmFilename: null,
  };
  saveStoryboard(plan);
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
    status?: StoryboardChapter["status"];
    shots?: Shot[];
    /** @deprecated use `shots` — legacy field, still accepted. */
    visualBeats?: Shot[];
  },
): Promise<Storyboard | null> {
  const plan = await getStoryboard(planId);
  if (!plan) return null;
  if (chapterIdx < 0 || chapterIdx >= plan.chapters.length) {
    const err = new Error("chapterIdx out of range") as Error & { code: string };
    err.code = "VALIDATION";
    throw err;
  }
  const ch = plan.chapters[chapterIdx];
  if (patch.transcript !== undefined) ch.transcript = patch.transcript;
  if (patch.status !== undefined) ch.status = patch.status;
  // Accept cả `shots` (new) lẫn `visualBeats` (legacy) trong patch.
  const shotsPatch = patch.shots ?? patch.visualBeats;
  if (shotsPatch !== undefined) {
    // Validate qua zod để filter shot invalid + apply default
    ch.shots = shotsPatch
      .map((b) => {
        const r = ShotSchema.safeParse(b);
        return r.success ? r.data : null;
      })
      .filter((b): b is Shot => b !== null);
  }
  plan.updatedAt = new Date().toISOString();
  saveStoryboard(plan);
  return plan;
}

/**
 * Save toàn bộ chapters (bulk edit từ UI sau khi user sửa nhiều chương).
 */
export async function updateStoryboardChapters(
  planId: string,
  chapters: StoryboardChapter[],
): Promise<Storyboard | null> {
  const plan = await getStoryboard(planId);
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
  saveStoryboard(plan);
  return plan;
}

// ────── LLM gen transcript per chapter ──────

export const TRANSCRIPT_SYSTEM_PROMPT = `Bạn là biên kịch voiceover tài liệu TRIẾT HỌC tiếng Việt + visual director. Bạn vừa viết voiceover, vừa chỉ định hình ảnh ẩn dụ/tư liệu hiện song song — phong cách documentary chiêm nghiệm (kiểu Crash Course Philosophy hoặc tài liệu lịch sử tư tưởng).

Nhiệm vụ: viết VOICEOVER + VISUAL BEATS cho 1 chương của video tài liệu triết học.

PHẦN 1 — VOICEOVER (field "transcript", prose tiếng Việt):

Cấu trúc bắt buộc:
1. Hook mở chương (1-2 câu) — câu hỏi hoặc statement chương sắp giải đáp.
2. Phần thân — bám sát summary chương:
   - Nhắc TÊN cụ thể: triết gia, trường phái, tác phẩm, khái niệm, năm/thời kỳ.
   - Giải thích luận điểm/phương pháp cụ thể, dễ hiểu (vd "phương pháp truy vấn của Socrates: hỏi liên tiếp để người đối thoại tự nhận ra mâu thuẫn trong chính niềm tin của mình").
   - Đưa ngữ cảnh lịch sử + ý nghĩa khi cần.
   - Trích quote triết học kinh điển nếu phù hợp ("Tôi biết rằng tôi không biết gì").
3. Bridge sang chương sau (1 câu).

Kỹ thuật:
- Tốc độ voiceover Việt ~150-180 từ/phút. Chapter X phút → viết ~X * 160 từ.
- Câu ngắn-vừa (10-25 từ/câu).
- Dùng "chúng ta" thay vì "bạn".
- KHÔNG markdown, KHÔNG bullet, KHÔNG heading. Pure prose để TTS đọc liền.
- Giữ NGUYÊN GỐC tên triết gia/tác phẩm (Socrates, Plato, "The Republic", không dịch sang tiếng Việt).
- KHÔNG cụm sáo rỗng.
- Mỗi câu kết thúc bằng dấu chấm/chấm hỏi/chấm than ĐÚNG — để parser split câu chính xác.

PHẦN 2 — SHOTS (field "shots", array):

Mỗi shot = 1 hình ảnh hiện song song voiceover.

⏱️ MẬT ĐỘ SHOT (QUAN TRỌNG — tránh 1 hình đứng quá lâu gây chán):
- Đổi hình mỗi ~4-5 giây. KHÔNG để 1 shot (nhất là ẢNH TĨNH archive) hiển thị quá 6-7 giây.
- Đặt shot DÀY: trung bình 1 shot mỗi 1-2 câu voiceover. KHÔNG để gap > 2 câu giữa 2 shots.
- Ước lượng số shot ≈ số_phút × 11 (vd chương 3 phút → ~30-36 shots). Thà NHIỀU shot hình khác nhau còn hơn ít shot dài.
- Khi 1 ý kéo dài nhiều câu → CHIA thành nhiều shot với hình KHÁC nhau (vd cùng nói về Athens: shot 1 tàn tích Acropolis, shot 2 agora, shot 3 biển Aegean) thay vì giữ 1 ảnh.

⚠️ NGUYÊN TẮC TỐI QUAN TRỌNG — TRÁNH HÌNH HIỆN ĐẠI / LẠC CHỦ ĐỀ:
Video về triết học CỔ ĐẠI. Stock footage (Pexels/Pixabay) là cảnh quay HIỆN ĐẠI — người mặc đồ thời nay, thành phố, công nghệ → LẠC LÕNG, hỏng không khí cổ. Vì vậy:
1. Với chủ đề cổ đại/cổ điển → ƯU TIÊN ARCHIVE (tranh/tượng/gốm/fresco cổ điển public domain trên Wikimedia/Met). Đây mới là hình period-accurate, đúng thời đại, đẹp và đúng chủ đề.
2. Stock CHỈ dùng cho hình ẢNH VÔ THỜI GIAN — thiên nhiên + chất liệu cổ, KHÔNG có dấu vết hiện đại: tàn tích đá, cột cẩm thạch, biển động, sóng, bầu trời sao, bình minh trên núi, ngọn lửa/nến, khói, hạt bụi trong tia sáng, rừng ô liu, sa mạc, cuộn giấy da, mực. TUYỆT ĐỐI KHÔNG: người hiện đại, quần áo thời nay, ô tô, đường phố, văn phòng, điện thoại, máy tính.
3. NGOẠI LỆ: chương "Bài học cho thời đại AI" — ĐƯỢC dùng stock hiện đại (server, smartphone, AI, đám đông phố) để tạo tương phản cổ–kim.

⭐ KEYWORD PHẢI BÁM NỘI DUNG CÂU: với mỗi shot, ĐỌC chính câu/đoạn voiceover mà shot đó đi kèm (theo sentenceIdx) rồi chọn hình minh hoạ ĐÚNG điều ĐANG ĐƯỢC NÓI ở đó — không chọn hình chung chung. Vd câu nói về phiên toà xử Socrates → "The Death of Socrates David painting"; câu về dạy học ở quảng trường → "ancient Agora Athens stoa"; câu về nghi ngờ/tự vấn → "fog forest dawn". Các ví dụ keyword trong prompt CHỈ để tham khảo PHONG CÁCH viết keyword (tiếng Anh, cụ thể, có thật trong kho), KHÔNG phải danh sách bắt buộc chép — mỗi video/chương tự suy ra keyword từ nội dung riêng.

Mỗi shot phải có:
- "sentenceIdx": index 0-based của câu trong transcript khi shot bắt đầu. MONOTONIC TĂNG.
- "keyword": mô tả ảnh NGẮN bằng TIẾNG ANH — CHỌN THEO assetType:
  • assetType="archive" (Wikimedia/Met — NÊN CHIẾM ~50% với chủ đề cổ đại): tranh/tượng/gốm/fresco cổ điển PD. PHẢI cụ thể + có loại hình:
    TỐT: "Socrates marble bust", "Plato bust sculpture", "The School of Athens Raphael fresco", "The Death of Socrates Jacques-Louis David painting", "ancient greek red-figure pottery vase", "Roman fresco Pompeii", "Parthenon frieze marble relief", "ancient map of Greece".
    TỆ: "philosopher", "greek statue", "old painting" (quá generic → ra sai).
  • assetType="stock" (b-roll VÔ THỜI GIAN — thiên nhiên/đá/lửa, KHÔNG hiện đại): 2-4 từ.
    TỐT (cổ đại): "ancient stone ruins sunset", "marble columns temple", "stormy sea waves rocks", "starry night sky timelapse", "candle flame darkness", "fog mountain dawn", "olive trees mediterranean wind", "sunbeam dust temple", "fire embers slow motion".
    TỐT (chỉ cho chương AI): "server room data center", "smartphone glowing night", "ai neural network", "city crowd timelapse".
    TỆ: "man walking misty path", "person thinking office", "people in city" (người hiện đại → lạc chủ đề cổ đại).
  • assetType="ai": cảnh lịch sử cụ thể không có archive → câu mô tả classical style (ghép vào aiPrompt Draw Things) — vd "Socrates teaching young men in Athens agora, ancient greek classical painting style".
  • assetType="motion": keyword = tên recipe (Quote, …). Dùng cho CÂU NÓI KINH ĐIỂN → hiện text quote.
- "kenBurns": "zoom-in" (chân dung/tượng — default), "zoom-out" (reveal cảnh rộng), "pan-left"/"pan-right" (tranh ngang/landscape), "pan-up" (tượng/tranh dọc), "static" (quote).
- "role" (CHỌN 1 trong 6): "establishing" (mở cảnh, 1-2 đầu chương), "subject" (tượng/tranh nhân vật được nhắc tên), "detail" (cận cảnh chi tiết tranh/tượng/cuộn giấy), "concept" (ý trừu tượng → motion), "transition" (cầu nối ngắn), "payoff" (câu chốt/quote).
- "assetType": với chủ đề CỔ ĐẠI ưu tiên thứ tự: archive (tranh/tượng) > stock vô thời gian > ai > motion.
- "note": (optional, "" nếu không cần).

Quy tắc shot:
- Shot đầu (sentenceIdx=0): establishing — dùng archive (tranh cổ điển toàn cảnh) HOẶC stock vô thời gian ("ancient stone ruins sunset"). KHÔNG dùng cảnh hiện đại.
- Khi voiceover nhắc TÊN 1 triết gia/tác phẩm/sự kiện → ngay đó shot archive tranh/tượng/fresco của họ (role="subject").
- Câu nói kinh điển → 1 shot motion recipe Quote (role="payoff").
- KHÔNG gap > 2 câu giữa 2 shots (đổi hình ~4-5s/lần). Đa dạng kenBurns.
- ⚠️ ĐA DẠNG HÌNH GIỮA CÁC CHƯƠNG: payload có "KEYWORDS_DA_DUNG_O_CHUONG_KHAC" — TUYỆT ĐỐI KHÔNG dùng lại các keyword đó. Mỗi chương phải có bộ hình RIÊNG, hợp nội dung chương. ĐỪNG mặc định lặp "The School of Athens" + 1 tượng cho mọi chương. Tận dụng kho hình rộng:
  • Tượng/chân dung khác nhau: "Socrates bust Vatican", "Plato Roman copy bust", "Aristotle Altemps bust", "Greek philosopher herm sculpture".
  • Tranh cổ điển đa dạng: "The Death of Socrates David", "Socrates dragging Alcibiades Regnault", "Plato's Academy mosaic Pompeii", "Phryne before the Areopagus", "Anselm Feuerbach Symposium painting".
  • Gốm/khảo cổ: "greek red-figure pottery symposium", "black-figure amphora", "ancient greek coin", "papyrus fragment greek text", "Linear B clay tablet".
  • Bối cảnh cụ thể: "Athens Acropolis ruins", "ancient Agora Athens stoa", "Delphi temple ruins", "Aegean sea cliffs", "Greek theatre Epidaurus", "olive grove Attica".
  • Yếu tố vô thời gian (stock): "storm clouds lightning", "ocean waves rocks", "starry sky", "candle flame", "fog forest dawn", "fire embers", "marble texture", "sunbeam dust".
- Mix mục tiêu CHỦ ĐỀ CỔ ĐẠI: ~50% archive (tranh/tượng cổ điển), ~35% stock vô thời gian, ~10% motion (quote), ~5% ai. (Riêng chương 'thời AI': tăng stock hiện đại.)

OUTPUT JSON CHẶT (KHÔNG markdown wrap, KHÔNG meta-text):

{
  "transcript": "Câu 1. Câu 2. ... Câu N.",
  "shots": [
    {"sentenceIdx": 0, "keyword": "ancient stone ruins sunset", "kenBurns": "pan-right", "role": "establishing", "assetType": "stock", "note": ""},
    {"sentenceIdx": 2, "keyword": "The School of Athens Raphael fresco", "kenBurns": "pan-left", "role": "establishing", "assetType": "archive", "note": ""},
    {"sentenceIdx": 4, "keyword": "Socrates marble bust", "kenBurns": "zoom-in", "role": "subject", "assetType": "archive", "note": ""},
    {"sentenceIdx": 6, "keyword": "The Death of Socrates Jacques-Louis David painting", "kenBurns": "zoom-in", "role": "subject", "assetType": "archive", "note": ""},
    {"sentenceIdx": 8, "keyword": "candle flame darkness", "kenBurns": "static", "role": "detail", "assetType": "stock", "note": ""},
    {"sentenceIdx": 10, "keyword": "Quote", "kenBurns": "static", "role": "payoff", "assetType": "motion", "note": ""},
    ...
  ]
}`;

const buildTranscriptUserPrompt = (
  idea: GalleryBrainstormIdea,
  chapter: StoryboardChapter,
  chapterIdx: number,
  adjacentChapters: StoryboardChapter[],
  usedKeywords: string[] = [],
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
    "KEYWORDS_DA_DUNG_O_CHUONG_KHAC (TUYỆT ĐỐI tránh lặp — chọn hình KHÁC, đặc thù nội dung chương này)":
      usedKeywords.length > 0 ? usedKeywords : undefined,
    instruction: `Viết voiceover NGUYÊN VĂN cho chương "${chapter.title}" — ~${chapter.minutes * 160} từ. Shots PHẢI dùng hình ẢNH RIÊNG cho chương này, KHÔNG trùng các keyword đã liệt kê ở KEYWORDS_DA_DUNG_O_CHUONG_KHAC.`,
  };
  return JSON.stringify(payload, null, 2);
};

export async function generateChapterTranscript(input: {
  planId: string;
  chapterIdx: number;
  provider: LLMProvider;
  model: string;
}): Promise<Storyboard> {
  const plan = await getStoryboard(input.planId);
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

  // Keyword đã dùng ở các chương KHÁC (stock/archive) → truyền vào prompt để
  // LLM TRÁNH lặp lại cùng vài tác phẩm/hình ở mọi chương.
  const usedKeywords = Array.from(
    new Set(
      plan.chapters.flatMap((ch, i) =>
        i === input.chapterIdx
          ? []
          : ch.shots
              .filter((s) => s.assetType !== "motion" && s.keyword.trim())
              .map((s) => s.keyword.trim()),
      ),
    ),
  );

  const content = await chat({
    provider: input.provider,
    model: input.model,
    systemPrompt: getEffectivePrompt("gallery.transcript"),
    userContent: buildTranscriptUserPrompt(
      plan.ideaSnapshot,
      chapter,
      input.chapterIdx,
      plan.chapters,
      usedKeywords,
    ),
    temperature: 0.8,
    jsonMode: true,
  });

  // LLM trả JSON {transcript, shots[]}. Backward-compat: chấp nhận
  // `visualBeats` từ LLM nếu prompt cũ vẫn cached.
  const parsed = safeParseJson<{
    transcript?: unknown;
    shots?: unknown;
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
  const rawShots = Array.isArray(parsed.shots)
    ? parsed.shots
    : Array.isArray(parsed.visualBeats)
      ? parsed.visualBeats
      : [];
  const parsedShots: Shot[] = (rawShots as unknown[])
    .map((b) => {
      // Soft-coerce documentary fields trước Zod parse: LLM đôi khi
      // trả enum sai → tránh reject toàn shot, chỉ drop field xấu.
      const obj = (b && typeof b === "object" ? { ...b } : {}) as Record<
        string,
        unknown
      >;
      for (const k of ["role", "assetType", "transitionIn"] as const) {
        if (k in obj && typeof obj[k] !== "string") delete obj[k];
      }
      if ("aiPrompt" in obj && typeof obj.aiPrompt !== "string") {
        delete obj.aiPrompt;
      }
      const r = ShotSchema.safeParse(obj);
      return r.success ? r.data : null;
    })
    .filter((b): b is Shot => b !== null)
    // Bound sentenceIdx vào [0, sentenceCount-1] để không trỏ ra ngoài
    .map((b) => ({
      ...b,
      sentenceIdx: Math.max(0, Math.min(sentenceCount - 1, b.sentenceIdx)),
    }))
    // Đảm bảo monotonic tăng — LLM đôi khi lộn xộn
    .sort((a, b) => a.sentenceIdx - b.sentenceIdx);

  // Documentary direction Phase 2: chạy heuristic classifier per-shot trên
  // câu narration thực tế. Override LLM choices khi heuristic confidence cao
  // (matched knowledge graph entry); chỉ FILL field undefined cho shots LLM
  // bỏ qua. Series infer từ idea title — first proper noun → slug.
  const sentences = splitTranscriptSentences(transcript);
  const series = inferSeriesSlug(plan.ideaSnapshot.title);
  const graph = await loadKnowledgeGraph(series);
  const shots: Shot[] = parsedShots.map((beat) => {
    const sentence = sentences[beat.sentenceIdx] ?? "";
    if (!sentence.trim()) return beat;
    const c = classifyBeatSync({ sentence, graph });
    // High confidence (≥ 0.8): heuristic override LLM choice. Match cụ thể
    // tên tác phẩm/người/địa danh → đáng tin hơn LLM context-based judgment.
    // Lower confidence: chỉ fill khi LLM bỏ trống.
    const trustHeuristic = c.confidence >= 0.8;
    return {
      ...beat,
      role: trustHeuristic ? c.role : beat.role,
      assetType:
        beat.assetType === undefined
          ? c.assetType
          : trustHeuristic
            ? c.assetType
            : beat.assetType,
      aiPrompt:
        beat.aiPrompt ?? (c.assetType === "ai" ? c.aiPrompt : beat.aiPrompt),
    };
  });

  chapter.transcript = transcript;
  chapter.shots = shots;
  chapter.status = "draft";
  plan.provider = input.provider;
  plan.model = input.model;
  plan.updatedAt = new Date().toISOString();
  saveStoryboard(plan);
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

/**
 * Split transcript → sentences array. Index trả về 0-based, đồng bộ với
 * sentenceIdx ở VisualBeat. Documentary Phase 2 dùng để classify per-beat.
 */
export function splitTranscriptSentences(transcript: string): string[] {
  if (!transcript.trim()) return [];
  return transcript
    .split(/[.!?]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * Suy series slug từ title brainstorm idea → key để load knowledge graph
 * trong `gallery/data/seasons/<slug>.json`. Heuristic: lấy first proper-noun
 * (chữ đầu hoa) trong title sau khi strip articles. Vd:
 *   "Giotto di Bondone — Tiền-Phục Hưng Ý" → "giotto"
 *   "Caravaggio và bóng tối" → "caravaggio"
 *   "Một câu chuyện về Vermeer" → "vermeer"
 * Trả null nếu không tìm được proper-noun rõ ràng (knowledge graph fallback
 * sẽ empty, heuristic về detail+archive).
 */
export function inferSeriesSlug(title: string): string | null {
  // Strip Vietnamese articles + common filler words
  const skipWords = new Set([
    "một",
    "câu",
    "chuyện",
    "về",
    "của",
    "và",
    "the",
    "a",
    "an",
    "le",
    "la",
    "el",
  ]);
  const tokens = title
    .replace(/[—–\-,:]/g, " ")
    .split(/\s+/)
    .map((w) => w.trim())
    .filter(Boolean);
  for (const w of tokens) {
    if (skipWords.has(w.toLowerCase())) continue;
    // Proper noun heuristic: chữ cái đầu hoa, không phải digit
    if (/^[A-ZÀ-Ỹ]/.test(w)) {
      return w
        .toLowerCase()
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .replace(/đ/gi, "d")
        .replace(/[^a-z0-9]/g, "");
    }
  }
  return null;
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
): Promise<Storyboard | null> {
  const plan = await getStoryboard(planId);
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
  saveStoryboard(plan);
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
): Promise<Storyboard | null> {
  const plan = await getStoryboard(planId);
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
  saveStoryboard(plan);
  return plan;
}
