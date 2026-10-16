import {
  AbsoluteFill,
  Img,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { BRAND, COLORS, FPS } from "../theme";
import { useLayout } from "../layout";
import { StickerText } from "./StickerText";
import { Sparkle, StarSmall } from "./doodles";

export const OUTRO_DURATION_FRAMES = Math.round(FPS * 4);
const FADE_IN_FRAMES = 18;
// Fade-out 0.4s cuối → CTA mờ dần về cream bg → match frame 0 (IntroCard bg)
// → khi Reels auto-loop, transition không có "cut" hard.
const FADE_OUT_FRAMES = Math.round(FPS * 0.4);

export const OutroCard: React.FC = () => {
  const frame = useCurrentFrame();
  // durationInFrames = độ dài Sequence outro (có thể = đuôi nhạc nền, dài hơn
  // OUTRO_DURATION_FRAMES) → fade-out canh theo CUỐI sequence, không cứng 4s.
  const { durationInFrames } = useVideoConfig();
  const { landscape, sx, sy } = useLayout();
  const inOpacity = interpolate(frame, [0, FADE_IN_FRAMES], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const holdOpacity = interpolate(
    frame,
    [durationInFrames - FADE_OUT_FRAMES, durationInFrames],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  const opacity = Math.min(inOpacity, holdOpacity);

  return (
    <AbsoluteFill
      style={{
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: COLORS.bg,
        gap: landscape ? 32 : 56,
        padding: "0 60px",
        opacity,
      }}
    >
      <Sparkle x={sx(160)} y={sy(400)} color={COLORS.accentRed} size={70} delay={4} />
      <StarSmall x={sx(920)} y={sy(520)} color={COLORS.accentBlue} size={60} delay={8} />
      <Sparkle x={sx(920)} y={sy(1480)} color={COLORS.accentTeal} size={64} delay={12} />
      <StarSmall x={sx(160)} y={sy(1380)} color={COLORS.ink} size={56} delay={14} />

      <Img
        src={BRAND.logoSrc}
        // 16:9: logo nhỏ lại để logo + CTA vừa khung cao 1080px.
        style={
          landscape
            ? { width: 780, height: 520, objectFit: "contain" }
            : { width: 920, height: 614, objectFit: "contain" }
        }
      />

      <div
        style={{
          backgroundColor: COLORS.accentRed,
          border: `6px solid ${COLORS.ink}`,
          borderRadius: 36,
          padding: "28px 48px",
          boxShadow: `10px 10px 0 ${COLORS.ink}`,
        }}
      >
        <StickerText
          fontSize={60}
          color={COLORS.ink}
          outlineWidth={6}
          shadowOffset={0}
        >
          {BRAND.cta}
        </StickerText>
      </div>
    </AbsoluteFill>
  );
};
