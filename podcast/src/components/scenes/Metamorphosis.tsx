import { Butterfly, Cocoon } from "../stickers";
import { Arrow, Sparkle, StarSmall, Confetti } from "../doodles";
import { SceneShell, STICKER_BAND, type SceneProps } from "./base";
import { COLORS } from "../../theme";

/**
 * Metamorphosis — kén → mũi tên → bướm bay. Cho cảnh "biến thái" /
 * "lột xác" / "chuyển hóa" / "rũ bỏ cái tôi cũ" / "hóa bướm".
 */
export const Metamorphosis: React.FC<SceneProps> = ({ accentColor }) => {
  const midY = (STICKER_BAND.yTop + STICKER_BAND.yBottom) / 2;
  return (
    <SceneShell>
      {/* Cocoon (sâu trong kén) — bên trái */}
      <Cocoon
        x={STICKER_BAND.xCenter - 280}
        y={midY + 80}
        size={300}
        delay={6}
        accent={COLORS.bgAlt}
      />

      {/* Arrow chuyển hóa — ở giữa */}
      <Arrow
        x={STICKER_BAND.xCenter}
        y={midY}
        size={220}
        rotate={0}
        color={COLORS.accentBlue}
        delay={14}
      />

      {/* Butterfly (đã hóa bướm) — bên phải, hơi cao hơn để gợi "bay" */}
      <Butterfly
        x={STICKER_BAND.xCenter + 280}
        y={midY - 80}
        size={340}
        delay={20}
        accent={accentColor}
      />

      {/* Confetti — "phép màu của sự chuyển hóa" */}
      <Confetti
        x={STICKER_BAND.xCenter + 280}
        y={midY + 200}
        size={200}
        delay={26}
      />

      <Sparkle
        x={STICKER_BAND.xCenter - 280}
        y={midY - 280}
        color={accentColor}
        size={68}
        delay={28}
      />
      <Sparkle
        x={STICKER_BAND.xCenter + 280}
        y={midY - 280}
        color={COLORS.accentTeal}
        size={72}
        delay={32}
      />
      <Sparkle
        x={STICKER_BAND.xCenter}
        y={midY - 360}
        color={COLORS.accentRed}
        size={80}
        delay={36}
      />
      <StarSmall
        x={STICKER_BAND.xCenter - 380}
        y={midY + 300}
        color={COLORS.ink}
        size={56}
        delay={40}
      />
      <StarSmall
        x={STICKER_BAND.xCenter + 380}
        y={midY + 320}
        color={COLORS.accentRed}
        size={58}
        delay={42}
      />
    </SceneShell>
  );
};
