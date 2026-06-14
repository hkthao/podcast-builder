/**
 * Gemini TTS provider — Cloud TTS API endpoint (Phase 4b' v2).
 *
 * Endpoint: texttospeech.googleapis.com/v1beta1/text:synthesize
 * (KHÁC với AI Studio generativelanguage.googleapis.com — Cloud TTS API
 * cho phép tách `input.prompt` (style) và `input.text` (content) → tránh
 * noise như khi prepend style vào text trong AI Studio API.)
 *
 * Auth: API key Google Cloud (cùng format AIzaSy..., cần enable Text-to-
 * Speech API trong Cloud Console). Env `GEMINI_API_KEY` (hoặc UI Settings).
 *
 * Audio output: MP3 (default) hoặc LINEAR16 PCM. Caller pipe vào ffmpeg
 * loudnorm + AAC re-encode.
 *
 * Voices: 30 prebuilt voices như AI Studio. Voice `Kore` mặc định.
 *
 * Bonus controls: speakingRate (0.25-4.0), pitch (-20 to 20), languageCode
 * (vi-VN, en-US…). Match Cloud TTS Studio UI 1-1.
 */

/** 30 prebuilt voices của Gemini TTS. Source: ai.google.dev docs. */
export const GEMINI_VOICES = [
  "Zephyr",
  "Puck",
  "Charon",
  "Kore",
  "Fenrir",
  "Leda",
  "Orus",
  "Aoede",
  "Callirrhoe",
  "Autonoe",
  "Enceladus",
  "Iapetus",
  "Umbriel",
  "Algieba",
  "Despina",
  "Erinome",
  "Algenib",
  "Rasalgethi",
  "Laomedeia",
  "Achernar",
  "Alnilam",
  "Schedar",
  "Gacrux",
  "Pulcherrima",
  "Achird",
  "Zubenelgenubi",
  "Vindemiatrix",
  "Sadachbia",
  "Sadaltager",
  "Sulafat",
] as const;
export type GeminiVoice = (typeof GEMINI_VOICES)[number];

export const GEMINI_TTS_MODELS = [
  "gemini-2.5-flash-tts",
  "gemini-2.5-pro-tts",
] as const;
export type GeminiTtsModel = (typeof GEMINI_TTS_MODELS)[number];

export const DEFAULT_GEMINI_VOICE: GeminiVoice = "Kore";
export const DEFAULT_GEMINI_MODEL: GeminiTtsModel = "gemini-2.5-flash-tts";

/** Audio encoding output — MP3 đơn giản nhất cho ffmpeg downstream. */
export const GEMINI_AUDIO_ENCODINGS = [
  "MP3",
  "LINEAR16",
  "OGG_OPUS",
  "MULAW",
  "ALAW",
] as const;
export type GeminiAudioEncoding = (typeof GEMINI_AUDIO_ENCODINGS)[number];

/** Chunk limit Cloud TTS API. */
export const GEMINI_CHUNK_LIMIT = 5000;

export const DEFAULT_LANGUAGE_CODE = "vi-VN";
export const DEFAULT_SPEAKING_RATE = 1.0;
export const DEFAULT_PITCH = 0;

/**
 * Style instruction — Cloud TTS API truyền vào `input.prompt` riêng với
 * `input.text` nên TTS KHÔNG đọc đoạn này. Tune cho documentary art VN
 * với accent miền Bắc.
 */
export const DEFAULT_STYLE_INSTRUCTION =
  "Đọc giọng trầm ấm, chiêm nghiệm, học thuật. Tốc độ vừa phải, ngắt câu rõ. Giọng miền Bắc, phong cách documentary nghệ thuật.";

export type GeminiTtsRequest = {
  text: string;
  voice: GeminiVoice;
  model?: GeminiTtsModel;
  apiKey: string;
  /** Style steering — Cloud TTS gửi vào `input.prompt` riêng. */
  styleInstruction?: string;
  /** 0.25 → 4.0. Default 1.0 (tốc độ tự nhiên). */
  speakingRate?: number;
  /** -20 → 20 semitones. Default 0. */
  pitch?: number;
  /** BCP-47 code: vi-VN, en-US, ja-JP… */
  languageCode?: string;
  /** Audio encoding. MP3 default — đơn giản cho ffmpeg auto-detect. */
  audioEncoding?: GeminiAudioEncoding;
};

type CloudTtsResponse = {
  audioContent?: string;
  error?: { message?: string; code?: number };
};

/**
 * Gọi Cloud TTS API → trả audio Buffer (MP3 default, hoặc LINEAR16 PCM).
 * Caller pipe vào ffmpeg để loudnorm + re-encode AAC.
 */
export async function generateGeminiTts(input: GeminiTtsRequest): Promise<{
  audio: Buffer;
  encoding: GeminiAudioEncoding;
}> {
  const encoding = input.audioEncoding ?? "MP3";
  const url = `https://texttospeech.googleapis.com/v1beta1/text:synthesize?key=${input.apiKey}`;

  const body = {
    audioConfig: {
      audioEncoding: encoding,
      speakingRate: input.speakingRate ?? DEFAULT_SPEAKING_RATE,
      pitch: input.pitch ?? DEFAULT_PITCH,
    },
    input: {
      // Cloud TTS: prompt + text tách riêng → TTS KHÔNG đọc prompt
      prompt: input.styleInstruction ?? DEFAULT_STYLE_INSTRUCTION,
      text: input.text,
    },
    voice: {
      languageCode: input.languageCode ?? DEFAULT_LANGUAGE_CODE,
      modelName: input.model ?? DEFAULT_GEMINI_MODEL,
      name: input.voice,
    },
  };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(
      `Cloud TTS API error ${res.status}: ${errText.slice(0, 500)}`,
    );
  }

  const data = (await res.json()) as CloudTtsResponse;
  if (data.error) {
    throw new Error(
      `Cloud TTS API: ${data.error.message ?? "unknown error"} (code ${data.error.code ?? "?"})`,
    );
  }

  if (!data.audioContent) {
    throw new Error(
      `Cloud TTS response thiếu audioContent — ${JSON.stringify(data).slice(0, 300)}`,
    );
  }

  return {
    audio: Buffer.from(data.audioContent, "base64"),
    encoding,
  };
}

/**
 * Chunk text theo sentence boundary cho Cloud TTS limit.
 */
export function chunkTextForGemini(text: string): string[] {
  if (text.length <= GEMINI_CHUNK_LIMIT) return [text];
  const sentences = text.split(/(?<=[.!?])\s+/);
  const chunks: string[] = [];
  let buf = "";
  for (const s of sentences) {
    if ((buf + " " + s).length > GEMINI_CHUNK_LIMIT && buf.length > 0) {
      chunks.push(buf.trim());
      buf = s;
    } else {
      buf = buf ? `${buf} ${s}` : s;
    }
  }
  if (buf) chunks.push(buf.trim());
  return chunks;
}
