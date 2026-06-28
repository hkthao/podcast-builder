import { useEffect, useMemo, useRef, useState } from "react";
import {
  AbsoluteFill,
  cancelRender,
  continueRender,
  delayRender,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { COLORS, FONTS, SAFE_ZONE, TYPE_SCALE } from "../theme";
import type { Transcript } from "../../../shared/transcribe/transcribe";

/** Padding-bottom = SAFE_ZONE.bottom (380px) — FB Reels caption + user info + title đè bottom ~380px. */
const CAPTION_PADDING_BOTTOM = SAFE_ZONE.bottom;

type Props = {
  transcriptSrc: string | null;
  hideRanges?: ReadonlyArray<{ startMs: number; endMs: number }>;
};

type Page = {
  text: string;
  startMs: number;
  endMs: number;
};

const MAX_WORDS = 8;
const MIN_DURATION_MS = 600;
const MAX_DURATION_MS = 4500;
const GAP_BREAK_MS = 1200;

// Tất cả regex có ký tự non-ASCII build qua `new RegExp(string)` để tránh
// U+2028/U+2029 (line/para separator — line terminator trong JS) làm vỡ
// regex literal parser.
const SENTENCE_END = new RegExp(
  '[.!?\\u2026][\\s"\'\\u201C\\u201D\\u2018\\u2019)]*$',
);
const QUOTES_RE = new RegExp(
  '^["\'\\u201C\\u201D\\u2018\\u2019]+|["\'\\u201C\\u201D\\u2018\\u2019]+$',
  "g",
);
const REPLACEMENT_RE = new RegExp("[\\uFFFD\\u00AD]+", "g");
const LINE_SEP_RE = new RegExp("[\\u2028\\u2029]", "g");
const DUP_QUOTE_RE = /"{2,}/g;

const cleanText = (s: string): string =>
  s
    .replace(REPLACEMENT_RE, "")
    .replace(LINE_SEP_RE, " ")
    .replace(DUP_QUOTE_RE, " ")
    .replace(QUOTES_RE, "")
    .replace(/\s+/g, " ")
    .trim();

const splitLongPage = (
  rawText: string,
  startMs: number,
  endMs: number,
): Page[] => {
  const cleaned = cleanText(rawText);
  if (!cleaned) return [];
  const words = cleaned.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  if (words.length <= MAX_WORDS) {
    return [{ text: words.join(" "), startMs, endMs }];
  }
  const duration = endMs - startMs;
  const total = words.length;
  const out: Page[] = [];
  for (let i = 0; i < total; i += MAX_WORDS) {
    const end = Math.min(i + MAX_WORDS, total);
    const chunk = words.slice(i, end).join(" ");
    const chunkStart = startMs + (i / total) * duration;
    const chunkEnd = startMs + (end / total) * duration;
    out.push({ text: chunk, startMs: chunkStart, endMs: chunkEnd });
  }
  return out;
};

const chunkBySentence = (transcript: Transcript): Page[] => {
  const segments = transcript.transcription.filter(
    (s) => s.text.trim().length > 0,
  );
  if (segments.length === 0) return [];

  const pages: Page[] = [];
  let bufText = "";
  let bufStart = segments[0]!.offsets.from;
  let bufEnd = segments[0]!.offsets.to;
  let prevEnd = segments[0]!.offsets.from;
  let hasBuf = false;

  const wordCount = (s: string) =>
    s.trim().split(/\s+/).filter(Boolean).length;

  const flushBuf = () => {
    if (!hasBuf) return;
    const subPages = splitLongPage(bufText, bufStart, bufEnd);
    for (const p of subPages) {
      const prev = pages[pages.length - 1];
      if (
        prev &&
        p.endMs - p.startMs < MIN_DURATION_MS &&
        p.startMs - prev.endMs < 500
      ) {
        prev.endMs = p.endMs;
        prev.text = `${prev.text} ${p.text}`.trim();
      } else {
        pages.push(p);
      }
    }
    bufText = "";
    hasBuf = false;
  };

  for (const seg of segments) {
    if (!hasBuf) {
      bufStart = seg.offsets.from;
      hasBuf = true;
    } else {
      const gap = seg.offsets.from - prevEnd;
      if (gap >= GAP_BREAK_MS) {
        flushBuf();
        bufStart = seg.offsets.from;
        hasBuf = true;
      }
    }
    bufText += seg.text;
    bufEnd = seg.offsets.to;
    prevEnd = seg.offsets.to;

    const wc = wordCount(bufText);
    const dur = bufEnd - bufStart;
    const endsSentence = SENTENCE_END.test(bufText.trimEnd());
    if (endsSentence || wc >= MAX_WORDS * 2 || dur >= MAX_DURATION_MS) {
      flushBuf();
    }
  }
  flushBuf();
  return pages;
};

export const Captions: React.FC<Props> = ({ transcriptSrc, hideRanges }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const [transcript, setTranscript] = useState<Transcript | null>(null);
  const handleRef = useRef<number | null>(null);

  useEffect(() => {
    if (!transcriptSrc) return;
    handleRef.current = delayRender(`captions:${transcriptSrc}`);
    fetch(staticFile(transcriptSrc))
      .then((r) => {
        if (!r.ok) throw new Error(`fetch ${transcriptSrc} ${r.status}`);
        return r.json() as Promise<Transcript>;
      })
      .then((t) => {
        setTranscript(t);
        if (handleRef.current !== null) continueRender(handleRef.current);
      })
      .catch((e: unknown) => {
        if (handleRef.current !== null) cancelRender(e);
      });
    return () => {
      if (handleRef.current !== null) continueRender(handleRef.current);
    };
  }, [transcriptSrc]);

  const pages = useMemo<Page[]>(() => {
    if (!transcript) return [];
    return chunkBySentence(transcript);
  }, [transcript]);

  if (!transcriptSrc || pages.length === 0) return null;

  const currentMs = (frame / fps) * 1000;

  if (hideRanges?.some((r) => currentMs >= r.startMs && currentMs < r.endMs)) {
    return null;
  }

  const page = pages.find((p) => currentMs >= p.startMs && currentMs < p.endMs);
  if (!page) return null;

  const fadeWindow = 100;
  const localMs = currentMs - page.startMs;
  const durationMs = page.endMs - page.startMs;
  const remainingMs = durationMs - localMs;
  const fadeIn = Math.min(1, localMs / fadeWindow);
  const fadeOut = Math.min(1, remainingMs / fadeWindow);
  const opacity = Math.min(fadeIn, fadeOut);

  const scale = 0.94 + Math.min(1, localMs / 180) * 0.06;

  const wc = page.text.split(/\s+/).filter(Boolean).length;
  const fontSize = wc > 7 ? 56 : wc > 5 ? 62 : TYPE_SCALE.caption;

  return (
    <AbsoluteFill
      style={{
        alignItems: "center",
        justifyContent: "flex-end",
        paddingBottom: CAPTION_PADDING_BOTTOM,
        paddingLeft: SAFE_ZONE.left,
        paddingRight: SAFE_ZONE.right,
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          opacity,
          transform: `scale(${scale})`,
          backgroundColor: COLORS.white,
          border: `5px solid ${COLORS.ink}`,
          borderRadius: 28,
          padding: "20px 36px",
          maxWidth: "100%",
          boxShadow: `6px 6px 0 ${COLORS.ink}`,
        }}
      >
        <div
          style={{
            textAlign: "center",
            fontFamily: FONTS.display,
            fontWeight: 700,
            fontSize,
            lineHeight: 1.25,
            color: COLORS.ink,
            letterSpacing: "-0.01em",
          }}
        >
          {page.text}
        </div>
      </div>
    </AbsoluteFill>
  );
};
