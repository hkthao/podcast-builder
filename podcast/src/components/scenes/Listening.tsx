import { Headphones, Heart } from "../stickers";
import { Sparkle, StarSmall, Squiggle } from "../doodles";
import { SceneShell, STICKER_BAND, type SceneProps } from "./base";
import { COLORS } from "../../theme";

/**
 * Listening — headphones to ở giữa + heart bên trong + 2 squiggle wave
 * 2 bên (sóng âm). Cảnh cho "empathy" / "lắng nghe" / "đồng cảm" / "im
 * lặng để hiểu".
 */
export const Listening: React.FC<SceneProps> = ({ accentColor }) => {
  const midY = (STICKER_BAND.yTop + STICKER_BAND.yBottom) / 2;
  return (
    <SceneShell>
      <Headphones
        x={STICKER_BAND.xCenter}
        y={midY - 40}
        size={480}
        delay={6}
        rotate={0}
      />

      <Heart
        x={STICKER_BAND.xCenter}
        y={midY + 200}
        size={180}
        delay={14}
        accent={accentColor}
      />

      {/* Sóng âm tỏa 2 bên */}
      <Squiggle
        x={STICKER_BAND.xCenter - 360}
        y={midY + 60}
        size={280}
        color={COLORS.ink}
        delay={20}
        rotate={0}
      />
      <Squiggle
        x={STICKER_BAND.xCenter + 360}
        y={midY + 60}
        size={280}
        color={COLORS.ink}
        delay={24}
        rotate={0}
      />

      <Sparkle
        x={STICKER_BAND.xCenter - 280}
        y={midY - 320}
        color={accentColor}
        size={84}
        delay={16}
      />
      <Sparkle
        x={STICKER_BAND.xCenter + 280}
        y={midY - 320}
        color={COLORS.accentTeal}
        size={76}
        delay={18}
      />
      <StarSmall
        x={STICKER_BAND.xCenter}
        y={midY - 440}
        color={COLORS.ink}
        size={60}
        delay={22}
      />
      <StarSmall
        x={STICKER_BAND.xCenter - 460}
        y={midY + 280}
        color={COLORS.accentBlue}
        size={52}
        delay={28}
      />
      <StarSmall
        x={STICKER_BAND.xCenter + 460}
        y={midY + 280}
        color={COLORS.accentRed}
        size={52}
        delay={32}
      />
    </SceneShell>
  );
};
