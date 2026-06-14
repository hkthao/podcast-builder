import { useCurrentFrame } from "remotion";
import { COLORS } from "../../theme";

export type DoodleProps = {
  x: number;
  y: number;
  size?: number;
  rotate?: number;
  color?: string;
  delay?: number;
  /** Animation cường độ (0..1). Default 1. */
  intensity?: number;
};

const wrap = (
  x: number,
  y: number,
  size: number,
  rotate: number,
  drift: number,
  bob: number,
  opacity: number,
  children: React.ReactNode,
  viewBox = "0 0 100 100",
) => (
  <div
    style={{
      position: "absolute",
      left: x + drift,
      top: y + bob,
      width: size,
      height: size,
      transform: `translate(-50%, -50%) rotate(${rotate}deg)`,
      transformOrigin: "center",
      opacity,
      pointerEvents: "none",
    }}
  >
    <svg viewBox={viewBox} width={size} height={size} overflow="visible">
      {children}
    </svg>
  </div>
);

/** Squiggle lượn nhẹ — dùng làm sóng âm doodle hoặc gạch ngắn. */
export const Squiggle: React.FC<DoodleProps> = ({
  x,
  y,
  size = 80,
  rotate = 0,
  color = COLORS.ink,
  delay = 0,
  intensity = 1,
}) => {
  const frame = useCurrentFrame();
  const drift = Math.sin((frame + delay) / 60) * 6 * intensity;
  const bob = Math.cos((frame + delay) / 70) * 3 * intensity;
  return wrap(
    x,
    y,
    size,
    rotate,
    drift,
    bob,
    0.85,
    <path
      d="M 6 50 Q 22 30 38 50 Q 54 70 70 50 Q 86 30 94 50"
      stroke={color}
      strokeWidth={6}
      strokeLinecap="round"
      fill="none"
    />,
  );
};

export const Sparkle: React.FC<DoodleProps> = ({
  x,
  y,
  size = 56,
  rotate = 0,
  color = COLORS.accentRed,
  delay = 0,
  intensity = 1,
}) => {
  const frame = useCurrentFrame();
  const twinkle = 0.6 + (Math.sin((frame + delay) / 12) + 1) * 0.2 * intensity;
  return wrap(
    x,
    y,
    size,
    rotate + (frame + delay) * 0.4,
    0,
    0,
    twinkle,
    <>
      <path
        d="M 50 8 L 56 44 L 92 50 L 56 56 L 50 92 L 44 56 L 8 50 L 44 44 Z"
        fill={color}
        stroke={COLORS.ink}
        strokeWidth={3}
        strokeLinejoin="round"
      />
    </>,
  );
};

export const StarSmall: React.FC<DoodleProps> = ({
  x,
  y,
  size = 50,
  rotate = 0,
  color = COLORS.ink,
  delay = 0,
}) => {
  const frame = useCurrentFrame();
  const bob = Math.sin((frame + delay) / 28) * 4;
  return wrap(
    x,
    y,
    size,
    rotate,
    0,
    bob,
    0.75,
    <path
      d="M 50 12 L 60 40 L 88 44 L 66 62 L 74 90 L 50 74 L 26 90 L 34 62 L 12 44 L 40 40 Z"
      fill="none"
      stroke={color}
      strokeWidth={5}
      strokeLinejoin="round"
    />,
  );
};

export const Arrow: React.FC<DoodleProps> = ({
  x,
  y,
  size = 70,
  rotate = 0,
  color = COLORS.ink,
  delay = 0,
}) => {
  const frame = useCurrentFrame();
  const drift = Math.sin((frame + delay) / 50) * 4;
  return wrap(
    x,
    y,
    size,
    rotate,
    drift,
    0,
    0.85,
    <>
      <path
        d="M 10 50 Q 30 20 70 50"
        stroke={color}
        strokeWidth={6}
        fill="none"
        strokeLinecap="round"
      />
      <path
        d="M 60 38 L 76 50 L 60 62"
        stroke={color}
        strokeWidth={6}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </>,
  );
};

export const Underline: React.FC<DoodleProps> = ({
  x,
  y,
  size = 120,
  rotate = 0,
  color = COLORS.accentRed,
}) => {
  return wrap(
    x,
    y,
    size,
    rotate,
    0,
    0,
    0.9,
    <path
      d="M 8 30 Q 30 18 50 26 Q 72 34 92 22"
      stroke={color}
      strokeWidth={8}
      fill="none"
      strokeLinecap="round"
    />,
  );
};

export const DottedPath: React.FC<DoodleProps> = ({
  x,
  y,
  size = 100,
  rotate = 0,
  color = COLORS.ink,
  delay = 0,
}) => {
  const frame = useCurrentFrame();
  const offset = ((frame + delay) % 30) * 0.5;
  return wrap(
    x,
    y,
    size,
    rotate,
    0,
    0,
    0.6,
    <path
      d="M 6 50 Q 30 20 50 50 Q 70 80 94 50"
      stroke={color}
      strokeWidth={5}
      strokeDasharray="2 14"
      strokeDashoffset={-offset}
      strokeLinecap="round"
      fill="none"
    />,
  );
};

export const Cloud: React.FC<DoodleProps> = ({
  x,
  y,
  size = 100,
  rotate = 0,
  color = COLORS.white,
  delay = 0,
}) => {
  const frame = useCurrentFrame();
  const drift = Math.sin((frame + delay) / 80) * 8;
  return wrap(
    x,
    y,
    size,
    rotate,
    drift,
    0,
    0.85,
    <path
      d="M 18 58 Q 6 58 6 46 Q 6 34 20 34 Q 22 22 38 22 Q 50 16 62 24 Q 78 22 82 36 Q 96 38 96 50 Q 96 62 84 62 Z"
      fill={color}
      stroke={COLORS.ink}
      strokeWidth={5}
      strokeLinejoin="round"
    />,
  );
};

export const Confetti: React.FC<DoodleProps> = ({
  x,
  y,
  size = 90,
  rotate = 0,
  delay = 0,
}) => {
  const frame = useCurrentFrame();
  const t = (frame + delay) / 40;
  const drift = Math.sin(t) * 6;
  return wrap(
    x,
    y,
    size,
    rotate + frame * 0.6,
    drift,
    0,
    0.85,
    <>
      <rect x={20} y={30} width={12} height={6} fill={COLORS.accentRed} rx={2} />
      <rect x={50} y={20} width={10} height={6} fill={COLORS.accentBlue} rx={2} transform="rotate(30 55 23)" />
      <rect x={70} y={50} width={12} height={6} fill={COLORS.accentTeal} rx={2} transform="rotate(-20 76 53)" />
      <circle cx={36} cy={64} r={4} fill={COLORS.accentRed} />
      <circle cx={68} cy={36} r={4} fill={COLORS.accentTeal} />
    </>,
  );
};
