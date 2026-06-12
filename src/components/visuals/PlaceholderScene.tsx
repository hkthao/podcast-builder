import { AbsoluteFill, interpolate } from "remotion";
import { COLORS, FONTS, MOOD_ACCENTS, type MoodKey, withAlpha } from "../../theme";

type Props = {
  index: number;
  mood: MoodKey;
  prompt: string;
  text: string;
  progress: number;
};

/**
 * Hiển thị khi chưa có ảnh AI cho cảnh (assets/images-cache/<hash>.png chưa tồn tại).
 * Cho người xem thấy "đây là cảnh số mấy + prompt sẽ dùng" — KHÔNG phải fallback đẹp,
 * mà là indicator để dev biết cảnh nào còn thiếu ảnh.
 */
export const PlaceholderScene: React.FC<Props> = ({
  index,
  mood,
  prompt,
  text,
  progress,
}) => {
  const accent = MOOD_ACCENTS[mood];
  const breathe = Math.sin(progress * Math.PI * 4) * 0.5 + 0.5;
  const opacity = interpolate(progress, [0, 0.1, 0.9, 1], [0, 1, 1, 0.85]);
  const snippet = prompt.replace(/^Create a cinematic[^"]*"/, "").replace(/".*$/, "").slice(0, 240);

  return (
    <AbsoluteFill
      style={{
        opacity,
        backgroundColor: COLORS.bg,
        background: `radial-gradient(ellipse at 50% 40%,
          ${withAlpha(accent, 0.22 + breathe * 0.06)} 0%,
          ${withAlpha(accent, 0.06)} 45%,
          ${COLORS.bg} 100%)`,
        alignItems: "center",
        justifyContent: "center",
        padding: 80,
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 40,
          maxWidth: 880,
          textAlign: "center",
        }}
      >
        <div
          style={{
            fontFamily: FONTS.body,
            color: COLORS.textMuted,
            fontSize: 28,
            letterSpacing: "0.15em",
            textTransform: "uppercase",
          }}
        >
          Scene · {String(index).padStart(2, "0")} · {mood}
        </div>
        <div
          style={{
            width: 200,
            height: 2,
            background: accent,
            opacity: 0.4,
          }}
        />
        <div
          style={{
            fontFamily: FONTS.display,
            color: COLORS.signature,
            fontSize: 44,
            lineHeight: 1.3,
            letterSpacing: "-0.01em",
          }}
        >
          {text.slice(0, 180)}{text.length > 180 ? "…" : ""}
        </div>
        <div
          style={{
            fontFamily: FONTS.body,
            color: COLORS.textMuted,
            fontSize: 22,
            lineHeight: 1.5,
            maxWidth: 720,
            opacity: 0.7,
          }}
        >
          {snippet}
        </div>
        <div
          style={{
            fontFamily: FONTS.body,
            color: withAlpha(COLORS.signature, 0.5),
            fontSize: 20,
            marginTop: 20,
          }}
        >
          [chưa có ảnh AI — chạy `npm run gen-images`]
        </div>
      </div>
    </AbsoluteFill>
  );
};
