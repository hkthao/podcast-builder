/**
 * Coverr provider — stock video b-roll / background (video only).
 *
 * Docs: https://api.coverr.co/docs/
 *
 * Strategy:
 *   - kind=video → GET /videos?query=...&page=N&page_size=M&urls=true
 *     (urls=true bắt buộc để response trả link mp4 tải về).
 *   - kind=image/audio → KHÔNG support (Coverr chỉ có video).
 *
 * API key required (Settings → Coverr) hoặc env COVERR_API_KEY. Đăng ký free
 * tại coverr.co → Account → API. Auth qua query param `?api_key=`.
 *
 * License: video Coverr free for commercial use, KHÔNG cần ghi công → "safe".
 *   https://coverr.co/license
 *
 * Lưu ý: shape response Coverr (field tên `urls.mp4`, `poster`, `max_height`…)
 * resolve phòng thủ bằng optional-chaining — nếu Coverr đổi schema thì provider
 * trả rỗng thay vì throw, không vỡ fan-out các provider khác.
 */
import { getApiKey } from "../api-keys-store";
import type {
  AssetProvider,
  AssetResult,
  ProviderInfo,
  SearchArgs,
  SearchResponse,
} from "./types";

const BASE = "https://api.coverr.co/videos";

type CoverrVideo = {
  id?: string;
  title?: string;
  poster?: string;
  thumbnail?: string;
  max_height?: number;
  max_width?: number;
  duration?: number;
  urls?: {
    mp4?: string;
    mp4_download?: string;
    mp4_preview?: string;
  };
};

type CoverrResponse = {
  page?: number;
  pages?: number;
  page_size?: number;
  total?: number;
  hits?: CoverrVideo[];
};

async function searchCoverr(args: SearchArgs): Promise<SearchResponse> {
  if (args.kind !== "video") {
    return { results: [], hasNextPage: false }; // Coverr chỉ có video
  }
  const apiKey = getApiKey("coverr");
  if (!apiKey) {
    throw new Error(
      "Coverr: thiếu API key (Settings → Coverr hoặc COVERR_API_KEY)",
    );
  }
  const { query, page = 1, pageSize = 20, signal } = args;
  if (!query.trim()) return { results: [], hasNextPage: false };

  const url =
    BASE +
    "?" +
    new URLSearchParams({
      api_key: apiKey,
      query,
      // Coverr phân trang 0-based → trừ 1 so với convention 1-based của ta.
      page: String(Math.max(0, page - 1)),
      page_size: String(Math.min(50, pageSize)),
      urls: "true",
    });

  const res = await fetch(url, { signal });
  if (!res.ok) {
    throw new Error(`Coverr API ${res.status}: ${res.statusText}`);
  }
  const data = (await res.json()) as CoverrResponse;
  const hits = data.hits ?? [];
  const results: AssetResult[] = [];
  for (const v of hits) {
    const mp4 = v.urls?.mp4 ?? v.urls?.mp4_download ?? v.urls?.mp4_preview;
    if (!mp4 || !v.id) continue;
    results.push({
      id: `coverr:${v.id}`,
      provider: "coverr",
      kind: "video",
      title: v.title || `Coverr video ${v.id}`,
      thumbUrl: v.poster ?? v.thumbnail ?? mp4,
      fullUrl: mp4,
      sourcePage: `https://coverr.co/videos/${v.id}`,
      license: "Coverr License (free use, no credit required)",
      licenseStatus: "safe",
      width: v.max_width,
      height: v.max_height,
      durationMs:
        typeof v.duration === "number"
          ? Math.round(v.duration * 1000)
          : undefined,
    });
  }
  const pages = data.pages ?? page;
  return {
    results,
    hasNextPage: page < pages,
    total: data.total,
  };
}

function buildInfo(): ProviderInfo {
  const hasKey = !!getApiKey("coverr");
  return {
    id: "coverr",
    label: "Coverr (b-roll)",
    kinds: ["video"],
    needsKey: true,
    enabled: hasKey,
    note: hasKey
      ? "Stock video b-roll / background · free use no credit"
      : "Cần API key — Settings → Coverr (free tại coverr.co → API)",
  };
}

export const coverrProvider: AssetProvider = {
  get info() {
    return buildInfo();
  },
  search: searchCoverr,
};
