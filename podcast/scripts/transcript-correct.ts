import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import OpenAI from "openai";
import dotenv from "dotenv";
import type { Transcript } from "../../shared/transcribe/transcribe";

dotenv.config();

/**
 * transcript-correct — sửa transcript Whisper KỸ hơn `spell-fix`.
 *
 * Khác spell-fix:
 *  - Chạy lại từ RAW token-level (tmp/<slug>.json) → tránh bug nhân đôi câu.
 *  - ĐƯỢC PHÉP sửa tên riêng / thuật ngữ nghe nhầm (theo glossary) + vá ký tự
 *    hỏng `�` từ ngữ cảnh + sửa từ nghe nhầm (cho đổi word-count vừa phải).
 *  - Vẫn giữ 1:1 số câu + offsets (timestamps) để captions/scenes khớp audio.
 *
 * Glossary: nhúng sẵn các thuật ngữ hay gặp + nạp thêm từ input/<slug>.terms.txt
 * (mỗi dòng: `sai => đúng`  hoặc chỉ ghi dạng đúng cần ưu tiên).
 *
 * Dùng:  tsx podcast/scripts/transcript-correct.ts <audio|slug> [--force]
 */

type TranscriptSegment = Transcript["transcription"][number];

const BATCH_SIZE = 16;
const CONCURRENCY = 6;
// gpt-4o mặc định: gpt-4o-mini sót nhiều lỗi tên riêng/dấu (memory
// transcript-correct-model-gpt4o). Override qua TRANSCRIPT_FIX_MODEL.
const MODEL = process.env.TRANSCRIPT_FIX_MODEL ?? "gpt-4o";
/** Độ dài tối đa của bài luận đưa vào prompt làm nguồn chuẩn (chars). */
const ESSAY_REF_MAX = 9000;
/** Reject nếu độ dài đổi quá nhiều (chống hallucination), nới hơn spell-fix. */
const MAX_LENGTH_DELTA = 0.6;
const MAX_SENTENCE_CHARS = 500;
const SENTENCE_END_RE = /[.!?…]\s*$/;

const BASE_GLOSSARY = [
  "Aristotle (KHÔNG để 'Aristotoli', 'Aristoteles', 'Aristotel')",
  "Robin Dunbar; 'con số Dunbar' (KHÔNG để 'đơn bạ', 'con số đơn 3'); 'nhân chủng học' (KHÔNG 'nhân trùng học')",
  "NPC (nhân vật game) — KHÔNG để 'MPC'",
  "Kleck và Strenta (thí nghiệm vết sẹo giả 1980) — KHÔNG để 'Clark và Stranta'",
  "Thomas Gilovich; hiệu ứng ánh đèn sân khấu (Spotlight effect)",
  "Laura Carstensen; thuyết chọn lọc cảm xúc xã hội (KHÔNG 'trọn lọc')",
  "Jean-Paul Sartre; Martin Heidegger; 'das Man' (đám đông vô danh)",
  "Viktor Frankl; liệu pháp ý nghĩa (logotherapy)",
  "Thuyết quản trị nỗi sợ hãi (Terror Management Theory, TMT)",
].join("\n");

const buildPrompt = (glossary: string, essay: string) => `Bạn là biên tập viên tiếng Việt, sửa transcript do Whisper tạo cho một podcast triết học/tâm lý (giọng nói tự nhiên, hai người trò chuyện).

INPUT: mảng JSON các câu (id + text). Trả về { "items": [{ "id": <int>, "text": "<đã sửa>" }] } — GIỮ ĐÚNG số lượng id + thứ tự.

ĐƯỢC PHÉP sửa:
- Lỗi chính tả + DẤU tiếng Việt (sắc/huyền/hỏi/ngã/nặng) (vd "đọc lớt qua"→"đọc lướt qua", "chật trội"→"chật chội").
- Ký tự hỏng "�" hoặc cụm bị méo do Whisper → suy luận lại ĐÚNG từ theo NGỮ CẢNH.
- TÊN RIÊNG NƯỚC NGOÀI / thuật ngữ nghe nhầm hoặc bị dính liền → sửa đúng theo BÀI LUẬN GỐC + GLOSSARY (vd "Semizeki"/"Semi Zeki"→"Semir Zeki", "Sô-pen-hao-ơ"→"Schopenhauer", "máu gạo tiền"→"cơm áo gạo tiền", "danh giới"→"ranh giới").
- Dấu câu thiếu khi rõ ràng.

TUYỆT ĐỐI KHÔNG:
- Đổi Ý NGHĨA, tóm tắt, paraphrase, dịch, thêm/bớt câu.
- Sửa văn nói thân mật thành trang trọng (giữ "nhỉ", "ờ", "à", "đấy", "luôn", "ạ"...).
- Gộp/tách câu hay đổi thứ tự.
Nếu một câu đã đúng, trả lại y nguyên.
${
  essay
    ? `\nBÀI LUẬN GỐC (NGUỒN CHUẨN — transcript là bản NÓI của bài này; đối chiếu để sửa ĐÚNG tên riêng, thuật ngữ, chính tả; KHÔNG copy câu chữ từ đây, chỉ dùng để chuẩn hoá):\n"""\n${essay}\n"""\n`
    : ""
}
GLOSSARY (chuẩn hoá theo đây):
${glossary}`;

type Sentence = { id: number; text: string; startMs: number; endMs: number };
type FixItem = { id: number; text: string };

const ensureDir = (p: string) => {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
};

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
    if (trimmed.length > 0)
      out.push({ id: nextId++, text: trimmed, startMs: bufStart, endMs: bufEnd });
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
    if (SENTENCE_END_RE.test(bufText) || bufText.length >= MAX_SENTENCE_CHARS)
      flush();
  }
  flush();
  return out;
};

const loadGlossary = (slug: string): string => {
  const parts = [BASE_GLOSSARY];
  // Glossary CHUNG (lỗi Whisper hay gặp, tái dùng mọi tập) — bổ sung dần.
  const common = path.resolve("input", "_common-terms.txt");
  if (fs.existsSync(common)) {
    const c = fs.readFileSync(common, "utf-8").trim();
    if (c) parts.push(c);
  }
  // Glossary riêng tập.
  const p = path.resolve("input", `${slug}.terms.txt`);
  if (fs.existsSync(p)) {
    const extra = fs.readFileSync(p, "utf-8").trim();
    if (extra) parts.push(extra);
  }
  return parts.join("\n");
};

/** Bài luận gốc (nếu có) làm nguồn chuẩn để đối chiếu tên riêng/thuật ngữ. */
const loadEssay = (slug: string): string => {
  const p = path.resolve("input", `${slug}.essay.txt`);
  if (!fs.existsSync(p)) return "";
  return fs.readFileSync(p, "utf-8").trim().slice(0, ESSAY_REF_MAX);
};

async function fixBatch(
  openai: OpenAI,
  prompt: string,
  batch: FixItem[],
): Promise<FixItem[] | null> {
  try {
    const res = await openai.chat.completions.create({
      model: MODEL,
      temperature: 0,
      messages: [
        { role: "system", content: prompt },
        { role: "user", content: JSON.stringify({ items: batch }) },
      ],
      response_format: { type: "json_object" },
    });
    const content = res.choices[0]?.message?.content;
    if (!content) throw new Error("empty response");
    const parsed = JSON.parse(content) as { items?: unknown };
    if (!Array.isArray(parsed.items)) throw new Error("missing items[]");
    const valid: FixItem[] = [];
    for (const it of parsed.items as unknown[]) {
      const o = it as { id?: unknown; text?: unknown };
      if (typeof o.id === "number" && Number.isInteger(o.id) && typeof o.text === "string")
        valid.push({ id: o.id, text: o.text });
    }
    return valid;
  } catch (e) {
    console.warn(`  ✗ batch ${batch[0]?.id}-${batch[batch.length - 1]?.id}:`, e);
    return null;
  }
}

const accept = (orig: string, corr: string): string => {
  const o = orig.trim();
  const c = corr.trim();
  if (c.length === 0) return orig;
  const delta = Math.abs(c.length - o.length) / Math.max(1, o.length);
  if (delta > MAX_LENGTH_DELTA) return orig;
  return c;
};

const msToTimestamp = (ms: number): string => {
  const t = Math.floor(ms / 1000);
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(ms % 1000).padStart(3, "0")}`;
};

export async function correctTranscript(
  rawPath: string,
  outPath: string,
  slug: string,
): Promise<void> {
  if (!process.env.OPENAI_API_KEY) throw new Error("Thiếu OPENAI_API_KEY");
  const transcript = JSON.parse(fs.readFileSync(rawPath, "utf-8")) as Transcript;
  const sentences = groupIntoSentences(transcript.transcription);
  const glossary = loadGlossary(slug);
  const essay = loadEssay(slug);
  console.log(
    `[transcript-correct] ${transcript.transcription.length} tokens → ${sentences.length} câu, model=${MODEL}${essay ? " (+bài luận gốc)" : ""}`,
  );

  const corrected = new Map<number, string>(sentences.map((s) => [s.id, s.text]));
  const batches: FixItem[][] = [];
  for (let i = 0; i < sentences.length; i += BATCH_SIZE)
    batches.push(sentences.slice(i, i + BATCH_SIZE).map((s) => ({ id: s.id, text: s.text })));

  const openai = new OpenAI();
  const prompt = buildPrompt(glossary, essay);
  let applied = 0;
  const t0 = Date.now();
  for (let i = 0; i < batches.length; i += CONCURRENCY) {
    const wave = batches.slice(i, i + CONCURRENCY);
    const results = await Promise.all(wave.map((b) => fixBatch(openai, prompt, b)));
    for (let w = 0; w < wave.length; w++) {
      const items = results[w];
      if (!items) continue;
      const ids = new Set(wave[w]!.map((b) => b.id));
      for (const it of items) {
        if (!ids.has(it.id)) continue;
        const orig = corrected.get(it.id)!;
        const fin = accept(orig, it.text);
        if (fin !== orig) {
          applied++;
          corrected.set(it.id, fin);
        }
      }
    }
    console.log(`  [${Math.min(batches.length, i + CONCURRENCY)}/${batches.length}]`);
  }

  const newTranscription: TranscriptSegment[] = sentences.map(
    (s) =>
      ({
        text: ` ${corrected.get(s.id)!}`,
        offsets: { from: s.startMs, to: s.endMs },
        tokens: [],
        timestamps: { from: msToTimestamp(s.startMs), to: msToTimestamp(s.endMs) },
      }) as unknown as TranscriptSegment,
  );

  ensureDir(path.dirname(outPath));
  fs.writeFileSync(
    outPath,
    JSON.stringify({ ...transcript, transcription: newTranscription }, null, 2),
  );
  console.log(
    `[transcript-correct] ✓ ${outPath} — ${applied}/${sentences.length} câu sửa (${((Date.now() - t0) / 1000).toFixed(1)}s)`,
  );
}

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
    console.error("Usage: tsx podcast/scripts/transcript-correct.ts <audio|slug> [--force]");
    process.exit(1);
  }
  // Chỉ strip đuôi media/transcript đã biết — tránh cắt nhầm hậu tố như ".v2".
  const slug = path.basename(audio).replace(/\.(m4a|mp3|wav|aac|mp4|flac|ogg|json)$/i, "");
  const rawPath = path.resolve("tmp", `${slug}.json`);
  const outPath = path.resolve("tmp", `${slug}.corrected.json`);
  if (!fs.existsSync(rawPath)) {
    console.error(`[transcript-correct] Chưa có raw transcript: ${rawPath}. Chạy make --plan-only trước.`);
    process.exit(1);
  }
  correctTranscript(rawPath, outPath, slug).catch((e: unknown) => {
    console.error("[transcript-correct] FAIL:", e);
    process.exit(1);
  });
}
