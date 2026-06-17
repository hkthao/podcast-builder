import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import OpenAI from "openai";
import dotenv from "dotenv";
import type { Transcript } from "../../shared/transcribe/transcribe";

dotenv.config();

type TranscriptSegment = Transcript["transcription"][number];

const BATCH_SIZE = 20;
const MODEL = process.env.SPELL_FIX_MODEL ?? "gpt-4o-mini";
const CONCURRENCY = 6;
/** Nếu length corrected khác original >35% → reject. */
const MAX_LENGTH_DELTA = 0.35;
/** Max chars/sentence để không vượt context model. */
const MAX_SENTENCE_CHARS = 500;
/** Sentence ends with these. */
const SENTENCE_END_RE = /[.!?…]\s*$/;

const SPELL_FIX_PROMPT = `Bạn là biên tập viên tiếng Việt sửa lỗi chính tả cho transcript Whisper podcast.

INPUT: mảng JSON các câu (id + text). Mỗi text là MỘT CÂU đầy đủ của podcast tiếng Việt.

CHỈ sửa:
- LỖI CHÍNH TẢ tiếng Việt (vd "khổng lộ" → "khổng lồ", "ký lạ" → "kỳ lạ", "hệ" → "hề")
- DẤU TIẾNG VIỆT đặt sai (sắc/huyền/hỏi/ngã/nặng lẫn lộn)
- DẤU CÂU thiếu (. , ? !) — chỉ khi rõ ràng

TUYỆT ĐỐI KHÔNG được:
- Thay đổi nội dung / ý nghĩa
- THÊM hoặc BỚT từ thực sự — text đã sửa phải có ~SAME word count
- Diễn giải lại, paraphrase, dịch, tóm tắt
- Đổi tên riêng / thuật ngữ kỹ thuật (giữ nguyên)
- Sửa văn nói ("nhỉ", "ờ", "à", "đó", "này") thành văn viết — giữ nguyên
- Đổi cách nói thân mật thành trang trọng

OUTPUT: { "items": [{ "id": <int>, "text": "<đã sửa>" }] }
PHẢI giữ ĐÚNG SỐ LƯỢNG ID + thứ tự.`;

type Sentence = {
  id: number;
  text: string;
  startMs: number;
  endMs: number;
};

type FixItem = { id: number; text: string };

const ensureDir = (p: string) => {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
};

/** Gom token-level Whisper segments thành sentence-level. */
const groupIntoSentences = (segments: TranscriptSegment[]): Sentence[] => {
  const out: Sentence[] = [];
  let bufText = "";
  let bufStart = 0;
  let bufEnd = 0;
  let nextId = 0;
  let hasContent = false;

  const flush = () => {
    if (!hasContent) return;
    const trimmed = bufText.trim();
    if (trimmed.length > 0) {
      out.push({ id: nextId++, text: trimmed, startMs: bufStart, endMs: bufEnd });
    }
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

    if (SENTENCE_END_RE.test(bufText) || bufText.length >= MAX_SENTENCE_CHARS) {
      flush();
    }
  }
  flush();
  return out;
};

async function fixBatch(
  openai: OpenAI,
  batch: FixItem[],
  signal?: AbortSignal,
): Promise<FixItem[] | null> {
  try {
    const response = await openai.chat.completions.create(
      {
        model: MODEL,
        temperature: 0,
        messages: [
          { role: "system", content: SPELL_FIX_PROMPT },
          { role: "user", content: JSON.stringify({ items: batch }) },
        ],
        response_format: { type: "json_object" },
      },
      { signal },
    );
    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error("empty response");
    const parsed = JSON.parse(content) as { items?: unknown };
    if (!Array.isArray(parsed.items)) throw new Error("response missing items[]");
    const valid: FixItem[] = [];
    for (const it of parsed.items as unknown[]) {
      const obj = it as { id?: unknown; text?: unknown };
      if (typeof obj.id !== "number" || !Number.isInteger(obj.id)) continue;
      if (typeof obj.text !== "string") continue;
      valid.push({ id: obj.id, text: obj.text });
    }
    return valid;
  } catch (e) {
    // Re-throw AbortError so spellFix loop bails out instead of silently
    // logging every cancelled batch as a "fail".
    if ((e as Error).name === "AbortError" || signal?.aborted) {
      throw e;
    }
    console.warn(
      `  ✗ batch ${batch[0]?.id}-${batch[batch.length - 1]?.id} fail:`,
      e,
    );
    return null;
  }
}

const acceptCorrection = (orig: string, corr: string): string => {
  const oTrim = orig.trim();
  const cTrim = corr.trim();
  if (cTrim.length === 0) return orig;
  const delta = Math.abs(cTrim.length - oTrim.length) / Math.max(1, oTrim.length);
  if (delta > MAX_LENGTH_DELTA) return orig;
  return cTrim;
};

export async function spellFix(
  transcriptPath: string,
  outPath: string,
  { force = false, signal }: { force?: boolean; signal?: AbortSignal } = {},
): Promise<void> {
  if (!fs.existsSync(transcriptPath)) {
    throw new Error(`Transcript không tồn tại: ${transcriptPath}`);
  }
  // Cache: mtime check — corrected.json phải mới hơn transcript gốc.
  if (fs.existsSync(outPath) && !force) {
    const srcMtime = fs.statSync(transcriptPath).mtimeMs;
    const outMtime = fs.statSync(outPath).mtimeMs;
    if (outMtime >= srcMtime) {
      console.log(`[spell-fix] [cache] skip ${outPath}`);
      return;
    }
    console.log(`[spell-fix] cache stale (src mới hơn), regen...`);
  }
  if (!process.env.OPENAI_API_KEY) {
    console.warn(
      `[spell-fix] ⚠ Thiếu OPENAI_API_KEY — copy raw (KHÔNG sửa lỗi).`,
    );
    ensureDir(path.dirname(outPath));
    fs.copyFileSync(transcriptPath, outPath);
    return;
  }

  const transcript = JSON.parse(fs.readFileSync(transcriptPath, "utf-8")) as Transcript;
  const tokens = transcript.transcription;
  const sentences = groupIntoSentences(tokens);
  console.log(
    `[spell-fix] ${tokens.length} tokens → ${sentences.length} sentences, batch=${BATCH_SIZE}, conc=${CONCURRENCY}, model=${MODEL}`,
  );

  if (sentences.length === 0) {
    ensureDir(path.dirname(outPath));
    fs.copyFileSync(transcriptPath, outPath);
    return;
  }

  const openai = new OpenAI();
  const correctedText = new Map<number, string>(
    sentences.map((s) => [s.id, s.text]),
  );

  const batches: FixItem[][] = [];
  for (let i = 0; i < sentences.length; i += BATCH_SIZE) {
    const batch = sentences
      .slice(i, i + BATCH_SIZE)
      .map((s) => ({ id: s.id, text: s.text }));
    batches.push(batch);
  }

  let okBatches = 0;
  let failBatches = 0;
  let rejectedItems = 0;
  let appliedItems = 0;

  const t0 = Date.now();
  for (let i = 0; i < batches.length; i += CONCURRENCY) {
    if (signal?.aborted) {
      const err = new Error("Cancelled by user");
      err.name = "AbortError";
      throw err;
    }
    const wave = batches.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      wave.map((b) => fixBatch(openai, b, signal)),
    );
    for (let w = 0; w < wave.length; w++) {
      const items = results[w];
      const sentIds = new Set(wave[w]!.map((b) => b.id));
      if (!items) {
        failBatches++;
        continue;
      }
      okBatches++;
      for (const item of items) {
        if (!sentIds.has(item.id)) continue; // reject hallucinated id
        const original = correctedText.get(item.id)!;
        const finalText = acceptCorrection(original, item.text);
        if (finalText === original) {
          rejectedItems++;
        } else {
          appliedItems++;
          correctedText.set(item.id, finalText);
        }
      }
    }
    const done = Math.min(batches.length, i + CONCURRENCY);
    if (done % (CONCURRENCY * 3) === 0 || done === batches.length) {
      console.log(
        `  [${done}/${batches.length}] ${((Date.now() - t0) / 1000).toFixed(1)}s`,
      );
    }
  }

  // Replace transcription with sentence-level entries.
  // Mỗi sentence trở thành 1 entry với offsets từ token đầu tới token cuối.
  // Captions/BGMTrack/scenes chỉ đọc text + offsets — schema tương thích.
  const newTranscription: TranscriptSegment[] = sentences.map((s) => {
    const text = correctedText.get(s.id)!;
    // Giữ leading space để splitScenes/captions concat đúng word boundary.
    return {
      text: ` ${text}`,
      offsets: { from: s.startMs, to: s.endMs },
      tokens: [],
      timestamps: {
        from: msToTimestamp(s.startMs),
        to: msToTimestamp(s.endMs),
      },
    } as unknown as TranscriptSegment;
  });

  ensureDir(path.dirname(outPath));
  fs.writeFileSync(
    outPath,
    JSON.stringify(
      { ...transcript, transcription: newTranscription },
      null,
      2,
    ),
  );
  console.log(
    `[spell-fix] ✓ ${outPath} — ${appliedItems} sửa, ${rejectedItems} reject, ${failBatches}/${batches.length} batch fail (${((Date.now() - t0) / 1000).toFixed(1)}s)`,
  );
}

const msToTimestamp = (ms: number): string => {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const millis = ms % 1000;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(millis).padStart(3, "0")}`;
};

const isMain = (() => {
  try {
    return process.argv[1] === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
})();

if (isMain) {
  const audio = process.argv[2];
  if (!audio) {
    console.error("Usage: tsx scripts/spell-fix.ts <audio-file> [--force]");
    process.exit(1);
  }
  const force = process.argv.includes("--force");
  const audioPath = path.resolve(audio);
  const name = path.basename(audioPath).replace(/\.[^.]+$/, "");
  const transcriptPath = path.resolve("tmp", `${name}.json`);
  const outPath = path.resolve("tmp", `${name}.corrected.json`);

  spellFix(transcriptPath, outPath, { force }).catch((e: unknown) => {
    console.error("[spell-fix] FAIL:", e);
    process.exit(1);
  });
}
