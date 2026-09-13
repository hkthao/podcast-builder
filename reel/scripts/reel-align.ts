/**
 * reel-align.ts — gộp nhiều file audio TTS → master, transcribe bằng whisper,
 * rồi FORCED-ALIGN text CHUẨN trong script.md vào mốc thời gian THẬT của whisper.
 *
 * Vì sao không dùng thẳng text whisper: whisper tiếng Việt hay sai chính tả, mà ta
 * đã có bản script hoàn hảo. Ở đây chỉ MƯỢN timing của whisper, giữ nguyên chữ script.
 * Cách neo: LCS giữa (chữ whisper đã bỏ dấu) và (chữ script đã bỏ dấu) → các từ khớp
 * làm mốc thời gian thật; các từ còn lại nội suy tuyến tính giữa 2 mốc.
 *
 * Input:  reel/episodes/<slug>/audio_01.wav, audio_02.wav …  (hoặc audio.wav đơn)
 *         reel/episodes/<slug>/script.md   (khối "Speech block")
 * Output: reel/episodes/<slug>/work/<slug>.master.wav   (concat thô, master timeline)
 *         reel/episodes/<slug>/work/<slug>.final.wav     (48k stereo, loudnorm — cho ráp)
 *         reel/episodes/<slug>/work/caption.srt          (phụ đề cháy chữ, chữ CHUẨN)
 *         reel/episodes/<slug>/work/beats.json           (câu + start/end thật)
 *
 * Usage: npx tsx reel/scripts/reel-align.ts <slug>
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { processAudio } from "../../shared/audio/process-audio";
import { transcribeAudio, type Transcript } from "../../shared/transcribe/transcribe";

// ---------- tiện ích ----------

const ensureDir = (p: string) => {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
};

/** Bỏ dấu tiếng Việt + hạ chữ thường + chỉ giữ [a-z0-9] để so khớp thô. */
const normWord = (s: string): string =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // dấu thanh + dấu mũ (combining marks)
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

const ffprobeDurationMs = (file: string): number => {
  const out = execFileSync(
    "ffprobe",
    [
      "-v", "error",
      "-show_entries", "format=duration",
      "-of", "default=nw=1:nk=1",
      file,
    ],
    { encoding: "utf-8" },
  ).trim();
  const sec = Number.parseFloat(out);
  if (!Number.isFinite(sec)) throw new Error(`ffprobe không đọc được duration: ${file}`);
  return Math.round(sec * 1000);
};

const msToSrt = (ms: number): string => {
  const clamped = Math.max(0, Math.round(ms));
  const h = Math.floor(clamped / 3_600_000);
  const m = Math.floor((clamped % 3_600_000) / 60_000);
  const s = Math.floor((clamped % 60_000) / 1000);
  const mm = clamped % 1000;
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(mm, 3)}`;
};

// ---------- 1. Tìm + gộp các part audio ----------

const AUDIO_EXTS = ["wav", "mp3", "m4a", "aac", "flac", "ogg"];

/** Trả về danh sách part audio đã sort. Ưu tiên audio_01.* audio_02.*, fallback audio.* đơn. */
const findAudioParts = (epDir: string): string[] => {
  const files = fs.readdirSync(epDir);
  const parts = files
    .filter((f) => /^audio_\d+\.(wav|mp3|m4a|aac|flac|ogg)$/i.test(f))
    .sort((a, b) => {
      const na = Number(a.match(/audio_(\d+)/i)![1]);
      const nb = Number(b.match(/audio_(\d+)/i)![1]);
      return na - nb;
    });
  if (parts.length > 0) return parts.map((f) => path.join(epDir, f));

  for (const ext of AUDIO_EXTS) {
    const single = path.join(epDir, `audio.${ext}`);
    if (fs.existsSync(single)) return [single];
  }
  return [];
};

/** Gộp các part thành 1 master.wav (48k stereo). 1 part → chỉ chuẩn hoá; nhiều part → concat filter (re-encode, an toàn khác sample-rate). */
const concatToMaster = (parts: string[], out: string): void => {
  ensureDir(path.dirname(out));
  if (parts.length === 1) {
    execFileSync(
      "ffmpeg",
      ["-y", "-hide_banner", "-loglevel", "warning",
       "-i", parts[0], "-ac", "2", "-ar", "48000", out],
      { stdio: ["ignore", "ignore", "inherit"] },
    );
    return;
  }
  const inputs = parts.flatMap((p) => ["-i", p]);
  const filter =
    parts.map((_, i) => `[${i}:a]`).join("") +
    `concat=n=${parts.length}:v=0:a=1[out]`;
  execFileSync(
    "ffmpeg",
    ["-y", "-hide_banner", "-loglevel", "warning",
     ...inputs,
     "-filter_complex", filter,
     "-map", "[out]", "-ac", "2", "-ar", "48000", out],
    { stdio: ["ignore", "ignore", "inherit"] },
  );
};

// ---------- 2. Đọc text chuẩn từ script.md ----------

/** Lấy khối lời đọc: các dòng `> ...` NGAY SAU marker "Speech block", tới khi gặp `---`/`## `. */
const readNarration = (scriptPath: string): string => {
  const raw = fs.readFileSync(scriptPath, "utf-8");
  const lines = raw.split(/\r?\n/);
  const startIdx = lines.findIndex((l) => /speech block/i.test(l));
  if (startIdx === -1) {
    throw new Error(
      `Không thấy marker "Speech block" trong ${scriptPath}. ` +
      `Đặt lời đọc trong các dòng bắt đầu bằng "> " ngay sau dòng có chữ "Speech block".`,
    );
  }
  const collected: string[] = [];
  for (let i = startIdx + 1; i < lines.length; i++) {
    const l = lines[i];
    if (/^\s*---\s*$/.test(l) || /^\s*#{1,6}\s/.test(l)) break;
    if (/^\s*>/.test(l)) {
      const text = l.replace(/^\s*>\s?/, "").trim();
      collected.push(text); // giữ cả dòng rỗng để làm ranh giới đoạn
    }
  }
  const body = collected.join("\n").trim();
  if (!body) throw new Error(`Khối "Speech block" rỗng trong ${scriptPath}`);
  return body;
};

type ScriptWord = { raw: string; norm: string; sentence: number };

/** Tách narration → câu (beat) → từ. Câu ngắt theo . ! ? … và xuống dòng đoạn. */
const parseScriptWords = (narration: string): { words: ScriptWord[]; sentences: string[] } => {
  // Chuẩn hoá xuống dòng: dòng rỗng = ngắt đoạn = ngắt câu chắc chắn.
  const paragraphs = narration.split(/\n\s*\n/).map((p) => p.replace(/\s+/g, " ").trim()).filter(Boolean);
  const sentences: string[] = [];
  for (const para of paragraphs) {
    // tách câu, GIỮ dấu kết thúc
    const parts = para.match(/[^.!?…]+[.!?…]*/g) ?? [para];
    for (const s of parts) {
      const t = s.trim();
      if (t) sentences.push(t);
    }
  }
  const words: ScriptWord[] = [];
  sentences.forEach((sentence, si) => {
    for (const tok of sentence.split(/\s+/)) {
      const norm = normWord(tok);
      if (!norm) continue; // token toàn dấu câu → không phải "từ" để căn, nhưng vẫn nằm trong sentence text
      words.push({ raw: tok, norm, sentence: si });
    }
  });
  return { words, sentences };
};

// ---------- 3. Lấy từ + timing từ whisper ----------

type TimedWord = { norm: string; startMs: number; endMs: number };

const whisperWords = (t: Transcript): TimedWord[] => {
  const out: TimedWord[] = [];
  for (const seg of t.transcription) {
    for (const tok of seg.tokens ?? []) {
      const norm = normWord(tok.text);
      if (!norm) continue; // token đặc biệt [_BEG_], dấu câu, khoảng trắng
      out.push({ norm, startMs: tok.offsets.from, endMs: tok.offsets.to });
    }
    // fallback nếu segment không có token
    if (!(seg.tokens?.length) && normWord(seg.text)) {
      out.push({ norm: normWord(seg.text), startMs: seg.offsets.from, endMs: seg.offsets.to });
    }
  }
  return out;
};

// ---------- 4. Forced-align: LCS neo + nội suy ----------

type AlignedWord = ScriptWord & { startMs: number; endMs: number };

/** LCS giữa 2 chuỗi norm → cặp anchor (chỉ số W, chỉ số S) tăng dần. */
const lcsAnchors = (W: TimedWord[], S: ScriptWord[]): Array<[number, number]> => {
  const n = W.length;
  const m = S.length;
  // DP dùng Uint32 để nhẹ RAM (n,m ~ vài trăm–ngàn).
  const dp = new Uint32Array((n + 1) * (m + 1));
  const idx = (i: number, j: number) => i * (m + 1) + j;
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      if (W[i].norm === S[j].norm) {
        dp[idx(i, j)] = dp[idx(i + 1, j + 1)] + 1;
      } else {
        const down = dp[idx(i + 1, j)];
        const right = dp[idx(i, j + 1)];
        dp[idx(i, j)] = down >= right ? down : right;
      }
    }
  }
  const anchors: Array<[number, number]> = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (W[i].norm === S[j].norm) {
      anchors.push([i, j]);
      i++; j++;
    } else if (dp[idx(i + 1, j)] >= dp[idx(i, j + 1)]) {
      i++;
    } else {
      j++;
    }
  }
  return anchors;
};

/** Gán start/end cho MỌI từ script: anchor lấy time thật, còn lại nội suy giữa 2 anchor. */
const alignWords = (
  W: TimedWord[],
  S: ScriptWord[],
  durationMs: number,
): AlignedWord[] => {
  const aligned: AlignedWord[] = S.map((w) => ({ ...w, startMs: -1, endMs: -1 }));
  const anchors = lcsAnchors(W, S);

  // đặt time cho anchor
  for (const [wi, sj] of anchors) {
    aligned[sj].startMs = W[wi].startMs;
    aligned[sj].endMs = W[wi].endMs;
  }

  // nội suy các đoạn chưa gán, kẹp giữa 2 anchor (hoặc biên 0 / duration)
  let k = 0;
  while (k < aligned.length) {
    if (aligned[k].startMs !== -1) { k++; continue; }
    // đoạn [k, end) chưa gán
    let end = k;
    while (end < aligned.length && aligned[end].startMs === -1) end++;
    const prevEnd = k > 0 ? aligned[k - 1].endMs : 0;
    const nextStart = end < aligned.length ? aligned[end].startMs : durationMs;
    const span = Math.max(0, nextStart - prevEnd);
    const count = end - k;
    const step = count > 0 ? span / count : 0;
    for (let g = 0; g < count; g++) {
      aligned[k + g].startMs = prevEnd + step * g;
      aligned[k + g].endMs = prevEnd + step * (g + 1);
    }
    k = end;
  }

  // đơn điệu hoá: đảm bảo không lùi thời gian (whisper token đôi lúc chồng lấn)
  let last = 0;
  for (const w of aligned) {
    if (w.startMs < last) w.startMs = last;
    if (w.endMs < w.startMs) w.endMs = w.startMs;
    last = w.endMs;
  }
  return aligned;
};

// ---------- 5. Xuất beats.json + caption.srt ----------

type Beat = {
  index: number;
  text: string;
  startMs: number;
  endMs: number;
  words: Array<{ text: string; startMs: number; endMs: number }>;
};

const buildBeats = (aligned: AlignedWord[], sentences: string[]): Beat[] => {
  const beats: Beat[] = sentences.map((text, index) => ({
    index, text, startMs: -1, endMs: -1, words: [],
  }));
  for (const w of aligned) {
    const b = beats[w.sentence];
    b.words.push({ text: w.raw, startMs: w.startMs, endMs: w.endMs });
  }
  for (const b of beats) {
    if (b.words.length) {
      b.startMs = b.words[0].startMs;
      b.endMs = b.words[b.words.length - 1].endMs;
    }
  }
  // câu không có từ căn (toàn dấu?) → nối liền câu trước
  return beats.map((b, i) => {
    if (b.startMs === -1) {
      const prev = beats[i - 1];
      b.startMs = prev ? prev.endMs : 0;
      b.endMs = b.startMs;
    }
    return b;
  });
};

const MAX_CUE_WORDS = 7;
const MAX_CUE_CHARS = 42;

/** Chia mỗi câu thành cue caption ngắn (≤7 từ / ≤42 ký tự), lấy time từ từ. */
const buildSrt = (beats: Beat[]): string => {
  type Cue = { text: string; startMs: number; endMs: number };
  const cues: Cue[] = [];
  for (const b of beats) {
    if (!b.words.length) continue;
    let chunk: typeof b.words = [];
    const flush = () => {
      if (!chunk.length) return;
      cues.push({
        text: chunk.map((w) => w.text).join(" "),
        startMs: chunk[0].startMs,
        endMs: chunk[chunk.length - 1].endMs,
      });
      chunk = [];
    };
    for (const w of b.words) {
      const tentative = [...chunk, w].map((x) => x.text).join(" ");
      if (chunk.length >= MAX_CUE_WORDS || tentative.length > MAX_CUE_CHARS) flush();
      chunk.push(w);
    }
    flush();
  }
  return cues
    .map((c, i) =>
      `${i + 1}\n${msToSrt(c.startMs)} --> ${msToSrt(Math.max(c.endMs, c.startMs + 200))}\n${c.text}\n`,
    )
    .join("\n");
};

// ---------- main ----------

async function main() {
  const slug = process.argv[2];
  if (!slug) {
    console.error("Usage: npx tsx reel/scripts/reel-align.ts <slug>");
    process.exit(1);
  }
  const epDir = path.resolve("reel/episodes", slug);
  if (!fs.existsSync(epDir)) throw new Error(`Không thấy thư mục tập: ${epDir}`);
  const scriptPath = path.join(epDir, "script.md");
  if (!fs.existsSync(scriptPath)) throw new Error(`Không thấy script.md: ${scriptPath}`);

  const workDir = path.join(epDir, "work");
  ensureDir(workDir);

  // 1. gộp audio
  const parts = findAudioParts(epDir);
  if (!parts.length) {
    throw new Error(
      `Không thấy file audio trong ${epDir}. Cần audio_01.wav, audio_02.wav… (hoặc audio.wav).`,
    );
  }
  console.log(`[reel-align] ${parts.length} part audio:`);
  parts.forEach((p) => console.log(`  - ${path.basename(p)}`));
  const master = path.join(workDir, `${slug}.master.wav`);
  concatToMaster(parts, master);
  console.log(`[reel-align] ✓ master (concat): ${master}`);

  // 2. chuẩn hoá loudness → whisperWav (16k, để transcribe) + renderWav (48k loudnorm, để ráp)
  const { whisperWav, renderWav } = await processAudio(master);
  const finalWav = path.join(workDir, `${slug}.final.wav`);
  fs.copyFileSync(renderWav, finalWav);
  console.log(`[reel-align] ✓ final (loudnorm 48k): ${finalWav}`);

  const durationMs = ffprobeDurationMs(renderWav);

  // 3. transcribe (whisper) — mốc thời gian THẬT
  const transcriptJson = path.join(workDir, `${slug}.whisper.json`);
  const transcript = await transcribeAudio(whisperWav, transcriptJson);
  const W = whisperWords(transcript);
  console.log(`[reel-align] whisper: ${W.length} từ có timing`);

  // 4. đọc text chuẩn + forced-align
  const narration = readNarration(scriptPath);
  const { words: S, sentences } = parseScriptWords(narration);
  console.log(`[reel-align] script: ${S.length} từ / ${sentences.length} câu`);

  const aligned = alignWords(W, S, durationMs);
  const matched = lcsAnchors(W, S).length;
  const pct = S.length ? Math.round((matched / S.length) * 100) : 0;
  console.log(`[reel-align] neo được ${matched}/${S.length} từ (${pct}%) — còn lại nội suy`);
  if (pct < 60) {
    console.warn(
      `[reel-align] ⚠️ tỉ lệ neo thấp (${pct}%). Kiểm tra: script.md có khớp audio đã gen không? ` +
      `Timing caption có thể lệch ở các đoạn không neo được.`,
    );
  }

  // 5. xuất
  const beats = buildBeats(aligned, sentences);
  const beatsPath = path.join(workDir, "beats.json");
  fs.writeFileSync(
    beatsPath,
    JSON.stringify(
      {
        slug,
        durationMs,
        audio: path.relative(epDir, finalWav),
        alignedPct: pct,
        beats,
      },
      null,
      2,
    ),
  );
  console.log(`[reel-align] ✓ beats.json: ${beatsPath} (${beats.length} beat)`);

  const srtPath = path.join(workDir, "caption.srt");
  fs.writeFileSync(srtPath, buildSrt(beats));
  console.log(`[reel-align] ✓ caption.srt: ${srtPath}`);

  console.log(
    `[reel-align] xong. Tổng: ${(durationMs / 1000).toFixed(1)}s. ` +
    `Bước tiếp: tải footage theo shot-list → reel-assemble.ts`,
  );
}

main().catch((e: unknown) => {
  console.error("[reel-align] FAIL:", e);
  process.exit(1);
});
