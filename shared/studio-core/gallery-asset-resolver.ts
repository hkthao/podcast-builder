/**
 * Gallery asset resolver — Documentary direction Phase 3.
 *
 * Dispatch theo `beat.assetType`:
 *   - archive → Wikimedia Commons (no key, free)
 *   - stock   → Pexels API (PEXELS_API_KEY)
 *   - ai      → Draw Things manual workflow:
 *               Pass 1: ghi `<hash>.prompt.txt` vào cache + scan ~/Downloads
 *                       cho file đã user gen.
 *               Pass 2 (re-run resolve sau khi user save ảnh): scan tìm
 *                       `<hash>.{png,jpg,webp}` trong cache hoặc Downloads.
 *   - motion  → trả placeholder "motion:<recipe>", Remotion render dispatch
 *               theo recipe name (motion recipes implement ở phase sau).
 *
 * Cache layout:
 *   tmp/gallery-assets/<planId>/<hash>.<ext>
 *   tmp/gallery-assets/<planId>/<hash>.prompt.txt   (cho AI pending)
 *
 * Hash deterministic theo (planId, chapterIdx, beatSentenceIdx, beatOrdinal,
 * assetType, queryOrPrompt). Cache reuse cao cho archive/stock chia sẻ
 * query; AI có ordinal trong sentence để 2 beat AI khác nhau ra ảnh khác.
 *
 * Mode pure: resolver KHÔNG mutate plan, chỉ trả ResolveResult. Caller
 * (Phase 4 UI / Phase 4 server route) lưu metadata vào plan/DB.
 */
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  classifyBeatSync,
  loadKnowledgeGraph,
  type KnowledgeGraph,
} from "../../gallery/src/shot-heuristic";
import type { Shot } from "../../gallery/src/shot";
import { getApiKey } from "./api-keys-store";
import type { AssetProvider, AssetResult } from "./asset-sources/types";
import { pixabayProvider } from "./asset-sources/pixabay";
import { coverrProvider } from "./asset-sources/coverr";

// ── Public types ─────────────────────────────────────────────────────────

export type ResolverOptions = {
  /** Root cache dir — default `tmp/gallery-assets/<planId>/`. */
  cacheDir: string;
  /**
   * Stock backend keys cho assetType="stock". Resolver thử theo thứ tự
   * Pexels → Pixabay → Coverr, chỉ nguồn nào có key. Cần ≥1 key.
   */
  pexelsKey?: string;
  pixabayKey?: string;
  coverrKey?: string;
  /**
   * Folder để watch file ảnh user gen từ Draw Things. Default ~/Downloads.
   * Resolver scan folder này tìm `<hash>.{png,jpg,webp}` → copy về cacheDir
   * nếu tìm thấy.
   */
  drawThingsWatchDir?: string;
  /** Resolution target — Pexels picks file gần với chiều này nhất. */
  width: number;
  height: number;
};

export type AssetSource =
  | "wikimedia"
  | "pexels"
  | "pixabay"
  | "coverr"
  | "drawthings"
  | "motion";

export type ResolvedAsset = {
  beatIdx: number;
  /** Local file path hoặc "motion:<recipe>" placeholder. */
  localPath: string;
  /**
   * Remote URL của asset binary — Wikimedia thumb URL, Pexels download link.
   * Undefined cho AI (Draw Things local) + motion (no fetch). Phase 4 dùng
   * khi save vào gallery_assets table (cần fullUrl per AssetResult schema).
   */
  remoteUrl?: string;
  /** Resolved file là video (mp4) hay ảnh tĩnh (jpg/png). */
  isVideo: boolean;
  source: AssetSource;
  /** Metadata for credits scroll + lower-third + audit. */
  title?: string;
  author?: string;
  year?: string;
  license: string;
  /** URL gốc của source PAGE (Wikimedia file page, Pexels web page). */
  sourceUrl?: string;
  /**
   * Khi resolver buộc phải fallback từ source ưu tiên (vd archive 429) sang
   * source khác — đánh dấu để UI hiện badge "fallback" + audit log.
   */
  fallbackFrom?: "archive" | "stock";
  /** Lý do tại sao phải fallback — kèm khi fallbackFrom set. */
  fallbackReason?: string;
};

export type PendingBeat = {
  beatIdx: number;
  /** Hash khoá file → expected filename `<hash>.png` hoặc `<hash>.jpg`. */
  hash: string;
  /** Path tới `.prompt.txt` để user xem prompt. */
  promptPath: string;
  /** Prompt full text (cho UI hiển thị copy button). */
  prompt: string;
  /** Filename user nên save từ Draw Things — gợi ý chính xác. */
  expectedFilename: string;
};

export type FailedBeat = {
  beatIdx: number;
  reason: string;
};

export type ResolveResult = {
  resolved: ResolvedAsset[];
  pending: PendingBeat[];
  failed: FailedBeat[];
};

// ── Constants ────────────────────────────────────────────────────────────

const STYLE_SUFFIX_AI =
  "museum-quality oil painting style, cinematic lighting, " +
  "shallow depth of field, no text, no watermark, no modern objects, " +
  "photorealistic, 1920x1080 16:9";

const NEGATIVE_HINT =
  "Negative: text, watermark, modern objects, blurry, low quality, signature, logo";

const AI_IMAGE_EXTS = [".png", ".jpg", ".jpeg", ".webp"];

// ── Helpers ──────────────────────────────────────────────────────────────

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

function hashBeat(input: {
  planId: string;
  chapterIdx: number;
  beat: Shot;
  beatOrdinal: number;
  /** Source string đặc trưng — query Wikimedia, query Pexels, prompt AI, recipe motion. */
  source: string;
}): string {
  const raw =
    `${input.planId}|${input.chapterIdx}|${input.beat.sentenceIdx}|` +
    `${input.beatOrdinal}|${input.beat.assetType ?? "?"}|${input.source}`;
  return createHash("sha1").update(raw).digest("hex").slice(0, 16);
}

async function ensureDir(p: string): Promise<void> {
  await fs.mkdir(p, { recursive: true });
}

async function downloadToFile(url: string, dest: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`download ${url} ${res.status}`);
  }
  const bin = Buffer.from(await res.arrayBuffer());
  await fs.writeFile(dest, bin);
}

// ── Ratio fitness — ưu tiên asset gần 16:9 (giảm blur-letterbox) ──────────
//
// Video gallery là 16:9. Ảnh/clip dọc (chân dung tượng 2:3, ảnh vuông) khi
// fit "contain" sẽ để lộ viền blur 2 bên. Chấm điểm độ khớp tỉ lệ để selection
// ưu tiên landscape ~16:9; ảnh dọc bị phạt nặng nhưng vẫn dùng được nếu không
// còn lựa chọn (render blur-letterbox handle).
const TARGET_AR = 16 / 9;

function ratioFitness(w?: number, h?: number): number {
  if (!w || !h) return 0.5; // unknown dims → neutral
  const ar = w / h;
  return Math.max(0, 1 - Math.abs(ar - TARGET_AR) / TARGET_AR);
}

// ── Wikimedia Commons backend ────────────────────────────────────────────

type WikimediaResult = {
  url: string;
  title: string;
  author?: string;
  license?: string;
  sourceUrl?: string;
};

async function searchWikimedia(
  query: string,
  targetWidth: number,
): Promise<WikimediaResult | null> {
  // generator=search: tìm File: namespace (gsrnamespace=6) → 5 kết quả top
  // iiprop=url|extmetadata: lấy thumb URL theo iiurlwidth + license metadata
  const api =
    "https://commons.wikimedia.org/w/api.php?" +
    new URLSearchParams({
      action: "query",
      format: "json",
      generator: "search",
      gsrnamespace: "6",
      gsrlimit: "5",
      gsrsearch: query,
      prop: "imageinfo",
      iiprop: "url|extmetadata|size",
      iiurlwidth: String(targetWidth),
      origin: "*",
    }).toString();
  const res = await fetch(api, {
    headers: { "User-Agent": "podcast-builder/gallery (local dev)" },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as {
    query?: { pages?: Record<string, WikimediaPage> };
  };
  const pages = Object.values(data?.query?.pages ?? {});
  // Lọc ảnh hợp lệ (skip PDF/SVG diagram), rồi chọn ảnh có tỉ lệ gần 16:9 nhất
  // trong top kết quả — ưu tiên landscape thay vì lấy đại ảnh đầu (tượng dọc).
  const candidates = pages.filter((page) => {
    const info = page.imageinfo?.[0];
    if (!info) return false;
    return /\.(jpg|jpeg|png|webp)$/i.test(info.thumburl ?? info.url ?? "");
  });
  if (candidates.length === 0) return null;
  const best = [...candidates].sort((a, b) => {
    const ia = a.imageinfo![0];
    const ib = b.imageinfo![0];
    return ratioFitness(ib.width, ib.height) - ratioFitness(ia.width, ia.height);
  })[0]!;
  const info = best.imageinfo![0];
  const url = info.thumburl ?? info.url;
  if (!url) return null;
  const meta = info.extmetadata ?? {};
  return {
    url,
    title: best.title.replace(/^File:/, ""),
    author: meta.Artist?.value ? stripHtml(meta.Artist.value) : undefined,
    license: meta.LicenseShortName?.value ?? "Wikimedia Commons",
    sourceUrl: info.descriptionurl,
  };
}

function stripHtml(s: string): string {
  return s
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

type WikimediaPage = {
  pageid: number;
  title: string;
  imageinfo?: Array<{
    url?: string;
    thumburl?: string;
    descriptionurl?: string;
    width?: number;
    height?: number;
    extmetadata?: Record<string, { value: string }>;
  }>;
};

// ── Pexels backend ───────────────────────────────────────────────────────

type PexelsResult = {
  url: string;
  isVideo: boolean;
  title: string;
  author?: string;
  sourceUrl?: string;
};

async function searchPexels(
  query: string,
  opt: { apiKey: string; preferVideo: boolean; height: number },
): Promise<PexelsResult | null> {
  if (opt.preferVideo) {
    const r = await pexelsVideoSearch(query, opt);
    if (r) return r;
    // fallback to image
  }
  return pexelsImageSearch(query, opt.apiKey);
}

async function pexelsImageSearch(
  query: string,
  apiKey: string,
): Promise<PexelsResult | null> {
  const url =
    "https://api.pexels.com/v1/search?" +
    new URLSearchParams({
      query,
      per_page: "10",
      orientation: "landscape",
      size: "large",
    });
  const res = await fetch(url, { headers: { Authorization: apiKey } });
  if (!res.ok) return null;
  const data = (await res.json()) as {
    photos?: Array<{
      id: number;
      url: string;
      width?: number;
      height?: number;
      src: { original?: string; large2x?: string; large?: string };
      photographer?: string;
    }>;
  };
  const photos = data.photos ?? [];
  if (photos.length === 0) return null;
  // Ưu tiên ratio gần 16:9 nhất trong các kết quả landscape.
  const photo = [...photos].sort(
    (a, b) =>
      ratioFitness(b.width, b.height) - ratioFitness(a.width, a.height),
  )[0]!;
  const downloadUrl = photo.src.large2x ?? photo.src.original ?? photo.src.large;
  if (!downloadUrl) return null;
  return {
    url: downloadUrl,
    isVideo: false,
    title: `Pexels photo ${photo.id}`,
    author: photo.photographer,
    sourceUrl: photo.url,
  };
}

/**
 * Pexels video search với multi-candidate scoring.
 *
 * Strategy:
 *  - per_page 30 (cao hơn để hard-filter còn lại đủ candidates)
 *  - HARD filter: drop video < MIN_DUR_S (quá ngắn, freeze cuối khi loop)
 *  - Score:
 *      duration: ideal 10-20s (1 shot tài liệu thường 8-16s)
 *      resolution: video gốc width ≥ 1280 (tránh upscale, ≥720p)
 *  - Pick best score → file ≤ target height
 *
 * User feedback: video Pexels hay ngắn 3-5s không đủ cho 1 shot dài
 * (~10-15s). Min 6s + ideal 12s + loop trong render handle phần thiếu.
 */
const MIN_VIDEO_DURATION_S = 6;
const IDEAL_VIDEO_DURATION_S = 12;

async function pexelsVideoSearch(
  query: string,
  opt: { apiKey: string; height: number },
): Promise<PexelsResult | null> {
  const url =
    "https://api.pexels.com/videos/search?" +
    new URLSearchParams({
      query,
      per_page: "30",
      orientation: "landscape",
      size: "medium",
    });
  const res = await fetch(url, { headers: { Authorization: opt.apiKey } });
  if (!res.ok) return null;
  const data = (await res.json()) as {
    videos?: Array<{
      id: number;
      url: string;
      duration?: number;
      width?: number;
      height?: number;
      user?: { name?: string };
      video_files?: Array<{ link: string; height?: number; width?: number }>;
    }>;
  };
  const videos = data.videos ?? [];
  if (videos.length === 0) return null;

  // HARD filter: drop video < MIN_DUR_S (quá ngắn cho shot tài liệu)
  const candidates = videos.filter(
    (v) =>
      v.video_files &&
      v.video_files.length > 0 &&
      (v.duration ?? 0) >= MIN_VIDEO_DURATION_S,
  );

  // Nếu sau filter không còn ai → relax: chấp nhận video ngắn (sẽ loop).
  const pool = candidates.length > 0 ? candidates : videos.filter(
    (v) => v.video_files && v.video_files.length > 0,
  );
  if (pool.length === 0) return null;

  const scored = pool
    .map((v) => {
      const dur = v.duration ?? 0;
      // Duration ideal 12s. Range chấp nhận 6-25s phạt nhẹ. Khoảng cách
      // tới ideal giảm điểm linear, scale 18 (max diff trong 0..30s).
      const durScore = 1 - Math.min(1, Math.abs(dur - IDEAL_VIDEO_DURATION_S) / 18);
      // Resolution: ≥1280 = HD, < 1280 phạt
      const resScore = (v.width ?? 0) >= 1280 ? 1 : 0.5;
      // Ratio gần 16:9 → ưu tiên (giảm blur-letterbox khi render).
      const arScore = ratioFitness(v.width, v.height);
      return { video: v, score: durScore * 0.5 + resScore * 0.2 + arScore * 0.3 };
    })
    .sort((a, b) => b.score - a.score);

  const best = scored[0]?.video;
  if (!best?.video_files?.length) return null;

  // Pick file ≤ target height (gần target nhất, tránh upscale)
  const file = [...best.video_files].sort(
    (a, b) =>
      Math.abs((a.height ?? 0) - opt.height) -
      Math.abs((b.height ?? 0) - opt.height),
  )[0];
  return {
    url: file.link,
    isVideo: true,
    title: `Pexels video ${best.id} (${best.duration ?? "?"}s)`,
    author: best.user?.name,
    sourceUrl: best.url,
  };
}

// ── Pixabay / Coverr backends (tái dùng asset-source providers) ───────────
//
// Pexels giữ search inline (multi-file height selection riêng). Pixabay/Coverr
// gọi qua AssetProvider.search() rồi áp cùng heuristic scoring video (duration
// gần IDEAL, ≥720p) để chất lượng đồng nhất với Pexels path.

/** Chọn video AssetResult tốt nhất — giống scoring trong pexelsVideoSearch. */
function pickBestProviderVideo(results: AssetResult[]): AssetResult | null {
  const vids = results.filter((r) => r.kind === "video" && r.fullUrl);
  if (vids.length === 0) return null;
  const longEnough = vids.filter(
    (r) => (r.durationMs ?? 0) >= MIN_VIDEO_DURATION_S * 1000,
  );
  const pool = longEnough.length > 0 ? longEnough : vids;
  return [...pool]
    .map((r) => {
      const dur = (r.durationMs ?? 0) / 1000;
      const durScore =
        1 - Math.min(1, Math.abs(dur - IDEAL_VIDEO_DURATION_S) / 18);
      const resScore = (r.width ?? 0) >= 1280 ? 1 : 0.5;
      const arScore = ratioFitness(r.width, r.height);
      return { r, score: durScore * 0.5 + resScore * 0.2 + arScore * 0.3 };
    })
    .sort((a, b) => b.score - a.score)[0]!.r;
}

/** Search 1 provider (video-first → image fallback), trả PexelsResult shape. */
async function providerStockSearch(
  provider: AssetProvider,
  query: string,
  opt: { preferVideo: boolean },
): Promise<PexelsResult | null> {
  if (opt.preferVideo && provider.info.kinds.includes("video")) {
    try {
      const resp = await provider.search({ query, kind: "video", pageSize: 30 });
      const best = pickBestProviderVideo(resp.results);
      if (best) {
        return {
          url: best.fullUrl,
          isVideo: true,
          title: best.title,
          author: best.author,
          sourceUrl: best.sourcePage,
        };
      }
    } catch {
      /* fall through to image */
    }
  }
  if (provider.info.kinds.includes("image")) {
    try {
      const resp = await provider.search({ query, kind: "image", pageSize: 10 });
      const imgs = resp.results.filter((r) => r.kind === "image" && r.fullUrl);
      // Ưu tiên ratio gần 16:9 nhất.
      const img = [...imgs].sort(
        (a, b) => ratioFitness(b.width, b.height) - ratioFitness(a.width, a.height),
      )[0];
      if (img) {
        return {
          url: img.fullUrl,
          isVideo: false,
          title: img.title,
          author: img.author,
          sourceUrl: img.sourcePage,
        };
      }
    } catch {
      /* none */
    }
  }
  return null;
}

// ── Draw Things manual backend ───────────────────────────────────────────

/**
 * Build prompt cho Draw Things. Style suffix universal cho documentary
 * (museum-quality, no watermark, etc.). Ghép thêm aspect ratio hint.
 */
function buildAiPrompt(seed: string, kgHint?: string): string {
  const subject = (kgHint ?? seed).trim();
  return `${subject}, ${STYLE_SUFFIX_AI}`;
}

async function tryAttachAiFile(
  hash: string,
  cacheDir: string,
  watchDir: string | undefined,
): Promise<string | null> {
  // Pass 1: file đã trong cacheDir
  for (const ext of AI_IMAGE_EXTS) {
    const p = path.join(cacheDir, `${hash}${ext}`);
    if (await exists(p)) return p;
  }
  // Pass 2: scan watchDir (vd ~/Downloads) — copy file nếu thấy
  if (!watchDir) return null;
  for (const ext of AI_IMAGE_EXTS) {
    const candidate = path.join(watchDir, `${hash}${ext}`);
    if (await exists(candidate)) {
      const dest = path.join(cacheDir, `${hash}${ext}`);
      try {
        await fs.copyFile(candidate, dest);
        return dest;
      } catch {
        /* permission issue → fall through to pending */
      }
    }
  }
  return null;
}

async function writePromptFile(input: {
  hash: string;
  cacheDir: string;
  prompt: string;
  beatKeyword: string;
  expectedFilename: string;
}): Promise<string> {
  const promptPath = path.join(input.cacheDir, `${input.hash}.prompt.txt`);
  const body =
    `# Hash: ${input.hash}\n` +
    `# Beat keyword: ${input.beatKeyword}\n` +
    `# Lưu ảnh từ Draw Things với tên: ${input.expectedFilename}\n` +
    `# Vào thư mục: ${input.cacheDir}\n` +
    `# Hoặc Downloads — resolver sẽ tự copy về cache.\n` +
    `# ${NEGATIVE_HINT}\n\n` +
    `${input.prompt}\n`;
  await fs.writeFile(promptPath, body, "utf-8");
  return promptPath;
}

// ── Per-source attempt — pure helper, no fallback logic ──────────────────
//
// Extracted từ resolveOneBeat() để dispatcher có thể gọi cùng helper cho
// primary lẫn fallback source. Trả về `kind: "failed"` thay vì throw để
// caller dễ chain fallback mà không cần try/catch.

type SourceAttempt =
  | { kind: "resolved"; asset: ResolvedAsset }
  | { kind: "failed"; failed: FailedBeat };

async function attemptSource(
  source: "archive" | "stock",
  input: {
    planId: string;
    chapterIdx: number;
    beat: Shot;
    beatIdx: number;
    beatOrdinal: number;
    sentence: string;
    graph: import("../../gallery/src/shot-heuristic").KnowledgeGraph;
    options: ResolverOptions;
  },
  c: import("../../gallery/src/shot-heuristic").ClassifyResult,
): Promise<SourceAttempt> {
  const { beat, beatIdx, options } = input;

  if (source === "archive") {
    const query = beat.keyword.trim() || c.archiveQuery || "";
    if (!query) {
      return { kind: "failed", failed: { beatIdx, reason: "archive: thiếu query" } };
    }
    const hash = hashBeat({
      planId: input.planId,
      chapterIdx: input.chapterIdx,
      beat,
      beatOrdinal: input.beatOrdinal,
      source: query,
    });
    const outPath = path.join(options.cacheDir, `${hash}.jpg`);
    if (await exists(outPath)) {
      return {
        kind: "resolved",
        asset: {
          beatIdx,
          localPath: outPath,
          isVideo: false,
          source: "wikimedia",
          license: "Wikimedia Commons (cached)",
          title: c.lowerThird?.primary,
        },
      };
    }
    try {
      const r = await searchWikimedia(query, options.width);
      if (!r) {
        return {
          kind: "failed",
          failed: { beatIdx, reason: `Wikimedia không có ảnh cho "${query}"` },
        };
      }
      await downloadToFile(r.url, outPath);
      return {
        kind: "resolved",
        asset: {
          beatIdx,
          localPath: outPath,
          remoteUrl: r.url,
          isVideo: false,
          source: "wikimedia",
          title: r.title,
          author: r.author,
          license: r.license ?? "Wikimedia Commons",
          sourceUrl: r.sourceUrl,
        },
      };
    } catch (e) {
      return {
        kind: "failed",
        failed: { beatIdx, reason: `Wikimedia: ${(e as Error).message}` },
      };
    }
  }

  // source === "stock"
  // Stock backend chain: Pexels → Pixabay → Coverr (chỉ nguồn có key). Thử
  // lần lượt tới khi 1 nguồn trả kết quả; cần ≥1 key.
  type StockBackend = {
    source: AssetSource;
    license: string;
    run: () => Promise<PexelsResult | null>;
  };
  const preferVideo = true; // documentary: video-first mọi stock shot
  const query = beat.keyword.trim() || c.stockQuery || "";
  if (!query) {
    return { kind: "failed", failed: { beatIdx, reason: "stock: thiếu query" } };
  }
  // Thứ tự ưu tiên: Pixabay → Coverr → Pexels (chỉ nguồn có key).
  const backends: StockBackend[] = [];
  if (options.pixabayKey) {
    backends.push({
      source: "pixabay",
      license: "Pixabay License (free use, no credit required)",
      run: () => providerStockSearch(pixabayProvider, query, { preferVideo }),
    });
  }
  if (options.coverrKey) {
    backends.push({
      source: "coverr",
      license: "Coverr License (free use, no credit required)",
      run: () => providerStockSearch(coverrProvider, query, { preferVideo }),
    });
  }
  if (options.pexelsKey) {
    const pexelsKey = options.pexelsKey;
    backends.push({
      source: "pexels",
      license: "Pexels (free use, attribution recommended)",
      run: () =>
        searchPexels(query, { apiKey: pexelsKey, preferVideo, height: options.height }),
    });
  }
  if (backends.length === 0) {
    return {
      kind: "failed",
      failed: {
        beatIdx,
        reason: "stock: chưa cấu hình key nào (Pexels/Pixabay/Coverr)",
      },
    };
  }

  const hash = hashBeat({
    planId: input.planId,
    chapterIdx: input.chapterIdx,
    beat,
    beatOrdinal: input.beatOrdinal,
    source: `${query}|${preferVideo ? "v" : "p"}`,
  });
  // Cache check — file stock provider-agnostic (cache theo query, dùng lại
  // bất kể nguồn nào đã tải). Source "pexels" ở đây chỉ là sentinel cho cache
  // hit (mọi nguồn stock đều CC0-like, không cần ghi công).
  for (const ext of [".mp4", ".jpg"]) {
    const p = path.join(options.cacheDir, `${hash}${ext}`);
    if (await exists(p)) {
      return {
        kind: "resolved",
        asset: {
          beatIdx,
          localPath: p,
          isVideo: ext === ".mp4",
          source: "pexels",
          license: "Stock (cached)",
        },
      };
    }
  }

  const reasons: string[] = [];
  for (const backend of backends) {
    let r: PexelsResult | null = null;
    try {
      r = await backend.run();
    } catch (e) {
      reasons.push(`${backend.source}: ${(e as Error).message}`);
      continue;
    }
    if (!r) {
      reasons.push(`${backend.source}: no result`);
      continue;
    }
    const ext = r.isVideo ? ".mp4" : ".jpg";
    const outPath = path.join(options.cacheDir, `${hash}${ext}`);
    try {
      await downloadToFile(r.url, outPath);
    } catch (e) {
      reasons.push(`${backend.source}: download ${(e as Error).message}`);
      continue;
    }
    return {
      kind: "resolved",
      asset: {
        beatIdx,
        localPath: outPath,
        remoteUrl: r.url,
        isVideo: r.isVideo,
        source: backend.source,
        title: r.title,
        author: r.author,
        license: backend.license,
        sourceUrl: r.sourceUrl,
      },
    };
  }
  return {
    kind: "failed",
    failed: {
      beatIdx,
      reason: `stock không có kết quả "${query}" (${reasons.join("; ")})`,
    },
  };
}

// ── Dispatcher ───────────────────────────────────────────────────────────

async function resolveOneBeat(input: {
  planId: string;
  chapterIdx: number;
  beat: Shot;
  beatIdx: number;
  beatOrdinal: number;
  sentence: string;
  graph: KnowledgeGraph;
  options: ResolverOptions;
}): Promise<
  | { kind: "resolved"; asset: ResolvedAsset }
  | { kind: "pending"; pending: PendingBeat }
  | { kind: "failed"; failed: FailedBeat }
> {
  const { beat, beatIdx, options } = input;
  // Default = stock (Pexels video). Documentary direction: video-first.
  // Beats cũ chưa có assetType → đi đường stock + fallback archive nếu fail.
  const assetType = beat.assetType ?? "stock";

  // ── Motion: no fetch, return placeholder ──
  if (assetType === "motion") {
    const c = classifyBeatSync({
      sentence: input.sentence,
      graph: input.graph,
    });
    const recipe = c.motionRecipe ?? "Default";
    return {
      kind: "resolved",
      asset: {
        beatIdx,
        localPath: `motion:${recipe}`,
        isVideo: false,
        source: "motion",
        license: "Generated (Remotion)",
      },
    };
  }

  // Heuristic suggests queries when beat.keyword không đủ thông tin
  const c = classifyBeatSync({
    sentence: input.sentence,
    graph: input.graph,
  });

  // ── Archive / Stock — với cross-source fallback ───────────────────────
  //
  // Khi Wikimedia 429 trên download binary HOẶC không có ảnh khớp, tự động
  // thử Pexels (và ngược lại). Asset trả về set fallbackFrom + fallbackReason
  // để UI badge "fallback" + audit log. KHÔNG fallback cho motion/ai vì
  // semantic khác (motion = vẽ động, ai = user gen tay).
  if (assetType === "archive" || assetType === "stock") {
    const primary = assetType;
    const fallback: "archive" | "stock" =
      primary === "archive" ? "stock" : "archive";

    const primaryResult = await attemptSource(primary, input, c);
    if (primaryResult.kind === "resolved") return primaryResult;

    // Primary failed — try fallback nếu khả thi (đủ query/key)
    const fallbackResult = await attemptSource(fallback, input, c);
    if (fallbackResult.kind === "resolved") {
      return {
        kind: "resolved",
        asset: {
          ...fallbackResult.asset,
          fallbackFrom: primary,
          fallbackReason: primaryResult.failed.reason,
        },
      };
    }

    // Cả 2 fail — FALLBACK CUỐI: stock generic theo chủ đề cổ đại (xoay vòng
    // theo beatIdx cho đa dạng) để shot KHÔNG bao giờ trống/[Missing asset].
    // Thà 1 clip tàn tích/đá hợp tông cổ còn hơn màn đen.
    const GENERIC_ANCIENT = [
      "ancient greek ruins sunset",
      "marble columns temple ancient",
      "ancient stone statue weathered",
      "aegean sea cliffs greece",
      "ancient ruins fog atmospheric",
      "weathered marble texture stone",
    ];
    const generic = GENERIC_ANCIENT[beatIdx % GENERIC_ANCIENT.length]!;
    const genericResult = await attemptSource(
      "stock",
      { ...input, beat: { ...beat, keyword: generic, assetType: "stock" } },
      c,
    );
    if (genericResult.kind === "resolved") {
      return {
        kind: "resolved",
        asset: {
          ...genericResult.asset,
          fallbackFrom: primary,
          fallbackReason: `generic-ancient (${primary}+${fallback} fail cho "${beat.keyword}")`,
        },
      };
    }

    // Cực hiếm: cả generic cũng fail (Pexels/Pixabay down) — báo audit
    return {
      kind: "failed",
      failed: {
        beatIdx,
        reason: `${primary}: ${primaryResult.failed.reason} | ${fallback}: ${fallbackResult.failed.reason} | generic: ${genericResult.failed.reason}`,
      },
    };
  }

  // ── AI (Draw Things manual) ──
  if (assetType === "ai") {
    const seed = beat.aiPrompt ?? beat.keyword ?? "";
    if (!seed.trim()) {
      return {
        kind: "failed",
        failed: { beatIdx, reason: "ai: thiếu prompt seed (beat.aiPrompt rỗng)" },
      };
    }
    const prompt = buildAiPrompt(seed, c.aiPrompt);
    const hash = hashBeat({
      planId: input.planId,
      chapterIdx: input.chapterIdx,
      beat,
      beatOrdinal: input.beatOrdinal,
      source: prompt,
    });
    // Pass 1 + 2: file đã có trong cache hoặc watchDir
    const attached = await tryAttachAiFile(
      hash,
      options.cacheDir,
      options.drawThingsWatchDir,
    );
    if (attached) {
      return {
        kind: "resolved",
        asset: {
          beatIdx,
          localPath: attached,
          isVideo: false,
          source: "drawthings",
          title: `AI generated (Draw Things) — ${beat.keyword}`,
          license: "AI generated (local)",
        },
      };
    }
    // Chưa có → ghi prompt + pending
    const expectedFilename = `${hash}.png`;
    const promptPath = await writePromptFile({
      hash,
      cacheDir: options.cacheDir,
      prompt,
      beatKeyword: beat.keyword,
      expectedFilename,
    });
    return {
      kind: "pending",
      pending: {
        beatIdx,
        hash,
        promptPath,
        prompt,
        expectedFilename,
      },
    };
  }

  return {
    kind: "failed",
    failed: { beatIdx, reason: `Unknown assetType: ${assetType}` },
  };
}

// ── Main API ─────────────────────────────────────────────────────────────

/**
 * Resolve assets cho mọi beat trong 1 chapter. Sequential (per-beat) để
 * tránh hit rate limit Pexels (200/h). Có thể parallelize sau với p-limit
 * nếu thấy chậm — phase này simple-first.
 *
 * Caller pass:
 *  - planId + chapterIdx (cho hash determinism)
 *  - chapter object (transcript + shots[])
 *  - series slug (cho heuristic re-derive queries)
 *  - options (cacheDir, pexelsKey, watchDir, dimensions)
 */
export async function resolveChapterAssets(input: {
  planId: string;
  chapterIdx: number;
  chapter: {
    transcript: string;
    shots: Shot[];
  };
  series: string | null;
  options: ResolverOptions;
}): Promise<ResolveResult> {
  await ensureDir(input.options.cacheDir);
  const graph = await loadKnowledgeGraph(input.series);
  const sentences = splitSentences(input.chapter.transcript);

  const resolved: ResolvedAsset[] = [];
  const pending: PendingBeat[] = [];
  const failed: FailedBeat[] = [];

  // Track ordinal shots with same sentence (cho AI hash determinism — 2 shots
  // AI trong cùng sentence sẽ có hash khác → 2 ảnh khác)
  const sentenceCounter = new Map<number, number>();

  for (let i = 0; i < input.chapter.shots.length; i++) {
    const beat = input.chapter.shots[i];
    const ord = sentenceCounter.get(beat.sentenceIdx) ?? 0;
    sentenceCounter.set(beat.sentenceIdx, ord + 1);
    const sentence = sentences[beat.sentenceIdx] ?? "";

    const r = await resolveOneBeat({
      planId: input.planId,
      chapterIdx: input.chapterIdx,
      beat,
      beatIdx: i,
      beatOrdinal: ord,
      sentence,
      graph,
      options: input.options,
    });
    if (r.kind === "resolved") resolved.push(r.asset);
    else if (r.kind === "pending") pending.push(r.pending);
    else failed.push(r.failed);
  }

  return { resolved, pending, failed };
}

function splitSentences(transcript: string): string[] {
  if (!transcript.trim()) return [];
  return transcript
    .split(/[.!?]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * Resolve options default — chuẩn cho gallery 16:9 1920x1080. Caller có thể
 * override per-call. drawThingsWatchDir default `~/Downloads` (Mac default).
 */
export function defaultResolverOptions(input: {
  planId: string;
  pexelsKey?: string;
  pixabayKey?: string;
  coverrKey?: string;
}): ResolverOptions {
  return {
    cacheDir: path.resolve(`tmp/gallery-assets/${input.planId}`),
    pexelsKey: input.pexelsKey ?? getApiKey("pexels") ?? undefined,
    pixabayKey: input.pixabayKey ?? getApiKey("pixabay") ?? undefined,
    coverrKey: input.coverrKey ?? getApiKey("coverr") ?? undefined,
    drawThingsWatchDir: path.join(os.homedir(), "Downloads"),
    width: 1920,
    height: 1080,
  };
}
