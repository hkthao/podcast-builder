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
  GEMINI_TTS_BLOCKED_CODE,
  generateGeminiTts,
  type GeminiTtsModel,
  type GeminiVoice,
} from "./tts-providers/gemini-tts";
import type { PodcastScript, Speaker } from "../../podcast/server/lib/script-store";

const execFileAsync = promisify(execFile);

const { INPUT_DIR, TMP_DIR } = PATHS;

/**
 * TTS provider channel — quyết định endpoint + API key nào sẽ dùng.
 *  - "gemini": AI Studio (generativelanguage.googleapis.com), key AIza...
 *  - "vertex-gemini": Vertex AI Express Mode (aiplatform.googleapis.com),
 *    key AQ.Ab8... Cùng model + voices như AI Studio, free tier hào phóng
 *    (~1500 RPD, 15 RPM, 1M TPM theo Google docs).
 */
export type TtsProvider = "gemini" | "vertex-gemini";

export type TtsVoiceConfig = {
  /**
   * Voice id — phụ thuộc provider. Gemini: "Charon"/"Aoede"/... (xem
   * GeminiVoice). Cloud TTS: "vi-VN-Wavenet-A"/... (xem cloud-tts.ts).
   * Type rộng (string) để cover cả 2 — runtime dispatch theo `provider`.
   */
  voice: GeminiVoice | string;
  /**
   * Style instruction prefix riêng cho speaker này — Gemini hiểu bracket
   * prefix là director's note. Cloud TTS KHÔNG dùng (Wavenet/Standard không
   * support style; provider ignore field này).
   */
  styleInstruction: string;
  /**
   * Provider gen voice cho speaker này. Default "gemini" để backward-compat
   * với code cũ chưa pass provider.
   */
  provider?: TtsProvider;
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

/**
 * Khoảng cách giữa 2 lần gọi Gemini TTS liên tiếp (ms) để né rate limit.
 * Gemini free tier ~10 req/min cho flash-tts → ≥6s/req. Configurable qua env
 * cho user trả phí (giảm xuống 0). Skip pace khi turn dùng cache (no API call).
 */
const TTS_PACING_MS = Number(process.env.GEMINI_TTS_PACING_MS ?? 6000);

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Dispatch TTS call theo provider. Cả 2 channel dùng cùng request body +
 * voice list (Gemini models) — chỉ khác endpoint + API key:
 *  - gemini → AI Studio (key AIza..., GEMINI_API_KEY)
 *  - vertex-gemini → Vertex AI Express Mode (key AQ.Ab8..., GOOGLE_VERTEX_AI_API_KEY)
 * Trả PCM s16le 24kHz mono để concat pipeline share được.
 */
async function callTtsForTurn(input: {
  text: string;
  voiceCfg: TtsVoiceConfig;
  ttsModel?: GeminiTtsModel;
}): Promise<Buffer> {
  const provider = input.voiceCfg.provider ?? "gemini";
  const keyProvider = provider === "vertex-gemini" ? "google-vertex-ai" : "gemini";
  const apiKey = getApiKey(keyProvider);
  if (!apiKey) {
    const envName =
      provider === "vertex-gemini"
        ? "GOOGLE_VERTEX_AI_API_KEY"
        : "GEMINI_API_KEY";
    const err = new Error(
      `Thiếu ${envName} — set qua Settings (/settings) hoặc .env.`,
    ) as Error & { code: string };
    err.code = "VALIDATION";
    throw err;
  }
  const { audio } = await generateGeminiTts({
    text: input.text,
    voice: input.voiceCfg.voice as GeminiVoice,
    model: input.ttsModel,
    apiKey,
    channel: provider === "vertex-gemini" ? "vertex-express" : "ai-studio",
    styleInstruction: input.voiceCfg.styleInstruction,
  });
  return audio;
}

/** Tên file cached PCM cho 1 turn trong tmp. */
const turnPcmFilename = (slug: string, idx: number): string =>
  `${slug}.turn-${String(idx).padStart(3, "0")}.pcm`;

/** Tên file AAC preview cho 1 turn — UI play lại được. */
const turnAacFilename = (slug: string, idx: number): string =>
  `${slug}.turn-${String(idx).padStart(3, "0")}.aac`;

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

/** Encode raw PCM buffer thành AAC preview (không loudnorm — single-turn,
 * mục đích chỉ để nghe lại nhanh). */
const pcmToAacPreview = async (
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
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    "-movflags",
    "+faststart",
    outPath,
  ]);
};

export type GenTurnAudioInput = {
  episodeName: string;
  turnIdx: number;
  text: string;
  voice: GeminiVoice | string;
  styleInstruction: string;
  ttsModel?: GeminiTtsModel;
  /** TTS provider — default "gemini" để backward-compat. */
  provider?: TtsProvider;
  /** Force re-gen kể cả cache hợp lệ. */
  force?: boolean;
};

export type GenTurnAudioResult = {
  /** Filename trong TMP_DIR — UI play qua /tmp/{filename}. */
  aacFilename: string;
  /** Filename PCM cached — dùng cho concat final. */
  pcmFilename: string;
  durationMs: number;
  /** True nếu skip vì cache hợp lệ. */
  cached: boolean;
};

/**
 * Gen audio cho 1 turn cụ thể — single Gemini TTS call + ghi PCM raw +
 * AAC preview vào TMP_DIR. UI dùng để gen từng turn riêng (workaround
 * 429 quota), nghe lại, regenerate khi text đổi.
 *
 * Cached: nếu PCM file đã tồn tại + force=false → skip API call, chỉ
 * regenerate AAC preview nếu thiếu.
 */
export async function generateScriptTurnAudio(
  input: GenTurnAudioInput,
): Promise<GenTurnAudioResult> {
  await fsp.mkdir(TMP_DIR, { recursive: true });

  const pcmFilename = turnPcmFilename(input.episodeName, input.turnIdx);
  const aacFilename = turnAacFilename(input.episodeName, input.turnIdx);
  const pcmPath = path.join(TMP_DIR, pcmFilename);
  const aacPath = path.join(TMP_DIR, aacFilename);
  const force = input.force ?? false;

  if (!force && fs.existsSync(pcmPath)) {
    // Đã có cache PCM — chỉ encode lại AAC nếu thiếu
    if (!fs.existsSync(aacPath)) {
      await pcmToAacPreview(pcmPath, aacPath);
    }
    return {
      aacFilename,
      pcmFilename,
      durationMs: await ffprobeDurationMs(aacPath),
      cached: true,
    };
  }

  const audio = await callTtsForTurn({
    text: input.text,
    voiceCfg: {
      voice: input.voice,
      styleInstruction: input.styleInstruction,
      provider: input.provider,
    },
    ttsModel: input.ttsModel,
  });
  await fsp.writeFile(pcmPath, audio);
  await pcmToAacPreview(pcmPath, aacPath);

  return {
    aacFilename,
    pcmFilename,
    durationMs: await ffprobeDurationMs(aacPath),
    cached: false,
  };
}

/**
 * Import 1 file audio user upload làm audio cho 1 turn — bypass Gemini TTS.
 * Transcode về cùng format với cache: PCM s16le 24kHz mono + AAC preview,
 * ghi vào cùng tên file → concat pipeline (generateScriptAudio) tự động pick
 * lên thay vì gọi TTS.
 */
export async function importScriptTurnAudio(input: {
  episodeName: string;
  turnIdx: number;
  /** Path tuyệt đối của file upload đã ghi tạm. */
  uploadPath: string;
}): Promise<GenTurnAudioResult> {
  await fsp.mkdir(TMP_DIR, { recursive: true });
  const pcmFilename = turnPcmFilename(input.episodeName, input.turnIdx);
  const aacFilename = turnAacFilename(input.episodeName, input.turnIdx);
  const pcmPath = path.join(TMP_DIR, pcmFilename);
  const aacPath = path.join(TMP_DIR, aacFilename);

  // Transcode upload (mp3/m4a/wav/aac/...) → raw PCM s16le 24kHz mono. Phải
  // khớp format Gemini TTS output để Buffer.concat trong generateScriptAudio
  // ráp được mà không cần re-mux.
  await execFileAsync("ffmpeg", [
    "-y",
    "-i",
    input.uploadPath,
    "-f",
    "s16le",
    "-ar",
    String(GEMINI_PCM_SAMPLE_RATE),
    "-ac",
    String(GEMINI_PCM_CHANNELS),
    pcmPath,
  ]);
  await pcmToAacPreview(pcmPath, aacPath);
  return {
    aacFilename,
    pcmFilename,
    durationMs: await ffprobeDurationMs(aacPath),
    cached: false,
  };
}

/**
 * Xoá cached audio cho 1 turn (PCM + AAC). User edit text xong muốn
 * regenerate từ đầu.
 */
export async function deleteScriptTurnAudio(
  episodeName: string,
  turnIdx: number,
): Promise<void> {
  for (const fn of [
    turnPcmFilename(episodeName, turnIdx),
    turnAacFilename(episodeName, turnIdx),
  ]) {
    await fsp.unlink(path.join(TMP_DIR, fn)).catch(() => {
      /* ignore — không tồn tại */
    });
  }
}

/**
 * Batch gen audio cho 1 range turn liên tiếp — UI dùng để "gen 10 lượt đầu
 * để nghe thử" mà không phải gọi từng turn 1 thủ công.
 *
 * Reuse cache: turn nào đã có PCM → skip API call. Pace TTS_PACING_MS giữa
 * các call live → né rate limit. Return cả counts để UI hiển thị.
 */
export async function batchGenScriptTurnAudio(input: {
  episodeName: string;
  /** Index bắt đầu (inclusive). */
  fromIdx: number;
  /** Số turn cần gen (inclusive). Sẽ clamp về script length. */
  count: number;
  script: PodcastScript;
  voices: { host_nam: TtsVoiceConfig; host_nu: TtsVoiceConfig };
  ttsModel?: GeminiTtsModel;
  /** Bỏ qua cache, force gen tất cả. */
  force?: boolean;
  /** Override pacing ms (default = TTS_PACING_MS env). */
  pacingMs?: number;
}): Promise<{
  range: { from: number; to: number };
  generated: number[];
  cached: number[];
  skipped: number[];
  /** Turn bị Gemini safety filter chặn — UI nhắc user sửa text. */
  blocked: Array<{ idx: number; reason: string }>;
}> {
  if (input.script.turns.length === 0) {
    const err = new Error(
      "Script không có turn nào — gen kịch bản trước.",
    ) as Error & { code: string };
    err.code = "VALIDATION";
    throw err;
  }
  // API key check chuyển vào dispatch (callTtsForTurn) vì voice config khác
  // nhau giữa host_nam vs host_nu có thể dùng provider khác → key kiểm tra
  // lazily theo turn.

  await fsp.mkdir(TMP_DIR, { recursive: true });
  const from = Math.max(0, Math.floor(input.fromIdx));
  const to = Math.min(
    input.script.turns.length,
    from + Math.max(1, Math.floor(input.count)),
  );
  const force = input.force ?? false;
  const pacing = input.pacingMs ?? TTS_PACING_MS;

  const generated: number[] = [];
  const cached: number[] = [];
  const skipped: number[] = [];
  const blocked: Array<{ idx: number; reason: string }> = [];
  let liveCalls = 0;

  for (let i = from; i < to; i++) {
    const turn = input.script.turns[i];
    const voiceCfg = input.voices[turn.speaker];
    if (!voiceCfg) {
      skipped.push(i);
      continue;
    }
    if (!turn.text.trim()) {
      skipped.push(i);
      continue;
    }
    const pcmPath = path.join(
      TMP_DIR,
      turnPcmFilename(input.episodeName, i),
    );
    const aacPath = path.join(
      TMP_DIR,
      turnAacFilename(input.episodeName, i),
    );
    if (!force && fs.existsSync(pcmPath)) {
      // Đảm bảo AAC preview tồn tại (vd cache PCM được tạo từ upload).
      if (!fs.existsSync(aacPath)) {
        await pcmToAacPreview(pcmPath, aacPath).catch(() => {
          /* non-fatal */
        });
      }
      cached.push(i);
      continue;
    }
    if (liveCalls > 0 && pacing > 0) {
      await sleep(pacing);
    }
    try {
      const audio = await callTtsForTurn({
        text: turn.text,
        voiceCfg,
        ttsModel: input.ttsModel,
      });
      await fsp.writeFile(pcmPath, audio);
      await pcmToAacPreview(pcmPath, aacPath);
      generated.push(i);
      liveCalls++;
    } catch (e) {
      const err = e as Error & { code?: string; blockReason?: string };
      if (err.code === GEMINI_TTS_BLOCKED_CODE) {
        // Safety filter chặn riêng turn này — log + tiếp tục các turn sau.
        blocked.push({ idx: i, reason: err.blockReason ?? "SAFETY" });
        liveCalls++; // vẫn tốn 1 API call → vẫn pace cho lần sau
        console.warn(
          `[batch-tts] turn #${i + 1} blocked: ${err.blockReason ?? "SAFETY"} — skipping`,
        );
        continue;
      }
      throw err; // lỗi khác (quota, network) → abort
    }
  }
  return { range: { from, to }, generated, cached, skipped, blocked };
}

/**
 * Concat audio của các turn được chọn → 1 file AAC preview (`{slug}.script.preview.aac`).
 * UI dùng để cho user nghe thử 1 vài đoạn liên tiếp / không liên tiếp trước
 * khi gen full audio. Chỉ ghép turn đã có PCM cached — turn nào chưa gen sẽ
 * skip + báo lại qua `missing[]` để UI nhắc user.
 *
 * Filename cố định (1 preview/episode, ghi đè) → URL stable, UI cache-bust
 * qua mtime query string.
 */
export async function concatScriptTurnsForPreview(input: {
  episodeName: string;
  turnIndices: number[];
  turnGapMs?: number;
}): Promise<{
  aacFilename: string;
  durationMs: number;
  /** Indices thực sự ghép được (có PCM). */
  included: number[];
  /** Indices được chọn nhưng thiếu PCM cache — UI nhắc user gen trước. */
  missing: number[];
  mtimeMs: number;
}> {
  await fsp.mkdir(TMP_DIR, { recursive: true });
  const gap = input.turnGapMs ?? DEFAULT_TURN_GAP_MS;
  const silence = silenceBuffer(gap);
  const pcmBuffers: Buffer[] = [];
  const included: number[] = [];
  const missing: number[] = [];
  // Sort indices để concat theo thứ tự script (kể cả user check thứ tự lung tung).
  const ordered = [...input.turnIndices].sort((a, b) => a - b);
  for (let k = 0; k < ordered.length; k++) {
    const idx = ordered[k];
    const pcmPath = path.join(
      TMP_DIR,
      turnPcmFilename(input.episodeName, idx),
    );
    if (!fs.existsSync(pcmPath)) {
      missing.push(idx);
      continue;
    }
    pcmBuffers.push(await fsp.readFile(pcmPath));
    included.push(idx);
    if (k < ordered.length - 1) pcmBuffers.push(silence);
  }
  if (included.length === 0) {
    const err = new Error(
      "Không turn nào có audio cached — gen audio trước rồi nghe thử.",
    ) as Error & { code: string };
    err.code = "VALIDATION";
    throw err;
  }
  const rawPath = path.join(
    TMP_DIR,
    `${input.episodeName}.script.preview.pcm`,
  );
  const aacFilename = `${input.episodeName}.script.preview.aac`;
  const aacPath = path.join(TMP_DIR, aacFilename);
  await fsp.writeFile(rawPath, Buffer.concat(pcmBuffers));
  await pcmToAacPreview(rawPath, aacPath);
  await fsp.unlink(rawPath).catch(() => {
    /* ignore */
  });
  const stat = await fsp.stat(aacPath);
  return {
    aacFilename,
    durationMs: await ffprobeDurationMs(aacPath),
    included,
    missing,
    mtimeMs: stat.mtimeMs,
  };
}

/**
 * Xoá toàn bộ cached turn audio (PCM + AAC) cho episode — dùng khi reset
 * script. Scan TMP_DIR theo prefix `{slug}.turn-` để bắt tất cả file dù
 * index không liên tục.
 */
export async function deleteAllScriptTurnAudio(
  episodeName: string,
): Promise<number> {
  const prefix = `${episodeName}.turn-`;
  let removed = 0;
  let entries: string[] = [];
  try {
    entries = await fsp.readdir(TMP_DIR);
  } catch {
    return 0;
  }
  for (const entry of entries) {
    if (!entry.startsWith(prefix)) continue;
    if (!entry.endsWith(".pcm") && !entry.endsWith(".aac")) continue;
    try {
      await fsp.unlink(path.join(TMP_DIR, entry));
      removed++;
    } catch {
      /* ignore */
    }
  }
  return removed;
}

/**
 * List cached audio status cho mọi turn của episode. UI dùng để hiện
 * badge "đã gen / chưa gen" + audio player URL per turn.
 *
 * `mtimeMs` dùng làm cache-bust query string trong UI — sau khi regen,
 * mtime đổi → URL đổi → browser fetch lại file mới (không stale cache).
 */
export async function listScriptTurnAudios(
  episodeName: string,
  turnCount: number,
): Promise<
  Array<{
    idx: number;
    cached: boolean;
    aacFilename: string | null;
    mtimeMs: number | null;
  }>
> {
  const result: Array<{
    idx: number;
    cached: boolean;
    aacFilename: string | null;
    mtimeMs: number | null;
  }> = [];
  for (let i = 0; i < turnCount; i++) {
    const aacFilename = turnAacFilename(episodeName, i);
    const fullPath = path.join(TMP_DIR, aacFilename);
    if (fs.existsSync(fullPath)) {
      const stat = fs.statSync(fullPath);
      result.push({
        idx: i,
        cached: true,
        aacFilename,
        mtimeMs: stat.mtimeMs,
      });
    } else {
      result.push({ idx: i, cached: false, aacFilename: null, mtimeMs: null });
    }
  }
  return result;
}

/**
 * Concat-only: ráp các PCM cache đã gen sẵn → loudnorm AAC → ghi
 * `input/{slug}.aac`. Throw clear error nếu turn nào thiếu PCM (caller phải
 * gen từng turn trước qua UI loop / per-turn endpoint).
 *
 * Dùng khi UI muốn tách bạch phase gen (có progress per-turn) khỏi phase
 * concat — gen xong rồi mới gọi concat 1 lần.
 */
export async function concatScriptAudioFromCache(input: {
  episodeName: string;
  script: PodcastScript;
  turnGapMs?: number;
}): Promise<GenScriptAudioResult & { missing: number[] }> {
  if (input.script.turns.length === 0) {
    const err = new Error(
      "Script không có turn nào — gen kịch bản trước.",
    ) as Error & { code: string };
    err.code = "VALIDATION";
    throw err;
  }

  // Check tất cả turn có PCM cache. Trả `missing[]` để UI nhắc user gen
  // turn nào còn thiếu.
  const missing: number[] = [];
  for (let i = 0; i < input.script.turns.length; i++) {
    const pcmPath = path.join(
      TMP_DIR,
      turnPcmFilename(input.episodeName, i),
    );
    if (!fs.existsSync(pcmPath)) missing.push(i);
  }
  if (missing.length > 0) {
    const err = new Error(
      `${missing.length} turn chưa có PCM cache (turns #${missing.slice(0, 5).map((i) => i + 1).join(", #")}${missing.length > 5 ? "…" : ""}). Gen từng turn trước rồi mới concat.`,
    ) as Error & { code: string; missing: number[] };
    err.code = "MISSING_CACHE";
    err.missing = missing;
    throw err;
  }

  await fsp.mkdir(INPUT_DIR, { recursive: true });
  await fsp.mkdir(TMP_DIR, { recursive: true });
  const turnGap = input.turnGapMs ?? DEFAULT_TURN_GAP_MS;
  const silence = silenceBuffer(turnGap);
  const pcmBuffers: Buffer[] = [];
  for (let i = 0; i < input.script.turns.length; i++) {
    const pcmPath = path.join(
      TMP_DIR,
      turnPcmFilename(input.episodeName, i),
    );
    pcmBuffers.push(await fsp.readFile(pcmPath));
    if (i < input.script.turns.length - 1) pcmBuffers.push(silence);
  }

  const rawPath = path.join(
    TMP_DIR,
    `${input.episodeName}.script.tts.pcm`,
  );
  await fsp.writeFile(rawPath, Buffer.concat(pcmBuffers));
  const outPath = path.join(INPUT_DIR, `${input.episodeName}.aac`);
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
    missing: [],
  };
}

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

  // API key check chuyển vào dispatch (callTtsForTurn) vì voice config khác
  // nhau giữa host_nam vs host_nu có thể dùng provider khác → key kiểm tra
  // lazily theo turn.

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
  const silence = silenceBuffer(turnGap);

  // Loop từng turn — ưu tiên dùng PCM cached trong tmp/ (vd user đã gen
  // từng turn riêng qua nút Gen audio per-turn). Chỉ gọi Gemini cho turn
  // chưa có cache → tránh hit 429 với nhiều turn liên tiếp.
  const pcmBuffers: Buffer[] = [];
  let liveTtsCalls = 0;
  for (let i = 0; i < input.script.turns.length; i++) {
    const turn = input.script.turns[i];
    const voiceCfg = input.voices[turn.speaker];
    if (!voiceCfg) {
      throw new Error(
        `Thiếu voice config cho speaker "${turn.speaker}" (turn #${i}).`,
      );
    }
    const cachedPcmPath = path.join(
      TMP_DIR,
      turnPcmFilename(input.episodeName, i),
    );
    let pcm: Buffer;
    if (!force && fs.existsSync(cachedPcmPath)) {
      pcm = await fsp.readFile(cachedPcmPath);
    } else {
      // Pace giữa các lần gọi Gemini TTS live — chỉ chờ kể từ lần thứ 2,
      // lần đầu không cần đợi. Turn dùng cache không tốn API call nên không
      // tính vào counter này.
      if (liveTtsCalls > 0 && TTS_PACING_MS > 0) {
        await sleep(TTS_PACING_MS);
      }
      let audio: Buffer;
      try {
        audio = await callTtsForTurn({
          text: turn.text,
          voiceCfg,
          ttsModel: input.ttsModel,
        });
      } catch (e) {
        const err = e as Error & { code?: string; blockReason?: string };
        if (err.code === GEMINI_TTS_BLOCKED_CODE) {
          // Gắn turn # vào message để user biết đi sửa turn nào. Concat
          // không thể bỏ qua silently (sẽ thiếu đoạn) → abort + nhắc user.
          const wrap = new Error(
            `Turn #${i + 1} bị TTS chặn (${err.blockReason ?? "SAFETY"}). Sửa text turn này rồi gen lại. Tip: gen từng turn (nút Gen audio cạnh turn) để bypass turn lỗi.`,
          ) as Error & { code: string };
          wrap.code = GEMINI_TTS_BLOCKED_CODE;
          throw wrap;
        }
        throw e;
      }
      pcm = audio;
      liveTtsCalls++;
      // Cũng regen AAC preview cho per-turn UI (không có nó thì audioStatus
      // sẽ thiếu file, dù PCM đã có).
      const aacPath = path.join(
        TMP_DIR,
        turnAacFilename(input.episodeName, i),
      );
      await fsp.writeFile(cachedPcmPath, pcm).catch(() => {
        /* non-fatal */
      });
      await pcmToAacPreview(cachedPcmPath, aacPath).catch(() => {
        /* non-fatal — preview chỉ phục vụ UI play, không ảnh hưởng concat */
      });
    }
    pcmBuffers.push(pcm);
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
