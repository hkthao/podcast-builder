import { RobotHead, NetworkDots, Brain } from "../stickers";
import { Sparkle, StarSmall } from "../doodles";
import { SceneShell, STICKER_BAND, type SceneProps } from "./base";
import { COLORS } from "../../theme";

/** Trí tuệ nhân tạo — đầu robot + mạng nơ-ron + não. AI, ý thức máy, công nghệ. */
export const MachineMind: React.FC<SceneProps> = ({ accentColor, audioLevel }) => {
  const midY = (STICKER_BAND.yTop + STICKER_BAND.yBottom) / 2;
  return (
    <SceneShell>
      <RobotHead
        x={STICKER_BAND.xCenter}
        y={midY - 30}
        size={500}
        delay={6}
        accent={accentColor}
        audioLevel={audioLevel}
      />
      <NetworkDots
        x={STICKER_BAND.xCenter - 330}
        y={midY + 220}
        size={240}
        delay={16}
        accent={COLORS.accentBlue}
      />
      <Brain
        x={STICKER_BAND.xCenter + 320}
        y={midY + 220}
        size={220}
        delay={20}
        accent={accentColor}
      />
      <Sparkle
        x={STICKER_BAND.xCenter + 300}
        y={midY - 300}
        color={accentColor}
        size={66}
        delay={24}
      />
      <StarSmall
        x={STICKER_BAND.xCenter - 300}
        y={midY - 270}
        color={COLORS.ink}
        size={56}
        delay={26}
      />
    </SceneShell>
  );
};
