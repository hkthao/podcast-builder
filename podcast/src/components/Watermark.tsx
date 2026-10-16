import { AbsoluteFill, Img } from "remotion";
import { BRAND, COLORS, FONTS, TYPE_SCALE } from "../theme";
import { useLayout } from "../layout";

type Props = {
  episodeNumber: number;
  /** Màu chủ đề tập (hex) — nền badge số tập đồng bộ cover/wave/caption. */
  accentColor?: string | null;
};

/** Logo height in px — keep ratio (~3:2) → width auto ≈ 1.5× height (~330px). */
const LOGO_HEIGHT = 220;
/** 16:9: logo nhỏ lại (khung thấp 1080px) để không chiếm góc quá nhiều. */
export const LOGO_HEIGHT_LANDSCAPE = 140;
/**
 * Crop PNG decorations (heart/cloud/stars float xung quanh paper-card) bằng
 * cách zoom in 1.3× + overflow:hidden. Brand text "ByteCast Tech" được zoom
 * theo → đọc to hơn, đẹp hơn. Decorations bị clip ra ngoài.
 */
const LOGO_ZOOM = 1.3;

export const Watermark: React.FC<Props> = ({ episodeNumber, accentColor }) => {
  const { landscape, safe } = useLayout();
  const logoH = landscape ? LOGO_HEIGHT_LANDSCAPE : LOGO_HEIGHT;
  const logoW = logoH * 1.5;
  const k = logoH / LOGO_HEIGHT; // co badge theo logo
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
          top: safe.top,
          left: safe.left,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 4,
          width: logoW,
        }}
      >
        <div
          style={{
            width: logoW,
            height: logoH,
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
            backgroundColor: accentColor || COLORS.accentRed,
            color: COLORS.white,
            border: `${Math.round(5 * k)}px solid ${COLORS.ink}`,
            borderRadius: Math.round(22 * k),
            padding: `${Math.round(10 * k)}px ${Math.round(24 * k)}px`,
            fontFamily: FONTS.display,
            fontWeight: 800,
            fontSize: Math.round((TYPE_SCALE.watermark + 12) * k),
            lineHeight: 1,
            letterSpacing: "0.05em",
            boxShadow: `${Math.round(5 * k)}px ${Math.round(5 * k)}px 0 ${COLORS.ink}`,
          }}
        >
          #{String(episodeNumber).padStart(3, "0")}
        </div>
      </div>
    </AbsoluteFill>
  );
};
