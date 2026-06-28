import { Weight } from "../stickers";
import { StarSmall, Sparkle } from "../doodles";
import { SceneShell, STICKER_BAND, type SceneProps } from "./base";
import { COLORS } from "../../theme";

/** Gánh nặng — trách nhiệm, áp lực, đè nén. */
export const Burden: React.FC<SceneProps> = ({ accentColor }) => {
  const midY = (STICKER_BAND.yTop + STICKER_BAND.yBottom) / 2;
  return (
    <SceneShell>
      <Weight
        x={STICKER_BAND.xCenter}
        y={midY}
        size={480}
        delay={6}
        accent={accentColor}
      />
      <StarSmall x={STICKER_BAND.xCenter - 320} y={midY - 250} color={COLORS.ink} size={54} delay={20} />
      <Sparkle x={STICKER_BAND.xCenter + 320} y={midY + 250} color={accentColor} size={56} delay={24} />
    </SceneShell>
  );
};
