/**
 * whisper-only.ts — chạy MỖI whisper (normalize + transcribe), KHÔNG gọi OpenAI spell-fix.
 * Dùng khi muốn tự sửa chính tả bằng tay / bằng Claude thay cho API tốn tiền.
 * Output: tmp/<base>.json (raw whisper transcript).
 *
 * Usage: npx tsx podcast/scripts/whisper-only.ts input/<slug>.m4a
 */
import fs from "node:fs";
import path from "node:path";
import { processAudio } from "../../shared/audio/process-audio";
import { transcribeAudio } from "../../shared/transcribe/transcribe";

async function main() {
  const audioPath = process.argv[2];
  if (!audioPath || !fs.existsSync(audioPath)) {
    throw new Error(`File audio không tồn tại: ${audioPath}`);
  }
  const base = path.basename(audioPath).replace(/\.[^.]+$/, "");
  const tmpDir = path.resolve("tmp");
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

  console.log(`[whisper-only] normalize + transcribe: ${base}`);
  const { whisperWav } = await processAudio(audioPath);
  const transcriptJson = path.join(tmpDir, `${base}.json`);
  await transcribeAudio(whisperWav, transcriptJson);
  console.log(`[whisper-only] ✓ raw transcript: ${transcriptJson}`);
  console.log(`[whisper-only] Giờ sửa chính tả rồi ghi ${base}.corrected.json (mtime mới hơn) → spell-fix sẽ cache-skip, KHÔNG gọi OpenAI.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
