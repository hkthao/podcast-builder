/**
 * Shot — đơn vị hình ảnh nhỏ nhất trong storyboard (đổi tên từ "VisualBeat"
 * để đồng bộ thuật ngữ video-making, theo PLAN_STORYBOARD + ViMax convention).
 *
 * Khi user duyệt 1 narration chapter của storyboard, LLM sinh KÈM:
 *   - transcript (prose) cho TTS đọc
 *   - shots (sidecar) — danh sách "khoảnh khắc hình ảnh" anchored theo
 *     sentence index trong transcript
 *
 * Lúc render, shots được align với word timestamps từ TTS+Whisper để biết
 * MỖI SHOT bắt đầu/kết thúc tại millisecond nào trong audio.
 *
 * Anchor design: dùng sentenceIdx (0-indexed sau khi split bằng [.!?]) thay vì
 * char range. Fragile hơn token nhưng survive edit nhẹ (sửa chính tả, từ vựng).
 * Nếu user edit nặng → mismatch → UI hiện cảnh báo + nút "Re-suggest shots".
 *
 * Backward-compat: legacy data trong DB có field "visualBeats" — store layer
 * tự nhận biết khi rowToStoryboard load JSON (đọc cả 2 tên, prefer "shots").
 */
import { z } from "zod";

/** Hiệu ứng camera trên ảnh tĩnh — Remotion render với interpolate. */
export const KEN_BURNS_MODES = [
  "zoom-in",      // phóng to vào trung tâm (default cho ảnh chân dung)
  "zoom-out",     // thu nhỏ ra (default cho ảnh toàn cảnh)
  "pan-left",     // dịch từ phải sang trái
  "pan-right",    // dịch từ trái sang phải
  "pan-up",       // dịch lên (cho tranh cao/dọc)
  "pan-down",     // dịch xuống
  "static",       // không motion (cho text/diagram)
] as const;
export type KenBurnsMode = (typeof KEN_BURNS_MODES)[number];

// ─── Documentary direction — Phase 1 schema additive ─────────────────────
// 4 enum dưới đây dùng cho documentary pipeline (Gallery refactor). Beats
// hiện có chỉ field `keyword` + `kenBurns` — không đủ để planner/resolver
// biết "shot này role gì, nguồn asset nào, transition vào ra sao". 4 field
// optional thêm vào VisualBeatSchema phía dưới giải quyết vấn đề này mà
// KHÔNG break beats cũ (Zod default + safeParse trong rowToPlan).

/**
 * Vai trò shot trong mạch kể tài liệu — ảnh hưởng tốc độ cắt + transition.
 * Lấy từ ngôn ngữ phim tài liệu chuyên nghiệp (Burns, BBC, Khan Academy
 * Smarthistory). Khác với chapter mood (reverent/dramatic/scholarly/...)
 * là phạm trù emotional; role là phạm trù dramaturgy.
 */
export const SHOT_ROLES = [
  "establishing", // mở không gian/thời gian — giữ lâu, chậm
  "subject",      // nhân vật/chủ thể chính — chân dung, tượng
  "detail",       // cận cảnh, nhấn 1 ý — chữ ký, nét cọ, ngón tay
  "concept",      // ý trừu tượng → motion graphic (perspective, chiaroscuro)
  "transition",   // cầu nối giữa 2 đoạn — short bridge
  "payoff",       // cao trào / câu chốt — cho phép nhấn mạnh
] as const;
export type ShotRole = (typeof SHOT_ROLES)[number];
export const ShotRoleSchema = z.enum(SHOT_ROLES);

/**
 * Nguồn asset — quyết định resolver backend nào fetch về.
 *  - stock:   Pexels API (footage thật, modern landscape)
 *  - ai:      Draw Things manual (cảnh không thể quay được vd "Padua 1305")
 *  - archive: Wikimedia Commons (tranh/tượng public-domain)
 *  - motion:  Remotion vẽ động (Quote, Timeline, LogicDiagram, ...)
 *
 * Orthogonal với AssetKindSchema ("image" | "video" | "audio") ở episode.ts:
 * một asset stock có thể là video Pexels HOẶC ảnh Pexels — assetType chỉ
 * nguồn, kind chỉ file format.
 */
export const ASSET_TYPES = ["stock", "ai", "archive", "motion"] as const;
export type AssetType = (typeof ASSET_TYPES)[number];
export const AssetTypeSchema = z.enum(ASSET_TYPES);

/**
 * Transition VÀO shot này từ shot trước. Documentary KHÔNG cut đều — mỗi
 * loại transition truyền 1 cảm xúc khác. Planner gợi ý theo role; user
 * có thể override per-beat.
 */
export const TRANSITIONS = [
  "cut",       // cắt thẳng — nhịp nhanh, kịch tính
  "crossfade", // hoà mờ — default tài liệu, trang nhã
  "fadeblack", // qua đen — đổi chương/đổi không khí lớn
  "whippan",   // lia nhanh — chỉ dùng tiết chế cho payoff
] as const;
export type Transition = (typeof TRANSITIONS)[number];
export const TransitionSchema = z.enum(TRANSITIONS);

/**
 * Default transition theo role — Planner dùng khi LLM/user không override.
 * Đồng bộ với storyboard.ts trong imported plan (Downloads/files/).
 */
export const DEFAULT_TRANSITION_BY_ROLE: Record<ShotRole, Transition> = {
  establishing: "fadeblack",
  subject: "crossfade",
  detail: "cut",
  concept: "crossfade",
  transition: "crossfade",
  payoff: "whippan",
};

/**
 * Default Ken Burns mode theo role — heuristic ban đầu, user override per-beat.
 * Cinematic conventions:
 *  - establishing: zoom-out (mở rộng không gian)
 *  - subject:      zoom-in (chân dung hút vào)
 *  - detail:       static hoặc pan nhẹ
 *  - concept:      static (motion graphic tự có chuyển động)
 *  - transition:   zoom-in
 *  - payoff:       zoom-in chậm
 */
export const DEFAULT_KEN_BURNS_BY_ROLE: Record<ShotRole, KenBurnsMode> = {
  establishing: "zoom-out",
  subject: "zoom-in",
  detail: "static",
  concept: "static",
  transition: "zoom-in",
  payoff: "zoom-in",
};

/**
 * Dải duration (ms) gợi ý theo role — KHÔNG enforce ở Phase 1 (timing
 * vẫn align theo word timestamps + sentenceIdx). Để planner/UI sau này
 * dùng làm hint khi cần split sentence dài.
 */
export const SHOT_DURATION_MS: Record<ShotRole, { min: number; max: number }> =
  {
    establishing: { min: 4000, max: 7000 },
    subject: { min: 3000, max: 6000 },
    detail: { min: 2000, max: 4000 },
    concept: { min: 4000, max: 8000 },
    transition: { min: 1500, max: 3000 },
    payoff: { min: 3000, max: 6000 },
  };

export const ShotSchema = z.object({
  /**
   * Sentence index (0-based) trong transcript chapter. Anchor để biết
   * shot bắt đầu ở câu nào. Render engine align với TTS word timestamps
   * để tính ms.
   */
  sentenceIdx: z.number().int().min(0),
  /**
   * Mô tả hình ảnh cần hiển thị — keyword search cho Wikimedia/Met +
   * gợi ý cho asset team. Vd: "Mona Lisa portrait close-up", "Arena Chapel
   * interior wide shot", "Lamentation Mary cradling Christ detail".
   * NÊN dùng tiếng Anh để search engine ra ảnh đúng (tên tác phẩm gốc).
   *
   * Allow empty cho shot user thêm thủ công ("Thêm shot" trên UI) — sẽ
   * fill keyword sau. Render thấy keyword rỗng → placeholder text.
   */
  keyword: z.string().default(""),
  /**
   * Asset đã pin/save trong Research library — link tới gallery_assets.id.
   * Null = chưa attach, shot chỉ có keyword. User attach sau khi review.
   */
  assetIdRef: z.string().nullable().default(null),
  /** Camera motion. Default "zoom-in" cho ảnh chân dung/portrait. */
  kenBurns: z.enum(KEN_BURNS_MODES).default("zoom-in"),
  /**
   * Override thời lượng (ms). null = auto = từ start của câu này đến start
   * câu của shot sau (hoặc end audio). Set khi muốn shot ngắn/dài thủ công.
   */
  durationMs: z.number().int().nullable().default(null),
  /** Note tự do cho asset team — vd "ảnh phải có chữ ký Giotto trong góc". */
  note: z.string().default(""),

  // ── Documentary direction (Phase 1) — optional, backward-compatible ──
  // Shots cũ load qua rowToStoryboard → safeParse: thiếu các field này thì
  // Zod áp default ("detail" cho role) hoặc giữ undefined (assetType/aiPrompt/
  // transitionIn). Tránh `.optional()` cho role vì nó đáng có default rõ.

  /**
   * Vai trò shot trong mạch kể. Default "detail" (an toàn, cắt nhanh hơn
   * establishing). Planner ở Phase 2 sẽ classify theo narration text.
   */
  role: ShotRoleSchema.default("detail"),

  /**
   * Nguồn asset cần resolver fetch. Undefined = chưa classify; resolver
   * suy ra từ assetIdRef nếu user đã pin asset từ Research library, hoặc
   * skip shot khỏi resolve queue.
   */
  assetType: AssetTypeSchema.optional(),

  /**
   * Prompt sinh ảnh AI — chỉ có giá trị khi assetType="ai". Planner ở Phase 2
   * auto-build theo template, user edit qua UI Resolve panel. Lưu để audit
   * + re-gen nếu Draw Things ra ảnh không ưng.
   */
  aiPrompt: z.string().optional(),

  /**
   * Transition VÀO shot này. Undefined = render dùng DEFAULT_TRANSITION_BY_ROLE.
   * Cho phép user override per-shot khi cần nhịp đặc biệt (vd whippan trước
   * payoff thay vì crossfade mặc định cho subject).
   */
  transitionIn: TransitionSchema.optional(),
});
export type Shot = z.infer<typeof ShotSchema>;

// ── Legacy alias — backward-compat for in-flight imports ─────────────────
// VisualBeat đã rename thành Shot (PLAN_STORYBOARD sync). Giữ alias để
// downstream files có thể migrate dần, không phải rename cùng commit.
/** @deprecated Use `Shot` */
export type VisualBeat = Shot;
/** @deprecated Use `ShotSchema` */
export const VisualBeatSchema = ShotSchema;
