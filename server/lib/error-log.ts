/**
 * Persistent error log — tmp/server-error.log JSONL format.
 * Persist qua restart để user vẫn xem được lỗi sau khi server reload.
 * Auto-rotate khi vượt MAX_ENTRIES (giữ N entry mới nhất).
 */
import fs from "node:fs";
import path from "node:path";

const LOG_PATH = path.resolve("tmp", "server-error.log");
const MAX_ENTRIES = 100;

export type ErrorSource = "uncaught" | "rejection" | "api" | "manual";

export type ErrorEntry = {
  timestamp: string;
  source: ErrorSource;
  message: string;
  stack: string | null;
  context: {
    method?: string;
    path?: string;
  } | null;
};

const ensureDir = () => {
  const dir = path.dirname(LOG_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
};

export function logError(input: {
  source: ErrorSource;
  error: unknown;
  context?: ErrorEntry["context"];
}): void {
  try {
    ensureDir();
    const err = input.error;
    const message =
      err instanceof Error
        ? err.message
        : typeof err === "string"
          ? err
          : JSON.stringify(err);
    const stack = err instanceof Error ? (err.stack ?? null) : null;
    const entry: ErrorEntry = {
      timestamp: new Date().toISOString(),
      source: input.source,
      message,
      stack,
      context: input.context ?? null,
    };
    fs.appendFileSync(LOG_PATH, JSON.stringify(entry) + "\n", "utf-8");
    // Console mirror để dev cũng thấy ngay
    console.error(
      `[error-log:${input.source}]`,
      message,
      input.context ?? "",
    );
    rotateIfNeeded();
  } catch (e) {
    // Logging không được throw — chỉ console.error
    console.error("[error-log] FAILED to log error:", e);
  }
}

function rotateIfNeeded(): void {
  try {
    if (!fs.existsSync(LOG_PATH)) return;
    const content = fs.readFileSync(LOG_PATH, "utf-8");
    const lines = content.split("\n").filter((l) => l.trim().length > 0);
    if (lines.length <= MAX_ENTRIES) return;
    // Giữ N entry mới nhất
    const kept = lines.slice(-MAX_ENTRIES);
    fs.writeFileSync(LOG_PATH, kept.join("\n") + "\n", "utf-8");
  } catch (e) {
    console.error("[error-log] rotate failed:", e);
  }
}

export function listErrors(): ErrorEntry[] {
  try {
    if (!fs.existsSync(LOG_PATH)) return [];
    const content = fs.readFileSync(LOG_PATH, "utf-8");
    const entries: ErrorEntry[] = [];
    for (const line of content.split("\n")) {
      if (!line.trim()) continue;
      try {
        entries.push(JSON.parse(line) as ErrorEntry);
      } catch {
        /* skip corrupted line */
      }
    }
    // Mới nhất trước
    return entries.reverse();
  } catch {
    return [];
  }
}

export function clearErrors(): void {
  try {
    if (fs.existsSync(LOG_PATH)) fs.unlinkSync(LOG_PATH);
  } catch (e) {
    console.error("[error-log] clear failed:", e);
  }
}

/**
 * Register global handlers cho uncaught exception + unhandled rejection.
 * Gọi 1 lần ở server startup.
 */
export function registerGlobalHandlers(): void {
  process.on("uncaughtException", (err) => {
    logError({ source: "uncaught", error: err });
  });
  process.on("unhandledRejection", (reason) => {
    logError({ source: "rejection", error: reason });
  });
}
