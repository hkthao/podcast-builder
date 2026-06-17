/**
 * Pricing + cost estimator cho Gemini TTS — UI ước tính chi phí gen audio
 * script trước khi gen thật.
 *
 * Tham khảo ai.google.dev/gemini-api/docs/pricing (audio output models).
 * Giá thay đổi theo thời gian → caller có thể override qua param `pricing`
 * khi cần (vd user paste giá mới từ Settings).
 *
 * Token heuristic:
 *  - Input text token ≈ ceil(chars / 4) — standard SentencePiece tokenizer
 *    cho text mixed VN/EN
 *  - Output audio token ≈ 32 token/sec audio gen — Gemini TTS spec hiện tại
 *  - Estimated duration ≈ words / WORDS_PER_MIN × 60 (default 150 WPM —
 *    pacing podcast tự nhiên tiếng Việt)
 *
 * Lưu ý: pricing chính thức Google list "audio output token" tính theo
 * speech-token (≠ text token). Đây là ước tính ± 20-30%, không phải con số
 * chính xác từ billing console.
 */

export type GeminiTtsPricing = {
  /** USD per 1M input text tokens (text + style instruction). */
  inputUsdPer1M: number;
  /** USD per 1M output audio tokens. */
  outputUsdPer1M: number;
};

/**
 * Pricing snapshot — cập nhật theo Google AI Studio pricing page.
 * Last reviewed: 2026-06. Update khi Google đổi pricing tier.
 */
export const GEMINI_TTS_PRICING: Record<string, GeminiTtsPricing> = {
  "gemini-3.1-flash-tts-preview": { inputUsdPer1M: 0.5, outputUsdPer1M: 10 },
  "gemini-2.5-flash-preview-tts": { inputUsdPer1M: 0.5, outputUsdPer1M: 10 },
  "gemini-2.5-flash-lite-preview-tts": {
    inputUsdPer1M: 0.3,
    outputUsdPer1M: 6,
  },
  "gemini-2.5-pro-preview-tts": { inputUsdPer1M: 1.0, outputUsdPer1M: 20 },
};

export const DEFAULT_GEMINI_TTS_PRICING: GeminiTtsPricing = {
  inputUsdPer1M: 0.5,
  outputUsdPer1M: 10,
};

const CHARS_PER_INPUT_TOKEN = 4;
const AUDIO_TOKENS_PER_SEC = 32;
const DEFAULT_WORDS_PER_MIN = 150;

export type TtsTurnInput = {
  /** Text được TTS đọc. */
  text: string;
  /** Style instruction prepended trong prompt (chỉ tính tokens). */
  styleInstruction?: string;
};

export type TtsCostEstimate = {
  /** Tổng turn được tính (đã skip turn cached nếu caller filter trước). */
  turnCount: number;
  /** Word count tổng — UI hiển thị reference. */
  wordCount: number;
  /** Estimated duration (sec) — words / WPM. */
  estDurationSec: number;
  /** Input text tokens (ceil(chars / 4)). */
  inputTokens: number;
  /** Output audio tokens (duration × 32 tok/sec). */
  outputTokens: number;
  /** USD cost — input + output theo pricing. */
  usd: number;
  /** Pricing được dùng (cho UI hiển thị "Pro: $X, Flash: $Y..."). */
  pricing: GeminiTtsPricing;
};

export function estimateGeminiTtsCost(input: {
  turns: TtsTurnInput[];
  model?: string;
  pricing?: GeminiTtsPricing;
  wordsPerMin?: number;
}): TtsCostEstimate {
  const pricing =
    input.pricing ??
    (input.model
      ? GEMINI_TTS_PRICING[input.model] ?? DEFAULT_GEMINI_TTS_PRICING
      : DEFAULT_GEMINI_TTS_PRICING);
  const wpm = input.wordsPerMin ?? DEFAULT_WORDS_PER_MIN;

  let totalChars = 0;
  let totalWords = 0;
  for (const turn of input.turns) {
    const text = turn.text.trim();
    if (!text) continue;
    // Prompt thật gửi đến Gemini = "[style]\n\ntext" → cộng cả 2 vào input.
    const styleChars = (turn.styleInstruction ?? "").trim().length;
    totalChars += text.length + styleChars + 4; // +4 cho brackets + newlines
    totalWords += text.split(/\s+/).filter(Boolean).length;
  }

  const inputTokens = Math.ceil(totalChars / CHARS_PER_INPUT_TOKEN);
  const estDurationSec = (totalWords / wpm) * 60;
  const outputTokens = Math.ceil(estDurationSec * AUDIO_TOKENS_PER_SEC);
  const usd =
    (inputTokens / 1_000_000) * pricing.inputUsdPer1M +
    (outputTokens / 1_000_000) * pricing.outputUsdPer1M;

  return {
    turnCount: input.turns.filter((t) => t.text.trim()).length,
    wordCount: totalWords,
    estDurationSec,
    inputTokens,
    outputTokens,
    usd,
    pricing,
  };
}

/**
 * Format USD cost cho UI — auto-pick precision:
 *  - $1+      → 2 chữ số ($1.23)
 *  - $0.01+   → 3 chữ số ($0.045)
 *  - <$0.01   → 4 chữ số ($0.0023)
 */
export function formatUsdCost(usd: number): string {
  if (usd >= 1) return `$${usd.toFixed(2)}`;
  if (usd >= 0.01) return `$${usd.toFixed(3)}`;
  return `$${usd.toFixed(4)}`;
}
