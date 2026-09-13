import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

/**
 * 2-pass footage: ghép nền footage (ffmpeg) + lớp đồ hoạ trong suốt (Remotion
 * ProRes 4444 alpha). Tránh Remotion giải mã footage (crash render dài). Đây là
 * cách reel dùng — ffmpeg xử lý video native, ổn định. Xem make.ts.
 */

const ffprobeSec = (f: string): number => {
  try {
    return (
      Number(
        execFileSync(
          "ffprobe",
          ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", f],
          { encoding: "utf-8" },
        ).trim(),
      ) || 0
    );
  } catch {
    return 0;
  }
};

/**
 * Treatment nền footage — mặc định TẮT (giữ CHẤT LƯỢNG GỐC của cảnh Pexels).
 * Chữ vẫn đọc rõ vì caption/chapter nằm trên THẺ riêng có nền. Bật lại qua env
 * nếu muốn (blur/tối/phủ ink). 0 = tắt hoàn toàn phần đó.
 */
const FOOTAGE_BLUR = Number(process.env.FOOTAGE_BLUR ?? 0); // 0 = không blur
const FOOTAGE_BRIGHTNESS = Number(process.env.FOOTAGE_BRIGHTNESS ?? 0); // 0 = giữ nguyên
const FOOTAGE_SATURATION = Number(process.env.FOOTAGE_SATURATION ?? 1); // 1 = giữ nguyên
const FOOTAGE_INK = Number(process.env.FOOTAGE_INK ?? 0); // 0 = không phủ ink

/**
 * Color grade THEO MÀU CHỦ ĐỀ (accentColor) — đẩy TÔNG footage về phía màu chủ
 * đạo để đồng bộ cover + wave, NHƯNG giữ ảnh hiện rõ (không phủ màu đặc). Dùng
 * `colorbalance` (dịch cân bằng màu ở mid/high theo hướng lệch màu của theme) +
 * hạ nhẹ saturation để màu native (vd xanh rừng) bớt "chọi". KHÔNG làm tối.
 * BÀI HỌC: blend/overlay màu đặc (softlight/normal) kể cả opacity thấp vẫn phủ
 * đỏ kín ảnh → hỏng. colorbalance mới là grade thật.
 * Tắt: không truyền themeColor, hoặc FOOTAGE_GRADE=0.
 */
// MẶC ĐỊNH TẮT grade (user chốt: GIỮ FOOTAGE MÀU TỰ NHIÊN; sự đồng bộ màu chủ
// đề đến từ việc CHỌN cảnh có màu hợp theme — hoa/đất/hoàng hôn… ở footage-plan.ts,
// KHÔNG nhuộm màu). Bật lại bằng FOOTAGE_GRADE>0 nếu muốn thử grade.
const FOOTAGE_GRADE = Number(process.env.FOOTAGE_GRADE ?? 0); // 0 = tắt (mặc định); 1 = mức chuẩn
const FOOTAGE_DESAT = Number(process.env.FOOTAGE_DESAT ?? 0.84); // chỉ dùng khi FOOTAGE_GRADE>0

/**
 * Từ hex màu chủ đề → chuỗi filter `colorbalance` dịch mid/high theo HƯỚNG LỆCH
 * màu của theme (kênh nào cao hơn trung bình thì đẩy lên, thấp hơn thì hạ) →
 * ảnh ngả về tông theme. strength scale toàn bộ. "" nếu hex sai / strength≤0.
 */
const themeColorbalance = (hex: string | null | undefined, strength: number): string => {
  const m = (hex ?? "").trim().replace(/^#/, "").match(/^([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})/);
  if (!m || strength <= 0) return "";
  const r = parseInt(m[1], 16) / 255;
  const g = parseInt(m[2], 16) / 255;
  const b = parseInt(m[3], 16) / 255;
  const avg = (r + g + b) / 3;
  const dr = r - avg, dg = g - avg, db = b - avg; // hướng lệch màu (tổng = 0)
  const kMid = 0.49 * strength, kHi = 0.35 * strength;
  const f = (x: number) => x.toFixed(3);
  return (
    `colorbalance=rm=${f(dr * kMid)}:gm=${f(dg * kMid)}:bm=${f(db * kMid)}` +
    `:rh=${f(dr * kHi)}:gh=${f(dg * kHi)}:bh=${f(db * kHi)}`
  );
};

export type FootageBgOpts = {
  /** Màu chủ đề (hex) — grade footage đồng bộ cover/wave. Bỏ trống = giữ màu gốc. */
  themeColor?: string | null;
};

/**
 * Dựng NỀN footage dài durationSec từ các clip nối theo thứ tự, crop cover
 * 1080×1920. Nếu tổng clip ≥ durationSec → mỗi clip hiện ĐÚNG 1 LẦN (không lặp);
 * thiếu thì mới lặp cho đủ. Nếu có themeColor → color grade về tông màu chủ đề.
 */
export function buildFootageBg(
  footageAbs: string[],
  durationSec: number,
  outPath: string,
  opts?: FootageBgOpts,
): void {
  if (footageAbs.length === 0) throw new Error("Không có footage để dựng nền");
  const durs = footageAbs.map(ffprobeSec);
  const sum = durs.reduce((s, d) => s + d, 0) || 1;
  // Đủ clip (sum ≥ duration) → repeats=1, -t trim trong lần 1 → KHÔNG lặp clip.
  const repeats = Math.max(1, Math.ceil(durationSec / sum));
  const seq: string[] = [];
  for (let r = 0; r < repeats; r++) seq.push(...footageAbs);
  const listFile = path.join(os.tmpdir(), `footagebg-${path.basename(outPath)}.txt`);
  fs.writeFileSync(
    listFile,
    seq.map((f) => `file '${f.replace(/'/g, "'\\''")}'`).join("\n"),
  );

  const cb = themeColorbalance(opts?.themeColor, FOOTAGE_GRADE);
  const doTheme = cb !== "";

  // Xây filter chain tuần tự + đánh số input phụ (lavfi) theo thứ tự push.
  const inputs = ["-f", "concat", "-safe", "0", "-i", listFile];
  let nextIdx = 1;

  const eqParts: string[] = [];
  if (FOOTAGE_BLUR > 0) eqParts.push(`boxblur=${FOOTAGE_BLUR}:1`);
  if (FOOTAGE_BRIGHTNESS !== 0 || FOOTAGE_SATURATION !== 1)
    eqParts.push(`eq=brightness=${FOOTAGE_BRIGHTNESS}:saturation=${FOOTAGE_SATURATION}`);
  // Grade màu chủ đề: hạ nhẹ saturation + dịch cân bằng màu về tông theme.
  if (doTheme) {
    eqParts.push(`eq=saturation=${FOOTAGE_DESAT}`);
    eqParts.push(cb);
  }
  const eqChain = eqParts.length ? "," + eqParts.join(",") : "";

  const chains: string[] = [];
  chains.push(
    `[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1${eqChain}[fv]`,
  );
  let last = "fv";

  // Ink overlay (legacy, mặc định tắt).
  if (FOOTAGE_INK > 0) {
    const ii = nextIdx++;
    inputs.push("-f", "lavfi", "-i", "color=c=0x16244F:s=1080x1920");
    chains.push(`[${ii}:v]format=rgba,colorchannelmixer=aa=${FOOTAGE_INK}[ink]`);
    chains.push(`[${last}][ink]overlay=shortest=1[inked]`);
    last = "inked";
  }

  chains.push(`[${last}]format=yuv420p[bg]`);
  const filter = chains.join(";");

  execFileSync("ffmpeg", [
    "-hide_banner", "-loglevel", "error", "-y",
    ...inputs,
    "-filter_complex", filter,
    "-map", "[bg]", "-t", String(durationSec), "-r", "30",
    "-an", "-c:v", "libx264", "-crf", "18", "-preset", "medium",
    // Keyframe mỗi 1s → -ss seek theo đoạn chính xác khi ghép chunk.
    "-g", "30", "-keyint_min", "30",
    "-pix_fmt", "yuv420p", outPath,
  ]);
  fs.rmSync(listFile, { force: true });
}

/**
 * Ghép 1 ĐOẠN: đoạn nền footage [startSec, +durSec] + overlay (ProRes alpha,
 * timeline 0..durSec) → 1 chunk video H.264 (KHÔNG audio — audio mux 1 lần cuối
 * để tránh click ở ranh giới). overlay ProRes 4444 có alpha → ffmpeg đọc tự động.
 */
export function compositeChunk(
  footageBg: string,
  startSec: number,
  durSec: number,
  overlayMov: string,
  outPath: string,
): void {
  execFileSync("ffmpeg", [
    "-hide_banner", "-loglevel", "error", "-y",
    "-ss", String(startSec), "-t", String(durSec), "-i", footageBg,
    "-i", overlayMov,
    "-filter_complex", "[0:v][1:v]overlay=format=auto[v]",
    "-map", "[v]", "-an",
    "-c:v", "libx264", "-crf", "18", "-preset", "medium", "-pix_fmt", "yuv420p",
    outPath,
  ]);
}

/** Mux audio (voice wav) vào video đã ghép → mp4 cuối. */
export function muxAudio(videoPath: string, audioWav: string, outPath: string): void {
  execFileSync("ffmpeg", [
    "-hide_banner", "-loglevel", "error", "-y",
    "-i", videoPath, "-i", audioWav,
    "-map", "0:v:0", "-map", "1:a:0",
    "-c:v", "copy", "-c:a", "aac", "-b:a", "192k",
    "-movflags", "+faststart", "-shortest", outPath,
  ]);
}

/** Nối nhiều file video cùng codec/params (stream copy) → 1 file. */
export function concatVideos(parts: string[], outPath: string): void {
  const listFile = path.join(os.tmpdir(), `concat-${path.basename(outPath)}.txt`);
  fs.writeFileSync(
    listFile,
    parts.map((f) => `file '${f.replace(/'/g, "'\\''")}'`).join("\n"),
  );
  execFileSync("ffmpeg", [
    "-hide_banner", "-loglevel", "error", "-y",
    "-f", "concat", "-safe", "0", "-i", listFile,
    "-c", "copy", outPath,
  ]);
  fs.rmSync(listFile, { force: true });
}

/**
 * Phủ lớp đồ hoạ (VP8 webm ALPHA) lên nền footage + audio từ voice wav → mp4.
 * `-c:v libvpx` để ffmpeg giải mã kênh alpha của VP8 webm.
 */
export function compositeOverlay(
  footageBg: string,
  overlayWebm: string,
  audioWav: string,
  outPath: string,
): void {
  execFileSync("ffmpeg", [
    "-hide_banner", "-loglevel", "error", "-y",
    "-i", footageBg,
    "-c:v", "libvpx", "-i", overlayWebm,
    "-i", audioWav,
    "-filter_complex", "[0:v][1:v]overlay=format=auto[v]",
    "-map", "[v]", "-map", "2:a:0",
    "-c:v", "libx264", "-crf", "18", "-preset", "medium", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "192k",
    "-movflags", "+faststart", "-shortest", outPath,
  ]);
}
