import { Brain, SpeechBubble } from "../stickers";
import { Sparkle, StarSmall, Squiggle } from "../doodles";
import { SceneShell, STICKER_BAND, type SceneProps } from "./base";
import { COLORS } from "../../theme";

/**
 * Voices — brain ở giữa + 5 speech bubble quanh (như sticky note thì
 * thầm). Cảnh cho "tiếng nói nội tâm" / "chatter" / "self-talk" /
 * "voices in the head".
 */
export const Voices: React.FC<SceneProps> = ({ accentColor }) => {
  const midY = (STICKER_BAND.yTop + STICKER_BAND.yBottom) / 2;
  return (
    <SceneShell>
      <Brain
        x={STICKER_BAND.xCenter}
        y={midY}
        size={360}
        delay={6}
        accent={accentColor}
      />

      {/* 5 speech bubble bao quanh — màu khác nhau như sticky notes */}
      <SpeechBubble
        x={STICKER_BAND.xCenter - 340}
        y={midY - 280}
        size={220}
        delay={12}
        dot
        accent={COLORS.accentRed}
        rotate={-8}
      />
      <SpeechBubble
        x={STICKER_BAND.xCenter + 340}
        y={midY - 280}
        size={220}
        delay={16}
        dot
        accent={COLORS.accentBlue}
        rotate={8}
        flip
      />
      <SpeechBubble
        x={STICKER_BAND.xCenter - 360}
        y={midY + 80}
        size={200}
        delay={20}
        dot
        accent={COLORS.accentTeal}
        rotate={-12}
      />
      <SpeechBubble
        x={STICKER_BAND.xCenter + 360}
        y={midY + 80}
        size={200}
        delay={24}
        dot
        accent={COLORS.accentRed}
        rotate={12}
        flip
      />
      <SpeechBubble
        x={STICKER_BAND.xCenter}
        y={midY + 340}
        size={240}
        delay={28}
        dot
        accent={COLORS.white}
        rotate={-4}
      />

      <Sparkle
        x={STICKER_BAND.xCenter}
        y={midY - 440}
        color={accentColor}
        size={84}
        delay={30}
      />
      <StarSmall
        x={STICKER_BAND.xCenter - 240}
        y={midY + 360}
        color={COLORS.ink}
        size={56}
        delay={34}
      />
      <Squiggle
        x={STICKER_BAND.xCenter}
        y={midY + 460}
        size={420}
        color={COLORS.ink}
        delay={4}
      />
    </SceneShell>
  );
};
