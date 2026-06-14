import { Door, Heart, Star } from "../stickers";
import { Sparkle, StarSmall, DottedPath } from "../doodles";
import { SceneShell, STICKER_BAND, type SceneProps } from "./base";
import { COLORS } from "../../theme";

/**
 * Threshold — cánh cửa hé mở ở giữa + ánh sáng tỏa ra + dotted path
 * dẫn đến cửa + heart/star ở 2 bên. Cho cảnh "ngưỡng cửa" / "chuyển
 * giao" / "bước qua thế giới mới" / nghi thức "gift at threshold".
 */
export const Threshold: React.FC<SceneProps> = ({ accentColor }) => {
  const midY = (STICKER_BAND.yTop + STICKER_BAND.yBottom) / 2;
  return (
    <SceneShell>
      <Door
        x={STICKER_BAND.xCenter}
        y={midY - 20}
        size={500}
        delay={6}
        accent={accentColor}
      />

      {/* Dotted path dẫn tới cửa */}
      <DottedPath
        x={STICKER_BAND.xCenter}
        y={midY + 360}
        size={380}
        color={COLORS.ink}
        delay={14}
        rotate={-90}
      />

      <Heart
        x={STICKER_BAND.xCenter - 360}
        y={midY - 60}
        size={140}
        delay={20}
        accent={COLORS.accentRed}
      />
      <Star
        x={STICKER_BAND.xCenter + 360}
        y={midY - 60}
        size={150}
        delay={24}
        accent={COLORS.accentTeal}
        rotate={-12}
      />

      {/* Sparkles "ánh sáng từ thế giới bên kia" tỏa quanh cửa */}
      <Sparkle
        x={STICKER_BAND.xCenter}
        y={midY - 400}
        color={accentColor}
        size={88}
        delay={28}
      />
      <Sparkle
        x={STICKER_BAND.xCenter - 220}
        y={midY - 380}
        color={COLORS.accentTeal}
        size={68}
        delay={30}
      />
      <Sparkle
        x={STICKER_BAND.xCenter + 220}
        y={midY - 380}
        color={COLORS.accentRed}
        size={70}
        delay={34}
      />
      <StarSmall
        x={STICKER_BAND.xCenter - 380}
        y={midY + 200}
        color={COLORS.ink}
        size={54}
        delay={38}
      />
      <StarSmall
        x={STICKER_BAND.xCenter + 380}
        y={midY + 220}
        color={COLORS.accentBlue}
        size={56}
        delay={40}
      />
    </SceneShell>
  );
};
