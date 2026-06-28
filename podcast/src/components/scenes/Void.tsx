import { Void as VoidSticker, QuestionMark } from "../stickers";
import { StarSmall, Sparkle } from "../doodles";
import { SceneShell, STICKER_BAND, type SceneProps } from "./base";
import { COLORS } from "../../theme";

/** Hư vô — trống rỗng, vô nghĩa, vực thẳm (nihilism). */
export const Void: React.FC<SceneProps> = ({ accentColor }) => {
  const midY = (STICKER_BAND.yTop + STICKER_BAND.yBottom) / 2;
  return (
    <SceneShell>
      <VoidSticker
        x={STICKER_BAND.xCenter}
        y={midY - 10}
        size={500}
        delay={6}
        accent={accentColor}
      />
      <QuestionMark
        x={STICKER_BAND.xCenter + 320}
        y={midY + 220}
        size={220}
        delay={18}
        accent={accentColor}
      />
      <StarSmall
        x={STICKER_BAND.xCenter - 320}
        y={midY + 200}
        color={COLORS.ink}
        size={50}
        delay={22}
      />
      <Sparkle
        x={STICKER_BAND.xCenter - 300}
        y={midY - 280}
        color={accentColor}
        size={58}
        delay={26}
      />
    </SceneShell>
  );
};
