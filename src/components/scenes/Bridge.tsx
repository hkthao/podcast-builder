import { Bridge as BridgeSticker, Heart, SmileyFace } from "../stickers";
import { Sparkle, StarSmall, DottedPath } from "../doodles";
import { SceneShell, STICKER_BAND, type SceneProps } from "./base";
import { COLORS } from "../../theme";

/**
 * Bridge — cây cầu nối 2 bờ + 2 smiley 2 đầu + heart trên đỉnh + dotted
 * path đi qua. Cho cảnh "cầu nối" / "kết nối tâm hồn" / "nối liền hai
 * bờ" / vượt qua khoảng cách.
 */
export const Bridge: React.FC<SceneProps> = ({ accentColor }) => {
  const midY = (STICKER_BAND.yTop + STICKER_BAND.yBottom) / 2;
  return (
    <SceneShell>
      <BridgeSticker
        x={STICKER_BAND.xCenter}
        y={midY + 60}
        size={620}
        delay={6}
        accent={accentColor}
      />

      {/* Heart trên đỉnh vòm cầu */}
      <Heart
        x={STICKER_BAND.xCenter}
        y={midY - 160}
        size={140}
        delay={20}
        accent={COLORS.accentRed}
      />

      {/* 2 nhân vật 2 đầu cầu */}
      <SmileyFace
        x={STICKER_BAND.xCenter - 380}
        y={midY + 280}
        size={160}
        delay={14}
        accent={COLORS.accentBlue}
      />
      <SmileyFace
        x={STICKER_BAND.xCenter + 380}
        y={midY + 280}
        size={160}
        delay={18}
        accent={COLORS.accentTeal}
      />

      {/* Dotted path mô phỏng "đi qua cầu" */}
      <DottedPath
        x={STICKER_BAND.xCenter}
        y={midY - 280}
        size={400}
        color={COLORS.ink}
        delay={24}
      />

      <Sparkle
        x={STICKER_BAND.xCenter - 260}
        y={midY - 360}
        color={accentColor}
        size={66}
        delay={28}
      />
      <Sparkle
        x={STICKER_BAND.xCenter + 260}
        y={midY - 360}
        color={COLORS.accentTeal}
        size={64}
        delay={32}
      />
      <StarSmall
        x={STICKER_BAND.xCenter}
        y={midY - 440}
        color={COLORS.ink}
        size={58}
        delay={36}
      />
    </SceneShell>
  );
};
