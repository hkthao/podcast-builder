import { BalanceScale, Apple, Heart } from "../stickers";
import { Sparkle, StarSmall } from "../doodles";
import { SceneShell, STICKER_BAND, type SceneProps } from "./base";
import { COLORS } from "../../theme";

/** Cán cân đạo đức — thiện/ác, đúng/sai, lương tâm, công bằng. */
export const Scales: React.FC<SceneProps> = ({ accentColor }) => {
  const midY = (STICKER_BAND.yTop + STICKER_BAND.yBottom) / 2;
  return (
    <SceneShell>
      <BalanceScale
        x={STICKER_BAND.xCenter}
        y={midY + 30}
        size={540}
        delay={6}
        accent={accentColor}
      />
      <Apple
        x={STICKER_BAND.xCenter - 250}
        y={midY - 130}
        size={150}
        delay={18}
      />
      <Heart
        x={STICKER_BAND.xCenter + 250}
        y={midY - 130}
        size={140}
        delay={22}
        accent={accentColor}
      />
      <StarSmall
        x={STICKER_BAND.xCenter}
        y={midY - 380}
        color={COLORS.ink}
        size={56}
        delay={26}
      />
      <Sparkle
        x={STICKER_BAND.xCenter + 330}
        y={midY + 320}
        color={accentColor}
        size={60}
        delay={28}
      />
    </SceneShell>
  );
};
