import { spring, useCurrentFrame, useVideoConfig } from "remotion";
import { COLORS } from "../../theme";

/**
 * Props chung cho mọi sticker. Sticker tự lo pop-in (`spring`) theo
 * `delay` + bob nhẹ; container đặt vào (x,y) là center.
 */
export type StickerProps = {
  /** Center x trong khung 1080×1920 */
  x: number;
  /** Center y trong khung 1080×1920 */
  y: number;
  /** Cạnh bounding box (px). Default 220. */
  size?: number;
  /** Frame delay trước pop-in. Default 0. */
  delay?: number;
  /** Xoay tĩnh (deg). Default 0. */
  rotate?: number;
  /** Bật bob (mặc định bật). */
  bob?: boolean;
  /** 0..1 — biên độ audio để "thở". */
  audioLevel?: number;
  /** Accent color cho mảng nhấn (vd thân tim, mặt sticker). */
  accent?: string;
  /** Lật ngang. */
  flip?: boolean;
};

export const INK = COLORS.ink;
export const WHITE = COLORS.white;
/** Halo trắng dày để tạo viền sticker. */
export const HALO = 22;
/** Nét ink chính. */
export const INK_W = 6;

/** Tô shape kiểu sticker: halo trắng dày + ink stroke. */
export const inkStroke = (extra: Record<string, unknown> = {}) => ({
  stroke: INK,
  strokeWidth: INK_W,
  strokeLinejoin: "round" as const,
  strokeLinecap: "round" as const,
  fill: "none" as const,
  ...extra,
});

export const StickerBase: React.FC<
  StickerProps & { viewBox?: string; children: React.ReactNode }
> = ({
  x,
  y,
  size = 220,
  delay = 0,
  rotate = 0,
  bob = true,
  audioLevel = 0,
  flip = false,
  viewBox = "0 0 100 100",
  children,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const localFrame = Math.max(0, frame - delay);
  const pop = spring({
    frame: localFrame,
    fps,
    config: { damping: 11, mass: 0.5, stiffness: 110 },
    durationInFrames: 20,
  });
  const bobY = bob ? Math.sin((frame + delay * 3) / 22) * 6 : 0;
  const breath = 1 + (audioLevel ?? 0) * 0.06;
  const scale = pop * breath;
  const scaleX = flip ? -scale : scale;
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y + bobY,
        width: size,
        height: size,
        transform: `translate(-50%, -50%) rotate(${rotate}deg) scale(${scaleX}, ${scale})`,
        transformOrigin: "center",
        pointerEvents: "none",
      }}
    >
      <svg viewBox={viewBox} width={size} height={size} overflow="visible">
        {children}
      </svg>
    </div>
  );
};

/**
 * Render một shape kiểu sticker: vẽ halo trắng dày sau, ink stroke trước.
 * Dùng cho path/shape có outline rõ. Element nhận `<path>` / `<rect>` /
 * `<circle>` v.v. (clone twice với props khác).
 */
type ShapeProps = {
  d?: string;
  rect?: { x: number; y: number; width: number; height: number; rx?: number };
  circle?: { cx: number; cy: number; r: number };
  ellipse?: { cx: number; cy: number; rx: number; ry: number };
  line?: { x1: number; y1: number; x2: number; y2: number };
  /** Màu fill bên trong (sau halo trắng). Default trong suốt. */
  fill?: string;
  /** Halo trắng dày để tạo viền sticker. Default true. */
  halo?: boolean;
  /** Override stroke ink (vd vẽ đường mảnh). */
  inkWidth?: number;
};

export const StickerShape: React.FC<ShapeProps> = ({
  d,
  rect,
  circle,
  ellipse,
  line,
  fill = "none",
  halo = true,
  inkWidth = INK_W,
}) => {
  const renderShape = (
    stroke: string,
    sw: number,
    f: string,
    key: string,
  ): React.ReactElement | null => {
    const common = {
      key,
      stroke,
      strokeWidth: sw,
      strokeLinejoin: "round" as const,
      strokeLinecap: "round" as const,
      fill: f,
    };
    if (d) return <path d={d} {...common} />;
    if (rect)
      return (
        <rect
          x={rect.x}
          y={rect.y}
          width={rect.width}
          height={rect.height}
          rx={rect.rx}
          {...common}
        />
      );
    if (circle) return <circle cx={circle.cx} cy={circle.cy} r={circle.r} {...common} />;
    if (ellipse)
      return (
        <ellipse
          cx={ellipse.cx}
          cy={ellipse.cy}
          rx={ellipse.rx}
          ry={ellipse.ry}
          {...common}
        />
      );
    if (line)
      return <line x1={line.x1} y1={line.y1} x2={line.x2} y2={line.y2} {...common} />;
    return null;
  };

  return (
    <>
      {halo
        ? renderShape(WHITE, inkWidth + HALO, fill === "none" ? "none" : WHITE, "halo")
        : null}
      {renderShape(INK, inkWidth, fill, "ink")}
    </>
  );
};
