import { useMemo } from "react";
import { AbsoluteFill, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { useAudioData, visualizeAudio } from "@remotion/media-utils";
import { COLORS, FORMAT, MOOD_ACCENTS, type MoodKey } from "../theme";

const NUM_BANDS = 64;
const SMOOTH_WINDOW = 2;
const MAX_HEIGHT = 220;
const MIN_HEIGHT = 12;
const HEIGHT_POW = 0.5;
/** Bar thinner để toàn wave fit trong SAFE_ZONE (avoid right action buttons FB Reels). */
const BAR_WIDTH = 4;
const BAR_GAP = 2;

type Props = {
  audioSrc: string;
  mood?: MoodKey;
};

export const Visualizer: React.FC<Props> = ({ audioSrc, mood = "positive" }) => {
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

  const accent = MOOD_ACCENTS[mood];
  // Bars mirror đối xứng quanh trung tâm. Tổng 2*NUM_BANDS bars.
  const totalBars = NUM_BANDS * 2;
  const totalWidth = totalBars * BAR_WIDTH + (totalBars - 1) * BAR_GAP;
  const leftX = (FORMAT.width - totalWidth) / 2;
  // centerY 0.67 — wave bottom edge ~1396 nằm sát caption top edge (~1410) → gap ~14px.
  const centerY = FORMAT.height * 0.67;
  const gradientId = `wave-grad-${mood}`;

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
