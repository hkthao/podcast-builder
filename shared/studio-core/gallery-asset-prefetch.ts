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
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { PATHS } from "./paths";

const execFileAsync = promisify(execFile);

/**
 * Max bytes trước khi resize. Wikimedia full-res có thể 50-100MB JPG → Remotion
 * Chromium fail load image quá to. Resize xuống ≤ MAX_WIDTH preserve aspect.
 */
const RESIZE_THRESHOLD_BYTES = 5 * 1024 * 1024; // 5MB
const MAX_WIDTH = 2400; // > 1920 (composition width) để giữ pan/zoom quality

const resizeImage = async (filePath: string): Promise<void> => {
  const tmpOut = `${filePath}.resized.jpg`;
  // Try sips (macOS built-in) ưu tiên — handle ảnh huge 50-100MB tốt hơn
  // ffmpeg (ffmpeg mjpeg decoder reject ảnh dimension > ~32k px).
  try {
    await execFileAsync("sips", [
      "-Z",
      String(MAX_WIDTH), // -Z fit dimension trong bounding box, preserve aspect
      filePath,
      "--out",
      tmpOut,
    ]);
    await fsp.rename(tmpOut, filePath);
    return;
  } catch {
    // Fall back ffmpeg cho non-macOS environments (Linux/Windows server)
  }

  await execFileAsync("ffmpeg", [
    "-y",
    "-i",
    filePath,
    "-vf",
    `scale='min(${MAX_WIDTH},iw)':-1:flags=lanczos`,
    "-q:v",
    "3",
    tmpOut,
  ]);
  await fsp.rename(tmpOut, filePath);
};

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
  // Short-circuit khi remoteUrl đã là local /tmp/ URL (vd resolver-cached
  // gallery assets: /tmp/gallery-assets/<plan>/<hash>.jpg). File đã ở disk,
  // không cần download — trả thẳng path cho render fetch qua studio static.
  if (input.remoteUrl.startsWith("/tmp/")) {
    return {
      filename: path.basename(input.remoteUrl),
      localPath: input.remoteUrl,
      fromCache: true,
    };
  }
  const filename = localFilenameFor(input.assetId, input.remoteUrl);
  const filePath = path.join(PREFETCH_DIR, filename);

  // Cache check — file tồn tại + size hợp lý
  if (fs.existsSync(filePath)) {
    const stat = await fsp.stat(filePath);
    if (stat.size > 100) {
      // Nếu cached file quá lớn (legacy từ trước khi có resize) → resize tại chỗ
      if (stat.size > RESIZE_THRESHOLD_BYTES) {
        try {
          await resizeImage(filePath);
        } catch (e) {
          console.warn(
            `[gallery-prefetch] Cache resize fail ${filename}: ${(e as Error).message}`,
          );
        }
      }
      return {
        filename,
        localPath: `/tmp/${filename}`,
        fromCache: true,
      };
    }
    // Truncated/empty → re-download
  }

  await fsp.mkdir(PREFETCH_DIR, { recursive: true });

  // Wikimedia rate-limit 200 req/min/IP → retry 429 với exponential backoff.
  const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
  let res: Response | null = null;
  for (let attempt = 0; attempt < 4; attempt++) {
    res = await fetch(input.remoteUrl, {
      headers: { "User-Agent": USER_AGENT },
      redirect: "follow",
    });
    if (res.ok) break;
    if (res.status === 429 || res.status === 503) {
      // Honor Retry-After nếu có, default exp backoff 1s/2s/4s
      const retryAfter = Number(res.headers.get("retry-after")) || 0;
      const delayMs = retryAfter
        ? retryAfter * 1000
        : Math.min(8000, 1000 * 2 ** attempt);
      console.warn(
        `[gallery-prefetch] ${res.status} rate-limited, retry ${attempt + 1}/3 sau ${delayMs}ms`,
      );
      await sleep(delayMs);
      continue;
    }
    // Other errors → break, throw bên dưới
    break;
  }
  if (!res || !res.ok) {
    throw new Error(
      `Asset prefetch failed ${res?.status ?? "no-response"}: ${input.remoteUrl.slice(0, 200)}`,
    );
  }
  const arrayBuf = await res.arrayBuffer();
  if (arrayBuf.byteLength < 100) {
    throw new Error(
      `Asset prefetch trả về empty/truncated (${arrayBuf.byteLength} bytes): ${input.remoteUrl}`,
    );
  }
  await fsp.writeFile(filePath, Buffer.from(arrayBuf));

  // Resize nếu file lớn — Remotion Chromium fail load image > ~20MB hoặc
  // texture quá to. Wikimedia full-res có thể 50-100MB → ffmpeg scale.
  if (arrayBuf.byteLength > RESIZE_THRESHOLD_BYTES) {
    try {
      await resizeImage(filePath);
    } catch (e) {
      // Resize fail → keep original, warning. Remotion có thể vẫn fail nhưng
      // ít nhất prefetch không block.
      console.warn(
        `[gallery-prefetch] Resize fail cho ${filename}: ${(e as Error).message}`,
      );
    }
  }

  return {
    filename,
    localPath: `/tmp/${filename}`,
    fromCache: false,
  };
}

/**
 * Prefetch nhiều asset SEQUENTIALLY với delay giữa requests — Wikimedia
 * rate-limit 200 req/min/IP nên concurrency cao = 429. Concurrency 1 + 250ms
 * delay = ~4 req/s = tránh rate-limit. Tổng thời gian cho ~30 asset = 7-8s
 * (downloads thực + delay).
 *
 * Trả Map<assetId, localPath> — caller dùng để swap remote URL.
 */
export async function prefetchAssetsBatch(
  assets: Array<{ assetId: string; remoteUrl: string }>,
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  const DELAY_MS = 250;

  // Dedup theo assetId
  const unique = new Map<string, { assetId: string; remoteUrl: string }>();
  for (const a of assets) {
    if (!unique.has(a.assetId)) unique.set(a.assetId, a);
  }
  const list = [...unique.values()];

  for (let i = 0; i < list.length; i++) {
    const a = list[i];
    try {
      const r = await prefetchAsset(a);
      result.set(a.assetId, r.localPath);
      // Delay chỉ khi vừa download (cache hit không cần delay)
      if (!r.fromCache && i < list.length - 1) {
        await new Promise<void>((res) => setTimeout(res, DELAY_MS));
      }
    } catch (e) {
      console.warn(
        `[gallery-prefetch] Failed ${a.assetId}: ${(e as Error).message}`,
      );
    }
  }

  return result;
}
