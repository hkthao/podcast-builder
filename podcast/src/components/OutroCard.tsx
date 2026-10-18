import {
  AbsoluteFill,
  Img,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { FPS } from "../theme";
import { channelNameLines, getSeries } from "../series";
import { useLayout } from "../layout";
import { StickerText } from "./StickerText";
import { Sparkle, StarSmall } from "./doodles";
import { usePalette } from "../palette";

export const OUTRO_DURATION_FRAMES = Math.round(FPS * 4);
const FADE_IN_FRAMES = 18;
// Fade-out 0.4s cuối → CTA mờ dần về cream bg → match frame 0 (IntroCard bg)
// → khi Reels auto-loop, transition không có "cut" hard.
const FADE_OUT_FRAMES = Math.round(FPS * 0.4);

export const OutroCard: React.FC<{ series?: string | null }> = ({ series }) => {
  const colors = usePalette();
  const brand = getSeries(series);
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
        backgroundColor: colors.bg,
        gap: landscape ? 32 : 56,
        padding: "0 60px",
        opacity,
      }}
    >
      <Sparkle x={sx(160)} y={sy(400)} color={colors.accentRed} size={70} delay={4} />
      <StarSmall x={sx(920)} y={sy(520)} color={colors.accentBlue} size={60} delay={8} />
      <Sparkle x={sx(920)} y={sy(1480)} color={colors.accentTeal} size={64} delay={12} />
      <StarSmall x={sx(160)} y={sy(1380)} color={colors.ink} size={56} delay={14} />

      {brand.logoFile ? (
        <Img
          src={staticFile(brand.logoFile)}
          // 16:9: logo nhỏ lại để logo + CTA vừa khung cao 1080px.
          style={
            landscape
              ? { width: 780, height: 520, objectFit: "contain" }
              : { width: 920, height: 614, objectFit: "contain" }
          }
        />
      ) : (
        // Series chưa có logo → tên kênh + slogan dạng chữ.
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 24 }}>
          {channelNameLines(brand).map((line) => (
            <StickerText key={line} fontSize={landscape ? 84 : 110} color={colors.ink} outlineWidth={0} shadowOffset={0}>
              {line}
            </StickerText>
          ))}
          <StickerText fontSize={landscape ? 40 : 48} color={colors.ink} outlineWidth={0} shadowOffset={0}>
            {brand.slogan}
          </StickerText>
        </div>
      )}

      <div
        style={{
          backgroundColor: colors.accentRed,
          border: `6px solid ${colors.ink}`,
          borderRadius: 36,
          padding: "28px 48px",
          boxShadow: `10px 10px 0 ${colors.ink}`,
        }}
      >
        <StickerText
          fontSize={60}
          color={colors.ink}
          outlineWidth={6}
          shadowOffset={0}
        >
          {brand.cta}
        </StickerText>
      </div>
    </AbsoluteFill>
  );
};
