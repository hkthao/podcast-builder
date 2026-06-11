import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { COLORS, FONTS, FPS, SAFE_ZONE, TYPE_SCALE } from "../theme";

export const HOOK_DURATION_FRAMES = Math.round(FPS * 3.5);
const FADE_FRAMES = 14;

type Props = {
  hook: string;
};

export const Hook: React.FC<Props> = ({ hook }) => {
  const frame = useCurrentFrame();
  const opacity = Math.min(
    interpolate(frame, [0, FADE_FRAMES], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }),
    interpolate(
      frame,
      [HOOK_DURATION_FRAMES - FADE_FRAMES, HOOK_DURATION_FRAMES],
      [1, 0],
      { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
    ),
  );

  const fontSize = hook.length > 60 ? 64 : TYPE_SCALE.hook;

  return (
    <AbsoluteFill
      style={{
        alignItems: "center",
        justifyContent: "center",
        paddingLeft: SAFE_ZONE.left,
        paddingRight: SAFE_ZONE.right,
        paddingTop: SAFE_ZONE.top,
        paddingBottom: SAFE_ZONE.bottom,
        opacity,
      }}
    >
      <div
        style={{
          textAlign: "center",
          fontFamily: FONTS.display,
          color: COLORS.textPrimary,
          fontSize,
          lineHeight: 1.25,
          letterSpacing: "-0.01em",
          maxWidth: "100%",
        }}
      >
        {hook}
      </div>
    </AbsoluteFill>
  );
};
