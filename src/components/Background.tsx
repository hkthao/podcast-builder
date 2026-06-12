import { AbsoluteFill, useCurrentFrame } from "remotion";
import { COLORS, FORMAT, MOOD_BG, SAFE_ZONE, type MoodKey } from "../theme";
import { Sparkle, Squiggle, StarSmall, DottedPath } from "./doodles";

const GRID = 80;

/**
 * Nền scrapbook / bullet journal: giấy grid vàng tươi + masking tape ở mép
 * + vài doodle drifting THƯA ở rìa. Không đè vùng caption (safe-zone bottom).
 */
type Props = {
  mood?: MoodKey;
};

export const Background: React.FC<Props> = ({ mood = "positive" }) => {
  const bg = MOOD_BG[mood];
  return (
    <AbsoluteFill style={{ backgroundColor: bg }}>
      <GridPaper />
      <MaskingTape x={FORMAT.width * 0.18} y={70} width={260} rotate={-8} />
      <MaskingTape
        x={FORMAT.width * 0.85}
        y={FORMAT.height - 130}
        width={220}
        rotate={6}
      />
      <DriftingDoodles />
    </AbsoluteFill>
  );
};

const GridPaper: React.FC = () => (
  <div
    style={{
      position: "absolute",
      inset: 0,
      backgroundImage: `
        linear-gradient(to right, ${COLORS.gridLine} 1px, transparent 1px),
        linear-gradient(to bottom, ${COLORS.gridLine} 1px, transparent 1px)
      `,
      backgroundSize: `${GRID}px ${GRID}px`,
      opacity: 0.85,
    }}
  />
);

type TapeProps = { x: number; y: number; width: number; rotate?: number };

const MaskingTape: React.FC<TapeProps> = ({ x, y, width, rotate = 0 }) => (
  <div
    style={{
      position: "absolute",
      left: x,
      top: y,
      width,
      height: 60,
      transform: `translate(-50%, -50%) rotate(${rotate}deg)`,
      transformOrigin: "center",
      backgroundColor: "rgba(255, 255, 255, 0.55)",
      borderTop: `2px dashed rgba(22, 36, 79, 0.18)`,
      borderBottom: `2px dashed rgba(22, 36, 79, 0.18)`,
      boxShadow: "0 4px 0 rgba(22, 36, 79, 0.08)",
      pointerEvents: "none",
    }}
  />
);

const DriftingDoodles: React.FC = () => {
  const frame = useCurrentFrame();
  const t = frame / 60;
  const safeBottomY = FORMAT.height - SAFE_ZONE.bottom - 60;
  // Đặt thưa quanh rìa, tránh giữa khung (chỗ scene sticker) + tránh
  // vùng dưới (caption).
  return (
    <>
      <Sparkle x={120} y={260 + Math.sin(t) * 8} color={COLORS.accentRed} size={48} delay={0} />
      <Sparkle
        x={FORMAT.width - 140}
        y={420 + Math.cos(t * 0.8) * 8}
        color={COLORS.accentTeal}
        size={42}
        delay={20}
      />
      <StarSmall
        x={80}
        y={FORMAT.height * 0.5}
        color={COLORS.ink}
        size={56}
        delay={10}
      />
      <Squiggle
        x={FORMAT.width - 100}
        y={FORMAT.height * 0.62}
        color={COLORS.accentBlue}
        size={84}
        rotate={28}
        delay={5}
      />
      <DottedPath
        x={FORMAT.width * 0.5}
        y={safeBottomY}
        color={COLORS.ink}
        size={120}
        delay={30}
      />
      <StarSmall
        x={FORMAT.width - 90}
        y={220}
        color={COLORS.accentRed}
        size={44}
        delay={45}
      />
    </>
  );
};
