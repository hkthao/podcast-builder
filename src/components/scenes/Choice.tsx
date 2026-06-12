import { QuestionMark, Signpost, Star } from "../stickers";
import { Arrow, DottedPath, Sparkle } from "../doodles";
import { SceneShell, STICKER_BAND, type SceneProps } from "./base";
import { COLORS } from "../../theme";

/** Lựa chọn — signpost + nhiều mũi tên + dấu hỏi. */
export const Choice: React.FC<SceneProps> = ({ accentColor }) => {
  const midY = (STICKER_BAND.yTop + STICKER_BAND.yBottom) / 2;
  return (
    <SceneShell>
      <Signpost
        x={STICKER_BAND.xCenter}
        y={midY - 40}
        size={440}
        delay={6}
        accent={accentColor}
      />
      <Arrow
        x={STICKER_BAND.xCenter - 360}
        y={midY + 240}
        size={200}
        rotate={-25}
        color={COLORS.ink}
      />
      <Arrow
        x={STICKER_BAND.xCenter}
        y={midY + 320}
        size={200}
        rotate={0}
        color={COLORS.accentRed}
      />
      <Arrow
        x={STICKER_BAND.xCenter + 360}
        y={midY + 240}
        size={200}
        rotate={25}
        color={COLORS.accentBlue}
      />
      <QuestionMark
        x={STICKER_BAND.xCenter - 360}
        y={midY - 280}
        size={180}
        delay={20}
        accent={COLORS.accentBlue}
      />
      <Star
        x={STICKER_BAND.xCenter + 360}
        y={midY - 300}
        size={160}
        delay={26}
        rotate={-10}
        accent={accentColor}
      />
      <Sparkle x={STICKER_BAND.xCenter} y={midY - 420} color={accentColor} size={64} />
      <DottedPath
        x={STICKER_BAND.xCenter}
        y={midY + 480}
        size={500}
        color={COLORS.ink}
      />
    </SceneShell>
  );
};
