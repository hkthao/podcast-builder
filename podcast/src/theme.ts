import { staticFile } from "remotion";
import { loadFont as loadBaloo2 } from "@remotion/google-fonts/Baloo2";
import { loadFont as loadBeVietnamPro } from "@remotion/google-fonts/BeVietnamPro";

const baloo2 = loadBaloo2("normal", {
  weights: ["600", "700", "800"],
  subsets: ["vietnamese", "latin"],
});
const beVietnamPro = loadBeVietnamPro("normal", {
  weights: ["500", "600", "700"],
  subsets: ["vietnamese", "latin"],
});

export const FONTS = {
  display: `"${baloo2.fontFamily}", system-ui, sans-serif`,
  body: `"${beVietnamPro.fontFamily}", system-ui, sans-serif`,
};

/**
 * Brand palette v3 — TƯƠI SÁNG SCRAPBOOK theo bullet journal aesthetic.
 * 3 token bất biến: bg vàng tươi + ink navy + white sticker outline.
 * Tránh đỏ máu / xám tối — accentRed thực ra là hồng coral, accentTeal là xanh mint.
 */
export const COLORS = {
  bg: "#FFD400",
  bgAlt: "#FFF4E0",
  ink: "#16244F",
  inkMuted: "#5C6885",
  white: "#FFFFFF",
  /** "đỏ" trong code = hồng coral tươi, không phải đỏ máu. */
  accentRed: "#FF7E9D",
  accentBlue: "#3F6FD0",
  /** "teal" trong code = xanh mint tươi. */
  accentTeal: "#7DDDB2",
  /** Màu giấy grid mờ trên bg vàng. */
  gridLine: "rgba(22, 36, 79, 0.06)",
} as const;

export type MoodKey =
  | "positive"
  | "social"
  | "healing"
  | "energetic"
  | "contemplative";

export const MOOD_ACCENTS: Record<MoodKey, string> = {
  positive: COLORS.accentRed,
  social: COLORS.accentBlue,
  healing: COLORS.accentTeal,
  energetic: COLORS.accentRed,
  contemplative: COLORS.ink,
};

/** Mood `contemplative` dùng nền kem thay vì vàng để đổi không khí. */
export const MOOD_BG: Record<MoodKey, string> = {
  positive: COLORS.bg,
  social: COLORS.bg,
  healing: COLORS.bg,
  energetic: COLORS.bg,
  contemplative: COLORS.bgAlt,
};

export const TYPE_SCALE = {
  hook: 96,
  title: 72,
  caption: 60,
  meta: 38,
  watermark: 30,
} as const;

/**
 * SAFE_ZONE v2 — đo trực tiếp trên FB Reels mobile (06/2026).
 * Bottom rộng vì FB chèn caption + user info + title + comment input.
 * Right rộng vì cột action buttons (like/comment/share/save) lấy ~120-140px.
 */
export const SAFE_ZONE = {
  top: 160,
  bottom: 380,
  left: 80,
  right: 140,
} as const;

export const BRAND = {
  channelName: "ByteCast Tech",
  /** Slogan in trong logo lockup — show dưới logo ở Intro/Outro. */
  slogan: "Giữa Công Nghệ Và Bản Chất Con Người",
  /**
   * Mô tả kênh — dùng cho metadata video / mô tả Facebook khi cần.
   * Không hiển thị trong video render.
   */
  description:
    "ByteCast Tech khám phá những câu hỏi lớn của thời đại AI, nơi công nghệ giao thoa với triết học, tâm lý học và xã hội học để giúp chúng ta hiểu rõ hơn về con người, ý nghĩa và tương lai.",
  /** Logo lockup đầy đủ (1536×1024 PNG) — dùng ở Intro/Outro. */
  logoSrc: staticFile("brand/logo.png"),
  /**
   * Logo lockup ByteCast Tech (1536×1024 PNG RGBA) — paper-card style với
   * brand text "ByteCast Tech" sẵn trong ảnh. Dùng ở Watermark — không cần
   * thêm text "ByteCast Tech" bên cạnh nữa.
   */
  markSrc: staticFile("brand/logo-bytecast.png"),
  cta: "Theo dõi để xem thêm",
} as const;

export const FPS = 30;

export const FORMAT = {
  width: 1080,
  height: 1920,
} as const;

export const withAlpha = (hex: string, alpha: number): string => {
  const a = Math.round(Math.max(0, Math.min(1, alpha)) * 255)
    .toString(16)
    .padStart(2, "0");
  return `${hex}${a}`;
};

/**
 * Bộ scene recipe — mỗi key là một bố cục sticker + doodle trong
 * `src/components/scenes/`. PodcastDesk là mặc định / fallback.
 */
export const SCENE_TYPES = [
  "PodcastDesk",
  "Idea",
  "Connection",
  "Crowd",
  "InnerSelf",
  "Choice",
  "Knowledge",
  // ──────── 10 scene mới (Phase visual-richness) ────────
  "OnAir",
  "DualMic",
  "Journal",
  "Morning",
  "Listening",
  "Voices",
  "Growth",
  "Quote",
  "Doubt",
  "LettingGo",
  // ──────── Phase 3: giving / transformation (từ essay "Cho đi") ────────
  "Sacrifice",
  "Metamorphosis",
  "Bridge",
  "Mirror",
  "Threshold",
] as const;

export type SceneType = (typeof SCENE_TYPES)[number];

export const DEFAULT_SCENE: SceneType = "PodcastDesk";
