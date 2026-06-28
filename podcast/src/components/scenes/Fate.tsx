import { Dominoes } from "../stickers";
import { Arrow, StarSmall, Sparkle } from "../doodles";
import { SceneShell, STICKER_BAND, type SceneProps } from "./base";
import { COLORS } from "../../theme";

/** Định mệnh — nhân quả, tất yếu, an bài (domino dây chuyền). */
export const Fate: React.FC<SceneProps> = ({ accentColor }) => {
  const midY = (STICKER_BAND.yTop + STICKER_BAND.yBottom) / 2;
  return (
    <SceneShell>
      <Dominoes
        x={STICKER_BAND.xCenter}
        y={midY}
        size={520}
        delay={6}
        accent={accentColor}
      />
      <Arrow x={STICKER_BAND.xCenter - 40} y={midY - 250} size={140} color={COLORS.ink} rotate={20} delay={18} />
      <StarSmall x={STICKER_BAND.xCenter + 320} y={midY - 230} color={accentColor} size={56} delay={22} />
      <Sparkle x={STICKER_BAND.xCenter - 320} y={midY + 250} color={COLORS.ink} size={52} delay={26} />
    </SceneShell>
  );
};
