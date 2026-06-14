import { Heart } from "../stickers";
import {
  Cloud,
  DottedPath,
  Sparkle,
  StarSmall,
} from "../doodles";
import { SceneShell, STICKER_BAND, type SceneProps } from "./base";
import { COLORS } from "../../theme";

/**
 * Letting Go — heart to ở dưới + dotted path đi lên + cloud trôi 2 bên
 * + stars/sparkles bay lên. Cảnh cho "buông bỏ" / "chấp nhận" / "mất
 * mát" / "release" / chia tay nhẹ nhàng.
 */
export const LettingGo: React.FC<SceneProps> = ({ accentColor }) => {
  const midY = (STICKER_BAND.yTop + STICKER_BAND.yBottom) / 2;
  return (
    <SceneShell>
      <Heart
        x={STICKER_BAND.xCenter}
        y={midY + 280}
        size={280}
        delay={6}
        accent={accentColor}
      />

      <DottedPath
        x={STICKER_BAND.xCenter}
        y={midY - 80}
        size={400}
        color={COLORS.ink}
        delay={10}
      />

      <Cloud
        x={STICKER_BAND.xCenter - 360}
        y={midY - 280}
        size={260}
        color={COLORS.accentBlue}
        delay={14}
      />
      <Cloud
        x={STICKER_BAND.xCenter + 360}
        y={midY - 320}
        size={240}
        color={COLORS.accentTeal}
        delay={18}
      />

      {/* Sparkles bay lên — "release particles" */}
      <Sparkle x={STICKER_BAND.xCenter - 220} y={midY - 460} color={accentColor} size={62} delay={22} />
      <Sparkle x={STICKER_BAND.xCenter + 220} y={midY - 460} color={accentColor} size={64} delay={26} />
      <Sparkle x={STICKER_BAND.xCenter - 120} y={midY + 80} color={COLORS.accentRed} size={56} delay={30} />
      <Sparkle x={STICKER_BAND.xCenter + 120} y={midY + 80} color={COLORS.accentTeal} size={58} delay={32} />

      <StarSmall
        x={STICKER_BAND.xCenter - 460}
        y={midY + 200}
        color={COLORS.ink}
        size={54}
        delay={36}
      />
      <StarSmall
        x={STICKER_BAND.xCenter + 460}
        y={midY + 220}
        color={COLORS.accentBlue}
        size={56}
        delay={38}
      />
      <StarSmall
        x={STICKER_BAND.xCenter}
        y={midY - 540}
        color={COLORS.ink}
        size={50}
        delay={40}
      />
    </SceneShell>
  );
};
