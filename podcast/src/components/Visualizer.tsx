import { useMemo } from "react";
import { AbsoluteFill, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { useAudioData, visualizeAudio } from "@remotion/media-utils";
import { COLORS, FORMAT, MOOD_ACCENTS, type MoodKey } from "../theme";
import type { Scene } from "../scenes";
import { currentSceneIndex, sceneVariant } from "./scene-runtime";

const NUM_BANDS = 64;
const SMOOTH_WINDOW = 2;
const MIN_HEIGHT = 12;
const HEIGHT_POW = 0.5;

/** Biến thể hình sóng theo scene → wave không cố định cả video. */
const VIS_VARIANTS = [
  { barWidth: 4, barGap: 2, maxHeight: 220, centerYRatio: 0.69 },
  { barWidth: 5, barGap: 2, maxHeight: 200, centerYRatio: 0.66 },
  { barWidth: 3, barGap: 3, maxHeight: 240, centerYRatio: 0.71 },
  { barWidth: 4, barGap: 3, maxHeight: 210, centerYRatio: 0.67 },
] as const;

type Props = {
  audioSrc: string;
  mood?: MoodKey;
  scenes?: Scene[];
};

export const Visualizer: React.FC<Props> = ({ audioSrc, mood = "positive", scenes }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const audioData = useAudioData(staticFile(audioSrc));

  const smoothed = useMemo(() => {
    if (!audioData) return null;
    const frames: number[][] = [];
    for (let i = -SMOOTH_WINDOW; i <= SMOOTH_WINDOW; i++) {
      const f = Math.max(0, frame + i);
      frames.push(
        visualizeAudio({
          audioData,
          frame: f,
          fps,
          numberOfSamples: NUM_BANDS,
        }),
      );
    }
    const result: number[] = new Array(NUM_BANDS).fill(0);
    for (const bands of frames) {
      for (let i = 0; i < NUM_BANDS; i++) {
        result[i] += bands[i] ?? 0;
      }
    }
    return result.map((v) => v / frames.length);
  }, [audioData, frame, fps]);

  if (!smoothed) return null;

  // Mood + variant theo scene đang active.
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
  const vis = VIS_VARIANTS[variant];
  const BAR_WIDTH = vis.barWidth;
  const BAR_GAP = vis.barGap;
  const MAX_HEIGHT = vis.maxHeight;

  const accent = MOOD_ACCENTS[activeMood];
  // Bars mirror đối xứng quanh trung tâm. Tổng 2*NUM_BANDS bars.
  const totalBars = NUM_BANDS * 2;
  const totalWidth = totalBars * BAR_WIDTH + (totalBars - 1) * BAR_GAP;
  const leftX = (FORMAT.width - totalWidth) / 2;
  const centerY = FORMAT.height * vis.centerYRatio;
  const gradientId = `wave-grad-${activeMood}-${variant}`;

  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <svg
        width={FORMAT.width}
        height={FORMAT.height}
        viewBox={`0 0 ${FORMAT.width} ${FORMAT.height}`}
        style={{ position: "absolute", inset: 0 }}
      >
        <defs>
          {/*
            Gradient ngang: navy ngoài → accent (coral) ở giữa → navy về phải.
            Tạo cảm giác "energy peak" tự nhiên ở center, không hard cut.
          */}
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor={COLORS.ink} />
            <stop offset="35%" stopColor={COLORS.ink} />
            <stop offset="48%" stopColor={accent} />
            <stop offset="52%" stopColor={accent} />
            <stop offset="65%" stopColor={COLORS.ink} />
            <stop offset="100%" stopColor={COLORS.ink} />
          </linearGradient>
        </defs>
        {/*
          Render 2*NUM_BANDS bars mirror, mỗi bar height từ frequency band.
          Bar đối xứng: i<NUM_BANDS dùng band (NUM_BANDS-1-i), i>=NUM_BANDS dùng band (i-NUM_BANDS).
          → 2 mép bằng cao tần (band cuối), giữa bằng bass (band 0).
        */}
        {Array.from({ length: totalBars }).map((_, i) => {
          const bandIdx =
            i < NUM_BANDS ? NUM_BANDS - 1 - i : i - NUM_BANDS;
          const v = smoothed[bandIdx] ?? 0;
          const h = Math.max(MIN_HEIGHT, Math.pow(v, HEIGHT_POW) * MAX_HEIGHT);
          const x = leftX + i * (BAR_WIDTH + BAR_GAP);
          return (
            <rect
              key={i}
              x={x}
              y={centerY - h / 2}
              width={BAR_WIDTH}
              height={h}
              rx={BAR_WIDTH / 2}
              fill={`url(#${gradientId})`}
            />
          );
        })}
      </svg>
    </AbsoluteFill>
  );
};
