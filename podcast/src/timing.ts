/**
 * Hằng số THỜI LƯỢNG (giây) dùng chung giữa component Remotion (IntroCard/Hook)
 * và pipeline audio (make.ts/render-runner tính cửa sổ nhạc nền đầu video).
 * File này KHÔNG import remotion → an toàn để import trong node script.
 */
export const INTRO_SECONDS = 3.0; // IntroCard (cover)
/** Hook tối thiểu (hook rất ngắn) — thời lượng thật co giãn theo số chữ, xem hookSeconds(). */
export const HOOK_SECONDS = 3.5;
/** Trần thời lượng hook — hook dài quá thì cắt bớt chữ trong config, đừng kéo thêm. */
export const HOOK_MAX_SECONDS = 10;
/** Tốc độ đọc chữ sticker trên màn hình (chữ/giây) + thời gian hiệu ứng vào/ra. */
const HOOK_WORDS_PER_SECOND = 3;
const HOOK_BASE_SECONDS = 1.5;

/**
 * Chia hook thành dòng hiển thị (≤3 dòng). Có dấu phẩy → mỗi vế 1 dòng (chỉ
 * lấy 3 vế đầu); không thì chia đều theo số từ. Dùng chung Hook.tsx + hookSeconds.
 */
export const splitHookLines = (text: string): string[] => {
  const cleaned = text.trim();
  if (cleaned.includes(",")) {
    return cleaned.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 3);
  }
  const words = cleaned.split(/\s+/);
  if (words.length <= 5) return [cleaned];
  if (words.length <= 10) {
    const mid = Math.ceil(words.length / 2);
    return [words.slice(0, mid).join(" "), words.slice(mid).join(" ")];
  }
  const third = Math.ceil(words.length / 3);
  return [
    words.slice(0, third).join(" "),
    words.slice(third, third * 2).join(" "),
    words.slice(third * 2).join(" "),
  ];
};

/**
 * Thời lượng hook (giây) theo số chữ THỰC SỰ hiển thị — đủ để người xem đọc
 * hết (≈3 chữ/giây + 1.5s hiệu ứng), kẹp [3.5s, 10s]. 0 nếu không có hook.
 * Dùng chung Video (độ dài card), make/render-runner (nhạc nền đầu), UI chapter.
 */
export const hookSeconds = (hook: string | null | undefined): number => {
  if (!hook?.trim()) return 0;
  const words = splitHookLines(hook).join(" ").split(/\s+/).filter(Boolean).length;
  const sec = HOOK_BASE_SECONDS + words / HOOK_WORDS_PER_SECOND;
  return Math.round(Math.min(HOOK_MAX_SECONDS, Math.max(HOOK_SECONDS, sec)) * 10) / 10;
};

/**
 * Nhạc nền chạy từ đầu video tới HET intro + hook + chừng này giây (rồi fade,
 * TẮT ở phần giữa). User chốt: đầu + sau hook ~5s có nhạc, giữa không, cuối có
 * đuôi nhạc (outroTailSec).
 */
export const HEAD_MUSIC_EXTRA_SECONDS = 5;
