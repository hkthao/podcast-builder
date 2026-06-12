import { AbsoluteFill } from "remotion";
import { FORMAT, type MoodKey } from "../../theme";

/**
 * Props CHUNG cho mọi scene recipe. SceneLayer truyền vào, scene chỉ
 * cần đặt sticker + doodle theo bố cục cố định. Tránh dùng heavy SVG
 * filter — đắt khi nhân 30k frame.
 */
export type SceneProps = {
  mood: MoodKey;
  accentColor: string;
  /** 0..1 — tiến độ trong scene (đầu→cuối). Dùng cho intro/outro nhẹ. */
  progress: number;
  /** 0..1 — biên độ audio frame hiện tại. */
  audioLevel?: number;
};

export const SCENE_W = FORMAT.width;
export const SCENE_H = FORMAT.height;

/**
 * Vùng "an toàn" cho sticker — KHÔNG đè watermark (top 160 + badge ~80px)
 * cũng KHÔNG đè wave + caption (bottom ~720px sau khi visualizer lên 0.62).
 */
export const STICKER_BAND = {
  yTop: 280,
  yBottom: 1100,
  xCenter: SCENE_W / 2,
} as const;

export const SceneShell: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <AbsoluteFill style={{ pointerEvents: "none" }}>{children}</AbsoluteFill>
);
