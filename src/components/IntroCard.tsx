import { AbsoluteFill, Img, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { BRAND, COLORS, FONTS, FPS } from "../theme";
import { StickerText } from "./StickerText";
import { Sparkle, StarSmall } from "./doodles";

/**
 * Cover 3s — TITLE LÀ HERO. Reel/Shorts/TikTok viewer cần biết chủ đề trong 1s đầu.
 * Brand mark thu nhỏ ở góc trên; episode badge nhỏ dưới; title chia 1–3 line với
 * line giữa được phóng to + tô coral để nhấn từ khoá. Tái dùng cho mọi tập:
 * input chỉ là `title` + `episodeNumber` từ episode.json.
 */
export const INTRO_DURATION_FRAMES = Math.round(FPS * 3.0);

const T = {
  /** Underline doodle scaleX — emphasis line only, sau khi title đã visible. */
  underlineIn: 10,
  underlineSettle: 28,
  /** Badge slide từ dưới. */
  badge: 20,
  outStart: INTRO_DURATION_FRAMES - 16,
} as const;

type Props = {
  title: string;
  episodeNumber: number;
};

/** Chia title thành 1–3 line theo dấu phẩy hoặc đếm từ. Line giữa = nhấn. */
const splitIntoLines = (title: string): string[] => {
  const cleaned = title.trim();
  if (cleaned.includes(",")) {
    const parts = cleaned.split(",").map((s) => s.trim()).filter(Boolean);
    return parts.slice(0, 3);
  }
  const words = cleaned.split(/\s+/);
  if (words.length <= 4) return [cleaned];
  if (words.length <= 8) {
    const mid = Math.ceil(words.length / 2);
    return [words.slice(0, mid).join(" "), words.slice(mid).join(" ")];
  }
  const third = Math.ceil(words.length / 3);
  return [
    words.slice(0, third).join(" "),
    words.slice(third, third * 2).join(" "),
    words.slice(third * 2).join(" "),
  ];
};

export const IntroCard: React.FC<Props> = ({ title, episodeNumber }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const lines = splitIntoLines(title);
  const emphasisIdx = Math.floor(lines.length / 2);

  // Underline doodle reveal cho emphasis line (animation duy nhất trên title).
  const underlineScale = interpolate(
    frame,
    [T.underlineIn, T.underlineSettle],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  // Emphasis line pulse nhẹ frame 4-16 để thu hút mắt (scale 1.0 → 1.05 → 1.0).
  const emphasisPulse = interpolate(
    frame,
    [4, 10, 18],
    [1, 1.06, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  const badgeSpring = spring({
    frame: frame - T.badge,
    fps,
    config: { damping: 13, mass: 0.7, stiffness: 110 },
    durationInFrames: 18,
  });
  const outOpacity = interpolate(
    frame,
    [T.outStart, INTRO_DURATION_FRAMES],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  // Title line font size theo độ dài line, emphasis = lớn nhất.
  const fontSizeFor = (text: string, isEmphasis: boolean): number => {
    const len = text.length;
    if (isEmphasis) {
      if (len <= 12) return 130;
      if (len <= 18) return 110;
      return 88;
    }
    if (len <= 14) return 84;
    if (len <= 20) return 72;
    return 60;
  };

  return (
    <AbsoluteFill
      style={{
        backgroundColor: COLORS.bg,
        paddingLeft: 60,
        paddingRight: 60,
        opacity: outOpacity,
      }}
    >
      {/* Decoration sparkles ở 4 góc */}
      <Sparkle x={140} y={200} color={COLORS.accentRed} size={70} delay={0} />
      <StarSmall x={940} y={280} color={COLORS.accentBlue} size={56} delay={6} />
      <Sparkle x={920} y={1640} color={COLORS.accentTeal} size={64} delay={10} />
      <StarSmall x={140} y={1520} color={COLORS.ink} size={54} delay={14} />

      {/* Brand mark — góc trên-giữa, thu nhỏ, visible từ frame 0 */}
      <div
        style={{
          position: "absolute",
          top: 200,
          left: 0,
          right: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 8,
        }}
      >
        <Img
          src={BRAND.logoSrc}
          style={{ width: 380, height: 240, objectFit: "contain" }}
        />
      </div>

      {/* Title — hero center */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 22,
          paddingTop: 200,
        }}
      >
        {lines.map((line, i) => {
          const isEmphasis = i === emphasisIdx && lines.length > 1;
          // Title VISIBLE từ frame 0; chỉ emphasis line pulse nhẹ.
          const scale = isEmphasis ? emphasisPulse : 1;
          return (
            <div key={i} style={{ transform: `scale(${scale})` }}>
              <StickerText
                fontSize={fontSizeFor(line, isEmphasis)}
                color={isEmphasis ? COLORS.accentRed : COLORS.ink}
                outlineWidth={isEmphasis ? 14 : 10}
                shadowOffset={isEmphasis ? 14 : 9}
              >
                {line}
              </StickerText>
              {isEmphasis ? (
                <div
                  style={{
                    display: "flex",
                    justifyContent: "center",
                    marginTop: 12,
                  }}
                >
                  <svg
                    width={480}
                    height={26}
                    style={{
                      transform: `scaleX(${underlineScale})`,
                      transformOrigin: "center",
                      display: "block",
                    }}
                  >
                    <path
                      d="M 16 14 Q 120 4 240 12 Q 360 22 464 8"
                      stroke={COLORS.accentRed}
                      strokeWidth={9}
                      fill="none"
                      strokeLinecap="round"
                    />
                  </svg>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      {/* Episode badge — bottom */}
      <div
        style={{
          position: "absolute",
          bottom: 220,
          left: 0,
          right: 0,
          display: "flex",
          justifyContent: "center",
          transform: `translateY(${interpolate(badgeSpring, [0, 1], [50, 0])}px)`,
          opacity: badgeSpring,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            backgroundColor: COLORS.ink,
            color: COLORS.bg,
            fontFamily: FONTS.body,
            fontWeight: 700,
            fontSize: 32,
            letterSpacing: "0.14em",
            padding: "12px 28px",
            borderRadius: 999,
            transform: "rotate(-2deg)",
            boxShadow: `5px 5px 0 ${COLORS.accentRed}`,
          }}
        >
          TẬP #{String(episodeNumber).padStart(3, "0")}
        </div>
      </div>
    </AbsoluteFill>
  );
};
