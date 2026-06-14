/**
 * Gallery BGM mixing — Phase 4e.x.
 *
 * Trước khi Remotion render 1 chapter, prepare 1 audio file đã mix sẵn:
 *  - Narration chapter: voice voiceover + BGM volume thấp (default 0.1 ≈ -20dB)
 *    → ffmpeg amix duration=first → AAC. Voice giữ -16 LUFS từ Phase 4b.
 *  - Music chapter: BGM loop tới hết chapter duration → AAC.
 *  - Không BGM: narration giữ voice file; music silent (audioUrl=null).
 *
 * Filename mixed file: gallery-{planId}-ch{idx}-mix.aac trong TMP_DIR.
 * Overwrite mỗi lần render (rebuild ~1-2s, không cần cache).
 *
 * Volume tuning: 0.1 linear ≈ -20dB. Đủ để voice nổi rõ + BGM tạo atmosphere.
 * Phase 4e.x+ có thể nâng cấp sidechain compression (true ducking).
 */
import fs from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { PATHS } from "./paths";

const execFileAsync = promisify(execFile);

export const galleryChapterMixedFilename = (
  planId: string,
  chapterIdx: number,
): string =>
  `gallery-${planId}-ch${String(chapterIdx).padStart(2, "0")}-mix.aac`;

const DEFAULT_BGM_VOLUME_NARRATION = 0.1; // -20dB

/**
 * Narration: mix voice + BGM. Duration = voice (BGM loop nếu ngắn hơn).
 */
export async function mixNarrationWithBgm(input: {
  voicePath: string;
  bgmPath: string;
  outPath: string;
  bgmVolume?: number;
}): Promise<void> {
  if (!fs.existsSync(input.voicePath)) {
    throw new Error(`Voice file không tồn tại: ${input.voicePath}`);
  }
  if (!fs.existsSync(input.bgmPath)) {
    throw new Error(`BGM file không tồn tại: ${input.bgmPath}`);
  }
  const bgmVol = input.bgmVolume ?? DEFAULT_BGM_VOLUME_NARRATION;

  await execFileAsync("ffmpeg", [
    "-y",
    "-i",
    input.voicePath,
    "-stream_loop",
    "-1",
    "-i",
    input.bgmPath,
    "-filter_complex",
    // [1:a] = BGM loop infinitely (limited by -shortest below)
    // volume reduce BGM, then mix với voice, duration=first (= voice length)
    `[1:a]volume=${bgmVol}[bgm];[0:a][bgm]amix=inputs=2:duration=first:dropout_transition=2[out]`,
    "-map",
    "[out]",
    "-shortest",
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    "-movflags",
    "+faststart",
    input.outPath,
  ]);
}

/**
 * Music chapter: BGM loop trim đến durationMs. Full volume.
 */
export async function prepareMusicAudio(input: {
  bgmPath: string;
  outPath: string;
  durationMs: number;
}): Promise<void> {
  if (!fs.existsSync(input.bgmPath)) {
    throw new Error(`BGM file không tồn tại: ${input.bgmPath}`);
  }
  if (input.durationMs <= 0) {
    throw new Error("durationMs phải > 0");
  }
  const durationSec = (input.durationMs / 1000).toFixed(3);

  await execFileAsync("ffmpeg", [
    "-y",
    "-stream_loop",
    "-1",
    "-i",
    input.bgmPath,
    "-t",
    durationSec,
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    "-movflags",
    "+faststart",
    input.outPath,
  ]);
}

/**
 * Resolve audio file cho 1 chapter trước khi pass vào Remotion render.
 *
 * Returns:
 *  - { filename } nếu có audio để render với (voice / mixed / music BGM segment)
 *  - { filename: null } nếu silent (music chapter không có BGM)
 */
export async function prepareChapterRenderAudio(input: {
  planId: string;
  chapterIdx: number;
  chapterKind: "narration" | "music";
  /** TTS voice filename của chapter, đường dẫn relative TMP_DIR. */
  voiceFilename: string | null;
  /** Music chapter duration nếu kind="music". */
  chapterMinutes: number;
  /** BGM file của plan (TMP_DIR). null = không có BGM. */
  bgmFilename: string | null;
}): Promise<{ filename: string | null }> {
  const bgmPath = input.bgmFilename
    ? path.join(PATHS.TMP_DIR, input.bgmFilename)
    : null;
  const hasBgm = bgmPath !== null && fs.existsSync(bgmPath);

  // Narration: cần voice file
  if (input.chapterKind === "narration") {
    if (!input.voiceFilename) {
      return { filename: null };
    }
    const voicePath = path.join(PATHS.TMP_DIR, input.voiceFilename);
    if (!fs.existsSync(voicePath)) {
      return { filename: null };
    }
    if (!hasBgm) {
      // Không BGM → trả luôn voice file gốc, Remotion dùng trực tiếp
      return { filename: input.voiceFilename };
    }
    // Mix voice + BGM → file mới
    const mixedFilename = galleryChapterMixedFilename(
      input.planId,
      input.chapterIdx,
    );
    const mixedPath = path.join(PATHS.TMP_DIR, mixedFilename);
    await mixNarrationWithBgm({
      voicePath,
      bgmPath: bgmPath!,
      outPath: mixedPath,
    });
    return { filename: mixedFilename };
  }

  // Music chapter
  if (!hasBgm) {
    // Silent — Remotion render không audio
    return { filename: null };
  }
  const durationMs = Math.round(input.chapterMinutes * 60_000);
  const mixedFilename = galleryChapterMixedFilename(
    input.planId,
    input.chapterIdx,
  );
  const mixedPath = path.join(PATHS.TMP_DIR, mixedFilename);
  await prepareMusicAudio({
    bgmPath: bgmPath!,
    outPath: mixedPath,
    durationMs,
  });
  return { filename: mixedFilename };
}
