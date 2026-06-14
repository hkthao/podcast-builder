/**
 * Gallery Remotion Root — Phase 4d.
 *
 * Separate entry với podcast/src/Root.tsx vì 2 style render khác nhau.
 * `bundle()` từ render runner pass entryPoint="gallery/src/index.ts" để
 * load Root này.
 *
 * Compositions:
 *  - "GalleryChapter": 1 chapter (narration hoặc music). Props pass per
 *    render (resolvedBeats với asset URLs + timings).
 *
 * Future:
 *  - "GalleryIntro" / "GalleryOutro": optional cards
 */
import React from "react";
import { Composition } from "remotion";
import { FORMAT, FPS } from "./theme.gallery";
import {
  GalleryChapter,
  type GalleryChapterProps,
} from "./GalleryChapter";

const defaultProps: GalleryChapterProps = {
  title: "Sample chapter",
  kind: "narration",
  audioUrl: null,
  musicCue: "",
  resolvedBeats: [],
  totalFrames: FPS * 10,
};

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="GalleryChapter"
        component={GalleryChapter}
        // Default 10s — render runner override qua calculateMetadata
        durationInFrames={FPS * 10}
        fps={FPS}
        width={FORMAT.width}
        height={FORMAT.height}
        defaultProps={defaultProps}
        calculateMetadata={({ props }) => ({
          durationInFrames: Math.max(FPS, props.totalFrames),
        })}
      />
    </>
  );
};
