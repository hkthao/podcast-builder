/**
 * Spell-fix dictionary — user-editable. User paste list dạng:
 *
 *   wrong → right
 *   wrong -> right
 *   wrong | right
 *
 * 1 cặp / dòng. Parser tự nhận format. Dòng trống / bắt đầu bằng `#` = bỏ qua.
 *
 * UI persist textarea content qua localStorage, lần đầu mount = seed bằng
 * DEFAULT_SUGGESTED_RULES_TEXT để user có sẵn ví dụ — sau đó tự edit.
 */

export type SpellFixRule = {
  wrong: string;
  right: string;
  note?: string;
};

export type SpellFixResult = {
  text: string;
  /** Mảng các thay thế đã áp dụng — {wrong, right, count}. */
  applied: Array<{ wrong: string; right: string; count: number; note?: string }>;
};

/**
 * Seed text khi user lần đầu mở dialog. List này có thể edit/xoá hoàn toàn
 * — chỉ là starter để user paste corrections riêng.
 */
export const DEFAULT_SUGGESTED_RULES_TEXT = `# Dán danh sách lỗi chính tả ở đây — 1 cặp / dòng.
# Format: wrong → right  (hoặc dùng -> hoặc |)
# Dòng bắt đầu # = comment, bỏ qua.

sinh vật khá hạn → sinh vật khác hẳn
viết đứt gãy này → sự đứt gãy này
chậm dãi → chậm rãi
Ôi nhắc mấy nhờ → Ôi nhắc mới nhớ
bùa vây bởi màn hình → bao vây bởi màn hình
chat GPT → ChatGPT
Chat GPT → ChatGPT
táp mới → tab mới
rơi rạc → rời rạc
chăn chở → trăn trở
chăn trở → trăn trở
mũi trang hoàn hảo → ngụy trang hoàn hảo
cái vòi thuộc của mình → cái vòi bạch tuộc của mình
công từ nghe rất hả lâm → cụm từ nghe rất hàn lâm
cortison → cortisol
nó nạn cảm xúc của mình như đất xét vậy → nó nặn cảm xúc của mình như đất sét vậy
chạy lòng → chạnh lòng
tí vết → tì vết
Bồ Duliat → Baudrillard
luật like → lượt like
mọi nét nhan → mọi nét nhăn
mặt sát → ma sát
có thể là sao chị → có nghĩa là sao chị
hòa hợp lầm một → hòa hợp làm một
khoan khoái → sảng khoái
danh giới cuối cùng → ranh giới cuối cùng
danh giới giữa sống và chết → ranh giới giữa sống và chết
danh giới → ranh giới
kỳ nguyên → kỷ nguyên
đã trụp → đã chụp
nổi ra gà → nổi da gà
sự kết quệ về mạng tinh thần → sự kiệt quệ về mặt tinh thần
sự kết quệ → sự kiệt quệ
rắn chặt vào màn hình → dán chặt vào màn hình
trường khắc nghiệt nào → môi trường khắc nghiệt nào
ân cần những gì đã cũ → buông bỏ những gì đã cũ
cây quốc → cây cuốc
gọt rũa → gọt giũa
offload chi nhánh lên đám mây → offload trí nhớ lên đám mây
những phần tích đa chiều → những phân tích đa chiều
một chạm rừng chân bên đường → một trạm dừng chân bên đường
thức đoạt đi tính bản thiện → tước đoạt đi tính bản thiện
tay chào → tay lái
rượu dã → rệu rã
dẹt dẹt → rẹt rẹt
`;

/**
 * Parse textarea content thành SpellFixRule[]. Strip BOM, dòng trống, dòng
 * comment (#). Hỗ trợ separator: → | -> | | (pipe).
 */
export function parseRulesText(text: string): SpellFixRule[] {
  const rules: SpellFixRule[] = [];
  const lines = text.replace(/^﻿/, "").split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line.startsWith("#")) continue;
    // Tách theo separator đầu tiên xuất hiện. Thứ tự priority: → > -> > |
    let sepIdx = -1;
    let sepLen = 0;
    const arrowIdx = line.indexOf("→");
    if (arrowIdx >= 0) {
      sepIdx = arrowIdx;
      sepLen = "→".length;
    } else {
      const dashArrowIdx = line.indexOf("->");
      if (dashArrowIdx >= 0) {
        sepIdx = dashArrowIdx;
        sepLen = 2;
      } else {
        const pipeIdx = line.indexOf("|");
        if (pipeIdx >= 0) {
          sepIdx = pipeIdx;
          sepLen = 1;
        }
      }
    }
    if (sepIdx < 0) continue;
    const wrong = line.slice(0, sepIdx).trim();
    let rightPart = line.slice(sepIdx + sepLen).trim();
    if (!wrong || !rightPart) continue;
    // Optional inline note: "right  // note text" or "right  -- note text"
    let note: string | undefined;
    const noteMatch = rightPart.match(/\s+(?:\/\/|--)\s+(.+)$/);
    if (noteMatch) {
      note = noteMatch[1].trim();
      rightPart = rightPart.slice(0, noteMatch.index).trim();
    }
    rules.push({ wrong, right: rightPart, ...(note ? { note } : {}) });
  }
  // Sort theo độ dài wrong giảm dần — luật dài match trước để tránh overlap
  // (vd "danh giới cuối cùng" match trước "danh giới" generic).
  rules.sort((a, b) => b.wrong.length - a.wrong.length);
  return rules;
}

/** Escape regex special chars trong rule.wrong để dùng RegExp. */
const escapeRegex = (s: string): string =>
  s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Apply rules cho 1 đoạn text. Case-insensitive match. Trả về text sửa
 * + danh sách replacement đã áp dụng (kèm count).
 */
export function applySpellFix(
  text: string,
  rules: SpellFixRule[],
): SpellFixResult {
  let result = text;
  const applied: SpellFixResult["applied"] = [];
  for (const rule of rules) {
    if (!rule.wrong) continue;
    const re = new RegExp(escapeRegex(rule.wrong), "gi");
    const matches = result.match(re);
    if (matches && matches.length > 0) {
      result = result.replace(re, rule.right);
      applied.push({
        wrong: rule.wrong,
        right: rule.right,
        count: matches.length,
        note: rule.note,
      });
    }
  }
  return { text: result, applied };
}
