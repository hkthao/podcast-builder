/**
 * facebook.ts — client tối giản cho Facebook Graph API để đăng Reel lên 1 Trang.
 *
 * Dùng Page Access Token dài hạn (user tự lấy + lưu qua Settings UI / .env). Không
 * làm OAuth flow ở đây — app chạy local, single-user.
 *
 * Giao thức đăng Reel (resumable, 3 pha) — docs Meta "Publish Reels":
 *   1) start  : POST /{page-id}/video_reels?upload_phase=start   → { video_id, upload_url }
 *   2) upload : POST {upload_url} (rupload) với header Authorization: OAuth, offset, file_size
 *   3) finish : POST /{page-id}/video_reels?upload_phase=finish&video_id=…&video_state=PUBLISHED&description=…
 * Sau finish, Reel còn "processing" → poll GET /{video_id}?fields=status tới khi xong,
 * rồi lấy permalink_url.
 */
import fs from "node:fs";

/** Bump khi cần API mới hơn. */
const GRAPH_VERSION = "v21.0";
const GRAPH = `https://graph.facebook.com/${GRAPH_VERSION}`;

export type FbProgress = (msg: string) => void;

export type PublishReelResult = {
  videoId: string;
  /** URL công khai của Reel (đã prepend host), null nếu Graph chưa trả về kịp. */
  permalink: string | null;
  /** Tên Trang (để user xác nhận đăng đúng chỗ). */
  pageName: string;
  pageId: string;
};

type GraphError = {
  error?: { message?: string; type?: string; code?: number; error_subcode?: number; fbtrace_id?: string };
};

/** Ném lỗi có message thân thiện từ payload Graph. */
const throwGraphError = (body: GraphError, fallback: string): never => {
  const e = body.error;
  if (e?.message) {
    const parts = [e.message];
    if (e.code) parts.push(`(code ${e.code}${e.error_subcode ? `/${e.error_subcode}` : ""})`);
    throw new Error(parts.join(" "));
  }
  throw new Error(fallback);
};

const parseJson = async (res: Response): Promise<unknown> => {
  const text = await res.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { error: { message: `Phản hồi không phải JSON (HTTP ${res.status}): ${text.slice(0, 200)}` } };
  }
};

/**
 * Xác định Trang từ token. Với Page Access Token, GET /me trả về chính Trang đó.
 * Cho phép ép pageId (env FB_PAGE_ID) khi token là User token quản nhiều trang.
 */
export async function resolvePage(
  token: string,
  pageIdOverride?: string,
  signal?: AbortSignal,
): Promise<{ id: string; name: string }> {
  const target = pageIdOverride?.trim() ? pageIdOverride.trim() : "me";
  const url = `${GRAPH}/${encodeURIComponent(target)}?fields=id,name&access_token=${encodeURIComponent(token)}`;
  const res = await fetch(url, { signal });
  const body = (await parseJson(res)) as { id?: string; name?: string } & GraphError;
  if (!res.ok || !body.id) {
    throwGraphError(body, `Không lấy được thông tin Trang (HTTP ${res.status})`);
  }
  return { id: body.id!, name: body.name ?? body.id! };
}

export type FbPlaylist = { id: string; title: string; videosCount: number };

/**
 * Liệt kê playlist (video list) của Trang. Graph API cho GET nhưng KHÔNG cho
 * thêm video vào playlist qua API → dùng để hiển thị cho user chọn + nhắc thêm tay.
 */
export async function listPlaylists(
  token: string,
  pageIdOverride?: string,
  signal?: AbortSignal,
): Promise<{ pageId: string; pageName: string; playlists: FbPlaylist[] }> {
  const page = await resolvePage(token, pageIdOverride, signal);
  const url = `${GRAPH}/${encodeURIComponent(page.id)}/video_lists?fields=id,title,videos_count&limit=100&access_token=${encodeURIComponent(token)}`;
  const res = await fetch(url, { signal });
  const body = (await parseJson(res)) as {
    data?: Array<{ id?: string; title?: string; videos_count?: number }>;
  } & GraphError;
  if (!res.ok || !Array.isArray(body.data)) {
    throwGraphError(body, `Không lấy được danh sách playlist (HTTP ${res.status})`);
  }
  const playlists: FbPlaylist[] = body.data!
    .filter((d): d is { id: string; title?: string; videos_count?: number } => typeof d.id === "string")
    .map((d) => ({ id: d.id, title: d.title ?? d.id, videosCount: d.videos_count ?? 0 }));
  return { pageId: page.id, pageName: page.name, playlists };
}

/** Pha 1: khởi tạo phiên upload Reel. */
async function startReel(
  token: string,
  pageId: string,
  signal?: AbortSignal,
): Promise<{ videoId: string; uploadUrl: string }> {
  const url = `${GRAPH}/${encodeURIComponent(pageId)}/video_reels`;
  const params = new URLSearchParams({ upload_phase: "start", access_token: token });
  const res = await fetch(url, { method: "POST", body: params, signal });
  const body = (await parseJson(res)) as { video_id?: string; upload_url?: string } & GraphError;
  if (!res.ok || !body.video_id || !body.upload_url) {
    throwGraphError(body, `Không khởi tạo được upload Reel (HTTP ${res.status})`);
  }
  return { videoId: body.video_id!, uploadUrl: body.upload_url! };
}

/** Pha 2: upload binary video lên rupload host (1 lần, non-chunked). */
async function uploadBinary(
  uploadUrl: string,
  token: string,
  videoPath: string,
  signal?: AbortSignal,
): Promise<void> {
  const stat = fs.statSync(videoPath);
  const data = fs.readFileSync(videoPath);
  const res = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      Authorization: `OAuth ${token}`,
      offset: "0",
      file_size: String(stat.size),
      "Content-Type": "application/octet-stream",
    },
    body: data,
    signal,
  });
  const body = (await parseJson(res)) as { success?: boolean } & GraphError;
  if (!res.ok || body.success === false || body.error) {
    throwGraphError(body, `Upload video thất bại (HTTP ${res.status})`);
  }
}

/** Pha 3: chốt + publish. */
async function finishReel(
  token: string,
  pageId: string,
  videoId: string,
  description: string,
  signal?: AbortSignal,
): Promise<void> {
  const url = `${GRAPH}/${encodeURIComponent(pageId)}/video_reels`;
  const params = new URLSearchParams({
    upload_phase: "finish",
    video_id: videoId,
    video_state: "PUBLISHED",
    description,
    access_token: token,
  });
  const res = await fetch(url, { method: "POST", body: params, signal });
  const body = (await parseJson(res)) as { success?: boolean } & GraphError;
  if (!res.ok || body.success === false || body.error) {
    throwGraphError(body, `Chốt đăng Reel thất bại (HTTP ${res.status})`);
  }
}

type ReelStatus = {
  status?: {
    video_status?: string; // "processing" | "ready" | "error" | ...
    processing_phase?: { status?: string; errors?: Array<{ message?: string }> };
    publishing_phase?: { status?: string; errors?: Array<{ message?: string }> };
  };
} & GraphError;

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(t);
      reject(new Error("Đã huỷ"));
    }, { once: true });
  });

/**
 * Poll trạng thái tới khi Reel "ready" hoặc lỗi. FB xử lý video mất vài chục giây.
 * maxTries×intervalMs ≈ 5 phút.
 */
async function waitReady(
  token: string,
  videoId: string,
  onProgress?: FbProgress,
  signal?: AbortSignal,
): Promise<void> {
  const maxTries = 100;
  const intervalMs = 3000;
  let lastMsg = "";
  for (let i = 0; i < maxTries; i++) {
    const url = `${GRAPH}/${encodeURIComponent(videoId)}?fields=status&access_token=${encodeURIComponent(token)}`;
    const res = await fetch(url, { signal });
    const body = (await parseJson(res)) as ReelStatus;
    const st = body.status;
    const vs = st?.video_status ?? "";
    const proc = st?.processing_phase?.status ?? "";
    const pub = st?.publishing_phase?.status ?? "";

    const procErr = st?.processing_phase?.errors?.[0]?.message;
    const pubErr = st?.publishing_phase?.errors?.[0]?.message;
    if (vs === "error" || procErr || pubErr) {
      throw new Error(`Facebook xử lý Reel lỗi: ${procErr || pubErr || "không rõ"}`);
    }
    if (vs === "ready" || pub === "complete") return;

    const msg = `Facebook đang xử lý… (video: ${vs || "?"}, xử lý: ${proc || "?"}, đăng: ${pub || "?"})`;
    if (msg !== lastMsg) {
      onProgress?.(msg);
      lastMsg = msg;
    }
    await sleep(intervalMs, signal);
  }
  throw new Error("Hết thời gian chờ Facebook xử lý (5 phút). Reel có thể vẫn đang xử lý — kiểm tra trên Trang.");
}

/** Lấy permalink công khai (best-effort, không có cũng không sao). */
async function fetchPermalink(token: string, videoId: string, signal?: AbortSignal): Promise<string | null> {
  try {
    const url = `${GRAPH}/${encodeURIComponent(videoId)}?fields=permalink_url&access_token=${encodeURIComponent(token)}`;
    const res = await fetch(url, { signal });
    const body = (await parseJson(res)) as { permalink_url?: string };
    if (body.permalink_url) {
      return body.permalink_url.startsWith("http")
        ? body.permalink_url
        : `https://www.facebook.com${body.permalink_url}`;
    }
  } catch {
    /* best-effort */
  }
  return null;
}

/** Đăng 1 file video (mp4 dọc) lên Trang dưới dạng Reel. */
export async function publishReel(opts: {
  token: string;
  pageIdOverride?: string;
  videoPath: string;
  description: string;
  onProgress?: FbProgress;
  signal?: AbortSignal;
}): Promise<PublishReelResult> {
  const { token, pageIdOverride, videoPath, description, onProgress, signal } = opts;
  if (!fs.existsSync(videoPath)) {
    throw new Error(`Không tìm thấy video: ${videoPath} — hãy Assemble (ráp mp4) trước.`);
  }

  onProgress?.("Đang xác định Trang từ token…");
  const page = await resolvePage(token, pageIdOverride, signal);
  onProgress?.(`Trang: ${page.name} (id ${page.id})`);

  onProgress?.("Khởi tạo phiên upload Reel…");
  const { videoId, uploadUrl } = await startReel(token, page.id, signal);

  const sizeMb = (fs.statSync(videoPath).size / 1024 / 1024).toFixed(1);
  onProgress?.(`Đang tải video lên Facebook (${sizeMb} MB)…`);
  await uploadBinary(uploadUrl, token, videoPath, signal);

  onProgress?.("Đang chốt & xuất bản Reel…");
  await finishReel(token, page.id, videoId, description, signal);

  await waitReady(token, videoId, onProgress, signal);

  const permalink = await fetchPermalink(token, videoId, signal);
  onProgress?.("✓ Đã đăng Reel thành công.");
  return { videoId, permalink, pageName: page.name, pageId: page.id };
}
