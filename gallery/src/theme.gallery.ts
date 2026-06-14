/**
 * Gallery theme — phim tài liệu nghệ thuật 16:9.
 *
 * Hoàn toàn riêng với `podcast/src/theme.ts` (vàng rực sticker). Style ở đây
 * là bảo tàng: nền than ấm, chữ kem, nhấn vàng đồng (gold leaf) gợi khung
 * tranh cổ. Tempo chậm, serif display, không loè loẹt.
 *
 * KHÔNG dùng const ở module này cho podcast và ngược lại — strict separation
 * (Mục 16.1 PLAN).
 */
import { staticFile } from "remotion";

// ─── Palette trầm bảo tàng ──────────────────────────────────────────────
/**
 * Nền than ấm + chữ kem trắng ngà + vàng đồng accent.
 * Mood accents: 4 màu nhấn cho ChapterCard underline + lower-third tint.
 */
export const COLORS = {
  /** Nền than ấm — base render */
  bg: "#1A1612",
  /** Nền lower-third đậm hơn — gradient mờ */
  bgAlt: "#0F0D0A",
  /** Foreground chữ chính — kem trắng ngà */
  ink: "#F4EEDD",
  /** Muted text — hint / metadata */
  inkMuted: "#A99F8E",
  /** Vàng đồng — gold leaf accent gợi khung tranh cổ */
  goldLeaf: "#C8A24B",
  /** Vàng đồng tối — viền khung / divider */
  goldLeafSoft: "#7A6531",
  /** Trắng tinh — chỉ dùng nơi cần contrast tối đa */
  white: "#FFFFFF",
  // Mood-specific tints (cũng được expose qua MOOD_ACCENTS bên dưới)
  moodReverent: "#2A4D6E",
  moodDramatic: "#7A2A2E",
  moodScholarly: "#1E2E4D",
  moodTriumphant: "#C8A24B",
} as const;

/**
 * Map chapter mood → accent color. Sync với `ChapterMoodSchema` ở
 * `gallery/src/episode.ts`.
 */
export const MOOD_ACCENTS = {
  reverent: COLORS.moodReverent,
  dramatic: COLORS.moodDramatic,
  scholarly: COLORS.moodScholarly,
  triumphant: COLORS.moodTriumphant,
} as const;

export type MoodKey = keyof typeof MOOD_ACCENTS;

// ─── Format 16:9 ───────────────────────────────────────────────────────
export const FORMAT = {
  width: 1920,
  height: 1080,
  aspect: "16:9",
} as const;

/**
 * 24fps — tông điện ảnh + giảm 20% frame so với 30fps cho video 2h
 * (~172.8k frame vs ~216k @ 30fps). Lý do quan trọng: chi phí render
 * quadratic theo tổng frame.
 */
export const FPS = 24;

// ─── Safe zone 16:9 cho YouTube ────────────────────────────────────────
/**
 * YouTube không cover bằng bottom bar dày như Facebook, nhưng cần chừa:
 *  - bottom: ~120px cho progress bar khi user hover + duration overlay
 *  - bottom-right: ~120×80px cho CC button
 *  - bottom-left: ~280×60px cho "Watch later" / channel name overlay
 *  - top: ~5% cho status badge
 *
 * Lower-third caption đặt y=[840, 1010] (chừa room bottom + tránh CC).
 */
export const SAFE_ZONE = {
  top: 60,
  bottom: 120,
  left: 80,
  right: 80,
  /** Lower-third (phụ đề) y position — chừa bottom + tránh CC overlay */
  lowerThirdY: 880,
  lowerThirdHeight: 140,
  /** ChapterCard center — đầu mỗi chương */
  chapterCardCenterY: 500,
  /** ArtworkLabel (nhãn tác phẩm) — góc dưới-trái */
  artworkLabelX: 80,
  artworkLabelY: 940,
} as const;

// ─── Typography ────────────────────────────────────────────────────────
/**
 * Display serif cho chapter title + tựa. Body sans trung tính cho phụ đề.
 * Vì kênh nói tiếng Anh, không cần lo dấu tiếng Việt như style 1.
 *
 * Loader qua @remotion/google-fonts (xem `gallery/src/fonts.ts` Phase 19).
 */
export const FONTS = {
  /** Display serif — chapter title, video tựa, intro/outro */
  display: '"Playfair Display", "Cormorant Garamond", Georgia, serif',
  /** Body sans — phụ đề lower-third, nhãn tác phẩm */
  body: '"Inter", "Helvetica Neue", Arial, sans-serif',
  /** Mono — metadata (năm, archive ref), credits */
  mono: '"JetBrains Mono", Menlo, "Courier New", monospace',
} as const;

export const TYPE_SCALE = {
  /** Tên chương hero — đầu mỗi chương */
  chapterCardTitle: 96,
  /** Phụ chương — năm/giai đoạn */
  chapterCardSubtitle: 32,
  /** Tên tác phẩm — nhãn góc */
  artworkLabelTitle: 36,
  /** Metadata tác phẩm — năm + nơi lưu giữ */
  artworkLabelMeta: 22,
  /** Phụ đề lower-third */
  captionLine: 44,
  /** Line-height phụ đề */
  captionLineHeight: 60,
  /** Watermark "St. Paul Gallery" */
  watermarkChannel: 28,
} as const;

// ─── Brand ────────────────────────────────────────────────────────────
/**
 * Logo gallery TBD — Phase 19 Watermark sẽ check tồn tại file và fallback
 * sang text-only nếu chưa có.
 */
export const BRAND = {
  channelName: "St. Paul Gallery",
  tagline: "Documentaries on the masters of art",
  /** Path tới logo file. Phase 19 check + fallback text. */
  logoSrc: staticFile("brand/gallery-logo.png"),
} as const;

// ─── Animation tempo ──────────────────────────────────────────────────
/**
 * Tài liệu nghệ thuật cần điềm tĩnh: tempo chậm + tuyến tính.
 * Map mood → tốc độ Ken Burns (scale end + duration multiplier).
 *
 * scaleEnd = 1.08 → zoom 8% trong durationInFrames * multiplier frame.
 */
export const KEN_BURNS_TEMPO = {
  reverent: { scaleEnd: 1.08, durationMultiplier: 1.2 },
  dramatic: { scaleEnd: 1.14, durationMultiplier: 0.85 },
  scholarly: { scaleEnd: 1.1, durationMultiplier: 1.0 },
  triumphant: { scaleEnd: 1.12, durationMultiplier: 0.95 },
} as const;

/** Cross-fade giữa assets trong cùng 1 chapter. */
export const CROSSFADE_MS = 800;

/** Chapter card hiển thị bao lâu đầu mỗi chương (ms). */
export const CHAPTER_CARD_DURATION_MS = 3000;

/** Artwork label hiển thị khi asset mới load (ms). */
export const ARTWORK_LABEL_DURATION_MS = 5000;

// ─── Helper ───────────────────────────────────────────────────────────
/** Convert hex color + alpha 0-1 → rgba string. */
export const withAlpha = (hex: string, alpha: number): string => {
  const a = Math.round(Math.max(0, Math.min(1, alpha)) * 255)
    .toString(16)
    .padStart(2, "0");
  return `${hex}${a}`;
};
