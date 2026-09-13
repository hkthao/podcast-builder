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
 * Dựng NỀN footage dài durationSec từ các clip nối theo thứ tự, crop cover
 * 1080×1920. Nếu tổng clip ≥ durationSec → mỗi clip hiện ĐÚNG 1 LẦN (không lặp);
 * thiếu thì mới lặp cho đủ. Treatment (blur/tối/ink) mặc định TẮT — giữ màu gốc.
 */
export function buildFootageBg(
  footageAbs: string[],
  durationSec: number,
  outPath: string,
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

  // Chuỗi filter dựng theo treatment bật/tắt.
  const inputs = ["-f", "concat", "-safe", "0", "-i", listFile];
  const eqParts: string[] = [];
  if (FOOTAGE_BLUR > 0) eqParts.push(`boxblur=${FOOTAGE_BLUR}:1`);
  if (FOOTAGE_BRIGHTNESS !== 0 || FOOTAGE_SATURATION !== 1)
    eqParts.push(`eq=brightness=${FOOTAGE_BRIGHTNESS}:saturation=${FOOTAGE_SATURATION}`);
  const eqChain = eqParts.length ? "," + eqParts.join(",") : "";
  let filter: string;
  let mapLabel: string;
  const base = `[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1${eqChain}`;
  if (FOOTAGE_INK > 0) {
    inputs.push("-f", "lavfi", "-i", "color=c=0x16244F:s=1080x1920");
    filter =
      `${base}[fv];[1:v]format=rgba,colorchannelmixer=aa=${FOOTAGE_INK}[ink];` +
      "[fv][ink]overlay=shortest=1,format=yuv420p[bg]";
    mapLabel = "[bg]";
  } else {
    filter = `${base},format=yuv420p[bg]`;
    mapLabel = "[bg]";
  }

  execFileSync("ffmpeg", [
    "-hide_banner", "-loglevel", "error", "-y",
    ...inputs,
    "-filter_complex", filter,
    "-map", mapLabel, "-t", String(durationSec), "-r", "30",
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
