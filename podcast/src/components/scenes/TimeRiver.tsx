import { Hourglass } from "../stickers";
import { Squiggle, StarSmall, Sparkle } from "../doodles";
import { SceneShell, STICKER_BAND, type SceneProps } from "./base";
import { COLORS } from "../../theme";

/** Dòng thời gian — vô thường, trôi qua (Heraclitus). */
export const TimeRiver: React.FC<SceneProps> = ({ accentColor, audioLevel }) => {
  const midY = (STICKER_BAND.yTop + STICKER_BAND.yBottom) / 2;
  return (
    <SceneShell>
      <Hourglass
        x={STICKER_BAND.xCenter}
        y={midY - 20}
        size={460}
        delay={6}
        accent={accentColor}
        audioLevel={audioLevel}
      />
      <Squiggle x={STICKER_BAND.xCenter} y={midY + 320} size={460} color={COLORS.accentBlue} />
      <StarSmall x={STICKER_BAND.xCenter - 320} y={midY - 240} color={COLORS.ink} size={56} delay={20} />
      <Sparkle x={STICKER_BAND.xCenter + 320} y={midY - 220} color={accentColor} size={60} delay={24} />
    </SceneShell>
  );
};
