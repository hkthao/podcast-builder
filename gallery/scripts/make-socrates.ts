#!/usr/bin/env tsx
/**
 * Video Socrates — chạy ĐÚNG FLOW USER THẬT qua HTTP API của studio server
 * (cùng endpoint UI gọi). Khác make-mythology: KHÔNG hand-author idea/transcript
 * — brainstorm + transcript đều do LLM sinh qua API.
 *
 * Pipeline: brainstorm gallery (Socrates) → pick monograph → tạo plan →
 *   mỗi chương narration: generate transcript (LLM) → audio (Algenib) →
 *   hạ 0.92x → resolve → ; rồi render mọi chương → export concat.
 *
 * Studio server (:3001) PHẢI đang chạy. Usage: tsx gallery/scripts/make-socrates.ts
 */
import "dotenv/config";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  getStoryboard,
  updateChapterAudio,
  updateStoryboardChapters,
} from "../../shared/studio-core/gallery-storyboard-store";
import { PATHS } from "../../shared/studio-core/paths";

const execFileAsync = promisify(execFile);
const BASE = `http://127.0.0.1:${process.env.STUDIO_PORT ?? "3001"}`;
const PROVIDER = "openai";
const MODEL = "gpt-4o-mini";
const SPEED = 0.92;
const STYLE =
  "Giọng nam MIỀN BẮC, phát âm chuẩn Hà Nội, trầm ấm dày có độ vang — dẫn chuyện phim tài liệu lịch sử kiểu National Geographic: trang nghiêm, tự sự, chiêm nghiệm. Đọc rõ ràng, liền mạch, nhịp tự nhiên gãy gọn (KHÔNG cố ngân dài). Đọc liền hơi, ngắt nghỉ tối thiểu; TUYỆT ĐỐI không để lọt tiếng hít vào hay tiếng thở giữa và đầu câu. Nhấn nhẹ tên Socrates, Plato, Aristotle. Đọc TRỌN VẸN, rõ ràng tới hết câu cuối cùng — KHÔNG đọc nhỏ dần, KHÔNG bỏ lửng hay nuốt cuối câu.";

async function api<T = any>(method: string, p: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${p}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  if (!res.ok) {
    throw new Error(`${method} ${p} → ${res.status}: ${json?.error ?? text.slice(0, 200)}`);
  }
  return json as T;
}

/** Hạ tốc độ audio chapter bằng ffmpeg atempo + scale timestamps. */
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
  await execFileAsync("ffmpeg", ["-y", "-i", audioPath, "-filter:a", `atempo=${speed}`,
    "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", tmp]);
  await execFileAsync("mv", [tmp, audioPath]);
  // Đo độ dài file thật (tránh drift audioDurationMs từ whisper overshoot).
  const realMs = await probeDurationMs(audioPath);
  const f = 1 / speed;
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
  console.log("① Brainstorm gallery (Socrates)…");
  const session = await api("POST", "/api/brainstorm", {
    topic: "Socrates",
    tone: "chiêm nghiệm, trang nghiêm",
    style: "gallery",
    count: 3,
    provider: PROVIDER,
    model: MODEL,
  });
  const ideas: any[] = session.ideas ?? [];
  let ideaIdx = ideas.findIndex((i) => i.archetype === "monograph");
  if (ideaIdx < 0) ideaIdx = 0;
  const idea = ideas[ideaIdx];
  console.log(`   session=${session.id} · pick idea[${ideaIdx}] "${idea.title}" (${idea.archetype}, ${idea.chapters.length} chương)`);

  console.log("② Tạo storyboard plan…");
  const plan = await api("POST", "/api/gallery/storyboards", {
    brainstormId: session.id,
    ideaIdx,
  });
  const planId = plan.id;
  const chapters: any[] = plan.chapters;
  console.log(`   plan=${planId} · ${chapters.length} chương`);

  // Music interlude → rút xuống ~10s (transition ngắn) thay vì 2 phút.
  if (chapters.some((c) => c.kind === "music")) {
    await updateStoryboardChapters(
      planId,
      chapters.map((c) => (c.kind === "music" ? { ...c, interludeSeconds: 10 } : c)),
    );
    console.log("   ② b set interludeSeconds=10 cho music chapter");
  }

  for (let i = 0; i < chapters.length; i++) {
    const ch = chapters[i];
    console.log(`\n── Chương ${i}: [${ch.kind}] ${ch.title} (${ch.minutes}') ──`);
    if (ch.kind === "narration") {
      console.log("   ③ generate transcript (LLM)…");
      await api("POST", `/api/gallery/storyboards/${planId}/chapters/${i}/generate`, {
        provider: PROVIDER, model: MODEL,
      });
      console.log("   ④ audio (Algenib)…");
      await api("POST", `/api/gallery/storyboards/${planId}/chapters/${i}/audio`, {
        ttsProvider: "gemini", voice: "Algenib", languageCode: "vi-VN",
        styleInstruction: STYLE, force: true,
      });
      console.log(`   ④b hạ ${SPEED}x…`);
      await slowDown(planId, i, SPEED);
      console.log("   ⑤ resolve assets…");
      const r = await api("POST", `/api/gallery/storyboards/${planId}/chapters/${i}/resolve`, {});
      console.log(`      attached=${r.attached ?? "?"}`);
    }
    console.log("   ⑥ render…");
    const rr = await api("POST", `/api/gallery/storyboards/${planId}/chapters/${i}/render`, {});
    console.log(`      ${Math.round((rr.durationMs ?? 0) / 1000)}s`);
  }

  console.log("\n⑦ Export (concat tất cả chương)…");
  const ex = await api("POST", `/api/gallery/storyboards/${planId}/export`, {});
  console.log(`\n✅ XONG: ${ex.outputPath}  (${Math.round((ex.outputDurationMs ?? 0) / 1000)}s)`);
  console.log(`   plan id: ${planId}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
