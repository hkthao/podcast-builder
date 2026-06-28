import { useMemo } from "react";
import {
  AbsoluteFill,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { useAudioData, visualizeAudio } from "@remotion/media-utils";
import { MOOD_ACCENTS, DEFAULT_SCENE, type SceneType } from "../theme";
import type { Scene } from "../scenes";
import { CROSSFADE_MS, sceneMotionTransform } from "./scene-runtime";
import { PodcastDesk } from "./scenes/PodcastDesk";
import { Idea } from "./scenes/Idea";
import { Connection } from "./scenes/Connection";
import { Crowd } from "./scenes/Crowd";
import { InnerSelf } from "./scenes/InnerSelf";
import { Choice } from "./scenes/Choice";
import { Knowledge } from "./scenes/Knowledge";
import { OnAir } from "./scenes/OnAir";
import { DualMic } from "./scenes/DualMic";
import { Journal } from "./scenes/Journal";
import { Morning } from "./scenes/Morning";
import { Listening } from "./scenes/Listening";
import { Voices } from "./scenes/Voices";
import { Growth } from "./scenes/Growth";
import { Quote } from "./scenes/Quote";
import { Doubt } from "./scenes/Doubt";
import { LettingGo } from "./scenes/LettingGo";
import { Sacrifice } from "./scenes/Sacrifice";
import { Metamorphosis } from "./scenes/Metamorphosis";
import { Bridge } from "./scenes/Bridge";
import { Mirror } from "./scenes/Mirror";
import { Threshold } from "./scenes/Threshold";
import { CaveShadows } from "./scenes/CaveShadows";
import { MementoMori } from "./scenes/MementoMori";
import { Sisyphus } from "./scenes/Sisyphus";
import { Scales } from "./scenes/Scales";
import { MachineMind } from "./scenes/MachineMind";
import { Seesaw } from "./scenes/Seesaw";
import { Compass } from "./scenes/Compass";
import { Void } from "./scenes/Void";
import { StoicPillar } from "./scenes/StoicPillar";
import { Owl } from "./scenes/Owl";
import { ThirdEye } from "./scenes/ThirdEye";
import { TimeRiver } from "./scenes/TimeRiver";
import { Wave } from "./scenes/Wave";
import { Cosmos } from "./scenes/Cosmos";
import { Labyrinth } from "./scenes/Labyrinth";
import { Burden } from "./scenes/Burden";
import { Fate } from "./scenes/Fate";
import { Enlightenment } from "./scenes/Enlightenment";
import { Paradox } from "./scenes/Paradox";
import { BrokenChains } from "./scenes/BrokenChains";
import type { SceneProps } from "./scenes/base";

const REGISTRY: Record<SceneType, React.FC<SceneProps>> = {
  PodcastDesk,
  Idea,
  Connection,
  Crowd,
  InnerSelf,
  Choice,
  Knowledge,
  OnAir,
  DualMic,
  Journal,
  Morning,
  Listening,
  Voices,
  Growth,
  Quote,
  Doubt,
  LettingGo,
  Sacrifice,
  Metamorphosis,
  Bridge,
  Mirror,
  Threshold,
  CaveShadows,
  MementoMori,
  Sisyphus,
  Scales,
  MachineMind,
  Seesaw,
  Compass,
  Void,
  StoicPillar,
  Owl,
  ThirdEye,
  TimeRiver,
  Wave,
  Cosmos,
  Labyrinth,
  Burden,
  Fate,
  Enlightenment,
  Paradox,
  BrokenChains,
};

type Props = {
  scenes: Scene[];
  audioSrc: string;
};

/** Router cảnh — nhận scenes (plan đã fetch ở Video) + audioLevel, dispatch
 * sang scene recipe kèm motion Ken Burns + transition có hướng. */
export const SceneLayer: React.FC<Props> = ({ scenes, audioSrc }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

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
      {scenes.map((scene, index) => {
        const opacity = sceneOpacity(scene, currentMs);
        if (opacity <= 0.001) return null;
        const sceneType: SceneType = REGISTRY[scene.sceneType]
          ? scene.sceneType
          : DEFAULT_SCENE;
        const SceneComp = REGISTRY[sceneType];
        const duration = scene.endMs - scene.startMs;
        const elapsed = Math.max(0, currentMs - scene.startMs);
        const progress = Math.min(1, elapsed / duration);
        const transform = sceneMotionTransform(
          index,
          scene,
          currentMs,
          audioLevel,
        );
        return (
          <AbsoluteFill key={scene.startMs} style={{ opacity }}>
            <AbsoluteFill
              style={{
                transform,
                transformOrigin: "center center",
                willChange: "transform",
              }}
            >
              <SceneComp
                mood={scene.mood}
                accentColor={MOOD_ACCENTS[scene.mood]}
                progress={progress}
                audioLevel={audioLevel}
              />
            </AbsoluteFill>
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
