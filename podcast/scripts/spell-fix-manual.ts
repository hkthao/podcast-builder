/**
 * spell-fix-manual.ts — sửa chính tả transcript KHÔNG gọi OpenAI (Claude / người sửa tay).
 * Sinh ra + ghi lại corrected.json theo ĐÚNG format sentence-level của spell-fix.ts,
 * nên plan-episode + captions đọc y hệt như bản OpenAI.
 *
 * Grouping tokens→sentences replicate NGUYÊN VĂN từ spell-fix.ts (cùng id + offsets).
 *
 * Cách dùng (2 bước):
 *   1) npx tsx podcast/scripts/spell-fix-manual.ts dump <base>
 *      → ghi tmp/<base>.sentences.json = [{id,text}]  (Claude đọc + sửa file này,
 *        ghi tmp/<base>.sentences.corrected.json cùng dạng [{id,text}], giữ nguyên id)
 *   2) npx tsx podcast/scripts/spell-fix-manual.ts apply <base>
 *      → ghi tmp/<base>.corrected.json (sentence-level, mtime mới) → make cache-skip OpenAI.
 *   <base> = tên file không đuôi, vd vi-sao-giam-gia-khien-ta-mua-do-khong-can
 */
import fs from "node:fs";
import path from "node:path";
import type { Transcript } from "../../shared/transcribe/transcribe";

type Seg = Transcript["transcription"][number];
type Sentence = { id: number; text: string; startMs: number; endMs: number };

const MAX_SENTENCE_CHARS = 500;
const SENTENCE_END_RE = /[.!?…]\s*$/;

const groupIntoSentences = (segments: Seg[]): Sentence[] => {
  const out: Sentence[] = [];
  let bufText = "";
  let bufStart = 0;
  let bufEnd = 0;
  let nextId = 0;
  let hasContent = false;
  const flush = () => {
    if (!hasContent) return;
    const trimmed = bufText.trim();
    if (trimmed.length > 0) out.push({ id: nextId++, text: trimmed, startMs: bufStart, endMs: bufEnd });
    bufText = "";
    hasContent = false;
  };
  for (const seg of segments) {
    if (!hasContent) {
      bufStart = seg.offsets.from;
      hasContent = true;
    }
    bufText += seg.text;
    bufEnd = seg.offsets.to;
    if (SENTENCE_END_RE.test(bufText) || bufText.length >= MAX_SENTENCE_CHARS) flush();
  }
  flush();
  return out;
};

const msToTimestamp = (ms: number): string => {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const millis = ms % 1000;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(millis).padStart(3, "0")}`;
};

const TMP = path.resolve("tmp");

function main() {
  const mode = process.argv[2];
  const base = process.argv[3];
  if (!mode || !base || !["dump", "apply", "flags"].includes(mode)) {
    throw new Error("Usage: spell-fix-manual.ts <dump|apply|flags> <base>");
  }

  // flags: in ra CÁC CÂU USER ĐÁNH DẤU LỖI trên UI (tmp/<base>.flags.json) kèm
  // ngữ cảnh, theo ĐÚNG index segment (khớp corrected.json). Claude đọc output
  // này rồi sửa trực tiếp các segment tương ứng trong tmp/<base>.corrected.json.
  if (mode === "flags") {
    const flagsPath = path.join(TMP, `${base}.flags.json`);
    if (!fs.existsSync(flagsPath)) {
      console.log(`[flags] Không có ${flagsPath} — user chưa đánh dấu câu nào.`);
      return;
    }
    const corrPath = path.join(TMP, `${base}.corrected.json`);
    const tPath = fs.existsSync(corrPath) ? corrPath : path.join(TMP, `${base}.json`);
    if (!fs.existsSync(tPath)) throw new Error(`Transcript không tồn tại: ${tPath}`);
    const t = JSON.parse(fs.readFileSync(tPath, "utf-8")) as Transcript;
    const segs = t.transcription;
    const ids: number[] = (JSON.parse(fs.readFileSync(flagsPath, "utf-8")).flaggedIds ?? [])
      .filter((n: unknown): n is number => Number.isInteger(n))
      .sort((a: number, b: number) => a - b);
    console.log(`[flags] ${ids.length} câu user đánh dấu lỗi (nguồn: ${path.basename(tPath)}):\n`);
    for (const i of ids) {
      const prev = segs[i - 1]?.text?.trim();
      const cur = segs[i]?.text?.trim();
      const next = segs[i + 1]?.text?.trim();
      if (prev) console.log(`   #${i - 1}  ${prev}`);
      console.log(`>> #${i}  ${cur ?? "(không tồn tại)"}`);
      if (next) console.log(`   #${i + 1}  ${next}`);
      console.log("");
    }
    console.log(`Sửa các câu ">> #i" trong tmp/${base}.corrected.json (giữ nguyên số câu), rồi bỏ cờ trên UI.`);
    return;
  }

  const rawPath = path.join(TMP, `${base}.json`);
  if (!fs.existsSync(rawPath)) throw new Error(`Raw transcript không tồn tại: ${rawPath}`);
  const transcript = JSON.parse(fs.readFileSync(rawPath, "utf-8")) as Transcript;
  const sentences = groupIntoSentences(transcript.transcription);

  if (mode === "dump") {
    const outSent = path.join(TMP, `${base}.sentences.json`);
    fs.writeFileSync(outSent, JSON.stringify(sentences.map((s) => ({ id: s.id, text: s.text })), null, 2));
    console.log(`[dump] ${sentences.length} sentences → ${outSent}`);
    console.log(`[dump] Sửa rồi ghi tmp/${base}.sentences.corrected.json ([{id,text}]) → rồi chạy: apply ${base}`);
    return;
  }

  // apply
  const corrPath = path.join(TMP, `${base}.sentences.corrected.json`);
  if (!fs.existsSync(corrPath)) throw new Error(`Chưa có file sửa: ${corrPath}`);
  const corrected = JSON.parse(fs.readFileSync(corrPath, "utf-8")) as { id: number; text: string }[];
  const byId = new Map(corrected.map((c) => [c.id, c.text]));

  // Sanity: phải đủ id, đúng số lượng.
  const missing = sentences.filter((s) => !byId.has(s.id)).map((s) => s.id);
  if (missing.length) throw new Error(`Thiếu ${missing.length} id trong corrected: ${missing.slice(0, 10).join(",")}...`);
  if (corrected.length !== sentences.length)
    console.warn(`[apply] ⚠ số câu lệch: raw=${sentences.length} corrected=${corrected.length} (dùng theo id)`);

  const newTranscription = sentences.map((s) => {
    const text = byId.get(s.id)!.trim();
    return {
      text: ` ${text}`,
      offsets: { from: s.startMs, to: s.endMs },
      tokens: [],
      timestamps: { from: msToTimestamp(s.startMs), to: msToTimestamp(s.endMs) },
    } as unknown as Seg;
  });

  const outPath = path.join(TMP, `${base}.corrected.json`);
  fs.writeFileSync(outPath, JSON.stringify({ ...transcript, transcription: newTranscription }, null, 2));
  console.log(`[apply] ✓ ${outPath} — ${newTranscription.length} câu (sentence-level, KHÔNG gọi OpenAI)`);
}

main();
