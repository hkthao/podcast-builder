/**
 * Cảnh thử bộ hình phân tích (15s): "Lãi 30%/tháng" — lời hứa trên giấy vs thực tế.
 * Chỉ để duyệt chất lượng hình; số liệu minh hoạ (lãi kép 1,3^12 ≈ 23,3 lần).
 */
import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { SERIES } from "../../series";
import { HAND_FONT, HandText, NUM_FONT, PaperBoard, RoughDraw, useCount, useProgress } from "../primitives";

const pal = SERIES["tien-tam-ly"].palette!;
const W = 1080;
const H = 1920;

// Trục biểu đồ: 12 tháng × 0..2.400 triệu.
const X0 = 170;
const X1 = 940;
const Y0 = 1460;
const Y1 = 760;
const VMAX = 2400;
const xOf = (m: number) => X0 + (m / 12) * (X1 - X0);
const yOf = (v: number) => Y0 - (v / VMAX) * (Y0 - Y1);
const promised = (m: number) => 100 * 1.3 ** m;
const bank = (m: number) => 100 * 1.05 ** (m / 12);

const money = (v: number) =>
  v < 1000 ? `${Math.round(v)} triệu` : `${(v / 1000).toFixed(1).replace(".", ",")} tỷ`;

const curvePts = (f: (m: number) => number, upTo = 12): Array<[number, number]> =>
  Array.from({ length: upTo * 2 + 1 }, (_, i) => i / 2).map((m) => [xOf(m), yOf(f(m))]);

const T = {
  promise: 0,
  big: 10,
  perMonth: 42,
  circle: 62,
  axes: 104,
  curve: 132,
  curveDur: 130,
  bank: 150,
  paper: 266,
  fade: 300,
  crash: 304,
  crashDur: 76,
  stamp: 386,
  moral: 408,
};

export const InterestTrap: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const pct = Math.round(useCount(T.big, 34, 0, 30));
  const bigIn = spring({ frame: frame - T.big, fps, config: { damping: 14 } });
  const curveP = useProgress(T.curve, T.curveDur);
  const tipM = curveP * 12;
  const greenOpacity = interpolate(frame, [T.fade, T.fade + 24], [1, 0.22], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const stampIn = spring({ frame: frame - T.stamp, fps, config: { damping: 9, mass: 0.7 } });
  const crashP = useProgress(T.crash, T.crashDur);

  return (
    <AbsoluteFill style={{ background: pal.bg }}>
      <PaperBoard width={W} height={H} bg={pal.bg} grid={pal.gridLine} />
      <svg width={W} height={H} style={{ position: "absolute", inset: 0 }}>
        {/* ── Lời hứa ── */}
        <HandText x={W / 2} y={250} from={T.promise} dur={20} size={64} color={pal.inkMuted} anchor="middle">
          Lời hứa của app đầu tư:
        </HandText>
        {frame >= T.big ? (
          <text
            x={W / 2}
            y={500}
            textAnchor="middle"
            fontFamily={NUM_FONT}
            fontWeight={800}
            fontSize={230}
            fill={pal.ink}
            style={{ transform: `scale(${0.6 + 0.4 * bigIn})`, transformOrigin: `${W / 2}px 420px` }}
          >
            {pct}%
          </text>
        ) : null}
        <HandText x={W / 2} y={600} from={T.perMonth} dur={18} size={78} color={pal.ink} anchor="middle">
          mỗi tháng
        </HandText>
        <RoughDraw
          shape={{ kind: "ellipse", cx: W / 2, cy: 470, w: 660, h: 430 }}
          from={T.circle}
          dur={34}
          stroke={pal.accentRed}
          strokeWidth={7}
          seed={3}
          roughness={1.6}
          pen
        />

        {/* ── Trục ── */}
        <RoughDraw
          shape={{ kind: "line", points: [[X0, Y1 - 40], [X0, Y0], [X1 + 30, Y0]] }}
          from={T.axes}
          dur={26}
          stroke={pal.ink}
          strokeWidth={5}
          seed={11}
        />
        {[0, 6, 12].map((m, i) => (
          <HandText
            key={m}
            x={xOf(m)}
            y={Y0 + 62}
            from={T.axes + 10 + i * 4}
            dur={10}
            size={46}
            color={pal.inkMuted}
            anchor="middle"
          >
            {m === 12 ? "12 tháng" : String(m)}
          </HandText>
        ))}

        {/* ── Đường ngân hàng (gần như phẳng) ── */}
        <RoughDraw
          shape={{ kind: "curve", points: curvePts(bank) }}
          from={T.bank}
          dur={60}
          stroke={pal.accentBlue}
          strokeWidth={7}
          seed={21}
          roughness={0.9}
        />
        <HandText x={X1 + 10} y={yOf(bank(12)) - 84} from={T.bank + 50} dur={14} size={46} color={pal.accentBlue} anchor="end">
          Gửi ngân hàng
        </HandText>
        <HandText x={X1 + 10} y={yOf(bank(12)) - 30} from={T.bank + 60} dur={14} size={46} color={pal.accentBlue} anchor="end">
          ≈ 5%/năm
        </HandText>

        {/* ── Đường lời hứa (lãi kép 30%/tháng) ── */}
        <g opacity={greenOpacity}>
          <RoughDraw
            shape={{ kind: "curve", points: curvePts(promised) }}
            from={T.curve}
            dur={T.curveDur}
            stroke={pal.accentTeal}
            strokeWidth={9}
            seed={5}
            roughness={1}
            pen
          />
          {curveP > 0.02 && curveP < 1 ? (
            <text
              x={Math.min(xOf(tipM) - 40, X1 - 260)}
              y={yOf(promised(tipM)) - 40}
              textAnchor="end"
              fontFamily={NUM_FONT}
              fontWeight={700}
              fontSize={52}
              fill={pal.accentTeal}
            >
              {money(promised(tipM))}
            </text>
          ) : null}
          <HandText x={X1 - 70} y={Y1 + 50} from={T.paper - 10} dur={22} size={60} color={pal.accentTeal} anchor="end">
            Trên giấy: 100 triệu → 2,3 tỷ
          </HandText>
        </g>

        {/* ── Thực tế: sập ở tháng 4 ── */}
        <RoughDraw
          shape={{
            kind: "line",
            points: [...curvePts(promised, 8), [xOf(8.4), yOf(promised(8) * 0.45)], [xOf(8.7), yOf(0) - 4], [xOf(12), yOf(0) - 4]],
          }}
          from={T.crash}
          dur={T.crashDur}
          stroke={pal.accentRed}
          strokeWidth={10}
          seed={9}
          roughness={1.3}
          pen
        />
        {crashP > 0.55 ? (
          <HandText x={xOf(8) - 30} y={yOf(promised(8)) - 40} from={T.crash + 40} dur={18} size={54} color={pal.accentRed} anchor="end">
            Tháng 8: app sập
          </HandText>
        ) : null}

        {/* ── Con dấu −100% ── */}
        {frame >= T.stamp ? (
          <g
            transform={`translate(${xOf(5)} ${Y0 - 470}) rotate(-8) scale(${interpolate(stampIn, [0, 1], [1.8, 1])})`}
            opacity={Math.min(1, stampIn * 1.4)}
          >
            <RoughDraw
              shape={{ kind: "rect", x: -230, y: -95, w: 460, h: 170 }}
              from={T.stamp}
              dur={1}
              stroke={pal.accentRed}
              strokeWidth={9}
              seed={17}
              roughness={2}
            />
            <text x={0} y={42} textAnchor="middle" fontFamily={NUM_FONT} fontWeight={800} fontSize={120} fill={pal.accentRed}>
              −100%
            </text>
          </g>
        ) : null}

        {/* ── Đúc kết ── */}
        <HandText x={W / 2} y={1700} from={T.moral} dur={28} size={66} color={pal.ink} anchor="middle" font={HAND_FONT}>
          Lãi càng cao, vốn càng gần số 0.
        </HandText>
        <RoughDraw
          shape={{ kind: "line", points: [[230, 1730], [850, 1726]] }}
          from={T.moral + 24}
          dur={14}
          stroke={pal.accentRed}
          strokeWidth={6}
          seed={31}
        />
      </svg>
    </AbsoluteFill>
  );
};
