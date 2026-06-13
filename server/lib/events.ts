import { EventEmitter } from "node:events";
import chokidar, { type FSWatcher } from "chokidar";
import { PATHS } from "./episode-store";

/**
 * Event bus broadcast cho UI qua SSE.
 *
 * Events:
 *   - `episodes:changed` { reason, path? } — input/* hoặc output/* thay đổi
 *   - `render:progress` { jobId, phase, percent, ... } — sẽ dùng ở Phase 10.4
 *
 * UI subscribe qua GET /api/events (SSE). Mỗi message tự re-fetch hoặc
 * update state.
 */
export const bus = new EventEmitter();

export type ChangeReason = "add" | "change" | "unlink";
export type ChangeEvent = {
  type: "episodes:changed";
  reason: ChangeReason;
  path: string;
};

let watcher: FSWatcher | null = null;

/** Chokidar 5+ bỏ glob support → watch directory rồi filter manual. */
const TRACKED_EXTS = new Set([
  ".json",
  ".m4a",
  ".mp3",
  ".wav",
  ".mp4",
  ".jpg",
]);

const matches = (filePath: string): boolean => {
  const ext = filePath.slice(filePath.lastIndexOf("."));
  return TRACKED_EXTS.has(ext);
};

export function startFsWatcher(): void {
  if (watcher) return;
  watcher = chokidar.watch([PATHS.INPUT_DIR, PATHS.OUTPUT_DIR], {
    ignoreInitial: true,
    depth: 0, // Chỉ watch ngay trong dir, không recurse
    awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 50 },
    ignored: (p, stats) => {
      if (!stats) return false; // Allow initial dir scan
      if (stats.isDirectory()) return false; // Allow dirs
      return !matches(p);
    },
  });

  const emit = (reason: ChangeReason) => (filePath: string) => {
    if (!matches(filePath)) return;
    if (process.env.STUDIO_LOG_FS === "1") {
      console.log(`[fs-watcher] ${reason} ${filePath}`);
    }
    bus.emit("episodes:changed", {
      type: "episodes:changed",
      reason,
      path: filePath,
    } satisfies ChangeEvent);
  };

  watcher.on("add", emit("add"));
  watcher.on("change", emit("change"));
  watcher.on("unlink", emit("unlink"));
  watcher.on("error", (e: unknown) => {
    console.error("[studio-server] fs watcher error:", e);
  });

  console.log(`[studio-server] fs watcher: input/ + output/`);
}

export async function stopFsWatcher(): Promise<void> {
  if (!watcher) return;
  await watcher.close();
  watcher = null;
}
