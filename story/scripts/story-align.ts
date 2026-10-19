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
import { INPUT_DIR, TMP_DIR, readStory, resolveTts, storySentences } from "./story-common";

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
  const { tempo, speakers, eq } = resolveTts(slug, story);

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
        ";" + parts.map((_, i) => `[a${i}]`).join("") + `concat=n=${parts.length}:v=0:a=1` +
        (tempo !== 1 ? `,atempo=${tempo}` : "") + (eq ? `,${eq}` : "") + "[out]",
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
  const sentences = storySentences(story, (speakers ?? []).map((sp) => sp.name));
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

  // 6. Cảnh phân tích vẽ tay: neo `at` (câu trong section) → mốc ms; mỗi cảnh kéo tới cảnh kế.
  const vizPath = path.join(TMP_DIR, `${slug}.viz.json`);
  const sectionSentence = new Map<string, number>(); // "section:câu" → index câu toàn tập
  const perSection = new Map<number, number>();
  sentences.forEach((s, i) => {
    const k = perSection.get(s.section) ?? 0;
    sectionSentence.set(`${s.section}:${k}`, i);
    perSection.set(s.section, k + 1);
  });
  const starts = story.sections.flatMap((sec, si) =>
    (sec.viz ?? []).map(({ at = 0, ...scene }) => {
      // `at` = số thứ tự câu trong section, hoặc 1 đoạn chữ của câu cần neo (bền khi sửa kịch bản).
      const n = perSection.get(si) ?? 1;
      const local =
        typeof at === "string"
          ? Array.from({ length: n }, (_, k) => k).find((k) =>
              sentences[sectionSentence.get(`${si}:${k}`)!].text.toLowerCase().includes(at.toLowerCase()),
            )
          : Math.min(at, n - 1);
      const idx = local === undefined ? undefined : sectionSentence.get(`${si}:${local}`);
      if (idx === undefined) throw new Error(`viz section ${sec.id}: không tìm thấy câu "${at}"`);
      // Hiện cảnh sớm ~250ms để hình ra kịp lúc giọng nói tới ý đó.
      return { startMs: Math.max(0, spans[idx].startMs - 250), scene };
    }),
  );
  starts.sort((a, b) => a.startMs - b.startMs);
  if (starts.length) {
    const lastMs = spans[spans.length - 1].endMs + 400;
    const beats = starts.map((b, i) => ({ ...b, endMs: starts[i + 1]?.startMs ?? lastMs }));
    fs.writeFileSync(vizPath, JSON.stringify({ version: 1, beats }, null, 2));
    console.log(`[story-align] ✓ ${beats.length} cảnh vẽ tay → ${vizPath}`);
  } else {
    fs.rmSync(vizPath, { force: true });
  }

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
