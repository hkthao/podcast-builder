/**
 * Visual beat — Phase 4a.
 *
 * Khi user duyệt 1 narration chapter, LLM sinh KÈM:
 *   - transcript (prose) cho TTS đọc
 *   - visualBeats (sidecar) — danh sách "khoảnh khắc hình ảnh" anchored
 *     theo sentence index trong transcript
 *
 * Lúc render (Phase 4d), beats được align với word timestamps từ TTS+Whisper
 * (Phase 4b) để biết MỖI BEAT bắt đầu/kết thúc tại millisecond nào trong audio.
 *
 * Anchor design: dùng sentenceIdx (0-indexed sau khi split bằng [.!?]) thay vì
 * char range. Fragile hơn token nhưng survive edit nhẹ (sửa chính tả, từ vựng).
 * Nếu user edit nặng → mismatch → UI hiện cảnh báo + nút "Re-suggest beats".
 */
import { z } from "zod";

/** Hiệu ứng camera trên ảnh tĩnh — Remotion render với interpolate. */
export const KEN_BURNS_MODES = [
  "zoom-in",      // phóng to vào trung tâm (default cho ảnh chân dung)
  "zoom-out",     // thu nhỏ ra (default cho ảnh toàn cảnh)
  "pan-left",     // dịch từ phải sang trái
  "pan-right",    // dịch từ trái sang phải
  "pan-up",       // dịch lên (cho tranh cao/dọc)
  "pan-down",     // dịch xuống
  "static",       // không motion (cho text/diagram)
] as const;
export type KenBurnsMode = (typeof KEN_BURNS_MODES)[number];

export const VisualBeatSchema = z.object({
  /**
   * Sentence index (0-based) trong transcript chapter. Anchor để biết
   * beat bắt đầu ở câu nào. Render engine align với TTS word timestamps
   * để tính ms.
   */
  sentenceIdx: z.number().int().min(0),
  /**
   * Mô tả hình ảnh cần hiển thị — keyword search cho Wikimedia/Met +
   * gợi ý cho asset team. Vd: "Mona Lisa portrait close-up", "Arena Chapel
   * interior wide shot", "Lamentation Mary cradling Christ detail".
   * NÊN dùng tiếng Anh để search engine ra ảnh đúng (tên tác phẩm gốc).
   */
  keyword: z.string().min(2),
  /**
   * Asset đã pin/save trong Research library — link tới gallery_assets.id.
   * Null = chưa attach, beat chỉ có keyword. User attach sau khi review.
   */
  assetIdRef: z.string().nullable().default(null),
  /** Camera motion. Default "zoom-in" cho ảnh chân dung/portrait. */
  kenBurns: z.enum(KEN_BURNS_MODES).default("zoom-in"),
  /**
   * Override thời lượng (ms). null = auto = từ start của câu này đến start
   * câu của beat sau (hoặc end audio). Set khi muốn beat ngắn/dài thủ công.
   */
  durationMs: z.number().int().nullable().default(null),
  /** Note tự do cho asset team — vd "ảnh phải có chữ ký Giotto trong góc". */
  note: z.string().default(""),
});
export type VisualBeat = z.infer<typeof VisualBeatSchema>;
