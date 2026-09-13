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
  /**
   * Số giây NHẠC-NỀN-ĐUÔI thêm vào SAU khi hết tiếng nói (music-only outro tail).
   * Voice được pad im lặng thêm tailSec; nhạc tiếp tục ở base (không duck vì
   * không còn tiếng) rồi fade out ở ~2.5s cuối. 0 = không kéo đuôi.
   */
  tailSec?: number;
  /**
   * LỊCH NHẠC (user chốt): nếu set headSec > 0 → nhạc CHỈ chạy ở 2 cửa sổ:
   * [0, headSec] (đầu + intro/hook + ~5s) rồi FADE TẮT, và [voiceDur, +tailSec]
   * (đuôi). Đoạn GIỮA KHÔNG có nhạc. Không set → nhạc chạy suốt (ducking) như cũ.
   */
  headSec?: number;
};

export type MixBgmResult = {
  outputPath: string;
  durationMs: number;
};

const DEFAULT_BGM_VOLUME_DB = -18;
const DEFAULT_INTRO_OUTRO_SEC = 3;
const DEFAULT_INTRO_OUTRO_BUMP_DB = 10;
/** Bump cho đuôi nhạc-only (to hơn intro vì phải nghe rõ, không có giọng đè). */
const DEFAULT_TAIL_BUMP_DB = 12;
/** Boost đuôi nhạc trong LỊCH NHẠC (dB, chuyển sang hệ số tuyến tính cho envelope). */
const DEFAULT_TAIL_BOOST_DB = 12;

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
  const tailSec = Math.max(0, input.tailSec ?? 0);

  const voiceDur = await ffprobeDurationSec(input.voicePath);
  // Tổng thời lượng sau khi kéo đuôi nhạc nền (giọng im ở đoạn tail).
  const totalDur = voiceDur + tailSec;

  await fsp.mkdir(TMP_DIR, { recursive: true });
  // Container .m4a (mp4) — có metadata duration chuẩn (ADTS .aac ước lượng sai
   // → -shortest lúc mux có thể cắt cụt đuôi nhạc).
  const outputPath = path.join(
    TMP_DIR,
    `${input.episodeName}.with-bgm.m4a`,
  );

  // Build filter graph — TỐI ƯU LOA ĐIỆN THOẠI (nhạc nghe được trên loa nhỏ).
  // BÀI HỌC (reel + podcast tập 102): loa điện thoại chỉ tái tạo tốt dải MID;
  // nếu NOTCH mid + để nhạc quá nhỏ → nhạc BIẾN MẤT trên điện thoại (dù rõ trên
  // headphone). Nên: highpass cắt sub-bass loa không phát được + BOOST mid/presence
  // để nhạc "xuyên" qua loa nhỏ (KHÔNG notch), base to hơn, ducking nhẹ hơn.
  // - highpass=f=120: bỏ trầm ù loa không phát được.
  // - equalizer f=1800 g=+4: nhấn presence cho piano nổi trên loa điện thoại.
  // - sidechaincompress ratio=4/release=300: duck vừa phải → nhạc vẫn hiện diện.
  // GHÉP LẶP LIỀN MẠCH: cắt IM LẶNG/FADE-OUT ở CUỐI bản nhạc trước khi aloop.
  // Nhiều track (vd Scott Buckley "Felicity") fade tắt dần ở cuối → nếu để nguyên,
  // mỗi mốc lặp rơi vào đoạn im → tiếng nhạc "hụt". Ở giữa video bị giọng che nên
  // không nhận ra, nhưng ĐUÔI (giọng đã im) sẽ lộ ~2s dead-air nếu voiceDur trùng
  // mốc lặp. areverse→silenceremove(đầu)→areverse = cắt đuôi im, lặp mới liền.
  const bgmChain = [
    "areverse",
    "silenceremove=start_periods=1:start_silence=0:start_threshold=-40dB",
    "areverse",
    "aloop=loop=-1:size=2147483647",
    "aformat=channel_layouts=stereo",
    "highpass=f=120",
    "equalizer=f=1800:t=q:w=1.0:g=4",
    `volume=${bgmVolDb}dB`,
  ].join(",");

  const useSchedule = typeof input.headSec === "number" && input.headSec > 0;

  // Filter áp lên [ducked] (nhạc sau ducking) + filter áp sau amix.
  let bgmFinalExtra: string;
  let amixTail: string;

  if (useSchedule) {
    // LỊCH NHẠC: nhạc CHỈ ở [0, headSec] và [voiceDur, totalDur]; GIỮA = 0.
    // Envelope gain(t) eval theo frame (không dùng afade vì afade-out là vĩnh
    // viễn, sẽ giết luôn đuôi). Đầu: fade in 0.5s + fade out 1.5s cuối cửa sổ.
    // Đuôi: fade in 1s + boost + fade out. Giữa: 0 (im nhạc).
    const HS = input.headSec!.toFixed(3);
    const VD = voiceDur.toFixed(3);
    const TD = totalDur.toFixed(3);
    const TB = Math.pow(10, DEFAULT_TAIL_BOOST_DB / 20).toFixed(3);
    const tfo = Math.min(2.5, tailSec > 0 ? tailSec : 2.5).toFixed(3);
    // ffmpeg expr: min()/max() CHỈ nhận 2 tham số → phải lồng nhau.
    const headG = `max(0,min(min(1,t/0.5),(${HS}-t)/1.5))`;
    const tailG =
      tailSec > 0
        ? `${TB}*max(0,min(min(1,(t-${VD})/1.0),(${TD}-t)/${tfo}))`
        : "0";
    const env = `if(lt(t,${HS}),${headG},if(lt(t,${VD}),0,${tailG}))`;
    bgmFinalExtra = `,volume=eval=frame:volume='${env}'`;
    amixTail = "";
  } else {
    // CŨ: nhạc chạy suốt + bump intro/outro + (nếu có) đuôi + fade cuối.
    const introExpr = introSec > 0 ? `between(t,0,${introSec})` : null;
    const outroExpr =
      introSec > 0 && tailSec === 0
        ? `between(t,${(voiceDur - introSec).toFixed(3)},${voiceDur.toFixed(3)})`
        : null;
    const enableExpr = [introExpr, outroExpr].filter(Boolean).join("+") || null;
    let bumpFilter = enableExpr
      ? `,volume=enable='${enableExpr}':volume=${bumpDb}dB`
      : "";
    if (tailSec > 0) {
      const tailExpr = `between(t,${voiceDur.toFixed(3)},${totalDur.toFixed(3)})`;
      bumpFilter += `,volume=enable='${tailExpr}':volume=${DEFAULT_TAIL_BUMP_DB}dB`;
    }
    const fadeDur = tailSec > 0 ? Math.min(2.5, tailSec) : 0;
    bgmFinalExtra = bumpFilter;
    amixTail =
      fadeDur > 0
        ? `,afade=t=out:st=${(totalDur - fadeDur).toFixed(3)}:d=${fadeDur.toFixed(3)}`
        : "";
  }

  // KÉO ĐUÔI: pad voice bằng im lặng tới totalDur (apad=whole_dur — chuẩn xác
  // trong ffmpeg 8). QUAN TRỌNG: sidechaincompress KẾT THÚC khi input sidechain
  // (voice) hết → nếu không pad, cả graph bị cắt ở voiceDur, mất đuôi.
  const voicePad =
    tailSec > 0 ? `,apad=whole_dur=${totalDur.toFixed(3)}` : "";
  const filterComplex = [
    // BGM chain
    `[1:a]${bgmChain}[bgm_eq]`,
    // Voice (force stereo + pad đuôi) → tách 2 nhánh: sidechain trigger + trộn.
    `[0:a]aformat=channel_layouts=stereo${voicePad},asplit=2[vtrig][vmix]`,
    // Sidechain ducking (voice làm trigger, BGM làm main)
    `[bgm_eq][vtrig]sidechaincompress=threshold=0.05:ratio=4:attack=20:release=300[ducked]`,
    // Envelope lịch nhạc (hoặc bump cũ) áp lên nhạc sau ducking.
    `[ducked]aformat=channel_layouts=stereo${bgmFinalExtra}[bgm_final]`,
    // Final mix — voice(pad) + bgm; longest theo BGM vô tận, "-t" cắt ở totalDur.
    `[vmix][bgm_final]amix=inputs=2:duration=longest:dropout_transition=0,alimiter=limit=0.95${amixTail}[out]`,
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
    // Cắt cứng ở totalDur (voice + đuôi nhạc) vì BGM loop vô tận.
    "-t",
    String(totalDur),
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
