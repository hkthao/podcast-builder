import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { COLORS, FORMAT, MOOD_BG, SAFE_ZONE, type MoodKey } from "../theme";
import { Sparkle, Squiggle, StarSmall, DottedPath } from "./doodles";
import type { Scene } from "../scenes";
import { currentSceneIndex, sceneVariant } from "./scene-runtime";

const GRID = 80;

/**
 * Nền scrapbook / bullet journal: giấy grid + masking tape + doodle drifting.
 * Phase variety: mood + layout doodle/tape ĐỔI THEO scene đang active (variant
 * 0..3) thay vì cố định cả video → nền không còn y hệt nhau.
 */
type Props = {
  mood?: MoodKey;
  scenes?: Scene[];
};

export const Background: React.FC<Props> = ({ mood = "positive", scenes }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const currentMs = (frame / fps) * 1000;

  let activeMood: MoodKey = mood;
  let variant = 0;
  if (scenes && scenes.length > 0) {
    const idx = currentSceneIndex(scenes, currentMs);
    if (idx >= 0) {
      activeMood = scenes[idx].mood;
      variant = sceneVariant(idx);
    }
  }

  const bg = MOOD_BG[activeMood];
  const tapeRotate = [-8, 5, -4, 9][variant];
  return (
    <AbsoluteFill style={{ backgroundColor: bg }}>
      <GridPaper opacity={0.7 + variant * 0.05} />
      <MaskingTape x={FORMAT.width * 0.18} y={70} width={260} rotate={tapeRotate} />
      <MaskingTape
        x={FORMAT.width * 0.85}
        y={FORMAT.height - 130}
        width={220}
        rotate={-tapeRotate}
      />
      <DriftingDoodles variant={variant} />
    </AbsoluteFill>
  );
};

const GridPaper: React.FC<{ opacity: number }> = ({ opacity }) => (
  <div
    style={{
      position: "absolute",
      inset: 0,
      backgroundImage: `
        linear-gradient(to right, ${COLORS.gridLine} 1px, transparent 1px),
        linear-gradient(to bottom, ${COLORS.gridLine} 1px, transparent 1px)
      `,
      backgroundSize: `${GRID}px ${GRID}px`,
      opacity,
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

/** Bộ màu doodle xoay theo variant — mỗi scene 1 tông rìa khác. */
const DOODLE_PALETTES = [
  [COLORS.accentRed, COLORS.accentTeal, COLORS.ink, COLORS.accentBlue],
  [COLORS.accentBlue, COLORS.accentRed, COLORS.accentTeal, COLORS.ink],
  [COLORS.accentTeal, COLORS.ink, COLORS.accentBlue, COLORS.accentRed],
  [COLORS.ink, COLORS.accentBlue, COLORS.accentRed, COLORS.accentTeal],
] as const;

const DriftingDoodles: React.FC<{ variant: number }> = ({ variant }) => {
  const frame = useCurrentFrame();
  const t = frame / 60;
  const safeBottomY = FORMAT.height - SAFE_ZONE.bottom - 60;
  const pal = DOODLE_PALETTES[variant];
  // Offset dọc xoay theo variant để vị trí doodle dịch giữa các scene.
  const off = variant * 36;
  return (
    <>
      <Sparkle x={120} y={240 + off + Math.sin(t) * 8} color={pal[0]} size={48} delay={0} />
      <Sparkle
        x={FORMAT.width - 140}
        y={440 - off + Math.cos(t * 0.8) * 8}
        color={pal[1]}
        size={42}
        delay={20}
      />
      <StarSmall
        x={80}
        y={FORMAT.height * 0.5 + off}
        color={pal[2]}
        size={56}
        delay={10}
      />
      <Squiggle
        x={FORMAT.width - 100}
        y={FORMAT.height * 0.62 - off}
        color={pal[3]}
        size={84}
        rotate={28 + variant * 12}
        delay={5}
      />
      <DottedPath
        x={FORMAT.width * 0.5}
        y={safeBottomY}
        color={pal[2]}
        size={120}
        delay={30}
      />
      <StarSmall
        x={FORMAT.width - 90}
        y={220 + off}
        color={pal[0]}
        size={44}
        delay={45}
      />
    </>
  );
};
