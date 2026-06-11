import { Composition } from "remotion";
import { Video } from "./Video";
import { FORMAT, FPS } from "./theme";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="Podcast"
        component={Video}
        durationInFrames={FPS * 5}
        fps={FPS}
        width={FORMAT.width}
        height={FORMAT.height}
      />
    </>
  );
};
