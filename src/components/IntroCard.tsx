import { AbsoluteFill, Img, interpolate, useCurrentFrame } from "remotion";
import { BRAND, COLORS, FONTS, FPS, TYPE_SCALE } from "../theme";

export const INTRO_DURATION_FRAMES = Math.round(FPS * 2.5);
const FADE_OUT_FRAMES = 12;

type Props = {
  title: string;
  episodeNumber: number;
};

export const IntroCard: React.FC<Props> = ({ title, episodeNumber }) => {
  const frame = useCurrentFrame();
  const logoOpacity = interpolate(frame, [4, 16], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const titleOpacity = interpolate(frame, [18, 30], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const outOpacity = interpolate(
    frame,
    [INTRO_DURATION_FRAMES - FADE_OUT_FRAMES, INTRO_DURATION_FRAMES],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  return (
    <AbsoluteFill
      style={{
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: COLORS.bg,
        gap: 36,
        opacity: outOpacity,
      }}
    >
      <Img
        src={BRAND.logoSrc}
        style={{ width: 180, height: 180, opacity: logoOpacity }}
      />
      <div
        style={{
          fontFamily: FONTS.display,
          color: COLORS.signature,
          fontSize: TYPE_SCALE.title,
          letterSpacing: "-0.01em",
          opacity: logoOpacity,
        }}
      >
        {BRAND.channelName}
      </div>
      <div
        style={{
          maxWidth: 800,
          textAlign: "center",
          fontFamily: FONTS.display,
          color: COLORS.textPrimary,
          fontSize: 48,
          lineHeight: 1.3,
          opacity: titleOpacity,
          padding: "0 60px",
        }}
      >
        {title}
      </div>
      <div
        style={{
          fontFamily: FONTS.body,
          color: COLORS.textMuted,
          fontSize: TYPE_SCALE.meta,
          opacity: titleOpacity,
        }}
      >
        #{String(episodeNumber).padStart(3, "0")}
      </div>
    </AbsoluteFill>
  );
};
