/**
 * Lớp cảnh phân tích vẽ tay: nền bảng trắng cố định + từng cảnh (tmp/<slug>.viz.json)
 * hiện theo mốc giọng đọc. Thay nền/sticker/sóng của khuôn podcast khi tập có viz.
 * Đặt trong <Sequence from={mainStartFrame}> → frame 0 = lúc giọng bắt đầu.
 */
import React, { useEffect, useState } from "react";
import { AbsoluteFill, Sequence, continueRender, delayRender, interpolate, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { SERIES } from "../series";
import { PaperBoard } from "./primitives";
import { VizSceneView } from "./scenes";
import type { VizFile, VizScene } from "./types";

const pal = SERIES["tien-tam-ly"].palette!;
const FADE_IN = 8;
const FADE_OUT = 10;

export const useVizFile = (src: string | null): VizFile | null => {
  const [data, setData] = useState<VizFile | null>(null);
  const [handle] = useState(() => (src ? delayRender(`viz ${src}`) : null));
  useEffect(() => {
    if (!src || handle === null) return;
    fetch(staticFile(src))
      .then((r) => r.json())
      .then((j: VizFile) => setData(j))
      .catch((e) => console.error("[VizLayer] không đọc được", src, e))
      .finally(() => continueRender(handle));
  }, [src, handle]);
  return data;
};

const Beat: React.FC<{ scene: VizScene; dur: number }> = ({ scene, dur }) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, FADE_IN, dur - FADE_OUT, dur], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return (
    <AbsoluteFill style={{ opacity }}>
      <svg width={1080} height={1920} viewBox="0 0 1080 1920" style={{ position: "absolute", inset: 0 }}>
        <VizSceneView scene={scene} dur={dur} />
      </svg>
    </AbsoluteFill>
  );
};

export const VizLayer: React.FC<{ vizSrc: string }> = ({ vizSrc }) => {
  const { fps, width, height } = useVideoConfig();
  const viz = useVizFile(vizSrc);
  return (
    <AbsoluteFill>
      <PaperBoard width={width} height={height} bg={pal.bg} grid={pal.gridLine} />
      {viz?.beats.map((b, i) => {
        const from = Math.round((b.startMs / 1000) * fps);
        const dur = Math.max(FADE_IN + FADE_OUT + 1, Math.round(((b.endMs - b.startMs) / 1000) * fps));
        return (
          <Sequence key={i} from={from} durationInFrames={dur} layout="none">
            <Beat scene={b.scene} dur={dur} />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
