import "dotenv/config";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import OpenAI from "openai";
import { chat } from "../../shared/studio-core/llm-providers";
import {
  EpisodeConfigSchema,
  buildEpisodeTemplate,
  type EpisodeConfig,
} from "../src/episode";
import type { Transcript } from "../../shared/transcribe/transcribe";
import { tagFootagePool, type FootageTag } from "./footage-tags";
import { searchPexelsVideos, downloadPexelsVideo, type PexelsVideo } from "./pexels";

/**
 * Đánh giá footage tự quay theo chủ đề tập + lấp chỗ thiếu bằng Pexels.
 *
 * Ý tưởng theo mô hình SHOT-LIST của reel (beat → mô tả → từ khoá tìm), nhưng
 * TỰ ĐỘNG: (1) LLM sinh shot-list từ transcript; (2) chấm điểm khớp footage tự
 * quay với từng beat (ưu tiên "filmed by you" — originality); (3) beat KHÔNG có
 * clip tự quay hợp → tải Pexels (giới hạn, xử lý blur/tối ở FootageLayer nên
 * không phải stock thô). Xuất tmp/<slug>.footage-plan.json + (tuỳ chọn) ghi
 * episode.footage. Xem docs/originality-upgrade-plan.md §3.2.
 */

const SHOT_MODEL = process.env.FOOTAGE_PLAN_MODEL ?? "gpt-4o";
const MAX_PEXELS_DEFAULT = 12; // trần số clip stock/tập (nhiều clip → đỡ lặp)
const PREP_SPEED = 0.7;
const PEOPLE_CHECK = process.env.FOOTAGE_PEOPLE_CHECK !== "0"; // vision loại clip có người

type Beat = { label: string; query: string; keywords: string[] };

const SHOTLIST_SYSTEM = `Bạn là biên tập hình cho video podcast dọc 9:16 (triết học/tâm lý). Đọc transcript → chia 12-16 BEAT theo mạch bài (nhiều beat để đỡ lặp cảnh). Mỗi beat trả:
- label: nhãn ngắn tiếng Việt (≤6 từ)
- query: 1 cụm TÌM KIẾM tiếng Anh cho Pexels. BẮT BUỘC là CẢNH THIÊN NHIÊN / PHONG CẢNH, TUYỆT ĐỐI KHÔNG CÓ NGƯỜI (no people, no person, no hands, no crowd). Chọn cảnh + MÀU SẮC hợp tông cảm xúc của beat, và ĐA DẠNG màu giữa các beat. Bộ cảnh gợi ý (xoay vòng cho đa dạng): "lotus flower pond", "water lily close up", "waterfall in forest", "tropical rainforest rain", "spring forest fresh green", "autumn forest golden leaves", "misty mountains sunrise", "sunrise over ocean", "golden sunset sky", "sunset silhouette mountains", "starry night sky milky way", "full moon night clouds", "moonlight over water", "cherry blossom branch", "rice terraces green", "bamboo forest", "calm lake reflection", "morning dew on leaves", "sunlight through trees", "flowing river", "ocean waves slow", "clouds timelapse sky", "snow falling forest", "aurora night sky", "field of flowers wind".
  Gợi ý ghép tông: suy ngẫm/thời gian → nước chảy/hồ tĩnh/mây/trăng nước; mất mát/vô thường → lá thu/sương/hoàng hôn; hồi sinh/di sản/hy vọng → bình minh/rừng xuân/hoa sen/nắng xuyên lá; bao la/hư vô/vĩnh cửu → bầu trời sao/dải ngân hà/mặt trăng; nỗi sợ/căng thẳng → biển động/rừng mưa/mây bão.
- keywords: 3-6 từ khoá tiếng Anh (cảnh + chủ đề trừu tượng, vd ["water","time","flow","calm"])
BẮT BUỘC: beat bám sát mạch transcript; query CHỈ cảnh thiên nhiên không người; tránh cảnh dàn dựng hiếm (toà án, phòng lab...).
Chỉ JSON: {"beats":[{"label":...,"query":...,"keywords":[...]}]}. KHÔNG markdown.`;

/** Vision check 1 frame giữa clip: có người không? (loại clip Pexels dính người) */
const clipHasPeople = async (videoPath: string): Promise<boolean> => {
  if (!process.env.OPENAI_API_KEY) return false; // không có key → bỏ qua check
  try {
    const dur = Number(
      execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", videoPath], { encoding: "utf-8" }).trim(),
    );
    const jpg = path.join(os.tmpdir(), `peoplecheck-${path.basename(videoPath)}.jpg`);
    execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-ss", String((dur || 2) * 0.5), "-i", videoPath, "-frames:v", "1", "-vf", "scale=400:-1", jpg]);
    const b64 = fs.readFileSync(jpg).toString("base64");
    fs.rmSync(jpg, { force: true });
    const openai = new OpenAI();
    const res = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: 'Trả JSON {"people":true|false}. people=true nếu ảnh có bất kỳ NGƯỜI nào (mặt, thân, tay, đám đông). Chỉ JSON.' },
        { role: "user", content: [{ type: "text", text: "Ảnh này có người không?" }, { type: "image_url", image_url: { url: `data:image/jpeg;base64,${b64}` } }] as any },
      ],
      temperature: 0,
      response_format: { type: "json_object" },
    });
    return !!JSON.parse(res.choices[0]?.message?.content ?? "{}").people;
  } catch {
    return false; // lỗi check → không chặn
  }
};

const genShotList = async (
  transcript: Transcript,
  episode: EpisodeConfig,
): Promise<Beat[]> => {
  const text = transcript.transcription
    .map((s) => s.text.trim())
    .filter(Boolean)
    .join(" ")
    .slice(0, 6000);
  const raw = await chat({
    provider: "openai",
    model: SHOT_MODEL,
    systemPrompt: SHOTLIST_SYSTEM,
    userContent: `Tiêu đề: ${episode.title}\n\nTranscript:\n${text}\n\nSinh shot-list 12-16 beat, query CHỈ cảnh thiên nhiên không người, màu đa dạng. JSON.`,
    temperature: 0.6,
    jsonMode: true,
    maxTokens: 2500,
  });
  const j = JSON.parse(raw);
  const beats = Array.isArray(j.beats) ? j.beats : [];
  return beats
    .filter((b: any) => b && typeof b.query === "string")
    .map((b: any) => ({
      label: String(b.label ?? "").trim(),
      query: String(b.query).trim(),
      keywords: Array.isArray(b.keywords)
        ? b.keywords.map((k: unknown) => String(k).toLowerCase().trim()).filter(Boolean)
        : [],
    }));
};

/** Điểm khớp beat ↔ clip = số từ khoá giao nhau (substring 2 chiều). */
const matchScore = (beatKw: string[], clip: FootageTag): number => {
  const ck = [...clip.keywords, ...clip.desc.toLowerCase().split(/\s+/)];
  let s = 0;
  for (const bk of beatKw) {
    if (ck.some((c) => c.includes(bk) || bk.includes(c))) s++;
  }
  return s;
};

/** Chuẩn hoá 1 clip Pexels đã tải → 1080×1920, bỏ tiếng (+silent aac), chậm. */
const prepPexels = (src: string, out: string): void => {
  execFileSync("ffmpeg", [
    "-hide_banner", "-loglevel", "error", "-y",
    "-ss", "0.2", "-i", src,
    "-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=44100",
    "-map", "0:v:0", "-map", "1:a:0", "-shortest",
    "-vf", "setpts=PTS/" + PREP_SPEED + ",scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920",
    "-r", "30", "-c:v", "libx264", "-crf", "20", "-preset", "medium",
    "-g", "30", "-keyint_min", "30", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "16k", "-movflags", "+faststart", out,
  ]);
};

const probeSec = (f: string): number => {
  try {
    return Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", f], { encoding: "utf-8" }).trim()) || 0;
  } catch {
    return 0;
  }
};

/** Thời lượng audio tập (giây) để biết cần bao nhiêu footage lấp đầy. */
const audioDurationSec = (slug: string, transcript: Transcript): number => {
  for (const ext of [".m4a", ".mp3", ".wav"]) {
    const p = path.resolve("input", `${slug}${ext}`);
    if (fs.existsSync(p)) {
      const d = probeSec(p);
      if (d > 0) return d;
    }
  }
  const segs = transcript.transcription;
  const last = segs[segs.length - 1];
  return last ? last.offsets.to / 1000 : 900;
};

export async function generateFootagePlan(
  slug: string,
  opts: { apply?: boolean; maxPexels?: number; allPexels?: boolean } = {},
): Promise<void> {
  const maxPexels = opts.maxPexels ?? MAX_PEXELS_DEFAULT;
  const footageDir = path.resolve("input/footage");
  const pexelsDir = path.join(footageDir, "pexels");
  const corrected = path.resolve("tmp", `${slug}.corrected.json`);
  const rawT = path.resolve("tmp", `${slug}.json`);
  const tPath = fs.existsSync(corrected) ? corrected : rawT;
  if (!fs.existsSync(tPath)) throw new Error(`Thiếu transcript: ${tPath}`);
  const jsonPath = path.resolve("input", `${slug}.json`);
  const episode: EpisodeConfig = fs.existsSync(jsonPath)
    ? EpisodeConfigSchema.parse(JSON.parse(fs.readFileSync(jsonPath, "utf-8")))
    : EpisodeConfigSchema.parse(buildEpisodeTemplate(slug));
  const transcript = JSON.parse(fs.readFileSync(tPath, "utf-8")) as Transcript;

  // 1. shot-list (tags chỉ cần cho mix mode)
  const tags = opts.allPexels ? {} : await tagFootagePool(footageDir);
  console.log("[footage-plan] sinh shot-list...");
  const beats = await genShotList(transcript, episode);
  console.log(`[footage-plan] ${beats.length} beat, ${Object.keys(tags).length} clip tự quay đã tag.`);

  const report: any[] = [];
  const chosen: string[] = []; // filenames (relative to input/footage) theo thứ tự
  const attributions: { file: string; author: string; url: string }[] = [];
  fs.mkdirSync(pexelsDir, { recursive: true });
  let pexelsUsed = 0;
  const usedPexelsIds = new Set<number>(); // tránh trùng clip Pexels

  // ===== Chế độ 100% PEXELS PHONG CẢNH — lấp đủ thời lượng, KHÔNG lặp clip =====
  if (opts.allPexels) {
    const targetSec = audioDurationSec(slug, transcript) * 1.08; // +8% biên an toàn
    console.log(`[footage-plan] all-pexels: cần ~${targetSec.toFixed(0)}s footage (không lặp).`);
    // Xoá clip pexels cũ của slug để không lẫn/lặp.
    for (const f of fs.readdirSync(pexelsDir)) {
      if (f.startsWith(`${slug}-`)) fs.rmSync(path.join(pexelsDir, f), { force: true });
    }
    // Prefetch ứng viên mỗi beat (nhiều để round-robin lấy clip độc nhất).
    const beatCands = await Promise.all(
      beats.map((b) => searchPexelsVideos(b.query, { perPage: 15, minHeight: 1080 }).catch(() => [])),
    );
    const ptr = beats.map(() => 0);
    let accSec = 0;
    let clipIdx = 0;
    while (accSec < targetSec) {
      let progressed = false;
      for (let bi = 0; bi < beats.length && accSec < targetSec; bi++) {
        const b = beats[bi];
        while (ptr[bi] < beatCands[bi].length) {
          const c = beatCands[bi][ptr[bi]++];
          if (usedPexelsIds.has(c.id)) continue;
          const tmpDl = path.join(pexelsDir, `.dl-${slug}-${clipIdx}.mp4`);
          try {
            await downloadPexelsVideo(c.fileUrl, tmpDl);
          } catch {
            continue;
          }
          if (PEOPLE_CHECK && (await clipHasPeople(tmpDl))) {
            fs.rmSync(tmpDl, { force: true });
            continue;
          }
          const rel = `pexels/${slug}-${String(clipIdx).padStart(2, "0")}.mp4`;
          const outAbs = path.join(footageDir, rel);
          prepPexels(tmpDl, outAbs);
          fs.rmSync(tmpDl, { force: true });
          const dur = probeSec(outAbs);
          usedPexelsIds.add(c.id);
          chosen.push(rel);
          attributions.push({ file: rel, author: c.author, url: c.authorUrl });
          accSec += dur;
          pexelsUsed++;
          clipIdx++;
          progressed = true;
          console.log(`  [${accSec.toFixed(0)}/${targetSec.toFixed(0)}s] "${b.query}" → ${rel} (${dur.toFixed(0)}s, by ${c.author})`);
          break;
        }
      }
      if (!progressed) {
        console.warn(`[footage-plan] hết ứng viên ở ${accSec.toFixed(0)}s < ${targetSec.toFixed(0)}s → có thể lặp nhẹ ở cuối.`);
        break;
      }
    }
  } else {

  // ===== Chế độ MIX self-filmed + Pexels =====
  const localFiles = Object.keys(tags);
  const usedLocal = new Set<string>(); // mỗi clip tự quay dùng TỐI ĐA 1 lần (đỡ lặp)

  for (let i = 0; i < beats.length; i++) {
    const b = beats[i];
    // Chọn clip tự quay khớp nhất CHƯA dùng (ưu tiên "filmed by you" + đỡ lặp).
    let best = "";
    let bestScore = 0;
    for (const f of localFiles) {
      if (usedLocal.has(f)) continue;
      const sc = matchScore(b.keywords, tags[f]);
      if (sc > bestScore) { bestScore = sc; best = f; }
    }
    if (bestScore >= 1 && best) {
      usedLocal.add(best);
      chosen.push(best);
      report.push({ beat: b.label, query: b.query, match: `local:${best}`, score: bestScore });
      continue;
    }
    // Gap (không còn clip tự quay hợp CHƯA dùng) → Pexels cảnh thiên nhiên.
    if (pexelsUsed >= maxPexels) {
      report.push({ beat: b.label, query: b.query, match: "gap→(hết trần pexels)", score: 0 });
      continue;
    }
    try {
      const cands = await searchPexelsVideos(b.query, { perPage: 10, minHeight: 1080 });
      if (!cands.length) {
        report.push({ beat: b.label, query: b.query, match: "pexels:none", score: 0 });
        continue;
      }
      // Duyệt ứng viên: bỏ id đã dùng + (nếu bật) loại clip có người.
      let pick: PexelsVideo | null = null;
      let rejPeople = 0;
      for (const c of cands) {
        if (usedPexelsIds.has(c.id)) continue;
        const tmpDl = path.join(pexelsDir, `.dl-${slug}-${i}.mp4`);
        await downloadPexelsVideo(c.fileUrl, tmpDl);
        if (PEOPLE_CHECK && (await clipHasPeople(tmpDl))) {
          fs.rmSync(tmpDl, { force: true });
          rejPeople++;
          continue;
        }
        pick = c;
        const rel = `pexels/${slug}-${String(i).padStart(2, "0")}.mp4`;
        const outAbs = path.join(footageDir, rel);
        prepPexels(tmpDl, outAbs);
        fs.rmSync(tmpDl, { force: true });
        usedPexelsIds.add(c.id);
        chosen.push(rel);
        attributions.push({ file: rel, author: c.author, url: c.authorUrl });
        pexelsUsed++;
        report.push({ beat: b.label, query: b.query, match: `pexels:${rel} (by ${c.author})${rejPeople ? ` [bỏ ${rejPeople} clip có người]` : ""}`, score: 0 });
        console.log(`  [pexels] "${b.query}" → ${rel} (by ${c.author})${rejPeople ? ` [bỏ ${rejPeople} có người]` : ""}`);
        break;
      }
      if (!pick) {
        report.push({ beat: b.label, query: b.query, match: `pexels:none-usable (bỏ ${rejPeople} có người)`, score: 0 });
      }
    } catch (e) {
      report.push({ beat: b.label, query: b.query, match: `pexels-error: ${(e as Error).message}`, score: 0 });
    }
  }
  } // hết else (mix mode)

  const plan = {
    version: 1,
    slug,
    beats: report,
    footage: chosen,
    pexelsAttributions: attributions,
  };
  const planPath = path.resolve("tmp", `${slug}.footage-plan.json`);
  fs.writeFileSync(planPath, JSON.stringify(plan, null, 2));
  console.log(`\n[footage-plan] ✓ ${planPath}`);
  console.log(`  local dùng: ${chosen.filter((c) => !c.startsWith("pexels/")).length}, pexels: ${pexelsUsed}`);
  report.forEach((r) => console.log(`   • ${r.beat.padEnd(24)} ${r.match}`));

  if (opts.apply) {
    episode.footage = chosen;
    const authors = [...new Set(attributions.map((a) => a.author.trim()).filter(Boolean))];
    episode.footageCredit = authors.length ? `Footage: ${authors.join(", ")} (Pexels)` : null;
    fs.writeFileSync(jsonPath, JSON.stringify(episode, null, 2));
    console.log(`[footage-plan] ✓ đã ghi episode.footage (${chosen.length}) vào ${jsonPath}`);
    if (attributions.length) {
      console.log(`  ⚠ Ghi công Pexels trong caption: ${attributions.map((a) => a.author).join(", ")}`);
    }
  } else {
    console.log(`[footage-plan] (dry-run) thêm --apply để ghi vào episode.footage`);
  }
}

const isMain = (() => {
  try {
    return process.argv[1] === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
})();
if (isMain) {
  const slug = process.argv[2];
  if (!slug) {
    console.error("Usage: npx tsx podcast/scripts/footage-plan.ts <slug> [--apply] [--all-pexels] [--max-pexels=N]");
    process.exit(1);
  }
  const apply = process.argv.includes("--apply");
  const allPexels = process.argv.includes("--all-pexels");
  const mp = process.argv.find((a) => /^--max-pexels=\d+$/.test(a));
  generateFootagePlan(slug, {
    apply,
    allPexels,
    maxPexels: mp ? Number(mp.split("=")[1]) : undefined,
  }).catch((e: unknown) => {
    console.error("[footage-plan] FAIL:", e);
    process.exit(1);
  });
}
