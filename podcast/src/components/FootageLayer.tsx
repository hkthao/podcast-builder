import {
  AbsoluteFill,
  OffthreadVideo,
  Sequence,
  interpolate,
  staticFile,
  useCurrentFrame,
} from "remotion";
import { COLORS } from "../theme";

/**
 * Lớp footage nền động — dùng clip tự quay (đã bỏ tiếng + chậm 0.7×, xem
 * prep-footage.ts) làm NỀN đã xử lý dưới lớp caption/biên tập, thay nền vàng
 * ở các tập bật footage. Mục tiêu ORIGINALITY: đưa video thật ("filmed by you")
 * vào khung hình → tín hiệu "production value/filmed by you" của Meta.
 * Xem docs/originality-upgrade-plan.md §3.2.
 *
 * Xử lý ngay tại render (giữ file gốc sạch): blur nhẹ + tối đi + phủ gradient
 * màu ink thương hiệu → chữ trắng/thẻ caption vẫn đọc rõ, footage vẫn thấy là
 * video thật (còn chuyển động).
 */

export type FootageClip = { src: string; durationMs: number };

type Props = {
  clips: FootageClip[];
  fps: number;
  /** Cửa sổ nội dung chính — footage chỉ chạy trong đây. */
  mainStartMs: number;
  mainEndMs: number;
};

const MAX_SEG_MS = 16000; // mỗi clip hiện tối đa 16s rồi chuyển
const MIN_SEG_MS = 4000;
const CROSSFADE_MS = 800;

// Treatment NHẸ — giữ màu gốc của cảnh (chữ đọc rõ vì nằm trên thẻ riêng).
const BLUR_PX = 2;
const BRIGHTNESS = 0.9;
// Phủ ink (22,36,79) mỏng — đậm nhẹ ở trên/dưới (nơi có chapter + caption).
const inkA = (a: number) => `rgba(22,36,79,${a})`;
const OVERLAY = `linear-gradient(180deg, ${inkA(0.34)} 0%, ${inkA(0.16)} 32%, ${inkA(0.18)} 62%, ${inkA(0.3)} 100%)`;

type Seg = { src: string; startMs: number; endMs: number };

const buildSegments = (
  clips: FootageClip[],
  mainStartMs: number,
  mainEndMs: number,
): Seg[] => {
  const segs: Seg[] = [];
  if (clips.length === 0 || mainEndMs <= mainStartMs) return segs;
  let t = mainStartMs;
  let i = 0;
  // Backstop tránh vòng lặp vô hạn nếu số liệu bất thường.
  while (t < mainEndMs && segs.length < 400) {
    const clip = clips[i % clips.length];
    const segLen = Math.max(
      MIN_SEG_MS,
      Math.min(clip.durationMs, MAX_SEG_MS),
    );
    const endMs = Math.min(t + segLen, mainEndMs);
    segs.push({ src: clip.src, startMs: t, endMs });
    // Chồng lấn CROSSFADE_MS để mờ chồng giữa 2 clip.
    t = endMs - CROSSFADE_MS;
    i++;
  }
  return segs;
};

export const FootageLayer: React.FC<Props> = ({
  clips,
  fps,
  mainStartMs,
  mainEndMs,
}) => {
  const segs = buildSegments(clips, mainStartMs, mainEndMs);
  const msToFrame = (ms: number) => Math.round((ms / 1000) * fps);

  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.ink }}>
      {segs.map((seg, idx) => {
        const fromF = msToFrame(seg.startMs);
        const durF = Math.max(1, msToFrame(seg.endMs) - fromF);
        const fadeF = Math.round((CROSSFADE_MS / 1000) * fps);
        return (
          <Sequence
            key={`${seg.src}-${idx}`}
            from={fromF}
            durationInFrames={durF}
            layout="none"
          >
            <FootageSegment src={seg.src} durF={durF} fadeF={fadeF} />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};

const FootageSegment: React.FC<{ src: string; durF: number; fadeF: number }> = ({
  src,
  durF,
  fadeF,
}) => {
  return (
    <SegmentOpacity durF={durF} fadeF={fadeF}>
      <AbsoluteFill>
        <OffthreadVideo
          src={staticFile(src)}
          muted
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            filter: `blur(${BLUR_PX}px) brightness(${BRIGHTNESS}) saturate(0.92)`,
            transform: "scale(1.06)", // che mép blur
          }}
        />
        <AbsoluteFill style={{ background: OVERLAY }} />
      </AbsoluteFill>
    </SegmentOpacity>
  );
};

/** Fade in/out opacity cho crossfade giữa các segment. */
const SegmentOpacity: React.FC<{
  durF: number;
  fadeF: number;
  children: React.ReactNode;
}> = ({ durF, fadeF, children }) => {
  const f = useCurrentFrame();
  const opacity = interpolate(
    f,
    [0, fadeF, durF - fadeF, durF],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  return <AbsoluteFill style={{ opacity }}>{children}</AbsoluteFill>;
};
