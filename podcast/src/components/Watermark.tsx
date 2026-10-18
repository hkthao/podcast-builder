import { AbsoluteFill, Img, staticFile } from "remotion";
import { FONTS, TYPE_SCALE } from "../theme";
import { channelNameLines, getSeries } from "../series";
import { useLayout } from "../layout";
import { usePalette } from "../palette";

type Props = {
  episodeNumber: number;
  /** Màu chủ đề tập (hex) — nền badge số tập đồng bộ cover/wave/caption. */
  accentColor?: string | null;
  /** Series của tập → logo/tên kênh. */
  series?: string | null;
};

/** Logo height in px — keep ratio (~3:2) → width auto ≈ 1.5× height (~330px). */
const LOGO_HEIGHT = 220;
/** 16:9: logo nhỏ lại (khung thấp 1080px) để không chiếm góc quá nhiều. */
export const LOGO_HEIGHT_LANDSCAPE = 140;

export const Watermark: React.FC<Props> = ({ episodeNumber, accentColor, series }) => {
  const colors = usePalette();
  const brand = getSeries(series);
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
          {brand.markFile ? (
            <Img
              src={staticFile(brand.markFile)}
              style={{
                width: "100%",
                height: "100%",
                objectFit: "contain",
                // Zoom theo series: ByteCast 1.3 cắt hoạ tiết bay quanh paper-card; con dấu sát viền = 1.
                transform: `scale(${brand.markZoom})`,
                transformOrigin: "center",
              }}
            />
          ) : (
            // Series chưa có logo → tên kênh dạng chữ trên thẻ tối (đọc được trên mọi nền).
            <div
              style={{
                backgroundColor: colors.ink,
                borderRadius: Math.round(20 * k),
                padding: `${Math.round(14 * k)}px ${Math.round(22 * k)}px`,
                fontFamily: FONTS.display,
                fontWeight: 800,
                fontSize: Math.round(TYPE_SCALE.watermark * 1.2 * k),
                lineHeight: 1.15,
                textAlign: "center",
                whiteSpace: "nowrap",
                color: colors.white,
              }}
            >
              {channelNameLines(brand).map((line) => (
                <div key={line}>{line}</div>
              ))}
            </div>
          )}
        </div>
        <div
          style={{
            backgroundColor: accentColor || colors.accentRed,
            color: colors.white,
            border: `${Math.round(5 * k)}px solid ${colors.ink}`,
            borderRadius: Math.round(22 * k),
            padding: `${Math.round(10 * k)}px ${Math.round(24 * k)}px`,
            fontFamily: FONTS.display,
            fontWeight: 800,
            fontSize: Math.round((TYPE_SCALE.watermark + 12) * k),
            lineHeight: 1,
            letterSpacing: "0.05em",
            boxShadow: `${Math.round(5 * k)}px ${Math.round(5 * k)}px 0 ${colors.ink}`,
          }}
        >
          #{String(episodeNumber).padStart(3, "0")}
        </div>
      </div>
    </AbsoluteFill>
  );
};
