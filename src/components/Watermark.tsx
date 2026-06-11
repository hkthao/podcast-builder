import { AbsoluteFill, Img } from "remotion";
import { BRAND, COLORS, FONTS, SAFE_ZONE, TYPE_SCALE } from "../theme";

type Props = {
  episodeNumber: number;
};

export const Watermark: React.FC<Props> = ({ episodeNumber }) => {
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <div
        style={{
          position: "absolute",
          top: SAFE_ZONE.top + 20,
          right: SAFE_ZONE.right,
          display: "flex",
          alignItems: "center",
          gap: 14,
          opacity: 0.45,
        }}
      >
        <Img src={BRAND.logoSrc} style={{ width: 40, height: 40 }} />
        <div
          style={{
            fontFamily: FONTS.body,
            color: COLORS.textPrimary,
            fontSize: TYPE_SCALE.watermark,
            lineHeight: 1,
          }}
        >
          <div>{BRAND.channelName}</div>
          <div
            style={{
              color: COLORS.textMuted,
              fontSize: TYPE_SCALE.watermark - 6,
              marginTop: 4,
            }}
          >
            #{String(episodeNumber).padStart(3, "0")}
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
