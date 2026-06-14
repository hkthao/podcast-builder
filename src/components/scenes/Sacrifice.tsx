import { Apple, HandOpen, Heart } from "../stickers";
import { Arrow, Sparkle, StarSmall } from "../doodles";
import { SceneShell, STICKER_BAND, type SceneProps } from "./base";
import { COLORS } from "../../theme";

/**
 * Sacrifice — bàn tay trái cầm táo + arrow → bàn tay phải mở (đã trao
 * đi). Heart bay lên ở giữa. Cho cảnh "cho đi vật chất" / "phép trừ"
 * khan hiếm / "trao đi một phần của mình".
 */
export const Sacrifice: React.FC<SceneProps> = ({ accentColor }) => {
  const midY = (STICKER_BAND.yTop + STICKER_BAND.yBottom) / 2;
  return (
    <SceneShell>
      {/* Tay trái: đang cầm táo */}
      <HandOpen
        x={STICKER_BAND.xCenter - 280}
        y={midY + 80}
        size={340}
        delay={6}
        rotate={-8}
      />
      <Apple
        x={STICKER_BAND.xCenter - 280}
        y={midY - 60}
        size={220}
        delay={10}
        accent={accentColor}
      />

      {/* Tay phải: đã trao đi, mở trống */}
      <HandOpen
        x={STICKER_BAND.xCenter + 280}
        y={midY + 80}
        size={340}
        delay={20}
        rotate={8}
        flip
      />

      {/* Mũi tên trao đi */}
      <Arrow
        x={STICKER_BAND.xCenter}
        y={midY - 40}
        size={200}
        rotate={0}
        color={COLORS.ink}
        delay={14}
      />

      {/* Heart bay lên ở giữa — sự cho đi sinh tình yêu */}
      <Heart
        x={STICKER_BAND.xCenter}
        y={midY - 260}
        size={160}
        delay={26}
        accent={COLORS.accentRed}
      />

      <Sparkle
        x={STICKER_BAND.xCenter - 140}
        y={midY - 320}
        color={accentColor}
        size={70}
        delay={30}
      />
      <Sparkle
        x={STICKER_BAND.xCenter + 140}
        y={midY - 340}
        color={COLORS.accentTeal}
        size={66}
        delay={34}
      />
      <StarSmall
        x={STICKER_BAND.xCenter}
        y={midY + 380}
        color={COLORS.ink}
        size={56}
        delay={38}
      />
    </SceneShell>
  );
};
