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
  "gemini-3.1-flash-tts-preview",
  "gemini-2.5-flash-preview-tts",
  "gemini-2.5-flash-lite-preview-tts",
  "gemini-2.5-pro-preview-tts",
] as const;
export type GeminiTtsModel = (typeof GEMINI_TTS_MODELS)[number];

export const DEFAULT_GEMINI_VOICE: GeminiVoice = "Kore";
// Default → Gemini 3.1 Flash (newest, recommended balance quality/cost)
export const DEFAULT_GEMINI_MODEL: GeminiTtsModel =
  "gemini-3.1-flash-tts-preview";

/** AI Studio output là PCM 24kHz mono — caller pipe vào ffmpeg s16le. */
export const GEMINI_PCM_SAMPLE_RATE = 24000;
export const GEMINI_PCM_CHANNELS = 1;

/** Chunk limit Cloud TTS API. */
export const GEMINI_CHUNK_LIMIT = 5000;

export const DEFAULT_LANGUAGE_CODE = "vi-VN";
export const DEFAULT_SPEAKING_RATE = 1.0;
export const DEFAULT_PITCH = 0;

/**
 * Style instruction — Gemini TTS hiểu bracketed "director's notes" ngay
 * trong prompt (per Gemini docs). Pattern:
 *   [Style descriptor at start] + actual text
 *
 * Có thể chèn audio tags inline trong text để control biểu cảm:
 *   [whispers] — thì thầm
 *   [sighs]    — thở dài
 *   [laughs]   — cười
 *
 * Default tune cho documentary art VN, giọng miền Bắc trầm ấm.
 */
export const DEFAULT_STYLE_INSTRUCTION =
  "Hồ sơ âm thanh — narrator phim tài liệu nghệ thuật: giọng nam miền Bắc, trầm ấm, chiêm nghiệm, học thuật. Tốc độ vừa phải, ngắt câu rõ, pacing chậm rãi như Khan Academy Smarthistory";

/**
 * Backend channel cho Gemini TTS — quyết định endpoint URL + billing project.
 *  - "ai-studio": generativelanguage.googleapis.com, AI Studio key (AIza...).
 *    Free tier hạn chế, dễ tốn tiền nếu hit quota cao.
 *  - "vertex-express": aiplatform.googleapis.com Express Mode, Vertex/Agent
 *    Platform key (AQ.Ab8...). Free tier hào phóng — ~15 RPM, 1500 RPD,
 *    1M TPM. Cùng model + request body — chỉ khác URL.
 */
export type GeminiChannel = "ai-studio" | "vertex-express";

const CHANNEL_BASE_URL: Record<GeminiChannel, string> = {
  "ai-studio": "https://generativelanguage.googleapis.com/v1beta",
  "vertex-express":
    "https://aiplatform.googleapis.com/v1beta1/publishers/google",
};

export type GeminiTtsRequest = {
  text: string;
  voice: GeminiVoice;
  model?: GeminiTtsModel;
  apiKey: string;
  /**
   * Backend channel — default "ai-studio" để backward-compat. Khi user dùng
   * AQ key từ Agent Platform Studio → "vertex-express".
   */
  channel?: GeminiChannel;
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
    finishReason?: string;
    safetyRatings?: Array<{ category?: string; probability?: string }>;
  }>;
  promptFeedback?: {
    blockReason?: string;
    safetyRatings?: Array<{ category?: string; probability?: string }>;
  };
  error?: { message?: string; code?: number };
};

/**
 * Error code dùng để caller phân biệt content bị Gemini safety filter chặn
 * (sửa text được) vs lỗi quota / network khác (retry / chờ).
 */
export const GEMINI_TTS_BLOCKED_CODE = "TTS_BLOCKED";

/**
 * Gọi AI Studio Gemini TTS → trả PCM Buffer (16-bit LE mono 24kHz).
 * Caller cần ffmpeg `-f s16le -ar 24000 -ac 1` để decode.
 */
/**
 * Normalize model name về dạng AI Studio v1beta. Tự fix:
 *  - Cloud TTS names (no -preview-) → AI Studio (-preview-)
 *  - Legacy localStorage values từ thời thử Cloud TTS
 */
const LEGACY_MODEL_MAP: Record<string, string> = {
  "gemini-2.5-flash-tts": "gemini-2.5-flash-preview-tts",
  "gemini-2.5-pro-tts": "gemini-2.5-pro-preview-tts",
  "gemini-2.5-flash-lite-tts": "gemini-2.5-flash-lite-preview-tts",
};

const toAiStudioModel = (m: string | undefined): string => {
  const raw = m ?? DEFAULT_GEMINI_MODEL;
  return LEGACY_MODEL_MAP[raw] ?? raw;
};

/**
 * Parse retry delay từ Google API 429 response. Hỗ trợ 2 nguồn:
 *  1. body.error.details[].retryDelay = "53.4s" (Google standard)
 *  2. body.error.message chứa "retry in 53.426s" (text fallback)
 * Default 30s nếu không parse được.
 */
function parseRetryDelaySec(rawBody: string): number {
  try {
    const parsed = JSON.parse(rawBody) as {
      error?: {
        message?: string;
        details?: Array<{ "@type"?: string; retryDelay?: string }>;
      };
    };
    const details = parsed.error?.details ?? [];
    for (const d of details) {
      if (d.retryDelay) {
        const m = d.retryDelay.match(/^([\d.]+)s?$/);
        if (m) return Math.ceil(parseFloat(m[1]));
      }
    }
    const msg = parsed.error?.message ?? "";
    const m = msg.match(/retry in ([\d.]+)s/i);
    if (m) return Math.ceil(parseFloat(m[1]));
  } catch {
    /* not JSON or parse error → fall through */
  }
  return 30;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function generateGeminiTts(input: GeminiTtsRequest): Promise<{
  audio: Buffer;
  /** Cho caller biết format input ffmpeg. */
  encoding: "PCM_S16LE_24K";
}> {
  const model = toAiStudioModel(input.model);
  const channel = input.channel ?? "ai-studio";
  const baseUrl = CHANNEL_BASE_URL[channel];
  const url = `${baseUrl}/models/${model}:generateContent?key=${input.apiKey}`;

  // AI Studio TTS không support systemInstruction → prepend style + delimiter
  // vào content. Style cần ngắn + có separator rõ để TTS không đọc.
  const styleText = (
    input.styleInstruction ?? DEFAULT_STYLE_INSTRUCTION
  ).trim();
  // Pattern per Gemini docs: "[director's note]\n\nactual text". Gemini hiểu
  // bracketed prefix là cue âm thanh, không đọc thành tiếng. User có thể chèn
  // audio tags inline như [whispers], [sighs], [laughs] trong text để control
  // biểu cảm giữa câu.
  const promptedText = styleText
    ? `[${styleText}]\n\n${input.text}`
    : input.text;

  // Vertex AI YÊU CẦU `role: "user"` trong contents — AI Studio thì optional
  // nhưng chấp nhận. Set unconditionally để 1 body work cho cả 2 channel.
  const body = {
    contents: [
      {
        role: "user",
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

  // Retry tối đa 3 lần khi gặp 429 — đọc retryDelay từ Google API response.
  // Free tier limit 10 req/min cho gemini-3.1-flash-tts; loop TTS turn-by-turn
  // (30-60 turns/script) sẽ hit limit này → tự pace + chờ.
  const MAX_429_RETRIES = 3;
  for (let attempt = 0; attempt <= MAX_429_RETRIES; attempt++) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (res.status === 429) {
      if (attempt === MAX_429_RETRIES) {
        const errText = await res.text();
        throw new Error(
          `Gemini TTS quota exceeded (429) sau ${MAX_429_RETRIES + 1} lần thử. Đợi 1 phút rồi gen lại, hoặc upgrade quota. Raw: ${errText.slice(0, 300)}`,
        );
      }
      const errText = await res.text();
      const waitSec = Math.min(90, parseRetryDelaySec(errText));
      console.warn(
        `[gemini-tts] 429 quota exceeded — đợi ${waitSec}s rồi retry (attempt ${attempt + 1}/${MAX_429_RETRIES + 1})`,
      );
      await sleep(waitSec * 1000);
      continue;
    }

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
      // Bị Gemini safety filter chặn → surface error code riêng để batch
      // gen có thể skip turn này + tiếp tục, thay vì abort cả pipeline.
      const blockReason = data.promptFeedback?.blockReason;
      const finishReason = data.candidates?.[0]?.finishReason;
      if (blockReason || finishReason === "SAFETY") {
        const reason = blockReason ?? finishReason ?? "SAFETY";
        const err = new Error(
          `Gemini chặn nội dung (${reason}) — sửa text turn này hoặc bỏ qua. Có thể do âm điệu/từ ngữ nhạy cảm bị filter hiểu lầm.`,
        ) as Error & { code: string; blockReason: string };
        err.code = GEMINI_TTS_BLOCKED_CODE;
        err.blockReason = reason;
        throw err;
      }
      throw new Error(
        `Gemini TTS response thiếu audio — ${JSON.stringify(data).slice(0, 300)}`,
      );
    }

    return {
      audio: Buffer.from(audioBase64, "base64"),
      encoding: "PCM_S16LE_24K",
    };
  }
  // Unreachable vì loop sẽ throw hoặc return trong attempt cuối
  throw new Error("Gemini TTS retry loop bị thoát bất thường");
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
