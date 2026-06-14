#!/usr/bin/env tsx
/**
 * Phase 18 — Plan asset checklist từ chapters.
 *
 * Đầu vào:
 *   input/<name>.chapters.json   (Phase 17 — bắt buộc)
 *   input/<name>.assets/         (folder tree — sẽ tạo nếu chưa có)
 *
 * Đầu ra:
 *   tmp/<name>.assets-checklist.md     — human-readable Markdown
 *   tmp/<name>.assets-checklist.json   — machine-readable cho UI/audit
 *   input/<name>.assets/ch-XX/.gitkeep — folder rỗng cho mỗi chương
 *
 * KHÔNG fetch ảnh hộ (bản quyền + offline) — chỉ giúp user biết "cần ảnh gì
 * cho chương nào". Pipeline render (Phase 22) đọc manifest (link-only) khi cần.
 *
 * Heuristic extract candidates:
 *   1. Split chapter title bởi separator (em-dash, en-dash, hyphen, colon, parens).
 *   2. Trong mỗi segment, match cụm proper noun (chuỗi từ viết hoa, cho phép
 *      connector of/in/the/di/de/von ở giữa).
 *   3. Strip leading "The/A/An". Filter generic titles ("Introduction").
 *
 * Pragmatic: thà over-suggest còn hơn miss. User review + sửa checklist.
 *
 * Usage:
 *   tsx gallery/scripts/plan-assets.ts <name>
 *   tsx gallery/scripts/plan-assets.ts giotto
 */
import fs from "node:fs/promises";
import path from "node:path";
import { ChaptersFileSchema, type Chapter } from "../src/episode";

const ROOT = process.cwd();
const INPUT_DIR = path.join(ROOT, "input");
const TMP_DIR = path.join(ROOT, "tmp");

/** Chapter titles giống thuần generic phrase → bỏ qua candidate. */
const GENERIC_TITLES = new Set([
  "introduction",
  "intro",
  "outro",
  "closing reflections",
  "late works and legacy",
  "early works",
  "epilogue",
  "credits",
  "conclusion",
]);

/** Image / video file extensions để đếm collected. */
const ASSET_EXTS = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".tif",
  ".tiff",
  ".mp4",
  ".mov",
  ".webm",
  ".mp3",
  ".wav",
  ".m4a",
  ".ogg",
]);

/** Output JSON shape — sẽ được UI đọc ở Phase 23. */
export type AssetsChecklistChapter = {
  id: string;
  title: string;
  startMs: number;
  candidates: string[];
  folder: string;
  collected: number;
  files: string[];
};

export type AssetsChecklist = {
  name: string;
  generatedAt: string;
  totalChapters: number;
  totalCandidates: number;
  totalCollected: number;
  chapters: AssetsChecklistChapter[];
};

/** Strip generic articles + spaces from a candidate string. */
function cleanCandidate(s: string): string {
  return s
    .replace(/^(?:The|A|An)\s+/i, "")
    .replace(/^["“”]/, "")
    .replace(/["“”]$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isProperNoun(s: string): boolean {
  if (s.length < 3) return false;
  const words = s.split(/\s+/).filter(Boolean);
  if (words.length === 0) return false;
  // At least 1 word must start with uppercase (and not just be "I" or "St.")
  const capCount = words.filter((w) => /^[A-Z][a-zA-Z]/.test(w)).length;
  return capCount >= 1;
}

/**
 * Extract candidate artworks/places from a chapter title.
 *
 * Multi-stage:
 *   A. Split by separators (em-dash, en-dash, hyphen surrounded by spaces, colon, pipe, parens).
 *   B. In each segment, try the "X of Y" / "X in Y" pattern → emit Y (and X if multi-word proper noun).
 *   C. Otherwise emit the segment if it looks like a proper noun.
 */
export function extractCandidates(title: string): string[] {
  const cleaned = title
    .replace(/[()[\]]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (cleaned.length === 0) return [];

  // Skip if whole title is a generic phrase
  if (GENERIC_TITLES.has(cleaned.toLowerCase())) return [];

  const segments = cleaned
    .split(/\s*[—–|:]\s*|\s+-\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const candidates = new Set<string>();

  for (const seg of segments) {
    if (GENERIC_TITLES.has(seg.toLowerCase())) continue;

    // Pattern: "X of Y" / "X in Y" / "X with Y" / "X from Y" / "X to Y"
    const m = seg.match(/^(.+?)\s+(of|in|with|from|to)\s+(.+)$/i);
    if (m) {
      const subject = m[1]!.trim();
      const target = cleanCandidate(m[3]!);
      if (isProperNoun(target)) candidates.add(target);
      // Nếu subject là multi-word proper noun (vd "Bardi Chapel"), giữ luôn
      if (isProperNoun(subject) && subject.split(/\s+/).length >= 2) {
        candidates.add(cleanCandidate(subject));
      }
      continue;
    }

    // Không có pattern "X of Y" → cả segment có thể là proper noun
    const candidate = cleanCandidate(seg);
    if (isProperNoun(candidate)) candidates.add(candidate);
  }

  // Final cleanup: nếu candidate quá ngắn hoặc start với từ generic, drop
  const finalCandidates = [...candidates].filter((c) => {
    if (c.length < 3) return false;
    const lower = c.toLowerCase();
    if (GENERIC_TITLES.has(lower)) return false;
    return true;
  });

  return finalCandidates;
}

async function countCollectedAssets(folder: string): Promise<{
  count: number;
  files: string[];
}> {
  try {
    const entries = await fs.readdir(folder);
    const files = entries.filter((f) => {
      const ext = path.extname(f).toLowerCase();
      return ASSET_EXTS.has(ext);
    });
    return { count: files.length, files };
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") {
      return { count: 0, files: [] };
    }
    throw e;
  }
}

async function ensureChapterFolders(
  assetsRoot: string,
  chapters: Chapter[],
): Promise<void> {
  await fs.mkdir(assetsRoot, { recursive: true });
  for (const ch of chapters) {
    const dir = path.join(assetsRoot, ch.id);
    await fs.mkdir(dir, { recursive: true });
    // Ghi .gitkeep cho commit-able structure
    const keep = path.join(dir, ".gitkeep");
    try {
      await fs.access(keep);
    } catch {
      await fs.writeFile(keep, "");
    }
  }
}

function formatTime(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0)
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function buildMarkdown(
  name: string,
  checklist: AssetsChecklist,
): string {
  const lines: string[] = [];
  lines.push(`# Asset checklist — ${name}`);
  lines.push("");
  lines.push(
    `> Generated ${checklist.generatedAt.slice(0, 19).replace("T", " ")}. ` +
      `${checklist.totalChapters} chapters · ${checklist.totalCandidates} candidates · ` +
      `${checklist.totalCollected} collected.`,
  );
  lines.push("");

  // Progress bar
  const pct =
    checklist.totalCandidates > 0
      ? Math.round((checklist.totalCollected / checklist.totalCandidates) * 100)
      : 0;
  lines.push(`**Progress:** ${checklist.totalCollected}/${checklist.totalCandidates} (${pct}%)`);
  lines.push("");

  lines.push("## Chapters");
  lines.push("");
  lines.push("| # | Time | Chapter | Candidates (sửa nếu cần) | Folder | Collected |");
  lines.push("|---|------|---------|--------------------------|--------|-----------|");
  for (const c of checklist.chapters) {
    const cands =
      c.candidates.length > 0
        ? c.candidates.map((x) => `_${x}_`).join(", ")
        : "—";
    const folderShort = c.folder.replace(/^.*?input\//, "input/");
    const collected =
      c.collected > 0
        ? `**${c.collected}** ✓`
        : c.candidates.length > 0
          ? "0 ⚠️"
          : "0";
    lines.push(
      `| ${c.id} | ${formatTime(c.startMs)} | ${c.title} | ${cands} | \`${folderShort}\` | ${collected} |`,
    );
  }
  lines.push("");

  // Chapters thiếu asset
  const missing = checklist.chapters.filter(
    (c) => c.candidates.length > 0 && c.collected === 0,
  );
  if (missing.length > 0) {
    lines.push("## ⚠️ Chương đang thiếu asset");
    lines.push("");
    for (const c of missing) {
      lines.push(`- **${c.id}** ${c.title}`);
      lines.push(`  - Tìm: ${c.candidates.map((x) => `_${x}_`).join(", ")}`);
      lines.push(`  - Bỏ file vào: \`${c.folder.replace(/^.*?input\//, "input/")}\``);
    }
    lines.push("");
  }

  // Suggested sources
  lines.push("## Nguồn an toàn (public domain / open access)");
  lines.push("");
  lines.push("- **Wikimedia Commons** — https://commons.wikimedia.org/");
  lines.push("- **Met Museum (open access)** — https://www.metmuseum.org/art/collection");
  lines.push("- **Rijksmuseum** — https://www.rijksmuseum.nl/en/rijksstudio");
  lines.push("- **Art Institute Chicago** — https://www.artic.edu/collection");
  lines.push("- **Google Arts & Culture** — https://artsandculture.google.com/");
  lines.push("- **Web Gallery of Art** — https://www.wga.hu/");
  lines.push("");
  lines.push(
    "> Sau Phase 26, Studio sẽ có panel Research tích hợp các nguồn trên — bạn search + import trong app, không phải nhảy tab.",
  );
  lines.push("");

  return lines.join("\n");
}

async function main(): Promise<void> {
  const arg = process.argv[2];
  if (!arg) {
    console.error("Usage: tsx gallery/scripts/plan-assets.ts <name>");
    console.error("  Reads input/<name>.chapters.json");
    console.error("  Writes tmp/<name>.assets-checklist.{md,json}");
    console.error("  Creates input/<name>.assets/ch-XX/ folders");
    console.error("Example: tsx gallery/scripts/plan-assets.ts giotto");
    process.exit(1);
  }
  const name = arg
    .replace(/\.chapters\.json$/, "")
    .replace(/^.*\//, "");

  const chaptersPath = path.join(INPUT_DIR, `${name}.chapters.json`);
  let chaptersFile;
  try {
    const raw = await fs.readFile(chaptersPath, "utf-8");
    chaptersFile = ChaptersFileSchema.parse(JSON.parse(raw));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") {
      console.error(`Không tìm thấy ${chaptersPath}.`);
      console.error(
        `Chạy parse-chapters trước: tsx gallery/scripts/parse-chapters.ts ${name}`,
      );
      process.exit(2);
    }
    throw e;
  }

  const chapters = chaptersFile.chapters;
  if (chapters.length === 0) {
    console.error(`${chaptersPath} không có chapter nào.`);
    process.exit(3);
  }

  // 1. Tạo folder tree
  const assetsRoot = path.join(INPUT_DIR, `${name}.assets`);
  await ensureChapterFolders(assetsRoot, chapters);

  // 2. Extract candidates + count collected
  const chapterRows: AssetsChecklistChapter[] = [];
  for (const ch of chapters) {
    const candidates = extractCandidates(ch.title);
    const folder = path.join(assetsRoot, ch.id);
    const { count, files } = await countCollectedAssets(folder);
    chapterRows.push({
      id: ch.id,
      title: ch.title,
      startMs: ch.startMs,
      candidates,
      folder,
      collected: count,
      files,
    });
  }

  // 3. Tổng hợp
  const totalCandidates = chapterRows.reduce(
    (sum, c) => sum + c.candidates.length,
    0,
  );
  const totalCollected = chapterRows.reduce((sum, c) => sum + c.collected, 0);

  const checklist: AssetsChecklist = {
    name,
    generatedAt: new Date().toISOString(),
    totalChapters: chapters.length,
    totalCandidates,
    totalCollected,
    chapters: chapterRows,
  };

  // 4. Ghi file
  await fs.mkdir(TMP_DIR, { recursive: true });
  const mdPath = path.join(TMP_DIR, `${name}.assets-checklist.md`);
  const jsonPath = path.join(TMP_DIR, `${name}.assets-checklist.json`);
  await fs.writeFile(mdPath, buildMarkdown(name, checklist));
  await fs.writeFile(jsonPath, JSON.stringify(checklist, null, 2));

  // 5. Console summary
  console.log(`✓ ${chapters.length} chapters scanned`);
  console.log(`  • ${totalCandidates} candidates extracted`);
  console.log(`  • ${totalCollected} assets đã có`);
  console.log(`  • Markdown:   ${mdPath}`);
  console.log(`  • JSON:       ${jsonPath}`);
  console.log(`  • Folders:    ${assetsRoot}/ch-NN/`);

  const missing = chapterRows.filter(
    (c) => c.candidates.length > 0 && c.collected === 0,
  );
  if (missing.length > 0) {
    console.log("");
    console.log(`⚠️  ${missing.length} chương đang thiếu asset:`);
    for (const c of missing.slice(0, 8)) {
      const cands = c.candidates.slice(0, 3).join(", ");
      console.log(`  ${c.id}  ${c.title}  →  ${cands}`);
    }
    if (missing.length > 8) {
      console.log(`  … (${missing.length - 8} chương khác)`);
    }
  }
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
