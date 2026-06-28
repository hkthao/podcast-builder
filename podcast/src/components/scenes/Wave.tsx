import { Wave as WaveSticker } from "../stickers";
import { Squiggle, StarSmall, Sparkle } from "../doodles";
import { SceneShell, STICKER_BAND, type SceneProps } from "./base";
import { COLORS } from "../../theme";

/** Sóng vô thường — cái tôi tan biến, phù du, buông. */
export const Wave: React.FC<SceneProps> = ({ accentColor, audioLevel }) => {
  const midY = (STICKER_BAND.yTop + STICKER_BAND.yBottom) / 2;
  return (
    <SceneShell>
      <WaveSticker
        x={STICKER_BAND.xCenter}
        y={midY}
        size={540}
        delay={6}
        accent={accentColor}
        audioLevel={audioLevel}
      />
      <Squiggle x={STICKER_BAND.xCenter} y={midY + 340} size={440} color={COLORS.accentTeal} />
      <StarSmall x={STICKER_BAND.xCenter - 320} y={midY - 250} color={COLORS.ink} size={54} delay={20} />
      <Sparkle x={STICKER_BAND.xCenter + 310} y={midY - 230} color={accentColor} size={58} delay={24} />
    </SceneShell>
  );
};
