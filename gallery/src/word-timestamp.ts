/**
 * WordTimestamp — Phase 4b.
 *
 * Sau khi TTS sinh audio file, chạy Whisper ngược trên file đó với
 * `tokenLevelTimestamps: true` + language="vi" để lấy timestamp của TỪNG TỪ
 * trong voiceover audio.
 *
 * Output flat array {word, startMs, endMs} — render engine (Phase 4d) align
 * visualBeats[i].sentenceIdx với word timestamps để biết beat thứ i bắt đầu
 * tại millisecond nào.
 *
 * Lý do dùng Whisper ngược thay vì TTS native timestamps:
 *  - OpenAI TTS không trả timestamps
 *  - Whisper.cpp đã có sẵn từ podcast pipeline (zero new infra)
 *  - Accuracy ~0.5s đủ cho align 6-12s/ảnh
 */
import { z } from "zod";

export const WordTimestampSchema = z.object({
  word: z.string(),
  startMs: z.number().int().nonnegative(),
  endMs: z.number().int().nonnegative(),
});
export type WordTimestamp = z.infer<typeof WordTimestampSchema>;
