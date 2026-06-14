/**
 * Wikimedia Commons provider — public domain artwork + photo search.
 *
 * Docs: https://commons.wikimedia.org/w/api.php?action=help
 *
 * Strategy:
 *   1. `list=search&srnamespace=6` (File namespace) → list of file pages matching query
 *   2. `prop=imageinfo&iiprop=url|extmetadata|mime|size` cho top N hits → thumbnail + license
 *   3. Map → AssetResult, classify license dựa trên LicenseShortName.
 *
 * KHÔNG cần API key. CORS OK nhưng vẫn proxy qua Hono cho đồng nhất shape.
 *
 * License classification:
 *   - "Public domain" / "PD-old-100" / "PD-Art" → safe
 *   - "CC BY" / "CC BY-SA" → check (free nhưng cần ghi công)
 *   - Other (unknown / restricted) → check
 */
import type {
  AssetProvider,
  AssetResult,
  LicenseStatus,
  ProviderInfo,
  SearchArgs,
  SearchResponse,
} from "./types";

const BASE = "https://commons.wikimedia.org/w/api.php";
const USER_AGENT =
  "PodcastBuilderStudio/0.1 (https://github.com/podcast-builder)";

/** MIME prefix → AssetKind. */
function mimeToKind(mime: string): "image" | "video" | "audio" | null {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  return null;
}

function classifyLicense(licenseShort: string): LicenseStatus {
  const s = licenseShort.toLowerCase();
  if (
    s.includes("public domain") ||
    s.includes("pd-art") ||
    s.includes("pd-old") ||
    s === "pd" ||
    s.includes("cc0")
  ) {
    return "safe";
  }
  if (s.includes("cc by") || s.includes("cc-by") || s.includes("attribution")) {
    return "check"; // free nhưng cần credit
  }
  return "check";
}

function getExtMeta(
  extmetadata: Record<string, { value?: string }> | undefined,
  key: string,
): string | undefined {
  const entry = extmetadata?.[key];
  if (!entry?.value) return undefined;
  // Strip HTML tags + decode entities (HTML cơ bản)
  return entry.value
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

type CommonsSearchResponse = {
  query?: {
    search?: Array<{
      title: string;
      pageid: number;
      snippet?: string;
    }>;
    searchinfo?: { totalhits?: number };
  };
};

type CommonsImageinfoResponse = {
  query?: {
    pages?: Record<
      string,
      {
        title?: string;
        imageinfo?: Array<{
          url?: string;
          thumburl?: string;
          mime?: string;
          width?: number;
          height?: number;
          duration?: number;
          descriptionurl?: string;
          extmetadata?: Record<string, { value?: string }>;
        }>;
      }
    >;
  };
};

async function callApi<T>(
  params: Record<string, string>,
  signal?: AbortSignal,
): Promise<T> {
  const url = new URL(BASE);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set("format", "json");
  url.searchParams.set("origin", "*"); // CORS-friendly though we proxy
  const res = await fetch(url.toString(), {
    headers: { "User-Agent": USER_AGENT },
    signal,
  });
  if (!res.ok) {
    throw new Error(`Wikimedia API ${res.status}: ${res.statusText}`);
  }
  return (await res.json()) as T;
}

async function searchWikimedia(args: SearchArgs): Promise<SearchResponse> {
  const { query, kind, page = 1, pageSize = 20, signal } = args;
  if (!query.trim()) return { results: [], hasNextPage: false };

  // Step 1: search File namespace với MIME filter qua "filemime"
  const filemime =
    kind === "image" ? "image" : kind === "video" ? "video" : "audio";
  const offset = (page - 1) * pageSize;
  const searchData = await callApi<CommonsSearchResponse>(
    {
      action: "query",
      list: "search",
      srnamespace: "6",
      srsearch: `${query} filemime:${filemime}/`,
      srlimit: String(pageSize),
      sroffset: String(offset),
      srprop: "snippet",
    },
    signal,
  );
  const hits = searchData.query?.search ?? [];
  if (hits.length === 0) {
    return {
      results: [],
      hasNextPage: false,
      total: searchData.query?.searchinfo?.totalhits ?? 0,
    };
  }

  // Step 2: fetch imageinfo cho các pages
  const titles = hits.map((h) => h.title).join("|");
  const infoData = await callApi<CommonsImageinfoResponse>(
    {
      action: "query",
      prop: "imageinfo",
      iiprop: "url|mime|size|extmetadata",
      iiurlwidth: "400", // request thumbnail size
      titles,
    },
    signal,
  );

  const pages = infoData.query?.pages ?? {};
  const results: AssetResult[] = [];
  for (const hit of hits) {
    // Find page by title (pages keyed by pageid string)
    const page = Object.values(pages).find((p) => p.title === hit.title);
    if (!page) continue;
    const ii = page.imageinfo?.[0];
    if (!ii?.url || !ii.mime) continue;
    const detectedKind = mimeToKind(ii.mime);
    if (!detectedKind || detectedKind !== kind) continue;

    const meta = ii.extmetadata ?? {};
    const licenseShort =
      getExtMeta(meta, "LicenseShortName") ??
      getExtMeta(meta, "License") ??
      "Unknown";
    const author = getExtMeta(meta, "Artist");
    const year =
      getExtMeta(meta, "DateTimeOriginal") ??
      getExtMeta(meta, "DateTime") ??
      undefined;
    // Title: strip "File:" prefix + extension
    const cleanTitle = hit.title
      .replace(/^File:/, "")
      .replace(/\.[a-zA-Z]+$/, "")
      .replace(/_/g, " ");

    const result: AssetResult = {
      id: `wikimedia:${hit.pageid}`,
      provider: "wikimedia",
      kind: detectedKind,
      title: cleanTitle,
      author,
      year: year ? year.slice(0, 10) : undefined,
      thumbUrl: ii.thumburl ?? ii.url,
      fullUrl: ii.url,
      sourcePage:
        ii.descriptionurl ??
        `https://commons.wikimedia.org/wiki/${encodeURIComponent(hit.title)}`,
      license: licenseShort,
      licenseStatus: classifyLicense(licenseShort),
      width: ii.width,
      height: ii.height,
      durationMs:
        typeof ii.duration === "number" ? Math.round(ii.duration * 1000) : undefined,
    };
    results.push(result);
  }

  return {
    results,
    hasNextPage: hits.length === pageSize,
    total: searchData.query?.searchinfo?.totalhits,
  };
}

const info: ProviderInfo = {
  id: "wikimedia",
  label: "Wikimedia Commons",
  kinds: ["image", "video", "audio"],
  needsKey: false,
  enabled: true,
  note: "Public domain + open licenses · không cần API key",
};

export const wikimediaProvider: AssetProvider = {
  info,
  search: searchWikimedia,
};
