import { Mirror as MirrorSticker, SmileyFace } from "../stickers";
import { Arrow, Sparkle, StarSmall } from "../doodles";
import { SceneShell, STICKER_BAND, type SceneProps } from "./base";
import { COLORS } from "../../theme";

/**
 * Mirror — gương ở giữa + smiley face bên trái (người thật) + arrow trỏ
 * vào gương + reflection smiley bên trong gương. Cho cảnh "soi gương" /
 * "looking-glass self" / "nhìn lại mình" / Cooley reflected self.
 */
export const Mirror: React.FC<SceneProps> = ({ accentColor }) => {
  const midY = (STICKER_BAND.yTop + STICKER_BAND.yBottom) / 2;
  return (
    <SceneShell>
      {/* Mirror to ở giữa */}
      <MirrorSticker
        x={STICKER_BAND.xCenter + 120}
        y={midY}
        size={480}
        delay={6}
        accent={accentColor}
      />

      {/* Người thật bên trái */}
      <SmileyFace
        x={STICKER_BAND.xCenter - 320}
        y={midY - 40}
        size={240}
        delay={14}
        accent={COLORS.accentRed}
      />

      {/* Arrow trỏ về gương */}
      <Arrow
        x={STICKER_BAND.xCenter - 80}
        y={midY - 40}
        size={140}
        rotate={0}
        color={COLORS.ink}
        delay={20}
      />

      {/* Reflection — smiley nhỏ hơn trong gương */}
      <SmileyFace
        x={STICKER_BAND.xCenter + 120}
        y={midY - 60}
        size={130}
        delay={28}
        accent={COLORS.accentBlue}
      />

      <Sparkle
        x={STICKER_BAND.xCenter - 300}
        y={midY - 320}
        color={accentColor}
        size={70}
        delay={32}
      />
      <Sparkle
        x={STICKER_BAND.xCenter + 320}
        y={midY - 320}
        color={COLORS.accentTeal}
        size={68}
        delay={36}
      />
      <StarSmall
        x={STICKER_BAND.xCenter}
        y={midY + 360}
        color={COLORS.ink}
        size={56}
        delay={40}
      />
      <StarSmall
        x={STICKER_BAND.xCenter - 360}
        y={midY + 300}
        color={COLORS.accentBlue}
        size={52}
        delay={42}
      />
    </SceneShell>
  );
};
