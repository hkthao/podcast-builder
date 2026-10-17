import fs from "node:fs";
import path from "node:path";

/**
 * Prompt shot-list footage DÙNG CHUNG mọi tập (key "podcast.footage-shotlist",
 * sửa được ở /prompts) + nguyên tắc bố cục theo khung + thư viện mô-típ
 * (podcast/data/footage-motifs.json). footage-plan.ts dùng cho cả 2 đường:
 * Claude Code (--brief / --shotlist, miễn phí) và OpenAI (dự phòng).
 */

export const FOOTAGE_SHOTLIST_SYSTEM_PROMPT = `Bạn là đạo diễn hình ảnh b-roll cho video podcast triết học/tâm lý tiếng Việt. Input là danh sách BEAT — mỗi beat là 1 khúc lời thoại có mốc thời gian. Với MỖI beat, chọn hình ảnh ẨN DỤ cho Ý CHÍNH của đúng khúc đó (KHÔNG chọn cảnh đẹp chung chung).

Mỗi beat trả:
- i: số beat (giữ nguyên)
- label: nhãn ngắn tiếng Việt (≤6 từ)
- idea: 1 câu tiếng Việt — hình ảnh gì, vì sao hợp ý đoạn này
- queries: 3 cụm tìm kiếm Pexels TIẾNG ANH, 2-5 từ, CỤ THỂ + QUAY ĐƯỢC (vật/cảnh/hiện tượng có thật), mỗi cụm 1 góc khác nhau của cùng ý.

LUẬT:
1. NỘI DUNG > MÀU. Query bám ý của khúc lời thoại. Màu chủ đề chỉ là gợi ý phụ (ánh sáng/giờ trong ngày), KHÔNG được làm lệch ý.
2. TUYỆT ĐỐI KHÔNG NGƯỜI (no people/person/face/hands/crowd). Gợi người bằng vật thể, nơi chốn vắng, thiên nhiên, hiện tượng (ghế trống, tách trà bốc khói, dấu chân trên cát, khung cửa sổ, bức thư cũ, đôi giày cũ).
3. ĐA DẠNG: không lặp cùng 1 cảnh giữa các beat.
4. Khúc lời nhắc vật/cảnh CỤ THỂ (cây cầu, cơn mưa, bữa cơm, đàn piano, Trái Đất từ vũ trụ…) → dùng đúng hình đó. Khúc trừu tượng → chọn ẩn dụ từ THƯ VIỆN MÔ-TÍP (nếu hợp) hoặc tự nghĩ ẩn dụ mới cùng tinh thần. Tránh các query trong mục "avoid".
5. Tuân thủ NGUYÊN TẮC BỐ CỤC của khung (cỡ cảnh, đường nét, chuyển động) — thêm từ khoá như "close up"/"macro" (dọc) hoặc "wide shot"/"aerial"/"static" (ngang) khi hợp.

Chỉ JSON: {"beats":[{"i":0,"label":"...","idea":"...","queries":["...","...","..."]}]}. KHÔNG markdown.`;

/** Nguyên tắc bố cục theo khung (user chốt) — đưa vào user content mỗi brief. */
export const FOOTAGE_FORMAT_GUIDE = {
  portrait: `KHUNG DỌC 9:16 (Reels): chủ thể ở GIỮA khung (center-framed), mọi diễn biến quan trọng nằm vùng trung tâm. Ưu tiên ĐƯỜNG NÉT THẲNG ĐỨNG (thân cây cao, góc toà nhà, mưa rơi thẳng, khe sáng chiếu từ trên xuống). Ưu tiên CẬN CẢNH / MACRO — chi tiết vi mô khuếch đại cảm xúc nội tâm (than hồng nứt, giọt nước rơi xao động mặt hồ, làn khói mỏng). Nhịp cắt có thể dồn dập hơn ở đoạn cao trào.`,
  landscape: `KHUNG NGANG 16:9 (YouTube, điện ảnh): QUY TẮC 1/3 + KHÔNG GIAN ÂM — chủ thể (chiếc lá, cây lẻ loi) lệch 1/3 trái/phải, 2/3 là khoảng trống (trời xám, mặt hồ sương) → cảm giác chới với, trống rỗng. Ưu tiên đường nét NẰM NGANG / hút sâu vô tận (đường chân trời mờ sương, lan can kéo dài, con đường vắng). Ưu tiên CẢNH TOÀN / CẢNH VIỄN (wide / extreme wide) phô sự mênh mông, cô độc. Máy TĨNH hoặc LIA NGANG / tiến tới RẤT CHẬM, giữ nhịp thở tĩnh lặng.`,
} as const;

export type FootageOrientation = keyof typeof FOOTAGE_FORMAT_GUIDE;

export const FOOTAGE_MOTIFS_PATH = path.resolve("podcast/data/footage-motifs.json");

type Motifs = {
  motifs: Array<{ idea: string; portrait?: string[]; landscape?: string[] }>;
  avoid?: string[];
};

/** Thư viện mô-típ dạng text gọn cho đúng khung (rỗng nếu file lỗi/thiếu). */
export function motifLibraryText(orientation: FootageOrientation): string {
  try {
    const j = JSON.parse(fs.readFileSync(FOOTAGE_MOTIFS_PATH, "utf-8")) as Motifs;
    const lines = j.motifs.map((m) => {
      const qs = [...(m[orientation] ?? []), ...(m[orientation === "portrait" ? "landscape" : "portrait"] ?? []).slice(0, 1)];
      return `- ${m.idea}: ${qs.map((q) => `"${q}"`).join(", ")}`;
    });
    const avoid = j.avoid?.length ? `\nTRÁNH: ${j.avoid.join("; ")}` : "";
    return `THƯ VIỆN MÔ-TÍP (ý → query gợi ý, ưu tiên cho khung này):\n${lines.join("\n")}${avoid}`;
  } catch {
    return "";
  }
}

export type ShotlistBeatInput = { i: number; startSec: number; endSec: number; text: string };

const fmtMmSs = (sec: number): string =>
  `${String(Math.floor(sec / 60)).padStart(2, "0")}:${String(Math.floor(sec % 60)).padStart(2, "0")}`;

/** User content cho shot-list: tiêu đề + màu (phụ) + bố cục khung + thư viện + beat. */
export function buildFootageShotlistUserContent(opts: {
  title: string;
  accentColor: string | null;
  orientation: FootageOrientation;
  beats: ShotlistBeatInput[];
}): string {
  const color = opts.accentColor
    ? `\nMàu chủ đề tập (gợi ý PHỤ, không ép): ${opts.accentColor}.`
    : "";
  const list = opts.beats
    .map((b) => `#${b.i} [${fmtMmSs(b.startSec)}–${fmtMmSs(b.endSec)}] ${b.text.slice(0, 900)}`)
    .join("\n\n");
  const lib = motifLibraryText(opts.orientation);
  return `Tiêu đề tập: ${opts.title}${color}\n\nNGUYÊN TẮC BỐ CỤC:\n${FOOTAGE_FORMAT_GUIDE[opts.orientation]}${lib ? `\n\n${lib}` : ""}\n\nBEAT (${opts.beats.length}):\n${list}\n\nTrả JSON shot-list cho ĐỦ ${opts.beats.length} beat.`;
}
