import { Maze, QuestionMark } from "../stickers";
import { DottedPath, StarSmall } from "../doodles";
import { SceneShell, STICKER_BAND, type SceneProps } from "./base";
import { COLORS } from "../../theme";

/** Mê cung — lạc lối, rối ren, hoang mang, tìm đường. */
export const Labyrinth: React.FC<SceneProps> = ({ accentColor }) => {
  const midY = (STICKER_BAND.yTop + STICKER_BAND.yBottom) / 2;
  return (
    <SceneShell>
      <Maze
        x={STICKER_BAND.xCenter}
        y={midY - 20}
        size={460}
        delay={6}
        accent={accentColor}
      />
      <QuestionMark x={STICKER_BAND.xCenter + 320} y={midY + 230} size={210} delay={18} accent={accentColor} />
      <StarSmall x={STICKER_BAND.xCenter - 320} y={midY - 240} color={COLORS.ink} size={54} delay={22} />
      <DottedPath x={STICKER_BAND.xCenter} y={midY + 360} size={420} color={COLORS.ink} />
    </SceneShell>
  );
};
