/**
 * Gallery episode schema — phim tài liệu nghệ thuật 16:9.
 * Hoàn toàn riêng biệt với `podcast/src/episode.ts`. Đơn vị thời gian ms.
 *
 * Chapter là đơn vị cắt cảnh (khác podcast cắt theo gap audio). Mỗi chương:
 *   - startMs: mốc bắt đầu (endMs = startMs chương kế; chương cuối = hết audio)
 *   - title: hiện trên ChapterCard + dùng cho YouTube chapters
 *   - artworks[]: list tác phẩm nhắc tới (sinh ở Phase 18 plan-assets)
 *   - assets[]: ảnh/clip render theo thứ tự (Phase 19 AssetStage)
 *   - mood: tô màu lower-third + tốc độ Ken Burns
 *
 * Asset có thể là LINK (remoteUrl) hoặc LOCAL (file). Link-only strategy
 * (theo user constraint disk): manifest lưu remoteUrl + metadata, render
 * pipeline (Phase 22) tải vào shared/asset-cache/ khi cần.
 */
import { z } from "zod";
import { AssetTypeSchema } from "./shot";

export const ChapterMoodSchema = z.enum([
  "reverent",
  "dramatic",
  "scholarly",
  "triumphant",
]);

export const KenBurnsModeSchema = z.enum([
  "zoomIn",
  "zoomOut",
  "panLeft",
  "panRight",
  "none",
]);

export const AssetKindSchema = z.enum(["image", "video", "audio"]);

/**
 * licenseStatus quyết định:
 *   - safe   → render thoải mái (public domain / Pexels-like license)
 *   - check  → user phải tick xác nhận trước khi render
 *   - blocked → KHÔNG render, chỉ giữ trong manifest cho audit
 */
export const LicenseStatusSchema = z.enum(["safe", "check", "blocked"]);

export const ChapterAssetSchema = z.object({
  /**
   * Asset source — EXACTLY 1 trong 2 phải có:
   *   - `remoteUrl`: link gốc, render time tải về cache (Phase 22 + 26)
   *   - `file`: path tương đối tới `input/<name>.assets/<chapterId>/<file>`
   *     (dùng khi user thả file local thủ công, không qua research panel)
   */
  remoteUrl: z.string().url().optional(),
  file: z.string().optional(),

  kind: AssetKindSchema.default("image"),
  title: z.string().optional(),
  author: z.string().optional(),
  year: z.string().optional(),

  // Provenance — cho credits + manifest audit
  provider: z.string().optional(),
  sourcePage: z.string().url().optional(),
  license: z.string().optional(),
  licenseStatus: LicenseStatusSchema.default("check"),

  // Render behavior
  kenBurns: KenBurnsModeSchema.default("zoomIn"),
  /** Thời gian hiển thị (ms). Bỏ trống → chia đều trong chương. */
  holdMs: z.number().int().positive().optional(),

  // ── Documentary direction (Phase 1) — optional, backward-compatible ──

  /**
   * Nguồn asset (stock/ai/archive/motion). Phân biệt với `kind` (image/
   * video/audio = file format) ở trên: assetType chỉ nguồn lấy về.
   * Undefined cho asset cũ chưa được classify. Resolver mới (Phase 3) sẽ
   * fill khi tải về tự động.
   */
  assetType: AssetTypeSchema.optional(),

  /**
   * Prompt sinh ảnh AI — chỉ có khi assetType="ai" (Draw Things manual
   * workflow). Lưu để audit + re-gen sau khi tinh chỉnh.
   */
  aiPrompt: z.string().optional(),
});

export const ChapterSchema = z.object({
  /** Slug ổn định, vd "ch-03" — dùng cho asset folder + manifest. */
  id: z.string().regex(/^ch-\d{2,}$/, "id phải dạng ch-NN"),
  startMs: z.number().int().nonnegative(),
  title: z.string().min(1),
  /** Tác phẩm nhắc trong chương (sinh ở Phase 18, user sửa). */
  artworks: z.array(z.string()).default([]),
  /** Ảnh/clip render theo thứ tự. Empty = Phase 22 chỉ render text card. */
  assets: z.array(ChapterAssetSchema).default([]),
  mood: ChapterMoodSchema.default("scholarly"),
  /** Optional BGM override — ref tới asset.remoteUrl hoặc asset.file. */
  bgmAsset: z.string().optional(),
});

export const GalleryEpisodeConfigSchema = z.object({
  title: z.string().min(1),
  episodeNumber: z.number().int().positive(),
  /** Tên series, vd "Giotto", "Rembrandt". Cross-episode asset DB key. */
  series: z.string().optional(),
  /** Whisper language code. Default "en" — kênh Gallery nói tiếng Anh. */
  language: z.string().default("en"),
  chapters: z.array(ChapterSchema).default([]),
  showIntro: z.boolean().default(true),
  showOutro: z.boolean().default(true),
});

export type Chapter = z.infer<typeof ChapterSchema>;
export type ChapterAsset = z.infer<typeof ChapterAssetSchema>;
export type ChapterMood = z.infer<typeof ChapterMoodSchema>;
export type KenBurnsMode = z.infer<typeof KenBurnsModeSchema>;
export type GalleryEpisodeConfig = z.infer<typeof GalleryEpisodeConfigSchema>;

/** Container file format cho `input/<name>.chapters.json` (read-write). */
export const ChaptersFileSchema = z.object({
  chapters: z.array(ChapterSchema),
});

export type ChaptersFile = z.infer<typeof ChaptersFileSchema>;
