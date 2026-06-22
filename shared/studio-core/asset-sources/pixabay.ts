/**
 * Pixabay provider — stock photo + illustration + video (Pixabay License).
 *
 * Docs: https://pixabay.com/api/docs/
 *
 * Strategy:
 *   - kind=image  → /api/         (image_type=all → photo + illustration + vector)
 *   - kind=video  → /api/videos/  → video files (large/medium/small/tiny)
 *   - kind=audio  → KHÔNG support qua API này (Pixabay music không có public API)
 *
 * API key required (Settings → Pixabay) hoặc env PIXABAY_API_KEY. Free key tại
 * pixabay.com/api/docs (cần đăng nhập). Free tier ~100 req/phút.
 *
 * License: tất cả nội dung Pixabay theo Pixabay Content License — free for
 * commercial use, KHÔNG cần ghi công (CC0-equivalent) → mark "safe".
 *   https://pixabay.com/service/license-summary/
 */
import { getApiKey } from "../api-keys-store";
import type {
  AssetProvider,
  AssetResult,
  ProviderInfo,
  SearchArgs,
  SearchResponse,
} from "./types";

const PHOTO_BASE = "https://pixabay.com/api/";
const VIDEO_BASE = "https://pixabay.com/api/videos/";

type PixabayPhoto = {
  id: number;
  pageURL?: string;
  previewURL?: string;
  webformatURL?: string;
  largeImageURL?: string;
  imageWidth?: number;
  imageHeight?: number;
  user?: string;
};

type PixabayPhotoResponse = {
  total?: number;
  totalHits?: number;
  hits?: PixabayPhoto[];
};

type PixabayVideoFile = {
  url?: string;
  width?: number;
  height?: number;
  thumbnail?: string;
};

type PixabayVideo = {
  id: number;
  pageURL?: string;
  duration?: number;
  user?: string;
  videos?: {
    large?: PixabayVideoFile;
    medium?: PixabayVideoFile;
    small?: PixabayVideoFile;
    tiny?: PixabayVideoFile;
  };
};

type PixabayVideoResponse = {
  total?: number;
  totalHits?: number;
  hits?: PixabayVideo[];
};

/** per_page Pixabay hợp lệ trong [3, 200]. */
const clampPerPage = (n: number): number => Math.max(3, Math.min(200, n));

async function searchPhotos(
  apiKey: string,
  args: SearchArgs,
): Promise<SearchResponse> {
  const { query, page = 1, pageSize = 20, signal } = args;
  const url =
    PHOTO_BASE +
    "?" +
    new URLSearchParams({
      key: apiKey,
      q: query,
      image_type: "all", // photo + illustration + vector
      per_page: String(clampPerPage(pageSize)),
      page: String(page),
      safesearch: "true",
    });
  const res = await fetch(url, { signal });
  if (!res.ok) {
    throw new Error(`Pixabay photo API ${res.status}: ${res.statusText}`);
  }
  const data = (await res.json()) as PixabayPhotoResponse;
  const hits = data.hits ?? [];
  const results: AssetResult[] = hits.map((p) => {
    const fullUrl = p.largeImageURL ?? p.webformatURL ?? p.previewURL ?? "";
    const thumbUrl = p.webformatURL ?? p.previewURL ?? fullUrl;
    return {
      id: `pixabay:photo:${p.id}`,
      provider: "pixabay",
      kind: "image" as const,
      title: `Pixabay image ${p.id}`,
      author: p.user,
      thumbUrl,
      fullUrl,
      sourcePage: p.pageURL ?? `https://pixabay.com/images/id-${p.id}/`,
      license: "Pixabay License (free use, no credit required)",
      licenseStatus: "safe" as const,
      width: p.imageWidth,
      height: p.imageHeight,
    };
  });
  // Pixabay totalHits = số kết quả truy cập được (≤ total). Phân trang theo nó.
  const totalHits = data.totalHits ?? results.length;
  return {
    results,
    hasNextPage: page * clampPerPage(pageSize) < totalHits,
    total: totalHits,
  };
}

/** Chọn file video tốt nhất ≤1080p (đủ cho render, tải nhẹ). */
function pickVideoFile(v: PixabayVideo): PixabayVideoFile | null {
  const files = [
    v.videos?.large,
    v.videos?.medium,
    v.videos?.small,
    v.videos?.tiny,
  ].filter((f): f is PixabayVideoFile => !!f?.url);
  if (files.length === 0) return null;
  const hd = files.filter((f) => (f.height ?? 0) <= 1080);
  const pool = hd.length > 0 ? hd : files;
  return [...pool].sort((a, b) => (b.height ?? 0) - (a.height ?? 0))[0];
}

async function searchVideos(
  apiKey: string,
  args: SearchArgs,
): Promise<SearchResponse> {
  const { query, page = 1, pageSize = 15, signal } = args;
  const url =
    VIDEO_BASE +
    "?" +
    new URLSearchParams({
      key: apiKey,
      q: query,
      per_page: String(clampPerPage(pageSize)),
      page: String(page),
      safesearch: "true",
    });
  const res = await fetch(url, { signal });
  if (!res.ok) {
    throw new Error(`Pixabay video API ${res.status}: ${res.statusText}`);
  }
  const data = (await res.json()) as PixabayVideoResponse;
  const hits = data.hits ?? [];
  const results: AssetResult[] = [];
  for (const v of hits) {
    const file = pickVideoFile(v);
    if (!file?.url) continue;
    results.push({
      id: `pixabay:video:${v.id}`,
      provider: "pixabay",
      kind: "video",
      title: `Pixabay video ${v.id}`,
      author: v.user,
      thumbUrl: file.thumbnail ?? v.videos?.large?.thumbnail ?? file.url,
      fullUrl: file.url,
      sourcePage: v.pageURL ?? `https://pixabay.com/videos/id-${v.id}/`,
      license: "Pixabay License (free use, no credit required)",
      licenseStatus: "safe",
      width: file.width,
      height: file.height,
      durationMs:
        typeof v.duration === "number"
          ? Math.round(v.duration * 1000)
          : undefined,
    });
  }
  const totalHits = data.totalHits ?? results.length;
  return {
    results,
    hasNextPage: page * clampPerPage(pageSize) < totalHits,
    total: totalHits,
  };
}

async function searchPixabay(args: SearchArgs): Promise<SearchResponse> {
  const apiKey = getApiKey("pixabay");
  if (!apiKey) {
    throw new Error(
      "Pixabay: thiếu API key (Settings → Pixabay hoặc PIXABAY_API_KEY)",
    );
  }
  if (!args.query.trim()) return { results: [], hasNextPage: false };
  if (args.kind === "image") return searchPhotos(apiKey, args);
  if (args.kind === "video") return searchVideos(apiKey, args);
  return { results: [], hasNextPage: false }; // audio không support
}

function buildInfo(): ProviderInfo {
  const hasKey = !!getApiKey("pixabay");
  return {
    id: "pixabay",
    label: "Pixabay (stock)",
    kinds: ["image", "video"],
    needsKey: true,
    enabled: hasKey,
    note: hasKey
      ? "Photo + illustration + video · free use no credit"
      : "Cần API key — Settings → Pixabay (free key tại pixabay.com/api/docs)",
  };
}

export const pixabayProvider: AssetProvider = {
  get info() {
    // Dynamic — enabled phụ thuộc api key runtime (Settings update có hiệu lực ngay).
    return buildInfo();
  },
  search: searchPixabay,
};
