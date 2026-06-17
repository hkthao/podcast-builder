import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { COLORS, FPS, SAFE_ZONE } from "../theme";
import { StickerText } from "./StickerText";
import { Sparkle, StarSmall } from "./doodles";

/**
 * Hook 3.5s — punchline có điểm nhấn giống cover.
 * Split text theo dấu phẩy hoặc đếm từ, emphasize LINE CUỐI (punchline).
 *
 * Retention pass 1: line non-emphasis visible từ frame 0 (giữ readability),
 * punchline word-pop stagger để tạo motion + climax. Underline + emphasis
 * pulse shift trễ sau khi word-pop xong → 3 beats: read setup → climax →
 * underline seal.
 */
export const HOOK_DURATION_FRAMES = Math.round(FPS * 3.5);

const T = {
  punchlineStart: 10, // sau khi setup lines đã được đọc 1 nhịp
  wordPopFrames: 6, // mỗi từ pop 6 frame (scale 0.4→1.12→1)
  wordPopStagger: 4, // 4 frame gap giữa các từ
  underlineIn: 50,
  underlineSettle: 68,
  emphasisPulseStart: 55,
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
  const punchlineWords = lines[emphasisIdx]?.split(/\s+/).filter(Boolean) ?? [];
  // Word-pop chỉ khi có context (≥ 2 lines) hoặc punchline đủ dài.
  // 1 line ngắn → giữ hiển thị ngay cả punchline để readable.
  const enableWordPop = lines.length > 1 || punchlineWords.length >= 4;

  const underlineScale = interpolate(
    frame,
    [T.underlineIn, T.underlineSettle],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  // Emphasis pulse shift sang sau khi word-pop xong → climax thực sự
  const emphasisPulse = interpolate(
    frame,
    [T.emphasisPulseStart, T.emphasisPulseStart + 8, T.emphasisPulseStart + 18],
    [1, 1.12, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  const opacity = interpolate(
    frame,
    [T.outStart, HOOK_DURATION_FRAMES],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  /**
   * Word-pop progress cho từng từ trong punchline. Stagger 4 frame, mỗi từ
   * scale 0.4 → 1.12 → 1 trong 6 frame. Trả [scale, opacity].
   */
  const wordPop = (wordIdx: number): { scale: number; opacity: number } => {
    if (!enableWordPop) return { scale: 1, opacity: 1 };
    const start = T.punchlineStart + wordIdx * T.wordPopStagger;
    const peak = start + Math.round(T.wordPopFrames * 0.4);
    const settle = start + T.wordPopFrames;
    if (frame < start) return { scale: 0.4, opacity: 0 };
    const scale = interpolate(
      frame,
      [start, peak, settle],
      [0.4, 1.12, 1],
      { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
    );
    const op = interpolate(frame, [start, peak], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });
    return { scale, opacity: op };
  };

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
        const baseScale = isEmphasis ? emphasisPulse : 1;
        const fontSize = fontSizeFor(line, isEmphasis);
        if (isEmphasis && enableWordPop) {
          // Punchline: word-by-word pop để climax có motion (line setup
          // visible ngay từ frame 0 nên reader đã đọc trước).
          return (
            <div
              key={i}
              style={{
                transform: `scale(${baseScale})`,
                display: "flex",
                flexWrap: "wrap",
                justifyContent: "center",
                gap: "0 28px",
              }}
            >
              {punchlineWords.map((word, wi) => {
                const { scale: wScale, opacity: wOp } = wordPop(wi);
                return (
                  <div
                    key={wi}
                    style={{
                      transform: `scale(${wScale})`,
                      opacity: wOp,
                    }}
                  >
                    <StickerText
                      fontSize={fontSize}
                      color={COLORS.accentRed}
                      outlineWidth={14}
                      shadowOffset={14}
                    >
                      {word}
                    </StickerText>
                  </div>
                );
              })}
              <div
                style={{
                  width: "100%",
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
            </div>
          );
        }
        return (
          <div key={i} style={{ transform: `scale(${baseScale})` }}>
            <StickerText
              fontSize={fontSize}
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
