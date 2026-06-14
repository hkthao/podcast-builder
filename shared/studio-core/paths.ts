import path from "node:path";

/**
 * Filesystem paths shared by studio-core và pipeline-specific stores.
 *
 * Lưu ý: dùng `path.resolve(...)` → resolve theo `process.cwd()`. Tất cả
 * npm scripts đều chạy từ repo root nên các path này luôn trỏ đến
 * `<repo>/input`, `<repo>/output`, `<repo>/tmp`.
 *
 * Phase 16.5: extract khỏi `podcast/server/lib/episode-store.ts` để
 * `shared/studio-core/events.ts` không phụ thuộc ngược vào podcast pipeline.
 */
export const PATHS = {
  INPUT_DIR: path.resolve("input"),
  OUTPUT_DIR: path.resolve("output"),
  TMP_DIR: path.resolve("tmp"),
} as const;
