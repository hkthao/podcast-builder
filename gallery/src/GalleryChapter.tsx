/**
 * GalleryChapter composition — Phase 4d.
 *
 * Render 1 chapter (narration HOẶC music) thành video 16:9 @ 24fps.
 *
 * Input props (truyền vào lúc render, NOT static):
 *  - title, kind, audioUrl?, musicCue?
 *  - resolvedBeats[]: beats với startFrame + durationFrames đã pre-compute
 *    + assetUrl đã resolve từ assetIdRef → full image URL
 *
 * Composition durationInFrames = totalAudioMs * fps / 1000.
 * Render runner phải pass đúng durationInFrames qua selectComposition.calculateMetadata.
 */
import React from "react";
import { AbsoluteFill, Audio, Sequence } from "remotion";
import { COLORS, FONTS, SAFE_ZONE, TYPE_SCALE } from "./theme.gallery";
import { KenBurnsImage, type KenBurnsMode } from "./KenBurnsImage";

/** Beat đã pre-resolved: timing tính từ wordTimestamps, asset URL từ DB. */
export type ResolvedBeat = {
  startFrame: number;
  durationFrames: number;
  keyword: string;
  kenBurns: KenBurnsMode;
  /** Full image URL — null nếu beat chưa attach asset → placeholder. */
  assetUrl: string | null;
  assetTitle: string;
  assetAuthor: string;
  assetYear: string;
  assetProvider: string;
  assetLicense: string;
};

export type GalleryChapterProps = {
  title: string;
  kind: "narration" | "music";
  /** Audio voiceover URL (cho narration) hoặc BGM URL (cho music). */
  audioUrl: string | null;
  musicCue: string;
  resolvedBeats: ResolvedBeat[];
  /** Tổng frames của composition — đồng bộ với durationInFrames root. */
  totalFrames: number;
};

export const GalleryChapter: React.FC<GalleryChapterProps> = ({
  title,
  kind,
  audioUrl,
  musicCue,
  resolvedBeats,
  totalFrames,
}) => {
  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.bg }}>
      {/* Audio track — luôn 1 cho cả chapter (narration hoặc BGM placeholder) */}
      {audioUrl && <Audio src={audioUrl} />}

      {/* Visual beats — mỗi beat 1 Sequence không overlap */}
      {resolvedBeats.length === 0 ? (
        <EmptyBeatPlaceholder
          title={title}
          kind={kind}
          musicCue={musicCue}
          totalFrames={totalFrames}
        />
      ) : (
        resolvedBeats.map((beat, i) => (
          <Sequence
            key={i}
            from={beat.startFrame}
            durationInFrames={beat.durationFrames}
          >
            {beat.assetUrl ? (
              <KenBurnsImage
                src={beat.assetUrl}
                mode={beat.kenBurns}
                durationFrames={beat.durationFrames}
              />
            ) : (
              <BeatPlaceholder keyword={beat.keyword} />
            )}
            {beat.assetTitle && <ArtworkLabel beat={beat} />}
          </Sequence>
        ))
      )}

      {/* Music chapter overlay text */}
      {kind === "music" && (
        <MusicChapterOverlay title={title} cue={musicCue} />
      )}
    </AbsoluteFill>
  );
};

const BeatPlaceholder: React.FC<{ keyword: string }> = ({ keyword }) => (
  <AbsoluteFill
    style={{
      backgroundColor: COLORS.bgAlt,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      flexDirection: "column",
      gap: 16,
    }}
  >
    <div
      style={{
        fontFamily: FONTS.body,
        color: COLORS.inkMuted,
        fontSize: 24,
      }}
    >
      [ Missing asset ]
    </div>
    <div
      style={{
        fontFamily: FONTS.mono,
        color: COLORS.goldLeaf,
        fontSize: 20,
        maxWidth: "60%",
        textAlign: "center",
      }}
    >
      {keyword || "(no keyword)"}
    </div>
  </AbsoluteFill>
);

const EmptyBeatPlaceholder: React.FC<{
  title: string;
  kind: "narration" | "music";
  musicCue: string;
  totalFrames: number;
}> = ({ title, kind, musicCue }) => (
  <AbsoluteFill
    style={{
      backgroundColor: COLORS.bgAlt,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      flexDirection: "column",
      gap: 24,
    }}
  >
    <div
      style={{
        fontFamily: FONTS.display,
        color: COLORS.ink,
        fontSize: TYPE_SCALE.chapterCardTitle * 0.6,
        textAlign: "center",
        maxWidth: "70%",
      }}
    >
      {title}
    </div>
    {kind === "music" && musicCue && (
      <div
        style={{
          fontFamily: FONTS.body,
          color: COLORS.goldLeaf,
          fontSize: TYPE_SCALE.chapterCardSubtitle,
          fontStyle: "italic",
        }}
      >
        ♪ {musicCue}
      </div>
    )}
    {kind === "narration" && (
      <div
        style={{
          fontFamily: FONTS.mono,
          color: COLORS.inkMuted,
          fontSize: 18,
        }}
      >
        (No visual beats — attach assets trong UI)
      </div>
    )}
  </AbsoluteFill>
);

const ArtworkLabel: React.FC<{ beat: ResolvedBeat }> = ({ beat }) => (
  <div
    style={{
      position: "absolute",
      left: SAFE_ZONE.artworkLabelX,
      bottom: 1080 - SAFE_ZONE.artworkLabelY - 90, // y → bottom
      maxWidth: 720,
      padding: "12px 18px",
      background: "linear-gradient(90deg, rgba(15,13,10,0.85) 0%, rgba(15,13,10,0.6) 100%)",
      borderLeft: `3px solid ${COLORS.goldLeaf}`,
      backdropFilter: "blur(2px)",
    }}
  >
    <div
      style={{
        fontFamily: FONTS.display,
        color: COLORS.ink,
        fontSize: TYPE_SCALE.artworkLabelTitle * 0.7,
        lineHeight: 1.1,
      }}
    >
      {beat.assetTitle}
    </div>
    {(beat.assetAuthor || beat.assetYear) && (
      <div
        style={{
          fontFamily: FONTS.body,
          color: COLORS.inkMuted,
          fontSize: TYPE_SCALE.artworkLabelMeta * 0.85,
          marginTop: 4,
        }}
      >
        {[beat.assetAuthor, beat.assetYear].filter(Boolean).join(" · ")}
      </div>
    )}
  </div>
);

const MusicChapterOverlay: React.FC<{ title: string; cue: string }> = ({
  title,
  cue,
}) => (
  <AbsoluteFill
    style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      flexDirection: "column",
      gap: 24,
      background: "rgba(15,13,10,0.4)",
    }}
  >
    <div
      style={{
        fontFamily: FONTS.display,
        color: COLORS.ink,
        fontSize: TYPE_SCALE.chapterCardTitle * 0.5,
        textAlign: "center",
        textShadow: "0 4px 12px rgba(0,0,0,0.8)",
      }}
    >
      {title}
    </div>
    <div
      style={{
        fontFamily: FONTS.body,
        color: COLORS.goldLeaf,
        fontSize: TYPE_SCALE.chapterCardSubtitle * 0.9,
        fontStyle: "italic",
        textShadow: "0 2px 6px rgba(0,0,0,0.8)",
      }}
    >
      ♪ {cue}
    </div>
  </AbsoluteFill>
);
