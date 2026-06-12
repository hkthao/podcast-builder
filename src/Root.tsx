import { Composition, staticFile } from "remotion";
import { parseMedia } from "@remotion/media-parser";
import { Video, type CompProps } from "./Video";
import { FORMAT, FPS } from "./theme";
import { buildEpisodeTemplate, EpisodeConfigSchema } from "./episode";

const defaultProps: CompProps = {
  audioSrc: "",
  transcriptSrc: null,
  planSrc: null,
  bgmSrc: null,
  episode: EpisodeConfigSchema.parse(buildEpisodeTemplate("Bản nháp")),
};

export const RemotionRoot: React.FC = () => {
  return (
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
  );
};
