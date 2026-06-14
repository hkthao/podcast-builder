import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame } from "remotion";
import { COLORS, FONTS, FPS } from "../theme";
import { StickerText } from "./StickerText";
import { Sparkle, StarSmall } from "./doodles";

/**
 * Cover 3s — TITLE LÀ HERO duy nhất, chiếm toàn frame để gây tò mò.
 * Brand đã có trong Watermark (top-left) — KHÔNG lặp logo/episode badge ở cover.
 * Emphasis line: coral sticker bar uppercase trắng — đối lập cực mạnh với nền vàng.
 */
export const INTRO_DURATION_FRAMES = Math.round(FPS * 3.0);

const T = {
  underlineIn: 10,
  underlineSettle: 28,
  outStart: INTRO_DURATION_FRAMES - 16,
} as const;

type Props = {
  title: string;
  episodeNumber: number;
  /** Nếu set → render ảnh user upload full-frame thay vì auto-gen từ title. */
  coverImage?: string | null;
  /** Fit mode khi ảnh ≠ 9:16. `cover` crop, `contain` letterbox với nền vàng. */
  coverFit?: "cover" | "contain";
  /** Vị trí crop khi `coverFit=cover`. */
  coverPosition?: "top" | "center" | "bottom";
};

const POSITION_CSS = {
  top: "center top",
  center: "center center",
  bottom: "center bottom",
} as const;

const splitIntoLines = (title: string): string[] => {
  const cleaned = title.trim();
  if (cleaned.includes(",")) {
    return cleaned.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 3);
  }
  const words = cleaned.split(/\s+/);
  if (words.length <= 4) return [cleaned];
  if (words.length <= 8) {
    const mid = Math.ceil(words.length / 2);
    return [words.slice(0, mid).join(" "), words.slice(mid).join(" ")];
  }
  const third = Math.ceil(words.length / 3);
  return [
    words.slice(0, third).join(" "),
    words.slice(third, third * 2).join(" "),
    words.slice(third * 2).join(" "),
  ];
};

export const IntroCard: React.FC<Props> = ({
  title,
  coverImage,
  coverFit = "cover",
  coverPosition = "center",
}) => {
  const frame = useCurrentFrame();
  const lines = splitIntoLines(title);
  const emphasisIdx = Math.floor(lines.length / 2);

  // User-uploaded cover: render image full-frame với fade-out cuối, KHÔNG auto-gen.
  if (coverImage) {
    const outOpacity = interpolate(
      frame,
      [T.outStart, INTRO_DURATION_FRAMES],
      [1, 0],
      { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
    );
    return (
      <AbsoluteFill style={{ backgroundColor: COLORS.bg, opacity: outOpacity }}>
        <Img
          src={staticFile(coverImage)}
          style={{
            width: "100%",
            height: "100%",
            objectFit: coverFit,
            objectPosition: POSITION_CSS[coverPosition],
          }}
        />
      </AbsoluteFill>
    );
  }

  const emphasisPulse = interpolate(
    frame,
    [4, 12, 22],
    [0.94, 1.04, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  const underlineScale = interpolate(
    frame,
    [T.underlineIn, T.underlineSettle],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  const outOpacity = interpolate(
    frame,
    [T.outStart, INTRO_DURATION_FRAMES],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  // Font size cho line thường (navy 3D bubble).
  const normalFontSize = (line: string): number => {
    const len = line.length;
    if (len <= 14) return 110;
    if (len <= 20) return 92;
    return 78;
  };

  // Font size cho line emphasis (coral sticker bar, UPPERCASE → cần nhỏ hơn).
  const emphasisFontSize = (line: string): number => {
    const len = line.length;
    if (len <= 14) return 132;
    if (len <= 20) return 112;
    return 90;
  };

  return (
    <AbsoluteFill
      style={{
        backgroundColor: COLORS.bg,
        paddingLeft: 60,
        paddingRight: 60,
        opacity: outOpacity,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 36,
      }}
    >
      {/* Decoration sparkles ở 4 góc */}
      <Sparkle x={120} y={260} color={COLORS.accentRed} size={84} delay={0} />
      <StarSmall x={960} y={340} color={COLORS.accentBlue} size={70} delay={6} />
      <Sparkle x={960} y={1600} color={COLORS.accentTeal} size={76} delay={10} />
      <StarSmall x={120} y={1500} color={COLORS.ink} size={64} delay={14} />

      {lines.map((line, i) => {
        const isEmphasis = i === emphasisIdx && lines.length > 1;
        if (isEmphasis) {
          return (
            <div
              key={i}
              style={{
                width: "100%",
                transform: `scale(${emphasisPulse})`,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 12,
              }}
            >
              {/* Coral sticker bar — uppercase trắng, viền navy, shadow đậm. */}
              <div
                style={{
                  backgroundColor: COLORS.accentRed,
                  border: `6px solid ${COLORS.ink}`,
                  borderRadius: 22,
                  padding: "16px 36px",
                  boxShadow: `12px 12px 0 ${COLORS.ink}`,
                  textAlign: "center",
                }}
              >
                <div
                  style={{
                    fontFamily: FONTS.display,
                    fontWeight: 800,
                    color: COLORS.white,
                    fontSize: emphasisFontSize(line),
                    textTransform: "uppercase",
                    letterSpacing: "0.02em",
                    lineHeight: 1.05,
                    textShadow: `3px 3px 0 ${COLORS.ink}`,
                    textAlign: "center",
                  }}
                >
                  {line}
                </div>
              </div>
              <svg
                width={520}
                height={28}
                style={{
                  transform: `scaleX(${underlineScale})`,
                  transformOrigin: "center",
                  display: "block",
                }}
              >
                <path
                  d="M 18 16 Q 130 4 260 14 Q 390 24 502 8"
                  stroke={COLORS.ink}
                  strokeWidth={10}
                  fill="none"
                  strokeLinecap="round"
                />
              </svg>
            </div>
          );
        }
        // Normal line: 3D bubble navy với outline trắng dày + shadow đậm để contrast max.
        return (
          <div
            key={i}
            style={{
              width: "100%",
              display: "flex",
              justifyContent: "center",
            }}
          >
            <StickerText
              fontSize={normalFontSize(line)}
              color={COLORS.ink}
              outlineWidth={14}
              shadowOffset={12}
              align="center"
            >
              {line}
            </StickerText>
          </div>
        );
      })}
    </AbsoluteFill>
  );
};
