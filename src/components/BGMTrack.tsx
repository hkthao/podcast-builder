import { useEffect, useMemo, useRef, useState } from "react";
import {
  Audio,
  cancelRender,
  continueRender,
  delayRender,
  interpolate,
  staticFile,
  useVideoConfig,
} from "remotion";
import type { Transcript } from "../../scripts/transcribe";

const DUCK_FACTOR = 0.35;
const DUCK_RAMP_MS = 150;
const OUTRO_FADE_MS = 2000;

type SpeechRange = { startMs: number; endMs: number };

const dbToGain = (db: number): number => Math.pow(10, db / 20);

const buildSpeechRanges = (transcript: Transcript): SpeechRange[] => {
  const ranges: SpeechRange[] = [];
  for (const item of transcript.transcription) {
    if (item.text.trim().length === 0) continue;
    const last = ranges[ranges.length - 1];
    if (last && item.offsets.from - last.endMs < 500) {
      last.endMs = item.offsets.to;
    } else {
      ranges.push({ startMs: item.offsets.from, endMs: item.offsets.to });
    }
  }
  return ranges;
};

type Props = {
  bgmSrc: string;
  transcriptSrc: string | null;
  baseVolumeDb: number;
  /** ms từ đầu video — BGM sẽ fade out trong window này về cuối. */
  fadeOutFromMs: number;
  /** Offset (ms) giữa frame 0 của video và mốc 0 của transcript (= intro+hook). */
  speechOffsetMs: number;
};

export const BGMTrack: React.FC<Props> = ({
  bgmSrc,
  transcriptSrc,
  baseVolumeDb,
  fadeOutFromMs,
  speechOffsetMs,
}) => {
  const { fps, durationInFrames } = useVideoConfig();
  const [transcript, setTranscript] = useState<Transcript | null>(null);
  const handleRef = useRef<number | null>(null);

  useEffect(() => {
    if (!transcriptSrc) return;
    handleRef.current = delayRender(`bgm:${transcriptSrc}`);
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

  const speechRanges = useMemo(
    () => (transcript ? buildSpeechRanges(transcript) : []),
    [transcript],
  );

  const totalMs = (durationInFrames / fps) * 1000;
  const baseGain = dbToGain(baseVolumeDb);

  const volume = (frame: number): number => {
    const t = (frame / fps) * 1000;
    const outroGain =
      t >= totalMs - OUTRO_FADE_MS
        ? interpolate(t, [totalMs - OUTRO_FADE_MS, totalMs], [1, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          })
        : 1;
    const fadeOutGain =
      t >= fadeOutFromMs
        ? interpolate(t, [fadeOutFromMs, totalMs], [1, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          })
        : 1;

    let speechGain = 1;
    if (speechRanges.length > 0) {
      const tAdj = t - speechOffsetMs;
      let nearest = 0;
      for (const r of speechRanges) {
        if (tAdj >= r.startMs - DUCK_RAMP_MS && tAdj <= r.endMs + DUCK_RAMP_MS) {
          const fadeIn = interpolate(
            tAdj,
            [r.startMs - DUCK_RAMP_MS, r.startMs + DUCK_RAMP_MS],
            [1, DUCK_FACTOR],
            { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
          );
          const fadeOut = interpolate(
            tAdj,
            [r.endMs - DUCK_RAMP_MS, r.endMs + DUCK_RAMP_MS],
            [DUCK_FACTOR, 1],
            { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
          );
          nearest = Math.min(fadeIn, fadeOut);
          break;
        }
      }
      speechGain = speechRanges.some(
        (r) => tAdj >= r.startMs && tAdj < r.endMs,
      )
        ? DUCK_FACTOR
        : nearest || 1;
    }

    return baseGain * speechGain * fadeOutGain * Math.min(1, outroGain);
  };

  return <Audio src={staticFile(bgmSrc)} volume={volume} loop />;
};
