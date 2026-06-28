import { BrokenChain } from "../stickers";
import { Sparkle, StarSmall, Confetti } from "../doodles";
import { SceneShell, STICKER_BAND, type SceneProps } from "./base";
import { COLORS } from "../../theme";

/** Phá xiềng — tự do, giải phóng, bứt phá. */
export const BrokenChains: React.FC<SceneProps> = ({ accentColor }) => {
  const midY = (STICKER_BAND.yTop + STICKER_BAND.yBottom) / 2;
  return (
    <SceneShell>
      <BrokenChain
        x={STICKER_BAND.xCenter}
        y={midY}
        size={540}
        delay={6}
        accent={accentColor}
      />
      <Sparkle x={STICKER_BAND.xCenter} y={midY - 260} color={accentColor} size={72} delay={18} />
      <StarSmall x={STICKER_BAND.xCenter - 320} y={midY - 220} color={COLORS.ink} size={54} delay={22} />
      <Confetti x={STICKER_BAND.xCenter + 300} y={midY + 250} size={200} color={accentColor} delay={26} />
    </SceneShell>
  );
};
