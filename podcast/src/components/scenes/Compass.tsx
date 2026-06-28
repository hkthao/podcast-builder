import { Compass as CompassSticker, Signpost } from "../stickers";
import { Sparkle, StarSmall, DottedPath } from "../doodles";
import { SceneShell, STICKER_BAND, type SceneProps } from "./base";
import { COLORS } from "../../theme";

/** La bàn — đi tìm ý nghĩa, mục đích, phương hướng. */
export const Compass: React.FC<SceneProps> = ({ accentColor }) => {
  const midY = (STICKER_BAND.yTop + STICKER_BAND.yBottom) / 2;
  return (
    <SceneShell>
      <CompassSticker
        x={STICKER_BAND.xCenter}
        y={midY - 20}
        size={480}
        delay={6}
        accent={accentColor}
      />
      <Signpost
        x={STICKER_BAND.xCenter + 330}
        y={midY + 230}
        size={240}
        delay={18}
        rotate={6}
        accent={accentColor}
      />
      <StarSmall
        x={STICKER_BAND.xCenter - 330}
        y={midY - 260}
        color={accentColor}
        size={60}
        delay={22}
      />
      <Sparkle
        x={STICKER_BAND.xCenter - 300}
        y={midY + 250}
        color={COLORS.ink}
        size={56}
        delay={26}
      />
      <DottedPath
        x={STICKER_BAND.xCenter}
        y={midY + 470}
        size={420}
        color={COLORS.ink}
      />
    </SceneShell>
  );
};
