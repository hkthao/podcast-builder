import {
  CoffeeMug,
  Headphones,
  Mic,
  SmileyCloud,
} from "../stickers";
import { Squiggle, Sparkle, StarSmall } from "../doodles";
import { SceneShell, STICKER_BAND, type SceneProps } from "./base";
import { COLORS } from "../../theme";

/** Cảnh mặc định / fallback — mic + headphones + cốc + sóng âm. */
export const PodcastDesk: React.FC<SceneProps> = ({ accentColor, audioLevel = 0 }) => {
  const midY = (STICKER_BAND.yTop + STICKER_BAND.yBottom) / 2;
  return (
    <SceneShell>
      <Mic
        x={STICKER_BAND.xCenter}
        y={midY - 80}
        size={420}
        delay={6}
        accent={accentColor}
        audioLevel={audioLevel}
      />
      <Headphones
        x={STICKER_BAND.xCenter - 320}
        y={midY + 180}
        size={300}
        delay={14}
        rotate={-8}
      />
      <CoffeeMug
        x={STICKER_BAND.xCenter + 320}
        y={midY + 200}
        size={280}
        delay={20}
        rotate={6}
      />
      <SmileyCloud
        x={STICKER_BAND.xCenter - 380}
        y={midY - 360}
        size={200}
        delay={26}
        accent={accentColor}
      />
      <Squiggle
        x={STICKER_BAND.xCenter}
        y={midY + 480}
        size={500}
        color={COLORS.ink}
        delay={4}
      />
      <Sparkle x={STICKER_BAND.xCenter + 380} y={midY - 240} color={accentColor} size={80} />
      <StarSmall x={STICKER_BAND.xCenter - 260} y={midY - 280} color={COLORS.accentBlue} size={64} />
    </SceneShell>
  );
};
