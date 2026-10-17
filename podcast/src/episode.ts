import { z } from "zod";
import { MOOD_ACCENTS, SCENE_TYPES } from "./theme";
import { INTRO_SECONDS, hookSeconds } from "./timing";

export const MoodKeySchema = z.enum(
  Object.keys(MOOD_ACCENTS) as [keyof typeof MOOD_ACCENTS, ...Array<keyof typeof MOOD_ACCENTS>],
);

export const SceneTypeSchema = z.enum(SCENE_TYPES);

export const SceneOverrideSchema = z.object({
  startMs: z.number().nonnegative(),
  mood: MoodKeySchema.optional(),
  sceneType: SceneTypeSchema.optional(),
});

/** Video style — Phase 2 team split. Mặc định "podcast" để backward-compat. */
export const StyleSchema = z.enum(["podcast", "gallery"]).default("podcast");

export const EpisodeConfigSchema = z.object({
  /**
   * Video style — quyết định composition Remotion + workspace filter.
   * "podcast" = sticker SVG 9:16, "gallery" = real photos + Ken Burns.
   */
  style: StyleSchema,
  title: z.string().min(1, "title không được để trống"),
  hook: z.string().nullable().default(null),
  episodeNumber: z.number().int().positive(),
  moodOverride: MoodKeySchema.nullable().default(null),
  /**
   * Màu chủ đạo tập (hex, vd "#FF7E9D") — dùng cho MÀU SÓNG (visualizer) để
   * đồng bộ với tông ảnh cover. Null → dùng accent theo mood. Sinh tự động từ
   * ảnh cover bằng derive-accent.ts.
   */
  accentColor: z.string().nullable().default(null),
  bgm: z.string().nullable().default(null),
  bgmVolumeDb: z.number().default(-28),
  /**
   * Số giây NHẠC NỀN kéo dài ở CUỐI video sau khi hết tiếng nói (music-only
   * outro tail). Trong khoảng này giọng đã im, chỉ còn nhạc + thẻ outro rồi fade
   * out. Chỉ áp dụng khi có bgm. 0 = tắt (kết thúc ngay khi hết tiếng).
   */
  outroTailSec: z.number().nonnegative().default(6),
  /**
   * Cách chạy nhạc nền:
   * - "full" (mặc định): nhạc chạy SUỐT video (ducking dưới tiếng nói) + đuôi.
   * - "headtail": chỉ chạy ở đầu (intro+hook+5s) và đuôi, GIỮA tắt nhạc.
   */
  bgmMode: z.enum(["full", "headtail"]).default("full"),
  showIntro: z.boolean().default(true),
  showOutro: z.boolean().default(true),
  /** Bật lớp biên tập gốc trên màn hình (tiêu đề chương + trích dẫn có nguồn). */
  showEditorial: z.boolean().default(true),
  /**
   * Danh sách tên file footage (trong input/footage/) dùng làm NỀN động luân
   * phiên cho tập này. Rỗng = nền sticker mặc định. Xem FootageLayer + §3.2.
   */
  footage: z.array(z.string()).default([]),
  /**
   * Footage NGANG 16:9 cho bản YouTube (input/footage/pexels-yt/...). Pool dọc
   * ở `footage` crop sang 16:9 mất gần hết hình nên cần bộ riêng. Sinh bằng
   * `footage-plan.ts <slug> --landscape --apply`. Bản 16:9 chỉ hỗ trợ nền footage.
   */
  footageLandscape: z.array(z.string()).default([]),
  sceneOverrides: z.array(SceneOverrideSchema).nullable().default(null),
  /** ID essay đã dùng làm input cho NotebookLM. Traceability. */
  essayId: z.string().nullable().default(null),
  /**
   * Filename ảnh cover (jpg/png/webp) trong `input/`. Khi set + showIntro=true
   * → IntroCard render ảnh full-frame thay vì auto-gen từ title.
   */
  coverImage: z.string().nullable().default(null),
  /**
   * Cách fit ảnh cover vào khung 9:16 (1080×1920).
   * - `cover` (default): scale fill, crop bớt cho khớp aspect (mất 1 phần ảnh)
   * - `contain`: scale fit, letterbox bằng nền vàng brand (giữ nguyên ảnh)
   */
  coverFit: z.enum(["cover", "contain"]).default("cover"),
  /**
   * Vị trí crop ảnh khi `coverFit = "cover"` và aspect không khớp 9:16.
   * Ví dụ: 16:9 landscape → 9:16, chọn `top`/`center`/`bottom` để pick strip dọc.
   */
  coverPosition: z.enum(["top", "center", "bottom"]).default("center"),
  /**
   * Ảnh cover 16:9 (input/<slug>.cover-yt.<ext>) — intro bản YouTube + làm
   * thumbnail YouTube. Null → bản 16:9 dùng cover dọc (contain + nền mờ).
   */
  coverImageLandscape: z.string().nullable().default(null),
  /**
   * Prompt tạo ảnh cover 9:16 / thumbnail 16:9 (Midjourney/Flux) — do Claude
   * Code tự viết qua `cover-prompt.ts` (miễn phí), UI chỉ hiển thị + copy.
   */
  coverPrompt: z.string().nullable().default(null),
  coverPromptLandscape: z.string().nullable().default(null),
  // ────── Publishing workflow (tab "Đăng") ──────
  /** Trạng thái publish: draft, ready, scheduled (đã lên lịch FB), published (đã đăng). */
  publishStatus: z.enum(["draft", "ready", "scheduled", "published"]).default("draft"),
  /** ISO timestamp khi user mark published. Null khi chưa published. */
  publishedAt: z.string().nullable().default(null),
  /** ISO thời điểm lên lịch đăng (FB scheduler). Null khi đăng ngay/chưa lên lịch. */
  scheduledPublishTime: z.string().nullable().default(null),
  /** Caption để đăng lên FB Reels — user edit hoặc auto-fill từ essay derivatives. */
  publishCaption: z.string().nullable().default(null),
  /** Hashtags để dán sau caption (mảng riêng để dễ edit như chip). */
  publishHashtags: z.array(z.string()).default([]),
  // ────── Công bố AI + ghi công (Meta originality) ──────
  /**
   * Video dùng giọng đọc AI → bật khối công bố AI trong phần mô tả khi đăng.
   * Meta yêu cầu công bố + ghi lại đóng góp người thật để nội dung AI đủ điều
   * kiện kiếm tiền. Xem docs/originality-upgrade-plan.md §5.1.
   */
  aiAssisted: z.boolean().default(true),
  /** Người/đơn vị biên soạn & biên tập kịch bản (để trống → mặc định brand). */
  scriptCredit: z.string().nullable().default(null),
  /** Ghi công nhạc nền, vd "Scott Buckley — CC BY 4.0". */
  musicCredit: z.string().nullable().default(null),
  /** Ghi công footage stock (vd tác giả Pexels). Chèn vào khối công bố. */
  footageCredit: z.string().nullable().default(null),
  /** Nguồn tham khảo hiển thị trong phần công bố (tên hoặc URL). */
  sources: z.array(z.string()).default([]),
  // ────── Kết quả đăng Facebook Reel (đăng trực tiếp từ app) ──────
  /** Video/Reel id trả về từ Graph API sau khi đăng thành công. */
  fbReelId: z.string().nullable().default(null),
  /** Permalink công khai của Reel đã đăng. */
  fbPermalink: z.string().nullable().default(null),
  /** Playlist đã chọn (chỉ lưu để nhắc thêm tay — API không cho tự thêm). */
  fbPlaylistId: z.string().nullable().default(null),
  fbPlaylistName: z.string().nullable().default(null),
  // ────── Đăng YouTube (bản 16:9, upload TAY — app chỉ soạn data + lưu kết quả) ──────
  /** Ghi công footage NGANG (Pexels) của bản YouTube — footage-plan --landscape tự điền. */
  footageCreditLandscape: z.string().nullable().default(null),
  /** Tiêu đề video YouTube (≤100 ký tự). Null → dùng title tập. */
  ytTitle: z.string().nullable().default(null),
  /** Phần mô tả do người viết (chapter + công bố AI được ghép tự động khi copy). */
  ytDescription: z.string().nullable().default(null),
  /** Tags YouTube (ô "Thẻ" trong Studio). */
  ytTags: z.array(z.string()).default([]),
  /** Hashtag YouTube (3 cái đầu hiện trên tiêu đề video). */
  ytHashtags: z.array(z.string()).default([]),
  /** Trạng thái đăng YouTube — tách khỏi publishStatus (Facebook). */
  ytPublishStatus: z.enum(["draft", "published"]).default("draft"),
  ytPublishedAt: z.string().nullable().default(null),
  /** Link video YouTube sau khi upload tay. */
  ytUrl: z.string().nullable().default(null),
});

export type EpisodeConfig = z.infer<typeof EpisodeConfigSchema>;

/**
 * Số FRAME nhạc-nền-đuôi ở cuối video (music-only outro tail). Chỉ >0 khi có
 * bgm và outroTailSec>0. Dùng chung ở Root (tổng duration), Video (vùng outro)
 * và pipeline footage (mixBgmIntoVoice tailSec) để không lệch nhau.
 */
export const outroTailFrames = (
  episode: Pick<EpisodeConfig, "bgm" | "outroTailSec">,
  fps: number,
): number =>
  episode.bgm && episode.outroTailSec > 0
    ? Math.round(episode.outroTailSec * fps)
    : 0;

/**
 * Số FRAME mở đầu CHỈ CÓ NHẠC (intro + hook) trước khi giọng nói bắt đầu.
 * Audio trò chuyện + caption/sóng/cảnh/editorial được dời đúng chừng này; nhạc
 * nền chạy từ frame 0. Dùng chung Root (tổng duration), Video (Sequence giọng)
 * và pipeline footage (pad im lặng đầu voice trước khi mix nhạc).
 */
export const speechLeadFrames = (
  episode: Pick<EpisodeConfig, "showIntro" | "hook">,
  fps: number,
): number =>
  (episode.showIntro ? Math.round(fps * INTRO_SECONDS) : 0) +
  (episode.hook ? Math.round(fps * hookSeconds(episode.hook)) : 0);

export const buildEpisodeTemplate = (
  name: string,
  style: EpisodeConfig["style"] = "podcast",
): EpisodeConfig => ({
  style,
  title: name,
  hook: null,
  episodeNumber: 1,
  moodOverride: null,
  accentColor: null,
  bgm: null,
  bgmVolumeDb: -28,
  outroTailSec: 6,
  bgmMode: "full",
  showIntro: true,
  showOutro: true,
  showEditorial: true,
  footage: [],
  footageLandscape: [],
  sceneOverrides: null,
  essayId: null,
  coverImage: null,
  coverFit: "cover",
  coverPosition: "center",
  coverImageLandscape: null,
  coverPrompt: null,
  coverPromptLandscape: null,
  publishStatus: "draft",
  publishedAt: null,
  scheduledPublishTime: null,
  publishCaption: null,
  publishHashtags: [],
  aiAssisted: true,
  scriptCredit: null,
  musicCredit: null,
  footageCredit: null,
  sources: [],
  fbReelId: null,
  fbPermalink: null,
  fbPlaylistId: null,
  fbPlaylistName: null,
  footageCreditLandscape: null,
  ytTitle: null,
  ytDescription: null,
  ytTags: [],
  ytHashtags: [],
  ytPublishStatus: "draft",
  ytPublishedAt: null,
  ytUrl: null,
});
