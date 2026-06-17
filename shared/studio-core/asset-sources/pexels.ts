/**
 * Pexels provider — stock photo + video search (CC-equivalent, free).
 *
 * Docs: https://www.pexels.com/api/documentation/
 *
 * Strategy:
 *   - kind=image  → /v1/search           → photos
 *   - kind=video  → /videos/search       → videos
 *   - kind=audio  → KHÔNG support (Pexels không có audio)
 *
 * API key required (Settings → Pexels) hoặc env PEXELS_API_KEY. Nếu thiếu
 * key, provider trả `enabled: false` → research-routes ẩn khỏi fan-out.
 *
 * License classification: tất cả ảnh/video Pexels free for commercial use
 * không cần credit (CC0-equivalent) → mark "safe".
 *   https://www.pexels.com/license/
 */
import { getApiKey } from "../api-keys-store";
import type {
  AssetProvider,
  AssetResult,
  ProviderInfo,
  SearchArgs,
  SearchResponse,
} from "./types";

const PHOTO_BASE = "https://api.pexels.com/v1/search";
const VIDEO_BASE = "https://api.pexels.com/videos/search";

type PexelsPhoto = {
  id: number;
  url: string;
  width?: number;
  height?: number;
  photographer?: string;
  src: {
    original?: string;
    large2x?: string;
    large?: string;
    medium?: string;
    small?: string;
  };
};

type PexelsPhotoResponse = {
  photos?: PexelsPhoto[];
  total_results?: number;
  next_page?: string;
};

type PexelsVideoFile = {
  link: string;
  height?: number;
  width?: number;
  quality?: string;
};

type PexelsVideo = {
  id: number;
  url: string;
  width?: number;
  height?: number;
  duration?: number;
  user?: { name?: string };
  image?: string;
  video_files?: PexelsVideoFile[];
};

type PexelsVideoResponse = {
  videos?: PexelsVideo[];
  total_results?: number;
  next_page?: string;
};

function pickVideoFile(files: PexelsVideoFile[]): PexelsVideoFile | null {
  if (files.length === 0) return null;
  // Prefer HD (≤1080p) — full HD enough cho render, smaller download.
  const hd = files.filter((f) => (f.height ?? 0) <= 1080);
  const pool = hd.length > 0 ? hd : files;
  return [...pool].sort((a, b) => (b.height ?? 0) - (a.height ?? 0))[0];
}

async function searchPhotos(args: SearchArgs): Promise<SearchResponse> {
  const apiKey = getApiKey("pexels");
  if (!apiKey) {
    throw new Error("Pexels: thiếu API key (Settings → Pexels hoặc PEXELS_API_KEY)");
  }
  const { query, page = 1, pageSize = 20, signal } = args;
  if (!query.trim()) return { results: [], hasNextPage: false };
  const url =
    PHOTO_BASE +
    "?" +
    new URLSearchParams({
      query,
      per_page: String(Math.min(80, pageSize)),
      page: String(page),
      orientation: "landscape",
    });
  const res = await fetch(url, {
    headers: { Authorization: apiKey },
    signal,
  });
  if (!res.ok) {
    throw new Error(`Pexels photo API ${res.status}: ${res.statusText}`);
  }
  const data = (await res.json()) as PexelsPhotoResponse;
  const photos = data.photos ?? [];
  const results: AssetResult[] = photos.map((p) => {
    const fullUrl =
      p.src.large2x ?? p.src.original ?? p.src.large ?? p.src.medium ?? "";
    const thumbUrl = p.src.medium ?? p.src.small ?? p.src.large ?? fullUrl;
    return {
      id: `pexels:photo:${p.id}`,
      provider: "pexels",
      kind: "image" as const,
      title: `Pexels photo ${p.id}`,
      author: p.photographer,
      thumbUrl,
      fullUrl,
      sourcePage: p.url,
      license: "Pexels License (free use, no credit required)",
      licenseStatus: "safe" as const,
      width: p.width,
      height: p.height,
    };
  });
  return {
    results,
    hasNextPage: !!data.next_page,
    total: data.total_results,
  };
}

async function searchVideos(args: SearchArgs): Promise<SearchResponse> {
  const apiKey = getApiKey("pexels");
  if (!apiKey) {
    throw new Error("Pexels: thiếu API key (Settings → Pexels hoặc PEXELS_API_KEY)");
  }
  const { query, page = 1, pageSize = 15, signal } = args;
  if (!query.trim()) return { results: [], hasNextPage: false };
  const url =
    VIDEO_BASE +
    "?" +
    new URLSearchParams({
      query,
      per_page: String(Math.min(80, pageSize)),
      page: String(page),
      orientation: "landscape",
    });
  const res = await fetch(url, {
    headers: { Authorization: apiKey },
    signal,
  });
  if (!res.ok) {
    throw new Error(`Pexels video API ${res.status}: ${res.statusText}`);
  }
  const data = (await res.json()) as PexelsVideoResponse;
  const videos = data.videos ?? [];
  const results: AssetResult[] = [];
  for (const v of videos) {
    const file = pickVideoFile(v.video_files ?? []);
    if (!file) continue;
    results.push({
      id: `pexels:video:${v.id}`,
      provider: "pexels",
      kind: "video",
      title: `Pexels video ${v.id}`,
      author: v.user?.name,
      thumbUrl: v.image ?? file.link,
      fullUrl: file.link,
      sourcePage: v.url,
      license: "Pexels License (free use, no credit required)",
      licenseStatus: "safe",
      width: file.width ?? v.width,
      height: file.height ?? v.height,
      durationMs:
        typeof v.duration === "number" ? Math.round(v.duration * 1000) : undefined,
    });
  }
  return {
    results,
    hasNextPage: !!data.next_page,
    total: data.total_results,
  };
}

async function searchPexels(args: SearchArgs): Promise<SearchResponse> {
  if (args.kind === "image") return searchPhotos(args);
  if (args.kind === "video") return searchVideos(args);
  // audio không support
  return { results: [], hasNextPage: false };
}

function buildInfo(): ProviderInfo {
  const hasKey = !!getApiKey("pexels");
  return {
    id: "pexels",
    label: "Pexels (stock)",
    kinds: ["image", "video"],
    needsKey: true,
    enabled: hasKey,
    note: hasKey
      ? "Stock photo + video · free use no credit"
      : "Cần API key — Settings → Pexels (free key tại pexels.com/api)",
  };
}

export const pexelsProvider: AssetProvider = {
  get info() {
    // Dynamic info — enabled state phụ thuộc vào api key tại runtime, không
    // cache để Settings update key mới có hiệu lực ngay.
    return buildInfo();
  },
  search: searchPexels,
};
