import { Candle, Leaf } from "../stickers";
import { StarSmall, Squiggle } from "../doodles";
import { SceneShell, STICKER_BAND, type SceneProps } from "./base";
import { COLORS } from "../../theme";

/** Memento mori — ngọn nến cháy + lá rơi. Hữu hạn, vô thường, cái chết. */
export const MementoMori: React.FC<SceneProps> = ({ accentColor, audioLevel }) => {
  const midY = (STICKER_BAND.yTop + STICKER_BAND.yBottom) / 2;
  return (
    <SceneShell>
      <Candle
        x={STICKER_BAND.xCenter}
        y={midY}
        size={460}
        delay={6}
        accent={accentColor}
        audioLevel={audioLevel}
      />
      <Leaf
        x={STICKER_BAND.xCenter - 320}
        y={midY - 220}
        size={200}
        delay={16}
        rotate={-24}
        accent={COLORS.accentTeal}
      />
      <Leaf
        x={STICKER_BAND.xCenter + 330}
        y={midY + 240}
        size={170}
        delay={22}
        rotate={150}
        accent={COLORS.accentRed}
      />
      <StarSmall
        x={STICKER_BAND.xCenter + 300}
        y={midY - 300}
        color={COLORS.ink}
        size={52}
        delay={26}
      />
      <Squiggle
        x={STICKER_BAND.xCenter}
        y={midY + 470}
        size={400}
        color={COLORS.ink}
      />
    </SceneShell>
  );
};
