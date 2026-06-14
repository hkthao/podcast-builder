/**
 * Gemini TTS provider — AI Studio endpoint (Phase 4b' v3).
 *
 * Endpoint: generativelanguage.googleapis.com/v1beta/.../generateContent
 *
 * Cloud TTS API (texttospeech.googleapis.com) cho structured prompt/text
 * + speakingRate/pitch nhưng REQUIRE OAuth2 (service account JSON), không
 * accept API key — không phù hợp cho local studio dùng API key đơn giản.
 *
 * AI Studio endpoint:
 *  - Accept API key (AIzaSy...) — user dán qua Settings
 *  - Có 30 voice prebuilt (Kore/Aoede/...) — chất lượng giống Cloud TTS
 *  - PCM 24kHz output base64-encoded
 *  - Tách style/content qua `systemInstruction` field (separate từ user
 *    content) — giảm noise so với prepend style vào text
 *  - Không support speakingRate/pitch (Cloud TTS-only) → các field này
 *    bị bỏ qua, dùng default voice tempo
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
  "gemini-2.5-flash-preview-tts",
  "gemini-2.5-pro-preview-tts",
] as const;
export type GeminiTtsModel = (typeof GEMINI_TTS_MODELS)[number];

export const DEFAULT_GEMINI_VOICE: GeminiVoice = "Kore";
export const DEFAULT_GEMINI_MODEL: GeminiTtsModel =
  "gemini-2.5-flash-preview-tts";

/** AI Studio output là PCM 24kHz mono — caller pipe vào ffmpeg s16le. */
export const GEMINI_PCM_SAMPLE_RATE = 24000;
export const GEMINI_PCM_CHANNELS = 1;

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
  /**
   * Style steering — AI Studio nhận qua `systemInstruction` field (separate
   * từ user content) → giảm noise so với prepend vào text.
   */
  styleInstruction?: string;
  /** Cloud TTS-only (không support trên AI Studio). Bỏ qua. */
  speakingRate?: number;
  /** Cloud TTS-only. Bỏ qua. */
  pitch?: number;
  /** Cloud TTS-only. Bỏ qua. */
  languageCode?: string;
};

type AiStudioResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        inlineData?: { mimeType?: string; data?: string };
      }>;
    };
  }>;
  error?: { message?: string; code?: number };
};

/**
 * Gọi AI Studio Gemini TTS → trả PCM Buffer (16-bit LE mono 24kHz).
 * Caller cần ffmpeg `-f s16le -ar 24000 -ac 1` để decode.
 */
export async function generateGeminiTts(input: GeminiTtsRequest): Promise<{
  audio: Buffer;
  /** Cho caller biết format input ffmpeg. */
  encoding: "PCM_S16LE_24K";
}> {
  const model = input.model ?? DEFAULT_GEMINI_MODEL;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${input.apiKey}`;

  // AI Studio TTS không support systemInstruction → prepend style + delimiter
  // vào content. Style cần ngắn + có separator rõ để TTS không đọc.
  const styleText = (input.styleInstruction ?? DEFAULT_STYLE_INSTRUCTION).trim();
  // Pattern recommended bởi Google: instruction trên 1 dòng, separator " | ",
  // sau đó content thật. Voice model thông minh đủ để hiểu prefix là cue.
  const promptedText = styleText
    ? `[Hướng dẫn đọc: ${styleText}]\n\n${input.text}`
    : input.text;

  const body = {
    contents: [
      {
        parts: [{ text: promptedText }],
      },
    ],
    generationConfig: {
      responseModalities: ["AUDIO"],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: input.voice },
        },
      },
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
      `Gemini TTS API error ${res.status}: ${errText.slice(0, 500)}`,
    );
  }

  const data = (await res.json()) as AiStudioResponse;
  if (data.error) {
    throw new Error(
      `Gemini TTS API: ${data.error.message ?? "unknown error"} (code ${data.error.code ?? "?"})`,
    );
  }

  const audioBase64 =
    data.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (!audioBase64) {
    throw new Error(
      `Gemini TTS response thiếu audio — ${JSON.stringify(data).slice(0, 300)}`,
    );
  }

  return {
    audio: Buffer.from(audioBase64, "base64"),
    encoding: "PCM_S16LE_24K",
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
