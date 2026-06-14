import { AbsoluteFill } from "remotion";
import { Background } from "./components/Background";
import { Watermark } from "./components/Watermark";
import { PodcastDesk } from "./components/scenes/PodcastDesk";
import { Idea } from "./components/scenes/Idea";
import { Connection } from "./components/scenes/Connection";
import { Crowd } from "./components/scenes/Crowd";
import { InnerSelf } from "./components/scenes/InnerSelf";
import { Choice } from "./components/scenes/Choice";
import { Knowledge } from "./components/scenes/Knowledge";
import { OnAir } from "./components/scenes/OnAir";
import { DualMic } from "./components/scenes/DualMic";
import { Journal } from "./components/scenes/Journal";
import { Morning } from "./components/scenes/Morning";
import { Listening } from "./components/scenes/Listening";
import { Voices } from "./components/scenes/Voices";
import { Growth } from "./components/scenes/Growth";
import { Quote } from "./components/scenes/Quote";
import { Doubt } from "./components/scenes/Doubt";
import { LettingGo } from "./components/scenes/LettingGo";
import { Sacrifice } from "./components/scenes/Sacrifice";
import { Metamorphosis } from "./components/scenes/Metamorphosis";
import { Bridge } from "./components/scenes/Bridge";
import { Mirror } from "./components/scenes/Mirror";
import { Threshold } from "./components/scenes/Threshold";
import { MOOD_ACCENTS, type MoodKey, type SceneType } from "./theme";

const REGISTRY: Record<SceneType, React.FC<{ mood: MoodKey; accentColor: string; progress: number; audioLevel?: number }>> = {
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
};

export type ScenePreviewProps = {
  sceneType: SceneType;
  mood: MoodKey;
  showWatermark: boolean;
};

/**
 * Single-scene composition cho catalog preview. Render scene đã settle
 * (frame ~60 = 2s sau pop-in animation) trên brand background. KHÔNG có
 * audio/transcript/intro/outro — chỉ scene + bg.
 */
export const ScenePreview: React.FC<ScenePreviewProps> = ({
  sceneType,
  mood,
  showWatermark,
}) => {
  const SceneComp = REGISTRY[sceneType] ?? PodcastDesk;
  return (
    <AbsoluteFill>
      <Background mood={mood} />
      <SceneComp
        mood={mood}
        accentColor={MOOD_ACCENTS[mood]}
        progress={0.5}
        audioLevel={0.3}
      />
      {showWatermark ? <Watermark episodeNumber={1} /> : null}
    </AbsoluteFill>
  );
};
