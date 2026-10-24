/**
 * Hàng đợi đăng Facebook — upload chạy TRÊN SERVER, tuần tự 1 job/lần (băng thông
 * upload là nút cổ chai, chạy song song chỉ làm mọi job cùng chậm). Job KHÔNG gắn với
 * kết nối client: đóng tab / curl ngắt không huỷ upload (trước đây SSE abort = mất cả
 * lần tải 1GB). Lưu tmp/_publish-queue.json → server khởi động lại vẫn còn lịch sử,
 * job đang dở/đang chờ tự xếp lại chạy tiếp (upload lại từ đầu — phiên dở trên FB tự huỷ).
 *
 * UI: trang /publish-queue poll GET /api/publish/jobs. Skill/CLI: POST /api/publish/jobs.
 */
import fs from "node:fs";
import path from "node:path";
import { PATHS } from "../../../shared/studio-core/paths";
import { getApiKey } from "../../../shared/studio-core/api-keys-store";
import { publishReel } from "../../../shared/studio-core/facebook";
import { getEpisode, saveEpisode } from "./episode-store";
import { buildEpisodeSrt } from "./srt";
import type { EpisodeConfig } from "../../src/episode";
import { getSeries } from "../../src/series";
import { buildEpisodeDescription, fbPageIdFor } from "./publish-description";

export type PublishJobStatus = "queued" | "uploading" | "done" | "error" | "cancelled";

export type PublishJob = {
  id: string;
  episodeName: string;
  title: string;
  series: string;
  /** ISO — null = đăng ngay. */
  scheduledAt: string | null;
  playlistId?: string;
  playlistName?: string;
  status: PublishJobStatus;
  percent: number;
  bytesSent: number;
  bytesTotal: number;
  /** Tốc độ trung bình từ lúc bắt đầu transfer (byte/s). */
  bytesPerSec: number;
  /** Dòng log mới nhất (hiện dưới thanh tiến độ). */
  message: string;
  log: { at: number; line: string }[];
  createdAt: number;
  startedAt: number | null;
  finishedAt: number | null;
  error: string | null;
  result: { videoId: string; permalink: string | null; pageName: string; scheduled: boolean } | null;
  /** "business-suite" = lượt đăng qua fb-browser.ts (CLI/skill/UI) — chỉ hiển thị, không huỷ/thử lại ở đây. */
  via?: "graph" | "business-suite";
};

const STATE_FILE = path.join(PATHS.TMP_DIR, "_publish-queue.json");
const MAX_LOG = 200;
const MAX_FINISHED = 60;

export { buildEpisodeDescription, fbPageIdFor };

// ─── State ───────────────────────────────────────────────────────────────

let jobs: PublishJob[] = load();
let running: { id: string; ac: AbortController } | null = null;
let lastPersist = 0;
let persistTimer: NodeJS.Timeout | null = null;
type Listener = (job: PublishJob, line?: string) => void;
const listeners = new Map<string, Set<Listener>>();

function load(): PublishJob[] {
  try {
    const list = JSON.parse(fs.readFileSync(STATE_FILE, "utf8")) as PublishJob[];
    // Server chết giữa chừng → job đang tải quay về hàng chờ (tải lại từ đầu).
    return list.map((j) =>
      j.status === "uploading"
        ? { ...j, status: "queued", percent: 0, bytesSent: 0, message: "Server khởi động lại — tải lại từ đầu" }
        : j,
    );
  } catch {
    return [];
  }
}

function persist(force = false) {
  const write = () => {
    persistTimer = null;
    lastPersist = Date.now();
    try {
      fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
      fs.writeFileSync(STATE_FILE, JSON.stringify(jobs, null, 1));
    } catch {
      /* ghi state lỗi không chặn upload */
    }
  };
  if (force || Date.now() - lastPersist > 5000) {
    if (persistTimer) clearTimeout(persistTimer);
    write();
  } else if (!persistTimer) {
    persistTimer = setTimeout(write, 5000);
  }
}

function update(job: PublishJob, patch: Partial<PublishJob>, line?: string) {
  Object.assign(job, patch);
  if (line) {
    job.message = line;
    job.log.push({ at: Date.now(), line });
    if (job.log.length > MAX_LOG) job.log.splice(0, job.log.length - MAX_LOG);
  }
  persist(!!patch.status);
  for (const fn of listeners.get(job.id) ?? []) fn(job, line);
}

/** Theo dõi 1 job (SSE /publish dùng để stream log). Trả hàm huỷ theo dõi. */
export function subscribePublishJob(id: string, fn: Listener): () => void {
  const set = listeners.get(id) ?? new Set<Listener>();
  set.add(fn);
  listeners.set(id, set);
  return () => {
    set.delete(fn);
    if (!set.size) listeners.delete(id);
  };
}

/**
 * Lượt đăng qua Business Suite (scripts/fb-browser.ts ghi tmp/fb-browser/<slug>.job.json) — chạy
 * ngoài hàng đợi Graph nên trước đây không hiện ở /publish-queue dù đã hẹn giờ xong.
 */
const BROWSER_DIR = path.join(PATHS.TMP_DIR, "fb-browser");
const pidAlive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};
function listBrowserPublishJobs(): PublishJob[] {
  let files: string[] = [];
  try {
    files = fs.readdirSync(BROWSER_DIR).filter((f) => f.endsWith(".job.json"));
  } catch {
    return [];
  }
  const out: PublishJob[] = [];
  for (const f of files) {
    try {
      const b = JSON.parse(fs.readFileSync(path.join(BROWSER_DIR, f), "utf-8"));
      // Tiến trình chết giữa chừng (Ctrl-C, máy tắt) → không để "đang tải" mãi.
      const dead = b.status === "uploading" && !pidAlive(b.pid);
      const status: PublishJobStatus = dead ? "error" : b.status;
      out.push({
        id: `bs:${b.episodeName}`,
        episodeName: b.episodeName,
        title: b.title,
        series: b.series,
        scheduledAt: b.scheduledAt,
        status,
        percent: status === "done" ? 100 : 0,
        bytesSent: status === "done" ? b.bytesTotal : 0,
        bytesTotal: b.bytesTotal,
        bytesPerSec: 0,
        message: `Business Suite · ${b.message}`,
        log: b.log ?? [],
        createdAt: b.startedAt,
        startedAt: b.startedAt,
        finishedAt: b.finishedAt ?? (dead ? b.startedAt : null),
        error: dead ? "Tiến trình fb-browser dừng giữa chừng — kiểm tra lịch trên Business Suite." : b.error,
        result: b.videoId ? { videoId: b.videoId, permalink: null, pageName: b.pageName, scheduled: true } : null,
        via: "business-suite",
      });
    } catch {
      /* file đang ghi dở — bỏ qua lượt này */
    }
  }
  return out;
}

export const listPublishJobs = (): PublishJob[] => [...jobs, ...listBrowserPublishJobs()];
export const getPublishJob = (id: string): PublishJob | undefined => jobs.find((j) => j.id === id);

/** Kiểm điều kiện đăng — lỗi trả message tiếng Việt (route trả 400). */
async function validate(name: string, scheduledAt: string | null): Promise<{ config: EpisodeConfig } | string> {
  const summary = await getEpisode(name);
  if (!summary) return `Không tìm thấy tập "${name}".`;
  if (!fs.existsSync(path.join(PATHS.OUTPUT_DIR, `${name}.mp4`))) {
    return `Chưa có video render (output/${name}.mp4) — sang tab Render bấm 'Render full' trước.`;
  }
  if (!getApiKey("facebook")) return "Chưa có Facebook Page Access Token — vào Settings để nhập (provider Facebook).";
  if (scheduledAt) {
    const ms = Date.parse(scheduledAt);
    if (Number.isNaN(ms)) return "Thời điểm lên lịch không hợp lệ.";
    // Upload xếp hàng có thể mất cả giờ → kiểm lại lúc bắt đầu tải; ở đây chỉ chặn giờ đã qua.
    if (ms < Date.now() + 10 * 60_000) return "Lên lịch phải cách hiện tại ít nhất 10 phút (yêu cầu của Facebook).";
    if (ms > Date.now() + 75 * 24 * 3600_000) return "Lên lịch tối đa 75 ngày kể từ bây giờ (yêu cầu của Facebook).";
  }
  return { config: summary.config };
}

/**
 * Thêm job đăng. Tập đã có job đang chờ/đang tải → trả job đó (không tải trùng).
 * Lỗi điều kiện → throw Error (message tiếng Việt).
 */
export async function enqueuePublish(opts: {
  episodeName: string;
  scheduledAt?: string | null;
  playlistId?: string;
  playlistName?: string;
}): Promise<PublishJob> {
  const name = opts.episodeName;
  const existing = jobs.find((j) => j.episodeName === name && (j.status === "queued" || j.status === "uploading"));
  if (existing) return existing;
  const scheduledAt = opts.scheduledAt ? new Date(Date.parse(opts.scheduledAt)).toISOString() : null;
  const v = await validate(name, opts.scheduledAt ?? null);
  if (typeof v === "string") throw new Error(v);
  const job: PublishJob = {
    id: `pub-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    episodeName: name,
    title: v.config.title,
    series: getSeries(v.config.series).id,
    scheduledAt,
    playlistId: opts.playlistId,
    playlistName: opts.playlistName,
    status: "queued",
    percent: 0,
    bytesSent: 0,
    bytesTotal: fs.statSync(path.join(PATHS.OUTPUT_DIR, `${name}.mp4`)).size,
    bytesPerSec: 0,
    message: "Đang chờ",
    log: [],
    createdAt: Date.now(),
    startedAt: null,
    finishedAt: null,
    error: null,
    result: null,
  };
  jobs.push(job);
  // Giữ lịch sử gọn: bỏ job đã kết thúc cũ nhất.
  const finished = jobs.filter((j) => j.status === "done" || j.status === "error" || j.status === "cancelled");
  if (finished.length > MAX_FINISHED) {
    const drop = new Set(finished.slice(0, finished.length - MAX_FINISHED).map((j) => j.id));
    jobs = jobs.filter((j) => !drop.has(j.id));
  }
  persist(true);
  void processQueue();
  return job;
}

/** Huỷ job đang chờ (bỏ khỏi hàng) hoặc đang tải (abort upload). */
export function cancelPublishJob(id: string): boolean {
  const job = getPublishJob(id);
  if (!job || (job.status !== "queued" && job.status !== "uploading")) return false;
  if (running?.id === id) running.ac.abort();
  update(job, { status: "cancelled", finishedAt: Date.now() }, "Đã huỷ");
  return true;
}

/** Thử lại job lỗi/đã huỷ (xếp cuối hàng). */
export async function retryPublishJob(id: string): Promise<PublishJob> {
  const job = getPublishJob(id);
  if (!job) throw new Error("Không tìm thấy job.");
  return enqueuePublish({
    episodeName: job.episodeName,
    scheduledAt: job.scheduledAt,
    playlistId: job.playlistId,
    playlistName: job.playlistName,
  });
}

/** Xoá các job đã kết thúc khỏi danh sách. */
export function clearFinishedPublishJobs(): number {
  const before = jobs.length;
  jobs = jobs.filter((j) => j.status === "queued" || j.status === "uploading");
  persist(true);
  let removed = before - jobs.length;
  for (const j of listBrowserPublishJobs()) {
    if (j.status === "uploading") continue;
    try {
      fs.rmSync(path.join(BROWSER_DIR, `${j.episodeName}.job.json`));
      removed++;
    } catch {
      /* đã xoá */
    }
  }
  return removed;
}

async function processQueue(): Promise<void> {
  if (running) return;
  const job = jobs.find((j) => j.status === "queued");
  if (!job) return;
  const ac = new AbortController();
  running = { id: job.id, ac };
  try {
    await runJob(job, ac.signal);
  } finally {
    running = null;
    void processQueue();
  }
}

async function runJob(job: PublishJob, signal: AbortSignal): Promise<void> {
  const name = job.episodeName;
  update(
    job,
    { status: "uploading", startedAt: Date.now(), finishedAt: null, error: null, percent: 0, bytesSent: 0, log: [] },
    job.scheduledAt
      ? `Lên lịch "${name}.mp4" đăng lúc ${new Date(job.scheduledAt).toLocaleString("vi-VN")}…`
      : `Đăng "${name}.mp4" lên Facebook…`,
  );
  const fail = (msg: string) => update(job, { status: "error", error: msg, finishedAt: Date.now() }, `✗ ${msg}`);

  const v = await validate(name, job.scheduledAt);
  if (typeof v === "string") return fail(v);
  const config = v.config;
  const videoPath = path.join(PATHS.OUTPUT_DIR, `${name}.mp4`);
  const series = getSeries(config.series);
  let transferStart = 0;

  try {
    const r = await publishReel({
      token: getApiKey("facebook")!,
      pageIdOverride: fbPageIdFor(config.series),
      // Phân loại cho thuật toán + nhãn riêng tư để lọc thống kê (đo reach đăng qua API).
      contentCategory: series.fbContentCategory,
      customLabels: [series.id, "studio-api"],
      captionsSrt: series.fbUploadSrt ? buildEpisodeSrt(name, config) : null,
      videoPath,
      description: buildEpisodeDescription(config),
      title: config.title,
      thumbPath: config.coverImage ? path.join(PATHS.INPUT_DIR, config.coverImage) : null,
      scheduledPublishTime: job.scheduledAt ? Math.floor(Date.parse(job.scheduledAt) / 1000) : undefined,
      onProgress: (line) => {
        // "Đã tải N%" đã hiện ở thanh tiến độ — không cần chen vào log.
        if (/^Đã tải \d+%/.test(line)) return;
        update(job, {}, line);
      },
      onUploadBytes: (sent, total) => {
        if (!transferStart) transferStart = Date.now();
        const secs = (Date.now() - transferStart) / 1000;
        update(job, {
          bytesSent: sent,
          bytesTotal: total,
          percent: total ? (sent / total) * 100 : 0,
          bytesPerSec: secs > 1 ? sent / secs : 0,
        });
      },
      signal,
    });
    if (signal.aborted) return;

    const updated: EpisodeConfig = {
      ...config,
      publishStatus: r.scheduled ? "scheduled" : "published",
      publishedAt: r.scheduled ? config.publishedAt : new Date().toISOString(),
      scheduledPublishTime: r.scheduled ? job.scheduledAt : null,
      fbReelId: r.videoId,
      fbPermalink: r.permalink,
      ...(job.playlistId ? { fbPlaylistId: job.playlistId } : {}),
      ...(job.playlistName ? { fbPlaylistName: job.playlistName } : {}),
    };
    try {
      await saveEpisode(name, updated);
    } catch {
      /* lưu config lỗi không chặn kết quả đăng */
    }
    const playlist = job.playlistName ?? config.fbPlaylistName;
    if (playlist) {
      update(job, {}, `Nhắc: mở video trên Facebook → menu (⋯) → "Thêm vào playlist" → "${playlist}" (Facebook không cho tự thêm qua API).`);
    }
    update(
      job,
      {
        status: "done",
        percent: 100,
        finishedAt: Date.now(),
        result: { videoId: r.videoId, permalink: r.permalink, pageName: r.pageName, scheduled: r.scheduled },
      },
      r.scheduled ? `✓ Đã lên lịch trên "${r.pageName}" (video ${r.videoId}).` : `✓ Đã đăng lên "${r.pageName}" (video ${r.videoId}).`,
    );
  } catch (e) {
    if (signal.aborted) return; // cancelPublishJob đã cập nhật trạng thái
    fail(e instanceof Error ? e.message : String(e));
  }
}

/** Gọi 1 lần khi server khởi động: chạy tiếp job còn trong hàng. */
export function resumePublishQueue(): void {
  if (jobs.some((j) => j.status === "queued")) void processQueue();
}
