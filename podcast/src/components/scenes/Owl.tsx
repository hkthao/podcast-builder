import { Owl as OwlSticker, Books } from "../stickers";
import { StarSmall, Sparkle } from "../doodles";
import { SceneShell, STICKER_BAND, type SceneProps } from "./base";
import { COLORS } from "../../theme";

/** Cú Minerva — minh triết, khôn ngoan, hiền triết. */
export const Owl: React.FC<SceneProps> = ({ accentColor }) => {
  const midY = (STICKER_BAND.yTop + STICKER_BAND.yBottom) / 2;
  return (
    <SceneShell>
      <OwlSticker
        x={STICKER_BAND.xCenter}
        y={midY - 60}
        size={430}
        delay={6}
        accent={accentColor}
      />
      <Books
        x={STICKER_BAND.xCenter}
        y={midY + 330}
        size={210}
        delay={18}
        accent={accentColor}
      />
      <StarSmall
        x={STICKER_BAND.xCenter - 320}
        y={midY - 250}
        color={COLORS.ink}
        size={58}
        delay={22}
      />
      <Sparkle
        x={STICKER_BAND.xCenter + 320}
        y={midY - 230}
        color={accentColor}
        size={60}
        delay={26}
      />
    </SceneShell>
  );
};
