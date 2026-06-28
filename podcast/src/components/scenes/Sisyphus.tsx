import { Mountain, Boulder } from "../stickers";
import { Sparkle, StarSmall, Arrow } from "../doodles";
import { SceneShell, STICKER_BAND, type SceneProps } from "./base";
import { COLORS } from "../../theme";

/** Sisyphus — núi cao + tảng đá. Sự phi lý, gian nan, nỗ lực lặp lại. */
export const Sisyphus: React.FC<SceneProps> = ({ accentColor }) => {
  const midY = (STICKER_BAND.yTop + STICKER_BAND.yBottom) / 2;
  return (
    <SceneShell>
      <Mountain
        x={STICKER_BAND.xCenter + 50}
        y={midY + 70}
        size={640}
        delay={6}
        accent={accentColor}
      />
      <Boulder
        x={STICKER_BAND.xCenter - 230}
        y={midY + 170}
        size={220}
        delay={16}
      />
      <Arrow
        x={STICKER_BAND.xCenter - 150}
        y={midY + 20}
        size={120}
        color={COLORS.ink}
        rotate={-38}
        delay={22}
      />
      <StarSmall
        x={STICKER_BAND.xCenter + 280}
        y={midY - 280}
        color={accentColor}
        size={64}
        delay={26}
      />
      <Sparkle
        x={STICKER_BAND.xCenter - 320}
        y={midY - 240}
        color={COLORS.ink}
        size={54}
        delay={28}
      />
    </SceneShell>
  );
};
