import { Brain, QuestionMark } from "../stickers";
import { Cloud, Sparkle, StarSmall, Squiggle } from "../doodles";
import { SceneShell, STICKER_BAND, type SceneProps } from "./base";
import { COLORS } from "../../theme";

/**
 * Doubt — question mark cực to + brain ở sau + 2 cloud mờ (confusion
 * clouds) + squiggle confused. Cảnh cho "hoài nghi" / "không chắc" /
 * "câu hỏi không có câu trả lời" / "uncertainty".
 */
export const Doubt: React.FC<SceneProps> = ({ accentColor }) => {
  const midY = (STICKER_BAND.yTop + STICKER_BAND.yBottom) / 2;
  return (
    <SceneShell>
      {/* Brain ở sau, mờ hơn */}
      <Brain
        x={STICKER_BAND.xCenter + 60}
        y={midY + 80}
        size={360}
        delay={4}
        accent={COLORS.accentBlue}
      />

      <QuestionMark
        x={STICKER_BAND.xCenter}
        y={midY - 80}
        size={420}
        delay={10}
        accent={accentColor}
      />

      <Cloud
        x={STICKER_BAND.xCenter - 380}
        y={midY - 240}
        size={220}
        color={COLORS.accentBlue}
        delay={16}
      />
      <Cloud
        x={STICKER_BAND.xCenter + 380}
        y={midY - 220}
        size={220}
        color={COLORS.accentTeal}
        delay={20}
      />

      <Squiggle
        x={STICKER_BAND.xCenter - 280}
        y={midY + 360}
        size={260}
        color={COLORS.ink}
        delay={24}
        rotate={15}
      />
      <Squiggle
        x={STICKER_BAND.xCenter + 280}
        y={midY + 380}
        size={260}
        color={COLORS.ink}
        delay={28}
        rotate={-15}
      />

      <Sparkle
        x={STICKER_BAND.xCenter}
        y={midY - 460}
        color={accentColor}
        size={80}
        delay={32}
      />
      <StarSmall
        x={STICKER_BAND.xCenter - 200}
        y={midY + 280}
        color={COLORS.accentRed}
        size={54}
        delay={36}
      />
      <StarSmall
        x={STICKER_BAND.xCenter + 200}
        y={midY + 280}
        color={COLORS.ink}
        size={54}
        delay={40}
      />
    </SceneShell>
  );
};
