import "dotenv/config";
import fs from "node:fs";
import https from "node:https";

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

/** Chọn 1 file dọc ≥ minHeight (nhỏ nhất đủ nét); fallback file dọc lớn nhất. */
const pickPortraitFile = (v: any, minHeight: number): any => {
  const files = (v.video_files || [])
    .filter((f: any) => f.height && f.width && f.height > f.width)
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
 * Tìm video Pexels theo query. Mặc định dọc (portrait). Trả ứng viên đã chọn
 * file ≥ minHeight. Params theo docs/pexels-api.md (/videos/search).
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
    const dur = v.duration ?? 0;
    if (dur < minDur || dur > maxDur) continue;
    const pick = pickPortraitFile(v, minHeight);
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
    const pick = pickPortraitFile(v, opts.minHeight ?? 1080);
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
