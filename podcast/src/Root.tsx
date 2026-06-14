import { Composition, staticFile } from "remotion";
import { parseMedia } from "@remotion/media-parser";
import { Video, type CompProps } from "./Video";
import { ScenePreview, type ScenePreviewProps } from "./ScenePreview";
import { FORMAT, FPS } from "./theme";
import { buildEpisodeTemplate, EpisodeConfigSchema } from "./episode";

const defaultProps: CompProps = {
  audioSrc: "",
  transcriptSrc: null,
  planSrc: null,
  bgmSrc: null,
  episode: EpisodeConfigSchema.parse(buildEpisodeTemplate("Bản nháp")),
};

const scenePreviewDefaults: ScenePreviewProps = {
  sceneType: "PodcastDesk",
  mood: "positive",
  showWatermark: false,
};

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="Podcast"
        component={Video}
        durationInFrames={FPS}
        fps={FPS}
        width={FORMAT.width}
        height={FORMAT.height}
        defaultProps={defaultProps}
        calculateMetadata={async ({ props }) => {
          if (!props.audioSrc) {
            return { durationInFrames: FPS };
          }
          const { slowDurationInSeconds } = await parseMedia({
            src: staticFile(props.audioSrc),
            fields: { slowDurationInSeconds: true },
            acknowledgeRemotionLicense: true,
          });
          return {
            durationInFrames: Math.ceil(slowDurationInSeconds * FPS),
          };
        }}
      />
      <Composition
        id="ScenePreview"
        component={ScenePreview}
        durationInFrames={Math.round(FPS * 3)}
        fps={FPS}
        width={FORMAT.width}
        height={FORMAT.height}
        defaultProps={scenePreviewDefaults}
      />
    </>
  );
};
