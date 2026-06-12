import { Heart, NetworkDots, Phone, SpeechBubble } from "../stickers";
import { Sparkle, DottedPath } from "../doodles";
import { SceneShell, STICKER_BAND, type SceneProps } from "./base";
import { COLORS } from "../../theme";

export const Connection: React.FC<SceneProps> = ({ accentColor }) => {
  const midY = (STICKER_BAND.yTop + STICKER_BAND.yBottom) / 2;
  return (
    <SceneShell>
      <NetworkDots
        x={STICKER_BAND.xCenter}
        y={midY - 80}
        size={500}
        delay={6}
        accent={accentColor}
      />
      <Phone
        x={STICKER_BAND.xCenter - 340}
        y={midY + 260}
        size={260}
        delay={14}
        rotate={-10}
        accent={COLORS.accentBlue}
      />
      <SpeechBubble
        x={STICKER_BAND.xCenter + 320}
        y={midY + 240}
        size={300}
        delay={20}
        dot
        flip
      />
      <Heart
        x={STICKER_BAND.xCenter + 380}
        y={midY - 320}
        size={160}
        delay={28}
        accent={accentColor}
      />
      <Heart
        x={STICKER_BAND.xCenter - 380}
        y={midY - 280}
        size={120}
        delay={34}
        accent={COLORS.accentRed}
      />
      <DottedPath
        x={STICKER_BAND.xCenter}
        y={midY + 460}
        size={520}
        color={COLORS.ink}
      />
      <Sparkle x={STICKER_BAND.xCenter} y={midY - 380} color={accentColor} size={72} />
    </SceneShell>
  );
};
