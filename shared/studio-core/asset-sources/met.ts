/**
 * Met Museum (Metropolitan Museum of Art) provider — open access collection.
 *
 * Docs: https://metmuseum.github.io/ (no key, rate limit 80 req/sec)
 *
 * Strategy:
 *   1. `/public/collection/v1/search?q=...&hasImages=true&isPublicDomain=true`
 *      → mảng objectIDs (có thể trả hàng nghìn).
 *   2. Slice top N IDs (theo page) → GET `/objects/{id}` từng cái (parallel batches).
 *   3. Filter object có `primaryImage` URL → map AssetResult.
 *
 * License: Met chỉ trả `isPublicDomain` boolean. Nếu true → `safe` (CC0).
 * Met chỉ có image, KHÔNG có video/audio.
 *
 * Lưu ý: API chậm hơn Wikimedia (Met phải GET từng object). Limit page size 12
 * để giữ < 1s mỗi search.
 */
import type {
  AssetProvider,
  AssetResult,
  ProviderInfo,
  SearchArgs,
  SearchResponse,
} from "./types";

const BASE = "https://collectionapi.metmuseum.org/public/collection/v1";
const FETCH_TIMEOUT_MS = 10_000;
const MAX_PAGE_SIZE = 12; // Met chậm — limit thấp hơn default 20

type MetSearchResponse = {
  total?: number;
  objectIDs?: number[] | null;
};

type MetObject = {
  objectID: number;
  isPublicDomain: boolean;
  primaryImage: string;          // full-resolution image URL
  primaryImageSmall: string;     // thumbnail
  title: string;
  artistDisplayName?: string;
  objectDate?: string;            // "1305" or "c. 1305"
  objectName?: string;
  medium?: string;
  dimensions?: string;
  repository?: string;
  objectURL?: string;             // page link
  classification?: string;
};

async function fetchJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  // Compose timeout signal nếu caller signal đã có
  const ctrl = new AbortController();
  const timeoutId = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  signal?.addEventListener("abort", () => ctrl.abort());
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`Met API ${res.status}: ${res.statusText}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function searchMet(args: SearchArgs): Promise<SearchResponse> {
  const { query, kind, page = 1, pageSize: pageSizeRaw = 12, signal } = args;
  if (kind !== "image") {
    return { results: [], hasNextPage: false }; // Met chỉ có image
  }
  if (!query.trim()) return { results: [], hasNextPage: false };

  const pageSize = Math.min(MAX_PAGE_SIZE, pageSizeRaw);
  const offset = (page - 1) * pageSize;

  // Step 1: get list of objectIDs
  const searchUrl = new URL(`${BASE}/search`);
  searchUrl.searchParams.set("q", query);
  searchUrl.searchParams.set("hasImages", "true");
  searchUrl.searchParams.set("isPublicDomain", "true");

  const searchData = await fetchJson<MetSearchResponse>(
    searchUrl.toString(),
    signal,
  );
  const allIds = searchData.objectIDs ?? [];
  if (allIds.length === 0) {
    return { results: [], hasNextPage: false, total: 0 };
  }

  const pageIds = allIds.slice(offset, offset + pageSize);

  // Step 2: parallel fetch object details (batch up to pageSize)
  const objectResults = await Promise.allSettled(
    pageIds.map((id) =>
      fetchJson<MetObject>(`${BASE}/objects/${id}`, signal),
    ),
  );

  const results: AssetResult[] = [];
  for (let i = 0; i < objectResults.length; i++) {
    const r = objectResults[i]!;
    if (r.status !== "fulfilled") continue;
    const obj = r.value;
    if (!obj.primaryImage) continue; // skip nếu không có ảnh full
    if (!obj.isPublicDomain) continue; // double-check (search đã filter rồi nhưng safe)

    results.push({
      id: `met:${obj.objectID}`,
      provider: "met",
      kind: "image",
      title: obj.title || obj.objectName || "Untitled",
      author: obj.artistDisplayName || undefined,
      year: obj.objectDate || undefined,
      thumbUrl: obj.primaryImageSmall || obj.primaryImage,
      fullUrl: obj.primaryImage,
      sourcePage:
        obj.objectURL ||
        `https://www.metmuseum.org/art/collection/search/${obj.objectID}`,
      license: "Public Domain (CC0)",
      licenseStatus: "safe",
    });
  }

  return {
    results,
    hasNextPage: offset + pageSize < allIds.length,
    total: allIds.length,
  };
}

const info: ProviderInfo = {
  id: "met",
  label: "Met Museum",
  kinds: ["image"],
  needsKey: false,
  enabled: true,
  note: "Open access · public domain (CC0) artwork · image only",
};

export const metProvider: AssetProvider = {
  info,
  search: searchMet,
};
