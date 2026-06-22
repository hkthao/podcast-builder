#!/usr/bin/env tsx
/**
 * Re-voice + re-render 1 chapter của plan có sẵn — KHÔNG resolve lại asset.
 * Dùng khi chỉ muốn đổi giọng đọc.
 *
 * Usage: tsx gallery/scripts/revoice.ts <planId> <chapterIdx> <voice>
 *   tsx gallery/scripts/revoice.ts 20260621-160701-the-gioi-truoc-khi-co-triet-hoc 0 Charon
 */
import "dotenv/config";
import {
  getStoryboard,
} from "../../shared/studio-core/gallery-storyboard-store";
import { generateChapterAudio } from "../../shared/studio-core/gallery-chapter-audio";
import { renderChapter } from "../../shared/studio-core/gallery-render";

const AUDIO_BASE = `http://127.0.0.1:${process.env.STUDIO_PORT ?? "3001"}`;

async function main(): Promise<void> {
  const planId = process.argv[2];
  const chapterIdx = Number(process.argv[3] ?? "0");
  const voice = process.argv[4] ?? "Charon";
  if (!planId) {
    console.error("Usage: tsx gallery/scripts/revoice.ts <planId> <chapterIdx> <voice>");
    process.exit(1);
  }

  const plan = await getStoryboard(planId);
  if (!plan) throw new Error(`Plan không tồn tại: ${planId}`);

  console.log(`① Gen audio lại — voice ${voice} (vi-VN)…`);
  await generateChapterAudio({
    planId,
    chapterIdx,
    ttsProvider: "gemini",
    voice,
    languageCode: "vi-VN",
    styleInstruction:
      "Đọc như thuyết minh phim tài liệu lịch sử: giọng nam trầm, uy nghi, chậm rãi, ngắt nghỉ rõ, cảm xúc kìm nén, trang trọng.",
    force: true,
  });
  const after = await getStoryboard(planId);
  console.log(
    `   audio = ${after?.chapters[chapterIdx].audioDurationMs}ms · ${after?.chapters[chapterIdx].wordTimestamps.length} word ts`,
  );

  console.log("② Render lại…");
  const r = await renderChapter({
    planId,
    chapterIdx,
    audioUrlBase: AUDIO_BASE,
    onProgress: (pct, msg) => {
      if (pct % 25 === 0) console.log(`   render ${pct}% — ${msg}`);
    },
  });
  console.log(`\n✅ XONG: ${r.outputPath}  (${Math.round(r.durationMs / 1000)}s)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
