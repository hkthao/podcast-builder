import { useEffect, useMemo, useRef, useState } from "react";
import {
  AbsoluteFill,
  cancelRender,
  continueRender,
  delayRender,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { applyMoodOverrides, splitScenes, type Scene } from "../scenes";
import {
  COLORS,
  FORMAT,
  MOOD_ACCENTS,
  type MoodKey,
  withAlpha,
} from "../theme";
import type { Transcript } from "../../scripts/transcribe";
import type { EpisodeConfig } from "../episode";

type Props = {
  transcriptSrc: string | null;
  episode: EpisodeConfig;
};

const CROSSFADE_MS = 1000;

export const SceneArt: React.FC<Props> = ({ transcriptSrc, episode }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const [transcript, setTranscript] = useState<Transcript | null>(null);
  const handleRef = useRef<number | null>(null);

  useEffect(() => {
    if (!transcriptSrc) return;
    handleRef.current = delayRender(`scene-art:${transcriptSrc}`);
    fetch(staticFile(transcriptSrc))
      .then((r) => {
        if (!r.ok) throw new Error(`fetch ${transcriptSrc} ${r.status}`);
        return r.json() as Promise<Transcript>;
      })
      .then((t) => {
        setTranscript(t);
        if (handleRef.current !== null) continueRender(handleRef.current);
      })
      .catch((e: unknown) => {
        if (handleRef.current !== null) cancelRender(e);
      });
    return () => {
      if (handleRef.current !== null) continueRender(handleRef.current);
    };
  }, [transcriptSrc]);

  const scenes: Scene[] = useMemo(() => {
    if (!transcript) {
      const totalMs = (durationInFrames / fps) * 1000;
      return [
        {
          startMs: 0,
          endMs: totalMs,
          mood: episode.moodOverride ?? "social",
          text: "",
        },
      ];
    }
    const raw = splitScenes(transcript);
    return applyMoodOverrides(
      raw,
      episode.moodOverride,
      episode.sceneOverrides,
    );
  }, [transcript, durationInFrames, fps, episode.moodOverride, episode.sceneOverrides]);

  if (scenes.length === 0) return null;

  const currentMs = (frame / fps) * 1000;

  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      {scenes.map((scene, idx) => {
        const enter = interpolate(
          currentMs,
          [scene.startMs - CROSSFADE_MS / 2, scene.startMs + CROSSFADE_MS / 2],
          [0, 1],
          { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
        );
        const exit = interpolate(
          currentMs,
          [scene.endMs - CROSSFADE_MS / 2, scene.endMs + CROSSFADE_MS / 2],
          [1, 0],
          { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
        );
        const opacity = Math.min(enter, exit);
        if (opacity <= 0) return null;
        return (
          <ScenePanel
            key={`${scene.startMs}-${idx}`}
            mood={scene.mood}
            layoutIndex={idx}
            opacity={opacity}
            elapsedMs={Math.max(0, currentMs - scene.startMs)}
          />
        );
      })}
    </AbsoluteFill>
  );
};

type PanelProps = {
  mood: MoodKey;
  layoutIndex: number;
  opacity: number;
  elapsedMs: number;
};

const ScenePanel: React.FC<PanelProps> = ({ mood, layoutIndex, opacity, elapsedMs }) => {
  const accent = MOOD_ACCENTS[mood];
  const t = elapsedMs / 1000;
  const layout = layoutIndex % 3;

  return (
    <AbsoluteFill style={{ opacity }}>
      <svg
        width={FORMAT.width}
        height={FORMAT.height}
        viewBox={`0 0 ${FORMAT.width} ${FORMAT.height}`}
        style={{ position: "absolute", inset: 0 }}
      >
        <defs>
          <radialGradient id={`vignette-${layoutIndex}`} cx="50%" cy="50%" r="70%">
            <stop offset="0%" stopColor={withAlpha(accent, 0.15)} />
            <stop offset="60%" stopColor={withAlpha(accent, 0.04)} />
            <stop offset="100%" stopColor={withAlpha(COLORS.bg, 0)} />
          </radialGradient>
        </defs>
        <rect width="100%" height="100%" fill={`url(#vignette-${layoutIndex})`} />
        {layout === 0 ? <OrbitRings t={t} accent={accent} /> : null}
        {layout === 1 ? <DriftingShapes t={t} accent={accent} /> : null}
        {layout === 2 ? <BreathCircles t={t} accent={accent} /> : null}
      </svg>
    </AbsoluteFill>
  );
};

const OrbitRings: React.FC<{ t: number; accent: string }> = ({ t, accent }) => {
  const cx = FORMAT.width / 2;
  const cy = FORMAT.height * 0.32;
  return (
    <g>
      {[0, 1, 2].map((i) => {
        const phase = t * 0.08 + i * 0.7;
        const r = 220 + i * 90 + Math.sin(phase) * 20;
        return (
          <circle
            key={i}
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke={withAlpha(accent, 0.18 - i * 0.04)}
            strokeWidth={1.5}
          />
        );
      })}
    </g>
  );
};

const DriftingShapes: React.FC<{ t: number; accent: string }> = ({ t, accent }) => {
  const cx = FORMAT.width / 2;
  const cy = FORMAT.height * 0.68;
  return (
    <g opacity={0.55}>
      {[0, 1, 2, 3].map((i) => {
        const phase = t * 0.06 + i * 1.3;
        const ox = Math.sin(phase) * 240;
        const oy = Math.cos(phase * 0.7) * 120;
        const size = 120 + i * 30;
        return (
          <rect
            key={i}
            x={cx + ox - size / 2}
            y={cy + oy - size / 2}
            width={size}
            height={size}
            rx={size * 0.18}
            fill="none"
            stroke={withAlpha(accent, 0.2)}
            strokeWidth={1.5}
            transform={`rotate(${(phase * 12) % 360} ${cx + ox} ${cy + oy})`}
          />
        );
      })}
    </g>
  );
};

const BreathCircles: React.FC<{ t: number; accent: string }> = ({ t, accent }) => {
  const cx = FORMAT.width / 2;
  const cy = FORMAT.height * 0.3;
  const breath = Math.sin(t * 0.4) * 0.5 + 0.5;
  return (
    <g>
      {[0, 1, 2].map((i) => {
        const r = 140 + i * 70 + breath * 40;
        return (
          <circle
            key={i}
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke={withAlpha(accent, 0.18 - i * 0.04)}
            strokeWidth={1.5}
          />
        );
      })}
    </g>
  );
};
