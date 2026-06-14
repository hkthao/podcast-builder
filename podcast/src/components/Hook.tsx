import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { COLORS, FPS, SAFE_ZONE } from "../theme";
import { StickerText } from "./StickerText";
import { Sparkle, StarSmall } from "./doodles";

/**
 * Hook 3.5s — punchline có điểm nhấn giống cover.
 * Split text theo dấu phẩy hoặc đếm từ, emphasize LINE CUỐI (punchline).
 * Visible từ frame 0 — không pop-in để Reels viewer đọc được ngay.
 */
export const HOOK_DURATION_FRAMES = Math.round(FPS * 3.5);

const T = {
  underlineIn: 8,
  underlineSettle: 26,
  outStart: HOOK_DURATION_FRAMES - 16,
} as const;

type Props = {
  hook: string;
};

const splitIntoLines = (text: string): string[] => {
  const cleaned = text.trim();
  if (cleaned.includes(",")) {
    return cleaned.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 3);
  }
  const words = cleaned.split(/\s+/);
  if (words.length <= 5) return [cleaned];
  if (words.length <= 10) {
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

export const Hook: React.FC<Props> = ({ hook }) => {
  const frame = useCurrentFrame();
  const lines = splitIntoLines(hook);
  // Hook nhấn LINE CUỐI (punchline) — khác cover nhấn middle.
  const emphasisIdx = lines.length - 1;

  const underlineScale = interpolate(
    frame,
    [T.underlineIn, T.underlineSettle],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  const emphasisPulse = interpolate(
    frame,
    [4, 12, 22],
    [1, 1.06, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  const opacity = interpolate(
    frame,
    [T.outStart, HOOK_DURATION_FRAMES],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  const fontSizeFor = (text: string, isEmphasis: boolean): number => {
    const len = text.length;
    if (isEmphasis) {
      if (len <= 14) return 140;
      if (len <= 22) return 112;
      return 92;
    }
    if (len <= 16) return 92;
    if (len <= 24) return 76;
    return 64;
  };

  return (
    <AbsoluteFill
      style={{
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: COLORS.bg,
        paddingLeft: SAFE_ZONE.left,
        paddingRight: SAFE_ZONE.right,
        paddingTop: SAFE_ZONE.top,
        paddingBottom: SAFE_ZONE.bottom,
        gap: 28,
        opacity,
      }}
    >
      <Sparkle x={140} y={300} color={COLORS.accentRed} size={84} delay={0} />
      <StarSmall x={940} y={420} color={COLORS.accentBlue} size={64} delay={6} />
      <Sparkle x={140} y={1500} color={COLORS.accentTeal} size={76} delay={10} />
      <StarSmall x={940} y={1620} color={COLORS.ink} size={60} delay={14} />

      {lines.map((line, i) => {
        const isEmphasis = i === emphasisIdx && lines.length > 1;
        const scale = isEmphasis ? emphasisPulse : 1;
        return (
          <div key={i} style={{ transform: `scale(${scale})` }}>
            <StickerText
              fontSize={fontSizeFor(line, isEmphasis)}
              color={isEmphasis ? COLORS.accentRed : COLORS.ink}
              outlineWidth={isEmphasis ? 14 : 11}
              shadowOffset={isEmphasis ? 14 : 10}
            >
              {line}
            </StickerText>
            {isEmphasis ? (
              <div
                style={{
                  display: "flex",
                  justifyContent: "center",
                  marginTop: 12,
                }}
              >
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
                    stroke={COLORS.accentRed}
                    strokeWidth={10}
                    fill="none"
                    strokeLinecap="round"
                  />
                </svg>
              </div>
            ) : null}
          </div>
        );
      })}
    </AbsoluteFill>
  );
};
