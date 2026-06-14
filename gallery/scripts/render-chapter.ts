#!/usr/bin/env tsx
/**
 * CLI: render 1 chapter của gallery plan thành MP4.
 *
 * Usage:
 *   tsx gallery/scripts/render-chapter.ts --plan-id=<id> --chapter=<idx>
 *
 * Flags:
 *   --plan-id=<id>             Plan ID (từ /api/gallery/plans hoặc UI URL)
 *   --chapter=<idx>            Chapter index (0-based)
 *   --audio-base=<url>         Base URL studio server (default http://127.0.0.1:3001)
 *
 * Output:
 *   tmp/gallery-<plan-id>-ch<idx>.mp4
 *
 * Lưu ý: Studio server phải đang chạy để Remotion fetch audio qua HTTP.
 */
import "dotenv/config";
import { renderChapter } from "../../shared/studio-core/gallery-render";

function parseFlags(argv: string[]): {
  planId: string | null;
  chapterIdx: number | null;
  audioBase: string;
} {
  let planId: string | null = null;
  let chapterIdx: number | null = null;
  let audioBase = "http://127.0.0.1:3001";
  for (const arg of argv.slice(2)) {
    if (arg.startsWith("--plan-id=")) planId = arg.slice(10);
    else if (arg.startsWith("--chapter=")) {
      const n = Number(arg.slice(10));
      if (Number.isInteger(n)) chapterIdx = n;
    } else if (arg.startsWith("--audio-base=")) audioBase = arg.slice(13);
  }
  return { planId, chapterIdx, audioBase };
}

async function main(): Promise<void> {
  const { planId, chapterIdx, audioBase } = parseFlags(process.argv);
  if (!planId || chapterIdx === null) {
    console.error(
      "Usage: tsx gallery/scripts/render-chapter.ts --plan-id=<id> --chapter=<idx>",
    );
    process.exit(1);
  }

  const startTime = Date.now();
  let lastPct = 0;
  try {
    const result = await renderChapter({
      planId,
      chapterIdx,
      audioUrlBase: audioBase,
      onProgress: (pct, msg) => {
        const intPct = Math.floor(pct);
        if (intPct !== lastPct) {
          lastPct = intPct;
          process.stdout.write(`\r[${intPct}%] ${msg}                    `);
        }
      },
    });
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\n✓ Done in ${elapsed}s`);
    console.log(`  Output: ${result.outputPath}`);
    console.log(`  Duration: ${(result.durationMs / 1000).toFixed(1)}s`);
  } catch (e) {
    console.error(`\n✗ Render failed: ${(e as Error).message}`);
    process.exit(2);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(99);
});
