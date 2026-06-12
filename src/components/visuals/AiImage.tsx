import { AbsoluteFill, Img, interpolate } from "remotion";

type Props = {
  src: string;
  /** progress 0..1 trong cảnh, dùng cho Ken Burns. */
  progress: number;
  /** Hướng pan: 0 = left→right, 1 = right→left, 2 = top→bottom, 3 = bottom→top. */
  panDir: 0 | 1 | 2 | 3;
};

const SCALE_FROM = 1.0;
const SCALE_TO = 1.12;
const PAN_AMOUNT = 4; // %

export const AiImage: React.FC<Props> = ({ src, progress, panDir }) => {
  const scale = interpolate(progress, [0, 1], [SCALE_FROM, SCALE_TO]);
  const panEnd = interpolate(progress, [0, 1], [-PAN_AMOUNT / 2, PAN_AMOUNT / 2]);

  let translateX = 0;
  let translateY = 0;
  if (panDir === 0) translateX = panEnd;
  if (panDir === 1) translateX = -panEnd;
  if (panDir === 2) translateY = panEnd;
  if (panDir === 3) translateY = -panEnd;

  return (
    <AbsoluteFill style={{ overflow: "hidden" }}>
      <Img
        src={src}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          transform: `scale(${scale}) translate(${translateX}%, ${translateY}%)`,
          transformOrigin: "center center",
        }}
      />
    </AbsoluteFill>
  );
};
