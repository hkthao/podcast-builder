import { Mic } from "../stickers";
import { Sparkle, Squiggle, StarSmall, Confetti } from "../doodles";
import { SceneShell, STICKER_BAND, type SceneProps } from "./base";
import { COLORS } from "../../theme";

/**
 * On Air — bố cục mở/nhấn lời nói. Mic to ở giữa + badge "ON AIR" đỏ
 * pulse phía trên + confetti chung quanh. Dùng cho mở đầu/punchline/
 * "tôi cần nói điều này".
 */
export const OnAir: React.FC<SceneProps> = ({
  accentColor,
  audioLevel = 0,
}) => {
  const midY = (STICKER_BAND.yTop + STICKER_BAND.yBottom) / 2;
  return (
    <SceneShell>
      {/* ON AIR badge — đỏ pill, viền navy + glow */}
      <div
        style={{
          position: "absolute",
          left: STICKER_BAND.xCenter,
          top: midY - 280,
          transform: "translate(-50%, -50%)",
        }}
      >
        <div
          style={{
            backgroundColor: COLORS.accentRed,
            color: COLORS.white,
            border: `6px solid ${COLORS.ink}`,
            borderRadius: 22,
            padding: "14px 36px",
            fontFamily: "Inter, sans-serif",
            fontWeight: 900,
            fontSize: 72,
            letterSpacing: "0.12em",
            lineHeight: 1,
            boxShadow: `8px 8px 0 ${COLORS.ink}`,
            textShadow: `2px 2px 0 ${COLORS.ink}`,
          }}
        >
          ON AIR
        </div>
      </div>

      <Mic
        x={STICKER_BAND.xCenter}
        y={midY + 80}
        size={460}
        delay={6}
        accent={accentColor}
        audioLevel={audioLevel}
      />

      <Squiggle
        x={STICKER_BAND.xCenter}
        y={midY + 480}
        size={520}
        color={COLORS.ink}
        delay={4}
      />

      <Confetti x={STICKER_BAND.xCenter - 360} y={midY - 80} size={180} delay={20} />
      <Confetti x={STICKER_BAND.xCenter + 360} y={midY - 60} size={180} delay={24} />
      <Sparkle
        x={STICKER_BAND.xCenter - 280}
        y={midY + 220}
        color={accentColor}
        size={72}
        delay={14}
      />
      <Sparkle
        x={STICKER_BAND.xCenter + 280}
        y={midY + 240}
        color={COLORS.accentTeal}
        size={68}
        delay={18}
      />
      <StarSmall
        x={STICKER_BAND.xCenter}
        y={midY + 400}
        color={COLORS.ink}
        size={52}
        delay={28}
      />
    </SceneShell>
  );
};
