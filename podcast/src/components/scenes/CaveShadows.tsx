import { CaveArch } from "../stickers";
import { Sparkle, StarSmall, DottedPath } from "../doodles";
import { SceneShell, STICKER_BAND, type SceneProps } from "./base";
import { COLORS } from "../../theme";

/** Hang Plato — vòm hang tối + lối sáng vàng cuối hang. Ảo ảnh vs thực tại. */
export const CaveShadows: React.FC<SceneProps> = ({ accentColor }) => {
  const midY = (STICKER_BAND.yTop + STICKER_BAND.yBottom) / 2;
  return (
    <SceneShell>
      <CaveArch
        x={STICKER_BAND.xCenter}
        y={midY + 40}
        size={620}
        delay={6}
        accent={accentColor}
      />
      {/* Glow quanh lối sáng cuối hang */}
      <Sparkle
        x={STICKER_BAND.xCenter}
        y={midY + 120}
        color={COLORS.accentRed}
        size={70}
        delay={18}
      />
      <StarSmall
        x={STICKER_BAND.xCenter - 360}
        y={midY - 220}
        color={COLORS.ink}
        size={56}
        delay={22}
      />
      <StarSmall
        x={STICKER_BAND.xCenter + 350}
        y={midY - 260}
        color={accentColor}
        size={48}
        delay={26}
      />
      <DottedPath
        x={STICKER_BAND.xCenter}
        y={midY + 470}
        size={420}
        color={COLORS.ink}
        delay={28}
      />
    </SceneShell>
  );
};
