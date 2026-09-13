/**
 * reel/server/routes.ts — API cho pipeline reel, mount tại /api/reel.
 *
 * Cô lập tối đa với Studio: align/assemble chạy bằng spawn `npx tsx reel/scripts/...`
 * (KHÔNG import vào server) → sửa script không làm tsx watch reload server.
 *
 * Endpoints:
 *   GET  /                       → danh sách tập + trạng thái
 *   GET  /:slug                  → chi tiết tập (khối TTS, file, beats)
 *   POST /:slug/upload           → multipart: kind=audio|footage|music, files[]
 *   POST /:slug/file/delete      → { kind, name }
 *   GET  /run/:slug/:task        → SSE stream log chạy align|assemble
 *   GET  /file/:slug/:bucket/:name → serve file (range) cho player/preview
 */
import path from "node:path";
import fs from "node:fs";
import fsp from "node:fs/promises";
import { spawn, execFileSync } from "node:child_process";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { chat, type LLMProvider } from "../../shared/studio-core/llm-providers";
import { safeParseJson } from "../../shared/lib/safe-json";

const REEL_DIR = path.resolve("reel");
const EP_DIR = path.join(REEL_DIR, "episodes");
const MUSIC_DIR = path.join(REEL_DIR, "assets", "music");

const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;
const AUDIO_EXT_RE = /\.(wav|mp3|m4a|aac|flac|ogg)$/i;
const VIDEO_EXT_RE = /\.(mp4|mov|webm|mkv|m4v)$/i;

const ensureDir = (p: string) => {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
};

const safeSlug = (s: string): string | null => (SLUG_RE.test(s) ? s : null);

/** Chống path traversal: chỉ tên file phẳng, không "/" không ".." */
const safeName = (s: string): string | null =>
  s && !s.includes("/") && !s.includes("..") && !s.startsWith(".") ? s : null;

const sanitizeUpload = (name: string): string =>
  path.basename(name).replace(/[^a-zA-Z0-9._-]/g, "_");

/** Tránh ghi đè: nếu tên đã có, thêm -2, -3… */
const uniqueName = (dir: string, name: string): string => {
  if (!fs.existsSync(path.join(dir, name))) return name;
  const ext = path.extname(name);
  const base = name.slice(0, name.length - ext.length);
  let i = 2;
  while (fs.existsSync(path.join(dir, `${base}-${i}${ext}`))) i++;
  return `${base}-${i}${ext}`;
};

const extFromContentType = (ct: string): string | null => {
  const t = ct.split(";")[0].trim().toLowerCase();
  return t === "video/mp4" ? "mp4"
    : t === "video/quicktime" ? "mov"
    : t === "video/webm" ? "webm"
    : t.startsWith("video/") ? "mp4"
    : t === "audio/mpeg" ? "mp3"
    : t === "audio/wav" || t === "audio/x-wav" ? "wav"
    : t === "audio/mp4" || t === "audio/aac" ? "m4a"
    : null;
};

/**
 * Tải 1 URL media trực tiếp về `destDir`. Chấp nhận khi content-type là video/audio
 * HOẶC URL có đuôi hợp lệ (một số CDN trả octet-stream). Trả tên file đã lưu.
 * Ném lỗi nếu URL là trang HTML / không phải media.
 */
const downloadMedia = async (
  url: string,
  destDir: string,
  extRe: RegExp,
): Promise<string> => {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    throw new Error("URL không hợp lệ");
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    throw new Error("chỉ nhận http/https");
  }
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 120_000);
  let res: Response;
  try {
    res = await fetch(url, {
      signal: ac.signal,
      redirect: "follow",
      headers: { "user-agent": "Mozilla/5.0 reel-studio" },
    });
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
  const ct = res.headers.get("content-type") ?? "";
  const urlName = sanitizeUpload(decodeURIComponent(u.pathname.split("/").pop() ?? ""));

  const hasValidExt = extRe.test(urlName);
  const ctExt = extFromContentType(ct);
  const isMedia = ct.startsWith("video/") || ct.startsWith("audio/") || ct === "application/octet-stream";
  if (!hasValidExt && !ctExt) {
    throw new Error(
      ct.includes("html")
        ? "là trang web, không phải file — dùng link Download trực tiếp"
        : `không phải media (content-type: ${ct || "?"})`,
    );
  }
  if (!hasValidExt && !isMedia) {
    throw new Error(`content-type lạ: ${ct}`);
  }

  let name = hasValidExt ? urlName : `${(urlName.replace(/\.[^.]*$/, "") || "clip")}.${ctExt}`;
  ensureDir(destDir);
  name = uniqueName(destDir, name);
  await pipeline(
    Readable.fromWeb(res.body as Parameters<typeof Readable.fromWeb>[0]),
    fs.createWriteStream(path.join(destDir, name)),
  );
  return name;
};

// ---------- parse script.md → các khối TTS ----------

type SpeechPart = { label: string; text: string };

type ScriptBlocks = {
  scene: string;
  sampleContext: string;
  speaker: string;
  speech: string;
  speechParts: SpeechPart[];
};

/** Lấy nội dung khối ``` fenced ``` đầu tiên xuất hiện SAU dòng chứa `label`. */
const fencedAfter = (lines: string[], label: RegExp): string => {
  const start = lines.findIndex((l) => label.test(l));
  if (start === -1) return "";
  let i = start + 1;
  while (i < lines.length && !/^\s*```/.test(lines[i])) i++;
  if (i >= lines.length) return "";
  const out: string[] = [];
  for (i = i + 1; i < lines.length; i++) {
    if (/^\s*```/.test(lines[i])) break;
    out.push(lines[i]);
  }
  return out.join("\n").trim();
};

/** Lấy các dòng `> ...` NGAY SAU marker "Speech block" tới khi gặp `---`/heading. */
const speechAfter = (lines: string[]): string => {
  const start = lines.findIndex((l) => /speech block/i.test(l));
  if (start === -1) return "";
  const out: string[] = [];
  for (let i = start + 1; i < lines.length; i++) {
    const l = lines[i];
    if (/^\s*---\s*$/.test(l) || /^\s*#{1,6}\s/.test(l)) break;
    if (/^\s*>/.test(l)) out.push(l.replace(/^\s*>\s?/, "").trim());
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
};

/**
 * Tách lời đọc thành các PHẦN (để copy-paste từng lần vào Gemini TTS — giới hạn
 * ~1:30/lần). Ranh giới phần = dòng in đậm "**Phần N …**" / "**Part N …**".
 * Nếu không có nhãn phần nào → trả 1 phần chứa toàn bộ lời đọc.
 */
const PART_LABEL_RE = /^\s*\*\*\s*(?:Phần|Part)\s*\d+[^*]*\*\*/i;
const speechPartsAfter = (lines: string[]): SpeechPart[] => {
  const start = lines.findIndex((l) => /speech block/i.test(l));
  if (start === -1) return [];
  const parts: SpeechPart[] = [];
  let cur: SpeechPart | null = null;
  const flush = () => {
    if (cur) {
      cur.text = cur.text.replace(/\n{3,}/g, "\n\n").trim();
      if (cur.text) parts.push(cur);
    }
    cur = null;
  };
  for (let i = start + 1; i < lines.length; i++) {
    const l = lines[i];
    if (/^\s*---\s*$/.test(l) || /^\s*#{1,6}\s/.test(l)) break;
    if (PART_LABEL_RE.test(l)) {
      flush();
      cur = { label: l.replace(/\*\*/g, "").trim(), text: "" };
    } else if (/^\s*>/.test(l)) {
      if (!cur) cur = { label: "", text: "" };
      cur.text += l.replace(/^\s*>\s?/, "").trim() + "\n";
    }
  }
  flush();
  return parts;
};

const parseScript = (scriptMd: string): ScriptBlocks => {
  const lines = scriptMd.split(/\r?\n/);
  // Speaker: đoạn text sau dòng có "Speaker" tới heading/`---` kế tiếp.
  const spkStart = lines.findIndex((l) => /speaker\s*\/?\s*voice|^\s*\*\*speaker/i.test(l));
  let speaker = "";
  if (spkStart !== -1) {
    const buf: string[] = [];
    for (let i = spkStart + 1; i < lines.length; i++) {
      const l = lines[i];
      if (/^\s*---\s*$/.test(l) || /speech block/i.test(l)) break;
      if (l.trim()) buf.push(l.replace(/^\s*[-*]\s?/, "").trim());
    }
    speaker = buf.join("\n").trim();
  }
  return {
    scene: fencedAfter(lines, /\*\*scene\*\*|^\s*scene\b/i),
    sampleContext: fencedAfter(lines, /sample context/i),
    speaker,
    speech: speechAfter(lines),
    speechParts: speechPartsAfter(lines),
  };
};

// ---------- trạng thái tập ----------

/** Nhạc nền dùng chung cho mọi tập reel (reel/assets/music). */
const listMusic = (): string[] => listDirFiles(MUSIC_DIR, AUDIO_EXT_RE);

// Độ dài media (ms) qua ffprobe, cache theo mtime (tránh probe lại mỗi request).
const durCache = new Map<string, { mtimeMs: number; ms: number }>();
const probeDurationMs = (file: string): number => {
  try {
    const st = fs.statSync(file);
    const hit = durCache.get(file);
    if (hit && hit.mtimeMs === st.mtimeMs) return hit.ms;
    const out = execFileSync(
      "ffprobe",
      ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", file],
      { encoding: "utf-8" },
    ).trim();
    const sec = Number.parseFloat(out);
    const ms = Number.isFinite(sec) ? Math.round(sec * 1000) : 0;
    durCache.set(file, { mtimeMs: st.mtimeMs, ms });
    return ms;
  } catch {
    return 0;
  }
};

/** {name → ms} + tổng, cho 1 danh sách file trong 1 thư mục. */
const durationsFor = (fileDir: string, names: string[]) => {
  const map: Record<string, number> = {};
  let total = 0;
  for (const n of names) {
    const ms = probeDurationMs(path.join(fileDir, n));
    map[n] = ms;
    total += ms;
  }
  return { map, total };
};

const listAudioParts = (dir: string): string[] => {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => AUDIO_EXT_RE.test(f) && /^audio(_\d+)?\./i.test(f))
    .sort();
};

const listDirFiles = (dir: string, re?: RegExp): string[] => {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => (re ? re.test(f) : true)).sort();
};

// Thứ tự footage do user sắp xếp — lưu ở footage/.order.json (thứ tự này = thứ tự ghép video).
const ORDER_FILE = ".order.json";

const readFootageOrder = (footageDir: string): string[] => {
  const p = path.join(footageDir, ORDER_FILE);
  if (!fs.existsSync(p)) return [];
  try {
    const j = JSON.parse(fs.readFileSync(p, "utf-8"));
    return Array.isArray(j) ? (j as string[]) : [];
  } catch {
    return [];
  }
};

const writeFootageOrder = (footageDir: string, order: string[]): void => {
  ensureDir(footageDir);
  fs.writeFileSync(path.join(footageDir, ORDER_FILE), JSON.stringify(order, null, 2));
};

/** Footage theo thứ tự đã lưu; file mới (chưa có trong manifest) xếp cuối theo alpha, file đã xoá bị loại. */
const orderedFootage = (footageDir: string): string[] => {
  const existing = listDirFiles(footageDir, VIDEO_EXT_RE);
  const set = new Set(existing);
  const saved = readFootageOrder(footageDir).filter((n) => set.has(n));
  const seen = new Set(saved);
  const rest = existing.filter((n) => !seen.has(n));
  return [...saved, ...rest];
};

const episodeStatus = (slug: string) => {
  const dir = path.join(EP_DIR, slug);
  const workDir = path.join(dir, "work");
  const outDir = path.join(dir, "out");
  const footageDir = path.join(dir, "footage");
  const audio = listAudioParts(dir);
  const footage = orderedFootage(footageDir);
  const beatsPath = path.join(workDir, "beats.json");
  const out = listDirFiles(outDir, VIDEO_EXT_RE);
  let beatsInfo: { count: number; durationMs: number; alignedPct?: number } | null = null;
  if (fs.existsSync(beatsPath)) {
    try {
      const j = JSON.parse(fs.readFileSync(beatsPath, "utf-8"));
      beatsInfo = {
        count: Array.isArray(j.beats) ? j.beats.length : 0,
        durationMs: j.durationMs ?? 0,
        alignedPct: j.alignedPct,
      };
    } catch {
      beatsInfo = null;
    }
  }
  return {
    slug,
    hasScript: fs.existsSync(path.join(dir, "script.md")),
    hasShotList: fs.existsSync(path.join(dir, "shot-list.md")),
    audioParts: audio,
    footageCount: footage.length,
    footage,
    hasBeats: !!beatsInfo,
    beats: beatsInfo,
    hasCaption: fs.existsSync(path.join(workDir, "caption.srt")),
    output: out,
    finalAudio: listDirFiles(workDir, /\.final\.wav$/),
  };
};

// ---------- content-type + serve range ----------

const contentTypeFor = (name: string): string => {
  const ext = name.split(".").pop()?.toLowerCase();
  return ext === "mp4" || ext === "m4v" ? "video/mp4"
    : ext === "webm" ? "video/webm"
    : ext === "mov" ? "video/quicktime"
    : ext === "wav" ? "audio/wav"
    : ext === "mp3" ? "audio/mpeg"
    : ext === "m4a" || ext === "aac" ? "audio/mp4"
    : ext === "json" ? "application/json"
    : ext === "srt" || ext === "txt" ? "text/plain; charset=utf-8"
    : "application/octet-stream";
};

const serveFileWithRange = async (
  c: import("hono").Context,
  filePath: string,
): Promise<Response> => {
  let stat;
  try {
    stat = await fsp.stat(filePath);
  } catch {
    return c.json({ error: "File not found" }, 404);
  }
  const contentType = contentTypeFor(filePath);
  const range = c.req.header("range");
  if (range) {
    const m = range.match(/bytes=(\d+)-(\d+)?/);
    if (m) {
      const start = Number(m[1]);
      const end = m[2] ? Number(m[2]) : stat.size - 1;
      const chunkSize = end - start + 1;
      const fh = await fsp.open(filePath, "r");
      const buf = Buffer.alloc(chunkSize);
      await fh.read(buf, 0, chunkSize, start);
      await fh.close();
      return new Response(buf as unknown as BodyInit, {
        status: 206,
        headers: {
          "Content-Type": contentType,
          "Content-Range": `bytes ${start}-${end}/${stat.size}`,
          "Accept-Ranges": "bytes",
          "Content-Length": String(chunkSize),
        },
      });
    }
  }
  const buf = await fsp.readFile(filePath);
  return new Response(buf as unknown as BodyInit, {
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(stat.size),
      "Accept-Ranges": "bytes",
    },
  });
};

// ---------- routes ----------

export const reelRoutes = new Hono();

reelRoutes.get("/", (c) => {
  ensureDir(EP_DIR);
  const slugs = fs
    .readdirSync(EP_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && SLUG_RE.test(d.name))
    .map((d) => d.name)
    .sort();
  return c.json({ episodes: slugs.map(episodeStatus) });
});

reelRoutes.get("/:slug", (c) => {
  const slug = safeSlug(c.req.param("slug"));
  if (!slug) return c.json({ error: "invalid slug" }, 400);
  const dir = path.join(EP_DIR, slug);
  if (!fs.existsSync(dir)) return c.json({ error: "not found" }, 404);
  const scriptPath = path.join(dir, "script.md");
  const shotListPath = path.join(dir, "shot-list.md");
  const status = episodeStatus(slug);
  const blocks = fs.existsSync(scriptPath)
    ? parseScript(fs.readFileSync(scriptPath, "utf-8"))
    : { scene: "", sampleContext: "", speaker: "", speech: "", speechParts: [] };
  const shotList = fs.existsSync(shotListPath)
    ? fs.readFileSync(shotListPath, "utf-8")
    : "";
  const audioDur = durationsFor(dir, status.audioParts);
  const footageDur = durationsFor(path.join(dir, "footage"), status.footage);
  const scriptMd = fs.existsSync(scriptPath) ? fs.readFileSync(scriptPath, "utf-8") : "";
  const title = (scriptMd.match(/^#\s+(.+)$/m)?.[1] ?? slug).trim();
  return c.json({
    ...status,
    blocks,
    shotList,
    title,
    post: readPost(slug),
    music: listMusic(),
    durations: { audio: audioDur.map, footage: footageDur.map },
    audioDurationMs: audioDur.total,
    footageDurationMs: footageDur.total,
  });
});

/** Bài đăng fanpage (caption + hashtag) lưu ở episodes/<slug>/post.json. */
type ReelPost = { caption: string; hashtags: string[] };
const readPost = (slug: string): ReelPost => {
  const p = path.join(EP_DIR, slug, "post.json");
  if (fs.existsSync(p)) {
    try {
      const j = JSON.parse(fs.readFileSync(p, "utf-8"));
      return {
        caption: typeof j.caption === "string" ? j.caption : "",
        hashtags: Array.isArray(j.hashtags) ? j.hashtags : [],
      };
    } catch {
      /* ignore */
    }
  }
  return { caption: "", hashtags: [] };
};

const REEL_POST_SYSTEM = `Bạn là social editor cho app "Dòng Họ Việt" — ứng dụng lưu giữ gia phả, ký ức và câu chuyện gia đình Việt (donghoviet.thaohk.com). Chủ đề: gia đình, gốc rễ, tổ tiên, ông bà, nguồn cội, ký ức. Tone: ấm áp, chiêm nghiệm, mộc mạc, chạm cảm xúc.

Nhiệm vụ: viết caption + hashtags cho Facebook Reels theo cấu trúc THANG BẬC (staircase) khiến người xem dừng lại + để lại bình luận.

═══ CẤU TRÚC CAPTION (TIẾNG VIỆT) — 8-12 dòng ═══
DÒNG 1 — chính là TIÊU ĐỀ tập (hoặc paraphrase RẤT sát tiêu đề), có "…" cuối câu để dẫn dắt. BẮT BUỘC bám tiêu đề, không lấy câu mở của lời đọc.
DÒNG 2 — câu hỏi đóng đinh cho khán giả ("Theo bạn…?", "Bạn nghĩ sao…?").
DÒNG 3-6 — danh sách ngắn (mỗi dòng 1-4 từ) các lựa chọn đời thường, có "?" nếu là phỏng đoán.
DÒNG 7-9 — twist chiêm nghiệm đảo chiều: "Đôi khi, điều X không phải là Y. Mà là Z." với Z chạm nỗi niềm gia đình/gốc rễ.
DÒNG CUỐI — call-to-action hỏi mở buộc reply ("Nếu được hỏi ông bà một điều, bạn sẽ hỏi gì?"). KHÔNG dùng "comment/share".

═══ YÊU CẦU ═══
- Văn nói tự nhiên, câu 5-12 từ. KHÔNG sáo rỗng, KHÔNG "!", 0-1 emoji.
- KHÔNG nhúng hashtag trong caption.

═══ HASHTAGS (FB Reels) ═══
- ĐÚNG 4-5 hashtag, lowercase, không dấu, không space.
- BẮT BUỘC brand: donghoviet.
- 3-4 chủ đề gia đình/gia phả: giapha, giadinh, nguoncoi, totien, kyuc, ongba, coinguon, giatrigiadinh.
- TUYỆT ĐỐI KHÔNG dùng: bytecast, podcast, triethoc, tamlyhoc (đó là brand kênh khác).

═══ OUTPUT JSON ═══
{"caption":"…\\n… (8-12 dòng)","hashtags":["donghoviet", …]}
Chỉ trả JSON object, không markdown, không lời mở đầu.`;

/** Gen caption + hashtag cho fanpage Dòng Họ Việt (branding riêng, có tiêu đề). */
reelRoutes.post("/:slug/gen-post", async (c) => {
  const slug = safeSlug(c.req.param("slug"));
  if (!slug) return c.json({ error: "invalid slug" }, 400);
  const scriptPath = path.join(EP_DIR, slug, "script.md");
  if (!fs.existsSync(scriptPath)) return c.json({ error: "không thấy script.md" }, 404);
  const { provider, model } = await c.req.json<{ provider?: LLMProvider; model?: string }>();
  if (!provider || !model) return c.json({ error: "thiếu provider/model" }, 400);

  const md = fs.readFileSync(scriptPath, "utf-8");
  const title = (md.match(/^#\s+(.+)$/m)?.[1] ?? slug).trim();
  const narration = speechAfter(md.split(/\r?\n/)).slice(0, 2000);

  try {
    const raw = await chat({
      provider,
      model,
      systemPrompt: REEL_POST_SYSTEM,
      userContent: `TIÊU ĐỀ TẬP (dùng làm dòng 1): ${title}\n\nLời đọc (tham khảo nội dung):\n${narration}\n\nViết caption + hashtags cho Reels tập này. Trả JSON object.`,
      temperature: 0.85,
      jsonMode: true,
    });
    const parsed = safeParseJson<{ caption?: string; hashtags?: string[] }>(raw);
    if (typeof parsed.caption !== "string") {
      return c.json({ error: "LLM thiếu caption" }, 500);
    }
    const hashtags = Array.isArray(parsed.hashtags)
      ? parsed.hashtags
          .filter((h): h is string => typeof h === "string")
          .map((h) => h.replace(/^#/, "").trim().replace(/\s+/g, "").toLowerCase())
          .filter((h) => h && !["bytecast", "bytecasttech", "podcast", "triethoc", "tamlyhoc"].includes(h))
          .slice(0, 5)
      : [];
    return c.json({ caption: parsed.caption.trim(), hashtags });
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

reelRoutes.post("/:slug/post", async (c) => {
  const slug = safeSlug(c.req.param("slug"));
  if (!slug) return c.json({ error: "invalid slug" }, 400);
  const dir = path.join(EP_DIR, slug);
  if (!fs.existsSync(dir)) return c.json({ error: "episode not found" }, 404);
  const body = await c.req.json<{ caption?: string; hashtags?: string[] }>();
  const post: ReelPost = {
    caption: typeof body.caption === "string" ? body.caption : "",
    hashtags: Array.isArray(body.hashtags) ? body.hashtags.slice(0, 8) : [],
  };
  fs.writeFileSync(path.join(dir, "post.json"), JSON.stringify(post, null, 2));
  return c.json({ ok: true, post });
});

reelRoutes.post("/:slug/upload", async (c) => {
  const slug = safeSlug(c.req.param("slug"));
  if (!slug) return c.json({ error: "invalid slug" }, 400);
  const dir = path.join(EP_DIR, slug);
  if (!fs.existsSync(dir)) return c.json({ error: "episode not found" }, 404);

  const body = await c.req.parseBody({ all: true });
  const kind = String(body["kind"] ?? "");
  if (!["audio", "footage", "music"].includes(kind)) {
    return c.json({ error: "kind phải là audio|footage|music" }, 400);
  }
  const raw = body["files"];
  const files = (Array.isArray(raw) ? raw : [raw]).filter(
    (f): f is File => f instanceof File,
  );
  if (!files.length) return c.json({ error: "không có file" }, 400);

  const saved: string[] = [];
  if (kind === "audio") {
    // đánh số tiếp audio_NN theo thứ tự upload, giữ đuôi gốc
    const existing = listAudioParts(dir)
      .map((f) => Number(f.match(/^audio_(\d+)\./i)?.[1] ?? "0"))
      .filter((n) => n > 0);
    let next = existing.length ? Math.max(...existing) + 1 : 1;
    for (const f of files) {
      if (!AUDIO_EXT_RE.test(f.name)) continue;
      const ext = f.name.split(".").pop()!.toLowerCase();
      const name = `audio_${String(next).padStart(2, "0")}.${ext}`;
      await fsp.writeFile(path.join(dir, name), Buffer.from(await f.arrayBuffer()));
      saved.push(name);
      next++;
    }
  } else if (kind === "footage") {
    const fdir = path.join(dir, "footage");
    ensureDir(fdir);
    for (const f of files) {
      if (!VIDEO_EXT_RE.test(f.name)) continue;
      const name = sanitizeUpload(f.name);
      await fsp.writeFile(path.join(fdir, name), Buffer.from(await f.arrayBuffer()));
      saved.push(name);
    }
  } else {
    ensureDir(MUSIC_DIR);
    for (const f of files) {
      if (!AUDIO_EXT_RE.test(f.name)) continue;
      const name = sanitizeUpload(f.name);
      await fsp.writeFile(path.join(MUSIC_DIR, name), Buffer.from(await f.arrayBuffer()));
      saved.push(name);
    }
  }
  if (!saved.length) return c.json({ error: "không file nào hợp lệ (sai đuôi?)" }, 400);
  return c.json({ ok: true, saved, status: episodeStatus(slug) });
});

// ---------- Pexels: tìm footage dọc ngay trong app ----------

type PexelsVideoFile = {
  quality: string;
  file_type: string;
  width: number | null;
  height: number | null;
  link: string;
};
type PexelsVideo = {
  id: number;
  width: number;
  height: number;
  duration: number;
  image: string;
  url: string;
  user?: { name?: string };
  video_files: PexelsVideoFile[];
};

/**
 * Từ danh sách file của 1 video Pexels, chọn:
 *  - preview: bản NHỎ nhất (dọc nếu có) để xem thử nhanh trong app
 *  - download: bản lớn nhất nhưng cao ≤1920 (đủ nét cho reel 1080×1920), fallback bản lớn nhất
 */
const pickPexelsFiles = (v: PexelsVideo): { preview: string; download: string } => {
  const mp4 = v.video_files.filter((f) => f.file_type === "video/mp4" && f.link);
  const files = (mp4.length ? mp4 : v.video_files).filter((f) => f.link);
  const area = (f: PexelsVideoFile) => (f.width ?? 0) * (f.height ?? 0);
  const portrait = files.filter((f) => (f.height ?? 0) >= (f.width ?? 0));
  const pool = portrait.length ? portrait : files;
  const sorted = [...pool].sort((a, b) => area(a) - area(b));
  const capped = sorted.filter((f) => (f.height ?? 0) <= 1920);
  const dl = capped.length ? capped[capped.length - 1] : sorted[sorted.length - 1];
  return { preview: sorted[0]?.link ?? "", download: dl?.link ?? "" };
};

/**
 * Tìm video dọc trên Pexels (proxy để giấu API key + trả về link preview/download đã chọn sẵn).
 * GET /footage/search?q=...&page=1  → { videos: [{id,duration,image,url,author,preview,download}], hasMore, total }
 */
reelRoutes.get("/footage/search", async (c) => {
  const key = process.env.PEXELS_API_KEY ?? "";
  if (!key) return c.json({ error: "Thiếu PEXELS_API_KEY trong .env" }, 500);
  const q = (c.req.query("q") ?? "").trim();
  if (!q) return c.json({ error: "thiếu q" }, 400);
  const page = Math.max(1, Math.floor(Number(c.req.query("page") ?? "1")) || 1);
  const perPage = 15;
  const api = `https://api.pexels.com/videos/search?query=${encodeURIComponent(q)}&orientation=portrait&per_page=${perPage}&page=${page}`;

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 20_000);
  let res: Response;
  try {
    res = await fetch(api, { headers: { Authorization: key }, signal: ac.signal });
  } catch (e) {
    return c.json({ error: `Pexels lỗi mạng: ${e instanceof Error ? e.message : String(e)}` }, 502);
  } finally {
    clearTimeout(timer);
  }
  if (res.status === 401) return c.json({ error: "PEXELS_API_KEY không hợp lệ" }, 502);
  if (res.status === 429) return c.json({ error: "Pexels hết quota (thử lại sau)" }, 429);
  if (!res.ok) return c.json({ error: `Pexels HTTP ${res.status}` }, 502);

  const data = (await res.json()) as {
    videos?: PexelsVideo[];
    total_results?: number;
    page?: number;
    per_page?: number;
  };
  const videos = (data.videos ?? [])
    .map((v) => {
      const { preview, download } = pickPexelsFiles(v);
      return {
        id: v.id,
        duration: v.duration,
        width: v.width,
        height: v.height,
        image: v.image,
        url: v.url,
        author: v.user?.name ?? "",
        preview,
        download,
      };
    })
    .filter((v) => v.download);
  const total = data.total_results ?? 0;
  return c.json({
    q,
    page,
    perPage,
    total,
    hasMore: page * perPage < total,
    videos,
  });
});

/** Tải footage/nhạc từ danh sách URL trực tiếp (Pexels/Pixabay/Mixkit link Download). */
reelRoutes.post("/:slug/download", async (c) => {
  const slug = safeSlug(c.req.param("slug"));
  if (!slug) return c.json({ error: "invalid slug" }, 400);
  const dir = path.join(EP_DIR, slug);
  if (!fs.existsSync(dir)) return c.json({ error: "episode not found" }, 404);

  const { kind, urls } = await c.req.json<{ kind: string; urls: string[] }>();
  if (!["footage", "music"].includes(kind)) {
    return c.json({ error: "kind phải là footage|music" }, 400);
  }
  const list = (Array.isArray(urls) ? urls : []).map((s) => String(s).trim()).filter(Boolean);
  if (!list.length) return c.json({ error: "không có URL" }, 400);

  const destDir = kind === "footage" ? path.join(dir, "footage") : MUSIC_DIR;
  const extRe = kind === "footage" ? VIDEO_EXT_RE : AUDIO_EXT_RE;
  const saved: string[] = [];
  const failed: Array<{ url: string; error: string }> = [];
  for (const url of list) {
    try {
      saved.push(await downloadMedia(url, destDir, extRe));
    } catch (e) {
      failed.push({ url, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return c.json({ ok: saved.length > 0, saved, failed, status: episodeStatus(slug) });
});

/**
 * Sắp xếp lại thứ tự audio part. Thứ tự audio nằm trong TÊN FILE (align đọc audio_NN
 * theo số) nên đổi tên lại → audio_01…audio_0N theo `order`. Rename qua tên tạm để
 * tránh đụng tên đích. Body: { order: string[] }.
 */
reelRoutes.post("/:slug/audio/reorder", async (c) => {
  const slug = safeSlug(c.req.param("slug"));
  if (!slug) return c.json({ error: "invalid slug" }, 400);
  const { order } = await c.req.json<{ order: string[] }>();
  if (!Array.isArray(order)) return c.json({ error: "order phải là mảng" }, 400);
  const dir = path.join(EP_DIR, slug);
  const existing = listAudioParts(dir);
  const set = new Set(existing);
  const clean = order.filter((n) => typeof n === "string" && set.has(n));
  // file nào bị bỏ sót → giữ lại, nối cuối theo thứ tự cũ (không được mất file)
  for (const n of existing) if (!clean.includes(n)) clean.push(n);

  // 1) đổi hết sang tên tạm (tránh đụng audio_0N ↔ audio_0M)
  const temps = clean.map((n, i) => {
    const ext = n.includes(".") ? n.slice(n.lastIndexOf(".") + 1).toLowerCase() : "wav";
    const tmp = `.reorder_${i}.${ext}`;
    fs.renameSync(path.join(dir, n), path.join(dir, tmp));
    return { tmp, ext };
  });
  // 2) tên tạm → tên đích audio_01…
  temps.forEach((t, i) => {
    const final = `audio_${String(i + 1).padStart(2, "0")}.${t.ext}`;
    fs.renameSync(path.join(dir, t.tmp), path.join(dir, final));
  });
  return c.json({ ok: true, status: episodeStatus(slug) });
});

/** Sắp xếp lại thứ tự footage (thứ tự ghép video). Body: { order: string[] }. */
reelRoutes.post("/:slug/footage/reorder", async (c) => {
  const slug = safeSlug(c.req.param("slug"));
  if (!slug) return c.json({ error: "invalid slug" }, 400);
  const { order } = await c.req.json<{ order: string[] }>();
  if (!Array.isArray(order)) return c.json({ error: "order phải là mảng" }, 400);
  const footageDir = path.join(EP_DIR, slug, "footage");
  const existing = new Set(listDirFiles(footageDir, VIDEO_EXT_RE));
  // chỉ giữ tên hợp lệ + tồn tại thật (chống rác/traversal)
  const clean = order.filter((n) => typeof n === "string" && existing.has(n));
  writeFootageOrder(footageDir, clean);
  return c.json({ ok: true, status: episodeStatus(slug) });
});

reelRoutes.post("/:slug/file/delete", async (c) => {
  const slug = safeSlug(c.req.param("slug"));
  if (!slug) return c.json({ error: "invalid slug" }, 400);
  const { kind, name } = await c.req.json<{ kind: string; name: string }>();
  const safe = safeName(name);
  if (!safe) return c.json({ error: "invalid name" }, 400);
  const dir = path.join(EP_DIR, slug);
  const target =
    kind === "audio" ? path.join(dir, safe)
    : kind === "footage" ? path.join(dir, "footage", safe)
    : kind === "music" ? path.join(MUSIC_DIR, safe)
    : null;
  if (!target) return c.json({ error: "invalid kind" }, 400);
  try {
    await fsp.unlink(target);
  } catch {
    return c.json({ error: "không xoá được (không tồn tại?)" }, 404);
  }
  return c.json({ ok: true, status: episodeStatus(slug) });
});

/** SSE: chạy reel-align hoặc reel-assemble, stream log realtime. */
reelRoutes.get("/run/:slug/:task", (c) => {
  const slug = safeSlug(c.req.param("slug"));
  const task = c.req.param("task");
  if (!slug) return c.json({ error: "invalid slug" }, 400);
  if (!["align", "assemble"].includes(task)) {
    return c.json({ error: "task phải là align|assemble" }, 400);
  }
  const scriptFile = task === "align" ? "reel-align.ts" : "reel-assemble.ts";
  const scriptPath = path.join(REEL_DIR, "scripts", scriptFile);

  return streamSSE(c, async (stream) => {
    let id = 0;
    const send = (event: string, data: unknown) =>
      stream.writeSSE({ event, data: JSON.stringify(data), id: String(++id) });

    if (!fs.existsSync(scriptPath)) {
      await send("error", { message: `${scriptFile} chưa được build.` });
      await send("done", { code: 1 });
      return;
    }
    await send("log", { line: `$ npx tsx reel/scripts/${scriptFile} ${slug}` });

    const child = spawn("npx", ["tsx", `reel/scripts/${scriptFile}`, slug], {
      cwd: path.resolve("."),
      env: process.env,
    });

    const queue: Array<{ event: string; data: unknown }> = [];
    let resume: (() => void) | null = null;
    const wake = () => { const r = resume; resume = null; r?.(); };
    const push = (event: string, data: unknown) => { queue.push({ event, data }); wake(); };

    const onData = (buf: Buffer) => {
      for (const line of buf.toString("utf-8").split(/\r?\n/)) {
        if (line.trim()) push("log", { line });
      }
    };
    child.stdout.on("data", onData);
    child.stderr.on("data", onData);

    let exited = false;
    let exitCode = 0;
    child.on("close", (code) => {
      exitCode = code ?? 0;
      exited = true;
      push("status", { status: episodeStatus(slug) });
      wake();
    });

    stream.onAbort(() => {
      if (!exited) child.kill("SIGTERM");
      exited = true;
      wake();
    });

    // drain loop
    while (!exited || queue.length) {
      if (!queue.length) {
        await new Promise<void>((r) => { resume = r; });
        continue;
      }
      const item = queue.shift()!;
      await send(item.event, item.data);
    }
    await send("done", { code: exitCode });
  });
});

/** Thumbnail 1 khung hình của footage (ffmpeg), cache ở footage/.thumbs/<name>.jpg. */
reelRoutes.get("/:slug/thumb/:name", async (c) => {
  const slug = safeSlug(c.req.param("slug"));
  const name = safeName(c.req.param("name"));
  if (!slug || !name || !VIDEO_EXT_RE.test(name)) {
    return c.json({ error: "invalid path" }, 400);
  }
  const src = path.join(EP_DIR, slug, "footage", name);
  if (!fs.existsSync(src)) return c.json({ error: "not found" }, 404);

  const thumbsDir = path.join(EP_DIR, slug, "footage", ".thumbs");
  const out = path.join(thumbsDir, `${name}.jpg`);
  const stale =
    !fs.existsSync(out) ||
    fs.statSync(out).mtimeMs < fs.statSync(src).mtimeMs;
  if (stale) {
    ensureDir(thumbsDir);
    const durSec = probeDurationMs(src) / 1000;
    const seek = Math.max(0, Math.min(2, durSec / 2)).toFixed(2);
    try {
      execFileSync(
        "ffmpeg",
        ["-y", "-ss", seek, "-i", src, "-frames:v", "1",
         "-vf", "scale=-2:240", "-q:v", "4", out],
        { stdio: ["ignore", "ignore", "ignore"] },
      );
    } catch {
      return c.json({ error: "thumbnail failed" }, 500);
    }
  }
  try {
    const buf = await fsp.readFile(out);
    return new Response(buf as unknown as BodyInit, {
      headers: { "Content-Type": "image/jpeg", "Cache-Control": "no-cache" },
    });
  } catch {
    return c.json({ error: "not found" }, 404);
  }
});

reelRoutes.get("/:slug/file/:bucket/:name", async (c) => {
  const slug = safeSlug(c.req.param("slug"));
  const bucket = c.req.param("bucket");
  const name = safeName(c.req.param("name"));
  if (!slug || !name) return c.json({ error: "invalid path" }, 400);
  const dir = path.join(EP_DIR, slug);
  const filePath =
    bucket === "audio" ? path.join(dir, name)
    : bucket === "footage" ? path.join(dir, "footage", name)
    : bucket === "work" ? path.join(dir, "work", name)
    : bucket === "out" ? path.join(dir, "out", name)
    : bucket === "music" ? path.join(MUSIC_DIR, name)
    : null;
  if (!filePath) return c.json({ error: "invalid bucket" }, 400);
  return serveFileWithRange(c, filePath);
});
