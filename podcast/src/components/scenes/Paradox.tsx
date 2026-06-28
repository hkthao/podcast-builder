import { Knot, QuestionMark } from "../stickers";
import { Arrow, StarSmall } from "../doodles";
import { SceneShell, STICKER_BAND, type SceneProps } from "./base";
import { COLORS } from "../../theme";

/** Nghịch lý — mâu thuẫn, trái ngược, oái oăm. */
export const Paradox: React.FC<SceneProps> = ({ accentColor }) => {
  const midY = (STICKER_BAND.yTop + STICKER_BAND.yBottom) / 2;
  return (
    <SceneShell>
      <Knot
        x={STICKER_BAND.xCenter}
        y={midY - 10}
        size={500}
        delay={6}
        accent={accentColor}
      />
      <Arrow x={STICKER_BAND.xCenter - 300} y={midY + 230} size={150} color={COLORS.ink} rotate={-20} delay={18} />
      <Arrow x={STICKER_BAND.xCenter + 300} y={midY + 230} size={150} color={COLORS.ink} rotate={160} delay={22} />
      <QuestionMark x={STICKER_BAND.xCenter} y={midY - 300} size={170} delay={26} accent={accentColor} />
      <StarSmall x={STICKER_BAND.xCenter + 330} y={midY - 250} color={COLORS.ink} size={48} delay={28} />
    </SceneShell>
  );
};
