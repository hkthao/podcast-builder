#!/usr/bin/env tsx
/**
 * Parse YouTube description → input/<name>.chapters.json (Phase 17).
 *
 * Input: input/<name>.description.txt — paste mô tả YouTube (chứa dòng
 * timestamp + tên chương).
 *
 * Output: input/<name>.chapters.json — chuẩn theo ChaptersFileSchema.
 *   - Mỗi dòng timestamp hợp lệ → 1 Chapter (id = ch-NN, startMs, title)
 *   - artworks/assets để rỗng — Phase 18 (plan-assets) sẽ điền checklist
 *   - mood default "scholarly" — user sửa sau
 *
 * Formats hỗ trợ (case-insensitive, leading whitespace OK):
 *   00:06:00 Life of St. Francis
 *   [00:06:00] Life of St. Francis
 *   00:06:00.16 Life... (.16 ignored)
 *   6:00 Life... (no leading zero, MM:SS)
 *   6:00 - Life... (hyphen separator)
 *   00:06:00 — Life... (em-dash separator)
 *
 * Usage:
 *   tsx gallery/scripts/parse-chapters.ts <name>
 *   tsx gallery/scripts/parse-chapters.ts giotto
 *
 * Test fixture: `gallery/fixtures/giotto-sample.description.txt`. Copy vào
 * `input/giotto.description.txt` để smoke test.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { ChapterSchema, type Chapter } from "../src/episode";

const ROOT = process.cwd();
const INPUT_DIR = path.join(ROOT, "input");

/**
 * Regex bắt 1 dòng timestamp + title.
 * Groups: [1] hh-or-mm, [2] mm-or-ss, [3] ss (optional, decide HH:MM:SS vs MM:SS), [4] title.
 *
 * Cho phép:
 *   - Optional `[` / `]` quanh timestamp
 *   - Optional `.16` decimal sau seconds (bỏ qua)
 *   - Separator: space, hyphen `-`, em-dash `—`, colon `:`, pipe `|`
 *   - Indentation leading whitespace
 */
const TIMESTAMP_RE =
  /^\s*\[?\s*(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?\s*\]?\s*[-—:|\s]+\s*(.+?)\s*$/;

const MIN_TITLE_LENGTH = 2;
/** Bỏ chữ "Chapter 1:" / "1." prefix nếu có (kênh hay viết). */
const TITLE_PREFIX_RE = /^(?:Chapter|Phần|Part|Section)\s*\d+\s*[:.\-—|]\s*/i;
const NUMERIC_PREFIX_RE = /^\d+\s*[:.\-—|]\s+/;

function parseTimestampMs(
  a: string,
  b: string,
  c: string | undefined,
): number {
  const A = parseInt(a, 10);
  const B = parseInt(b, 10);
  if (c !== undefined) {
    // HH:MM:SS
    const C = parseInt(c, 10);
    return (A * 3600 + B * 60 + C) * 1000;
  }
  // MM:SS
  return (A * 60 + B) * 1000;
}

function cleanTitle(s: string): string {
  return s
    .replace(/^[-—:|·\s]+/, "")
    .replace(/[-—:|·\s]+$/, "")
    .replace(TITLE_PREFIX_RE, "")
    .replace(NUMERIC_PREFIX_RE, "")
    .replace(/\s+/g, " ")
    .trim();
}

function chapterIdSlug(idx: number): string {
  return `ch-${String(idx + 1).padStart(2, "0")}`;
}

export function parseChaptersFromText(text: string): Chapter[] {
  const lines = text.split(/\r?\n/);
  const chapters: Chapter[] = [];
  const seenStartMs = new Set<number>();
  for (const line of lines) {
    const m = line.match(TIMESTAMP_RE);
    if (!m) continue;
    const [, a, b, c, rawTitle] = m;
    const title = cleanTitle(rawTitle ?? "");
    if (title.length < MIN_TITLE_LENGTH) continue;
    const startMs = parseTimestampMs(a!, b!, c);
    // Dedupe by startMs — kênh hay paste timestamp đúp
    if (seenStartMs.has(startMs)) continue;
    seenStartMs.add(startMs);
    chapters.push({
      id: chapterIdSlug(chapters.length),
      startMs,
      title,
      artworks: [],
      assets: [],
      mood: "scholarly",
    });
  }
  // Sort theo startMs để robust với input không sắp xếp
  chapters.sort((x, y) => x.startMs - y.startMs);
  // Re-issue ids sau sort để giữ ch-01 ch-02 ch-03... theo thứ tự thời gian
  return chapters.map((c, i) => ({ ...c, id: chapterIdSlug(i) }));
}

function formatTimeHuman(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0)
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

async function main(): Promise<void> {
  const arg = process.argv[2];
  if (!arg) {
    console.error("Usage: tsx gallery/scripts/parse-chapters.ts <name>");
    console.error("  Reads input/<name>.description.txt");
    console.error("  Writes input/<name>.chapters.json");
    console.error("Example: tsx gallery/scripts/parse-chapters.ts giotto");
    process.exit(1);
  }
  const baseName = arg
    .replace(/\.description\.txt$/, "")
    .replace(/\.chapters\.json$/, "")
    .replace(/^.*\//, "");
  const descPath = path.join(INPUT_DIR, `${baseName}.description.txt`);
  const outPath = path.join(INPUT_DIR, `${baseName}.chapters.json`);

  let text: string;
  try {
    text = await fs.readFile(descPath, "utf-8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") {
      console.error(`Không tìm thấy ${descPath}`);
      console.error(
        `Tạo file đó bằng cách paste mô tả YouTube vào, rồi chạy lại.`,
      );
      process.exit(2);
    }
    throw e;
  }

  const chapters = parseChaptersFromText(text);
  if (chapters.length === 0) {
    console.error(`Không tìm thấy timestamp hợp lệ nào trong ${descPath}.`);
    console.error(
      `Format kỳ vọng: "00:06:00 Life of St. Francis" (hoặc tương tự).`,
    );
    process.exit(3);
  }

  // Validate qua Zod (catches edge cases trong schema)
  const validated = chapters.map((c) => ChapterSchema.parse(c));

  await fs.mkdir(INPUT_DIR, { recursive: true });
  await fs.writeFile(outPath, JSON.stringify({ chapters: validated }, null, 2));

  console.log(`✓ ${validated.length} chương → ${outPath}`);
  const preview = validated.slice(0, 8);
  for (const c of preview) {
    console.log(`  ${c.id}  ${formatTimeHuman(c.startMs).padStart(8)}  ${c.title}`);
  }
  if (validated.length > preview.length) {
    console.log(`  … (${validated.length - preview.length} chương khác)`);
  }
}

// Direct invoke vs import
const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
