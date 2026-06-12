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

const CROSSFADE_MS = 1200;
const PARTICLE_COUNT = 60;

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
  const currentScene =
    scenes.find((s) => currentMs >= s.startMs && currentMs < s.endMs) ?? scenes[0]!;
  const t = frame / fps;

  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <ParticleField t={t} accent={MOOD_ACCENTS[currentScene.mood]} />
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
        if (opacity <= 0.001) return null;
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
  const layout = layoutIndex % 4;

  return (
    <AbsoluteFill style={{ opacity }}>
      <svg
        width={FORMAT.width}
        height={FORMAT.height}
        viewBox={`0 0 ${FORMAT.width} ${FORMAT.height}`}
        style={{ position: "absolute", inset: 0 }}
      >
        <defs>
          <radialGradient id={`vignette-${layoutIndex}`} cx="50%" cy="40%" r="65%">
            <stop offset="0%" stopColor={withAlpha(accent, 0.22)} />
            <stop offset="50%" stopColor={withAlpha(accent, 0.07)} />
            <stop offset="100%" stopColor={withAlpha(COLORS.bg, 0)} />
          </radialGradient>
        </defs>
        <rect width="100%" height="100%" fill={`url(#vignette-${layoutIndex})`} />
        {layout === 0 ? <OrbitRings t={t} accent={accent} /> : null}
        {layout === 1 ? <DriftingShapes t={t} accent={accent} /> : null}
        {layout === 2 ? <BreathCircles t={t} accent={accent} /> : null}
        {layout === 3 ? <MistBands t={t} accent={accent} /> : null}
      </svg>
    </AbsoluteFill>
  );
};

const ParticleField: React.FC<{ t: number; accent: string }> = ({ t, accent }) => {
  const particles = useMemo(() => {
    const out: Array<{ x: number; y: number; r: number; phase: number; speed: number }> = [];
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const seed = i * 9301 + 49297;
      const x = ((seed * 233280) % 100000) / 100000;
      const y = ((seed * 49297) % 100000) / 100000;
      const r = (((seed * 9301) % 100000) / 100000) * 2.5 + 0.8;
      const phase = (((seed * 233) % 100000) / 100000) * Math.PI * 2;
      const speed = 0.04 + (((seed * 17) % 100000) / 100000) * 0.08;
      out.push({ x, y, r, phase, speed });
    }
    return out;
  }, []);

  return (
    <svg
      width={FORMAT.width}
      height={FORMAT.height}
      viewBox={`0 0 ${FORMAT.width} ${FORMAT.height}`}
      style={{ position: "absolute", inset: 0 }}
    >
      {particles.map((p, i) => {
        const drift = Math.sin(t * p.speed + p.phase) * 18;
        const alpha = 0.12 + (Math.sin(t * 0.5 + p.phase) + 1) * 0.08;
        const isGold = i % 3 === 0;
        return (
          <circle
            key={i}
            cx={p.x * FORMAT.width + drift}
            cy={p.y * FORMAT.height + Math.cos(t * p.speed * 0.7 + p.phase) * 14}
            r={p.r}
            fill={isGold ? COLORS.signature : accent}
            opacity={alpha}
          />
        );
      })}
    </svg>
  );
};

const OrbitRings: React.FC<{ t: number; accent: string }> = ({ t, accent }) => {
  const cx = FORMAT.width / 2;
  const cy = FORMAT.height * 0.3;
  return (
    <g>
      {[0, 1, 2, 3].map((i) => {
        const phase = t * 0.08 + i * 0.7;
        const r = 200 + i * 110 + Math.sin(phase) * 28;
        const rot = (t * (2 + i * 1.5)) % 360;
        return (
          <g key={i} transform={`rotate(${rot} ${cx} ${cy})`}>
            <circle
              cx={cx}
              cy={cy}
              r={r}
              fill="none"
              stroke={withAlpha(accent, 0.24 - i * 0.04)}
              strokeWidth={1.5}
              strokeDasharray={i === 1 ? "3 8" : i === 3 ? "1 6" : undefined}
            />
            <circle
              cx={cx + r}
              cy={cy}
              r={3 + i}
              fill={withAlpha(accent, 0.5)}
            />
          </g>
        );
      })}
    </g>
  );
};

const DriftingShapes: React.FC<{ t: number; accent: string }> = ({ t, accent }) => {
  const cx = FORMAT.width / 2;
  const cy = FORMAT.height * 0.68;
  return (
    <g opacity={0.6}>
      {[0, 1, 2, 3, 4, 5].map((i) => {
        const phase = t * 0.05 + i * 1.0;
        const ox = Math.sin(phase) * 280;
        const oy = Math.cos(phase * 0.7) * 140;
        const size = 110 + i * 35;
        return (
          <rect
            key={i}
            x={cx + ox - size / 2}
            y={cy + oy - size / 2}
            width={size}
            height={size}
            rx={size * 0.18}
            fill="none"
            stroke={withAlpha(accent, 0.22)}
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
  const cy = FORMAT.height * 0.32;
  const breath = Math.sin(t * 0.35) * 0.5 + 0.5;
  return (
    <g>
      {[0, 1, 2, 3, 4].map((i) => {
        const r = 120 + i * 80 + breath * 60;
        const dashOffset = (t * 8 + i * 12) % 30;
        return (
          <circle
            key={i}
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke={withAlpha(accent, 0.22 - i * 0.04)}
            strokeWidth={1.5}
            strokeDasharray="6 14"
            strokeDashoffset={dashOffset}
          />
        );
      })}
    </g>
  );
};

const MistBands: React.FC<{ t: number; accent: string }> = ({ t, accent }) => {
  return (
    <g opacity={0.45}>
      {[0, 1, 2, 3].map((i) => {
        const y = FORMAT.height * (0.18 + i * 0.22);
        const offset = Math.sin(t * 0.08 + i * 1.4) * 80;
        return (
          <ellipse
            key={i}
            cx={FORMAT.width / 2 + offset}
            cy={y}
            rx={FORMAT.width * 0.52}
            ry={48 + i * 18}
            fill={withAlpha(accent, 0.18 - i * 0.03)}
          />
        );
      })}
    </g>
  );
};
