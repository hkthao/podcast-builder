/**
 * Bộ hình "bảng trắng vẽ tay" cho series phân tích (Tiền & Tâm Lý):
 * rough.js sinh nét bút dạ (seed cố định → mọi frame giống nhau, không rung),
 * @remotion/paths cho hiệu ứng nét đang được vẽ dần + đầu bút chạy theo nét.
 */
import React, { useMemo } from "react";
import { interpolate, useCurrentFrame, Easing } from "remotion";
import { evolvePath, getLength, getPointAtLength } from "@remotion/paths";
import rough from "roughjs";
import type { Options } from "roughjs/bin/core";
import { loadFont as loadPatrickHand } from "@remotion/google-fonts/PatrickHand";
import { loadFont as loadBeVietnamPro } from "@remotion/google-fonts/BeVietnamPro";

export const HAND_FONT = loadPatrickHand("normal", { subsets: ["latin", "vietnamese"] }).fontFamily;
export const NUM_FONT = loadBeVietnamPro("normal", { weights: ["700", "800"], subsets: ["latin", "vietnamese"] })
  .fontFamily;

const gen = rough.generator();

export type RoughShape =
  | { kind: "line"; points: Array<[number, number]> }
  | { kind: "curve"; points: Array<[number, number]> }
  | { kind: "ellipse"; cx: number; cy: number; w: number; h: number }
  | { kind: "rect"; x: number; y: number; w: number; h: number }
  | { kind: "path"; d: string };

type PathInfo = { d: string; stroke: string; strokeWidth: number; fill?: string };

const toPaths = (shape: RoughShape, opts: Options): PathInfo[] => {
  const o = { roughness: 1.2, bowing: 1, ...opts };
  const drawable =
    shape.kind === "line"
      ? gen.linearPath(shape.points, o)
      : shape.kind === "curve"
        ? gen.curve(shape.points, o)
        : shape.kind === "ellipse"
          ? gen.ellipse(shape.cx, shape.cy, shape.w, shape.h, o)
          : shape.kind === "rect"
            ? gen.rectangle(shape.x, shape.y, shape.w, shape.h, o)
            : gen.path(shape.d, o);
  return gen.toPaths(drawable);
};

/** progress của đoạn [from, from+dur] frame, có easing kiểu tay vẽ (nhanh giữa, chậm hai đầu). */
export const useProgress = (from: number, dur: number) => {
  const frame = useCurrentFrame();
  return interpolate(frame, [from, from + dur], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.cubic),
  });
};

/**
 * Một hình rough.js được vẽ dần trong [from, from+dur].
 * `pen` = hiện đầu bút ở mũi nét trong lúc vẽ.
 */
export const RoughDraw: React.FC<{
  shape: RoughShape;
  from: number;
  dur: number;
  stroke: string;
  strokeWidth?: number;
  seed: number;
  fill?: string;
  fillStyle?: Options["fillStyle"];
  roughness?: number;
  opacity?: number;
  pen?: boolean;
  dash?: number[];
}> = ({ shape, from, dur, stroke, strokeWidth = 6, seed, fill, fillStyle, roughness, opacity = 1, pen, dash }) => {
  const progress = useProgress(from, dur);
  // rough.js mặc định vẽ ĐÔI từng đoạn (đoạn 1 hai lần rồi mới sang đoạn 2) → vẽ dần thì bút
  // đi tới rồi giật lùi. Nên: nét chính 1 lượt liền mạch (disableMultiStroke + giữ đỉnh nối khít)
  // + 1 nét phụ mảnh seed khác chạy SONG SONG cùng progress cho chất bút dạ.
  const [main, ghost] = useMemo(() => {
    const base: Options = {
      stroke,
      seed,
      fill,
      fillStyle: fillStyle ?? "hachure",
      hachureGap: 14,
      fillWeight: strokeWidth * 0.5,
      disableMultiStroke: true,
      disableMultiStrokeFill: true,
      preserveVertices: true,
      ...(roughness !== undefined ? { roughness } : {}),
    };
    return [
      toPaths(shape, { ...base, strokeWidth }),
      toPaths(shape, { ...base, seed: seed + 97, strokeWidth: strokeWidth * 0.45, fill: undefined }),
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(shape), stroke, strokeWidth, seed, fill, fillStyle, roughness]);
  if (progress <= 0) return null;
  const lead = main.find((p) => !p.fill || p.fill === "none") ?? main[0];
  let tip: { x: number; y: number } | null = null;
  if (pen && progress < 1 && lead) {
    tip = getPointAtLength(lead.d, getLength(lead.d) * progress);
  }
  const draw = (p: PathInfo, key: string, layerOpacity: number) => {
    const isFill = p.fill && p.fill !== "none";
    const ev = dash ? null : evolvePath(progress, p.d);
    return (
      <path
        key={key}
        d={p.d}
        stroke={p.stroke}
        strokeWidth={p.strokeWidth}
        fill={isFill ? p.fill : "none"}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray={dash ? dash.join(" ") : ev!.strokeDasharray}
        strokeDashoffset={dash ? 0 : ev!.strokeDashoffset}
        opacity={(dash ? progress : 1) * layerOpacity}
      />
    );
  };
  return (
    <g opacity={opacity}>
      {ghost.map((p, i) => draw(p, `g${i}`, 0.55))}
      {main.map((p, i) => draw(p, `m${i}`, 1))}
      {tip ? <Marker x={tip.x} y={tip.y} color={stroke} /> : null}
    </g>
  );
};

/** Đầu bút dạ nghiêng: ngòi đúng tại (x, y), thân chéo lên phải. */
export const Marker: React.FC<{ x: number; y: number; color: string }> = ({ x, y, color }) => (
  <g transform={`translate(${x} ${y}) rotate(30)`}>
    <path d="M0 0 L-9 -22 L9 -22 Z" fill={color} />
    <rect x={-15} y={-34} width={30} height={14} rx={3} fill="#C9CCD3" />
    <rect x={-17} y={-190} width={34} height={158} rx={9} fill="#2B2F38" />
    <rect x={-17} y={-190} width={34} height={40} rx={9} fill={color} />
    <rect x={-10} y={-140} width={6} height={96} rx={3} fill="rgba(255,255,255,0.2)" />
  </g>
);

/** Chữ viết tay hiện dần từ trái sang phải (mặt nạ quét theo progress). */
export const HandText: React.FC<{
  x: number;
  y: number;
  from: number;
  dur: number;
  size: number;
  color: string;
  anchor?: "start" | "middle" | "end";
  font?: string;
  weight?: number;
  children: string;
  opacity?: number;
}> = ({ x, y, from, dur, size, color, anchor = "start", font = HAND_FONT, weight = 400, children, opacity = 1 }) => {
  const progress = useProgress(from, dur);
  const id = `ht${React.useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  if (progress <= 0) return null;
  // Ước bề rộng chữ để quét mặt nạ (chữ tay ~0.5em/ký tự).
  const w = children.length * size * 0.62;
  const x0 = anchor === "middle" ? x - w / 2 : anchor === "end" ? x - w : x;
  return (
    <g opacity={opacity}>
      <defs>
        <clipPath id={id}>
          <rect x={x0 - 10} y={y - size * 1.1} width={(w + 20) * progress} height={size * 1.5} />
        </clipPath>
      </defs>
      <text
        x={x}
        y={y}
        fontFamily={font}
        fontSize={size}
        fontWeight={weight}
        fill={color}
        textAnchor={anchor}
        clipPath={`url(#${id})`}
      >
        {children}
      </text>
    </g>
  );
};

/** Số đếm chạy từ `from` tới `to` theo progress, định dạng bằng `format`. */
export const useCount = (fromFrame: number, dur: number, a: number, b: number) => {
  const p = useProgress(fromFrame, dur);
  return a + (b - a) * p;
};

/** Nền giấy bảng trắng + lưới mờ + vân giấy nhẹ. */
export const PaperBoard: React.FC<{ width: number; height: number; bg: string; grid: string }> = ({
  width,
  height,
  bg,
  grid,
}) => (
  <svg width={width} height={height} style={{ position: "absolute", inset: 0 }}>
    <defs>
      <pattern id="board-grid" width={60} height={60} patternUnits="userSpaceOnUse">
        <path d="M60 0 L0 0 0 60" fill="none" stroke={grid} strokeWidth={2} />
      </pattern>
      <filter id="board-grain">
        <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves={2} seed={7} />
        <feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.05 0" />
      </filter>
      <radialGradient id="board-vignette" cx="50%" cy="45%" r="75%">
        <stop offset="60%" stopColor="rgba(0,0,0,0)" />
        <stop offset="100%" stopColor="rgba(0,0,0,0.10)" />
      </radialGradient>
    </defs>
    <rect width={width} height={height} fill={bg} />
    <rect width={width} height={height} fill="url(#board-grid)" />
    <rect width={width} height={height} filter="url(#board-grain)" />
    <rect width={width} height={height} fill="url(#board-vignette)" />
  </svg>
);

/** Ngắt dòng thô theo số ký tự (Patrick Hand ~0.44em/ký tự) cho <text> SVG. */
export const wrapLines = (text: string, maxWidth: number, size: number): string[] => {
  const maxChars = Math.max(8, Math.floor(maxWidth / (size * 0.44)));
  const lines: string[] = [];
  let cur = "";
  for (const w of text.split(/\s+/)) {
    if (cur && (cur + " " + w).length > maxChars) {
      lines.push(cur);
      cur = w;
    } else cur = cur ? `${cur} ${w}` : w;
  }
  if (cur) lines.push(cur);
  return lines;
};

/** Định dạng tiền tính bằng triệu: 594 → "594 triệu", 2330 → "2,3 tỷ". */
export const fmtTrieu = (v: number) =>
  v < 1000 ? `${Math.round(v)} triệu` : `${(v / 1000).toFixed(1).replace(".", ",")} tỷ`;
