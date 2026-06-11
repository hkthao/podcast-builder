import { AbsoluteFill, Img } from "remotion";
import { Background } from "./components/Background";
import { BRAND, COLORS, FONTS, FORMAT, FPS, TYPE_SCALE } from "./theme";

export const Video: React.FC = () => {
  return (
    <AbsoluteFill>
      <Background />
      <AbsoluteFill
        style={{
          alignItems: "center",
          justifyContent: "center",
          gap: 32,
        }}
      >
        <Img src={BRAND.logoSrc} style={{ width: 160, height: 160 }} />
        <div
          style={{
            fontFamily: FONTS.display,
            color: COLORS.signature,
            fontSize: TYPE_SCALE.title,
            letterSpacing: "-0.01em",
          }}
        >
          {BRAND.channelName}
        </div>
        <div
          style={{
            fontFamily: FONTS.body,
            color: COLORS.textMuted,
            fontSize: TYPE_SCALE.meta,
          }}
        >
          {FORMAT.width}×{FORMAT.height} · {FPS} fps
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
