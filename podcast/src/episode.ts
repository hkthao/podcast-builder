import { z } from "zod";
import { MOOD_ACCENTS, SCENE_TYPES } from "./theme";

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
  bgm: z.string().nullable().default(null),
  bgmVolumeDb: z.number().default(-28),
  showIntro: z.boolean().default(true),
  showOutro: z.boolean().default(true),
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
  // ────── Publishing workflow (tab "Đăng") ──────
  /** Trạng thái publish: draft (chưa review), ready (sẵn đăng), published (đã đăng). */
  publishStatus: z.enum(["draft", "ready", "published"]).default("draft"),
  /** ISO timestamp khi user mark published. Null khi chưa published. */
  publishedAt: z.string().nullable().default(null),
  /** Caption để đăng lên FB Reels — user edit hoặc auto-fill từ essay derivatives. */
  publishCaption: z.string().nullable().default(null),
  /** Hashtags để dán sau caption (mảng riêng để dễ edit như chip). */
  publishHashtags: z.array(z.string()).default([]),
});

export type EpisodeConfig = z.infer<typeof EpisodeConfigSchema>;

export const buildEpisodeTemplate = (
  name: string,
  style: EpisodeConfig["style"] = "podcast",
): EpisodeConfig => ({
  style,
  title: name,
  hook: null,
  episodeNumber: 1,
  moodOverride: null,
  bgm: null,
  bgmVolumeDb: -28,
  showIntro: true,
  showOutro: true,
  sceneOverrides: null,
  essayId: null,
  coverImage: null,
  coverFit: "cover",
  coverPosition: "center",
  publishStatus: "draft",
  publishedAt: null,
  publishCaption: null,
  publishHashtags: [],
});
