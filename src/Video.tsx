import { AbsoluteFill, Audio, staticFile } from "remotion";
import { Background } from "./components/Background";
import type { EpisodeConfig } from "./episode";

export type CompProps = {
  audioSrc: string;
  transcriptSrc: string | null;
  bgmSrc: string | null;
  episode: EpisodeConfig;
};

export const Video: React.FC<CompProps> = ({ audioSrc }) => {
  return (
    <AbsoluteFill>
      <Background />
      <Audio src={staticFile(audioSrc)} />
    </AbsoluteFill>
  );
};
