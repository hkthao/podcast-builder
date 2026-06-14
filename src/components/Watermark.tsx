import { AbsoluteFill, Img } from "remotion";
import { BRAND, COLORS, FONTS, SAFE_ZONE, TYPE_SCALE } from "../theme";

type Props = {
  episodeNumber: number;
};

/** Logo height in px — keep ratio (~3:2) → width auto ≈ 1.5× height (~330px). */
const LOGO_HEIGHT = 220;
const LOGO_WIDTH = LOGO_HEIGHT * 1.5;
/**
 * Crop PNG decorations (heart/cloud/stars float xung quanh paper-card) bằng
 * cách zoom in 1.3× + overflow:hidden. Brand text "ByteCast Tech" được zoom
 * theo → đọc to hơn, đẹp hơn. Decorations bị clip ra ngoài.
 */
const LOGO_ZOOM = 1.3;

export const Watermark: React.FC<Props> = ({ episodeNumber }) => {
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      {/*
        Top-LEFT — FB Reels Mobile chèn mute icon + follow button ở top-right.
        Top-left chỉ có status bar (40px) + back chevron (60px), SAFE_ZONE.top
        160 đủ né. Logo ByteCast Tech (paper-card PNG) đã có brand text +
        decorations bên trong → KHÔNG cần wrap pill hay thêm text "ByteCast
        Tech" bên cạnh. Episode badge canh giữa dưới logo để cân đối visual.
      */}
      <div
        style={{
          position: "absolute",
          top: SAFE_ZONE.top,
          left: SAFE_ZONE.left,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 4,
          width: LOGO_WIDTH,
        }}
      >
        <div
          style={{
            width: LOGO_WIDTH,
            height: LOGO_HEIGHT,
            overflow: "hidden",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Img
            src={BRAND.markSrc}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "contain",
              transform: `scale(${LOGO_ZOOM})`,
              transformOrigin: "center",
            }}
          />
        </div>
        <div
          style={{
            backgroundColor: COLORS.accentRed,
            color: COLORS.white,
            border: `5px solid ${COLORS.ink}`,
            borderRadius: 22,
            padding: "10px 24px",
            fontFamily: FONTS.display,
            fontWeight: 800,
            fontSize: TYPE_SCALE.watermark + 12,
            lineHeight: 1,
            letterSpacing: "0.05em",
            boxShadow: `5px 5px 0 ${COLORS.ink}`,
          }}
        >
          #{String(episodeNumber).padStart(3, "0")}
        </div>
      </div>
    </AbsoluteFill>
  );
};
