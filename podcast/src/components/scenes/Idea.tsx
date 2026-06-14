import { Lightbulb, QuestionMark, Star } from "../stickers";
import { Sparkle, StarSmall, Arrow } from "../doodles";
import { SceneShell, STICKER_BAND, type SceneProps } from "./base";
import { COLORS } from "../../theme";

/** Cảnh "à há" — bóng đèn + sparkle + dấu hỏi. */
export const Idea: React.FC<SceneProps> = ({ accentColor, audioLevel = 0 }) => {
  const midY = (STICKER_BAND.yTop + STICKER_BAND.yBottom) / 2;
  return (
    <SceneShell>
      <Lightbulb
        x={STICKER_BAND.xCenter}
        y={midY - 60}
        size={460}
        delay={6}
        accent={accentColor}
        audioLevel={audioLevel}
      />
      <QuestionMark
        x={STICKER_BAND.xCenter - 340}
        y={midY + 180}
        size={170}
        delay={18}
        accent={COLORS.accentBlue}
      />
      <Star
        x={STICKER_BAND.xCenter + 340}
        y={midY + 170}
        size={170}
        delay={24}
        accent={accentColor}
        rotate={-12}
      />
      <Sparkle x={STICKER_BAND.xCenter - 260} y={midY - 280} color={accentColor} size={88} />
      <Sparkle x={STICKER_BAND.xCenter + 260} y={midY - 260} color={COLORS.accentTeal} size={76} delay={8} />
      <StarSmall x={STICKER_BAND.xCenter} y={midY - 380} color={COLORS.ink} size={56} />
      <Arrow
        x={STICKER_BAND.xCenter + 260}
        y={midY + 420}
        size={120}
        rotate={20}
        color={COLORS.accentBlue}
      />
    </SceneShell>
  );
};
