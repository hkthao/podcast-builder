/**
 * story-audio.ts — 1 lệnh cho phần MÁY MÓC của audio kể chuyện (Claude không phải chạy/đọc
 * log từng bước): Gemini TTS → story-align (ghép + căn chữ) → audio-qc (Gemini nghe giọng)
 * → trượt QC hoặc neo chữ < 70% thì xoá các phần và gen lại (tối đa --attempts, mặc định 3).
 *
 * Usage: npx tsx story/scripts/story-audio.ts <slug> [--attempts=3] [--fresh]
 *   --fresh: xoá input/<slug>.parts/ trước lần đầu (mặc định giữ phần đã gen).
 * In dòng cuối JSON {pass, attempts, anchorPct, qc} · exit 0 = đạt, 2 = hết lượt vẫn trượt, 1 = lỗi.
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const MIN_ANCHOR_PCT = 70;

const tsx = (script: string, args: string[]) =>
  spawnSync("npx", ["tsx", `story/scripts/${script}`, ...args], { encoding: "utf-8", maxBuffer: 64 * 1024 * 1024 });

const slug = process.argv[2];
if (!slug) {
  console.error("Usage: npx tsx story/scripts/story-audio.ts <slug> [--attempts=3] [--fresh]");
  process.exit(1);
}
const attempts = Number(process.argv.find((a) => a.startsWith("--attempts="))?.split("=")[1] ?? 3);
const partsDir = path.resolve("input", `${slug}.parts`);
const clearParts = () => fs.rmSync(partsDir, { recursive: true, force: true });
const log = (m: string) => console.log(`[story-audio] ${m}`);

if (process.argv.includes("--fresh")) clearParts();

let last: { pass: boolean; attempts: number; anchorPct: number | null; qc: unknown } = {
  pass: false, attempts: 0, anchorPct: null, qc: null,
};
for (let n = 1; n <= attempts; n++) {
  last.attempts = n;
  const tts = tsx("story-tts-gemini.ts", [slug]);
  if (tts.status !== 0) {
    console.error(tts.stdout + tts.stderr);
    process.exit(1);
  }
  const al = tsx("story-align.ts", [slug]);
  if (al.status !== 0) {
    console.error(al.stdout + al.stderr);
    process.exit(1);
  }
  const pct = Number(al.stdout.match(/neo \d+\/\d+ từ \((\d+)%\)/)?.[1] ?? 0);
  last.anchorPct = pct;
  if (pct < MIN_ANCHOR_PCT) {
    log(`lần ${n}: neo chữ ${pct}% < ${MIN_ANCHOR_PCT}% (Gemini đọc lệch kịch bản) → gen lại`);
    clearParts();
    continue;
  }
  const qc = tsx("audio-qc.ts", [slug]);
  const json = qc.stdout.slice(qc.stdout.indexOf("{"));
  try {
    last.qc = JSON.parse(json);
  } catch {
    console.error(qc.stdout + qc.stderr);
    process.exit(1);
  }
  if (qc.status === 0) {
    last.pass = true;
    log(`lần ${n}: ✓ đạt (neo ${pct}%, giọng Bắc)`);
    break;
  }
  if (qc.status !== 2) {
    console.error(qc.stderr);
    process.exit(1);
  }
  log(`lần ${n}: ✗ QC trượt (${JSON.stringify((last.qc as { southernSegments?: unknown }).southernSegments ?? [])}) → gen lại`);
  clearParts();
}
console.log(JSON.stringify(last));
process.exit(last.pass ? 0 : 2);
