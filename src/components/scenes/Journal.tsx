import { NotebookPaper, QuestionMark, Star } from "../stickers";
import { Sparkle, StarSmall, Arrow } from "../doodles";
import { SceneShell, STICKER_BAND, type SceneProps } from "./base";
import { COLORS } from "../../theme";

/**
 * Journal — notebook to ở giữa + check-mark Star theo từng line. Cảnh
 * dành cho self-inquiry / "today I choose" / list reflection.
 */
export const Journal: React.FC<SceneProps> = ({ accentColor }) => {
  const midY = (STICKER_BAND.yTop + STICKER_BAND.yBottom) / 2;
  return (
    <SceneShell>
      <NotebookPaper
        x={STICKER_BAND.xCenter}
        y={midY + 40}
        size={700}
        delay={4}
        rotate={-2}
      />

      {/* 4 check-marks Star theo dòng */}
      <Star
        x={STICKER_BAND.xCenter - 240}
        y={midY - 60}
        size={86}
        delay={14}
        accent={accentColor}
        rotate={-8}
      />
      <Star
        x={STICKER_BAND.xCenter - 240}
        y={midY + 30}
        size={86}
        delay={18}
        accent={COLORS.accentTeal}
        rotate={-6}
      />
      <Star
        x={STICKER_BAND.xCenter - 240}
        y={midY + 120}
        size={86}
        delay={22}
        accent={COLORS.accentBlue}
        rotate={-8}
      />
      <Star
        x={STICKER_BAND.xCenter - 240}
        y={midY + 210}
        size={86}
        delay={26}
        accent={COLORS.accentRed}
        rotate={-6}
      />

      <QuestionMark
        x={STICKER_BAND.xCenter + 360}
        y={midY - 320}
        size={180}
        delay={30}
        accent={COLORS.accentBlue}
      />

      <Arrow
        x={STICKER_BAND.xCenter + 320}
        y={midY + 360}
        size={140}
        rotate={120}
        color={COLORS.ink}
        delay={32}
      />
      <Sparkle
        x={STICKER_BAND.xCenter - 380}
        y={midY - 260}
        color={accentColor}
        size={72}
        delay={28}
      />
      <StarSmall
        x={STICKER_BAND.xCenter + 380}
        y={midY + 320}
        color={COLORS.ink}
        size={56}
        delay={34}
      />
    </SceneShell>
  );
};
