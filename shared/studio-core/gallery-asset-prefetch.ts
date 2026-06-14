/**
 * Gallery asset prefetch — Phase 4d.x.
 *
 * Tải ảnh từ Wikimedia/Met về /tmp/ trước khi Remotion render → render
 * fetch từ localhost thay vì remote CDN. Giải quyết:
 *  - Network glitch / timeout khi Remotion fetch nhiều frame
 *  - Wikimedia User-Agent policy (yêu cầu identifiable UA)
 *  - Repeated fetch của cùng 1 ảnh qua nhiều frames
 *  - Reproducible render — không phụ thuộc remote availability
 *
 * Cache filename = "gallery-asset-{safeId}.{ext}". Skip download nếu file
 * đã tồn tại (size > 100 bytes — guard against truncated/empty).
 *
 * User-Agent format theo Wikimedia policy:
 *   https://meta.wikimedia.org/wiki/User-Agent_policy
 */
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { PATHS } from "./paths";

const PREFETCH_DIR = PATHS.TMP_DIR;
const USER_AGENT =
  "PodcastBuilder/1.0 (studio render; gallery documentary)";

/** Extract extension từ URL — fallback "jpg". */
const safeExt = (url: string): string => {
  const cleaned = url.split("?")[0]!;
  const m = cleaned.match(/\.([a-zA-Z]{2,5})$/);
  if (!m) return "jpg";
  const ext = m[1].toLowerCase();
  // Validate common image extensions
  if (
    ["jpg", "jpeg", "png", "webp", "gif", "bmp", "tiff", "svg"].includes(ext)
  ) {
    return ext;
  }
  return "jpg";
};

const localFilenameFor = (assetId: string, url: string): string => {
  const ext = safeExt(url);
  // asset ids: "wikimedia:File:Mona_Lisa.jpg" / "met:436105" / etc.
  // → safe filename (no slashes/colons/special)
  const safeId = assetId.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 100);
  return `gallery-asset-${safeId}.${ext}`;
};

export type PrefetchResult = {
  /** Filename relative TMP_DIR (vd "gallery-asset-wikimedia_File_Mona.jpg") */
  filename: string;
  /** Relative HTTP path (vd "/tmp/gallery-asset-...") — caller prepend base */
  localPath: string;
  /** True nếu đã cached, false nếu vừa download. */
  fromCache: boolean;
};

/**
 * Đảm bảo asset có local copy. Idempotent — skip download nếu cached.
 */
export async function prefetchAsset(input: {
  assetId: string;
  remoteUrl: string;
}): Promise<PrefetchResult> {
  const filename = localFilenameFor(input.assetId, input.remoteUrl);
  const filePath = path.join(PREFETCH_DIR, filename);

  // Cache check — file tồn tại + size hợp lý
  if (fs.existsSync(filePath)) {
    const stat = await fsp.stat(filePath);
    if (stat.size > 100) {
      return {
        filename,
        localPath: `/tmp/${filename}`,
        fromCache: true,
      };
    }
    // Truncated/empty → re-download
  }

  await fsp.mkdir(PREFETCH_DIR, { recursive: true });

  // Wikimedia yêu cầu User-Agent identifiable
  const res = await fetch(input.remoteUrl, {
    headers: { "User-Agent": USER_AGENT },
    redirect: "follow",
  });
  if (!res.ok) {
    throw new Error(
      `Asset prefetch failed ${res.status}: ${input.remoteUrl.slice(0, 200)}`,
    );
  }
  const arrayBuf = await res.arrayBuffer();
  if (arrayBuf.byteLength < 100) {
    throw new Error(
      `Asset prefetch trả về empty/truncated (${arrayBuf.byteLength} bytes): ${input.remoteUrl}`,
    );
  }
  await fsp.writeFile(filePath, Buffer.from(arrayBuf));

  return {
    filename,
    localPath: `/tmp/${filename}`,
    fromCache: false,
  };
}

/**
 * Prefetch nhiều asset song song (limit concurrency 4 để không spam CDN).
 * Trả Map<assetId, localPath> — caller dùng để swap remote URL.
 */
export async function prefetchAssetsBatch(
  assets: Array<{ assetId: string; remoteUrl: string }>,
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  const CONCURRENCY = 4;

  // Dedup theo assetId
  const unique = new Map<string, { assetId: string; remoteUrl: string }>();
  for (const a of assets) {
    if (!unique.has(a.assetId)) unique.set(a.assetId, a);
  }
  const list = [...unique.values()];

  // Run in batches of CONCURRENCY
  for (let i = 0; i < list.length; i += CONCURRENCY) {
    const batch = list.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(
      batch.map((a) => prefetchAsset(a)),
    );
    for (let j = 0; j < batch.length; j++) {
      const r = results[j];
      const a = batch[j];
      if (r.status === "fulfilled") {
        result.set(a.assetId, r.value.localPath);
      } else {
        // Log error nhưng không throw — beat sẽ fallback render placeholder
        console.warn(
          `[gallery-prefetch] Failed ${a.assetId}: ${r.reason?.message ?? r.reason}`,
        );
      }
    }
  }

  return result;
}
