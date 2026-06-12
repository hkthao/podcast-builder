import { Brain, Heart, Mask, SpeechBubble } from "../stickers";
import { Cloud, Sparkle, DottedPath } from "../doodles";
import { SceneShell, STICKER_BAND, type SceneProps } from "./base";
import { COLORS } from "../../theme";

/** Nội tâm — brain hoặc mask + tim nhỏ + bong bóng "...". */
export const InnerSelf: React.FC<SceneProps> = ({ accentColor, audioLevel = 0 }) => {
  const midY = (STICKER_BAND.yTop + STICKER_BAND.yBottom) / 2;
  return (
    <SceneShell>
      <Brain
        x={STICKER_BAND.xCenter - 80}
        y={midY - 40}
        size={420}
        delay={6}
        accent={accentColor}
        audioLevel={audioLevel}
      />
      <Mask
        x={STICKER_BAND.xCenter + 320}
        y={midY + 280}
        size={280}
        delay={16}
        rotate={-6}
        accent={COLORS.accentBlue}
      />
      <Heart
        x={STICKER_BAND.xCenter - 320}
        y={midY + 240}
        size={180}
        delay={22}
        accent={COLORS.accentRed}
      />
      <SpeechBubble
        x={STICKER_BAND.xCenter + 280}
        y={midY - 280}
        size={260}
        delay={26}
        dot
      />
      <Cloud x={STICKER_BAND.xCenter - 380} y={midY - 320} size={180} delay={30} />
      <Sparkle x={STICKER_BAND.xCenter} y={midY - 440} color={accentColor} size={64} />
      <DottedPath
        x={STICKER_BAND.xCenter}
        y={midY + 500}
        size={440}
        color={COLORS.ink}
      />
    </SceneShell>
  );
};
