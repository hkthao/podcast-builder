import { useVideoConfig } from "remotion";
import { FORMAT, SAFE_ZONE } from "./theme";

/**
 * Khung hình video. "vertical" = 9:16 (FB Reels, mặc định), "landscape" = 16:9
 * (YouTube dài). Chọn lúc RENDER (không lưu trong episode) → 1 tập ra được cả 2
 * bản: output/<slug>.mp4 (dọc) + output/<slug>.yt.mp4 (ngang).
 */
export type VideoFormat = "vertical" | "landscape";

export const FORMATS: Record<VideoFormat, { width: number; height: number }> = {
  vertical: FORMAT,
  landscape: { width: 1920, height: 1080 },
};

/**
 * Vùng an toàn 16:9 — YouTube không phủ UI lên video như FB Reels; chỉ thanh
 * tiến trình + nút điều khiển (~90px đáy, hiện khi hover) và tiêu đề (đỉnh).
 */
export const SAFE_ZONE_LANDSCAPE = {
  top: 56,
  bottom: 96,
  left: 72,
  right: 72,
} as const;

/**
 * Layout theo khung đang render (đọc từ useVideoConfig). `sx`/`sy` quy toạ độ
 * thiết kế gốc 1080×1920 sang khung hiện tại theo tỉ lệ — dùng cho đồ trang trí
 * (sparkle/star) để không tràn khung ngang.
 */
export const useLayout = () => {
  const { width, height } = useVideoConfig();
  const landscape = width > height;
  return {
    landscape,
    width,
    height,
    safe: landscape ? SAFE_ZONE_LANDSCAPE : SAFE_ZONE,
    sx: (x: number) => (x / FORMAT.width) * width,
    sy: (y: number) => (y / FORMAT.height) * height,
  };
};
