import { Eye } from "../stickers";
import { Sparkle, StarSmall } from "../doodles";
import { SceneShell, STICKER_BAND, type SceneProps } from "./base";
import { COLORS } from "../../theme";

/** Con mắt ý thức — quan sát, tỉnh giác, tự nhận thức. */
export const ThirdEye: React.FC<SceneProps> = ({ accentColor, audioLevel }) => {
  const midY = (STICKER_BAND.yTop + STICKER_BAND.yBottom) / 2;
  return (
    <SceneShell>
      <Eye
        x={STICKER_BAND.xCenter}
        y={midY}
        size={520}
        delay={6}
        accent={accentColor}
        audioLevel={audioLevel}
      />
      <Sparkle
        x={STICKER_BAND.xCenter - 320}
        y={midY - 240}
        color={accentColor}
        size={62}
        delay={20}
      />
      <StarSmall
        x={STICKER_BAND.xCenter + 320}
        y={midY - 220}
        color={COLORS.ink}
        size={56}
        delay={24}
      />
      <Sparkle
        x={STICKER_BAND.xCenter + 300}
        y={midY + 280}
        color={COLORS.ink}
        size={50}
        delay={28}
      />
    </SceneShell>
  );
};
