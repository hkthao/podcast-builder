/**
 * Podcast script TTS pipeline — turn-by-turn dialogue render cho 2 host.
 *
 * Mỗi turn dispatch sang voice tương ứng (host_nam vs host_nu), gọi TTS API
 * 1 lần per turn → collect raw audio buffers → concat → loudnorm AAC →
 * ghi đè `input/{slug}.aac` để pipeline make.ts cũ tự pick up.
 *
 * Lý do KHÔNG dùng `multiSpeakerVoiceConfig`:
 *  1. Chỉ có ở model preview, chưa stable trên AI Studio v1beta endpoint.
 *  2. Loop turn-by-turn cho user chọn voice tự do qua dropdown.
 *
 * Tạm thời chỉ implement Gemini provider — OpenAI có thể thêm sau bằng cùng
 * pattern (chỉ khác buffer format AAC vs PCM).
 */
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { PATHS } from "./paths";
import { getApiKey } from "./api-keys-store";
import {
  GEMINI_PCM_CHANNELS,
  GEMINI_PCM_SAMPLE_RATE,
  DEFAULT_GEMINI_MODEL,
  generateGeminiTts,
  type GeminiTtsModel,
  type GeminiVoice,
} from "./tts-providers/gemini-tts";
import type { PodcastScript, Speaker } from "../../podcast/server/lib/script-store";

const execFileAsync = promisify(execFile);

const { INPUT_DIR, TMP_DIR } = PATHS;

export type TtsVoiceConfig = {
  voice: GeminiVoice;
  /**
   * Style instruction prefix riêng cho speaker này — Gemini hiểu bracket
   * prefix là director's note. Ví dụ:
   *   "Giọng nam phát thanh viên miền Bắc, trầm ấm, dí dỏm, pacing chậm rãi"
   */
  styleInstruction: string;
};

export type GenScriptAudioInput = {
  episodeName: string;
  script: PodcastScript;
  ttsModel?: GeminiTtsModel;
  /** Map speaker → voice config. */
  voices: Record<Speaker, TtsVoiceConfig>;
  /**
   * Khoảng lặng (ms) chèn giữa các turn — giúp pacing dialogue tự nhiên.
   * Default 300ms (transition voice 1 → voice 2 cần beat ngắn).
   */
  turnGapMs?: number;
  /** Force re-gen kể cả khi cache hợp lệ. Default false. */
  force?: boolean;
};

export type GenScriptAudioResult = {
  outputPath: string;
  durationMs: number;
  turnCount: number;
};

const DEFAULT_TURN_GAP_MS = 300;

const silenceBuffer = (durationMs: number): Buffer => {
  // s16le PCM 24kHz mono — 2 bytes/sample × 24000 samples/s
  const sampleCount = Math.round(
    (durationMs / 1000) * GEMINI_PCM_SAMPLE_RATE * GEMINI_PCM_CHANNELS,
  );
  return Buffer.alloc(sampleCount * 2, 0);
};

const findExistingAudio = async (
  baseName: string,
): Promise<string | null> => {
  const exts = ["m4a", "mp3", "wav", "aac"];
  for (const ext of exts) {
    const p = path.join(INPUT_DIR, `${baseName}.${ext}`);
    try {
      await fsp.access(p);
      return p;
    } catch {
      /* not found */
    }
  }
  return null;
};

const loudnormPcmToAac = async (
  rawPcmPath: string,
  outPath: string,
): Promise<void> => {
  await execFileAsync("ffmpeg", [
    "-y",
    "-f",
    "s16le",
    "-ar",
    String(GEMINI_PCM_SAMPLE_RATE),
    "-ac",
    String(GEMINI_PCM_CHANNELS),
    "-i",
    rawPcmPath,
    "-af",
    "loudnorm=I=-16:TP=-1.5:LRA=11",
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    "-movflags",
    "+faststart",
    outPath,
  ]);
};

const ffprobeDurationMs = async (filePath: string): Promise<number> => {
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
  if (!Number.isFinite(sec)) return 0;
  return Math.round(sec * 1000);
};

/**
 * Gen audio file dialogue 2 voice từ PodcastScript. Pipeline:
 *
 *   for turn in script.turns:
 *     voice_cfg = voices[turn.speaker]
 *     pcm = Gemini TTS(turn.text, voice_cfg.voice, voice_cfg.styleInstruction)
 *     append pcm to buffer
 *     append silence(turnGapMs) to buffer
 *   ffmpeg s16le → loudnorm → AAC → input/{slug}.aac
 *
 * KHÔNG xoá audio gốc khác extension — ghi `.aac` mới và pipeline cũ ưu tiên
 * ext theo thứ tự AUDIO_EXTS (m4a/mp3/wav). Để pipeline ưu tiên file mới gen,
 * caller cần xoá audio cũ trước nếu muốn (UI sẽ confirm).
 */
export async function generateScriptAudio(
  input: GenScriptAudioInput,
): Promise<GenScriptAudioResult> {
  if (input.script.turns.length === 0) {
    const err = new Error("Script không có turn nào — gen kịch bản trước.") as Error & {
      code: string;
    };
    err.code = "VALIDATION";
    throw err;
  }

  const apiKey = getApiKey("gemini");
  if (!apiKey) {
    const err = new Error(
      "Thiếu GEMINI_API_KEY — set qua Settings (/settings) hoặc .env.",
    ) as Error & { code: string };
    err.code = "VALIDATION";
    throw err;
  }

  const outPath = path.join(INPUT_DIR, `${input.episodeName}.aac`);
  const force = input.force ?? false;

  // Cache: nếu file đã có + mtime mới hơn script update → skip
  if (!force && fs.existsSync(outPath)) {
    try {
      const audioStat = fs.statSync(outPath);
      const scriptPathStr = path.join(INPUT_DIR, `${input.episodeName}.script.json`);
      const scriptStat = fs.statSync(scriptPathStr);
      if (audioStat.mtimeMs > scriptStat.mtimeMs) {
        return {
          outputPath: outPath,
          durationMs: await ffprobeDurationMs(outPath),
          turnCount: input.script.turns.length,
        };
      }
    } catch {
      /* fallthrough — re-gen */
    }
  }

  await fsp.mkdir(INPUT_DIR, { recursive: true });
  await fsp.mkdir(TMP_DIR, { recursive: true });

  const turnGap = input.turnGapMs ?? DEFAULT_TURN_GAP_MS;
  const model = input.ttsModel ?? DEFAULT_GEMINI_MODEL;
  const silence = silenceBuffer(turnGap);

  // Loop từng turn, dispatch voice + style instruction tương ứng speaker
  const pcmBuffers: Buffer[] = [];
  for (let i = 0; i < input.script.turns.length; i++) {
    const turn = input.script.turns[i];
    const voiceCfg = input.voices[turn.speaker];
    if (!voiceCfg) {
      throw new Error(
        `Thiếu voice config cho speaker "${turn.speaker}" (turn #${i}).`,
      );
    }
    const { audio } = await generateGeminiTts({
      text: turn.text,
      voice: voiceCfg.voice,
      model,
      apiKey,
      styleInstruction: voiceCfg.styleInstruction,
    });
    pcmBuffers.push(audio);
    if (i < input.script.turns.length - 1) {
      pcmBuffers.push(silence);
    }
  }

  // Concat PCM (int16 stream, không header → chỉ Buffer.concat)
  const rawPath = path.join(
    TMP_DIR,
    `${input.episodeName}.script.tts.pcm`,
  );
  await fsp.writeFile(rawPath, Buffer.concat(pcmBuffers));

  // Trước khi ghi `.aac` mới, xoá audio gốc khác extension để pipeline cũ
  // ưu tiên file vừa gen. Pipeline make.ts dùng findAudio() check theo
  // thứ tự m4a/mp3/wav — nếu giữ file cũ thì script audio bị skip.
  const oldAudio = await findExistingAudio(input.episodeName);
  if (oldAudio && oldAudio !== outPath) {
    await fsp.unlink(oldAudio).catch(() => {
      /* ignore */
    });
  }

  await loudnormPcmToAac(rawPath, outPath);
  await fsp.unlink(rawPath).catch(() => {
    /* ignore */
  });

  return {
    outputPath: outPath,
    durationMs: await ffprobeDurationMs(outPath),
    turnCount: input.script.turns.length,
  };
}
