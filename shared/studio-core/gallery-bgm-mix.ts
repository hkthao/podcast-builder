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

/** Đo độ dài (ms) file audio bằng ffprobe. 0 nếu lỗi. */
async function probeDurationMs(file: string): Promise<number> {
  try {
    const { stdout } = await execFileAsync("ffprobe", [
      "-v", "error", "-show_entries", "format=duration",
      "-of", "default=nw=1:nk=1", file,
    ]);
    const sec = parseFloat(stdout.trim());
    return Number.isFinite(sec) && sec > 0 ? Math.round(sec * 1000) : 0;
  } catch {
    return 0;
  }
}

export const galleryChapterMixedFilename = (
  planId: string,
  chapterIdx: number,
): string =>
  `gallery-${planId}-ch${String(chapterIdx).padStart(2, "0")}-mix.aac`;

const DEFAULT_BGM_VOLUME_NARRATION = 0.1; // -20dB
/** Ambience bed nằm DƯỚI cả voice + BGM — chỉ tạo không khí, rất khẽ. */
const DEFAULT_AMBIENCE_VOLUME = 0.08; // ~-22dB

/**
 * Convention thư mục SFX: `input/sfx/`. Ambience bed (gió, room tone, lửa
 * nến…) đặt tên `ambience.<ext>` — render tự nhặt nếu tồn tại. (Phase sau:
 * one-shot SFX theo beat — page-turn.mp3, clock-tick.mp3… sẽ resolve theo
 * shot.role/recipe.)
 *
 * Trả absolute path nếu tìm thấy 1 file `ambience.*`, ngược lại null.
 */
export const gallerySfxDir = (): string => path.join(PATHS.INPUT_DIR, "sfx");

const AMBIENCE_EXTS = [".mp3", ".wav", ".m4a", ".ogg", ".aac", ".flac"];

export function resolveAmbienceBed(): string | null {
  const dir = gallerySfxDir();
  for (const ext of AMBIENCE_EXTS) {
    const p = path.join(dir, `ambience${ext}`);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

/**
 * Mix voice + N "bed" loop (BGM, ambience…) thành 1 file. Duration = voice.
 *
 * Dùng `amix … normalize=0` để KHÔNG tự chia nhỏ biên độ voice theo số input
 * (giữ voice rõ ở -16 LUFS); mỗi bed tự attenuate qua filter `volume`. Đây là
 * điểm khác `mixNarrationWithBgm` (2-input, normalize mặc định) — path cũ giữ
 * nguyên cho narration+BGM không-ambience để output không đổi.
 */
async function mixVoiceWithBeds(input: {
  voicePath: string;
  beds: Array<{ path: string; volume: number }>;
  outPath: string;
}): Promise<void> {
  if (!fs.existsSync(input.voicePath)) {
    throw new Error(`Voice file không tồn tại: ${input.voicePath}`);
  }
  const beds = input.beds.filter((b) => fs.existsSync(b.path));
  if (beds.length === 0) {
    throw new Error("mixVoiceWithBeds: không có bed nào tồn tại");
  }

  // -i voice, rồi mỗi bed `-stream_loop -1 -i <bed>` để loop vô hạn.
  const args: string[] = ["-y", "-i", input.voicePath];
  for (const bed of beds) {
    args.push("-stream_loop", "-1", "-i", bed.path);
  }

  // filter_complex: [k:a]volume=V[bk]; … [0:a][b1][b2]amix=inputs=N+1:…[out]
  const parts: string[] = [];
  const mixLabels: string[] = ["[0:a]"];
  beds.forEach((bed, i) => {
    const inIdx = i + 1; // input 0 = voice
    parts.push(`[${inIdx}:a]volume=${bed.volume}[b${inIdx}]`);
    mixLabels.push(`[b${inIdx}]`);
  });
  parts.push(
    `${mixLabels.join("")}amix=inputs=${mixLabels.length}:duration=first:dropout_transition=2:normalize=0[out]`,
  );

  args.push(
    "-filter_complex",
    parts.join(";"),
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
  );

  await execFileAsync("ffmpeg", args);
}

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

  // BUG fix: `amix=duration=first` + `-shortest` từng cắt mix NGẮN hơn voice
  // (mất câu cuối). Giải pháp chắc chắn: đo độ dài voice, ép output ĐÚNG bằng
  // voice — apad bù im lặng nếu amix kết thúc sớm, rồi -t cắt đúng độ dài.
  // dropout_transition=0 để voice hết là dừng mượt, không tạo fade gây hụt.
  const voiceMs = await probeDurationMs(input.voicePath);
  const voiceSec = (voiceMs / 1000).toFixed(3);

  await execFileAsync("ffmpeg", [
    "-y",
    "-i",
    input.voicePath,
    "-stream_loop",
    "-1",
    "-i",
    input.bgmPath,
    "-filter_complex",
    `[1:a]volume=${bgmVol}[bgm];[0:a][bgm]amix=inputs=2:duration=first:dropout_transition=0[mx];[mx]apad[out]`,
    "-map",
    "[out]",
    "-t",
    voiceSec,
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
  /**
   * Ambience bed (absolute path) layer dưới voice+BGM. null/undefined = bỏ
   * qua. Render gọi `resolveAmbienceBed()` để lấy theo convention input/sfx/.
   */
  ambiencePath?: string | null;
}): Promise<{ filename: string | null }> {
  const bgmPath = input.bgmFilename
    ? path.join(PATHS.TMP_DIR, input.bgmFilename)
    : null;
  const hasBgm = bgmPath !== null && fs.existsSync(bgmPath);
  const ambiencePath =
    input.ambiencePath && fs.existsSync(input.ambiencePath)
      ? input.ambiencePath
      : null;

  // Narration: cần voice file
  if (input.chapterKind === "narration") {
    if (!input.voiceFilename) {
      return { filename: null };
    }
    const voicePath = path.join(PATHS.TMP_DIR, input.voiceFilename);
    if (!fs.existsSync(voicePath)) {
      return { filename: null };
    }
    if (!hasBgm && !ambiencePath) {
      // Không bed nào → trả luôn voice file gốc, Remotion dùng trực tiếp
      return { filename: input.voiceFilename };
    }
    const mixedFilename = galleryChapterMixedFilename(
      input.planId,
      input.chapterIdx,
    );
    const mixedPath = path.join(PATHS.TMP_DIR, mixedFilename);
    if (ambiencePath) {
      // Có ambience → mixer N-layer (voice + [BGM] + ambience), normalize=0.
      const beds: Array<{ path: string; volume: number }> = [];
      if (hasBgm) beds.push({ path: bgmPath!, volume: DEFAULT_BGM_VOLUME_NARRATION });
      beds.push({ path: ambiencePath, volume: DEFAULT_AMBIENCE_VOLUME });
      await mixVoiceWithBeds({ voicePath, beds, outPath: mixedPath });
    } else {
      // Chỉ BGM → giữ nguyên path cũ (output không đổi).
      await mixNarrationWithBgm({
        voicePath,
        bgmPath: bgmPath!,
        outPath: mixedPath,
      });
    }
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
