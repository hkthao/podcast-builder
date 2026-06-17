#!/usr/bin/env tsx
/**
 * CLI: resolve assets cho 1 chapter của gallery plan (Documentary Phase 3).
 *
 * Usage:
 *   tsx gallery/scripts/resolve-chapter.ts --plan-id=<id> --chapter=<idx>
 *
 * Flags:
 *   --plan-id=<id>      Plan ID (từ /api/gallery/plans hoặc UI URL)
 *   --chapter=<idx>     Chapter index (0-based)
 *   --watch-dir=<path>  Folder để watch Draw Things output (default ~/Downloads)
 *
 * Output:
 *   - Tải files vào tmp/gallery-assets/<plan-id>/
 *   - Ghi <hash>.prompt.txt cho AI beats chưa gen
 *   - In ra report: resolved/pending/failed counts + danh sách
 *
 * Workflow Draw Things manual:
 *   1. Chạy lần 1 → resolver tải archive/stock + ghi prompts cho AI
 *   2. User mở Draw Things, gen từng prompt, save ảnh với tên `<hash>.png`
 *      vào ~/Downloads
 *   3. Chạy lại resolve → resolver scan ~/Downloads, attach AI ảnh
 *   4. Lặp tới khi pending = 0
 */
import "dotenv/config";
import {
  defaultResolverOptions,
  resolveChapterAssets,
  type ResolveResult,
} from "../../shared/studio-core/gallery-asset-resolver";
import { getPlan } from "../../shared/studio-core/gallery-plan-store";
import { inferSeriesSlug } from "../../shared/studio-core/gallery-plan-store";

type Flags = {
  planId: string | null;
  chapterIdx: number | null;
  watchDir: string | null;
};

function parseFlags(argv: string[]): Flags {
  let planId: string | null = null;
  let chapterIdx: number | null = null;
  let watchDir: string | null = null;
  for (const arg of argv.slice(2)) {
    if (arg.startsWith("--plan-id=")) planId = arg.slice(10);
    else if (arg.startsWith("--chapter=")) {
      const n = Number(arg.slice(10));
      if (Number.isInteger(n)) chapterIdx = n;
    } else if (arg.startsWith("--watch-dir=")) watchDir = arg.slice(12);
  }
  return { planId, chapterIdx, watchDir };
}

function printReport(r: ResolveResult, chapterIdx: number): void {
  console.log(`\n── Chapter #${chapterIdx} resolve report ──`);
  console.log(
    `  ✓ resolved: ${r.resolved.length}   ⏳ pending: ${r.pending.length}   ✗ failed: ${r.failed.length}\n`,
  );

  if (r.resolved.length > 0) {
    console.log("Resolved:");
    for (const a of r.resolved) {
      const tag = a.isVideo ? "video" : a.source === "motion" ? "motion" : "image";
      console.log(
        `  [${tag.padEnd(6)}] beat ${String(a.beatIdx).padStart(3, "0")}  ${a.source.padEnd(10)} ${a.localPath}`,
      );
    }
  }

  if (r.pending.length > 0) {
    console.log("\n⏳ Pending (gen ở Draw Things, save về Downloads):");
    for (const p of r.pending) {
      console.log(`\n  beat ${String(p.beatIdx).padStart(3, "0")}  hash=${p.hash}`);
      console.log(`     prompt file: ${p.promptPath}`);
      console.log(`     expected   : ${p.expectedFilename}`);
      console.log(`     prompt     : ${p.prompt.slice(0, 100)}…`);
    }
    console.log(
      "\n  → Lưu ảnh với đúng tên `<hash>.png` vào ~/Downloads rồi chạy lại lệnh này.",
    );
  }

  if (r.failed.length > 0) {
    console.log("\n✗ Failed:");
    for (const f of r.failed) {
      console.log(`  beat ${String(f.beatIdx).padStart(3, "0")}: ${f.reason}`);
    }
  }
}

async function main(): Promise<void> {
  const { planId, chapterIdx, watchDir } = parseFlags(process.argv);
  if (!planId || chapterIdx === null) {
    console.error(
      "Usage: tsx gallery/scripts/resolve-chapter.ts --plan-id=<id> --chapter=<idx>",
    );
    process.exit(1);
  }

  const plan = await getPlan(planId);
  if (!plan) {
    console.error(`✗ Plan không tồn tại: ${planId}`);
    process.exit(2);
  }
  if (chapterIdx < 0 || chapterIdx >= plan.chapters.length) {
    console.error(
      `✗ chapterIdx ${chapterIdx} out of range (0..${plan.chapters.length - 1})`,
    );
    process.exit(2);
  }
  const chapter = plan.chapters[chapterIdx];
  if (chapter.kind === "music") {
    console.error(
      `✗ Chapter ${chapterIdx} là music interlude — không cần resolve visual assets.`,
    );
    process.exit(2);
  }
  if (chapter.shots.length === 0) {
    console.error(
      `✗ Chapter ${chapterIdx} chưa có visualBeats — gen transcript trước.`,
    );
    process.exit(2);
  }

  const series = inferSeriesSlug(plan.ideaSnapshot.title);
  console.log(`Plan      : ${plan.id}`);
  console.log(`Title     : ${plan.ideaSnapshot.title}`);
  console.log(`Series    : ${series ?? "<none>"}`);
  console.log(`Chapter   : ${chapterIdx + 1}/${plan.chapters.length} — ${chapter.title}`);
  console.log(`Beats     : ${chapter.shots.length}`);

  const opts = defaultResolverOptions({ planId });
  if (watchDir) opts.drawThingsWatchDir = watchDir;

  console.log(`Cache dir : ${opts.cacheDir}`);
  console.log(`Watch dir : ${opts.drawThingsWatchDir}`);
  console.log(
    `Pexels key: ${opts.pexelsKey ? "set (****" + opts.pexelsKey.slice(-4) + ")" : "<missing>"}`,
  );

  const startTime = Date.now();
  const result = await resolveChapterAssets({
    planId,
    chapterIdx,
    chapter,
    series,
    options: opts,
  });
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  printReport(result, chapterIdx);
  console.log(`\nDone in ${elapsed}s`);
  process.exit(result.failed.length > 0 && result.resolved.length === 0 ? 3 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(99);
});
