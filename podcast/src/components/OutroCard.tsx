import { AbsoluteFill, Img, interpolate, useCurrentFrame } from "remotion";
import { BRAND, COLORS, FPS } from "../theme";
import { StickerText } from "./StickerText";
import { Sparkle, StarSmall } from "./doodles";

export const OUTRO_DURATION_FRAMES = Math.round(FPS * 4);
const FADE_IN_FRAMES = 18;
// Fade-out 0.4s cuối → CTA mờ dần về cream bg → match frame 0 (IntroCard bg)
// → khi Reels auto-loop, transition không có "cut" hard.
const FADE_OUT_FRAMES = Math.round(FPS * 0.4);

export const OutroCard: React.FC = () => {
  const frame = useCurrentFrame();
  const inOpacity = interpolate(frame, [0, FADE_IN_FRAMES], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const holdOpacity = interpolate(
    frame,
    [OUTRO_DURATION_FRAMES - FADE_OUT_FRAMES, OUTRO_DURATION_FRAMES],
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
        gap: 56,
        padding: "0 60px",
        opacity,
      }}
    >
      <Sparkle x={160} y={400} color={COLORS.accentRed} size={70} delay={4} />
      <StarSmall x={920} y={520} color={COLORS.accentBlue} size={60} delay={8} />
      <Sparkle x={920} y={1480} color={COLORS.accentTeal} size={64} delay={12} />
      <StarSmall x={160} y={1380} color={COLORS.ink} size={56} delay={14} />

      <Img
        src={BRAND.logoSrc}
        style={{ width: 920, height: 614, objectFit: "contain" }}
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
