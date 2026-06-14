import { Books, SpeechBubble, Star } from "../stickers";
import { Sparkle, Underline, StarSmall } from "../doodles";
import { SceneShell, STICKER_BAND, type SceneProps } from "./base";
import { COLORS } from "../../theme";

/**
 * Quote — sách to ở dưới + speech bubble vàng to ở trên (như highlight
 * quote). Cảnh cho "câu nói đắt" / "wisdom from books" / "lời thầy
 * dạy" / khoảng moment punchline.
 */
export const Quote: React.FC<SceneProps> = ({ accentColor }) => {
  const midY = (STICKER_BAND.yTop + STICKER_BAND.yBottom) / 2;
  return (
    <SceneShell>
      <Books
        x={STICKER_BAND.xCenter}
        y={midY + 200}
        size={460}
        delay={10}
        accent={accentColor}
      />

      <SpeechBubble
        x={STICKER_BAND.xCenter}
        y={midY - 200}
        size={420}
        delay={4}
        dot
        accent={COLORS.accentRed}
        rotate={-4}
      />

      <Star
        x={STICKER_BAND.xCenter - 360}
        y={midY - 320}
        size={150}
        delay={16}
        accent={COLORS.accentRed}
        rotate={-12}
      />
      <Star
        x={STICKER_BAND.xCenter + 360}
        y={midY - 280}
        size={130}
        delay={20}
        accent={COLORS.accentTeal}
        rotate={14}
      />

      <Underline
        x={STICKER_BAND.xCenter}
        y={midY + 480}
        size={460}
        color={COLORS.accentRed}
        delay={28}
      />

      <Sparkle
        x={STICKER_BAND.xCenter - 280}
        y={midY + 360}
        color={accentColor}
        size={70}
        delay={22}
      />
      <Sparkle
        x={STICKER_BAND.xCenter + 280}
        y={midY + 360}
        color={COLORS.ink}
        size={66}
        delay={26}
      />
      <StarSmall
        x={STICKER_BAND.xCenter}
        y={midY - 460}
        color={COLORS.ink}
        size={60}
        delay={30}
      />
    </SceneShell>
  );
};
