import { AbsoluteFill, Audio, staticFile } from "remotion";
import { Background } from "./components/Background";
import { Visualizer } from "./components/Visualizer";
import type { EpisodeConfig } from "./episode";

export type CompProps = {
  audioSrc: string;
  transcriptSrc: string | null;
  bgmSrc: string | null;
  episode: EpisodeConfig;
};

export const Video: React.FC<CompProps> = ({ audioSrc, episode }) => {
  const mood = episode.moodOverride ?? "social";
  return (
    <AbsoluteFill>
      <Background />
      {audioSrc ? (
        <>
          <Audio src={staticFile(audioSrc)} />
          <Visualizer audioSrc={audioSrc} mood={mood} />
        </>
      ) : null}
    </AbsoluteFill>
  );
};
