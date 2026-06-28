import { Sunburst, Lightbulb } from "../stickers";
import { Sparkle, StarSmall } from "../doodles";
import { SceneShell, STICKER_BAND, type SceneProps } from "./base";
import { COLORS } from "../../theme";

/** Khai sáng — giác ngộ, ánh sáng lý trí bừng lên. */
export const Enlightenment: React.FC<SceneProps> = ({ accentColor, audioLevel }) => {
  const midY = (STICKER_BAND.yTop + STICKER_BAND.yBottom) / 2;
  return (
    <SceneShell>
      <Sunburst
        x={STICKER_BAND.xCenter}
        y={midY - 40}
        size={480}
        delay={6}
        accent={accentColor}
        audioLevel={audioLevel}
      />
      <Lightbulb x={STICKER_BAND.xCenter} y={midY + 300} size={240} delay={18} accent={accentColor} />
      <Sparkle x={STICKER_BAND.xCenter - 320} y={midY - 250} color={accentColor} size={64} delay={22} />
      <StarSmall x={STICKER_BAND.xCenter + 320} y={midY - 230} color={COLORS.ink} size={56} delay={26} />
    </SceneShell>
  );
};
