/**
 * Generate thumbnail .jpg cho từng scene template trong catalog. Dùng
 * Remotion composition "ScenePreview" với inputProps là sceneType, render
 * frame ~60 (2s, sau pop-in animation).
 *
 * Output: `public/scene-catalog/<key>.jpg` (scale 0.25 → 270×480, ~20KB/file).
 *
 * Cost: ~10s bundle + ~0.5-1s/scene. 17 scene = ~20-25s tổng.
 *
 * Cache: 1 lần generate, file lưu vĩnh viễn cho tới khi user trigger lại.
 */
import path from "node:path";
import fs from "node:fs";
import { bundle } from "@remotion/bundler";
import { renderStill, selectComposition } from "@remotion/renderer";
import { SCENE_CATALOG } from "./scene-catalog";

const COMPOSITION_ID = "ScenePreview";
const PUBLIC_DIR = path.resolve("public");
const THUMBS_DIR = path.join(PUBLIC_DIR, "scene-catalog");
const PREVIEW_FRAME = 60; // ~2s vào — đã pop-in xong, sticker settle

export type ThumbProgress = {
  total: number;
  done: number;
  currentKey: string;
};

const ensureDir = (p: string) => {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
};

const thumbFilePath = (key: string): string =>
  path.join(THUMBS_DIR, `${key}.jpg`);

const thumbPublicUrl = (key: string): string =>
  `/scene-catalog/${encodeURIComponent(key)}.jpg`;

/** Check thumbnail file đã có sẵn cho 1 scene key. */
export function thumbExists(key: string): boolean {
  return fs.existsSync(thumbFilePath(key));
}

/** Lấy URL public của thumbnail (kể cả khi chưa tồn tại — client check). */
export function getThumbUrl(key: string): string | null {
  if (!thumbExists(key)) return null;
  // Cache-bust theo mtime để FE biết khi nào file mới
  const mtime = fs.statSync(thumbFilePath(key)).mtimeMs;
  return `${thumbPublicUrl(key)}?v=${Math.round(mtime)}`;
}

export async function generateAllSceneThumbs(
  onProgress?: (p: ThumbProgress) => void,
): Promise<{ generated: string[] }> {
  ensureDir(THUMBS_DIR);

  const serveUrl = await bundle({
    entryPoint: path.resolve("podcast/src/index.ts"),
    publicDir: PUBLIC_DIR,
  });

  const generated: string[] = [];
  const total = SCENE_CATALOG.length;
  for (let i = 0; i < total; i++) {
    const entry = SCENE_CATALOG[i]!;
    const inputProps = {
      sceneType: entry.key,
      mood: entry.suggestedMoods[0] ?? "positive",
      showWatermark: false,
    };
    const composition = await selectComposition({
      serveUrl,
      id: COMPOSITION_ID,
      inputProps,
    });
    const targetFrame = Math.min(
      composition.durationInFrames - 1,
      PREVIEW_FRAME,
    );
    await renderStill({
      serveUrl,
      composition,
      output: thumbFilePath(entry.key),
      inputProps,
      frame: targetFrame,
      imageFormat: "jpeg",
      jpegQuality: 80,
      scale: 0.25,
    });
    generated.push(entry.key);
    onProgress?.({ total, done: i + 1, currentKey: entry.key });
  }
  return { generated };
}
