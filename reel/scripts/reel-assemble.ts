/**
 * reel-assemble.ts — ráp reel 9:16 từ footage + audio master + caption (+ nhạc nền).
 *
 * Nguyên tắc: AUDIO LÀ MASTER TIMELINE. Video được ép cho khớp độ dài audio:
 * footage phát theo thứ tự user đã sắp (footage/.order.json), hết thì LẶP lại từ đầu,
 * clip cuối bị cắt đúng mốc audio. Mỗi clip scale/crop "cover" về 1080x1920 @30fps.
 *
 * v1 (chắc chắn): pre-render từng segment → concat → 1 pass cuối (cháy caption +
 * trộn nhạc nền ducking + mux audio master). Chưa làm: Ken Burns, film grain, xfade.
 *
 * Input:  work/<slug>.final.wav   (từ reel-align — bắt buộc)
 *         footage/*.mp4 + footage/.order.json  (thứ tự ghép)
 *         work/caption.srt         (tuỳ chọn — cháy chữ)
 *         reel/assets/music/*      (tuỳ chọn — nhạc nền, dùng file đầu tiên)
 * Output: out/<slug>.mp4
 *
 * Usage: npx tsx reel/scripts/reel-assemble.ts <slug>
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { Resvg } from "@resvg/resvg-js";

const W = 1080;
const H = 1920;
const FPS = 30;
const VIDEO_EXT_RE = /\.(mp4|mov|webm|mkv|m4v)$/i;
const AUDIO_EXT_RE = /\.(mp3|wav|m4a|aac|flac|ogg)$/i;

// Caption theo tông logo: chữ KEM, viền RƯỢU VANG dày (dễ đọc + đồng bộ con triện).
// Font Be Vietnam Pro — trùng font website (nạp từ reel/assets/fonts qua fontsdir).
// (ASS dùng BGR: cream #F4EBDD→&H00DDEBF4, wine #7A2230→&H0030227A)
const CAPTION_FONTS_DIR = "reel/assets/fonts";
const CAPTION_STYLE =
  "FontName=Be Vietnam Pro,FontSize=15,Bold=1,PrimaryColour=&H00DDEBF4,OutlineColour=&H0030227A,BorderStyle=1,Outline=4,Shadow=1,Alignment=2,MarginV=50";

// Branding overlay — logo nhỏ ở góc trên-trái (trong phần thân)
const LOGO_SVG = path.resolve("reel/assets/app-icon.svg");
const LOGO_WIDTH = 88; // px trong khung 1080
const LOGO_TOP = 44;
const LOGO_LEFT = 40;

// Intro (cover 3s đầu) + Outro (logo + website cuối) — thẻ nền màu thương hiệu.
const INTRO_SEC = 3;
const OUTRO_SEC = 3;
const CARD_LOGO_WIDTH = 300;
const APP_NAME = "Dòng Họ Việt";
const WEBSITE = "donghoviet.thaohk.com";
const CARD_BG = "0x7A2230"; // rượu vang (drawtext/lavfi dùng 0xRRGGBB)
const CARD_FG = "0xF4EBDD"; // kem
const CARD_GOLD = "0xC19A5B"; // vàng đồng (số tập)
const FONT_BOLD = path.resolve("reel/assets/fonts/BeVietnamPro-Bold.ttf");
const FONT_MED = path.resolve("reel/assets/fonts/BeVietnamPro-SemiBold.ttf");

// Nhạc nền: âm lượng nền, fade vào đầu, fade nhỏ dần ở cuối (tạo khoảng lặng suy ngẫm).
const MUSIC_VOLUME = 0.42;
const MUSIC_FADEIN_SEC = 1.5;
const MUSIC_FADEOUT_SEC = 5;
// EQ cho loa điện thoại: cắt trầm (loa nhỏ không tái tạo được) + nhấn dải mid cho piano nổi.
const MUSIC_HIGHPASS_HZ = 150; // bỏ dải dưới ngưỡng loa điện thoại → đỡ ù, thoáng headroom
const MUSIC_MID_HZ = 1800; // trung tâm dải mid cần nhấn
const MUSIC_MID_GAIN_DB = 4; // độ nhấn mid (dB) — tăng để rõ hơn, giảm nếu chói

const ensureDir = (p: string) => {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
};

const ffprobeMs = (file: string): number => {
  try {
    const out = execFileSync(
      "ffprobe",
      ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", file],
      { encoding: "utf-8" },
    ).trim();
    const sec = Number.parseFloat(out);
    return Number.isFinite(sec) ? Math.round(sec * 1000) : 0;
  } catch {
    return 0;
  }
};

const ffmpeg = (args: string[], label: string) => {
  console.log(`[assemble] ffmpeg: ${label}`);
  execFileSync("ffmpeg", args, { stdio: ["ignore", "inherit", "inherit"] });
};

/** Rasterize logo SVG → PNG (cache, regen khi SVG mới hơn). Trả path PNG hoặc null. */
const ensureLogoPng = (svgPath: string, width: number): string | null => {
  if (!fs.existsSync(svgPath)) return null;
  const cacheDir = path.resolve("reel/assets/.cache");
  ensureDir(cacheDir);
  const png = path.join(cacheDir, `app-icon-${width}.png`);
  const stale = !fs.existsSync(png) || fs.statSync(png).mtimeMs < fs.statSync(svgPath).mtimeMs;
  if (stale) {
    const resvg = new Resvg(fs.readFileSync(svgPath), {
      fitTo: { mode: "width", value: width },
    });
    fs.writeFileSync(png, resvg.render().asPng());
  }
  return png;
};

/** Dời toàn bộ mốc thời gian trong file .srt thêm offsetMs (để caption khớp khi thân bắt đầu sau intro). */
const shiftSrt = (src: string, offsetMs: number, out: string) => {
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  const fmt = (ms: number) =>
    `${pad(Math.floor(ms / 3_600_000))}:${pad(Math.floor((ms % 3_600_000) / 60_000))}:` +
    `${pad(Math.floor((ms % 60_000) / 1000))},${pad(ms % 1000, 3)}`;
  const shifted = fs
    .readFileSync(src, "utf-8")
    .replace(/(\d{2}):(\d{2}):(\d{2}),(\d{3})/g, (_m, h, m, s, ms) =>
      fmt(+h * 3_600_000 + +m * 60_000 + +s * 1000 + +ms + offsetMs),
    );
  fs.writeFileSync(out, shifted);
};

/** Ngắt chữ theo số ký tự tối đa mỗi dòng (giữ nguyên từ). */
const wrapText = (text: string, maxChars: number): string[] => {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    if (cur && (cur + " " + w).length > maxChars) {
      lines.push(cur);
      cur = w;
    } else {
      cur = cur ? `${cur} ${w}` : w;
    }
  }
  if (cur) lines.push(cur);
  return lines;
};

type CardLine = { text: string; y: number; size: number; font: string; color?: string };

/** Render 1 thẻ (intro/outro): nền màu thương hiệu + logo giữa + các dòng chữ căn giữa. */
const renderCard = (
  outPath: string,
  dur: number,
  logoPng: string | null,
  logoY: number,
  lines: CardLine[],
) => {
  const parts: string[] = [];
  let vlabel = "0:v";
  if (logoPng) {
    parts.push(`[0:v][1:v]overlay=x=(W-w)/2:y=${logoY}[c0]`);
    vlabel = "c0";
  }
  lines.forEach((ln, i) => {
    const esc = ln.text.replace(/'/g, "’"); // né dấu ' trong drawtext
    parts.push(
      `[${vlabel}]drawtext=fontfile=${ln.font}:text='${esc}':` +
      `fontcolor=${ln.color ?? CARD_FG}:fontsize=${ln.size}:x=(w-text_w)/2:y=${ln.y}[c${i + 1}]`,
    );
    vlabel = `c${i + 1}`;
  });
  ffmpeg(
    [
      "-y", "-hide_banner", "-loglevel", "error",
      "-f", "lavfi", "-i", `color=c=${CARD_BG}:s=${W}x${H}:r=${FPS}:d=${dur}`,
      ...(logoPng ? ["-loop", "1", "-i", logoPng] : []),
      "-filter_complex", parts.join(";"),
      "-map", `[${vlabel}]`,
      "-t", String(dur),
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p", "-an",
      outPath,
    ],
    `card ${path.basename(outPath)}`,
  );
};

/** Footage theo thứ tự đã lưu (.order.json); file mới xếp cuối alpha, file đã xoá loại. */
const orderedFootage = (footageDir: string): string[] => {
  if (!fs.existsSync(footageDir)) return [];
  const existing = fs
    .readdirSync(footageDir)
    .filter((f) => VIDEO_EXT_RE.test(f))
    .sort();
  const set = new Set(existing);
  let saved: string[] = [];
  const orderPath = path.join(footageDir, ".order.json");
  if (fs.existsSync(orderPath)) {
    try {
      const j = JSON.parse(fs.readFileSync(orderPath, "utf-8"));
      if (Array.isArray(j)) saved = (j as string[]).filter((n) => set.has(n));
    } catch {
      /* ignore */
    }
  }
  const seen = new Set(saved);
  return [...saved, ...existing.filter((n) => !seen.has(n))];
};

type Segment = { file: string; durMs: number };

/** Lấp đầy timeline audio (durationMs) bằng các clip theo thứ tự, lặp lại nếu thiếu. */
const planSegments = (
  clips: Array<{ file: string; durMs: number }>,
  durationMs: number,
): Segment[] => {
  const plan: Segment[] = [];
  let t = 0;
  let i = 0;
  const GUARD = 10000; // chặn vòng lặp vô hạn
  while (t < durationMs && plan.length < GUARD) {
    const clip = clips[i % clips.length];
    const remaining = durationMs - t;
    const segDur = Math.min(clip.durMs, remaining);
    if (segDur < 120) break; // đuôi quá ngắn (<120ms) → bỏ
    plan.push({ file: clip.file, durMs: segDur });
    t += segDur;
    i++;
  }
  return plan;
};

async function main() {
  const slug = process.argv[2];
  if (!slug) {
    console.error("Usage: npx tsx reel/scripts/reel-assemble.ts <slug>");
    process.exit(1);
  }
  const epDir = path.resolve("reel/episodes", slug);
  if (!fs.existsSync(epDir)) throw new Error(`Không thấy thư mục tập: ${epDir}`);

  const workDir = path.join(epDir, "work");
  const finalWav = path.join(workDir, `${slug}.final.wav`);
  if (!fs.existsSync(finalWav)) {
    throw new Error(
      `Chưa có ${slug}.final.wav — chạy Align trước (reel-align.ts) để tạo audio master.`,
    );
  }
  const footageDir = path.join(epDir, "footage");
  const footage = orderedFootage(footageDir);
  if (!footage.length) {
    throw new Error(`Không có footage trong ${footageDir}. Upload footage trước khi ráp.`);
  }

  const durationMs = ffprobeMs(finalWav);
  if (!durationMs) throw new Error(`Không đọc được độ dài ${finalWav}`);
  console.log(
    `[assemble] audio master: ${(durationMs / 1000).toFixed(1)}s · ${footage.length} footage clip`,
  );

  // độ dài từng clip
  const clips = footage
    .map((f) => ({ file: path.join(footageDir, f), durMs: ffprobeMs(path.join(footageDir, f)) }))
    .filter((c) => c.durMs > 0);
  if (!clips.length) throw new Error("Không clip footage nào đọc được độ dài (hỏng?).");
  const footTotal = clips.reduce((s, c) => s + c.durMs, 0);
  console.log(
    `[assemble] tổng footage ${(footTotal / 1000).toFixed(1)}s ` +
    `${footTotal < durationMs ? `(THIẾU → sẽ lặp ~${(durationMs / footTotal).toFixed(1)}×)` : "(đủ)"}`,
  );

  const plan = planSegments(clips, durationMs);
  console.log(`[assemble] ${plan.length} segment lấp đầy timeline`);

  // 1) pre-render từng segment về 1080x1920 @30fps (cover crop), không tiếng
  const segDir = path.join(workDir, "segments");
  fs.rmSync(segDir, { recursive: true, force: true });
  ensureDir(segDir);
  const listLines: string[] = [];
  plan.forEach((seg, idx) => {
    const out = path.join(segDir, `seg_${String(idx).padStart(3, "0")}.mp4`);
    ffmpeg(
      [
        "-y", "-hide_banner", "-loglevel", "error",
        "-i", seg.file,
        "-t", (seg.durMs / 1000).toFixed(3),
        "-an",
        "-vf",
        `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},fps=${FPS},setsar=1`,
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p",
        out,
      ],
      `segment ${idx + 1}/${plan.length} (${path.basename(seg.file)}, ${(seg.durMs / 1000).toFixed(1)}s)`,
    );
    listLines.push(`file '${out.replace(/'/g, "'\\''")}'`);
  });
  const listPath = path.join(segDir, "list.txt");
  fs.writeFileSync(listPath, listLines.join("\n") + "\n");

  // 2) nhạc nền (tuỳ chọn) — dùng file đầu tiên trong reel/assets/music
  const musicDir = path.resolve("reel/assets/music");
  const musicFile = fs.existsSync(musicDir)
    ? fs.readdirSync(musicDir).filter((f) => AUDIO_EXT_RE.test(f)).sort()[0]
    : undefined;
  const musicPath = musicFile ? path.join(musicDir, musicFile) : undefined;

  const captionPath = path.join(workDir, "caption.srt");
  const hasCaption = fs.existsSync(captionPath);

  // 3) branding: logo góc (thân) + logo lớn cho thẻ intro/outro
  const cornerLogo = ensureLogoPng(LOGO_SVG, LOGO_WIDTH);
  const cardLogo = ensureLogoPng(LOGO_SVG, CARD_LOGO_WIDTH);

  // đọc tiêu đề (H1) + số tập từ script.md → in lên thẻ cover
  const scriptMd = path.join(epDir, "script.md");
  const scriptTxt = fs.existsSync(scriptMd) ? fs.readFileSync(scriptMd, "utf-8") : "";
  const title = (scriptTxt.match(/^#\s+(.+)$/m)?.[1] ?? slug).trim();
  const epNum =
    scriptTxt.match(/\*\*\s*Tập\s*:?\s*\*\*\s*(\d+)/i)?.[1] ??
    scriptTxt.match(/\bTập\s+(\d+)\b/i)?.[1] ?? "";

  // thẻ intro (cover): logo + "TẬP NN · TÊN APP" (vàng) + tiêu đề (kem, ngắt dòng)
  const introMp4 = path.join(segDir, "_intro.mp4");
  const outroMp4 = path.join(segDir, "_outro.mp4");
  const brandLine = epNum
    ? `TẬP ${epNum.padStart(2, "0")} · ${APP_NAME.toUpperCase()}`
    : APP_NAME.toUpperCase();
  const introLines: CardLine[] = [
    { text: brandLine, y: 636, size: 34, font: FONT_MED, color: CARD_GOLD },
  ];
  wrapText(title, 20).slice(0, 3).forEach((ln, i) => {
    introLines.push({ text: ln, y: 726 + i * 78, size: 62, font: FONT_BOLD });
  });
  renderCard(introMp4, INTRO_SEC, cardLogo, 300, introLines);
  renderCard(outroMp4, OUTRO_SEC, cardLogo, 560, [
    { text: APP_NAME, y: 910, size: 74, font: FONT_BOLD },
    { text: WEBSITE, y: 1016, size: 44, font: FONT_MED, color: CARD_GOLD },
  ]);

  const introMs = INTRO_SEC * 1000;
  const dSec = durationMs / 1000;
  const totalSec = INTRO_SEC + dSec + OUTRO_SEC;
  const q = (p: string) => `file '${p.replace(/'/g, "'\\''")}'`;

  // 4) VIDEO track: ghép intro+segments+outro (concat DEMUXER) + caption (dời +INTRO) + logo góc.
  //    Làm RIÊNG với audio rồi mux — gộp chung 1 graph khiến audio bị cụt (concat-demuxer + loop).
  const wrapList = path.join(segDir, "wrap.txt");
  fs.writeFileSync(wrapList, [q(introMp4), ...listLines, q(outroMp4)].join("\n") + "\n");
  let srtArg: string | null = null;
  if (hasCaption) {
    const shifted = path.join(segDir, "caption.intro.srt");
    shiftSrt(captionPath, introMs, shifted);
    srtArg = path.relative(process.cwd(), shifted);
  }
  const vInputs: string[] = ["-f", "concat", "-safe", "0", "-i", wrapList];
  let vi = 1, cornerIdx = -1;
  if (cornerLogo) { vInputs.push("-loop", "1", "-i", cornerLogo); cornerIdx = vi++; }
  const vfc: string[] = [];
  let vb = "0:v";
  if (srtArg) {
    vfc.push(`[0:v]subtitles=${srtArg}:fontsdir=${CAPTION_FONTS_DIR}:force_style='${CAPTION_STYLE}'[vs]`);
    vb = "vs";
  }
  if (cornerIdx >= 0) {
    vfc.push(
      `[${vb}][${cornerIdx}:v]overlay=x=${LOGO_LEFT}:y=${LOGO_TOP}:` +
      `enable='between(t,${INTRO_SEC},${(INTRO_SEC + dSec).toFixed(3)})'[v]`,
    );
    vb = "v";
  }
  const fullV = path.join(segDir, "_full_v.mp4");
  ffmpeg(
    [
      "-y", "-hide_banner", "-loglevel", "error", "-stats",
      ...vInputs,
      ...(vfc.length ? ["-filter_complex", vfc.join(";")] : []),
      "-map", vb === "0:v" ? "0:v" : `[${vb}]`,
      "-an", "-t", totalSec.toFixed(3), "-r", String(FPS),
      "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p",
      fullV,
    ],
    "video (intro+thân+outro + caption + logo)",
  );

  // 5) AUDIO track: giọng trễ INTRO + pad tới total + nhạc (loop, ducking, fade in/out)
  const fullA = path.join(segDir, "_full_a.m4a");
  const aInputs: string[] = ["-i", finalWav];
  let ai = 1, musicAIdx = -1;
  if (musicPath) { aInputs.push("-i", musicPath); musicAIdx = ai++; }
  const afc: string[] = [];
  let aOut = "[voice]";
  if (musicPath) {
    const fadeIn = Math.min(MUSIC_FADEIN_SEC, INTRO_SEC).toFixed(2);
    const fadeStart = Math.max(0, totalSec - MUSIC_FADEOUT_SEC).toFixed(2);
    afc.push(`[0:a]adelay=${introMs}|${introMs},apad=whole_dur=${totalSec.toFixed(3)},asplit=2[voice][vsc]`);
    afc.push(
      `[${musicAIdx}:a]aloop=loop=-1:size=2147483647,volume=${MUSIC_VOLUME},` +
        `highpass=f=${MUSIC_HIGHPASS_HZ},` +
        `equalizer=f=${MUSIC_MID_HZ}:width_type=q:w=1.0:g=${MUSIC_MID_GAIN_DB}[bgl]`,
    );
    afc.push(`[bgl][vsc]sidechaincompress=threshold=0.08:ratio=3:attack=20:release=300[bgc]`);
    afc.push(
      `[bgc]afade=t=in:st=0:d=${fadeIn},afade=t=out:st=${fadeStart}:d=${MUSIC_FADEOUT_SEC.toFixed(2)}[bgd]`,
    );
    afc.push(`[voice][bgd]amix=inputs=2:normalize=0:duration=longest[a]`);
    aOut = "[a]";
  } else {
    afc.push(`[0:a]adelay=${introMs}|${introMs}[voice]`);
  }
  ffmpeg(
    [
      "-y", "-hide_banner", "-loglevel", "error",
      ...aInputs,
      "-filter_complex", afc.join(";"),
      "-map", aOut, "-t", totalSec.toFixed(3),
      "-c:a", "aac", "-b:a", "192k",
      fullA,
    ],
    "audio (giọng trễ + nhạc)",
  );

  // 6) mux video + audio (copy, không encode lại)
  const outDir = path.join(epDir, "out");
  ensureDir(outDir);
  const outPath = path.join(outDir, `${slug}.mp4`);
  console.log(
    `[assemble] mux: ${totalSec.toFixed(1)}s (intro ${INTRO_SEC}s + thân + outro ${OUTRO_SEC}s) · ` +
    `tiêu đề="${title}"${epNum ? ` · tập ${epNum}` : ""} · caption=${hasCaption ? "có" : "không"} · ` +
    `logo=${cornerLogo ? "có" : "không"} · nhạc=${musicFile ?? "không"}`,
  );
  ffmpeg(
    [
      "-y", "-hide_banner", "-loglevel", "error",
      "-i", fullV, "-i", fullA,
      "-map", "0:v", "-map", "1:a",
      "-c:v", "copy", "-c:a", "copy",
      "-movflags", "+faststart",
      outPath,
    ],
    "mux",
  );

  // dọn segment tạm
  if (!process.env.REEL_KEEP_TMP) fs.rmSync(segDir, { recursive: true, force: true });

  const outMs = ffprobeMs(outPath);
  console.log(
    `[assemble] ✓ ${path.relative(process.cwd(), outPath)} — ${(outMs / 1000).toFixed(1)}s, ${W}x${H}@${FPS}`,
  );
}

main().catch((e: unknown) => {
  console.error("[reel-assemble] FAIL:", e);
  process.exit(1);
});
