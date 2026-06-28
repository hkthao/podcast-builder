import { Column } from "../stickers";
import { Cloud, StarSmall, Sparkle } from "../doodles";
import { SceneShell, STICKER_BAND, type SceneProps } from "./base";
import { COLORS } from "../../theme";

/** Cột khắc kỷ — điềm tĩnh, vững vàng giữa giông bão (Stoicism). */
export const StoicPillar: React.FC<SceneProps> = ({ accentColor }) => {
  const midY = (STICKER_BAND.yTop + STICKER_BAND.yBottom) / 2;
  return (
    <SceneShell>
      <Column
        x={STICKER_BAND.xCenter}
        y={midY + 30}
        size={520}
        delay={6}
        accent={accentColor}
      />
      <Cloud
        x={STICKER_BAND.xCenter - 320}
        y={midY - 240}
        size={260}
        delay={18}
        color={COLORS.inkMuted}
      />
      <Cloud
        x={STICKER_BAND.xCenter + 320}
        y={midY - 200}
        size={210}
        delay={24}
        color={COLORS.inkMuted}
      />
      <StarSmall
        x={STICKER_BAND.xCenter + 300}
        y={midY + 250}
        color={accentColor}
        size={54}
        delay={26}
      />
      <Sparkle
        x={STICKER_BAND.xCenter - 300}
        y={midY + 260}
        color={COLORS.ink}
        size={52}
        delay={28}
      />
    </SceneShell>
  );
};
