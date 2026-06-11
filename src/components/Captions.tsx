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
import { createTikTokStyleCaptions, type Caption, type TikTokPage } from "@remotion/captions";
import { COLORS, FONTS, SAFE_ZONE, TYPE_SCALE, withAlpha } from "../theme";
import type { Transcript } from "../../scripts/transcribe";

type Props = {
  transcriptSrc: string | null;
  /** Khoảng thời gian (ms) ẨN caption — để Hook hiển thị riêng. */
  hideRanges?: ReadonlyArray<{ startMs: number; endMs: number }>;
};

const COMBINE_TOKENS_MS = 1200;

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

  const pages = useMemo<TikTokPage[]>(() => {
    if (!transcript) return [];
    const captions: Caption[] = transcript.transcription
      .filter((item) => item.text.trim().length > 0)
      .map((item) => ({
        text: item.text,
        startMs: item.offsets.from,
        endMs: item.offsets.to,
        timestampMs: item.offsets.from,
        confidence: item.tokens[0]?.p ?? null,
      }));
    return createTikTokStyleCaptions({
      captions,
      combineTokensWithinMilliseconds: COMBINE_TOKENS_MS,
    }).pages;
  }, [transcript]);

  if (!transcriptSrc || pages.length === 0) return null;

  const currentMs = (frame / fps) * 1000;

  if (hideRanges?.some((r) => currentMs >= r.startMs && currentMs < r.endMs)) {
    return null;
  }

  const page = pages.find(
    (p) => currentMs >= p.startMs && currentMs < p.startMs + p.durationMs,
  );
  if (!page) return null;

  const fadeWindow = 120;
  const localMs = currentMs - page.startMs;
  const remainingMs = page.durationMs - localMs;
  const opacity = Math.min(1, localMs / fadeWindow, remainingMs / fadeWindow);

  return (
    <AbsoluteFill
      style={{
        alignItems: "center",
        justifyContent: "flex-end",
        paddingBottom: SAFE_ZONE.bottom,
        paddingLeft: SAFE_ZONE.left,
        paddingRight: SAFE_ZONE.right,
      }}
    >
      <div
        style={{
          opacity,
          maxWidth: "100%",
          textAlign: "center",
          fontFamily: FONTS.body,
          fontWeight: 500,
          fontSize: TYPE_SCALE.caption,
          lineHeight: 1.3,
          color: COLORS.textPrimary,
          textShadow: `0 2px 12px ${withAlpha("#000000", 0.5)}`,
        }}
      >
        {page.text.trim()}
      </div>
    </AbsoluteFill>
  );
};
