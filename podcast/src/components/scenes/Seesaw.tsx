import { Seesaw as SeesawSticker, Phone } from "../stickers";
import { Sparkle, StarSmall, Squiggle } from "../doodles";
import { SceneShell, STICKER_BAND, type SceneProps } from "./base";
import { COLORS } from "../../theme";

/** Bập bênh khoái cảm–nỗi đau (Anna Lembke). Dopamine, nghiện, cân bằng não. */
export const Seesaw: React.FC<SceneProps> = ({ accentColor, audioLevel }) => {
  const midY = (STICKER_BAND.yTop + STICKER_BAND.yBottom) / 2;
  return (
    <SceneShell>
      <SeesawSticker
        x={STICKER_BAND.xCenter}
        y={midY}
        size={560}
        delay={6}
        accent={accentColor}
        audioLevel={audioLevel}
      />
      <Phone
        x={STICKER_BAND.xCenter - 340}
        y={midY + 240}
        size={220}
        delay={18}
        rotate={-8}
        accent={COLORS.accentBlue}
      />
      <Sparkle
        x={STICKER_BAND.xCenter - 280}
        y={midY - 280}
        color={COLORS.accentRed}
        size={66}
        delay={22}
      />
      <StarSmall
        x={STICKER_BAND.xCenter + 320}
        y={midY - 240}
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
