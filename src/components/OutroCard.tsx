import { AbsoluteFill, Img, interpolate, useCurrentFrame } from "remotion";
import { BRAND, COLORS, FONTS, FPS, TYPE_SCALE } from "../theme";

export const OUTRO_DURATION_FRAMES = Math.round(FPS * 4);
const FADE_FRAMES = 18;

export const OutroCard: React.FC = () => {
  const frame = useCurrentFrame();
  const inOpacity = interpolate(frame, [0, FADE_FRAMES], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const holdOpacity = interpolate(
    frame,
    [OUTRO_DURATION_FRAMES - 4, OUTRO_DURATION_FRAMES],
    [1, 0.95],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  const opacity = Math.min(inOpacity, holdOpacity);

  return (
    <AbsoluteFill
      style={{
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: COLORS.bg,
        gap: 40,
        opacity,
      }}
    >
      <Img src={BRAND.logoSrc} style={{ width: 220, height: 220 }} />
      <div
        style={{
          fontFamily: FONTS.display,
          color: COLORS.signature,
          fontSize: 56,
          letterSpacing: "-0.01em",
          textAlign: "center",
          padding: "0 60px",
        }}
      >
        {BRAND.cta}
      </div>
      <div
        style={{
          fontFamily: FONTS.body,
          color: COLORS.textMuted,
          fontSize: TYPE_SCALE.meta,
        }}
      >
        {BRAND.channelName}
      </div>
    </AbsoluteFill>
  );
};
