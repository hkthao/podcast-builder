import { SmileyFace } from "../stickers";
import { Squiggle, Sparkle } from "../doodles";
import { SceneShell, STICKER_BAND, type SceneProps } from "./base";
import { COLORS } from "../../theme";

/** Đám đông — lưới 7 SmileyFace, một cái khác màu nổi bật. */
export const Crowd: React.FC<SceneProps> = ({ accentColor }) => {
  const midY = (STICKER_BAND.yTop + STICKER_BAND.yBottom) / 2;
  const faces: Array<{
    dx: number;
    dy: number;
    color: string;
    delay: number;
    size: number;
    sad?: boolean;
  }> = [
    { dx: -300, dy: -200, color: COLORS.accentBlue, delay: 4, size: 180 },
    { dx: 0, dy: -260, color: COLORS.accentRed, delay: 10, size: 200 },
    { dx: 300, dy: -200, color: COLORS.accentTeal, delay: 14, size: 180 },
    { dx: -380, dy: 80, color: COLORS.accentBlue, delay: 18, size: 180 },
    { dx: -60, dy: 60, color: accentColor, delay: 22, size: 240 },
    { dx: 360, dy: 80, color: COLORS.accentRed, delay: 26, size: 180 },
    { dx: 0, dy: 360, color: COLORS.accentTeal, delay: 30, size: 160, sad: true },
  ];
  return (
    <SceneShell>
      {faces.map((f, i) => (
        <SmileyFace
          key={i}
          x={STICKER_BAND.xCenter + f.dx}
          y={midY + f.dy}
          size={f.size}
          accent={f.color}
          delay={f.delay}
          sad={f.sad}
        />
      ))}
      <Sparkle x={STICKER_BAND.xCenter - 60} y={midY - 60} color={accentColor} size={80} />
      <Squiggle
        x={STICKER_BAND.xCenter}
        y={midY + 540}
        size={460}
        color={COLORS.ink}
      />
    </SceneShell>
  );
};
