import { COLORS, FONTS } from "../theme";

/**
 * Chữ kiểu 3D bubble sticker — viền trắng dày + đổ bóng cứng kiểu sticker
 * cắt dán. Dùng cho Hook / IntroCard title / OutroCard CTA. Đặt trực
 * tiếp trên nền vàng, KHÔNG cần card trắng phía dưới (chữ tự là sticker).
 */
type Props = {
  children: React.ReactNode;
  fontSize: number;
  color?: string;
  /** Bề dày viền trắng (px). Default 10. */
  outlineWidth?: number;
  /** Offset shadow (px). Default 10. */
  shadowOffset?: number;
  /** Màu shadow. Default navy. */
  shadowColor?: string;
  align?: "left" | "center" | "right";
  letterSpacing?: string;
  lineHeight?: number;
  fontWeight?: number;
  fontFamily?: string;
  maxWidth?: number | string;
};

const buildOutline = (w: number, color: string): string => {
  const offsets: Array<[number, number]> = [];
  const steps = 16;
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    offsets.push([Math.cos(a) * w, Math.sin(a) * w]);
  }
  return offsets.map(([x, y]) => `${x.toFixed(1)}px ${y.toFixed(1)}px 0 ${color}`).join(", ");
};

export const StickerText: React.FC<Props> = ({
  children,
  fontSize,
  color = COLORS.ink,
  outlineWidth = 10,
  shadowOffset = 10,
  shadowColor = COLORS.ink,
  align = "center",
  letterSpacing = "-0.02em",
  lineHeight = 1.1,
  fontWeight = 800,
  fontFamily = FONTS.display,
  maxWidth,
}) => {
  const outline = buildOutline(outlineWidth, COLORS.white);
  const shadow = `${shadowOffset}px ${shadowOffset}px 0 ${shadowColor}`;
  return (
    <div
      style={{
        fontFamily,
        fontWeight,
        color,
        fontSize,
        lineHeight,
        letterSpacing,
        textAlign: align,
        textShadow: `${outline}, ${shadow}`,
        maxWidth,
        wordBreak: "keep-all",
      }}
    >
      {children}
    </div>
  );
};
