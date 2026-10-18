/**
 * story-align.ts — ghép các phần audio Gemini (AI Studio) → input/<slug>.m4a, whisper
 * lấy timing rồi FORCED-ALIGN chữ chuẩn của input/<slug>.story.json vào.
 *
 * Đầu ra (render studio dùng thẳng, bỏ qua whisper + spell-fix + LLM editorial):
 *   input/<slug>.m4a             audio ghép
 *   tmp/<slug>.whisper.json      whisper thô (chỉ để lấy timing)
 *   tmp/<slug>.json + .corrected.json   transcript sentence-level, CHỮ KỊCH BẢN
 *   tmp/<slug>.editorial.json    chương theo section + trích dẫn nguồn
 *   (xoá tmp/<slug>.plan.json cũ để render tạo lại plan)
 *
 * Usage: npx tsx story/scripts/story-align.ts <slug>
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { processAudio } from "../../shared/audio/process-audio";
import { transcribeAudio } from "../../shared/transcribe/transcribe";
import {
  alignWords,
  sentencesToWords,
  sentenceSpans,
  whisperWords,
} from "../../shared/lib/forced-align";
import { INPUT_DIR, TMP_DIR, readStory, storySentences } from "./story-common";

const ffprobeMs = (file: string): number =>
  Math.round(
    Number.parseFloat(
      execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file], {
        encoding: "utf-8",
      }),
    ) * 1000,
  );

const msToTs = (ms: number): string => {
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${pad(Math.floor(ms / 3_600_000))}:${pad(Math.floor((ms % 3_600_000) / 60_000))}:${pad(
    Math.floor((ms % 60_000) / 1000),
  )},${pad(ms % 1000, 3)}`;
};

async function main() {
  const slug = process.argv[2];
  if (!slug) {
    console.error("Usage: npx tsx story/scripts/story-align.ts <slug>");
    process.exit(1);
  }
  const story = readStory(slug);

  // 1. Ghép phần → input/<slug>.m4a
  const partsDir = path.join(INPUT_DIR, `${slug}.parts`);
  const parts = fs.existsSync(partsDir)
    ? fs
        .readdirSync(partsDir)
        .filter((f) => /^audio_\d+\.(wav|mp3|m4a|aac|flac|ogg)$/i.test(f))
        .sort((a, b) => Number(a.match(/\d+/)![0]) - Number(b.match(/\d+/)![0]))
        .map((f) => path.join(partsDir, f))
    : [];
  if (!parts.length) throw new Error(`Không có audio_01.wav… trong ${partsDir}`);
  console.log(`[story-align] ${parts.length} phần: ${parts.map((p) => path.basename(p)).join(", ")}`);

  const m4a = path.join(INPUT_DIR, `${slug}.m4a`);
  execFileSync(
    "ffmpeg",
    [
      "-y", "-hide_banner", "-loglevel", "warning",
      ...parts.flatMap((p) => ["-i", p]),
      "-filter_complex",
      parts.map((_, i) => `[${i}:a]aresample=48000,aformat=channel_layouts=mono[a${i}]`).join(";") +
        ";" + parts.map((_, i) => `[a${i}]`).join("") + `concat=n=${parts.length}:v=0:a=1[out]`,
      "-map", "[out]", "-c:a", "aac", "-b:a", "192k", m4a,
    ],
    { stdio: ["ignore", "ignore", "inherit"] },
  );
  const durationMs = ffprobeMs(m4a);
  console.log(`[story-align] ✓ ${m4a} (${(durationMs / 60000).toFixed(1)} phút)`);

  // 2. Whisper trên CHÍNH bản chuẩn hoá mà render dùng → timing khớp video
  const { whisperWav } = await processAudio(m4a);
  const whisperJson = path.join(TMP_DIR, `${slug}.whisper.json`);
  const W = whisperWords(await transcribeAudio(whisperWav, whisperJson));

  // 3. Căn chữ kịch bản
  const sentences = storySentences(story);
  const S = sentencesToWords(sentences.map((s) => s.text));
  const { aligned, anchored } = alignWords(W, S, durationMs);
  const pct = S.length ? Math.round((anchored / S.length) * 100) : 0;
  console.log(`[story-align] neo ${anchored}/${S.length} từ (${pct}%) — còn lại nội suy`);
  if (pct < 70) {
    console.warn(
      `[story-align] ⚠️ neo thấp (${pct}%) — audio có khớp story.json không? (thiếu/thừa phần, đọc lệch kịch bản)`,
    );
  }
  const spans = sentenceSpans(aligned, sentences.length);

  // 4. Transcript sentence-level (format whisper) — chữ kịch bản
  const transcript = {
    systeminfo: "story-align (chữ kịch bản + timing whisper)",
    model: { type: "gemini-tts" },
    params: { language: "vi" },
    result: { language: "vi" },
    transcription: sentences.map((s, i) => ({
      text: " " + s.text,
      offsets: { from: spans[i].startMs, to: spans[i].endMs },
      tokens: [],
      timestamps: { from: msToTs(spans[i].startMs), to: msToTs(spans[i].endMs) },
    })),
  };
  for (const suffix of [".json", ".corrected.json"]) {
    fs.writeFileSync(path.join(TMP_DIR, slug + suffix), JSON.stringify(transcript, null, 2));
  }

  // 5. Editorial: chương = section có `chapter`; trích dẫn ở section `cite`
  const firstMs = new Map<number, number>();
  sentences.forEach((s, i) => {
    if (!firstMs.has(s.section)) firstMs.set(s.section, spans[i].startMs);
  });
  const chapters = story.sections.flatMap((sec, si) =>
    sec.chapter && firstMs.has(si) ? [{ atMs: firstMs.get(si)!, title: sec.chapter }] : [],
  );
  const citeIdx = story.sections.findIndex((sec) => sec.cite);
  const citations =
    story.source && citeIdx >= 0 && firstMs.has(citeIdx)
      ? [{ atMs: firstMs.get(citeIdx)!, name: story.source.name, source: story.source.title }]
      : [];
  fs.writeFileSync(
    path.join(TMP_DIR, `${slug}.editorial.json`),
    JSON.stringify({ version: 1, generatedAt: new Date().toISOString(), chapters, citations }, null, 2),
  );

  fs.rmSync(path.join(TMP_DIR, `${slug}.plan.json`), { force: true });
  console.log(
    `[story-align] ✓ transcript ${sentences.length} câu · ${chapters.length} chương · ${citations.length} trích dẫn. ` +
      `Bước tiếp: config editorialLocked=true → cover → footage-shotlist → render.`,
  );
}

main().catch((e: unknown) => {
  console.error("[story-align] FAIL:", e);
  process.exit(1);
});
