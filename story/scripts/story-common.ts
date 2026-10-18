/** Đọc input/<slug>.story.json + tách câu — dùng chung cho story-tts-brief và story-align. */
import fs from "node:fs";
import path from "node:path";

export type StorySection = {
  id: string;
  /** Tiêu đề chương hiện trên video (EditorialOverlay). Bỏ trống = không mở chương. */
  chapter?: string;
  /** true → hiện trích dẫn nguồn ở câu đầu phần này. */
  cite?: boolean;
  text: string;
};

export type Story = {
  title: string;
  source?: { name: string; title: string };
  /** Giọng Gemini đã khoá cho series (AI Studio → Speaker settings → Voice). */
  geminiVoice?: string;
  /** Director's note gửi kèm (Style/Pace…). Bỏ trống = mặc định trong story-tts-gemini.ts. */
  geminiDirectorNote?: string;
  /**
   * Tăng tốc audio khi ghép (atempo, giữ cao độ). Gemini bỏ qua chỉ đạo "đọc nhanh"
   * → chỉnh tốc độ ở bước ghép. Autonoe đã duyệt: 1.1. Bỏ trống = 1.
   */
  tempo?: number;
  sections: StorySection[];
};

export const INPUT_DIR = path.resolve("input");
export const TMP_DIR = path.resolve("tmp");

export const readStory = (slug: string): Story => {
  const p = path.join(INPUT_DIR, `${slug}.story.json`);
  if (!fs.existsSync(p)) throw new Error(`Không thấy ${p}`);
  return JSON.parse(fs.readFileSync(p, "utf-8")) as Story;
};

/** Tách đoạn → câu, GIỮ dấu kết thúc. */
export const splitSentences = (text: string): string[] =>
  (text.replace(/\s+/g, " ").trim().match(/[^.!?…]+[.!?…]*/g) ?? [])
    .map((s) => s.trim())
    .filter(Boolean);

/** Mọi câu của tập theo thứ tự, kèm chỉ số section. */
export const storySentences = (story: Story): Array<{ section: number; text: string }> =>
  story.sections.flatMap((sec, si) =>
    splitSentences(sec.text).map((text) => ({ section: si, text })),
  );

export const wordCount = (s: string) => s.split(/\s+/).filter(Boolean).length;

/**
 * Chữ tối đa mỗi phần. AI Studio (dán tay) gen tối đa ~1'30/lần → 200.
 * API gen được dài hơn — mỗi phần là 1 lần "diễn" riêng nên giọng/tông lệch ở chỗ
 * chuyển phần (đã gặp lẫn Nam/Bắc) → API dùng phần lớn (ít điểm nối nhất).
 */
export const PART_WORDS_AI_STUDIO = 200;
export const PART_WORDS_API = 900;

/**
 * Chia kịch bản thành các phần, ưu tiên cắt ở ranh giới section (đổi ý = giọng nghỉ
 * tự nhiên). Section dài hơn maxWords → chia ĐỀU theo câu (không để đuôi lẻ vài câu).
 * Các khối liền nhau được ghép chung phần khi còn chỗ. Trong phần, khối cách dòng trống.
 */
export const buildParts = (story: Story, maxWords = PART_WORDS_AI_STUDIO): string[] => {
  const blocks: string[][] = [];
  for (const sec of story.sections) {
    const sents = splitSentences(sec.text);
    const total = sents.reduce((n, s) => n + wordCount(s), 0);
    const k = Math.max(1, Math.ceil(total / maxWords));
    const target = total / k;
    let cur: string[] = [];
    let words = 0;
    for (const sent of sents) {
      if (cur.length && words + wordCount(sent) / 2 > target) {
        blocks.push(cur);
        cur = [];
        words = 0;
      }
      cur.push(sent);
      words += wordCount(sent);
    }
    if (cur.length) blocks.push(cur);
  }
  const parts: string[][] = [];
  let words = 0;
  for (const b of blocks) {
    const text = b.join(" ");
    const w = wordCount(text);
    if (parts.length && words + w <= maxWords) {
      parts[parts.length - 1].push(text);
      words += w;
    } else {
      parts.push([text]);
      words = w;
    }
  }
  return parts.map((p) => p.join("\n\n"));
};
