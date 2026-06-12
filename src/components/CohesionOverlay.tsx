import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { COLORS, FORMAT, withAlpha } from "../theme";

/**
 * 3 lớp đồng nhất phủ lên TẤT CẢ nguồn hình (stock/ai/procedural):
 *   1. Tint thương hiệu (overlay nhẹ, kéo về tông trầm)
 *   2. Grain (texture SVG fractalNoise, opacity ~6%)
 *   3. Vignette + gradient bottom (đảm bảo caption đọc rõ)
 * Đây là thứ làm A/B/C trông "cùng một kênh" — Phase 5 Mục 11.3.
 */
export const CohesionOverlay: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const grainSeed = Math.floor(frame / Math.max(1, Math.round(fps / 12))) * 7;

  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <AbsoluteFill
        style={{
          background: `linear-gradient(180deg,
            ${withAlpha(COLORS.bg, 0.0)} 0%,
            ${withAlpha(COLORS.bg, 0.0)} 35%,
            ${withAlpha(COLORS.bg, 0.55)} 75%,
            ${withAlpha(COLORS.bg, 0.85)} 100%)`,
        }}
      />
      <AbsoluteFill
        style={{
          background: `radial-gradient(ellipse at 50% 40%,
            transparent 0%,
            transparent 55%,
            ${withAlpha(COLORS.bg, 0.55)} 100%)`,
        }}
      />
      <AbsoluteFill
        style={{
          mixBlendMode: "soft-light",
          background: `radial-gradient(ellipse at 50% 35%,
            ${withAlpha(COLORS.signature, 0.18)} 0%,
            ${withAlpha(COLORS.signature, 0.06)} 35%,
            ${withAlpha(COLORS.bg, 0)} 70%)`,
        }}
      />
      <svg
        width={FORMAT.width}
        height={FORMAT.height}
        style={{
          position: "absolute",
          inset: 0,
          opacity: 0.07,
          mixBlendMode: "overlay",
        }}
      >
        <filter id={`grain-${grainSeed}`}>
          <feTurbulence
            type="fractalNoise"
            baseFrequency="1.8"
            numOctaves="2"
            seed={grainSeed}
            stitchTiles="stitch"
          />
          <feColorMatrix
            type="matrix"
            values="0 0 0 0 0.93
                    0 0 0 0 0.91
                    0 0 0 0 0.88
                    0 0 0 0.5 0"
          />
        </filter>
        <rect width="100%" height="100%" filter={`url(#grain-${grainSeed})`} />
      </svg>
    </AbsoluteFill>
  );
};
