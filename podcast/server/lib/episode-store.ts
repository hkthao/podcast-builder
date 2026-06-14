import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import {
  EpisodeConfigSchema,
  type EpisodeConfig,
} from "../../src/episode";
import { PATHS } from "../../../shared/studio-core/paths";
import { getEssay } from "./essay-store";
import { getSession as getBrainstormSession } from "./brainstorm-store";

const { INPUT_DIR, OUTPUT_DIR, TMP_DIR } = PATHS;

const AUDIO_EXTS = ["m4a", "mp3", "wav"] as const;
const COVER_EXTS = ["jpg", "jpeg", "png", "webp"] as const;

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
export async function listEpisodes(
  filter: { style?: EpisodeConfig["style"] } = {},
): Promise<EpisodeSummary[]> {
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
  const filtered = filter.style
    ? summaries.filter((s) => s.config.style === filter.style)
    : summaries;
  filtered.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return filtered;
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

const buildTemplate = (
  name: string,
  style: EpisodeConfig["style"] = "podcast",
): EpisodeConfig => ({
  style,
  title: name,
  hook: null,
  episodeNumber: 1,
  moodOverride: null,
  bgm: null,
  bgmVolumeDb: -28,
  showIntro: true,
  showOutro: true,
  sceneOverrides: null,
  essayId: null,
  coverImage: null,
  coverFit: "cover",
  coverPosition: "center",
  publishStatus: "draft",
  publishedAt: null,
  publishCaption: null,
  publishHashtags: [],
});

/**
 * Upload audio file qua POST. Tạo template JSON nếu chưa có.
 * `originalName` đến từ multipart upload (vd "recording.m4a").
 */
/**
 * Lấy {title, hook} từ essay (+brainstormRef nếu có) để pre-fill episode config.
 * Trả null nếu essayId không tồn tại.
 */
async function deriveFromEssay(
  essayId: string,
): Promise<{ title: string; hook: string | null } | null> {
  const essay = await getEssay(essayId);
  if (!essay) return null;
  let hook: string | null = null;
  if (essay.brainstormRef) {
    const bs = await getBrainstormSession(essay.brainstormRef.id);
    if (bs && bs.ideas[essay.brainstormRef.ideaIdx]) {
      hook = bs.ideas[essay.brainstormRef.ideaIdx].hook;
    }
  }
  // Fallback: 1 câu đầu của content
  if (!hook && essay.content) {
    const firstSentence = essay.content
      .split(/[.!?\n]/)[0]
      ?.trim()
      .slice(0, 180);
    if (firstSentence) hook = firstSentence;
  }
  return { title: essay.title, hook };
}

/**
 * Lưu cover image cho 1 episode. Ghi đè cover cũ nếu có (xóa file cũ).
 * `originalName` để lấy ext (vd "cover.jpg"). Update config.coverImage = filename.
 */
export async function uploadCover(
  name: string,
  originalName: string,
  buffer: Uint8Array,
): Promise<EpisodeSummary> {
  const summary = await loadSummary(name);
  if (!summary) {
    const err = new Error(`Episode không tồn tại: ${name}`);
    (err as Error & { code: string }).code = "NOT_FOUND";
    throw err;
  }
  const ext = (originalName.split(".").pop() ?? "").toLowerCase();
  if (!COVER_EXTS.includes(ext as (typeof COVER_EXTS)[number])) {
    const err = new Error(
      `Ext không hỗ trợ: ${ext}. Hợp lệ: ${COVER_EXTS.join(", ")}`,
    );
    (err as Error & { code: string }).code = "VALIDATION";
    throw err;
  }

  // Xóa cover cũ (mọi ext) trước khi ghi mới
  for (const e of COVER_EXTS) {
    const old = path.join(INPUT_DIR, `${name}.cover.${e}`);
    if (await exists(old)) {
      try {
        await fs.unlink(old);
      } catch {
        /* ignore */
      }
    }
  }

  const filename = `${name}.cover.${ext}`;
  const filePath = path.join(INPUT_DIR, filename);
  await fs.mkdir(INPUT_DIR, { recursive: true });
  await fs.writeFile(filePath, buffer);

  const nextConfig = { ...summary.config, coverImage: filename };
  return saveEpisode(name, nextConfig);
}

/** Xóa cover image của episode + clear config.coverImage. */
export async function deleteCover(name: string): Promise<EpisodeSummary> {
  const summary = await loadSummary(name);
  if (!summary) {
    const err = new Error(`Episode không tồn tại: ${name}`);
    (err as Error & { code: string }).code = "NOT_FOUND";
    throw err;
  }
  for (const e of COVER_EXTS) {
    const p = path.join(INPUT_DIR, `${name}.cover.${e}`);
    if (await exists(p)) {
      try {
        await fs.unlink(p);
      } catch {
        /* ignore */
      }
    }
  }
  if (summary.config.coverImage) {
    const nextConfig = { ...summary.config, coverImage: null };
    return saveEpisode(name, nextConfig);
  }
  return summary;
}

export async function uploadAudio(
  originalName: string,
  buffer: Uint8Array,
  options: {
    essayId?: string;
    cover?: { originalName: string; buffer: Uint8Array };
    style?: EpisodeConfig["style"];
  } = {},
): Promise<EpisodeSummary> {
  const ext = (originalName.split(".").pop() ?? "").toLowerCase();
  if (!AUDIO_EXTS.includes(ext as (typeof AUDIO_EXTS)[number])) {
    const err = new Error(
      `File ext không hỗ trợ: ${ext}. Hợp lệ: ${AUDIO_EXTS.join(", ")}`,
    );
    (err as Error & { code: string }).code = "VALIDATION";
    throw err;
  }

  // Nếu có essayId → dùng essay title làm base slug để tên file đẹp
  let derived: { title: string; hook: string | null } | null = null;
  if (options.essayId) {
    derived = await deriveFromEssay(options.essayId);
    if (!derived) {
      const err = new Error(`Essay không tồn tại: ${options.essayId}`);
      (err as Error & { code: string }).code = "VALIDATION";
      throw err;
    }
  }

  const baseName = derived
    ? derived.title
    : originalName.replace(/\.[^.]+$/, "");
  const slug = slugify(baseName) || `episode-${Date.now()}`;
  const audioPath = path.join(INPUT_DIR, `${slug}.${ext}`);
  const configPath = path.join(INPUT_DIR, `${slug}.json`);

  await fs.mkdir(INPUT_DIR, { recursive: true });
  await fs.writeFile(audioPath, buffer);

  // Tạo template JSON nếu chưa có. Khi có essay → prefill title/hook/essayId.
  if (!(await exists(configPath))) {
    const style = options.style ?? "podcast";
    const template = buildTemplate(slug, style);
    // Auto next episodeNumber = max(existing) + 1 trong CÙNG workspace style
    const all = await listEpisodes({ style });
    const maxNum = all.reduce(
      (m, e) => Math.max(m, e.config.episodeNumber),
      0,
    );
    template.episodeNumber = maxNum + 1;
    if (derived && options.essayId) {
      template.title = derived.title;
      template.hook = derived.hook;
      template.essayId = options.essayId;
    }
    await fs.writeFile(configPath, JSON.stringify(template, null, 2));
  } else if (derived && options.essayId) {
    // Config đã có (re-upload audio cho cùng episode) — chỉ cập nhật essayId
    // nếu nó còn null. Không ghi đè title/hook user đã edit.
    const existing = JSON.parse(
      await fs.readFile(configPath, "utf-8"),
    ) as EpisodeConfig;
    if (!existing.essayId) {
      existing.essayId = options.essayId;
      if (!existing.hook && derived.hook) existing.hook = derived.hook;
      await fs.writeFile(configPath, JSON.stringify(existing, null, 2));
    }
  }

  // Nếu user upload kèm cover image → ghi cover ngay (sau khi episode đã tồn tại)
  if (options.cover) {
    return uploadCover(slug, options.cover.originalName, options.cover.buffer);
  }

  const summary = await loadSummary(slug);
  if (!summary) {
    throw new Error(`Upload OK nhưng không load lại: ${slug}`);
  }
  return summary;
}

export type TranscriptSegment = {
  startMs: number;
  endMs: number;
  text: string;
};

export type TranscriptPayload = {
  source: "corrected" | "raw" | "none";
  segments: TranscriptSegment[];
  totalSegments: number;
};

type WhisperSegment = {
  text: string;
  offsets: { from: number; to: number };
};

type WhisperFile = { transcription: WhisperSegment[] };

const cleanWhisperText = (s: string): string =>
  s
    .replace(/[�­]+/g, "")
    .replace(/"{2,}/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export async function getTranscript(
  name: string,
): Promise<TranscriptPayload> {
  const correctedPath = path.join(TMP_DIR, `${name}.corrected.json`);
  const rawPath = path.join(TMP_DIR, `${name}.json`);
  let source: TranscriptPayload["source"] = "none";
  let filePath: string | null = null;
  if (await exists(correctedPath)) {
    source = "corrected";
    filePath = correctedPath;
  } else if (await exists(rawPath)) {
    source = "raw";
    filePath = rawPath;
  }
  if (!filePath) return { source, segments: [], totalSegments: 0 };
  let data: WhisperFile;
  try {
    const buf = await fs.readFile(filePath, "utf-8");
    data = JSON.parse(buf) as WhisperFile;
  } catch {
    return { source: "none", segments: [], totalSegments: 0 };
  }
  const segments = (data.transcription ?? []).map((s) => ({
    startMs: s.offsets.from,
    endMs: s.offsets.to,
    text: cleanWhisperText(s.text),
  }));
  return { source, segments, totalSegments: segments.length };
}

export type ScenePlanItem = {
  index: number;
  startMs: number;
  endMs: number;
  mood: string;
  sceneType: string;
  text: string;
};

export type PlanPayload = {
  scenes: ScenePlanItem[];
  totalScenes: number;
  totalDurationMs: number;
};

type PlanFile = {
  scenes?: Array<Partial<ScenePlanItem>>;
};

const VALID_MOODS = [
  "positive",
  "social",
  "healing",
  "energetic",
  "contemplative",
] as const;

const VALID_SCENE_TYPES = [
  "PodcastDesk",
  "Idea",
  "Connection",
  "Crowd",
  "InnerSelf",
  "Choice",
  "Knowledge",
  "OnAir",
  "DualMic",
  "Journal",
  "Morning",
  "Listening",
  "Voices",
  "Growth",
  "Quote",
  "Doubt",
  "LettingGo",
  "Sacrifice",
  "Metamorphosis",
  "Bridge",
  "Mirror",
  "Threshold",
] as const;

type RawScene = Partial<ScenePlanItem>;

export async function savePlan(
  name: string,
  scenes: RawScene[],
): Promise<PlanPayload> {
  const planPath = path.join(TMP_DIR, `${name}.plan.json`);
  if (!(await exists(planPath))) {
    const err = new Error(
      `Plan chưa tồn tại: ${planPath}. Render lần đầu để sinh plan.`,
    );
    (err as Error & { code: string }).code = "NOT_FOUND";
    throw err;
  }
  // Read existing để giữ version / generatedAt + đảm bảo schema correct.
  const existing = JSON.parse(
    await fs.readFile(planPath, "utf-8"),
  ) as { version?: number; generatedAt?: string; scenes?: unknown };
  // Validate from payload
  const validated: ScenePlanItem[] = scenes.map((s, i) => {
    const startMs = Number(s.startMs);
    const endMs = Number(s.endMs);
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
      const err = new Error(`Scene #${i}: startMs/endMs phải là number`);
      (err as Error & { code: string }).code = "VALIDATION";
      throw err;
    }
    const mood = String(s.mood ?? "positive");
    if (!VALID_MOODS.includes(mood as (typeof VALID_MOODS)[number])) {
      const err = new Error(
        `Scene #${i}: mood "${mood}" không hợp lệ. Hợp lệ: ${VALID_MOODS.join(", ")}`,
      );
      (err as Error & { code: string }).code = "VALIDATION";
      throw err;
    }
    const sceneType = String(s.sceneType ?? "PodcastDesk");
    if (
      !VALID_SCENE_TYPES.includes(
        sceneType as (typeof VALID_SCENE_TYPES)[number],
      )
    ) {
      const err = new Error(
        `Scene #${i}: sceneType "${sceneType}" không hợp lệ. Hợp lệ: ${VALID_SCENE_TYPES.join(", ")}`,
      );
      (err as Error & { code: string }).code = "VALIDATION";
      throw err;
    }
    return {
      index: Number.isFinite(Number(s.index)) ? Number(s.index) : i,
      startMs,
      endMs,
      mood,
      sceneType,
      text: String(s.text ?? ""),
    };
  });

  const payload = {
    version: existing.version ?? 2,
    generatedAt: existing.generatedAt ?? new Date().toISOString(),
    scenes: validated,
  };
  await fs.writeFile(planPath, JSON.stringify(payload, null, 2));
  return getPlan(name);
}

export const PLAN_OPTIONS = {
  moods: VALID_MOODS,
  sceneTypes: VALID_SCENE_TYPES,
} as const;

/**
 * Save lại transcript đã sửa chính tả. Phải khớp count với corrected.json
 * hiện tại — không cho add/remove segment, chỉ edit text.
 *
 * Sau khi save, lock hash sẽ mismatch → ep status = "outdated" → user
 * biết cần re-render.
 */
export async function saveTranscript(
  name: string,
  segments: Array<{ startMs: number; endMs: number; text: string }>,
): Promise<TranscriptPayload> {
  const correctedPath = path.join(TMP_DIR, `${name}.corrected.json`);
  const rawPath = path.join(TMP_DIR, `${name}.json`);
  const target = (await exists(correctedPath)) ? correctedPath : rawPath;
  if (!(await exists(target))) {
    const err = new Error(`Transcript không tồn tại: ${target}`);
    (err as Error & { code: string }).code = "NOT_FOUND";
    throw err;
  }
  const data = JSON.parse(await fs.readFile(target, "utf-8")) as WhisperFile & {
    transcription: WhisperSegment[];
  };
  const existing = data.transcription;
  if (existing.length !== segments.length) {
    const err = new Error(
      `Count mismatch: existing ${existing.length}, payload ${segments.length}. ` +
        `Hiện chưa hỗ trợ add/remove segment, chỉ edit text.`,
    );
    (err as Error & { code: string }).code = "VALIDATION";
    throw err;
  }
  for (let i = 0; i < existing.length; i++) {
    const newText = String(segments[i]?.text ?? "").trim();
    // Giữ leading space convention của Whisper (` text` để concat trong scenes.ts).
    existing[i].text = newText.length > 0 ? ` ${newText}` : "";
  }
  await fs.writeFile(target, JSON.stringify(data, null, 2));
  return getTranscript(name);
}

export async function getPlan(name: string): Promise<PlanPayload> {
  const planPath = path.join(TMP_DIR, `${name}.plan.json`);
  if (!(await exists(planPath))) {
    return { scenes: [], totalScenes: 0, totalDurationMs: 0 };
  }
  let data: PlanFile;
  try {
    data = JSON.parse(await fs.readFile(planPath, "utf-8")) as PlanFile;
  } catch {
    return { scenes: [], totalScenes: 0, totalDurationMs: 0 };
  }
  const scenes: ScenePlanItem[] = (data.scenes ?? []).map((s, i) => ({
    index: s.index ?? i,
    startMs: s.startMs ?? 0,
    endMs: s.endMs ?? 0,
    mood: s.mood ?? "positive",
    sceneType: s.sceneType ?? "PodcastDesk",
    text: s.text ?? "",
  }));
  const totalDurationMs = scenes.reduce(
    (sum, s) => sum + (s.endMs - s.startMs),
    0,
  );
  return { scenes, totalScenes: scenes.length, totalDurationMs };
}

export { PATHS } from "../../../shared/studio-core/paths";
export const AUDIO_EXTENSIONS = AUDIO_EXTS;
export const COVER_EXTENSIONS = COVER_EXTS;

export type EpisodeFile = {
  /** Relative filename, vd "mu-loa….m4a" hoặc "mu-loa….mp4" */
  filename: string;
  /** Đường serve qua HTTP: /input/<name> hoặc /output/<name> */
  url: string;
  /** Bytes */
  size: number;
  /** mtime ISO */
  mtime: string;
  /** Loại file: audio (input), video, thumbnail, lock, transcript, plan */
  kind:
    | "audio-original"
    | "audio-normalized"
    | "video-full"
    | "video-preview"
    | "thumbnail"
    | "cover"
    | "lock"
    | "transcript-raw"
    | "transcript-corrected"
    | "plan";
};

export type EpisodeFiles = {
  input: EpisodeFile[];
  output: EpisodeFile[];
  tmp: EpisodeFile[];
};

const fileInfo = async (
  filePath: string,
  filename: string,
  kind: EpisodeFile["kind"],
  urlPrefix: string,
): Promise<EpisodeFile | null> => {
  try {
    const stat = await fs.stat(filePath);
    return {
      filename,
      url: `${urlPrefix}/${encodeURIComponent(filename)}`,
      size: stat.size,
      mtime: new Date(stat.mtimeMs).toISOString(),
      kind,
    };
  } catch {
    return null;
  }
};

/**
 * List tất cả file liên quan tới 1 episode (input audio, outputs, tmp).
 * Trả về null entries đã filter.
 */
export async function listEpisodeFiles(
  name: string,
): Promise<EpisodeFiles> {
  const input: EpisodeFile[] = [];
  const output: EpisodeFile[] = [];
  const tmp: EpisodeFile[] = [];

  // Audio originals trong input/
  for (const ext of AUDIO_EXTS) {
    const fn = `${name}.${ext}`;
    const f = await fileInfo(
      path.join(INPUT_DIR, fn),
      fn,
      "audio-original",
      "/input",
    );
    if (f) input.push(f);
  }

  // Cover image trong input/
  for (const ext of COVER_EXTS) {
    const fn = `${name}.cover.${ext}`;
    const f = await fileInfo(
      path.join(INPUT_DIR, fn),
      fn,
      "cover",
      "/input",
    );
    if (f) input.push(f);
  }

  // Outputs
  const fullMp4 = await fileInfo(
    path.join(OUTPUT_DIR, `${name}.mp4`),
    `${name}.mp4`,
    "video-full",
    "/output",
  );
  if (fullMp4) output.push(fullMp4);

  const previewMp4 = await fileInfo(
    path.join(OUTPUT_DIR, `${name}.preview.mp4`),
    `${name}.preview.mp4`,
    "video-preview",
    "/output",
  );
  if (previewMp4) output.push(previewMp4);

  const thumb = await fileInfo(
    path.join(OUTPUT_DIR, `${name}.thumb.jpg`),
    `${name}.thumb.jpg`,
    "thumbnail",
    "/output",
  );
  if (thumb) output.push(thumb);

  const lock = await fileInfo(
    path.join(OUTPUT_DIR, `${name}.lock.json`),
    `${name}.lock.json`,
    "lock",
    "/output",
  );
  if (lock) output.push(lock);

  // Tmp artifacts (transcript / plan / normalized audio)
  const normalized48 = await fileInfo(
    path.join(TMP_DIR, `${name}.normalized.48k.wav`),
    `${name}.normalized.48k.wav`,
    "audio-normalized",
    "/tmp",
  );
  if (normalized48) tmp.push(normalized48);

  const normalized16 = await fileInfo(
    path.join(TMP_DIR, `${name}.normalized.16k.wav`),
    `${name}.normalized.16k.wav`,
    "audio-normalized",
    "/tmp",
  );
  if (normalized16) tmp.push(normalized16);

  const rawTranscript = await fileInfo(
    path.join(TMP_DIR, `${name}.json`),
    `${name}.json`,
    "transcript-raw",
    "/tmp",
  );
  if (rawTranscript) tmp.push(rawTranscript);

  const corrected = await fileInfo(
    path.join(TMP_DIR, `${name}.corrected.json`),
    `${name}.corrected.json`,
    "transcript-corrected",
    "/tmp",
  );
  if (corrected) tmp.push(corrected);

  const plan = await fileInfo(
    path.join(TMP_DIR, `${name}.plan.json`),
    `${name}.plan.json`,
    "plan",
    "/tmp",
  );
  if (plan) tmp.push(plan);

  return { input, output, tmp };
}

/**
 * Xoá 1 file thuộc episode. bucket = nơi file ở (input/output/tmp).
 * Whitelist toàn bộ filename hợp lệ → đảm bảo:
 *   - không path traversal
 *   - không xoá nhầm file episode khác
 *   - không xoá config (`input/<name>.json`) — config khác audio
 * Trả về snapshot mới sau khi xoá.
 */
export async function deleteEpisodeFile(
  name: string,
  bucket: "input" | "output" | "tmp",
  filename: string,
): Promise<EpisodeFiles> {
  const valid: Record<"input" | "output" | "tmp", string[]> = {
    input: [
      ...AUDIO_EXTS.map((ext) => `${name}.${ext}`),
      ...COVER_EXTS.map((ext) => `${name}.cover.${ext}`),
    ],
    output: [
      `${name}.mp4`,
      `${name}.preview.mp4`,
      `${name}.thumb.jpg`,
      `${name}.lock.json`,
    ],
    tmp: [
      `${name}.normalized.48k.wav`,
      `${name}.normalized.16k.wav`,
      `${name}.json`,
      `${name}.corrected.json`,
      `${name}.plan.json`,
    ],
  };
  if (!valid[bucket].includes(filename)) {
    const err = new Error(`Filename không hợp lệ cho episode ${name}: ${filename}`) as Error & { code: string };
    err.code = "VALIDATION";
    throw err;
  }
  const rootDir =
    bucket === "input" ? INPUT_DIR : bucket === "output" ? OUTPUT_DIR : TMP_DIR;
  const filePath = path.join(rootDir, filename);
  try {
    await fs.unlink(filePath);
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    if (err.code !== "ENOENT") throw err;
  }
  return listEpisodeFiles(name);
}
