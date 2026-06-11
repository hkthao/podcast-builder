import { useMemo } from "react";
import { AbsoluteFill, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { useAudioData, visualizeAudio } from "@remotion/media-utils";
import { COLORS, FORMAT, MOOD_ACCENTS, type MoodKey, withAlpha } from "../theme";

const NUM_BANDS = 32;
const SMOOTH_WINDOW = 3;

type Props = {
  audioSrc: string;
  mood?: MoodKey;
};

export const Visualizer: React.FC<Props> = ({ audioSrc, mood = "social" }) => {
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
    const half: number[] = new Array(NUM_BANDS).fill(0);
    for (const bands of frames) {
      for (let i = 0; i < NUM_BANDS; i++) {
        half[i] += bands[i] ?? 0;
      }
    }
    return half.map((v) => v / frames.length);
  }, [audioData, frame, fps]);

  if (!smoothed) return null;

  const accent = MOOD_ACCENTS[mood];
  const barWidth = (FORMAT.width - 240) / (NUM_BANDS * 2 - 1);
  const gap = barWidth * 0.35;
  const centerY = FORMAT.height / 2;
  const maxHeight = 280;

  const bars = [];
  for (let i = 0; i < NUM_BANDS; i++) {
    const v = smoothed[i] ?? 0;
    const h = Math.max(6, Math.pow(v, 0.7) * maxHeight);
    const xRight = FORMAT.width / 2 + i * (barWidth + gap);
    const xLeft = FORMAT.width / 2 - (i + 1) * (barWidth + gap);
    bars.push(
      <rect
        key={`r${i}`}
        x={xRight}
        y={centerY - h / 2}
        width={barWidth}
        height={h}
        rx={barWidth / 2}
        fill={COLORS.signature}
        opacity={0.85 - i * 0.005}
      />,
      <rect
        key={`l${i}`}
        x={xLeft}
        y={centerY - h / 2}
        width={barWidth}
        height={h}
        rx={barWidth / 2}
        fill={COLORS.signature}
        opacity={0.85 - i * 0.005}
      />,
    );
  }

  return (
    <AbsoluteFill>
      <svg
        width={FORMAT.width}
        height={FORMAT.height}
        viewBox={`0 0 ${FORMAT.width} ${FORMAT.height}`}
        style={{ position: "absolute", inset: 0 }}
      >
        <defs>
          <radialGradient id="vizGlow" cx="50%" cy="50%" r="40%">
            <stop offset="0%" stopColor={withAlpha(accent, 0.35)} />
            <stop offset="100%" stopColor={withAlpha(accent, 0)} />
          </radialGradient>
        </defs>
        <ellipse
          cx={FORMAT.width / 2}
          cy={centerY}
          rx={FORMAT.width * 0.45}
          ry={maxHeight * 0.9}
          fill="url(#vizGlow)"
        />
        {bars}
      </svg>
    </AbsoluteFill>
  );
};
