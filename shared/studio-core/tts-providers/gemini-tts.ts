/**
 * Gemini TTS provider — Phase 4b'.
 *
 * Endpoint: generativelanguage.googleapis.com/v1beta/models/{model}:generateContent
 * Auth: API key (`?key=`) — cùng key Gemini LLM, env `GEMINI_API_KEY`.
 * Output: PCM 16-bit signed LE, mono, 24kHz, base64-encoded trong inlineData.
 *
 * USP vs Google Cloud TTS classic: natural-language style steering. Prepend
 * 1 câu hướng dẫn phong cách trước voiceover thật → Gemini áp dụng giọng đó.
 * Cho documentary art, hướng dẫn "trầm ấm, chiêm nghiệm, học thuật, Khan
 * Academy Smarthistory style".
 *
 * Voices: 30 prebuilt voices, language-agnostic (đọc được mọi ngôn ngữ
 * trong 30 ngôn ngữ support). Voice mặc định `Kore` — deep, contemplative.
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

/** Chunk limit conservative — Gemini cho phép dài hơn nhưng chia nhỏ để robust. */
export const GEMINI_CHUNK_LIMIT = 5000;

/** PCM output format từ Gemini TTS — cần khi pipe vào ffmpeg. */
export const GEMINI_PCM_SAMPLE_RATE = 24000;
export const GEMINI_PCM_CHANNELS = 1;

/**
 * Style instruction prepend trước voiceover thật — Gemini sẽ áp dụng phong
 * cách này cho toàn đoạn. Đã tune cho documentary art Vietnamese.
 */
const GALLERY_STYLE_INSTRUCTION =
  'Đọc đoạn voiceover sau với giọng trầm ấm, chiêm nghiệm, học thuật. Phong cách như narrator Khan Academy Smarthistory hoặc Waldemar Januszczak. Tốc độ vừa phải, ngắt câu rõ, giữ pacing chậm rãi. Không thêm cảm thán, đọc tự nhiên theo văn bản:\n\n';

export type GeminiTtsRequest = {
  text: string;
  voice: GeminiVoice;
  model?: GeminiTtsModel;
  apiKey: string;
  /** Override style instruction nếu cần (vd cho music chapter intro). */
  styleInstruction?: string;
};

type GeminiResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        inlineData?: {
          mimeType?: string;
          data?: string;
        };
      }>;
    };
  }>;
  error?: { message?: string };
};

/**
 * Gọi Gemini TTS API → trả raw PCM Buffer (16-bit LE mono 24kHz).
 * Caller cần ffmpeg để convert PCM sang AAC/MP3.
 */
export async function generateGeminiTts(
  input: GeminiTtsRequest,
): Promise<Buffer> {
  const model = input.model ?? DEFAULT_GEMINI_MODEL;
  const style = input.styleInstruction ?? GALLERY_STYLE_INSTRUCTION;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${input.apiKey}`;

  const body = {
    contents: [
      {
        parts: [{ text: style + input.text }],
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

  const data = (await res.json()) as GeminiResponse;
  if (data.error) {
    throw new Error(`Gemini TTS API: ${data.error.message ?? "unknown error"}`);
  }

  const audioBase64 =
    data.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (!audioBase64) {
    throw new Error(
      `Gemini TTS response thiếu audio data — ${JSON.stringify(data).slice(0, 300)}`,
    );
  }

  return Buffer.from(audioBase64, "base64");
}

/**
 * Chunk text theo sentence boundary cho Gemini API limit. Logic giống OpenAI
 * nhưng limit khác (5000 thay vì 4000).
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
