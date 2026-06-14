import { Heart, Plant } from "../stickers";
import { Arrow, Sparkle, StarSmall } from "../doodles";
import { SceneShell, STICKER_BAND, type SceneProps } from "./base";
import { COLORS } from "../../theme";

/**
 * Growth — cây to ở giữa + arrow up + nhiều sparkle thăng diagonal +
 * heart trên đỉnh. Cảnh cho "kiên nhẫn" / "trưởng thành" / "phát triển"
 * / "becoming".
 */
export const Growth: React.FC<SceneProps> = ({ accentColor }) => {
  const midY = (STICKER_BAND.yTop + STICKER_BAND.yBottom) / 2;
  return (
    <SceneShell>
      <Plant
        x={STICKER_BAND.xCenter}
        y={midY + 80}
        size={460}
        delay={6}
      />

      <Heart
        x={STICKER_BAND.xCenter}
        y={midY - 340}
        size={140}
        delay={14}
        accent={accentColor}
      />

      <Arrow
        x={STICKER_BAND.xCenter + 280}
        y={midY - 100}
        size={180}
        rotate={-70}
        color={COLORS.accentBlue}
        delay={18}
      />

      {/* Sparkles thăng diagonal — "growth particles" */}
      <Sparkle x={STICKER_BAND.xCenter - 240} y={midY + 200} color={accentColor} size={68} delay={20} />
      <Sparkle x={STICKER_BAND.xCenter - 180} y={midY + 40} color={COLORS.accentTeal} size={62} delay={24} />
      <Sparkle x={STICKER_BAND.xCenter - 120} y={midY - 140} color={accentColor} size={56} delay={28} />
      <Sparkle x={STICKER_BAND.xCenter + 280} y={midY + 200} color={COLORS.accentRed} size={70} delay={22} />
      <Sparkle x={STICKER_BAND.xCenter + 220} y={midY + 40} color={accentColor} size={64} delay={26} />

      <StarSmall
        x={STICKER_BAND.xCenter - 380}
        y={midY - 240}
        color={COLORS.ink}
        size={58}
        delay={30}
      />
      <StarSmall
        x={STICKER_BAND.xCenter + 380}
        y={midY - 280}
        color={COLORS.accentBlue}
        size={62}
        delay={32}
      />
    </SceneShell>
  );
};
