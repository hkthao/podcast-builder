import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { FPS } from "../theme";
import { useLayout } from "../layout";
import { hookSeconds, splitHookLines } from "../timing";
import { StickerText } from "./StickerText";
import { Sparkle, StarSmall } from "./doodles";
import { usePalette } from "../palette";

/**
 * Hook 3.5s — punchline có điểm nhấn giống cover.
 * Split text theo dấu phẩy hoặc đếm từ, emphasize LINE CUỐI (punchline).
 *
 * Retention pass 1: line non-emphasis visible từ frame 0 (giữ readability),
 * punchline word-pop stagger để tạo motion + climax. Underline + emphasis
 * pulse shift trễ sau khi word-pop xong → 3 beats: read setup → climax →
 * underline seal.
 */
/** Số frame của card hook — co giãn theo độ dài chữ (timing.hookSeconds). */
export const hookDurationFrames = (hook: string | null | undefined): number =>
  Math.round(FPS * hookSeconds(hook));

const T = {
  punchlineStart: 10, // sau khi setup lines đã được đọc 1 nhịp
  wordPopFrames: 6, // mỗi từ pop 6 frame (scale 0.4→1.12→1)
  wordPopStagger: 4, // 4 frame gap giữa các từ
  underlineIn: 50,
  underlineSettle: 68,
  emphasisPulseStart: 55,
} as const;

type Props = {
  hook: string;
};

export const Hook: React.FC<Props> = ({ hook }) => {
  const colors = usePalette();
  const frame = useCurrentFrame();
  // Trong <Sequence>, durationInFrames = độ dài card hook (co giãn theo chữ).
  const { durationInFrames } = useVideoConfig();
  const outStart = durationInFrames - 16;
  const { landscape, safe, sx, sy } = useLayout();
  // 16:9: khung ngang rộng → giới hạn bề ngang dòng chữ để punchline dài vẫn
  // xuống dòng gọn ở giữa (kể cả lúc pulse scale 1.12), không tràn mép.
  const lineMaxWidth = landscape ? 1400 : undefined;
  const lines = splitHookLines(hook);
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
    [outStart, durationInFrames],
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
        backgroundColor: colors.bg,
        paddingLeft: safe.left,
        paddingRight: safe.right,
        paddingTop: safe.top,
        paddingBottom: safe.bottom,
        gap: 28,
        opacity,
      }}
    >
      <Sparkle x={sx(140)} y={sy(300)} color={colors.accentRed} size={84} delay={0} />
      <StarSmall x={sx(940)} y={sy(420)} color={colors.accentBlue} size={64} delay={6} />
      <Sparkle x={sx(140)} y={sy(1500)} color={colors.accentTeal} size={76} delay={10} />
      <StarSmall x={sx(940)} y={sy(1620)} color={colors.ink} size={60} delay={14} />

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
                maxWidth: lineMaxWidth,
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
                      color={colors.accentRed}
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
                    stroke={colors.accentRed}
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
          <div key={i} style={{ transform: `scale(${baseScale})`, maxWidth: lineMaxWidth }}>
            <StickerText
              fontSize={fontSize}
              color={isEmphasis ? colors.accentRed : colors.ink}
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
                    stroke={colors.accentRed}
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
