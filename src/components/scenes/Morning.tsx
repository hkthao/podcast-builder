import { CoffeeMug, Plant, SmileyCloud } from "../stickers";
import { Sparkle, StarSmall, Squiggle } from "../doodles";
import { SceneShell, STICKER_BAND, type SceneProps } from "./base";
import { COLORS } from "../../theme";

/**
 * Morning Ritual — coffee + cây + smiley cloud (mặt trời) + nhiều sparkle
 * tia nắng. Cảnh cho "slow living" / "khởi đầu ngày" / "tận hưởng hiện tại".
 */
export const Morning: React.FC<SceneProps> = ({ accentColor }) => {
  const midY = (STICKER_BAND.yTop + STICKER_BAND.yBottom) / 2;
  return (
    <SceneShell>
      <SmileyCloud
        x={STICKER_BAND.xCenter}
        y={midY - 360}
        size={300}
        delay={4}
        accent={accentColor}
      />

      <CoffeeMug
        x={STICKER_BAND.xCenter - 220}
        y={midY + 80}
        size={360}
        delay={10}
        rotate={-4}
      />
      <Plant
        x={STICKER_BAND.xCenter + 240}
        y={midY + 80}
        size={340}
        delay={16}
      />

      {/* Sparkles tia nắng tỏa quanh smiley cloud */}
      <Sparkle x={STICKER_BAND.xCenter - 340} y={midY - 360} color={COLORS.accentRed} size={90} delay={8} />
      <Sparkle x={STICKER_BAND.xCenter + 340} y={midY - 360} color={COLORS.accentRed} size={90} delay={12} />
      <Sparkle x={STICKER_BAND.xCenter - 220} y={midY - 500} color={accentColor} size={70} delay={20} />
      <Sparkle x={STICKER_BAND.xCenter + 220} y={midY - 500} color={accentColor} size={70} delay={24} />

      <StarSmall
        x={STICKER_BAND.xCenter}
        y={midY + 360}
        color={COLORS.ink}
        size={56}
        delay={28}
      />
      <Squiggle
        x={STICKER_BAND.xCenter}
        y={midY + 460}
        size={460}
        color={COLORS.ink}
        delay={6}
      />
    </SceneShell>
  );
};
