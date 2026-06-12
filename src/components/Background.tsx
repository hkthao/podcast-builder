import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { COLORS, FORMAT, withAlpha } from "../theme";

/**
 * Nền base — gradient chuyển động rất chậm (không tĩnh) để tạo cảm
 * giác "thở". Đây là lớp DƯỚI cùng — VisualLayer (stock/ai/procedural)
 * sẽ phủ lên, rồi CohesionOverlay phủ tiếp.
 */
export const Background: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;

  const cx1 = 50 + Math.sin(t * 0.04) * 12;
  const cy1 = 35 + Math.cos(t * 0.03) * 8;
  const cx2 = 50 - Math.sin(t * 0.05) * 10;
  const cy2 = 70 + Math.cos(t * 0.04) * 6;

  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.bg }}>
      <AbsoluteFill
        style={{
          background: `radial-gradient(ellipse 60% 50% at ${cx1}% ${cy1}%,
            ${withAlpha(COLORS.bgLayer, 1)} 0%,
            ${withAlpha(COLORS.bg, 0)} 70%)`,
        }}
      />
      <AbsoluteFill
        style={{
          background: `radial-gradient(ellipse 70% 60% at ${cx2}% ${cy2}%,
            ${withAlpha(COLORS.accentCool, 0.08)} 0%,
            ${withAlpha(COLORS.bg, 0)} 60%)`,
        }}
      />
      <svg
        width={FORMAT.width}
        height={FORMAT.height}
        style={{ position: "absolute", inset: 0, opacity: 0.12 }}
      >
        <defs>
          <filter id="bg-noise">
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.012"
              numOctaves="3"
              seed="42"
            />
            <feColorMatrix
              type="matrix"
              values="0 0 0 0 0.06
                      0 0 0 0 0.06
                      0 0 0 0 0.08
                      0 0 0 0.4 0"
            />
          </filter>
        </defs>
        <rect width="100%" height="100%" filter="url(#bg-noise)" />
      </svg>
    </AbsoluteFill>
  );
};
