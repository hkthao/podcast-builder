import { AbsoluteFill, Img } from "remotion";
import { BRAND, COLORS, FONTS, SAFE_ZONE, TYPE_SCALE } from "../theme";

type Props = {
  episodeNumber: number;
};

export const Watermark: React.FC<Props> = ({ episodeNumber }) => {
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      {/*
        Chuyển sang top-LEFT — FB Reels Mobile chèn mute icon + follow button
        ở top-right. Top-left chỉ có status bar (40px) + back chevron (60px),
        SAFE_ZONE.top 160 đủ né.
      */}
      <div
        style={{
          position: "absolute",
          top: SAFE_ZONE.top + 20,
          left: SAFE_ZONE.left,
          display: "flex",
          alignItems: "center",
          gap: 12,
          backgroundColor: COLORS.white,
          border: `3px solid ${COLORS.ink}`,
          borderRadius: 20,
          padding: "8px 16px",
        }}
      >
        <Img src={BRAND.markSrc} style={{ width: 36, height: 36 }} />
        <div
          style={{
            fontFamily: FONTS.display,
            fontWeight: 700,
            color: COLORS.ink,
            fontSize: TYPE_SCALE.watermark,
            lineHeight: 1,
          }}
        >
          {BRAND.channelName}
        </div>
        <div
          style={{
            fontFamily: FONTS.body,
            fontWeight: 600,
            color: COLORS.accentRed,
            fontSize: TYPE_SCALE.watermark - 4,
          }}
        >
          #{String(episodeNumber).padStart(3, "0")}
        </div>
      </div>
    </AbsoluteFill>
  );
};
