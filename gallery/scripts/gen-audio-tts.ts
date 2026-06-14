#!/usr/bin/env tsx
/**
 * Phase 27 — TTS audio gen từ script tiếng Việt.
 *
 * Input:
 *   input/<name>.script.txt   — plain UTF-8, paragraphs cách bằng dòng trắng
 *
 * Output:
 *   input/<name>.m4a                       — audio voiceover
 *   tmp/<name>.tts-meta.json               — metadata + paragraph timings (rough)
 *
 * Provider: OpenAI TTS (model `tts-1-hd`, voice `nova` mặc định).
 * Cost: ~$15/1M chars input. 30-phút video ~ 30k chars ~ $0.45/lần gen.
 *
 * Cache: hash script + voice + model. Re-run với cùng input → skip API call.
 *
 * Usage:
 *   tsx gallery/scripts/gen-audio-tts.ts <name>
 *   tsx gallery/scripts/gen-audio-tts.ts <name> --voice=shimmer --model=tts-1-hd
 *   tsx gallery/scripts/gen-audio-tts.ts <name> --force  (skip cache)
 */
import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import OpenAI from "openai";

const ROOT = process.cwd();
const INPUT_DIR = path.join(ROOT, "input");
const TMP_DIR = path.join(ROOT, "tmp");

/**
 * OpenAI TTS voices — chọn `nova` mặc định (mềm, đọc VN tự nhiên nhất qua test).
 * `shimmer` cũng OK cho narration. `onyx` nam giọng trầm.
 */
const VALID_VOICES = [
  "alloy",
  "echo",
  "fable",
  "onyx",
  "nova",
  "shimmer",
] as const;
type Voice = (typeof VALID_VOICES)[number];

const VALID_MODELS = ["tts-1", "tts-1-hd"] as const;
type Model = (typeof VALID_MODELS)[number];

const DEFAULT_VOICE: Voice = "nova";
const DEFAULT_MODEL: Model = "tts-1-hd";

/** OpenAI TTS chunk limit: 4096 chars/request. */
const CHUNK_LIMIT = 4000;

type TtsMeta = {
  name: string;
  generatedAt: string;
  voice: Voice;
  model: Model;
  scriptHash: string;
  totalChars: number;
  totalChunks: number;
  paragraphs: Array<{
    index: number;
    text: string;
    chars: number;
    /** Khoảng thời gian ước lượng (ms). Auto-tính bằng tỉ lệ chars. */
    estimatedStartMs: number;
    estimatedEndMs: number;
  }>;
};

/**
 * Chia script thành chunks ≤ CHUNK_LIMIT chars, cố gắng cắt theo paragraph
 * (giữ ngữ nghĩa). Nếu paragraph quá dài thì split theo câu.
 */
function chunkScript(script: string): string[] {
  const paragraphs = script
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter(Boolean);

  const chunks: string[] = [];
  let current = "";
  for (const p of paragraphs) {
    if (p.length > CHUNK_LIMIT) {
      // Paragraph quá dài → split theo câu
      if (current) {
        chunks.push(current);
        current = "";
      }
      const sentences = p.split(/(?<=[.!?])\s+/);
      let buf = "";
      for (const s of sentences) {
        if ((buf + " " + s).length > CHUNK_LIMIT && buf.length > 0) {
          chunks.push(buf.trim());
          buf = s;
        } else {
          buf = buf ? `${buf} ${s}` : s;
        }
      }
      if (buf) chunks.push(buf.trim());
      continue;
    }
    if ((current + "\n\n" + p).length > CHUNK_LIMIT && current.length > 0) {
      chunks.push(current);
      current = p;
    } else {
      current = current ? `${current}\n\n${p}` : p;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

function parseFlags(argv: string[]): {
  name: string | null;
  voice: Voice;
  model: Model;
  force: boolean;
} {
  let name: string | null = null;
  let voice: Voice = DEFAULT_VOICE;
  let model: Model = DEFAULT_MODEL;
  let force = false;
  for (const arg of argv.slice(2)) {
    if (arg.startsWith("--voice=")) {
      const v = arg.slice(8);
      if ((VALID_VOICES as readonly string[]).includes(v)) voice = v as Voice;
      else
        throw new Error(
          `Invalid voice ${v}. Allowed: ${VALID_VOICES.join(", ")}`,
        );
    } else if (arg.startsWith("--model=")) {
      const m = arg.slice(8);
      if ((VALID_MODELS as readonly string[]).includes(m)) model = m as Model;
      else throw new Error(`Invalid model ${m}. Allowed: ${VALID_MODELS.join(", ")}`);
    } else if (arg === "--force") {
      force = true;
    } else if (!arg.startsWith("--") && name === null) {
      name = arg.replace(/\.script\.txt$/, "").replace(/^.*\//, "");
    }
  }
  return { name, voice, model, force };
}

function hashScript(script: string, voice: Voice, model: Model): string {
  return crypto
    .createHash("sha256")
    .update(`${voice}|${model}|${script}`)
    .digest("hex");
}

/**
 * Ước tính timing per paragraph dựa trên tỉ lệ chars / tổng chars × tổng duration.
 * Không chính xác bằng whisper align nhưng đủ tốt cho asset-timing draft.
 *
 * `totalAudioMs` = ước lượng ban đầu. Sau khi ffprobe audio, caller có thể
 * re-compute với duration thật.
 */
function estimateParagraphTimings(
  paragraphs: string[],
  totalAudioMs: number,
): Array<{ startMs: number; endMs: number }> {
  const totalChars = paragraphs.reduce((sum, p) => sum + p.length, 0);
  if (totalChars === 0) return paragraphs.map(() => ({ startMs: 0, endMs: 0 }));
  const timings: Array<{ startMs: number; endMs: number }> = [];
  let cursor = 0;
  for (const p of paragraphs) {
    const fraction = p.length / totalChars;
    const dur = Math.round(totalAudioMs * fraction);
    timings.push({ startMs: cursor, endMs: cursor + dur });
    cursor += dur;
  }
  return timings;
}

async function main(): Promise<void> {
  const flags = parseFlags(process.argv);
  if (!flags.name) {
    console.error("Usage: tsx gallery/scripts/gen-audio-tts.ts <name> [flags]");
    console.error("  Flags:");
    console.error(
      `    --voice=<voice>   one of: ${VALID_VOICES.join("|")} (default: ${DEFAULT_VOICE})`,
    );
    console.error(
      `    --model=<model>   one of: ${VALID_MODELS.join("|")} (default: ${DEFAULT_MODEL})`,
    );
    console.error("    --force           skip cache check, re-gen audio");
    process.exit(1);
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error("Thiếu OPENAI_API_KEY trong .env");
    process.exit(2);
  }

  const { name, voice, model, force } = flags;
  const scriptPath = path.join(INPUT_DIR, `${name}.script.txt`);
  const audioOutPath = path.join(INPUT_DIR, `${name}.m4a`);
  const metaOutPath = path.join(TMP_DIR, `${name}.tts-meta.json`);

  let script: string;
  try {
    script = await fs.readFile(scriptPath, "utf-8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") {
      console.error(`Không tìm thấy ${scriptPath}`);
      console.error("Tạo file đó với nội dung script tiếng Việt, mỗi paragraph cách nhau dòng trắng.");
      process.exit(3);
    }
    throw e;
  }

  if (script.trim().length === 0) {
    console.error("Script rỗng — bỏ.");
    process.exit(4);
  }

  const totalChars = script.length;
  const newHash = hashScript(script, voice, model);

  // Cache check
  if (!force) {
    try {
      const oldMetaRaw = await fs.readFile(metaOutPath, "utf-8");
      const oldMeta = JSON.parse(oldMetaRaw) as TtsMeta;
      const audioExists = await fs
        .access(audioOutPath)
        .then(() => true)
        .catch(() => false);
      if (oldMeta.scriptHash === newHash && audioExists) {
        console.log(
          `✓ Cache hit (script + voice ${voice} + model ${model} unchanged)`,
        );
        console.log(`  Audio:  ${audioOutPath}`);
        console.log(`  Meta:   ${metaOutPath}`);
        console.log(`  Skip API call. Use --force để re-gen.`);
        return;
      }
    } catch {
      /* no cache, gen tiếp */
    }
  }

  // Chunk script
  const chunks = chunkScript(script);
  if (chunks.length === 0) {
    console.error("Script không có content (sau khi parse paragraph) — bỏ.");
    process.exit(5);
  }

  console.log(`Script: ${totalChars.toLocaleString("vi-VN")} chars`);
  console.log(`  Chunks: ${chunks.length}`);
  console.log(`  Voice: ${voice} · Model: ${model}`);
  console.log(`  Estimated cost: $${((totalChars / 1_000_000) * 30).toFixed(3)} (tts-1-hd $30/1M chars)`);
  console.log("");

  // Call OpenAI TTS for each chunk → concat audio buffers
  const openai = new OpenAI({ apiKey });
  const audioBuffers: Buffer[] = [];
  for (let i = 0; i < chunks.length; i++) {
    process.stdout.write(`  Chunk ${i + 1}/${chunks.length} (${chunks[i]!.length} chars)… `);
    const start = Date.now();
    const response = await openai.audio.speech.create({
      model,
      voice,
      input: chunks[i]!,
      response_format: "aac", // ALLOWED: mp3, opus, aac, flac. AAC for .m4a container.
    });
    const arrayBuf = await response.arrayBuffer();
    audioBuffers.push(Buffer.from(arrayBuf));
    const elapsed = Math.round((Date.now() - start) / 100) / 10;
    console.log(`${elapsed}s`);
  }

  // Concat AAC buffers (sequential — works for AAC since each chunk is a valid AAC stream;
  // for tougher containers may need ffmpeg. AAC raw stream concat is OK in most players.)
  const combined = Buffer.concat(audioBuffers);
  await fs.mkdir(INPUT_DIR, { recursive: true });
  await fs.writeFile(audioOutPath, combined);

  // Rough paragraph timings — đoán bằng char ratio, dùng totalChars × 80ms/char baseline
  // (tts-1-hd VN voice ~ 12 char/sec ≈ 83ms/char).
  const paragraphs = script
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter(Boolean);
  const baselineMsPerChar = 83;
  const estimatedAudioMs = totalChars * baselineMsPerChar;
  const timings = estimateParagraphTimings(paragraphs, estimatedAudioMs);

  const meta: TtsMeta = {
    name,
    generatedAt: new Date().toISOString(),
    voice,
    model,
    scriptHash: newHash,
    totalChars,
    totalChunks: chunks.length,
    paragraphs: paragraphs.map((text, i) => ({
      index: i,
      text,
      chars: text.length,
      estimatedStartMs: timings[i]!.startMs,
      estimatedEndMs: timings[i]!.endMs,
    })),
  };
  await fs.mkdir(TMP_DIR, { recursive: true });
  await fs.writeFile(metaOutPath, JSON.stringify(meta, null, 2));

  console.log("");
  console.log(`✓ Audio:   ${audioOutPath} (${(combined.length / 1024 / 1024).toFixed(2)} MB)`);
  console.log(`  Meta:    ${metaOutPath}`);
  console.log(`  ${paragraphs.length} paragraphs timings ước lượng (sẽ refine ở Phase whisper).`);
  console.log("");
  console.log(`→ Bước tiếp: chạy whisper VI để có transcript chuẩn, hoặc render trực tiếp.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
