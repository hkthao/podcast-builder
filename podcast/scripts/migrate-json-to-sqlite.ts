/**
 * One-shot migration JSON files → SQLite (data.db).
 *
 * Sources:
 *   - brainstorm/*.json          → brainstorm_sessions
 *   - essays/*.json              → essays
 *   - references/library.json    → reference_items
 *   - tmp/server-error.log       → server_errors
 *
 * Verify count rồi xoá JSON gốc.
 *
 * Run: npx tsx scripts/migrate-json-to-sqlite.ts
 */
import fs from "node:fs";
import path from "node:path";
import { getDb, getDbPath } from "../../shared/studio-core/db";

const BRAINSTORM_DIR = path.resolve("brainstorm");
const ESSAYS_DIR = path.resolve("essays");
const REFS_PATH = path.resolve("references", "library.json");
const ERROR_LOG_PATH = path.resolve("tmp", "server-error.log");

const log = (msg: string) => console.log(`[migrate] ${msg}`);

const listJson = (dir: string): string[] => {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".json") && !f.startsWith("."))
    .map((f) => path.join(dir, f));
};

async function main(): Promise<void> {
  log(`DB: ${getDbPath()}`);
  const db = getDb();

  // Brainstorm sessions
  const bsFiles = listJson(BRAINSTORM_DIR);
  let bsCount = 0;
  if (bsFiles.length > 0) {
    const insert = db.prepare(`
      INSERT OR REPLACE INTO brainstorm_sessions
        (id, topic, tone, picked_idx, categories_json, provider, model, created_at, ideas_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const tx = db.transaction((files: string[]) => {
      for (const file of files) {
        const raw = JSON.parse(fs.readFileSync(file, "utf-8"));
        insert.run(
          raw.id,
          raw.topic,
          raw.tone,
          raw.pickedIdx ?? null,
          JSON.stringify(raw.categories ?? []),
          raw.provider ?? null,
          raw.model ?? null,
          raw.createdAt,
          JSON.stringify(raw.ideas ?? []),
        );
        bsCount++;
      }
    });
    tx(bsFiles);
  }
  log(`brainstorm_sessions: ${bsCount} imported`);

  // Essays
  const essayFiles = listJson(ESSAYS_DIR);
  let essayCount = 0;
  if (essayFiles.length > 0) {
    const insert = db.prepare(`
      INSERT OR REPLACE INTO essays
        (id, title, outline, content, nlm_prompt, brainstorm_ref_json, provider, model, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const tx = db.transaction((files: string[]) => {
      for (const file of files) {
        const raw = JSON.parse(fs.readFileSync(file, "utf-8"));
        insert.run(
          raw.id,
          raw.title,
          raw.outline ?? null,
          raw.content ?? "",
          raw.nlmPrompt ?? null,
          raw.brainstormRef ? JSON.stringify(raw.brainstormRef) : null,
          raw.provider ?? "openai",
          raw.model ?? "gpt-4o-mini",
          raw.createdAt,
          raw.updatedAt,
        );
        essayCount++;
      }
    });
    tx(essayFiles);
  }
  log(`essays: ${essayCount} imported`);

  // References
  let refCount = 0;
  if (fs.existsSync(REFS_PATH)) {
    const raw = JSON.parse(fs.readFileSync(REFS_PATH, "utf-8"));
    const items: Array<Record<string, unknown>> = Array.isArray(raw.items)
      ? raw.items
      : [];
    if (items.length > 0) {
      const insert = db.prepare(`
        INSERT OR REPLACE INTO reference_items
          (id, url, pdf_url, title, author, type, source, tags_json, notes, added_at, last_accessed_at, used_in_episodes_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const tx = db.transaction((all: typeof items) => {
        for (const r of all) {
          insert.run(
            r.id as string,
            r.url as string,
            (r.pdfUrl as string) ?? null,
            r.title as string,
            (r.author as string) ?? null,
            (r.type as string) ?? "other",
            (r.source as string) ?? "",
            JSON.stringify(r.tags ?? []),
            (r.notes as string) ?? "",
            r.addedAt as string,
            (r.lastAccessedAt as string) ?? null,
            JSON.stringify(r.usedInEpisodes ?? []),
          );
          refCount++;
        }
      });
      tx(items);
    }
  }
  log(`reference_items: ${refCount} imported`);

  // Server error log (JSONL)
  let errCount = 0;
  if (fs.existsSync(ERROR_LOG_PATH)) {
    const lines = fs
      .readFileSync(ERROR_LOG_PATH, "utf-8")
      .split("\n")
      .filter((l) => l.trim().length > 0);
    if (lines.length > 0) {
      const insert = db.prepare(`
        INSERT INTO server_errors
          (timestamp, source, message, stack, context_json)
        VALUES (?, ?, ?, ?, ?)
      `);
      const tx = db.transaction((all: string[]) => {
        for (const line of all) {
          try {
            const e = JSON.parse(line);
            insert.run(
              e.timestamp,
              e.source,
              e.message,
              e.stack ?? null,
              e.context ? JSON.stringify(e.context) : null,
            );
            errCount++;
          } catch {
            /* skip corrupted */
          }
        }
      });
      tx(lines);
    }
  }
  log(`server_errors: ${errCount} imported`);

  // Verify counts trong DB
  const dbBsCount = (
    db.prepare("SELECT COUNT(*) as c FROM brainstorm_sessions").get() as {
      c: number;
    }
  ).c;
  const dbEssayCount = (
    db.prepare("SELECT COUNT(*) as c FROM essays").get() as { c: number }
  ).c;
  const dbRefCount = (
    db.prepare("SELECT COUNT(*) as c FROM reference_items").get() as {
      c: number;
    }
  ).c;
  const dbErrCount = (
    db.prepare("SELECT COUNT(*) as c FROM server_errors").get() as {
      c: number;
    }
  ).c;
  log(
    `DB totals: brainstorm=${dbBsCount}, essays=${dbEssayCount}, refs=${dbRefCount}, errors=${dbErrCount}`,
  );

  // Verify migrated count matches source count rồi delete files
  if (
    dbBsCount >= bsCount &&
    dbEssayCount >= essayCount &&
    dbRefCount >= refCount &&
    dbErrCount >= errCount
  ) {
    log("Verification OK — deleting JSON source files…");
    for (const f of bsFiles) fs.unlinkSync(f);
    for (const f of essayFiles) fs.unlinkSync(f);
    if (fs.existsSync(REFS_PATH)) fs.unlinkSync(REFS_PATH);
    if (fs.existsSync(ERROR_LOG_PATH)) fs.unlinkSync(ERROR_LOG_PATH);
    log("✓ JSON files removed");
  } else {
    log("✗ Verification FAILED — keeping JSON files");
    process.exit(1);
  }

  log("Migration complete.");
}

main().catch((e) => {
  console.error("[migrate] ERROR:", e);
  process.exit(1);
});
