/**
 * viz-anchor.ts — neo cảnh vẽ tay vào audio KHÔNG có kịch bản (NotebookLM).
 *
 * Claude viết input/<slug>.viz.json = { "beats": [ { "at": "<đoạn chữ host nói>", "type": …, … } ] }
 * (cùng dạng VizScene như story.json, `at` bắt buộc là chuỗi). Script tìm câu đầu tiên trong
 * tmp/<slug>.corrected.json chứa đoạn chữ đó — so khớp bỏ dấu/hoa/dấu câu, theo ĐÚNG thứ tự
 * (cảnh sau tìm từ sau câu của cảnh trước) → tmp/<slug>.viz.json (mỗi cảnh kéo tới cảnh kế).
 *
 * Chạy SAU khi sửa chính tả transcript (spell-fix-manual apply). Đoạn không tìm thấy → báo lỗi,
 * sửa `at` cho khớp lời thật rồi chạy lại.
 *
 * Usage: npx tsx story/scripts/viz-anchor.ts <slug>
 */
import fs from "node:fs";
import path from "node:path";
import type { VizBeatInput } from "../../podcast/src/viz/types";

const slug = process.argv[2];
if (!slug) {
  console.error("Usage: npx tsx story/scripts/viz-anchor.ts <slug>");
  process.exit(1);
}

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

type Sentence = { text: string; offsets: { from: number; to: number } };
const transcript = JSON.parse(fs.readFileSync(path.join("tmp", `${slug}.corrected.json`), "utf-8")) as {
  transcription: Sentence[];
};
const sents = transcript.transcription.map((s) => ({ ...s, n: norm(s.text) }));
const spec = JSON.parse(fs.readFileSync(path.join("input", `${slug}.viz.json`), "utf-8")) as { beats: VizBeatInput[] };

let from = 0;
const missing: string[] = [];
const starts = spec.beats.flatMap(({ at, ...scene }) => {
  const key = norm(String(at ?? ""));
  // Đoạn chữ có thể vắt qua 2 câu → thử câu đơn trước, rồi câu ghép với câu kế.
  let idx = sents.findIndex((s, i) => i >= from && s.n.includes(key));
  if (idx < 0) idx = sents.findIndex((s, i) => i >= from && `${s.n} ${sents[i + 1]?.n ?? ""}`.includes(key));
  if (idx < 0) {
    missing.push(String(at));
    return [];
  }
  from = idx;
  // Hiện cảnh sớm ~250ms để hình ra kịp lúc giọng nói tới ý đó.
  return [{ startMs: Math.max(0, sents[idx].offsets.from - 250), scene, line: sents[idx].text.trim() }];
});

if (missing.length) {
  console.error(`[viz-anchor] ✗ không tìm thấy ${missing.length} đoạn (sửa "at" theo lời thật trong transcript):`);
  for (const m of missing) console.error(`   - "${m}"`);
  process.exit(2);
}

const lastMs = sents[sents.length - 1].offsets.to + 400;
const beats = starts.map((b, i) => ({ startMs: b.startMs, endMs: starts[i + 1]?.startMs ?? lastMs, scene: b.scene }));
fs.writeFileSync(path.join("tmp", `${slug}.viz.json`), JSON.stringify({ version: 1, beats }, null, 2));
for (const [i, b] of starts.entries()) {
  const dur = (beats[i].endMs - beats[i].startMs) / 1000;
  console.log(`  ${(b.startMs / 1000).toFixed(1).padStart(6)}s  ${dur.toFixed(1).padStart(5)}s  ${b.scene.type.padEnd(10)} ← ${b.line.slice(0, 70)}`);
}
console.log(`[viz-anchor] ✓ ${beats.length} cảnh → tmp/${slug}.viz.json`);
