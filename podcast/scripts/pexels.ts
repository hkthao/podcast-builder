import "dotenv/config";
import fs from "node:fs";
import https from "node:https";
import path from "node:path";

/**
 * Pexels video API client — lấy b-roll dọc 9:16 lấp chỗ footage tự quay không
 * khớp chủ đề. Pexels = stock (dùng chung nhiều kênh) → CHỈ dùng làm FALLBACK
 * cho beat thiếu, luôn qua FootageLayer (blur+tối+phủ ink) để "meaningful
 * enhancement", ưu tiên footage tự quay. Xem docs/originality-upgrade-plan.md.
 *
 * Tham chiếu API đầy đủ (endpoints/params/rate-limit/object shape):
 *   docs/pexels-api.md — https://www.pexels.com/api/documentation/
 *
 * License Pexels: free, thương mại OK, không bắt buộc ghi công (nhưng NÊN ghi
 * tác giả trong phần công bố — xem PublishTab §5.1). Rate limit: 200 req/giờ,
 * 20k/tháng; đọc header X-Ratelimit-Remaining qua opts.onRateLimit nếu cần.
 */

const API_BASE = "https://api.pexels.com";

export type PexelsVideo = {
  id: number;
  author: string;
  authorUrl: string;
  durationS: number;
  width: number;
  height: number;
  fileUrl: string;
  fileW: number;
  fileH: number;
};

export type RateLimit = { limit: number; remaining: number; reset: number };
export type Orientation = "portrait" | "landscape" | "square";
export type PexelsSize = "large" | "medium" | "small";

const KEY = () => process.env.PEXELS_API_KEY || "";

/**
 * Blocklist tác giả/video Pexels bị chặn bản quyền (Meta/FB block reel).
 * Nguồn: input/_footage-blocklist.json. Nạp 1 lần (cache). Mọi video thuộc
 * tác giả / URL / id trong danh sách sẽ bị loại khỏi kết quả search → footage
 * không bao giờ tải lại clip đã gây strike. Thêm tác giả mới = sửa file JSON,
 * KHÔNG cần đổi code.
 */
type Blocklist = { authors: Set<string>; authorUrls: Set<string>; videoIds: Set<number> };
let _blocklist: Blocklist | null = null;
const loadBlocklist = (): Blocklist => {
  if (_blocklist) return _blocklist;
  const bl: Blocklist = { authors: new Set(), authorUrls: new Set(), videoIds: new Set() };
  try {
    const p = path.resolve("input/_footage-blocklist.json");
    const j = JSON.parse(fs.readFileSync(p, "utf-8"));
    for (const a of j.authors ?? []) bl.authors.add(String(a).trim().toLowerCase());
    for (const u of j.authorUrls ?? []) bl.authorUrls.add(String(u).trim().toLowerCase());
    for (const id of j.videoIds ?? []) {
      const n = Number(id);
      if (!Number.isNaN(n)) bl.videoIds.add(n);
    }
  } catch {
    /* không có file blocklist → rỗng */
  }
  _blocklist = bl;
  return bl;
};

/** Video Pexels thuộc tác giả/URL/id bị chặn bản quyền? */
const isBlockedPexels = (v: any): boolean => {
  const bl = loadBlocklist();
  if (!bl.authors.size && !bl.authorUrls.size && !bl.videoIds.size) return false;
  const name = String(v.user?.name ?? "").trim().toLowerCase();
  const url = String(v.user?.url ?? "").trim().toLowerCase();
  const id = Number(v.id);
  if (name && bl.authors.has(name)) return true;
  if (url && bl.authorUrls.has(url)) return true;
  for (const slug of bl.authorUrls) if (slug && url.includes(slug)) return true;
  if (!Number.isNaN(id) && bl.videoIds.has(id)) return true;
  return false;
};

/** GET JSON + đọc header rate-limit (X-Ratelimit-*). */
const getJson = (
  url: string,
  onRateLimit?: (rl: RateLimit) => void,
): Promise<any> =>
  new Promise((resolve, reject) => {
    if (!KEY()) return reject(new Error("Thiếu PEXELS_API_KEY trong .env"));
    https
      .get(url, { headers: { Authorization: KEY() } }, (res) => {
        if (onRateLimit) {
          const h = res.headers;
          const lim = Number(h["x-ratelimit-limit"]);
          const rem = Number(h["x-ratelimit-remaining"]);
          const rst = Number(h["x-ratelimit-reset"]);
          if (!Number.isNaN(rem)) onRateLimit({ limit: lim, remaining: rem, reset: rst });
        }
        let d = "";
        res.on("data", (c) => (d += c));
        res.on("end", () => {
          try {
            resolve(JSON.parse(d));
          } catch (e) {
            reject(new Error(`Pexels JSON lỗi: ${(e as Error).message}`));
          }
        });
      })
      .on("error", reject);
  });

/**
 * Chọn 1 file đúng hướng (dọc: cao>rộng, ngang: rộng>cao) có chiều cao ≥
 * minHeight (nhỏ nhất đủ nét); fallback file đúng hướng lớn nhất.
 */
const pickFile = (v: any, minHeight: number, orientation: Orientation = "portrait"): any => {
  const files = (v.video_files || [])
    .filter((f: any) =>
      f.height && f.width &&
      (orientation === "landscape" ? f.width > f.height
        : orientation === "square" ? f.width === f.height
        : f.height > f.width),
    )
    .sort((a: any, b: any) => b.height - a.height);
  const ok = files.filter((f: any) => f.height >= minHeight);
  return ok.length ? ok[ok.length - 1] : files[0];
};

const mapVideo = (v: any, pick: any): PexelsVideo => ({
  id: v.id,
  author: v.user?.name ?? "Pexels",
  authorUrl: v.user?.url ?? "",
  durationS: v.duration ?? 0,
  width: v.width,
  height: v.height,
  fileUrl: pick.link,
  fileW: pick.width,
  fileH: pick.height,
});

/**
 * Tìm video Pexels theo query. Mặc định dọc (portrait); "landscape" cho bản
 * YouTube 16:9. Trả ứng viên đã chọn file đúng hướng có chiều cao ≥ minHeight. Params theo docs/pexels-api.md (/videos/search).
 */
export async function searchPexelsVideos(
  query: string,
  opts: {
    perPage?: number;
    page?: number;
    minHeight?: number;
    minDurationS?: number;
    maxDurationS?: number;
    orientation?: Orientation;
    size?: PexelsSize;
    onRateLimit?: (rl: RateLimit) => void;
  } = {},
): Promise<PexelsVideo[]> {
  const perPage = Math.min(opts.perPage ?? 8, 80); // API max 80
  const page = opts.page ?? 1;
  const minHeight = opts.minHeight ?? 1080;
  const minDur = opts.minDurationS ?? 4;
  const maxDur = opts.maxDurationS ?? Infinity;
  const orientation = opts.orientation ?? "portrait";
  const size = opts.size ?? "medium";
  const url =
    `${API_BASE}/videos/search?query=${encodeURIComponent(query)}` +
    `&orientation=${orientation}&size=${size}&per_page=${perPage}&page=${page}`;
  const j = await getJson(url, opts.onRateLimit);
  const vids = Array.isArray(j.videos) ? j.videos : [];
  const out: PexelsVideo[] = [];
  for (const v of vids) {
    if (isBlockedPexels(v)) continue; // tác giả/clip bị chặn bản quyền
    const dur = v.duration ?? 0;
    if (dur < minDur || dur > maxDur) continue;
    const pick = pickFile(v, minHeight, orientation);
    if (pick) out.push(mapVideo(v, pick));
  }
  return out;
}

/**
 * Video phổ biến (/videos/popular) — lọc theo kích thước/thời lượng. Hữu ích
 * khi muốn b-roll chất lượng cao chung chung (không theo query). docs/pexels-api.md.
 */
export async function getPopularPexelsVideos(
  opts: {
    perPage?: number;
    page?: number;
    minWidth?: number;
    minHeight?: number;
    minDurationS?: number;
    maxDurationS?: number;
    onRateLimit?: (rl: RateLimit) => void;
  } = {},
): Promise<PexelsVideo[]> {
  const perPage = Math.min(opts.perPage ?? 15, 80);
  const page = opts.page ?? 1;
  const params = new URLSearchParams({ per_page: String(perPage), page: String(page) });
  if (opts.minWidth) params.set("min_width", String(opts.minWidth));
  if (opts.minHeight) params.set("min_height", String(opts.minHeight));
  if (opts.minDurationS) params.set("min_duration", String(opts.minDurationS));
  if (opts.maxDurationS) params.set("max_duration", String(opts.maxDurationS));
  const j = await getJson(`${API_BASE}/videos/popular?${params}`, opts.onRateLimit);
  const vids = Array.isArray(j.videos) ? j.videos : [];
  const out: PexelsVideo[] = [];
  for (const v of vids) {
    if (isBlockedPexels(v)) continue; // tác giả/clip bị chặn bản quyền
    const pick = pickFile(v, opts.minHeight ?? 1080);
    if (pick) out.push(mapVideo(v, pick));
  }
  return out;
}

/** Tải 1 file video Pexels về dest (theo redirect). */
export async function downloadPexelsVideo(
  fileUrl: string,
  dest: string,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const go = (url: string, depth: number) => {
      if (depth > 5) return reject(new Error("Quá nhiều redirect"));
      https
        .get(url, (res) => {
          if (
            res.statusCode &&
            res.statusCode >= 300 &&
            res.statusCode < 400 &&
            res.headers.location
          ) {
            res.resume();
            return go(res.headers.location, depth + 1);
          }
          if (res.statusCode !== 200) {
            res.resume();
            return reject(new Error(`Tải Pexels lỗi HTTP ${res.statusCode}`));
          }
          const f = fs.createWriteStream(dest);
          res.pipe(f);
          f.on("finish", () => f.close(() => resolve()));
          f.on("error", reject);
        })
        .on("error", reject);
    };
    go(fileUrl, 0);
  });
}
