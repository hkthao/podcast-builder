import { Mic, SmileyFace, SpeechBubble } from "../stickers";
import { Arrow, Sparkle, StarSmall } from "../doodles";
import { SceneShell, STICKER_BAND, type SceneProps } from "./base";
import { COLORS } from "../../theme";

/**
 * Dual Mic — hai mic đối diện cho cảnh đối thoại / phản biện / 2-host
 * podcast. Speech bubble ở giữa + 2 smiley face trên đỉnh (host avatars).
 */
export const DualMic: React.FC<SceneProps> = ({
  accentColor,
  audioLevel = 0,
}) => {
  const midY = (STICKER_BAND.yTop + STICKER_BAND.yBottom) / 2;
  return (
    <SceneShell>
      <Mic
        x={STICKER_BAND.xCenter - 280}
        y={midY + 40}
        size={340}
        delay={6}
        rotate={10}
        accent={accentColor}
        audioLevel={audioLevel}
      />
      <Mic
        x={STICKER_BAND.xCenter + 280}
        y={midY + 40}
        size={340}
        delay={10}
        rotate={-10}
        accent={COLORS.accentBlue}
        audioLevel={audioLevel}
        flip
      />

      <SpeechBubble
        x={STICKER_BAND.xCenter}
        y={midY - 220}
        size={280}
        delay={16}
        dot
        accent={COLORS.accentRed}
      />

      <SmileyFace
        x={STICKER_BAND.xCenter - 360}
        y={midY - 320}
        size={180}
        delay={22}
        accent={accentColor}
      />
      <SmileyFace
        x={STICKER_BAND.xCenter + 360}
        y={midY - 320}
        size={180}
        delay={26}
        accent={COLORS.accentTeal}
      />

      <Arrow
        x={STICKER_BAND.xCenter}
        y={midY + 420}
        size={200}
        color={COLORS.ink}
        rotate={0}
        delay={30}
      />
      <Sparkle
        x={STICKER_BAND.xCenter - 460}
        y={midY + 220}
        color={accentColor}
        size={72}
        delay={20}
      />
      <StarSmall
        x={STICKER_BAND.xCenter + 460}
        y={midY + 240}
        color={COLORS.ink}
        size={60}
        delay={24}
      />
    </SceneShell>
  );
};
