/**
 * Editorial overlay data — lớp "biên tập gốc" hiển thị trên video.
 *
 * Mục tiêu ORIGINALITY (Meta): biến TTS đọc thuần thành sản phẩm có biên tập
 * — tiêu đề chương + trích dẫn có ghi nguồn — thứ Meta xếp là "đóng góp mạnh"
 * (không như phụ đề đọc nguyên văn = "đóng góp yếu"). Xem
 * docs/originality-upgrade-plan.md §3.4.
 *
 * Sinh bởi `podcast/scripts/gen-editorial.ts` (LLM pass), tiêu thụ bởi
 * `EditorialOverlay.tsx`. File `tmp/<slug>.editorial.json` có thể sửa tay.
 */

/** Mốc bắt đầu một "chương" nội dung + tiêu đề ngắn (KHÔNG dạng "Phần X"). */
export type EditorialChapter = {
  /** ms tính theo mốc 0 của transcript (audio). */
  atMs: number;
  /** Tiêu đề ngắn ≤6 từ, văn nói tự nhiên. */
  title: string;
};

/** Trích dẫn một nhà tư tưởng / thuyết / khái niệm, kèm nguồn ngắn. */
export type EditorialCitation = {
  /** ms khi tên được nhắc rõ trong audio. */
  atMs: number;
  /** Tên hiển thị, vd "Epicurus", "Robert Jay Lifton", "Tam bất hủ". */
  name: string;
  /** Nhãn nguồn ngắn ≤6 từ, vd "Thuyết quản trị nỗi sợ", "Bất tử biểu tượng". */
  source: string;
};

export type Editorial = {
  version: 1;
  generatedAt: string;
  chapters: EditorialChapter[];
  citations: EditorialCitation[];
};

export const EMPTY_EDITORIAL: Editorial = {
  version: 1,
  generatedAt: "",
  chapters: [],
  citations: [],
};
