#!/usr/bin/env tsx
/**
 * One-off orchestration — video test "Thế giới trước khi có triết học".
 *
 * Bypass brainstorm LLM: dựng GalleryBrainstormIdea + transcript + shots tay,
 * rồi chạy trọn pipeline gallery trong 1 process:
 *   plan → PUT transcript/shots → audio (Gemini Kore) → resolve → render ch0.
 *
 * Studio server (:3001) PHẢI đang chạy — renderChapter fetch audio + asset qua
 * HTTP từ server (serve /tmp/). Script chỉ là writer DB duy nhất lúc chạy.
 *
 * Usage: tsx gallery/scripts/make-mythology-test.ts
 */
import "dotenv/config";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  createStoryboardFromIdea,
  getStoryboard,
  updateChapter,
  updateChapterAudio,
  inferSeriesSlug,
} from "../../shared/studio-core/gallery-storyboard-store";
import { generateChapterAudio } from "../../shared/studio-core/gallery-chapter-audio";
import { PATHS } from "../../shared/studio-core/paths";

const execFileAsync = promisify(execFile);
/** Hệ số hạ tốc độ đọc (0.92x ≈ thong dong tài liệu, giữ nguyên cao độ). */
const SPEED = 0.92;
import {
  resolveChapterAssets,
  defaultResolverOptions,
} from "../../shared/studio-core/gallery-asset-resolver";
import { saveAsset } from "../../shared/studio-core/gallery-asset-store";
import { renderChapter } from "../../shared/studio-core/gallery-render";
import type { GalleryBrainstormIdea } from "../src/brainstorm-idea";
import type { Shot } from "../src/shot";

const BRAINSTORM_ID = "manual-mythology-pre-philosophy";
const AUDIO_BASE = `http://127.0.0.1:${process.env.STUDIO_PORT ?? "3001"}`;

// ── Idea (thoả schema: ≥3 chapters, ≥3 keyWorks, ≥15 phút) ─────────────────
const idea: GalleryBrainstormIdea = {
  title: "Thế giới trước khi có triết học",
  archetype: "theme",
  hook: "Trước khi có triết học, con người giải thích mọi thứ bằng thần linh.",
  era: "Hy Lạp cổ đại (~800–500 TCN)",
  region: "Hy Lạp — Olympus, Athens",
  estimatedMinutes: 15,
  structureMode: "linear",
  chapters: [
    {
      kind: "narration",
      title: "Thế giới của thần linh",
      minutes: 2,
      keyWorks: ["Tượng thần Zeus", "Tượng thần Poseidon", "Tượng nữ thần Athena"],
      summary:
        "Trước buổi bình minh của lý trí: người Hy Lạp cổ đại giải thích vũ trụ qua các vị thần Olympus.",
    },
    {
      kind: "music",
      title: "Khoảng lặng I",
      minutes: 2,
      keyWorks: [],
      summary: "Khoảng nghỉ chiêm ngưỡng tàn tích Hy Lạp.",
      musicCue: "Ambient strings, trầm",
    },
    {
      kind: "music",
      title: "Khoảng lặng II",
      minutes: 2,
      keyWorks: [],
      summary: "Khoảng nghỉ chiêm ngưỡng biển Aegean.",
      musicCue: "Cello solo, chậm",
    },
  ],
  keyWorks: [
    {
      title: "Tượng thần Zeus",
      year: "Hy Lạp cổ đại",
      location: "Public domain (Wikimedia)",
      medium: "Marble sculpture",
      whyImportant: "Vua các vị thần — biểu tượng quyền lực bầu trời và sấm sét.",
    },
    {
      title: "Tượng thần Poseidon",
      year: "Hy Lạp cổ đại",
      location: "Public domain (Wikimedia)",
      medium: "Marble / bronze sculpture",
      whyImportant: "Thần biển cả — sóng dữ và động đất là quyền năng của ngài.",
    },
    {
      title: "Tượng nữ thần Athena",
      year: "Hy Lạp cổ đại",
      location: "Public domain (Wikimedia)",
      medium: "Marble sculpture",
      whyImportant: "Nữ thần khôn ngoan — thành Athens và Parthenon tôn vinh nàng.",
    },
  ],
  licenseRisk: "safe",
  licenseNote:
    "Tượng cổ đại public domain (Wikimedia); b-roll stock Pixabay/Coverr/Pexels free, no credit.",
  assetSources: {
    wikimedia: true,
    met: true,
    customMuseums: [],
    estimatedImageCount: 6,
    estimatedClipCount: 8,
  },
  references: [],
  scholarlyDebate: "",
  audience: "Người xem phổ thông quan tâm triết học & lịch sử tư tưởng",
  uniqueAngle:
    "Tập mở màn series triết gia: thế giới quan thần thoại TRƯỚC khi lý trí xuất hiện.",
};

// ── Transcript (13 câu, split theo [.!?]+) ─────────────────────────────────
const SENTENCES = [
  "Hàng nghìn năm trước, khi màn đêm buông xuống và sấm sét xé ngang bầu trời, con người chưa có khoa học, chưa có triết học.", // 0
  "Họ chỉ có một lời đáp cho mọi điều bí ẩn: thần linh.", // 1
  "Hãy ngược dòng về Hy Lạp cổ đại, vùng đất của những ngôi đền cẩm thạch trắng, của biển xanh thẳm và những thành bang rực rỡ.", // 2
  "Nơi đây, mỗi ngọn núi, mỗi con sóng, mỗi cơn gió đều mang trong mình một vị thần.", // 3
  "Trên đỉnh Olympus ngự trị Zeus, vua của các vị thần, chúa tể bầu trời và sấm sét.", // 4
  "Khi giông bão gầm vang, người Hy Lạp tin rằng đó là cơn thịnh nộ của ngài.", // 5
  "Dưới lòng đại dương sâu thẳm là Poseidon, thần của biển cả.", // 6
  "Mỗi cơn sóng dữ, mỗi trận động đất đều là cái vung tay của cây đinh ba quyền năng.", // 7
  "Và từ chính trí tuệ của Zeus sinh ra Athena, nữ thần của khôn ngoan, chiến lược và thủ công.", // 8
  "Thành Athens mang tên nàng, và đền Parthenon được dựng lên để tôn vinh nàng.", // 9
  "Trong thế giới ấy, không một câu hỏi nào là không có lời đáp.", // 10
  "Mặt trời mọc, mùa màng, sự sống và cái chết, tất cả đều nằm trong tay các vị thần.", // 11
  "Mọi câu hỏi đều có đáp án từ thần thánh.", // 12 — quote card
];
const transcript = SENTENCES.join(" ");

// ── Style instruction (TẤT CẢ chỉ đạo dồn vào đây) ─────────────────────────
// Chỉ phần [...] prefix mới được Gemini coi là director's note đáng tin (không
// đọc). Tag tiếng Việt trong BODY thì KHÔNG đáng tin — từng bị đọc nhầm
// "[đọc chậm lại]". Nên body để sạch hoàn toàn, mọi diễn xuất mô tả ở đây.
const STYLE_INSTRUCTION =
  "Giọng nam MIỀN BẮC, phát âm chuẩn Hà Nội, trầm ấm dày có độ vang — dẫn chuyện phim tài liệu lịch sử kiểu National Geographic / Discovery: trang nghiêm, tự sự, chiêm nghiệm. Đọc rõ ràng, liền mạch, nhịp tự nhiên gãy gọn (KHÔNG cố ngân dài hay kéo lê từng chữ — độ thong dong sẽ chỉnh sau ở khâu hậu kỳ). Nhấn nhẹ vào tên các vị thần Zeus, Poseidon, Athena; câu kết lắng đọng.";

// Body gửi TTS — LỜI SẠCH, KHÔNG tag, KHÔNG dấu "...". Xuống dòng theo đoạn
// chỉ để Gemini cảm nhận cấu trúc (không ảnh hưởng anchor vì split theo [.!?]).
// Vẫn tách khỏi transcript anchor để giữ quy ước; nội dung = 13 câu sạch.
const TTS_MARKUP = [
  SENTENCES.slice(0, 2).join(" "),
  SENTENCES.slice(2, 4).join(" "),
  SENTENCES.slice(4, 8).join(" "),
  SENTENCES.slice(8, 10).join(" "),
  SENTENCES.slice(10, 13).join(" "),
].join("\n\n");

// ── Shots (anchor theo sentenceIdx) ────────────────────────────────────────
const shot = (s: Partial<Shot> & { sentenceIdx: number }): Shot => ({
  sentenceIdx: s.sentenceIdx,
  keyword: s.keyword ?? "",
  assetIdRef: null,
  kenBurns: s.kenBurns ?? "zoom-in",
  durationMs: null,
  note: "",
  role: s.role ?? "detail",
  assetType: s.assetType,
  aiPrompt: undefined,
  transitionIn: undefined,
});

const shots: Shot[] = [
  shot({ sentenceIdx: 0, keyword: "starry night sky milky way timelapse", role: "establishing", assetType: "stock", kenBurns: "zoom-out" }),
  shot({ sentenceIdx: 1, keyword: "dramatic dark storm clouds lightning", role: "detail", assetType: "stock", kenBurns: "static" }),
  shot({ sentenceIdx: 2, keyword: "ancient greek temple ruins aerial", role: "establishing", assetType: "stock", kenBurns: "pan-right" }),
  shot({ sentenceIdx: 3, keyword: "aegean sea rocky coast greece", role: "establishing", assetType: "stock", kenBurns: "pan-left" }),
  shot({ sentenceIdx: 4, keyword: "Zeus marble statue ancient greek", role: "subject", assetType: "archive", kenBurns: "zoom-in" }),
  shot({ sentenceIdx: 5, keyword: "lightning strike dark sky slow motion", role: "detail", assetType: "stock", kenBurns: "static" }),
  shot({ sentenceIdx: 6, keyword: "Poseidon statue trident marble", role: "subject", assetType: "archive", kenBurns: "zoom-in" }),
  shot({ sentenceIdx: 7, keyword: "stormy ocean waves crashing rocks", role: "detail", assetType: "stock", kenBurns: "pan-left" }),
  shot({ sentenceIdx: 8, keyword: "Athena statue marble helmet", role: "subject", assetType: "archive", kenBurns: "zoom-in" }),
  shot({ sentenceIdx: 9, keyword: "parthenon acropolis athens golden hour", role: "subject", assetType: "stock", kenBurns: "pan-right" }),
  shot({ sentenceIdx: 10, keyword: "ancient greek ruins columns sunset", role: "transition", assetType: "stock", kenBurns: "zoom-in" }),
  shot({ sentenceIdx: 12, keyword: "Quote", role: "payoff", assetType: "motion", kenBurns: "static" }),
];

/**
 * Hạ tốc độ đọc của chapter audio bằng ffmpeg `atempo` (giữ nguyên cao độ),
 * rồi scale lại wordTimestamps + audioDurationMs để render align đúng.
 * speed < 1 = chậm hơn (audio dài ra theo hệ số 1/speed).
 */
async function slowDownChapterAudio(
  planId: string,
  chapterIdx: number,
  speed: number,
): Promise<void> {
  const plan = await getStoryboard(planId);
  if (!plan) throw new Error("plan không tồn tại");
  const ch = plan.chapters[chapterIdx];
  if (!ch.audioFilename) throw new Error("chapter chưa có audio");
  const audioPath = path.join(PATHS.TMP_DIR, ch.audioFilename);
  const tmpPath = audioPath.replace(/\.aac$/, ".slow.aac");

  await execFileAsync("ffmpeg", [
    "-y",
    "-i", audioPath,
    "-filter:a", `atempo=${speed}`,
    "-c:a", "aac",
    "-b:a", "192k",
    "-movflags", "+faststart",
    tmpPath,
  ]);
  await execFileAsync("mv", [tmpPath, audioPath]);

  // Scale timestamps: audio dài ra 1/speed lần.
  const factor = 1 / speed;
  const scaled = ch.wordTimestamps.map((w) => ({
    word: w.word,
    startMs: Math.round(w.startMs * factor),
    endMs: Math.round(w.endMs * factor),
  }));
  const newDuration = Math.round((ch.audioDurationMs ?? 0) * factor);
  await updateChapterAudio(planId, chapterIdx, {
    audioFilename: ch.audioFilename,
    audioDurationMs: newDuration,
    wordTimestamps: scaled,
  });
  console.log(`   audio ${ch.audioDurationMs}ms → ${newDuration}ms`);
}

async function main(): Promise<void> {
  console.log("① Tạo storyboard plan…");
  const plan = await createStoryboardFromIdea({
    brainstormId: BRAINSTORM_ID,
    ideaIdx: 0,
    idea,
  });
  console.log(`   plan = ${plan.id}`);

  console.log("② PUT shots + transcript MARKUP (cho TTS)…");
  await updateChapter(plan.id, 0, {
    transcript: TTS_MARKUP, // markup → audio đọc có ngắt nhịp/nhấn
    shots,
    status: "approved",
  });

  console.log("③ Gen audio (Gemini Algenib, vi-VN)…");
  await generateChapterAudio({
    planId: plan.id,
    chapterIdx: 0,
    ttsProvider: "gemini",
    voice: "Algenib",
    languageCode: "vi-VN",
    styleInstruction: STYLE_INSTRUCTION,
    force: true,
  });

  console.log(`③-slow Hạ tốc độ đọc ${SPEED}x (ffmpeg atempo, giữ cao độ)…`);
  await slowDownChapterAudio(plan.id, 0, SPEED);

  console.log("③b Restore transcript SẠCH (cho anchor shot + Quote card)…");
  // wordTimestamps + audioFilename giữ nguyên; chỉ đổi transcript về bản sạch
  // 13 câu để computeSentenceStartMs split đúng + Quote card lấy câu 12 sạch.
  await updateChapter(plan.id, 0, { transcript });
  const afterAudio = await getStoryboard(plan.id);
  console.log(
    `   audio = ${afterAudio?.chapters[0].audioFilename} · ${afterAudio?.chapters[0].audioDurationMs}ms · ${afterAudio?.chapters[0].wordTimestamps.length} word ts`,
  );

  console.log("④ Resolve assets (Pixabay→Coverr→Pexels + Wikimedia archive)…");
  const fresh = await getStoryboard(plan.id);
  if (!fresh) throw new Error("plan biến mất");
  const chapter = fresh.chapters[0];
  const series = inferSeriesSlug(fresh.ideaSnapshot.title);
  const opts = defaultResolverOptions({ planId: plan.id });
  const result = await resolveChapterAssets({
    planId: plan.id,
    chapterIdx: 0,
    chapter,
    series,
    options: opts,
  });
  console.log(
    `   resolved=${result.resolved.length} pending=${result.pending.length} failed=${result.failed.length}`,
  );
  for (const f of result.failed) console.log(`   ✗ beat ${f.beatIdx}: ${f.reason}`);

  // Wire resolved → gallery_assets + set beat.assetIdRef (giống route /resolve)
  const patched = [...chapter.shots];
  for (const a of result.resolved) {
    if (a.source === "motion") continue;
    const filename = path.basename(a.localPath);
    const hash = filename.split(".")[0];
    const assetId = `${a.source}:${hash}`;
    const fullUrl = `/tmp/gallery-assets/${plan.id}/${filename}`;
    saveAsset({
      id: assetId,
      provider: a.source,
      kind: a.isVideo ? "video" : "image",
      title: a.title ?? `${a.source} ${hash.slice(0, 8)}`,
      author: a.author,
      year: a.year,
      thumbUrl: fullUrl,
      fullUrl,
      sourcePage: a.sourceUrl ?? "",
      license: a.license ?? "",
      licenseStatus: "safe",
    });
    if (patched[a.beatIdx]) patched[a.beatIdx] = { ...patched[a.beatIdx], assetIdRef: assetId };
  }
  await updateChapter(plan.id, 0, { shots: patched });
  console.log(`   attached ${patched.filter((b) => b.assetIdRef).length}/${patched.length} shots`);

  console.log("⑤ Render chapter 0 (Remotion)…");
  const r = await renderChapter({
    planId: plan.id,
    chapterIdx: 0,
    audioUrlBase: AUDIO_BASE,
    onProgress: (pct, msg) => {
      if (pct % 20 === 0) console.log(`   render ${pct}% — ${msg}`);
    },
  });
  console.log(`\n✅ XONG: ${r.outputPath}  (${Math.round(r.durationMs / 1000)}s)`);
  console.log(`   plan id: ${plan.id}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
