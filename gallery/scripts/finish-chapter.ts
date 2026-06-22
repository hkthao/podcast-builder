#!/usr/bin/env tsx
/**
 * Hoàn tất 1 chương đã có transcript+shots: audio (Algenib) → hạ 0.92x →
 * resolve → render. Dùng để review chất lượng 1 phần trước khi làm cả series.
 *
 * Usage: tsx gallery/scripts/finish-chapter.ts <planId> <chapterIdx>
 */
import "dotenv/config";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  getStoryboard,
  updateChapterAudio,
} from "../../shared/studio-core/gallery-storyboard-store";
import { PATHS } from "../../shared/studio-core/paths";

const execFileAsync = promisify(execFile);
const BASE = `http://127.0.0.1:${process.env.STUDIO_PORT ?? "3001"}`;
const SPEED = 0.92;
const STYLE =
  "Giọng nam MIỀN BẮC, phát âm chuẩn Hà Nội, trầm ấm dày có độ vang — dẫn chuyện phim tài liệu lịch sử kiểu National Geographic: trang nghiêm, tự sự, chiêm nghiệm. Đọc rõ ràng, liền mạch, nhịp tự nhiên gãy gọn (KHÔNG cố ngân dài). Đọc liền hơi, ngắt nghỉ tối thiểu; TUYỆT ĐỐI không để lọt tiếng hít vào hay tiếng thở giữa và đầu câu. Nhấn nhẹ tên Socrates, Plato, Aristotle. Đọc TRỌN VẸN, rõ ràng tới hết câu cuối cùng — KHÔNG đọc nhỏ dần, KHÔNG bỏ lửng hay nuốt cuối câu.";

async function api(method: string, p: string, body?: unknown): Promise<any> {
  const res = await fetch(`${BASE}${p}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  if (!res.ok) throw new Error(`${method} ${p} → ${res.status}: ${json?.error ?? text.slice(0, 200)}`);
  return json;
}

async function probeDurationMs(file: string): Promise<number> {
  const { stdout } = await execFileAsync("ffprobe", [
    "-v", "error", "-show_entries", "format=duration",
    "-of", "default=nw=1:nk=1", file,
  ]);
  return Math.round(parseFloat(stdout.trim()) * 1000);
}

async function slowDown(planId: string, idx: number, speed: number): Promise<void> {
  const plan = await getStoryboard(planId);
  const ch = plan!.chapters[idx];
  if (!ch.audioFilename) return;
  const audioPath = path.join(PATHS.TMP_DIR, ch.audioFilename);
  const tmp = audioPath.replace(/\.aac$/, ".slow.aac");
  // Chỉ atempo hạ tốc độ. KHÔNG dùng agate — gate nuốt mất câu kết đọc nhỏ.
  // Tiếng hít hơi xử lý bằng styleInstruction (không phá audio).
  await execFileAsync("ffmpeg", ["-y", "-i", audioPath, "-filter:a", `atempo=${speed}`,
    "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", tmp]);
  await execFileAsync("mv", [tmp, audioPath]);
  // ĐO độ dài file THẬT (atempo) thay vì nhân old×1/speed — vì audioDurationMs
  // từ gen hay bị whisper thổi phồng (overshoot câu kết) → composition dài hơn
  // audio → đuôi video im lặng, nghe như mất câu. Dùng giá trị thật để khớp.
  const realMs = await probeDurationMs(audioPath);
  const f = 1 / speed;
  // wordTimestamps gốc ở timeframe pre-atempo; scale ×1/speed là đúng tuyến tính,
  // nhưng clamp vào realMs để không vượt độ dài file.
  await updateChapterAudio(planId, idx, {
    audioFilename: ch.audioFilename,
    audioDurationMs: realMs,
    wordTimestamps: ch.wordTimestamps.map((w) => ({
      word: w.word,
      startMs: Math.min(realMs, Math.round(w.startMs * f)),
      endMs: Math.min(realMs, Math.round(w.endMs * f)),
    })),
  });
}

async function main(): Promise<void> {
  const planId = process.argv[2];
  const idx = Number(process.argv[3] ?? "0");
  if (!planId) { console.error("Usage: finish-chapter.ts <planId> <idx>"); process.exit(1); }

  console.log(`④ audio (Algenib) chương ${idx}…`);
  await api("POST", `/api/gallery/storyboards/${planId}/chapters/${idx}/audio`, {
    ttsProvider: "gemini", voice: "Algenib", languageCode: "vi-VN", styleInstruction: STYLE, force: true,
  });
  console.log(`④b hạ ${SPEED}x…`);
  await slowDown(planId, idx, SPEED);
  console.log("⑤ resolve…");
  const r = await api("POST", `/api/gallery/storyboards/${planId}/chapters/${idx}/resolve`, {});
  console.log(`   attached=${r.attached ?? "?"}`);
  console.log("⑥ render…");
  const rr = await api("POST", `/api/gallery/storyboards/${planId}/chapters/${idx}/render`, {});
  const plan = await getStoryboard(planId);
  const vf = plan!.chapters[idx].videoFilename;
  console.log(`\n✅ XONG: tmp/${vf}  (${Math.round((rr.durationMs ?? 0) / 1000)}s)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
