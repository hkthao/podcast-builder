import { useEffect, useRef, useState } from "react";
import {
  continueRender,
  delayRender,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { COLORS, FONTS, SAFE_ZONE, withAlpha } from "../theme";
import { type Editorial } from "../editorial";

const CHAPTER_SHOW_MS = 5000;
const CHAPTER_FADE_MS = 450;
const CITATION_SHOW_MS = 6500;
const CITATION_FADE_MS = 450;
/**
 * Watermark (logo + badge #) chiếm góc trên-trái tới ~y446, rộng ~340px.
 * Chương né sang phải logo; trích dẫn xuống dưới watermark để không đè nhau.
 */
const WATERMARK_W = 340;
const WATERMARK_BOTTOM = 300;

type Props = {
  editorialSrc: string | null;
  /** Offset (ms) giữa frame 0 của video và mốc 0 transcript. */
  speechOffsetMs: number;
  /**
   * ms khi nội dung chính bắt đầu hiện (= hết intro+hook). Mục nằm trước mốc
   * này (vd chương 1 ở atMs 0) sẽ được dời để hiện KHI nội dung xuất hiện,
   * thay vì bị nuốt trong lúc intro/hook che.
   */
  revealMs: number;
  /** Màu chủ đề tập (hex) — viền + chữ chương đồng bộ cover/wave/caption. */
  accentColor?: string | null;
};

/** Opacity fade-in/out cho một cửa sổ hiển thị [start, start+dur]. */
const windowOpacity = (
  tAdj: number,
  startMs: number,
  durMs: number,
  fadeMs: number,
): number => {
  if (tAdj < startMs || tAdj > startMs + durMs) return 0;
  const fadeIn = interpolate(tAdj, [startMs, startMs + fadeMs], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const fadeOut = interpolate(
    tAdj,
    [startMs + durMs - fadeMs, startMs + durMs],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  return Math.min(fadeIn, fadeOut);
};

export const EditorialOverlay: React.FC<Props> = ({
  editorialSrc,
  speechOffsetMs,
  revealMs,
  accentColor,
}) => {
  const accent = accentColor || COLORS.ink;
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const [editorial, setEditorial] = useState<Editorial | null>(null);
  const handleRef = useRef<number | null>(null);

  useEffect(() => {
    if (!editorialSrc) return;
    handleRef.current = delayRender(`editorial:${editorialSrc}`);
    fetch(staticFile(editorialSrc))
      .then((r) => {
        if (!r.ok) throw new Error(`fetch ${editorialSrc} ${r.status}`);
        return r.json() as Promise<Editorial>;
      })
      .then((e) => {
        setEditorial(e);
        if (handleRef.current !== null) continueRender(handleRef.current);
      })
      .catch((err: unknown) => {
        // Không chặn render nếu editorial hỏng — chỉ bỏ overlay.
        if (handleRef.current !== null) continueRender(handleRef.current);
        void err;
      });
    return () => {
      if (handleRef.current !== null) continueRender(handleRef.current);
    };
  }, [editorialSrc]);

  if (!editorial) return null;
  const tAdj = (frame / fps) * 1000 - speechOffsetMs;

  // Dời mục sớm (trước khi nội dung hiện) về mốc reveal để không bị intro che.
  const effAt = (atMs: number): number => Math.max(atMs, revealMs);

  // Chương đang hiển thị (chỉ hiện ngắn ở đầu mỗi chương).
  const activeChapter = editorial.chapters.find(
    (c) => tAdj >= effAt(c.atMs) && tAdj <= effAt(c.atMs) + CHAPTER_SHOW_MS,
  );
  const chapterOpacity = activeChapter
    ? windowOpacity(
        tAdj,
        effAt(activeChapter.atMs),
        CHAPTER_SHOW_MS,
        CHAPTER_FADE_MS,
      )
    : 0;

  // Trích dẫn đang hiển thị — lấy cái muộn nhất còn trong cửa sổ.
  const activeCitations = editorial.citations.filter(
    (c) => tAdj >= effAt(c.atMs) && tAdj <= effAt(c.atMs) + CITATION_SHOW_MS,
  );
  const activeCitation = activeCitations[activeCitations.length - 1];
  const citationOpacity = activeCitation
    ? windowOpacity(
        tAdj,
        effAt(activeCitation.atMs),
        CITATION_SHOW_MS,
        CITATION_FADE_MS,
      )
    : 0;

  return (
    <>
      {/* Tiêu đề chương — top center */}
      {activeChapter && chapterOpacity > 0 && (
        <div
          style={{
            position: "absolute",
            top: SAFE_ZONE.top + 8,
            // Né logo watermark góc trên-trái → căn giữa trong dải bên phải logo.
            left: SAFE_ZONE.left + WATERMARK_W,
            right: SAFE_ZONE.right,
            display: "flex",
            justifyContent: "center",
            opacity: chapterOpacity,
          }}
        >
          <div
            style={{
              position: "relative",
              display: "flex",
              alignItems: "center",
              gap: 16,
              background: COLORS.white,
              border: `3px solid ${accent}`,
              // Bo tròn kiểu bong bóng chat (góc dưới-trái vuông hơn = phía đuôi).
              borderRadius: "28px 28px 28px 8px",
              padding: "14px 28px",
              boxShadow: `0 8px 22px ${withAlpha(COLORS.ink, 0.2)}`,
              maxWidth: "100%",
            }}
          >
            <span
              style={{
                width: 16,
                height: 16,
                borderRadius: "50%",
                background: accent,
                flexShrink: 0,
              }}
            />
            <span
              style={{
                fontFamily: FONTS.display,
                fontWeight: 800,
                fontSize: 36,
                lineHeight: 1.15,
                color: accent,
                textAlign: "center",
              }}
            >
              {activeChapter.title}
            </span>
            {/* Đuôi bong bóng chat (viền accent + ruột trắng) — góc dưới-trái. */}
            <div
              style={{
                position: "absolute",
                bottom: -17,
                left: 22,
                width: 0,
                height: 0,
                borderLeft: "13px solid transparent",
                borderRight: "13px solid transparent",
                borderTop: `17px solid ${accent}`,
              }}
            />
            <div
              style={{
                position: "absolute",
                bottom: -11,
                left: 25,
                width: 0,
                height: 0,
                borderLeft: "10px solid transparent",
                borderRight: "10px solid transparent",
                borderTop: `13px solid ${COLORS.white}`,
              }}
            />
          </div>
        </div>
      )}

      {/* Trích dẫn có nguồn — upper-left */}
      {activeCitation && citationOpacity > 0 && (
        <div
          style={{
            position: "absolute",
            // Dưới watermark (logo+badge) để không đè nhau ở góc trên-trái.
            top: SAFE_ZONE.top + WATERMARK_BOTTOM,
            left: SAFE_ZONE.left,
            maxWidth: 620,
            opacity: citationOpacity,
          }}
        >
          <div
            style={{
              position: "relative",
              display: "inline-block",
              background: COLORS.white,
              border: `3px solid ${accent}`,
              // Bong bóng chat, đuôi ở góc dưới-trái.
              borderRadius: "28px 28px 28px 8px",
              padding: "16px 26px",
              boxShadow: `0 8px 22px ${withAlpha(COLORS.ink, 0.2)}`,
            }}
          >
            <div
              style={{
                fontFamily: FONTS.display,
                fontWeight: 800,
                fontSize: 40,
                lineHeight: 1.1,
                color: COLORS.ink,
              }}
            >
              {activeCitation.name}
            </div>
            {activeCitation.source && (
              <div
                style={{
                  fontFamily: FONTS.body,
                  fontWeight: 600,
                  fontSize: 26,
                  lineHeight: 1.2,
                  color: accent,
                  marginTop: 4,
                }}
              >
                {activeCitation.source}
              </div>
            )}
            {/* Đuôi bong bóng chat — góc dưới-trái. */}
            <div
              style={{
                position: "absolute",
                bottom: -17,
                left: 24,
                width: 0,
                height: 0,
                borderLeft: "13px solid transparent",
                borderRight: "13px solid transparent",
                borderTop: `17px solid ${accent}`,
              }}
            />
            <div
              style={{
                position: "absolute",
                bottom: -11,
                left: 27,
                width: 0,
                height: 0,
                borderLeft: "10px solid transparent",
                borderRight: "10px solid transparent",
                borderTop: `13px solid ${COLORS.white}`,
              }}
            />
          </div>
        </div>
      )}
    </>
  );
};
