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
import { useAudioData, visualizeAudio } from "@remotion/media-utils";
import { MOOD_ACCENTS, DEFAULT_SCENE, type SceneType } from "../theme";
import type { Scene, ScenePlan } from "../scenes";
import { PodcastDesk } from "./scenes/PodcastDesk";
import { Idea } from "./scenes/Idea";
import { Connection } from "./scenes/Connection";
import { Crowd } from "./scenes/Crowd";
import { InnerSelf } from "./scenes/InnerSelf";
import { Choice } from "./scenes/Choice";
import { Knowledge } from "./scenes/Knowledge";
import type { SceneProps } from "./scenes/base";

const CROSSFADE_MS = 1000;

const REGISTRY: Record<SceneType, React.FC<SceneProps>> = {
  PodcastDesk,
  Idea,
  Connection,
  Crowd,
  InnerSelf,
  Choice,
  Knowledge,
};

type Props = {
  planSrc: string | null;
  audioSrc: string;
};

/** Router cảnh — load plan.json + audioLevel, dispatch sang scene recipe. */
export const SceneLayer: React.FC<Props> = ({ planSrc, audioSrc }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const [plan, setPlan] = useState<ScenePlan | null>(null);
  const handleRef = useRef<number | null>(null);

  useEffect(() => {
    if (!planSrc) return;
    handleRef.current = delayRender(`scene-plan:${planSrc}`);
    fetch(staticFile(planSrc))
      .then((r) => {
        if (!r.ok) throw new Error(`fetch ${planSrc} ${r.status}`);
        return r.json() as Promise<ScenePlan>;
      })
      .then((p) => {
        setPlan(p);
        if (handleRef.current !== null) continueRender(handleRef.current);
      })
      .catch((e: unknown) => {
        if (handleRef.current !== null) cancelRender(e);
      });
    return () => {
      if (handleRef.current !== null) continueRender(handleRef.current);
    };
  }, [planSrc]);

  const audioData = useAudioData(staticFile(audioSrc));
  const audioLevel = useMemo(() => {
    if (!audioData) return 0;
    const bands = visualizeAudio({
      audioData,
      frame,
      fps,
      numberOfSamples: 8,
    });
    const avg = bands.reduce((s, b) => s + b, 0) / bands.length;
    return Math.min(1, avg);
  }, [audioData, frame, fps]);

  const currentMs = (frame / fps) * 1000;
  const scenes = plan?.scenes ?? [];

  if (scenes.length === 0) {
    return (
      <AbsoluteFill style={{ pointerEvents: "none" }}>
        <PodcastDesk
          mood="positive"
          accentColor={MOOD_ACCENTS.positive}
          progress={0.5}
          audioLevel={audioLevel}
        />
      </AbsoluteFill>
    );
  }

  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      {scenes.map((scene) => {
        const opacity = sceneOpacity(scene, currentMs);
        if (opacity <= 0.001) return null;
        const sceneType: SceneType = REGISTRY[scene.sceneType]
          ? scene.sceneType
          : DEFAULT_SCENE;
        const SceneComp = REGISTRY[sceneType];
        const duration = scene.endMs - scene.startMs;
        const elapsed = Math.max(0, currentMs - scene.startMs);
        const progress = Math.min(1, elapsed / duration);
        return (
          <AbsoluteFill key={scene.startMs} style={{ opacity }}>
            <SceneComp
              mood={scene.mood}
              accentColor={MOOD_ACCENTS[scene.mood]}
              progress={progress}
              audioLevel={audioLevel}
            />
          </AbsoluteFill>
        );
      })}
    </AbsoluteFill>
  );
};

const sceneOpacity = (scene: Scene, currentMs: number): number => {
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
  return Math.min(enter, exit);
};
