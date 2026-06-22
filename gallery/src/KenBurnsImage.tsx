/**
 * KenBurnsImage — Phase 4d.
 *
 * Render 1 ảnh tĩnh với hiệu ứng Ken Burns (pan/zoom) trong N frames.
 * Mode mapping với VisualBeat.kenBurns enum:
 *   zoom-in / zoom-out / pan-left / pan-right / pan-up / pan-down / static
 *
 * Blur-letterbox: ảnh chính fit "contain" (hiện TRỌN VẸN, không crop) đè lên
 * 1 bản blur phủ đầy 16:9 làm nền. Ảnh ~16:9 vẫn lấp gần hết khung; ảnh lệch
 * tỉ lệ (chân dung 2:3, ảnh vuông) không bị "cover" cắt mất mép — thay vào đó
 * có viền blur mềm hai bên đúng kiểu phim tài liệu. Ken Burns áp lên ảnh chính.
 */
import React from "react";
import { AbsoluteFill, Img, interpolate, useCurrentFrame } from "remotion";

export type KenBurnsMode =
  | "zoom-in"
  | "zoom-out"
  | "pan-left"
  | "pan-right"
  | "pan-up"
  | "pan-down"
  | "static";

/**
 * Mỗi mode = {scale start/end, translateX %, translateY %}.
 * % relative tới image dimensions (overflow hidden ở AbsoluteFill parent).
 * Giá trị nhỏ thôi — Khan Academy/Smarthistory tempo chậm.
 */
const RANGES: Record<
  KenBurnsMode,
  {
    scaleStart: number;
    scaleEnd: number;
    xStart: number;
    xEnd: number;
    yStart: number;
    yEnd: number;
  }
> = {
  "zoom-in": {
    scaleStart: 1.0,
    scaleEnd: 1.1,
    xStart: 0,
    xEnd: 0,
    yStart: 0,
    yEnd: 0,
  },
  "zoom-out": {
    scaleStart: 1.1,
    scaleEnd: 1.0,
    xStart: 0,
    xEnd: 0,
    yStart: 0,
    yEnd: 0,
  },
  "pan-left": {
    scaleStart: 1.08,
    scaleEnd: 1.08,
    xStart: 4,
    xEnd: -4,
    yStart: 0,
    yEnd: 0,
  },
  "pan-right": {
    scaleStart: 1.08,
    scaleEnd: 1.08,
    xStart: -4,
    xEnd: 4,
    yStart: 0,
    yEnd: 0,
  },
  "pan-up": {
    scaleStart: 1.08,
    scaleEnd: 1.08,
    xStart: 0,
    xEnd: 0,
    yStart: 4,
    yEnd: -4,
  },
  "pan-down": {
    scaleStart: 1.08,
    scaleEnd: 1.08,
    xStart: 0,
    xEnd: 0,
    yStart: -4,
    yEnd: 4,
  },
  static: {
    scaleStart: 1.0,
    scaleEnd: 1.0,
    xStart: 0,
    xEnd: 0,
    yStart: 0,
    yEnd: 0,
  },
};

export const KenBurnsImage: React.FC<{
  src: string;
  mode: KenBurnsMode;
  durationFrames: number;
}> = ({ src, mode, durationFrames }) => {
  const frame = useCurrentFrame();
  const r = RANGES[mode];

  const scale = interpolate(
    frame,
    [0, durationFrames],
    [r.scaleStart, r.scaleEnd],
    { extrapolateRight: "clamp" },
  );
  const x = interpolate(frame, [0, durationFrames], [r.xStart, r.xEnd], {
    extrapolateRight: "clamp",
  });
  const y = interpolate(frame, [0, durationFrames], [r.yStart, r.yEnd], {
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ overflow: "hidden", backgroundColor: "#000" }}>
      {/* Nền blur phủ đầy khung — lấp khoảng trống của ảnh lệch tỉ lệ.
          scale 1.15 + blur để mép blur không hở viền; brightness hạ để
          nền không hút mắt khỏi ảnh chính. */}
      <Img
        src={src}
        style={{
          position: "absolute",
          width: "100%",
          height: "100%",
          objectFit: "cover",
          transform: "scale(1.15)",
          filter: "blur(28px) brightness(0.5)",
          transformOrigin: "center center",
        }}
      />
      {/* Ảnh chính — contain để hiện trọn vẹn, Ken Burns pan/zoom áp ở đây. */}
      <Img
        src={src}
        style={{
          position: "absolute",
          width: "100%",
          height: "100%",
          objectFit: "contain",
          transform: `translate(${x}%, ${y}%) scale(${scale})`,
          transformOrigin: "center center",
        }}
      />
    </AbsoluteFill>
  );
};
