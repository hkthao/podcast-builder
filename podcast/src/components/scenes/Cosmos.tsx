import { Planet } from "../stickers";
import { StarSmall, Sparkle } from "../doodles";
import { SceneShell, STICKER_BAND, type SceneProps } from "./base";
import { COLORS } from "../../theme";

/** Vũ trụ bao la — con người nhỏ bé, choáng ngợp. */
export const Cosmos: React.FC<SceneProps> = ({ accentColor }) => {
  const midY = (STICKER_BAND.yTop + STICKER_BAND.yBottom) / 2;
  return (
    <SceneShell>
      <Planet
        x={STICKER_BAND.xCenter}
        y={midY - 20}
        size={480}
        delay={6}
        accent={accentColor}
      />
      <StarSmall x={STICKER_BAND.xCenter - 340} y={midY - 260} color={COLORS.ink} size={64} delay={18} />
      <Sparkle x={STICKER_BAND.xCenter + 340} y={midY - 240} color={accentColor} size={70} delay={22} />
      <StarSmall x={STICKER_BAND.xCenter + 300} y={midY + 260} color={COLORS.ink} size={44} delay={26} />
      <Sparkle x={STICKER_BAND.xCenter - 300} y={midY + 280} color={COLORS.ink} size={48} delay={28} />
    </SceneShell>
  );
};
