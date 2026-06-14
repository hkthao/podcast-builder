/**
 * Gallery concat + export pipeline — Phase 4e.
 *
 * Sau khi tất cả chapter MP4 đã render qua Phase 4d.2, ghép thành 1 video
 * final với FFMETADATA chapter markers (YouTube auto-detect chapters).
 *
 * Output:
 *   tmp/gallery-{planId}-final.mp4         — video ghép có chapter markers
 *   tmp/gallery-{planId}-chapters.txt      — YouTube description chapters
 *
 * Pipeline:
 *   1. Validate: tất cả chapter có videoFilename + file tồn tại
 *   2. ffprobe lấy duration thật mỗi chapter (lock-step với videoDurationMs)
 *   3. Build concat list file
 *   4. Build FFMETADATA cho chapter markers
 *   5. ffmpeg concat (-c copy — codec must match) → intermediate
 *   6. ffmpeg metadata inject (-map_metadata 1 -codec copy) → final
 *   7. Build youtube-chapters.txt (HH:MM:SS - Title)
 *   8. Persist plan.outputFilename
 *
 * Concat copy mode yêu cầu codec/dim đồng nhất — đã đảm bảo qua Phase 4d.1
 * (mỗi chapter h264 1920×1080 + AAC).
 */
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { execFile, execFileSync } from "node:child_process";
import { promisify } from "node:util";
import { getPlan, updatePlanOutput } from "./gallery-plan-store";
import { PATHS } from "./paths";

const execFileAsync = promisify(execFile);

export const galleryPlanFinalFilename = (planId: string): string =>
  `gallery-${planId}-final.mp4`;

export const galleryPlanChaptersTxtFilename = (planId: string): string =>
  `gallery-${planId}-chapters.txt`;

const ffprobeDurationMs = (filePath: string): number => {
  const out = execFileSync(
    "ffprobe",
    [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "csv=p=0",
      filePath,
    ],
    { encoding: "utf-8" },
  );
  const sec = parseFloat(out.trim());
  if (!Number.isFinite(sec)) return 0;
  return Math.round(sec * 1000);
};

const msToTimestamp = (ms: number): string => {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${m}:${String(s).padStart(2, "0")}`;
};

const escapeFfmetadataValue = (s: string): string =>
  // FFMETADATA escape: =, ;, #, \, \n
  s.replace(/\\/g, "\\\\").replace(/[=;#]/g, (m) => `\\${m}`).replace(/\n/g, "\\n");

const escapeConcatPath = (p: string): string =>
  // Concat demuxer: escape ' in path
  p.replace(/'/g, "'\\''");

export type ExportResult = {
  outputPath: string;
  outputDurationMs: number;
  chaptersTxtPath: string;
};

export type ExportProgress = (percent: number, message: string) => void;

export async function exportPlan(input: {
  planId: string;
  onProgress?: ExportProgress;
}): Promise<ExportResult> {
  const plan = await getPlan(input.planId);
  if (!plan) {
    const err = new Error(`Plan không tồn tại: ${input.planId}`) as Error & {
      code: string;
    };
    err.code = "NOT_FOUND";
    throw err;
  }

  input.onProgress?.(5, "Validating chapter renders…");
  const missing: number[] = [];
  for (let i = 0; i < plan.chapters.length; i++) {
    const ch = plan.chapters[i];
    if (!ch.videoFilename) {
      missing.push(i);
      continue;
    }
    const p = path.join(PATHS.TMP_DIR, ch.videoFilename);
    if (!fs.existsSync(p)) missing.push(i);
  }
  if (missing.length > 0) {
    const err = new Error(
      `Chapter ${missing.join(", ")} chưa render. Render trước rồi mới concat.`,
    ) as Error & { code: string };
    err.code = "VALIDATION";
    throw err;
  }

  // 2. ffprobe lấy duration thật mỗi chapter — đôi khi lệch vài frame với DB
  input.onProgress?.(15, "Probing chapter durations…");
  const realDurations: number[] = [];
  for (const ch of plan.chapters) {
    const p = path.join(PATHS.TMP_DIR, ch.videoFilename!);
    realDurations.push(ffprobeDurationMs(p));
  }

  // 3. Build concat list file (ffmpeg concat demuxer format)
  input.onProgress?.(20, "Building concat list…");
  const concatListPath = path.join(
    PATHS.TMP_DIR,
    `gallery-${plan.id}-concat.txt`,
  );
  const concatList = plan.chapters
    .map((ch) => {
      const absPath = path.join(PATHS.TMP_DIR, ch.videoFilename!);
      return `file '${escapeConcatPath(absPath)}'`;
    })
    .join("\n");
  await fsp.writeFile(concatListPath, concatList);

  // 4. Build FFMETADATA cho chapter markers
  input.onProgress?.(25, "Building chapter metadata…");
  const metadataPath = path.join(
    PATHS.TMP_DIR,
    `gallery-${plan.id}-metadata.txt`,
  );
  const metaLines: string[] = [";FFMETADATA1"];
  let cursor = 0;
  for (let i = 0; i < plan.chapters.length; i++) {
    const ch = plan.chapters[i];
    const start = cursor;
    const end = cursor + realDurations[i];
    metaLines.push(
      "",
      "[CHAPTER]",
      "TIMEBASE=1/1000",
      `START=${start}`,
      `END=${end}`,
      `title=${escapeFfmetadataValue(`${i + 1}. ${ch.title}`)}`,
    );
    cursor = end;
  }
  await fsp.writeFile(metadataPath, metaLines.join("\n"));

  // 5. ffmpeg concat (intermediate file) → 6. metadata inject (final)
  const finalFilename = galleryPlanFinalFilename(plan.id);
  const finalPath = path.join(PATHS.TMP_DIR, finalFilename);
  const intermediatePath = path.join(
    PATHS.TMP_DIR,
    `gallery-${plan.id}-concat.mp4`,
  );

  input.onProgress?.(35, "Concatenating chapters…");
  await execFileAsync("ffmpeg", [
    "-y",
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    concatListPath,
    "-c",
    "copy",
    "-movflags",
    "+faststart",
    intermediatePath,
  ]);

  input.onProgress?.(70, "Injecting chapter metadata…");
  await execFileAsync("ffmpeg", [
    "-y",
    "-i",
    intermediatePath,
    "-i",
    metadataPath,
    "-map_metadata",
    "1",
    "-codec",
    "copy",
    "-movflags",
    "+faststart",
    finalPath,
  ]);

  // Cleanup intermediate
  await fsp.unlink(intermediatePath).catch(() => {
    /* ignore */
  });
  await fsp.unlink(concatListPath).catch(() => {
    /* ignore */
  });
  await fsp.unlink(metadataPath).catch(() => {
    /* ignore */
  });

  // 7. Build youtube-chapters.txt (HH:MM:SS - Title), 1 line per chapter
  input.onProgress?.(90, "Writing chapters.txt…");
  cursor = 0;
  const chaptersTxtLines: string[] = [];
  for (let i = 0; i < plan.chapters.length; i++) {
    const ch = plan.chapters[i];
    chaptersTxtLines.push(`${msToTimestamp(cursor)} - ${i + 1}. ${ch.title}`);
    cursor += realDurations[i];
  }
  const chaptersTxtFilename = galleryPlanChaptersTxtFilename(plan.id);
  const chaptersTxtPath = path.join(PATHS.TMP_DIR, chaptersTxtFilename);
  await fsp.writeFile(chaptersTxtPath, chaptersTxtLines.join("\n") + "\n");

  // 8. Persist plan.outputFilename
  input.onProgress?.(95, "Updating plan…");
  const totalDurationMs = ffprobeDurationMs(finalPath);
  await updatePlanOutput(plan.id, {
    outputFilename: finalFilename,
    outputDurationMs: totalDurationMs,
  });

  input.onProgress?.(100, "Done");
  return {
    outputPath: finalPath,
    outputDurationMs: totalDurationMs,
    chaptersTxtPath,
  };
}
