/**
 * BGM mix layer cho podcast 2 host — thực thi đầy đủ guideline production:
 *
 *   1. EQ notch 1-4kHz (-6dB tại 2.5kHz) → đục "lỗ trống" cho giọng nói nổi
 *      mà không cần tăng volume voice (tham khảo: dải tần "vàng" của human
 *      voice 1-4kHz).
 *   2. Base volume -22dB → giữa khoảng -24…-18dB user yêu cầu.
 *   3. Sidechain ducking — voice trigger nhạc dìm xuống thêm ~-8dB khi nói,
 *      pop ra khi im lặng.
 *   4. Intro/outro bump — 3s đầu + 3s cuối boost +10dB (≈ -12dB final) để
 *      brand BGM rõ ràng. Voice probably silent ở đây nên không xung đột.
 *
 * Output: file mới `tmp/{slug}.with-bgm.{ext}` — caller chọn dùng cho render
 * hay không. Không overwrite audio gốc để pipeline make.ts có thể chạy với
 * hoặc không có BGM tuỳ user.
 */
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { PATHS } from "../studio-core/paths";

const execFileAsync = promisify(execFile);

const { TMP_DIR } = PATHS;

const ffprobeDurationSec = async (filePath: string): Promise<number> => {
  const { stdout } = await execFileAsync("ffprobe", [
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-of",
    "csv=p=0",
    filePath,
  ]);
  const sec = parseFloat(stdout.trim());
  if (!Number.isFinite(sec) || sec <= 0) {
    throw new Error(`ffprobe không đọc được duration: ${filePath}`);
  }
  return sec;
};

export type MixBgmInput = {
  /** Path file voice (sau khi gen TTS, chưa mix BGM). */
  voicePath: string;
  /** Path file BGM (mp3/m4a/wav/aac). */
  bgmPath: string;
  /** Tên episode — dùng làm prefix output filename. */
  episodeName: string;
  /**
   * Base volume BGM giữa episode (dB). Default -22 (giữa khoảng -24..-18).
   * Khi voice talking, sidechain duck thêm xuống ~-30dB.
   */
  bgmVolumeDb?: number;
  /**
   * Số giây đầu + cuối episode boost BGM lên brand level. Default 3s.
   * Pass 0 để disable intro/outro bump.
   */
  introOutroSec?: number;
  /**
   * Mức bump intro/outro (dB above base). Default +10dB → final ≈ -12dB.
   */
  introOutroBumpDb?: number;
};

export type MixBgmResult = {
  outputPath: string;
  durationMs: number;
};

const DEFAULT_BGM_VOLUME_DB = -22;
const DEFAULT_INTRO_OUTRO_SEC = 3;
const DEFAULT_INTRO_OUTRO_BUMP_DB = 10;

/**
 * Mix BGM vào voice → output AAC mới trong TMP_DIR. Không xoá file gốc.
 *
 * Filter graph:
 *   [1:a] BGM
 *     → aloop (loop vô tận)
 *     → equalizer (notch 1-4kHz)
 *     → volume base
 *   [0:a] voice trigger ducking
 *     → sidechaincompress
 *   → volume bump enable intro/outro
 *   → amix với voice duration=first
 */
export async function mixBgmIntoVoice(
  input: MixBgmInput,
): Promise<MixBgmResult> {
  if (!fs.existsSync(input.voicePath)) {
    throw new Error(`Voice file không tồn tại: ${input.voicePath}`);
  }
  if (!fs.existsSync(input.bgmPath)) {
    throw new Error(`BGM file không tồn tại: ${input.bgmPath}`);
  }

  const bgmVolDb = input.bgmVolumeDb ?? DEFAULT_BGM_VOLUME_DB;
  const introSec = Math.max(0, input.introOutroSec ?? DEFAULT_INTRO_OUTRO_SEC);
  const bumpDb = input.introOutroBumpDb ?? DEFAULT_INTRO_OUTRO_BUMP_DB;

  const voiceDur = await ffprobeDurationSec(input.voicePath);

  await fsp.mkdir(TMP_DIR, { recursive: true });
  const outputPath = path.join(
    TMP_DIR,
    `${input.episodeName}.with-bgm.aac`,
  );

  // Build filter graph
  // - aloop=loop=-1: lặp vô tận, size đủ lớn cho podcast dài
  // - equalizer=f=2500:t=q:w=1.5:g=-6: notch -6dB tại 2.5kHz, Q=1.5 cover 1-4kHz
  // - sidechaincompress:
  //     threshold=0.05 (~ -26dBFS) — voice ngưỡng kích hoạt
  //     ratio=8 — duck mạnh
  //     attack=20ms — phản ứng nhanh
  //     release=400ms — pop lại mượt, không pump
  const bgmChain = [
    "aloop=loop=-1:size=2147483647",
    "aformat=channel_layouts=stereo",
    "equalizer=f=2500:t=q:w=1.5:g=-6",
    `volume=${bgmVolDb}dB`,
  ].join(",");

  // Intro/outro bump expression — enable khi t<intro_sec hoặc t>dur-intro_sec
  // ffmpeg eval syntax: between(x,min,max) → 1 nếu trong khoảng, 0 khác.
  const enableExpr =
    introSec > 0
      ? `between(t,0,${introSec})+between(t,${(voiceDur - introSec).toFixed(3)},${voiceDur.toFixed(3)})`
      : null;

  const bumpFilter = enableExpr
    ? `,volume=enable='${enableExpr}':volume=${bumpDb}dB`
    : "";

  const filterComplex = [
    // BGM chain
    `[1:a]${bgmChain}[bgm_eq]`,
    // Sidechain ducking (voice [0:a] as trigger, BGM as main)
    `[bgm_eq][0:a]sidechaincompress=threshold=0.05:ratio=8:attack=20:release=400[ducked]`,
    // Intro/outro bump (apply lên kết quả ducked)
    `[ducked]aformat=channel_layouts=stereo${bumpFilter}[bgm_final]`,
    // Final mix — voice (force stereo) + bgm_final, duration theo voice
    `[0:a]aformat=channel_layouts=stereo[voice_st]`,
    `[voice_st][bgm_final]amix=inputs=2:duration=first:dropout_transition=0[out]`,
  ].join(";");

  await execFileAsync("ffmpeg", [
    "-y",
    "-i",
    input.voicePath,
    "-i",
    input.bgmPath,
    "-filter_complex",
    filterComplex,
    "-map",
    "[out]",
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    "-movflags",
    "+faststart",
    outputPath,
  ]);

  const durMs = Math.round((await ffprobeDurationSec(outputPath)) * 1000);
  return { outputPath, durationMs: durMs };
}
