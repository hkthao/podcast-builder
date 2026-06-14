import { Books, CoffeeMug, NotebookPaper, Plant } from "../stickers";
import { Sparkle, Squiggle, StarSmall } from "../doodles";
import { SceneShell, STICKER_BAND, type SceneProps } from "./base";
import { COLORS } from "../../theme";

/** Tri thức — sách + notebook + cốc + cây. Nền kem (bgAlt) chốt ở SceneLayer. */
export const Knowledge: React.FC<SceneProps> = ({ accentColor }) => {
  const midY = (STICKER_BAND.yTop + STICKER_BAND.yBottom) / 2;
  return (
    <SceneShell>
      <Books
        x={STICKER_BAND.xCenter - 60}
        y={midY - 40}
        size={420}
        delay={6}
        accent={accentColor}
      />
      <NotebookPaper
        x={STICKER_BAND.xCenter + 320}
        y={midY + 220}
        size={300}
        delay={14}
        rotate={6}
      />
      <CoffeeMug
        x={STICKER_BAND.xCenter - 340}
        y={midY + 240}
        size={260}
        delay={20}
        rotate={-6}
      />
      <Plant
        x={STICKER_BAND.xCenter + 340}
        y={midY - 260}
        size={240}
        delay={24}
      />
      <Sparkle x={STICKER_BAND.xCenter - 320} y={midY - 300} color={accentColor} size={70} />
      <StarSmall x={STICKER_BAND.xCenter} y={midY - 420} color={COLORS.ink} size={60} />
      <Squiggle
        x={STICKER_BAND.xCenter}
        y={midY + 480}
        size={440}
        color={COLORS.ink}
      />
    </SceneShell>
  );
};
