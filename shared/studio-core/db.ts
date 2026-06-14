/**
 * SQLite database (better-sqlite3) — local-only, 1 file ở `data.db`.
 * Sync API, ACID, no daemon. Replace JSON file stores cho:
 *   - brainstorm sessions
 *   - essays
 *   - references
 *   - server error log
 *
 * Episode config vẫn giữ file (input/<name>.json) vì render pipeline đọc.
 */
import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";

const DB_PATH = process.env.STUDIO_DB_PATH ?? path.resolve("data.db");

let dbInstance: Database.Database | null = null;

export function getDb(): Database.Database {
  if (dbInstance) return dbInstance;
  // Đảm bảo parent dir tồn tại (path.resolve thường = cwd nên OK)
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  dbInstance = new Database(DB_PATH);
  dbInstance.pragma("journal_mode = WAL");
  dbInstance.pragma("foreign_keys = ON");
  initSchema(dbInstance);
  return dbInstance;
}

function initSchema(db: Database.Database): void {
  // Brainstorm sessions — denormalized: ideas[] as JSON column
  db.exec(`
    CREATE TABLE IF NOT EXISTS brainstorm_sessions (
      id TEXT PRIMARY KEY,
      topic TEXT NOT NULL,
      tone TEXT NOT NULL,
      picked_idx INTEGER,
      categories_json TEXT NOT NULL DEFAULT '[]',
      provider TEXT,
      model TEXT,
      created_at TEXT NOT NULL,
      ideas_json TEXT NOT NULL,
      style TEXT NOT NULL DEFAULT 'podcast'
    );
    CREATE INDEX IF NOT EXISTS idx_brainstorm_created
      ON brainstorm_sessions(created_at DESC);
  `);
  // Migration cho DB cũ — ALTER TABLE phải chạy TRƯỚC khi tạo index trên column mới
  const bsCols = db
    .prepare("PRAGMA table_info(brainstorm_sessions)")
    .all() as Array<{ name: string }>;
  if (!bsCols.some((c) => c.name === "style")) {
    db.exec(
      `ALTER TABLE brainstorm_sessions ADD COLUMN style TEXT NOT NULL DEFAULT 'podcast'`,
    );
  }
  db.exec(
    `CREATE INDEX IF NOT EXISTS idx_brainstorm_style ON brainstorm_sessions(style)`,
  );

  // Essays
  db.exec(`
    CREATE TABLE IF NOT EXISTS essays (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      outline TEXT,
      content TEXT NOT NULL DEFAULT '',
      nlm_prompt TEXT,
      brainstorm_ref_json TEXT,
      provider TEXT NOT NULL,
      model TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      suggested_refs_json TEXT,
      style TEXT NOT NULL DEFAULT 'podcast'
    );
    CREATE INDEX IF NOT EXISTS idx_essays_updated
      ON essays(updated_at DESC);
  `);
  // Migration cho DB cũ chưa có columns mới — ALTER TABLE TRƯỚC khi tạo index.
  const cols = db
    .prepare("PRAGMA table_info(essays)")
    .all() as Array<{ name: string }>;
  const colNames = new Set(cols.map((c) => c.name));
  const extras: Array<[string, string]> = [
    ["suggested_refs_json", "TEXT"],
    ["shorts_scripts_json", "TEXT"],
    ["fb_posts_json", "TEXT"],
    ["quotes_json", "TEXT"],
    ["blog_md", "TEXT"],
    ["newsletter_md", "TEXT"],
    ["style", "TEXT NOT NULL DEFAULT 'podcast'"],
  ];
  for (const [name, type] of extras) {
    if (!colNames.has(name)) {
      db.exec(`ALTER TABLE essays ADD COLUMN ${name} ${type}`);
    }
  }
  db.exec(`CREATE INDEX IF NOT EXISTS idx_essays_style ON essays(style)`);

  // References library (table name `reference_items` để tránh từ khóa SQL "references")
  db.exec(`
    CREATE TABLE IF NOT EXISTS reference_items (
      id TEXT PRIMARY KEY,
      url TEXT NOT NULL UNIQUE,
      pdf_url TEXT,
      title TEXT NOT NULL,
      author TEXT,
      type TEXT NOT NULL,
      source TEXT NOT NULL,
      tags_json TEXT NOT NULL DEFAULT '[]',
      notes TEXT NOT NULL DEFAULT '',
      added_at TEXT NOT NULL,
      last_accessed_at TEXT,
      used_in_episodes_json TEXT NOT NULL DEFAULT '[]'
    );
    CREATE INDEX IF NOT EXISTS idx_refs_added
      ON reference_items(added_at DESC);
  `);

  // Server error log — auto-rotate 100 entries
  db.exec(`
    CREATE TABLE IF NOT EXISTS server_errors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT NOT NULL,
      source TEXT NOT NULL,
      message TEXT NOT NULL,
      stack TEXT,
      context_json TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_errors_id
      ON server_errors(id DESC);
  `);

  // Gallery asset library — Phase 26a cross-episode reuse (link-only)
  db.exec(`
    CREATE TABLE IF NOT EXISTS gallery_assets (
      id TEXT PRIMARY KEY,
      provider TEXT NOT NULL,
      kind TEXT NOT NULL,
      title TEXT NOT NULL,
      author TEXT,
      year TEXT,
      thumb_url TEXT NOT NULL,
      full_url TEXT NOT NULL,
      source_page TEXT NOT NULL,
      license TEXT NOT NULL,
      license_status TEXT NOT NULL,
      width INTEGER,
      height INTEGER,
      duration_ms INTEGER,
      tags_json TEXT NOT NULL DEFAULT '[]',
      saved_at TEXT NOT NULL,
      pinned INTEGER NOT NULL DEFAULT 0,
      used_in_episodes_json TEXT NOT NULL DEFAULT '[]'
    );
    CREATE INDEX IF NOT EXISTS idx_gallery_assets_saved
      ON gallery_assets(saved_at DESC);
    CREATE INDEX IF NOT EXISTS idx_gallery_assets_provider
      ON gallery_assets(provider);
    CREATE INDEX IF NOT EXISTS idx_gallery_assets_kind
      ON gallery_assets(kind);
  `);
}

export function getDbPath(): string {
  return DB_PATH;
}
