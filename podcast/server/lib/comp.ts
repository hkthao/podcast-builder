/**
 * comp.ts — Ghép & vá audio NotebookLM ("comp/patch take").
 *
 * Mục tiêu: giữ MỘT bản nền tốt nhất, chỉ thay các đoạn lỗi (đảo xưng hô /
 * nuốt chữ) bằng đoạn tương ứng đọc chuẩn từ một bản gen khác của CÙNG kịch
 * bản → xuất bản master sạch. Nhiệm vụ tối thượng: **mối nối không lủng củng**.
 *
 * 3 kỹ thuật giữ mối nối sạch:
 *   1. Chuẩn hoá loudness MỌI take về cùng target (dùng renderWav 48k của
 *      process-audio) → mức âm khớp nhau qua mối nối.
 *   2. Chỉ cắt TRONG khoảng lặng (silencedetect) — snap biên đoạn vào giữa
 *      khoảng im gần biên câu, không cắt giữa hơi thở.
 *   3. Crossfade ngắn (~70ms) tại mối nối (đang nằm trong khoảng lặng) → xoá
 *      click, chuyển mượt.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawn, execFile } from "node:child_process";
import { PATHS } from "../../../shared/studio-core/paths";
import { transcribeAudio } from "../../../shared/transcribe/transcribe";
import { processAudio } from "../../../shared/audio/process-audio";

const { INPUT_DIR, TMP_DIR } = PATHS;

/** Variant "nội bộ" của primary audio `<slug>.m4a` (không có hậu tố). */
export const PRIMARY_VARIANT = "primary";
const AUDIO_EXTS = ["m4a", "mp3", "wav"];
/** Hậu tố KHÔNG phải take (cover/bgm/thumb/preview/comp…). */
const RESERVED_VARIANTS = new Set([
  "cover",
  "bgm",
  "thumb",
  "thumbnail",
  "preview",
  "audio",
  "normalized",
]);

/** Prefix variant cho bản vá user tự gen (nhiều câu) rồi upload làm donor. */
export const UPLOAD_PREFIX = "fix";

export type Take = {
  variant: string;
  file: string;
  /** URL để UI phát trực tiếp (qua static /input). */
  url: string;
  durationMs: number;
  hasTranscript: boolean;
  /** true nếu là bản vá user upload (không phải bản NotebookLM gen gốc). */
  isUploaded: boolean;
};

export type CompSentence = {
  id: number;
  text: string;
  startMs: number;
  endMs: number;
};

export type AlignCandidate = {
  variant: string;
  text: string;
  startMs: number;
  endMs: number;
  /** 0..1 độ khớp nội dung với câu nền. */
  score: number;
};

export type AlignRow = CompSentence & { candidates: AlignCandidate[] };

/** Một patch: thay vùng [baseStartMs,baseEndMs] của bản nền bằng đoạn từ take khác. */
export type Patch = {
  baseStartMs: number;
  baseEndMs: number;
  variant: string;
  startMs: number;
  endMs: number;
};

/** Đoạn trong edit-decision-list đã phân giải. */
export type EdlSeg = { variant: string; startMs: number; endMs: number };

// ─────────────────────────── ffmpeg/ffprobe ───────────────────────────

type FfResult = { stdout: string; stderr: string };

const ffmpegRun = (args: string[], signal?: AbortSignal): Promise<FfResult> =>
  new Promise((resolve, reject) => {
    if (signal?.aborted) {
      const e = new Error("Cancelled by user");
      e.name = "AbortError";
      reject(e);
      return;
    }
    const child = spawn("ffmpeg", args, {
      stdio: ["ignore", "pipe", "pipe"],
      signal,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d: Buffer) => (stdout += d.toString("utf-8")));
    child.stderr.on("data", (d: Buffer) => (stderr += d.toString("utf-8")));
    child.on("error", reject);
    child.on("close", (code) => {
      if (signal?.aborted) {
        const e = new Error("Cancelled by user");
        e.name = "AbortError";
        reject(e);
        return;
      }
      if (code !== 0) {
        reject(new Error(`ffmpeg exit ${code}:\n${stderr}`));
        return;
      }
      resolve({ stdout, stderr });
    });
  });

const ffprobeDurationMs = (file: string): Promise<number> =>
  new Promise((resolve) => {
    execFile(
      "ffprobe",
      [
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "csv=p=0",
        file,
      ],
      (err, stdout) => {
        if (err) {
          resolve(0);
          return;
        }
        const sec = Number(String(stdout).trim());
        resolve(Number.isFinite(sec) ? Math.round(sec * 1000) : 0);
      },
    );
  });

// ─────────────────────────── take discovery ───────────────────────────

/** basename (không đuôi) của file tmp cho một take. */
export function takeBaseName(slug: string, variant: string): string {
  return variant === PRIMARY_VARIANT ? slug : `${slug}.${variant}`;
}

const findTakeFile = (slug: string, variant: string): string | null => {
  const base = takeBaseName(slug, variant);
  for (const ext of AUDIO_EXTS) {
    const p = path.join(INPUT_DIR, `${base}.${ext}`);
    if (fs.existsSync(p)) return p;
  }
  return null;
};

/** Liệt kê mọi take của một slug: `<slug>.<ext>` + `<slug>.<variant>.<ext>`. */
export async function listTakes(slug: string): Promise<Take[]> {
  if (!fs.existsSync(INPUT_DIR)) return [];
  const entries = fs.readdirSync(INPUT_DIR);
  const found = new Map<string, string>(); // variant → filename
  for (const name of entries) {
    const ext = name.split(".").pop()?.toLowerCase();
    if (!ext || !AUDIO_EXTS.includes(ext)) continue;
    const stem = name.slice(0, -(ext.length + 1)); // bỏ ".ext"
    if (stem === slug) {
      found.set(PRIMARY_VARIANT, name);
      continue;
    }
    if (stem.startsWith(`${slug}.`)) {
      const variant = stem.slice(slug.length + 1);
      // Bỏ multi-dot lạ (vd slug.cover.png đã lọc ext; slug.v2 ok) + reserved.
      if (variant.includes(".")) continue;
      if (RESERVED_VARIANTS.has(variant)) continue;
      found.set(variant, name);
    }
  }
  const takes: Take[] = [];
  for (const [variant, filename] of found) {
    const file = path.join(INPUT_DIR, filename);
    const base = takeBaseName(slug, variant);
    const rawJson = path.join(TMP_DIR, `${base}.json`);
    takes.push({
      variant,
      file,
      url: `/input/${filename}`,
      durationMs: await ffprobeDurationMs(file),
      hasTranscript: fs.existsSync(rawJson),
      isUploaded: variant.startsWith(UPLOAD_PREFIX),
    });
  }
  // primary lên đầu, còn lại theo tên.
  takes.sort((a, b) =>
    a.variant === PRIMARY_VARIANT
      ? -1
      : b.variant === PRIMARY_VARIANT
        ? 1
        : a.variant.localeCompare(b.variant),
  );
  return takes;
}

// ─────────────────────────── transcript → sentences ───────────────────────────

type WhisperSeg = { text: string; offsets: { from: number; to: number } };
type WhisperFile = { transcription: WhisperSeg[] };

const SENTENCE_END_RE = /[.!?…]\s*$/;
const MAX_SENTENCE_CHARS = 500;
/**
 * Ngắt câu thêm tại KHOẢNG NGHỈ giữa 2 token > ngưỡng này. Cần vì audio TTS/
 * NotebookLM nhiều khi cả đoạn dài chỉ 1 dấu chấm cuối → whisper gộp 3-4 vế
 * thành 1 "câu" → candidate quá to, vá lố. Ngắt theo pause cho candidate mịn
 * (phrase-level) để chọn đúng 1 vế.
 */
const PAUSE_SPLIT_MS = 300;

/** Gom token-level Whisper thành đơn vị câu/cụm — ngắt theo dấu câu HOẶC pause. */
const groupIntoSentences = (segs: WhisperSeg[]): CompSentence[] => {
  const out: CompSentence[] = [];
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
  for (const seg of segs) {
    // Pause dài trước token này → chốt cụm đang gom lại.
    if (hasContent && seg.offsets.from - bufEnd > PAUSE_SPLIT_MS) flush();
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

/** Đọc transcript của một take → danh sách câu. Ưu tiên corrected.json. */
export function loadSentences(slug: string, variant: string): CompSentence[] {
  const base = takeBaseName(slug, variant);
  const corrected = path.join(TMP_DIR, `${base}.corrected.json`);
  const raw = path.join(TMP_DIR, `${base}.json`);
  const file = fs.existsSync(corrected)
    ? corrected
    : fs.existsSync(raw)
      ? raw
      : null;
  if (!file) return [];
  try {
    const data = JSON.parse(fs.readFileSync(file, "utf-8")) as WhisperFile;
    return groupIntoSentences(data.transcription ?? []);
  } catch {
    return [];
  }
}

/**
 * Sửa chính tả 1 CÂU trong transcript của một take (bản nền) — dùng khi câu
 * nền bị whisper ghi sai chính tả. Gộp các segment whisper nằm trong
 * [startMs,endMs] của câu thành 1 segment mang text đã sửa, giữ nguyên mốc thời
 * gian câu và mọi field phụ của segment đầu. Caption dựng lại theo từng segment
 * (nội suy timing theo từ) nên gộp không đổi hành vi hiển thị.
 *
 * Ghi vào `<base>.corrected.json` (tạo từ raw nếu chưa có → raw luôn sạch).
 * Với bản nền = primary (`<slug>.corrected.json`) đây chính là transcript dùng
 * cho caption video → sau khi sửa cần re-render (regenPlan) để cập nhật caption.
 */
export function editSentence(
  slug: string,
  variant: string,
  startMs: number,
  endMs: number,
  text: string,
): CompSentence[] {
  const base = takeBaseName(slug, variant);
  const correctedPath = path.join(TMP_DIR, `${base}.corrected.json`);
  const rawPath = path.join(TMP_DIR, `${base}.json`);
  const source = fs.existsSync(correctedPath)
    ? correctedPath
    : fs.existsSync(rawPath)
      ? rawPath
      : null;
  if (!source) {
    const err = new Error(`Transcript không tồn tại cho take: ${base}`);
    (err as Error & { code: string }).code = "NOT_FOUND";
    throw err;
  }
  const data = JSON.parse(fs.readFileSync(source, "utf-8")) as WhisperFile;
  const segs = data.transcription ?? [];
  const inRange = (s: WhisperSeg) =>
    s.offsets.from >= startMs && s.offsets.to <= endMs;
  const first = segs.findIndex(inRange);
  if (first < 0) {
    const err = new Error("Không tìm thấy segment khớp câu này (mốc thời gian đã đổi?)");
    (err as Error & { code: string }).code = "VALIDATION";
    throw err;
  }
  let last = first;
  for (let i = first; i < segs.length; i++) if (inRange(segs[i])) last = i;

  const clean = text.trim();
  // Giữ object segment đầu (kèm field phụ), chỉ đổi text + mốc câu; Whisper dùng
  // leading-space (` text`) để concat trong scenes.ts.
  const survivor = segs[first] as WhisperSeg & { offsets: { from: number; to: number } };
  survivor.text = clean.length > 0 ? ` ${clean}` : "";
  survivor.offsets = { ...survivor.offsets, from: startMs, to: endMs };
  data.transcription = [...segs.slice(0, first), survivor, ...segs.slice(last + 1)];

  fs.writeFileSync(correctedPath, JSON.stringify(data, null, 2));
  return loadSentences(slug, variant);
}

/** Transcribe một take (nếu chưa có / audio mới hơn). Trả số câu. */
export async function transcribeTake(
  slug: string,
  variant: string,
  signal?: AbortSignal,
): Promise<number> {
  const file = findTakeFile(slug, variant);
  if (!file) throw new Error(`Không tìm thấy take: ${slug}/${variant}`);
  const base = takeBaseName(slug, variant);
  const jsonPath = path.join(TMP_DIR, `${base}.json`);
  await transcribeAudio(file, jsonPath, { signal });
  return loadSentences(slug, variant).length;
}

// ─────────────────────────── text alignment ───────────────────────────

/** Bỏ dấu tiếng Việt + hạ thường + tách token. */
const tokenize = (s: string): string[] =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

/** Sørensen–Dice trên bigram từ (ổn với câu bị paraphrase nhẹ). */
const diceScore = (a: string[], b: string[]): number => {
  if (a.length === 0 || b.length === 0) return 0;
  const bigrams = (t: string[]): Map<string, number> => {
    const m = new Map<string, number>();
    if (t.length === 1) {
      m.set(t[0], 1);
      return m;
    }
    for (let i = 0; i < t.length - 1; i++) {
      const g = `${t[i]} ${t[i + 1]}`;
      m.set(g, (m.get(g) ?? 0) + 1);
    }
    return m;
  };
  const ma = bigrams(a);
  const mb = bigrams(b);
  let inter = 0;
  for (const [g, ca] of ma) {
    const cb = mb.get(g);
    if (cb) inter += Math.min(ca, cb);
  }
  const sa = [...ma.values()].reduce((x, y) => x + y, 0);
  const sb = [...mb.values()].reduce((x, y) => x + y, 0);
  return (2 * inter) / (sa + sb);
};

/** Jaccard trên tập unigram — bắt trùng từ khoá dù cấu trúc câu khác. */
const jaccard = (a: string[], b: string[]): number => {
  if (a.length === 0 || b.length === 0) return 0;
  const sa = new Set(a);
  const sb = new Set(b);
  let inter = 0;
  for (const w of sa) if (sb.has(w)) inter++;
  return inter / (sa.size + sb.size - inter);
};

/**
 * Điểm khớp tổng hợp: 0.6·Dice(bigram) + 0.4·Jaccard(unigram). Dice giữ thứ
 * tự từ (câu đọc nguyên văn khớp cao), Jaccard cứu các câu paraphrase / đồng
 * nghĩa gần (vd "lòng tự trọng" vs "lòng tự tôn").
 */
const simScore = (a: string[], b: string[]): number =>
  0.6 * diceScore(a, b) + 0.4 * jaccard(a, b);

/**
 * Với mỗi câu nền, tìm câu khớp nhất ở từng take ứng viên. Có xét gộp 2 câu
 * ứng viên liền kề (do whisper tách câu khác nhau giữa các bản gen).
 */
export function alignToBase(
  baseSents: CompSentence[],
  candidates: { variant: string; sents: CompSentence[] }[],
): AlignRow[] {
  const baseTok = baseSents.map((s) => tokenize(s.text));
  return baseSents.map((bs, i) => {
    const row: AlignRow = { ...bs, candidates: [] };
    const WINDOW = 4; // thử gộp tối đa 4 cụm liền kề để dựng lại đúng 1 câu nền
    for (const cand of candidates) {
      let best: AlignCandidate | null = null;
      for (let j = 0; j < cand.sents.length; j++) {
        let combo = "";
        const startMs = cand.sents[j].startMs;
        for (let w = 0; w < WINDOW && j + w < cand.sents.length; w++) {
          const cw = cand.sents[j + w];
          combo = w === 0 ? cw.text : `${combo} ${cw.text}`;
          const sc = simScore(baseTok[i], tokenize(combo));
          if (!best || sc > best.score) {
            best = {
              variant: cand.variant,
              text: combo,
              startMs,
              endMs: cw.endMs,
              score: sc,
            };
          }
        }
      }
      if (best) row.candidates.push(best);
    }
    row.candidates.sort((a, b) => b.score - a.score);
    return row;
  });
}

// ─────────────────────────── silence snap + build ───────────────────────────

type Silence = { start: number; end: number }; // ms

/** Đảm bảo có renderWav 48k (đã loudnorm cùng target) cho một take. */
async function ensureRenderWav(
  slug: string,
  variant: string,
  signal?: AbortSignal,
): Promise<string> {
  const file = findTakeFile(slug, variant);
  if (!file) throw new Error(`Không tìm thấy take: ${slug}/${variant}`);
  const { renderWav } = await processAudio(file, { signal });
  return renderWav;
}

/** silencedetect → danh sách khoảng lặng (ms). */
async function detectSilence(
  wavPath: string,
  signal?: AbortSignal,
): Promise<Silence[]> {
  const { stderr } = await ffmpegRun(
    [
      "-hide_banner",
      "-nostats",
      "-i",
      wavPath,
      "-af",
      "silencedetect=n=-30dB:d=0.18",
      "-f",
      "null",
      "-",
    ],
    signal,
  );
  const sil: Silence[] = [];
  let curStart: number | null = null;
  for (const line of stderr.split("\n")) {
    const ms = line.match(/silence_start:\s*([0-9.]+)/);
    if (ms) {
      curStart = Math.round(parseFloat(ms[1]) * 1000);
      continue;
    }
    const me = line.match(/silence_end:\s*([0-9.]+)/);
    if (me && curStart !== null) {
      sil.push({ start: curStart, end: Math.round(parseFloat(me[1]) * 1000) });
      curStart = null;
    }
  }
  return sil;
}

const SNAP_WINDOW_MS = 600;

/** Snap biên START: về giữa khoảng lặng KẾT THÚC quanh t (im ngay trước câu). */
const snapStart = (t: number, sil: Silence[]): number => {
  let best: number | null = null;
  let bestDist = Infinity;
  for (const s of sil) {
    if (t >= s.start - SNAP_WINDOW_MS && t <= s.end + SNAP_WINDOW_MS) {
      const d = Math.abs(s.end - t);
      if (d < bestDist) {
        bestDist = d;
        best = Math.round((s.start + s.end) / 2);
      }
    }
  }
  return best ?? Math.max(0, t);
};

/** Snap biên END: về giữa khoảng lặng BẮT ĐẦU quanh t (im ngay sau câu). */
const snapEnd = (t: number, sil: Silence[]): number => {
  let best: number | null = null;
  let bestDist = Infinity;
  for (const s of sil) {
    if (t >= s.start - SNAP_WINDOW_MS && t <= s.end + SNAP_WINDOW_MS) {
      const d = Math.abs(s.start - t);
      if (d < bestDist) {
        bestDist = d;
        best = Math.round((s.start + s.end) / 2);
      }
    }
  }
  return best ?? t;
};

/** Phân giải danh sách patch (trên timeline bản nền) → EDL đầy đủ. */
export function patchesToEdl(
  base: string,
  baseDurationMs: number,
  patches: Patch[],
): EdlSeg[] {
  const sorted = [...patches].sort((a, b) => a.baseStartMs - b.baseStartMs);
  const edl: EdlSeg[] = [];
  let cursor = 0;
  for (const p of sorted) {
    if (p.baseStartMs < cursor)
      throw new Error("Các patch bị chồng lấn nhau trên bản nền");
    if (p.baseStartMs > cursor)
      edl.push({ variant: base, startMs: cursor, endMs: p.baseStartMs });
    edl.push({ variant: p.variant, startMs: p.startMs, endMs: p.endMs });
    cursor = p.baseEndMs;
  }
  if (cursor < baseDurationMs)
    edl.push({ variant: base, startMs: cursor, endMs: baseDurationMs });
  return edl;
}

const CROSSFADE_MS = 70;

/**
 * Ghép EDL → `input/<slug>.comp.m4a`. Trả {file, durationMs}.
 * Snap mọi biên vào khoảng lặng của chính take đó + crossfade ngắn tại mối nối.
 */
export async function buildComp(
  slug: string,
  edl: EdlSeg[],
  signal?: AbortSignal,
): Promise<{ file: string; durationMs: number }> {
  if (edl.length === 0) throw new Error("EDL rỗng");

  // 1. Chuẩn hoá loudness + detect silence từng take liên quan (cache theo variant).
  const variants = [...new Set(edl.map((e) => e.variant))];
  const wavByVariant = new Map<string, string>();
  const silByVariant = new Map<string, Silence[]>();
  for (const v of variants) {
    const wav = await ensureRenderWav(slug, v, signal);
    wavByVariant.set(v, wav);
    silByVariant.set(v, await detectSilence(wav, signal));
  }

  // 2. Snap biên từng đoạn vào khoảng lặng của take đó.
  const snapped = edl.map((seg) => {
    const sil = silByVariant.get(seg.variant)!;
    const start = snapStart(seg.startMs, sil);
    const end = snapEnd(seg.endMs, sil);
    return { ...seg, startMs: Math.min(start, end), endMs: Math.max(start, end) };
  });

  // 3. Dựng filter_complex: trim từng đoạn (atrim + asetpts) rồi nối bằng
  //    acrossfade (đang trong khoảng lặng nên crossfade vô hình, chống click).
  const inputs: string[] = [];
  for (const v of variants) {
    inputs.push("-i", wavByVariant.get(v)!);
  }
  const variantIdx = new Map(variants.map((v, i) => [v, i]));
  const parts: string[] = [];
  const labels: string[] = [];
  snapped.forEach((seg, k) => {
    const idx = variantIdx.get(seg.variant)!;
    const from = (seg.startMs / 1000).toFixed(3);
    const to = (seg.endMs / 1000).toFixed(3);
    const lbl = `s${k}`;
    parts.push(
      `[${idx}:a]atrim=start=${from}:end=${to},asetpts=N/SR/TB[${lbl}]`,
    );
    labels.push(lbl);
  });

  const cf = (CROSSFADE_MS / 1000).toFixed(3);
  let chain = labels[0];
  for (let k = 1; k < labels.length; k++) {
    const out = k === labels.length - 1 ? "mix" : `m${k}`;
    parts.push(
      `[${chain}][${labels[k]}]acrossfade=d=${cf}:c1=tri:c2=tri[${out}]`,
    );
    chain = out;
  }
  const finalLabel = labels.length === 1 ? labels[0] : "mix";

  const outFile = path.join(INPUT_DIR, `${slug}.comp.m4a`);
  await ffmpegRun(
    [
      "-y",
      "-hide_banner",
      "-loglevel",
      "warning",
      ...inputs,
      "-filter_complex",
      parts.join(";"),
      "-map",
      `[${finalLabel}]`,
      "-c:a",
      "aac",
      "-b:a",
      "192k",
      outFile,
    ],
    signal,
  );

  return { file: outFile, durationMs: await ffprobeDurationMs(outFile) };
}

/** Vá bản nền bằng danh sách patch → comp audio. */
export async function compFromPatches(
  slug: string,
  base: string,
  patches: Patch[],
  signal?: AbortSignal,
): Promise<{ file: string; durationMs: number; edl: EdlSeg[] }> {
  const baseFile = findTakeFile(slug, base);
  if (!baseFile) throw new Error(`Không tìm thấy bản nền: ${slug}/${base}`);
  const baseDur = await ffprobeDurationMs(baseFile);
  const edl = patchesToEdl(base, baseDur, patches);
  const res = await buildComp(slug, edl, signal);
  return { ...res, edl };
}

/**
 * Lưu bản vá user tự gen (một audio gồm nhiều câu đã sửa, bất kỳ định dạng) →
 * transcode m4a, đặt tên `input/<slug>.<UPLOAD_PREFIX><id>.m4a` để thành một
 * "take" donor. Sau đó transcribe (như take thường) rồi vá theo luồng align.
 * Trả {variant, url, durationMs}.
 */
export async function saveUpload(
  slug: string,
  buffer: Uint8Array,
  originalName: string,
): Promise<{ variant: string; url: string; durationMs: number }> {
  if (!fs.existsSync(INPUT_DIR)) fs.mkdirSync(INPUT_DIR, { recursive: true });
  if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });
  const variant = `${UPLOAD_PREFIX}${crypto.randomBytes(3).toString("hex")}`;
  const ext = (originalName.split(".").pop() ?? "m4a").toLowerCase();
  const tmpIn = path.join(TMP_DIR, `${slug}.${variant}.upload.${ext}`);
  fs.writeFileSync(tmpIn, buffer);
  const outFile = path.join(INPUT_DIR, `${slug}.${variant}.m4a`);
  try {
    // Transcode về m4a/aac chuẩn (đồng nhất container; loudnorm để sau ở buildComp).
    await ffmpegRun([
      "-y",
      "-hide_banner",
      "-loglevel",
      "error",
      "-i",
      tmpIn,
      "-ac",
      "2",
      "-c:a",
      "aac",
      "-b:a",
      "192k",
      outFile,
    ]);
  } finally {
    if (fs.existsSync(tmpIn)) fs.rmSync(tmpIn);
  }
  return {
    variant,
    url: `/input/${slug}.${variant}.m4a`,
    durationMs: await ffprobeDurationMs(outFile),
  };
}

/** Xoá một bản vá đã upload (chỉ cho phép variant bắt đầu bằng UPLOAD_PREFIX). */
export function deleteUpload(slug: string, variant: string): void {
  if (!variant.startsWith(UPLOAD_PREFIX))
    throw new Error("Chỉ xoá được bản vá đã upload (fix…)");
  const file = findTakeFile(slug, variant);
  if (file && fs.existsSync(file)) fs.rmSync(file);
  const base = takeBaseName(slug, variant);
  for (const suffix of [".json", ".corrected.json", ".16k.wav", ".normalized.16k.wav", ".normalized.48k.wav"]) {
    const p = path.join(TMP_DIR, `${base}${suffix}`);
    if (fs.existsSync(p)) fs.rmSync(p);
  }
}

/**
 * Promote comp → primary: copy `input/<slug>.comp.m4a` → `input/<slug>.m4a`
 * và xoá cache tmp để render lấy bản mới. Trả path primary.
 */
export function promoteComp(slug: string): string {
  const comp = path.join(INPUT_DIR, `${slug}.comp.m4a`);
  if (!fs.existsSync(comp)) throw new Error("Chưa có bản ghép để promote");
  // Xoá primary cũ mọi ext để tránh 2 file audio.
  for (const ext of AUDIO_EXTS) {
    const p = path.join(INPUT_DIR, `${slug}.${ext}`);
    if (p.endsWith(".m4a")) continue;
    if (fs.existsSync(p)) fs.rmSync(p);
  }
  const primary = path.join(INPUT_DIR, `${slug}.m4a`);
  fs.copyFileSync(comp, primary);
  // Set mtime mới nhất để cache tmp (theo mtime) bị coi là stale.
  const now = new Date();
  fs.utimesSync(primary, now, now);
  for (const suffix of [
    ".json",
    ".corrected.json",
    ".plan.json",
    ".normalized.16k.wav",
    ".normalized.48k.wav",
    ".16k.wav",
    ".sentences.json",
    ".sentences.corrected.json",
  ]) {
    const p = path.join(TMP_DIR, `${slug}${suffix}`);
    if (fs.existsSync(p)) fs.rmSync(p);
  }
  return primary;
}
