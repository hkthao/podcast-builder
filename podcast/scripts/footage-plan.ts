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
  outroTailFrames,
  speechLeadFrames,
  type EpisodeConfig,
} from "../src/episode";
import type { Transcript } from "../../shared/transcribe/transcribe";
import { tagFootagePool, type FootageTag } from "./footage-tags";
import { searchPexelsVideos, downloadPexelsVideo, type PexelsVideo } from "./pexels";
import { buildFootageShotlistUserContent } from "../server/lib/footage-shotlist-prompt";
import { getEffectivePrompt } from "../../shared/studio-core/prompt-overrides-store";

/**
 * Đánh giá footage tự quay theo chủ đề tập + lấp chỗ thiếu bằng Pexels.
 *
 * Ý tưởng theo mô hình SHOT-LIST của reel (beat → mô tả → từ khoá tìm), nhưng
 * TỰ ĐỘNG: (1) LLM sinh shot-list từ transcript; (2) chấm điểm khớp footage tự
 * quay với từng beat (ưu tiên "filmed by you" — originality); (3) beat KHÔNG có
 * clip tự quay hợp → tải Pexels (giới hạn, xử lý blur/tối ở FootageLayer nên
 * không phải stock thô). Xuất tmp/<slug>.footage-plan.json + (tuỳ chọn) ghi
 * episode.footage. Xem docs/originality-upgrade-plan.md §3.2.
 *
 * Chế độ 100% Pexels (--all-pexels / --landscape) BÁM THỜI GIAN: chia lời thoại
 * thành beat ~45s theo mốc video thật → shot-list theo Ý từng khúc (ẩn dụ hình
 * ảnh, không người, đúng nguyên tắc bố cục khung dọc/ngang) → mỗi beat lấp bằng
 * các shot cắt đúng độ dài, xếp theo thời gian → nền khớp nội dung đang nói.
 * Shot-list do CLAUDE CODE viết (miễn phí): --brief → Claude viết JSON →
 * --shotlist=<file> --apply. Không truyền --shotlist → gọi OpenAI (tốn phí).
 */

const SHOT_MODEL = process.env.FOOTAGE_PLAN_MODEL ?? "gpt-4o";
const MAX_PEXELS_DEFAULT = 12; // trần số clip stock/tập (nhiều clip → đỡ lặp)
const PREP_SPEED = 0.7;
const PEOPLE_CHECK = process.env.FOOTAGE_PEOPLE_CHECK !== "0"; // vision loại clip có người

type Beat = { label: string; query: string; keywords: string[] };

const SHOTLIST_SYSTEM = `Bạn là biên tập hình cho video podcast (triết học/tâm lý). Đọc transcript → chia 12-16 BEAT theo mạch bài (nhiều beat để đỡ lặp cảnh). Mỗi beat trả:
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
        { role: "user", content: [{ type: "text", text: "Ảnh này có người không?" }, { type: "image_url", image_url: { url: `data:image/jpeg;base64,${b64}`, detail: "low" } }] as any },
      ],
      temperature: 0,
      response_format: { type: "json_object" },
    });
    return !!JSON.parse(res.choices[0]?.message?.content ?? "{}").people;
  } catch {
    return false; // lỗi check → không chặn
  }
};

/** hex → HSL (h 0-360, s/l 0-1). null nếu hex sai. */
const hexToHsl = (hex: string): { h: number; s: number; l: number } | null => {
  const m = hex.trim().replace(/^#/, "").match(/^([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})/);
  if (!m) return null;
  const r = parseInt(m[1], 16) / 255, g = parseInt(m[2], 16) / 255, b = parseInt(m[3], 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = (((g - b) / d) % 6 + 6) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  const l = (max + min) / 2;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  return { h, s, l };
};

type ColorFamily = { words: string; subjects: string[] };

/** hue (0-360) → HỌ MÀU + danh sách cảnh thiên nhiên mang màu đó (KHÔNG người). */
const pickColorFamily = (h: number): ColorFamily => {
  if (h < 25 || h >= 345)
    return { words: "đỏ / coral / hồng san hô / cam ấm", subjects: ["red poppy field in wind", "pink cherry blossom branch", "bougainvillea flowers", "red tulip field", "autumn red maple leaves", "warm golden sunset sky", "sunrise warm glow over ocean", "red rock canyon", "sand dunes at sunset", "hibiscus flower close up", "rose garden close up", "coral pink flowers"] };
  if (h < 50)
    return { words: "cam / hổ phách / vàng ấm", subjects: ["autumn forest golden orange leaves", "orange sunset clouds", "marigold flower field", "red canyon earth", "golden wheat field at sunset", "orange maple leaves", "desert dunes golden hour", "autumn birch forest", "amber dusk sky", "calendula flowers"] };
  if (h < 70)
    return { words: "vàng / vàng gold", subjects: ["sunflower field", "golden wheat field", "yellow tulip field", "canola flower field", "autumn golden birch forest", "golden hour meadow", "mustard flower field", "yellow ginkgo leaves", "daffodil field"] };
  if (h < 160)
    return { words: "xanh lá", subjects: ["spring fresh green forest", "green rice terraces", "bamboo forest", "tropical rainforest", "green tea hills", "moss covered forest", "fern leaves close up", "lily pads on pond", "green valley meadow", "waterfall in green forest"] };
  if (h < 200)
    return { words: "xanh ngọc / cyan", subjects: ["turquoise glacier lake", "clear tropical sea water", "turquoise waterfall pool", "blue glacier ice cave", "teal ocean lagoon", "icebergs in turquoise water", "green mint aurora sky"] };
  if (h < 255)
    return { words: "xanh dương / xanh biển", subjects: ["calm blue lake and mountains", "deep blue ocean waves", "blue hour mountains", "starry night sky milky way", "blue iceberg", "bluebell forest", "clear blue sky with clouds", "blue misty mountains at dawn"] };
  if (h < 300)
    return { words: "tím / oải hương", subjects: ["lavender field rows", "purple wisteria hanging", "jacaranda tree purple bloom", "violet twilight sky", "purple aurora sky", "lupine flower field", "purple crocus field"] };
  return { words: "hồng / magenta / hồng sen", subjects: ["pink cherry blossom", "pink lotus flower pond", "magenta bougainvillea", "pink sunset sky", "pink cosmos flower field", "pink water lily", "pink muhly grass field"] };
};

/** Khối chỉ dẫn HỌ MÀU chủ đề cho shot-list (rỗng nếu không có accent / màu xám). */
const themeColorGuidance = (hex: string | null): string => {
  if (!hex) return "";
  const hsl = hexToHsl(hex);
  if (!hsl || hsl.s < 0.15) return ""; // gần xám → không ép màu
  const fam = pickColorFamily(hsl.h);
  return `\n\nMÀU CHỦ ĐỀ tập này: ${hex} (họ màu: ${fam.words}). ƯU TIÊN chọn cảnh có MÀU thuộc HỌ MÀU này — màu chủ đề VÀ các màu họ hàng gần đều được, KHÔNG cần đúng 100%. Gợi ý cảnh hợp màu (ưu tiên dùng, xoay vòng cho đa dạng, vẫn phải hợp mạch cảm xúc từng beat + TUYỆT ĐỐI KHÔNG NGƯỜI): ${fam.subjects.join(", ")}. Có thể xen vài cảnh trung tính (mây/nước/sương/nắng) mang tông màu đó qua ánh sáng. Đừng ép tất cả beat cùng một cảnh.`;
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
  const guidance = themeColorGuidance(episode.accentColor);
  const raw = await chat({
    provider: "openai",
    model: SHOT_MODEL,
    systemPrompt: SHOTLIST_SYSTEM,
    userContent: `Tiêu đề: ${episode.title}${guidance}\n\nTranscript:\n${text}\n\nSinh shot-list 12-16 beat, query CHỈ cảnh thiên nhiên không người, ƯU TIÊN họ màu chủ đề ở trên (không cần đúng 100%), màu đa dạng. JSON.`,
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

/** Chuẩn hoá 1 clip Pexels đã tải → khung W×H (dọc 1080×1920 / ngang 1920×1080), bỏ tiếng (+silent aac), chậm. */
const prepPexels = (src: string, out: string, W = 1080, H = 1920, dur?: number): void => {
  execFileSync("ffmpeg", [
    "-hide_banner", "-loglevel", "error", "-y",
    "-ss", "0.2", "-i", src,
    "-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=44100",
    "-map", "0:v:0", "-map", "1:a:0", "-shortest",
    "-vf", `setpts=PTS/${PREP_SPEED},scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H}`,
    "-r", "30", "-c:v", "libx264", "-crf", "20", "-preset", "medium",
    "-g", "30", "-keyint_min", "30", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "16k", "-movflags", "+faststart",
    // Cắt đúng độ dài shot (chế độ bám thời gian) → footage khớp mốc lời thoại.
    ...(dur ? ["-t", dur.toFixed(3)] : []),
    out,
  ]);
};

/**
 * Sổ clip Pexels đã dùng ở MỌI tập (input/_footage-used.json) → tập mới không
 * lấy lại clip của tập cũ. `ids`: id Pexels → slug. `legacy`: tập làm trước khi
 * có sổ (không lưu id) → nhận diện gần đúng bằng tác giả + thời lượng gốc.
 */
type UsedLedger = {
  ids: Record<string, string>;
  legacy: { slug: string; url: string; dur: number }[];
};
const USED_LEDGER = path.resolve("input/_footage-used.json");
const loadUsedLedger = (): UsedLedger => {
  try {
    const j = JSON.parse(fs.readFileSync(USED_LEDGER, "utf-8"));
    return { ids: j.ids ?? {}, legacy: j.legacy ?? [] };
  } catch {
    return { ids: {}, legacy: [] };
  }
};
const normUrl = (u: string): string => u.trim().toLowerCase().replace(/\/+$/, "");


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


// ═══════════ CHẾ ĐỘ BÁM THỜI GIAN (100% Pexels) ═══════════
// Mỗi BEAT = 1 khúc lời thoại ~45s (cắt ở ranh giới câu) có mốc VIDEO thật
// (đã cộng đoạn mở đầu chỉ-nhạc). Shot-list theo Ý của từng khúc → mỗi khúc
// được lấp bằng các shot cắt đúng độ dài → nền footage khớp nội dung đang nói.

/** Độ dài khúc lời thoại cho 1 beat (giây). */
const BEAT_SEC = Number(process.env.FOOTAGE_BEAT_SEC ?? 45);
/** Độ dài 1 shot (giây): dọc cắt nhanh hơn, ngang giữ lâu (4-7s, nhịp thở chậm). */
const SHOT_SEC = {
  portrait: Number(process.env.FOOTAGE_SHOT_SEC ?? 6),
  landscape: Number(process.env.FOOTAGE_SHOT_SEC ?? 7),
} as const;
/** Số beat tải/xử lý song song. */
const BEAT_CONCURRENCY = Number(process.env.FOOTAGE_CONCURRENCY ?? 3);

type TimedBeat = { i: number; startSec: number; endSec: number; text: string };
type BeatShotList = { i: number; label: string; idea?: string; queries: string[] };

const fmtMmSs = (sec: number): string =>
  `${String(Math.floor(sec / 60)).padStart(2, "0")}:${String(Math.floor(sec % 60)).padStart(2, "0")}`;

/**
 * Chia transcript thành beat ~BEAT_SEC theo mốc VIDEO (lead + mốc lời). Beat
 * đầu bắt đầu từ 0 (phủ cả intro + hook), beat cuối kéo tới hết video (đuôi nhạc).
 */
const buildTimedBeats = (transcript: Transcript, leadSec: number, totalSec: number): TimedBeat[] => {
  const segs = transcript.transcription.filter((s) => s.text.trim());
  const beats: TimedBeat[] = [];
  let buf: string[] = [];
  let startMs = -1;
  for (const seg of segs) {
    if (startMs < 0) startMs = seg.offsets.from;
    buf.push(seg.text.trim());
    if ((seg.offsets.to - startMs) / 1000 >= BEAT_SEC) {
      beats.push({ i: beats.length, startSec: leadSec + startMs / 1000, endSec: 0, text: buf.join(" ") });
      buf = [];
      startMs = -1;
    }
  }
  if (buf.length) {
    // Khúc cuối quá ngắn → gộp vào beat trước.
    if (beats.length && buf.join(" ").length < 200) beats[beats.length - 1].text += " " + buf.join(" ");
    else beats.push({ i: beats.length, startSec: leadSec + startMs / 1000, endSec: 0, text: buf.join(" ") });
  }
  if (!beats.length) beats.push({ i: 0, startSec: 0, endSec: totalSec, text: "" });
  beats[0].startSec = 0;
  for (let k = 0; k < beats.length; k++) {
    beats[k].endSec = k + 1 < beats.length ? beats[k + 1].startSec : totalSec;
  }
  return beats;
};

const timedUserContent = (
  episode: EpisodeConfig,
  beats: TimedBeat[],
  orientation: "portrait" | "landscape",
): string =>
  buildFootageShotlistUserContent({
    title: episode.title,
    accentColor: episode.accentColor,
    orientation,
    beats,
  });

const parseShotList = (raw: string, beats: TimedBeat[]): BeatShotList[] => {
  const j = JSON.parse(raw);
  const arr: any[] = Array.isArray(j) ? j : Array.isArray(j.beats) ? j.beats : [];
  return beats.map((b) => {
    const hit = arr.find((x) => Number(x?.i) === b.i) ?? arr[b.i] ?? {};
    const queries = (Array.isArray(hit.queries) ? hit.queries : [hit.query])
      .map((q: unknown) => String(q ?? "").trim())
      .filter(Boolean);
    return {
      i: b.i,
      label: String(hit.label ?? `beat ${b.i}`).trim(),
      idea: hit.idea ? String(hit.idea) : undefined,
      queries: queries.length ? queries : ["calm lake reflection wide shot"],
    };
  });
};

export async function generateFootagePlan(
  slug: string,
  opts: {
    apply?: boolean;
    maxPexels?: number;
    allPexels?: boolean;
    landscape?: boolean;
    /** Chỉ ghi brief beat cho Claude Code viết shot-list (KHÔNG gọi OpenAI), rồi dừng. */
    brief?: boolean;
    /** File shot-list JSON do Claude viết → dùng thay cho OpenAI. */
    shotlistPath?: string;
  } = {},
): Promise<void> {
  const maxPexels = opts.maxPexels ?? MAX_PEXELS_DEFAULT;
  // Bản YouTube 16:9: footage NGANG riêng (pool tự quay đang là dọc → không
  // dùng được) → luôn chạy chế độ 100% Pexels, ghi vào episode.footageLandscape.
  const landscape = !!opts.landscape;
  const allPexels = opts.allPexels || landscape;
  const orientation = landscape ? "landscape" : "portrait";
  const [outW, outH] = landscape ? [1920, 1080] : [1080, 1920];
  const pexelsSub = landscape ? "pexels-yt" : "pexels";
  // Sổ clip đã dùng: bản ngang ghi dưới khoá riêng để chạy lại --landscape
  // không xoá dòng của bản dọc cùng tập (và ngược lại).
  const ledgerKey = landscape ? `${slug}#yt` : slug;
  const footageDir = path.resolve("input/footage");
  const pexelsDir = path.join(footageDir, pexelsSub);
  const corrected = path.resolve("tmp", `${slug}.corrected.json`);
  const rawT = path.resolve("tmp", `${slug}.json`);
  const tPath = fs.existsSync(corrected) ? corrected : rawT;
  if (!fs.existsSync(tPath)) throw new Error(`Thiếu transcript: ${tPath}`);
  const jsonPath = path.resolve("input", `${slug}.json`);
  const episode: EpisodeConfig = fs.existsSync(jsonPath)
    ? EpisodeConfigSchema.parse(JSON.parse(fs.readFileSync(jsonPath, "utf-8")))
    : EpisodeConfigSchema.parse(buildEpisodeTemplate(slug));
  const transcript = JSON.parse(fs.readFileSync(tPath, "utf-8")) as Transcript;

  const sfx = landscape ? ".yt" : "";

  // Chế độ bám thời gian: beat theo mốc video thật + shot-list theo ý từng khúc.
  const fps = 30;
  const leadSec = speechLeadFrames(episode, fps) / fps;
  const tailSec = outroTailFrames(episode, fps) / fps;
  const totalSec = leadSec + audioDurationSec(slug, transcript) + tailSec;
  const timedBeats = allPexels ? buildTimedBeats(transcript, leadSec, totalSec) : [];

  if (opts.brief) {
    if (!allPexels) throw new Error("--brief chỉ dùng với --all-pexels hoặc --landscape");
    const briefPath = path.resolve("tmp", `${slug}${sfx}.footage-brief.json`);
    const outPath = path.resolve("tmp", `${slug}${sfx}.footage-shotlist.json`);
    fs.writeFileSync(
      briefPath,
      JSON.stringify(
        {
          system: getEffectivePrompt("podcast.footage-shotlist"),
          user: timedUserContent(episode, timedBeats, orientation),
          beats: timedBeats,
          output: outPath,
        },
        null,
        2,
      ),
    );
    console.log(`[footage-plan] ✓ brief ${timedBeats.length} beat → ${briefPath}`);
    console.log(`  Claude đọc "system" + "user", viết JSON shot-list vào ${outPath}`);
    console.log(
      `  rồi chạy: npx tsx podcast/scripts/footage-plan.ts ${slug}${landscape ? " --landscape" : " --all-pexels"} --shotlist=${path.relative(process.cwd(), outPath)} --apply`,
    );
    return;
  }

  // 1. shot-list (tags chỉ cần cho mix mode)
  const tags = allPexels ? {} : await tagFootagePool(footageDir);
  let beats: Beat[] = [];
  let shotList: BeatShotList[] = [];
  if (allPexels) {
    if (opts.shotlistPath) {
      shotList = parseShotList(fs.readFileSync(opts.shotlistPath, "utf-8"), timedBeats);
      console.log(`[footage-plan] dùng shot-list của Claude: ${opts.shotlistPath}`);
    } else {
      console.log(`[footage-plan] sinh shot-list ${timedBeats.length} beat (OpenAI ${SHOT_MODEL})...`);
      const raw = await chat({
        provider: "openai",
        model: SHOT_MODEL,
        systemPrompt: getEffectivePrompt("podcast.footage-shotlist"),
        userContent: timedUserContent(episode, timedBeats, orientation),
        temperature: 0.6,
        jsonMode: true,
        maxTokens: 6000,
      });
      shotList = parseShotList(raw, timedBeats);
    }
    console.log(`[footage-plan] ${timedBeats.length} beat bám thời gian, shot ${SHOT_SEC[orientation]}s.`);
  } else {
    console.log("[footage-plan] sinh shot-list...");
    beats = await genShotList(transcript, episode);
    console.log(`[footage-plan] ${beats.length} beat, ${Object.keys(tags).length} clip tự quay đã tag.`);
  }

  const report: any[] = [];
  const chosen: string[] = []; // filenames (relative to input/footage) theo thứ tự
  const attributions: { file: string; author: string; url: string }[] = [];
  fs.mkdirSync(pexelsDir, { recursive: true });
  let pexelsUsed = 0;
  const usedPexelsIds = new Set<number>(); // tránh trùng clip Pexels
  // Nạp clip các tập KHÁC đã dùng (bỏ dòng cũ của chính slug này → chạy lại được).
  const ledger = loadUsedLedger();
  for (const [id, s] of Object.entries(ledger.ids)) {
    if (s === ledgerKey) delete ledger.ids[id];
    else usedPexelsIds.add(Number(id));
  }
  const legacyUsed = ledger.legacy.filter((l) => l.slug !== slug);
  const usedElsewhere = (c: PexelsVideo): boolean =>
    usedPexelsIds.has(c.id) ||
    legacyUsed.some((l) => l.url === normUrl(c.authorUrl) && Math.abs(l.dur - c.durationS) <= 1);
  const newIds: number[] = [];

  // ===== Chế độ 100% PEXELS BÁM THỜI GIAN — mỗi beat lấp bằng shot hợp ý, KHÔNG lặp =====
  if (allPexels) {
    // Clip cũ của slug KHÔNG xoá ở đây (dry-run vẫn phải giữ footage đang dùng);
    // chỉ dọn sau khi --apply ghi config mới thành công (cuối hàm).
    const shotSec = SHOT_SEC[orientation];
    const beatClips: string[][] = timedBeats.map(() => []);

    const fillBeat = async (b: TimedBeat): Promise<void> => {
      const sl = shotList[b.i];
      const need = b.endSec - b.startSec;
      const nShots = Math.max(1, Math.round(need / shotSec));
      const shotLen = need / nShots;
      // Clip gốc phải đủ dài cho 1 shot SAU khi làm chậm (PREP_SPEED) + bỏ 0.2s đầu
      // → không bị ngắn hơn shotLen (lệch mốc thời gian các beat sau).
      const minDur = Math.ceil(shotLen * PREP_SPEED + 0.2) + 1;
      // Ứng viên xen kẽ giữa các query (q0#0, q1#0, q2#0, q0#1…) → đa dạng góc nhìn.
      const fetchCands = async (page: number): Promise<PexelsVideo[]> => {
        const lists = await Promise.all(
          sl.queries.map((q) =>
            searchPexelsVideos(q, { perPage: 30, page, minHeight: 1080, minDurationS: minDur, orientation }).catch(
              () => [] as PexelsVideo[],
            ),
          ),
        );
        const out: PexelsVideo[] = [];
        for (let k = 0; k < Math.max(...lists.map((l) => l.length), 0); k++) {
          for (const l of lists) if (l[k]) out.push(l[k]);
        }
        return out;
      };
      let cands = await fetchCands(1);
      let page = 1;
      let ptr = 0;
      let rejPeople = 0;
      for (let shot = 0; shot < nShots; shot++) {
        let done = false;
        while (!done) {
          if (ptr >= cands.length) {
            if (page >= 3) break;
            page++;
            cands = await fetchCands(page);
            ptr = 0;
            if (!cands.length) break;
          }
          const c = cands[ptr++];
          if (usedElsewhere(c)) continue;
          usedPexelsIds.add(c.id); // giữ chỗ ngay (beat khác chạy song song)
          const tag = `b${String(b.i).padStart(2, "0")}-${String(shot).padStart(2, "0")}`;
          const tmpDl = path.join(pexelsDir, `.dl-${slug}-${tag}.mp4`);
          try {
            await downloadPexelsVideo(c.fileUrl, tmpDl);
          } catch {
            usedPexelsIds.delete(c.id);
            continue;
          }
          if (PEOPLE_CHECK && (await clipHasPeople(tmpDl))) {
            fs.rmSync(tmpDl, { force: true });
            rejPeople++;
            continue;
          }
          const rel = `${pexelsSub}/${slug}-${tag}.mp4`;
          prepPexels(tmpDl, path.join(footageDir, rel), outW, outH, shotLen);
          fs.rmSync(tmpDl, { force: true });
          newIds.push(c.id);
          beatClips[b.i].push(rel);
          attributions.push({ file: rel, author: c.author, url: c.authorUrl });
          pexelsUsed++;
          done = true;
        }
        if (!done) break; // hết ứng viên → phần còn lại lấp bằng clip đã có của beat
      }
      // Thiếu shot → lặp lại clip của chính beat (vẫn đúng ý) cho đủ thời lượng.
      const got = beatClips[b.i].length;
      if (got > 0 && got < nShots) {
        for (let k = got; k < nShots; k++) beatClips[b.i].push(beatClips[b.i][k % got]);
      }
      report.push({
        beat: `#${b.i} ${fmtMmSs(b.startSec)} ${sl.label}`,
        idea: sl.idea,
        queries: sl.queries,
        match: `${got}/${nShots} shot × ${shotLen.toFixed(1)}s${rejPeople ? ` [bỏ ${rejPeople} clip có người]` : ""}`,
        clips: beatClips[b.i],
        score: 0,
      });
      console.log(`  #${b.i} [${fmtMmSs(b.startSec)}] ${sl.label} → ${got}/${nShots} shot  (${sl.queries.join(" | ")})`);
    };

    // Pool song song theo beat.
    let next = 0;
    await Promise.all(
      Array.from({ length: Math.min(BEAT_CONCURRENCY, timedBeats.length) }, async () => {
        while (next < timedBeats.length) await fillBeat(timedBeats[next++]);
      }),
    );
    // Beat trắng (không tải được clip nào) → mượn clip beat trước để không hụt thời lượng.
    for (let k = 0; k < timedBeats.length; k++) {
      if (!beatClips[k].length) {
        const prev = beatClips.slice(0, k).reverse().find((x) => x.length) ?? beatClips.find((x) => x.length) ?? [];
        const nShots = Math.max(1, Math.round((timedBeats[k].endSec - timedBeats[k].startSec) / shotSec));
        for (let n = 0; n < nShots && prev.length; n++) beatClips[k].push(prev[n % prev.length]);
        console.warn(`[footage-plan] ⚠ beat #${k} không có clip → mượn clip beat lân cận`);
      }
    }
    chosen.push(...beatClips.flat());
    report.sort((a, b) => String(a.beat).localeCompare(String(b.beat), undefined, { numeric: true }));
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
      const cands = await searchPexelsVideos(b.query, { perPage: 40, minHeight: 1080, orientation });
      if (!cands.length) {
        report.push({ beat: b.label, query: b.query, match: "pexels:none", score: 0 });
        continue;
      }
      // Duyệt ứng viên: bỏ id đã dùng + (nếu bật) loại clip có người.
      let pick: PexelsVideo | null = null;
      let rejPeople = 0;
      for (const c of cands) {
        if (usedElsewhere(c)) continue;
        const tmpDl = path.join(pexelsDir, `.dl-${slug}-${i}.mp4`);
        await downloadPexelsVideo(c.fileUrl, tmpDl);
        if (PEOPLE_CHECK && (await clipHasPeople(tmpDl))) {
          fs.rmSync(tmpDl, { force: true });
          rejPeople++;
          continue;
        }
        pick = c;
        const rel = `${pexelsSub}/${slug}-${String(i).padStart(2, "0")}.mp4`;
        const outAbs = path.join(footageDir, rel);
        prepPexels(tmpDl, outAbs, outW, outH);
        fs.rmSync(tmpDl, { force: true });
        usedPexelsIds.add(c.id);
        newIds.push(c.id);
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
    orientation,
    beats: report,
    footage: chosen,
    pexelsAttributions: attributions,
  };
  const planPath = path.resolve("tmp", `${slug}${sfx}.footage-plan.json`);
  fs.writeFileSync(planPath, JSON.stringify(plan, null, 2));
  console.log(`\n[footage-plan] ✓ ${planPath}`);
  console.log(`  local dùng: ${chosen.filter((c) => !c.startsWith(`${pexelsSub}/`)).length}, pexels: ${pexelsUsed}`);
  report.forEach((r) => console.log(`   • ${r.beat.padEnd(24)} ${r.match}`));

  if (opts.apply) {
    for (const id of newIds) ledger.ids[String(id)] = ledgerKey;
    fs.writeFileSync(USED_LEDGER, JSON.stringify(ledger, null, 2));
    // Đọc LẠI config ngay trước khi ghi: chạy footage-plan mất vài phút, trong
    // lúc đó user có thể đã sửa tập trên UI (vd upload cover) → không ghi đè.
    const latest: EpisodeConfig = fs.existsSync(jsonPath)
      ? EpisodeConfigSchema.parse(JSON.parse(fs.readFileSync(jsonPath, "utf-8")))
      : episode;
    const authors = [...new Set(attributions.map((a) => a.author.trim()).filter(Boolean))];
    const credit = authors.length ? `Footage: ${authors.join(", ")} (Pexels)` : null;
    if (landscape) {
      // Credit riêng cho bản YouTube (footageCredit giữ cho bản FB).
      latest.footageLandscape = chosen;
      latest.footageCreditLandscape = credit;
      if (credit) console.log(`  YouTube credit: ${credit}`);
    } else {
      latest.footage = chosen;
      latest.footageCredit = credit;
    }
    fs.writeFileSync(jsonPath, JSON.stringify(latest, null, 2));
    // Dọn clip Pexels cũ của slug không còn dùng (chạy lại footage-plan).
    const keep = new Set(chosen.map((c) => path.basename(c)));
    for (const f of fs.readdirSync(pexelsDir)) {
      if (f.startsWith(`${slug}-`) && !keep.has(f)) fs.rmSync(path.join(pexelsDir, f), { force: true });
    }
    console.log(
      `[footage-plan] ✓ đã ghi episode.${landscape ? "footageLandscape" : "footage"} (${chosen.length}) vào ${jsonPath}`,
    );
    if (attributions.length) {
      console.log(`  ⚠ Ghi công Pexels trong caption: ${attributions.map((a) => a.author).join(", ")}`);
    }
  } else {
    console.log(`[footage-plan] (dry-run) thêm --apply để ghi vào episode.${landscape ? "footageLandscape" : "footage"}`);
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
    console.error(
      "Usage: npx tsx podcast/scripts/footage-plan.ts <slug> [--all-pexels|--landscape] [--brief] [--shotlist=<file>] [--apply] [--max-pexels=N]",
    );
    process.exit(1);
  }
  const apply = process.argv.includes("--apply");
  const allPexels = process.argv.includes("--all-pexels");
  const landscape = process.argv.includes("--landscape");
  const brief = process.argv.includes("--brief");
  const sl = process.argv.find((a) => a.startsWith("--shotlist="));
  const mp = process.argv.find((a) => /^--max-pexels=\d+$/.test(a));
  // Lưới an toàn: nếu event loop cạn khi plan chưa xong (promise treo) → báo lỗi
  // + exit 1 thay vì thoát im lặng exit 0 mà chưa ghi episode.
  let finished = false;
  process.on("beforeExit", () => {
    if (!finished) {
      console.error("[footage-plan] FAIL: thoát giữa chừng (có tác vụ treo) — CHƯA ghi episode, chạy lại.");
      process.exit(1);
    }
  });
  generateFootagePlan(slug, {
    apply,
    allPexels,
    landscape,
    brief,
    shotlistPath: sl ? sl.slice("--shotlist=".length) : undefined,
    maxPexels: mp ? Number(mp.split("=")[1]) : undefined,
  })
    .then(() => {
      finished = true;
    })
    .catch((e: unknown) => {
      console.error("[footage-plan] FAIL:", e);
      process.exit(1);
    });
}
