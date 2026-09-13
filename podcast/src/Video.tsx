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
import { EditorialOverlay } from "./components/EditorialOverlay";
import { FootageLayer, type FootageClip } from "./components/FootageLayer";
import { Hook, HOOK_DURATION_FRAMES } from "./components/Hook";
import { IntroCard, INTRO_DURATION_FRAMES } from "./components/IntroCard";
import { OutroCard, OUTRO_DURATION_FRAMES } from "./components/OutroCard";
import { SceneLayer } from "./components/SceneLayer";
import { Visualizer } from "./components/Visualizer";
import { Watermark } from "./components/Watermark";
import { useScenePlan } from "./components/scene-runtime";
import { outroTailFrames, type EpisodeConfig } from "./episode";

export type CompProps = {
  audioSrc: string;
  transcriptSrc: string | null;
  planSrc: string | null;
  bgmSrc: string | null;
  editorialSrc: string | null;
  footageClips: FootageClip[];
  /**
   * Overlay mode (2-pass): render ĐỒ HOẠ trên nền TRONG SUỐT (không nền vàng,
   * không sticker, KHÔNG FootageLayer) → ffmpeg phủ lên footage bg + audio.
   * Tránh Remotion giải mã footage (crash trên render dài). Xem make.ts 2-pass.
   */
  overlayMode?: boolean;
  episode: EpisodeConfig;
};

export const Video: React.FC<CompProps> = ({
  audioSrc,
  transcriptSrc,
  planSrc,
  bgmSrc,
  editorialSrc,
  footageClips,
  overlayMode = false,
  episode,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const mood = episode.moodOverride ?? "positive";
  const plan = useScenePlan(planSrc);
  const scenes = plan?.scenes ?? [];

  const introFrames = episode.showIntro ? INTRO_DURATION_FRAMES : 0;
  const hookFrames = episode.hook ? HOOK_DURATION_FRAMES : 0;
  // Đuôi nhạc nền cuối (music-only). Nếu có → thẻ outro trải KÍN đuôi này (giọng
  // đã im, chỉ nhạc + card rồi fade). Không có tail → giữ outro cũ 4s cuối tiếng.
  const tailFrames = outroTailFrames(episode, fps);
  const outroFrames = episode.showOutro
    ? tailFrames > 0
      ? tailFrames
      : OUTRO_DURATION_FRAMES
    : 0;
  const mainStartFrame = introFrames + hookFrames;
  const mainEndFrame = durationInFrames - outroFrames;

  const hookStartMs = (introFrames / fps) * 1000;
  const hookEndMs = ((introFrames + hookFrames) / fps) * 1000;
  const captionHideRanges = episode.hook
    ? [{ startMs: hookStartMs, endMs: hookEndMs }]
    : [];

  const inMain = frame >= mainStartFrame && frame < mainEndFrame;
  const outroStartMs = (mainEndFrame / fps) * 1000;
  const mainStartMs = (mainStartFrame / fps) * 1000;
  const totalMs = (durationInFrames / fps) * 1000;
  // Có đuôi nhạc → GIỮ nhạc suốt đuôi, chỉ fade 2s cuối (BGMTrack tự lo);
  // không đuôi → fade dần từ lúc vào outro như cũ.
  const bgmFadeOutFromMs = tailFrames > 0 ? totalMs : outroStartMs;

  // Footage mode: có clip → footage làm nền động thay nền vàng + ẩn sticker.
  // overlayMode (2-pass): footage do ffmpeg lo → tắt FootageLayer + nền + sticker.
  const useFootage = footageClips.length > 0 && !overlayMode;
  const hideStickers = useFootage || overlayMode;

  return (
    <AbsoluteFill style={overlayMode ? { backgroundColor: "transparent" } : undefined}>
      {overlayMode ? null : <Background mood={mood} scenes={scenes} />}
      {useFootage ? (
        <FootageLayer
          clips={footageClips}
          fps={fps}
          mainStartMs={mainStartMs}
          mainEndMs={outroStartMs}
        />
      ) : null}
      {audioSrc ? <Audio src={staticFile(audioSrc)} /> : null}

      {bgmSrc ? (
        <BGMTrack
          bgmSrc={bgmSrc}
          transcriptSrc={transcriptSrc}
          baseVolumeDb={episode.bgmVolumeDb}
          fadeOutFromMs={bgmFadeOutFromMs}
          speechOffsetMs={0}
        />
      ) : null}

      {audioSrc ? (
        <AbsoluteFill style={{ opacity: inMain ? 1 : 0 }}>
          {hideStickers ? null : <SceneLayer scenes={scenes} audioSrc={audioSrc} />}
          <Visualizer audioSrc={audioSrc} mood={mood} scenes={scenes} accentColor={episode.accentColor} />
          <Captions transcriptSrc={transcriptSrc} hideRanges={captionHideRanges} accentColor={episode.accentColor} />
          <Watermark episodeNumber={episode.episodeNumber} accentColor={episode.accentColor} />
          {episode.showEditorial ? (
            <EditorialOverlay
              editorialSrc={editorialSrc}
              speechOffsetMs={0}
              revealMs={(mainStartFrame / fps) * 1000}
              accentColor={episode.accentColor}
            />
          ) : null}
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
