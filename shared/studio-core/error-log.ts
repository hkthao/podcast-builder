/**
 * Persistent error log — SQLite table `server_errors`.
 * Persist qua restart. Auto-rotate khi vượt MAX_ENTRIES.
 */
import { getDb } from "./db";

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

export function logError(input: {
  source: ErrorSource;
  error: unknown;
  context?: ErrorEntry["context"];
}): void {
  try {
    const db = getDb();
    const err = input.error;
    const message =
      err instanceof Error
        ? err.message
        : typeof err === "string"
          ? err
          : JSON.stringify(err);
    const stack = err instanceof Error ? (err.stack ?? null) : null;
    db.prepare(
      `INSERT INTO server_errors (timestamp, source, message, stack, context_json)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(
      new Date().toISOString(),
      input.source,
      message,
      stack,
      input.context ? JSON.stringify(input.context) : null,
    );
    console.error(
      `[error-log:${input.source}]`,
      message,
      input.context ?? "",
    );
    rotateIfNeeded(db);
  } catch (e) {
    // Logging không được throw — chỉ console.error
    console.error("[error-log] FAILED to log error:", e);
  }
}

function rotateIfNeeded(db: ReturnType<typeof getDb>): void {
  try {
    const count = (
      db.prepare("SELECT COUNT(*) as c FROM server_errors").get() as {
        c: number;
      }
    ).c;
    if (count <= MAX_ENTRIES) return;
    // Xoá các entry cũ nhất (id thấp nhất), giữ MAX_ENTRIES mới nhất
    db.prepare(
      `DELETE FROM server_errors
       WHERE id IN (
         SELECT id FROM server_errors
         ORDER BY id ASC
         LIMIT ?
       )`,
    ).run(count - MAX_ENTRIES);
  } catch (e) {
    console.error("[error-log] rotate failed:", e);
  }
}

export function listErrors(): ErrorEntry[] {
  try {
    const db = getDb();
    const rows = db
      .prepare(
        `SELECT timestamp, source, message, stack, context_json
         FROM server_errors
         ORDER BY id DESC`,
      )
      .all() as Array<{
      timestamp: string;
      source: string;
      message: string;
      stack: string | null;
      context_json: string | null;
    }>;
    return rows.map((r) => ({
      timestamp: r.timestamp,
      source: r.source as ErrorSource,
      message: r.message,
      stack: r.stack,
      context: r.context_json ? JSON.parse(r.context_json) : null,
    }));
  } catch {
    return [];
  }
}

export function clearErrors(): void {
  try {
    const db = getDb();
    db.prepare("DELETE FROM server_errors").run();
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
