import { staticFile } from "remotion";
import { loadFont as loadLora } from "@remotion/google-fonts/Lora";
import { loadFont as loadBeVietnamPro } from "@remotion/google-fonts/BeVietnamPro";

const lora = loadLora("normal", { weights: ["400", "500", "600"], subsets: ["vietnamese", "latin"] });
const beVietnamPro = loadBeVietnamPro("normal", { weights: ["400", "500", "600"], subsets: ["vietnamese", "latin"] });

export const FONTS = {
  display: `"${lora.fontFamily}", Georgia, serif`,
  body: `"${beVietnamPro.fontFamily}", system-ui, sans-serif`,
};

export const COLORS = {
  bg: "#0E0F13",
  bgLayer: "#1A1C22",
  textPrimary: "#ECE8E1",
  textMuted: "#8A8A94",
  signature: "#C9A96A",
  accentCool: "#5E7C8B",
} as const;

export type MoodKey = "social" | "emotional" | "existential" | "contemplative";

export const MOOD_ACCENTS: Record<MoodKey, string> = {
  social: "#5E7C8B",
  emotional: "#A56B5C",
  existential: "#6E5E7C",
  contemplative: "#7C8B5E",
};

export const TYPE_SCALE = {
  hook: 88,
  title: 64,
  caption: 56,
  meta: 36,
  watermark: 28,
} as const;

export const SAFE_ZONE = {
  top: 120,
  bottom: 280,
  left: 60,
  right: 60,
} as const;

export const BRAND = {
  channelName: "Triết Học Đời Thường",
  logoSrc: staticFile("brand/logo.svg"),
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
