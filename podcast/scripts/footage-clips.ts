import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { EpisodeConfig } from "../src/episode";
import type { FootageClip } from "../src/components/FootageLayer";

const probeDurationMs = (file: string): number => {
  try {
    const out = execFileSync(
      "ffprobe",
      ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", file],
      { encoding: "utf-8" },
    ).trim();
    return Math.round(Number(out) * 1000) || 0;
  } catch {
    return 0;
  }
};

/**
 * Copy các clip footage của episode (input/footage/<fn>) sang public/ và probe
 * thời lượng → trả `clips` (public name + durationMs) cho FootageLayer +
 * `publicNames` để cleanup. Bỏ qua file thiếu / 0s. Dùng chung make.ts +
 * render-runner.ts.
 */
export function stageFootageClips(
  episode: EpisodeConfig,
  inputFootageDir: string,
  publicDir: string,
  baseName: string,
): { clips: FootageClip[]; publicNames: string[] } {
  const clips: FootageClip[] = [];
  const publicNames: string[] = [];
  episode.footage.forEach((fn, idx) => {
    const abs = path.join(inputFootageDir, fn);
    if (!fs.existsSync(abs)) {
      console.warn(`[footage] ✗ bỏ qua (không tồn tại): ${abs}`);
      return;
    }
    const dur = probeDurationMs(abs);
    if (dur <= 0) {
      console.warn(`[footage] ✗ bỏ qua (không đọc được thời lượng): ${abs}`);
      return;
    }
    const pub = `${baseName}.footage${idx}${path.extname(fn) || ".mp4"}`;
    fs.copyFileSync(abs, path.join(publicDir, pub));
    clips.push({ src: pub, durationMs: dur });
    publicNames.push(pub);
  });
  if (clips.length > 0) {
    console.log(`[footage] ${clips.length} clip nền → public/`);
  }
  return { clips, publicNames };
}
