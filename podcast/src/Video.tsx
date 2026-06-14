import {
  AbsoluteFill,
  Audio,
  Sequence,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { Background } from "./components/Background";
import { BGMTrack } from "./components/BGMTrack";
import { Captions } from "./components/Captions";
import { Hook, HOOK_DURATION_FRAMES } from "./components/Hook";
import { IntroCard, INTRO_DURATION_FRAMES } from "./components/IntroCard";
import { OutroCard, OUTRO_DURATION_FRAMES } from "./components/OutroCard";
import { SceneLayer } from "./components/SceneLayer";
import { Visualizer } from "./components/Visualizer";
import { Watermark } from "./components/Watermark";
import type { EpisodeConfig } from "./episode";

export type CompProps = {
  audioSrc: string;
  transcriptSrc: string | null;
  planSrc: string | null;
  bgmSrc: string | null;
  episode: EpisodeConfig;
};

export const Video: React.FC<CompProps> = ({
  audioSrc,
  transcriptSrc,
  planSrc,
  bgmSrc,
  episode,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const mood = episode.moodOverride ?? "positive";

  const introFrames = episode.showIntro ? INTRO_DURATION_FRAMES : 0;
  const hookFrames = episode.hook ? HOOK_DURATION_FRAMES : 0;
  const outroFrames = episode.showOutro ? OUTRO_DURATION_FRAMES : 0;
  const mainStartFrame = introFrames + hookFrames;
  const mainEndFrame = durationInFrames - outroFrames;

  const hookStartMs = (introFrames / fps) * 1000;
  const hookEndMs = ((introFrames + hookFrames) / fps) * 1000;
  const captionHideRanges = episode.hook
    ? [{ startMs: hookStartMs, endMs: hookEndMs }]
    : [];

  const inMain = frame >= mainStartFrame && frame < mainEndFrame;
  const outroStartMs = (mainEndFrame / fps) * 1000;

  return (
    <AbsoluteFill>
      <Background mood={mood} />
      {audioSrc ? <Audio src={staticFile(audioSrc)} /> : null}

      {bgmSrc ? (
        <BGMTrack
          bgmSrc={bgmSrc}
          transcriptSrc={transcriptSrc}
          baseVolumeDb={episode.bgmVolumeDb}
          fadeOutFromMs={outroStartMs}
          speechOffsetMs={0}
        />
      ) : null}

      {audioSrc ? (
        <AbsoluteFill style={{ opacity: inMain ? 1 : 0 }}>
          <SceneLayer planSrc={planSrc} audioSrc={audioSrc} />
          <Visualizer audioSrc={audioSrc} mood={mood} />
          <Captions transcriptSrc={transcriptSrc} hideRanges={captionHideRanges} />
          <Watermark episodeNumber={episode.episodeNumber} />
        </AbsoluteFill>
      ) : null}

      {episode.showIntro ? (
        <Sequence from={0} durationInFrames={INTRO_DURATION_FRAMES} layout="none">
          <IntroCard
            title={episode.title}
            episodeNumber={episode.episodeNumber}
            coverImage={episode.coverImage}
            coverFit={episode.coverFit}
            coverPosition={episode.coverPosition}
          />
        </Sequence>
      ) : null}

      {episode.hook ? (
        <Sequence
          from={introFrames}
          durationInFrames={HOOK_DURATION_FRAMES}
          layout="none"
        >
          <Hook hook={episode.hook} />
        </Sequence>
      ) : null}

      {episode.showOutro && outroFrames > 0 ? (
        <Sequence from={mainEndFrame} durationInFrames={outroFrames} layout="none">
          <OutroCard />
        </Sequence>
      ) : null}
    </AbsoluteFill>
  );
};
