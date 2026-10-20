/**
 * Các mẫu cảnh vẽ tay dựng từ dữ liệu (VizScene). Toạ độ thiết kế 1080×1920, vùng vẽ
 * nằm giữa tiêu đề chương (trên) và caption + UI Facebook (dưới) — xem BOX.
 * Nhịp: mỗi cảnh nhận `dur` (frame) và tự giãn/nén các bước vẽ cho vừa đoạn đọc.
 */
import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { SERIES } from "../series";
import type { VizColor, VizScene } from "./types";
import { HAND_FONT, HandText, NUM_FONT, RoughDraw, fmtTrieu, useCount, useProgress, wrapLines } from "./primitives";

const pal = SERIES["tien-tam-ly"].palette!;
// y0 dưới watermark (logo + badge #, ~y460) và hộp trích dẫn nguồn; y1 trên caption.
export const BOX = { x0: 90, x1: 950, y0: 480, y1: 1340 } as const;
const CX = (BOX.x0 + BOX.x1) / 2;
const BW = BOX.x1 - BOX.x0;
const BH = BOX.y1 - BOX.y0;

export const colorOf = (c: VizColor | undefined, fallback = pal.ink) =>
  c === "green" ? pal.accentTeal : c === "red" ? pal.accentRed : c === "blue" ? pal.accentBlue : c === "ink" ? pal.ink : fallback;

/** Seed ổn định theo chuỗi → mỗi hình có nét riêng nhưng không đổi giữa các frame. */
const seedOf = (s: string) => {
  let h = 7;
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) % 100_000;
  return h + 1;
};

const Title: React.FC<{ text?: string }> = ({ text }) =>
  text ? (
    <HandText x={CX} y={BOX.y0 + 50} from={0} dur={18} size={60} color={pal.inkMuted} anchor="middle">
      {text}
    </HandText>
  ) : null;

/** Dấu ✓ / ✗ / cờ vẽ tay tại (x, y) = tâm. */
const Mark: React.FC<{ kind: "ok" | "bad" | "flag"; x: number; y: number; from: number }> = ({ kind, x, y, from }) => {
  if (kind === "ok")
    return (
      <RoughDraw
        shape={{ kind: "line", points: [[x - 26, y], [x - 6, y + 22], [x + 30, y - 26]] }}
        from={from}
        dur={12}
        stroke={pal.accentTeal}
        strokeWidth={9}
        seed={seedOf(`ok${x}${y}`)}
      />
    );
  if (kind === "bad")
    return (
      <>
        <RoughDraw shape={{ kind: "line", points: [[x - 24, y - 24], [x + 24, y + 24]] }} from={from} dur={7} stroke={pal.accentRed} strokeWidth={9} seed={seedOf(`b1${x}`)} />
        <RoughDraw shape={{ kind: "line", points: [[x + 24, y - 24], [x - 24, y + 24]] }} from={from + 6} dur={7} stroke={pal.accentRed} strokeWidth={9} seed={seedOf(`b2${y}`)} />
      </>
    );
  // Cờ đỏ: cán dọc + lá cờ tam giác bay sang phải, tô kín (dễ đọc ở cỡ nhỏ).
  return <Flag x={x} y={y} from={from} />;
};

const Flag: React.FC<{ x: number; y: number; from: number }> = ({ x, y, from }) => {
  const fillIn = useProgress(from + 8, 10);
  const pole: [number, number][] = [[x - 20, y + 40], [x - 20, y - 40]];
  const tri = `M ${x - 20} ${y - 40} L ${x + 34} ${y - 24} L ${x - 20} ${y - 6} Z`;
  return (
    <>
      <RoughDraw shape={{ kind: "line", points: pole }} from={from} dur={8} stroke={pal.ink} strokeWidth={7} seed={seedOf(`fp${y}`)} />
      <path d={tri} fill={pal.accentRed} opacity={fillIn * 0.9} />
      <RoughDraw shape={{ kind: "path", d: tri }} from={from + 6} dur={10} stroke={pal.accentRed} strokeWidth={6} seed={seedOf(`ft${x}${y}`)} />
    </>
  );
};

/** Mũi tên rough từ a tới b (đầu mũi tên 2 nét). */
const Arrow: React.FC<{ a: [number, number]; b: [number, number]; from: number; dur: number; color: string; seed: number }> = ({
  a,
  b,
  from,
  dur,
  color,
  seed,
}) => {
  const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
  const head = (d: number): [number, number] => [b[0] - 34 * Math.cos(ang + d), b[1] - 34 * Math.sin(ang + d)];
  return (
    <>
      <RoughDraw shape={{ kind: "line", points: [a, b] }} from={from} dur={dur} stroke={color} strokeWidth={6} seed={seed} />
      <RoughDraw shape={{ kind: "line", points: [head(0.45), b, head(-0.45)] }} from={from + dur} dur={6} stroke={color} strokeWidth={6} seed={seed + 1} />
    </>
  );
};

// ───────────────────────── steps ─────────────────────────
const Steps: React.FC<{ s: Extract<VizScene, { type: "steps" }>; dur: number }> = ({ s, dur }) => {
  const n = s.steps.length;
  const boxH = 130;
  const gap = 64;
  const top = BOX.y0 + (s.title ? 130 : 40) + Math.max(0, (BH - 130 - (n * boxH + (n - 1) * gap)) / 2 - 40);
  const stag = Math.max(18, Math.min(60, (dur - 40) / n));
  return (
    <>
      <Title text={s.title} />
      {s.steps.map((st, i) => {
        const y = top + i * (boxH + gap);
        const t = 12 + i * stag;
        const x0 = BOX.x0 + 40;
        const w = BW - 160;
        return (
          <g key={i}>
            {i > 0 ? (
              <Arrow a={[CX - 60, y - gap + 8]} b={[CX - 60, y - 10]} from={t - 10} dur={8} color={pal.inkMuted} seed={seedOf(`sa${i}`)} />
            ) : null}
            <RoughDraw
              shape={{ kind: "rect", x: x0, y, w, h: boxH }}
              from={t}
              dur={14}
              stroke={st.mark === "bad" ? pal.accentRed : pal.ink}
              strokeWidth={5}
              seed={seedOf(`sb${i}${st.label}`)}
              roughness={1.4}
            />
            <HandText x={x0 + 36} y={y + boxH / 2 + 20} from={t + 6} dur={14} size={58} color={pal.ink}>
              {st.label}
            </HandText>
            {st.value ? (
              <HandText
                x={x0 + w - 36}
                y={y + boxH / 2 + 22}
                from={t + 12}
                dur={12}
                size={64}
                font={NUM_FONT}
                weight={800}
                color={st.mark === "bad" ? pal.accentRed : st.mark === "ok" ? pal.accentTeal : pal.ink}
                anchor="end"
              >
                {st.value}
              </HandText>
            ) : null}
            {st.mark ? <Mark kind={st.mark} x={x0 + w + 56} y={y + boxH / 2} from={t + 22} /> : null}
          </g>
        );
      })}
    </>
  );
};

// ───────────────────────── lineChart ─────────────────────────
const LineChart: React.FC<{ s: Extract<VizScene, { type: "lineChart" }>; dur: number }> = ({ s, dur }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const px0 = BOX.x0 + 70;
  const px1 = BOX.x1 - 20;
  const py0 = BOX.y1 - 110; // gốc trục y
  const py1 = BOX.y0 + (s.title ? 190 : 90);
  const n = s.series.length;
  const axisDur = 20;
  const avail = Math.max(60, dur - axisDur - (s.stamp ? 60 : 30));
  const drawDur = Math.min(130, (avail / n) * 0.82);
  const startOf = (i: number) => axisDur + 8 + i * (drawDur + 14);
  const xAt = (i: number, len: number) => px0 + (i / Math.max(1, len - 1)) * (px1 - px0);
  const yAt = (v: number) => py0 - (Math.min(v, s.yMax * 1.05) / s.yMax) * (py0 - py1);
  const stampAt = startOf(n) + 4;
  const stampIn = spring({ frame: frame - stampAt, fps, config: { damping: 9, mass: 0.7 } });
  return (
    <>
      <Title text={s.title} />
      <RoughDraw
        shape={{ kind: "line", points: [[px0, py1 - 30], [px0, py0], [px1 + 20, py0]] }}
        from={0}
        dur={axisDur}
        stroke={pal.ink}
        strokeWidth={5}
        seed={11}
      />
      {s.xTicks.map((t, i) => (
        <HandText
          key={i}
          x={px0 + (i / Math.max(1, s.xTicks.length - 1)) * (px1 - px0)}
          y={py0 + 62}
          from={8 + i * 3}
          dur={10}
          size={44}
          color={pal.inkMuted}
          anchor={i === s.xTicks.length - 1 && s.xTicks.length > 1 ? "end" : i === 0 ? "start" : "middle"}
        >
          {t}
        </HandText>
      ))}
      {s.series.map((ser, si) => {
        const from = startOf(si);
        const pts = ser.points.map((v, i): [number, number] => [xAt(i, ser.points.length), yAt(v)]);
        const opacity = ser.fadeLater
          ? interpolate(frame, [startOf(si + 1) - 4, startOf(si + 1) + 18], [1, 0.22], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            })
          : 1;
        return (
          <SeriesLine key={si} pts={pts} values={ser.points} from={from} dur={drawDur} color={colorOf(ser.color)} smooth={ser.smooth} tip={ser.tip} label={ser.label} opacity={opacity} seed={seedOf(`ser${si}`)} rightEdge={px1} />
        );
      })}
      {s.stamp && frame >= stampAt ? (
        <g
          transform={`translate(${CX} ${(py0 + py1) / 2 - 60}) rotate(-8) scale(${interpolate(stampIn, [0, 1], [1.8, 1])})`}
          opacity={Math.min(1, stampIn * 1.4)}
        >
          <RoughDraw shape={{ kind: "rect", x: -230, y: -95, w: 460, h: 170 }} from={stampAt} dur={1} stroke={pal.accentRed} strokeWidth={9} seed={17} roughness={2} />
          <text x={0} y={42} textAnchor="middle" fontFamily={NUM_FONT} fontWeight={800} fontSize={120} fill={pal.accentRed}>
            {s.stamp}
          </text>
        </g>
      ) : null}
    </>
  );
};

const SeriesLine: React.FC<{
  pts: Array<[number, number]>;
  values: number[];
  from: number;
  dur: number;
  color: string;
  smooth?: boolean;
  tip?: "trieu" | "percent";
  label?: string;
  opacity: number;
  seed: number;
  rightEdge: number;
}> = ({ pts, values, from, dur, color, smooth, tip, label, opacity, seed, rightEdge }) => {
  const p = useProgress(from, dur);
  const fi = p * (values.length - 1);
  const i0 = Math.floor(fi);
  const i1 = Math.min(values.length - 1, i0 + 1);
  const v = values[i0] + (values[i1] - values[i0]) * (fi - i0);
  const tx = pts[i0][0] + (pts[i1][0] - pts[i0][0]) * (fi - i0);
  const ty = pts[i0][1] + (pts[i1][1] - pts[i0][1]) * (fi - i0);
  const last = pts[pts.length - 1];
  return (
    <g opacity={opacity}>
      <RoughDraw shape={{ kind: smooth ? "curve" : "line", points: pts }} from={from} dur={dur} stroke={color} strokeWidth={9} seed={seed} roughness={1} pen />
      {tip && p > 0.02 && p < 1 ? (
        <text x={Math.min(tx - 40, rightEdge - 280)} y={ty - 44} textAnchor="end" fontFamily={NUM_FONT} fontWeight={700} fontSize={52} fill={color}>
          {tip === "trieu" ? fmtTrieu(v) : `${Math.round(v)}%`}
        </text>
      ) : null}
      {label ? (
        <HandText x={Math.min(last[0], rightEdge)} y={last[1] - 34} from={from + dur - 4} dur={18} size={50} color={color} anchor="end">
          {label}
        </HandText>
      ) : null}
    </g>
  );
};

// ───────────────────────── bars ─────────────────────────
const Bars: React.FC<{ s: Extract<VizScene, { type: "bars" }>; dur: number }> = ({ s, dur }) => {
  const n = s.bars.length;
  const base = BOX.y1 - 150;
  const topY = BOX.y0 + (s.title ? 230 : 120);
  const slot = (BW - 40) / n;
  const bw = Math.min(190, slot - 70);
  const stag = Math.max(20, Math.min(70, (dur - 40) / n));
  return (
    <>
      <Title text={s.title} />
      {s.note ? (
        <HandText x={CX} y={BOX.y0 + 130} from={10} dur={16} size={46} color={pal.inkMuted} anchor="middle">
          {s.note}
        </HandText>
      ) : null}
      <RoughDraw shape={{ kind: "line", points: [[BOX.x0 + 10, base], [BOX.x1 - 10, base]] }} from={0} dur={14} stroke={pal.ink} strokeWidth={5} seed={41} />
      {s.bars.map((b, i) => {
        const cx = BOX.x0 + 20 + slot * (i + 0.5);
        const over = b.value > s.yMax;
        const h = (Math.min(b.value, s.yMax) / s.yMax) * (base - topY);
        const t = 16 + i * stag;
        const color = colorOf(b.color);
        return (
          <g key={i}>
            <GrowBar x={cx - bw / 2} base={base} w={bw} h={Math.max(6, h)} from={t} dur={over ? 30 : 20} color={color} seed={seedOf(`bar${i}`)} />
            {over ? (
              <>
                <RoughDraw
                  shape={{ kind: "line", points: [[cx - bw / 2 - 14, topY + 40], [cx - bw / 4, topY + 20], [cx + bw / 4, topY + 50], [cx + bw / 2 + 14, topY + 30]] }}
                  from={t + 30}
                  dur={8}
                  stroke={pal.bg}
                  strokeWidth={22}
                  seed={seedOf(`brk${i}`)}
                />
                <Arrow a={[cx, topY + 10]} b={[cx, topY - 70]} from={t + 34} dur={8} color={color} seed={seedOf(`up${i}`)} />
              </>
            ) : null}
            <HandText
              x={cx}
              y={over ? topY - 92 : base - h - 24}
              from={t + (over ? 38 : 18)}
              dur={12}
              size={over ? 64 : 54}
              font={NUM_FONT}
              weight={800}
              color={color}
              anchor="middle"
            >
              {b.display}
            </HandText>
            {wrapLines(b.label, slot - 10, 44).map((line, li) => (
              <HandText key={li} x={cx} y={base + 58 + li * 48} from={t + 4} dur={12} size={44} color={pal.ink} anchor="middle">
                {line}
              </HandText>
            ))}
          </g>
        );
      })}
    </>
  );
};

const GrowBar: React.FC<{ x: number; base: number; w: number; h: number; from: number; dur: number; color: string; seed: number }> = ({
  x,
  base,
  w,
  h,
  from,
  dur,
  color,
  seed,
}) => {
  const p = useProgress(from, dur);
  if (p <= 0) return null;
  const hh = h * p;
  return (
    <g>
      <defs>
        <clipPath id={`gb${seed}`}>
          <rect x={x - 20} y={base - hh - 10} width={w + 40} height={hh + 20} />
        </clipPath>
      </defs>
      <g clipPath={`url(#gb${seed})`}>
        <RoughDraw shape={{ kind: "rect", x, y: base - h, w, h }} from={from - 1} dur={1} stroke={color} strokeWidth={5} seed={seed} fill={color} fillStyle="hachure" roughness={1.2} />
      </g>
    </g>
  );
};

// ───────────────────────── flow ─────────────────────────
const Flow: React.FC<{ s: Extract<VizScene, { type: "flow" }>; dur: number }> = ({ s, dur }) => {
  const nodeH = 140;
  const top = BOX.y0 + (s.title ? 120 : 30);
  const pos = (n: { x: number; y: number }): [number, number] => [BOX.x0 + 40 + n.x * (BW - 80), top + n.y * (BOX.y1 - top - 40)];
  // Khối co lại khi nhiều khối chung 1 hàng (vd 3 ngăn kéo) để không chồng nhau.
  const pts = s.nodes.map(pos);
  const rowGaps = pts.flatMap((a, i) =>
    pts.slice(i + 1).flatMap((b) => (Math.abs(a[1] - b[1]) < nodeH ? [Math.abs(a[0] - b[0])] : [])),
  );
  const nodeW = Math.max(200, Math.min(330, ...rowGaps.map((g) => g - 30)));
  const nStag = Math.max(14, Math.min(36, (dur * 0.35) / s.nodes.length));
  const edgeStart = 12 + s.nodes.length * nStag;
  const eStag = Math.max(18, Math.min(60, (dur - edgeStart - 30) / Math.max(1, s.edges.length)));
  const byId = new Map(s.nodes.map((n) => [n.id, n]));
  // Cắt mũi tên ở mép khối (xấp xỉ hình chữ nhật).
  const edgePt = (c: [number, number], toward: [number, number]): [number, number] => {
    const dx = toward[0] - c[0];
    const dy = toward[1] - c[1];
    const k = Math.min((nodeW / 2 + 14) / Math.max(1e-6, Math.abs(dx)), (nodeH / 2 + 14) / Math.max(1e-6, Math.abs(dy)));
    return [c[0] + dx * k, c[1] + dy * k];
  };
  return (
    <>
      <Title text={s.title} />
      {s.nodes.map((n, i) => {
        const [x, y] = pos(n);
        const t = 12 + i * nStag;
        const color = colorOf(n.color);
        const lines = wrapLines(n.label, nodeW - 30, nodeW < 300 ? 46 : 52);
        return (
          <g key={n.id}>
            <RoughDraw shape={{ kind: "rect", x: x - nodeW / 2, y: y - nodeH / 2, w: nodeW, h: nodeH }} from={t} dur={14} stroke={color} strokeWidth={5} seed={seedOf(`n${n.id}`)} roughness={1.4} />
            {lines.map((line, li) => (
              <HandText key={li} x={x} y={y + 18 + (li - (lines.length - 1) / 2) * 54} from={t + 6} dur={12} size={nodeW < 300 ? 46 : 52} color={color} anchor="middle">
                {line}
              </HandText>
            ))}
          </g>
        );
      })}
      {s.edges.map((e, i) => {
        const a = byId.get(e.from);
        const b = byId.get(e.to);
        if (!a || !b) return null;
        const ca = pos(a);
        const cb = pos(b);
        const pa = edgePt(ca, cb);
        const pb = edgePt(cb, ca);
        const t = edgeStart + i * eStag;
        const color = colorOf(e.color, pal.inkMuted);
        const mx = (pa[0] + pb[0]) / 2;
        const my = (pa[1] + pb[1]) / 2;
        const vertical = Math.abs(pb[1] - pa[1]) > Math.abs(pb[0] - pa[0]);
        return (
          <g key={i}>
            <Arrow a={pa} b={pb} from={t} dur={16} color={color} seed={seedOf(`e${i}`)} />
            {e.label ? (
              <HandText x={vertical ? mx + 28 : mx} y={vertical ? my + 14 : my - 26} from={t + 12} dur={14} size={46} color={color} anchor={vertical ? "start" : "middle"}>
                {e.label}
              </HandText>
            ) : null}
          </g>
        );
      })}
    </>
  );
};

// ───────────────────────── bigNumber ─────────────────────────
const fmtNum = (v: number, decimals = 0) =>
  v.toLocaleString("vi-VN", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

const BigNumber: React.FC<{ s: Extract<VizScene, { type: "bigNumber" }>; dur: number }> = ({ s, dur }) => {
  const n = s.items.length;
  const stag = Math.min(50, dur / (n + 1));
  const centers = n === 1 ? [BOX.y0 + BH * 0.42] : [BOX.y0 + BH * 0.25, BOX.y0 + BH * 0.62];
  return (
    <>
      {s.items.map((it, i) => (
        <BigItem key={i} it={it} y={centers[i] ?? centers[0]} from={6 + i * stag} circle={s.circle && i === 0} />
      ))}
      {s.sub ? (
        <HandText x={CX} y={BOX.y1 - 40} from={6 + n * stag} dur={18} size={52} color={pal.inkMuted} anchor="middle">
          {s.sub}
        </HandText>
      ) : null}
    </>
  );
};

const BigItem: React.FC<{ it: Extract<VizScene, { type: "bigNumber" }>["items"][number]; y: number; from: number; circle?: boolean }> = ({
  it,
  y,
  from,
  circle,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const v = useCount(from, 34, 0, it.value);
  const pop = spring({ frame: frame - from, fps, config: { damping: 14 } });
  const color = colorOf(it.color);
  const text = `${it.prefix ?? ""}${fmtNum(v, it.decimals)}${it.suffix ?? ""}`;
  const size = text.length > 9 ? 150 : text.length > 6 ? 170 : 200;
  // Vòng khoanh giãn theo bề rộng số (Be Vietnam Pro 800 ~0.62em/ký tự) — "30 triệu" dài hơn "30%".
  const ringW = Math.min(BW + 60, Math.max(BW * 0.6, text.length * size * 0.62 + 140));
  return (
    <g>
      {frame >= from ? (
        <text
          x={CX}
          y={y}
          textAnchor="middle"
          fontFamily={NUM_FONT}
          fontWeight={800}
          fontSize={size}
          fill={color}
          style={{ transform: `scale(${0.6 + 0.4 * pop})`, transformOrigin: `${CX}px ${y - size / 3}px` }}
        >
          {text}
        </text>
      ) : null}
      {wrapLines(it.label, BW - 60, 62).map((line, li) => (
        <HandText key={li} x={CX} y={y + 100 + li * 66} from={from + 22} dur={16} size={62} color={pal.ink} anchor="middle">
          {line}
        </HandText>
      ))}
      {circle ? (
        <RoughDraw shape={{ kind: "ellipse", cx: CX, cy: y - size * 0.05, w: ringW, h: size * 2.3 }} from={from + 40} dur={30} stroke={pal.accentRed} strokeWidth={7} seed={3} roughness={1.6} pen />
      ) : null}
    </g>
  );
};

// ───────────────────────── rule ─────────────────────────
const Rule: React.FC<{ s: Extract<VizScene, { type: "rule" }>; dur: number }> = ({ s }) => {
  const size = s.text.length > 70 ? 66 : 78;
  const lines = wrapLines(s.text, BW - 120, size);
  const lh = size * 1.18;
  const blockH = lines.length * lh;
  const midY = BOX.y0 + BH * 0.45;
  const y0 = midY - blockH / 2;
  const color = colorOf(s.color);
  const perLine = 16;
  return (
    <>
      {s.title ? (
        <HandText x={CX} y={y0 - 110} from={0} dur={16} size={56} color={pal.inkMuted} anchor="middle">
          {s.title}
        </HandText>
      ) : null}
      <RoughDraw shape={{ kind: "rect", x: BOX.x0 + 20, y: y0 - 60, w: BW - 40, h: blockH + 100 }} from={4} dur={22} stroke={color} strokeWidth={6} seed={seedOf(s.text)} roughness={1.6} />
      {lines.map((line, i) => (
        <HandText key={i} x={CX} y={y0 + (i + 0.8) * lh} from={14 + i * perLine} dur={perLine + 4} size={size} color={pal.ink} anchor="middle">
          {line}
        </HandText>
      ))}
      {s.sub ? (
        <HandText x={CX} y={y0 + blockH + 120} from={18 + lines.length * perLine} dur={18} size={50} color={pal.inkMuted} anchor="middle">
          {s.sub}
        </HandText>
      ) : null}
    </>
  );
};

// ───────────────────────── checklist ─────────────────────────
const Checklist: React.FC<{ s: Extract<VizScene, { type: "checklist" }>; dur: number }> = ({ s, dur }) => {
  const n = s.items.length;
  const size = 62;
  const rows = s.items.map((it) => wrapLines(it, BW - 190, size));
  const rowH = rows.map((r) => Math.max(150, r.length * 70 + 76));
  const total = rowH.reduce((a, b) => a + b, 0);
  let y = BOX.y0 + 150 + Math.max(0, (BH - 150 - total) / 2 - 40);
  const stag = Math.max(24, Math.min(90, (dur - 30) / n));
  return (
    <>
      <HandText x={CX} y={BOX.y0 + 70} from={0} dur={18} size={64} color={pal.ink} anchor="middle">
        {s.title}
      </HandText>
      <RoughDraw shape={{ kind: "line", points: [[CX - 260, BOX.y0 + 96], [CX + 260, BOX.y0 + 92]] }} from={14} dur={12} stroke={pal.accentRed} strokeWidth={6} seed={77} />
      {s.items.map((_, i) => {
        const rowY = y;
        y += rowH[i];
        const t = 20 + i * stag;
        const boxX = BOX.x0 + 30;
        const cy = rowY + 40;
        return (
          <g key={i}>
            {s.mark === "check" ? (
              <RoughDraw shape={{ kind: "rect", x: boxX, y: cy - 34, w: 68, h: 68 }} from={t} dur={10} stroke={pal.ink} strokeWidth={5} seed={seedOf(`cb${i}`)} />
            ) : null}
            <Mark kind={s.mark === "check" ? "ok" : "flag"} x={boxX + 34} y={cy} from={t + (s.mark === "check" ? 10 : 0)} />
            {rows[i].map((line, li) => (
              <HandText key={li} x={boxX + 110} y={cy + 22 + li * 70} from={t + 6 + li * 8} dur={16} size={size} color={pal.ink}>
                {line}
              </HandText>
            ))}
          </g>
        );
      })}
    </>
  );
};

export const VizSceneView: React.FC<{ scene: VizScene; dur: number }> = ({ scene, dur }) => {
  switch (scene.type) {
    case "steps":
      return <Steps s={scene} dur={dur} />;
    case "lineChart":
      return <LineChart s={scene} dur={dur} />;
    case "bars":
      return <Bars s={scene} dur={dur} />;
    case "flow":
      return <Flow s={scene} dur={dur} />;
    case "bigNumber":
      return <BigNumber s={scene} dur={dur} />;
    case "rule":
      return <Rule s={scene} dur={dur} />;
    case "checklist":
      return <Checklist s={scene} dur={dur} />;
  }
};

export { HAND_FONT };
