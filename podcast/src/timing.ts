/**
 * Hằng số THỜI LƯỢNG (giây) dùng chung giữa component Remotion (IntroCard/Hook)
 * và pipeline audio (make.ts/render-runner tính cửa sổ nhạc nền đầu video).
 * File này KHÔNG import remotion → an toàn để import trong node script.
 */
export const INTRO_SECONDS = 3.0; // IntroCard (cover)
export const HOOK_SECONDS = 3.5; // Hook

/**
 * Nhạc nền chạy từ đầu video tới HET intro + hook + chừng này giây (rồi fade,
 * TẮT ở phần giữa). User chốt: đầu + sau hook ~5s có nhạc, giữa không, cuối có
 * đuôi nhạc (outroTailSec).
 */
export const HEAD_MUSIC_EXTRA_SECONDS = 5;
