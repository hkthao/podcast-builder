import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import {
  EpisodeConfigSchema,
  type EpisodeConfig,
} from "../../src/episode";

const INPUT_DIR = path.resolve("input");
const OUTPUT_DIR = path.resolve("output");
const TMP_DIR = path.resolve("tmp");

const AUDIO_EXTS = ["m4a", "mp3", "wav"] as const;

export type EpisodeStatus =
  | "no-audio"   // chỉ có .json, chưa kéo audio vào
  | "draft"      // có audio + json nhưng chưa render
  | "rendering"  // có job đang chạy (set ngoài, từ render-runner)
  | "rendered"   // có output mp4 + lock hash KHỚP với episode.json hiện tại
  | "outdated";  // có output nhưng config đã đổi sau render

export type EpisodeSummary = {
  /** Tên file (không đuôi). VD: "mu-loa-truoc-gia-tri-hien-tai" */
  name: string;
  /** Path audio nếu tồn tại (m4a/mp3/wav). */
  audioPath: string | null;
  /** Path input/<name>.json — luôn tồn tại nếu summary trả về. */
  configPath: string;
  /** Parsed config. */
  config: EpisodeConfig;
  /** Trạng thái render. */
  status: EpisodeStatus;
  /** True nếu output/<name>.mp4 tồn tại (bất kể outdated hay không). */
  hasOutput: boolean;
  /** Path mp4 nếu hasOutput, null nếu không. */
  outputPath: string | null;
  /** Path thumb.jpg nếu hasOutput. */
  thumbnailPath: string | null;
  /** Episode hash từ lock file (sha256 của episode.json lúc render). */
  lockedEpisodeHash: string | null;
  /** ISO timestamp render lúc render. */
  renderedAt: string | null;
  /** mtime config json — sort by recency. */
  mtimeMs: number;
};

const sha256Json = (obj: unknown): string =>
  crypto.createHash("sha256").update(JSON.stringify(obj)).digest("hex");

const exists = async (p: string): Promise<boolean> => {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
};

const findAudio = async (name: string): Promise<string | null> => {
  for (const ext of AUDIO_EXTS) {
    const p = path.join(INPUT_DIR, `${name}.${ext}`);
    if (await exists(p)) return p;
  }
  return null;
};

type LockFile = {
  renderedAt?: string;
  episodeHash?: string;
};

const readLock = async (lockPath: string): Promise<LockFile | null> => {
  try {
    const raw = await fs.readFile(lockPath, "utf-8");
    return JSON.parse(raw) as LockFile;
  } catch {
    return null;
  }
};

const loadSummary = async (
  name: string,
): Promise<EpisodeSummary | null> => {
  const configPath = path.join(INPUT_DIR, `${name}.json`);
  let raw: unknown;
  let stat: { mtimeMs: number };
  try {
    const buf = await fs.readFile(configPath, "utf-8");
    raw = JSON.parse(buf);
    stat = await fs.stat(configPath);
  } catch {
    return null;
  }
  const parsed = EpisodeConfigSchema.safeParse(raw);
  if (!parsed.success) return null;

  const audioPath = await findAudio(name);
  const outputPath = path.join(OUTPUT_DIR, `${name}.mp4`);
  const thumbnailPath = path.join(OUTPUT_DIR, `${name}.thumb.jpg`);
  const lockPath = path.join(OUTPUT_DIR, `${name}.lock.json`);

  const hasOutput = await exists(outputPath);
  const lock = hasOutput ? await readLock(lockPath) : null;
  const lockedEpisodeHash = lock?.episodeHash?.replace(/^sha256:/, "") ?? null;
  const renderedAt = lock?.renderedAt ?? null;

  // Determine status
  let status: EpisodeStatus;
  if (!audioPath) {
    status = "no-audio";
  } else if (!hasOutput) {
    status = "draft";
  } else {
    const currentHash = sha256Json(parsed.data);
    status = lockedEpisodeHash === currentHash ? "rendered" : "outdated";
  }

  return {
    name,
    audioPath,
    configPath,
    config: parsed.data,
    status,
    hasOutput,
    outputPath: hasOutput ? outputPath : null,
    thumbnailPath: hasOutput ? thumbnailPath : null,
    lockedEpisodeHash,
    renderedAt,
    mtimeMs: stat.mtimeMs,
  };
};

/** List tất cả episode (mỗi `input/<name>.json` = 1 episode). Sort by mtime desc. */
export async function listEpisodes(): Promise<EpisodeSummary[]> {
  let entries: string[];
  try {
    entries = await fs.readdir(INPUT_DIR);
  } catch {
    return [];
  }
  const names = entries
    .filter((f) => f.endsWith(".json") && !f.startsWith("."))
    .map((f) => f.replace(/\.json$/, ""));

  const summaries = (
    await Promise.all(names.map((n) => loadSummary(n)))
  ).filter((s): s is EpisodeSummary => s !== null);
  summaries.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return summaries;
}

export async function getEpisode(
  name: string,
): Promise<EpisodeSummary | null> {
  return loadSummary(name);
}

/** Save episode config qua PUT. Validate zod trước khi ghi. */
export async function saveEpisode(
  name: string,
  raw: unknown,
): Promise<EpisodeSummary> {
  const parsed = EpisodeConfigSchema.safeParse(raw);
  if (!parsed.success) {
    const err = new Error(
      `Invalid episode config: ${JSON.stringify(parsed.error.flatten())}`,
    );
    (err as Error & { code: string }).code = "VALIDATION";
    throw err;
  }
  const configPath = path.join(INPUT_DIR, `${name}.json`);
  await fs.mkdir(INPUT_DIR, { recursive: true });
  await fs.writeFile(configPath, JSON.stringify(parsed.data, null, 2));
  const summary = await loadSummary(name);
  if (!summary) {
    throw new Error(`Save OK nhưng không load lại được: ${name}`);
  }
  return summary;
}

/** Slugify filename → kebab-case ASCII-safe. */
const slugify = (s: string): string => {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[đĐ]/g, (c) => (c === "đ" ? "d" : "D"))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
};

const buildTemplate = (name: string): EpisodeConfig => ({
  title: name,
  hook: null,
  episodeNumber: 1,
  moodOverride: null,
  bgm: null,
  bgmVolumeDb: -28,
  showIntro: true,
  showOutro: true,
  sceneOverrides: null,
});

/**
 * Upload audio file qua POST. Tạo template JSON nếu chưa có.
 * `originalName` đến từ multipart upload (vd "recording.m4a").
 */
export async function uploadAudio(
  originalName: string,
  buffer: Uint8Array,
): Promise<EpisodeSummary> {
  const ext = (originalName.split(".").pop() ?? "").toLowerCase();
  if (!AUDIO_EXTS.includes(ext as (typeof AUDIO_EXTS)[number])) {
    const err = new Error(
      `File ext không hỗ trợ: ${ext}. Hợp lệ: ${AUDIO_EXTS.join(", ")}`,
    );
    (err as Error & { code: string }).code = "VALIDATION";
    throw err;
  }
  const baseName = originalName.replace(/\.[^.]+$/, "");
  const slug = slugify(baseName) || `episode-${Date.now()}`;
  const audioPath = path.join(INPUT_DIR, `${slug}.${ext}`);
  const configPath = path.join(INPUT_DIR, `${slug}.json`);

  await fs.mkdir(INPUT_DIR, { recursive: true });
  await fs.writeFile(audioPath, buffer);

  // Tạo template JSON nếu chưa có (để không ghi đè config đã edit).
  if (!(await exists(configPath))) {
    const template = buildTemplate(slug);
    await fs.writeFile(configPath, JSON.stringify(template, null, 2));
  }

  const summary = await loadSummary(slug);
  if (!summary) {
    throw new Error(`Upload OK nhưng không load lại: ${slug}`);
  }
  return summary;
}

export const PATHS = { INPUT_DIR, OUTPUT_DIR, TMP_DIR } as const;
export const AUDIO_EXTENSIONS = AUDIO_EXTS;
