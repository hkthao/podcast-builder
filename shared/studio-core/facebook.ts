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
  /** true nếu lên lịch (chưa đăng ngay) — khi đó permalink thường null. */
  scheduled: boolean;
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

/** GET 1 URL Graph → JSON đã parse. */
const graphGet = async (url: string, signal?: AbortSignal): Promise<{ res: Response; body: any }> => {
  const res = await fetch(url, { signal });
  return { res, body: await parseJson(res) };
};

export type ResolvedPage = { id: string; name: string; token: string };

/**
 * Xác định Trang + LẤY PAGE ACCESS TOKEN. Reels chỉ đăng được lên PAGE, không
 * đăng lên trang cá nhân. Xử lý 3 trường hợp token user dán vào:
 *  1) Có pageIdOverride (env FB_PAGE_ID): lấy thẳng access_token của page đó.
 *  2) User access token: liệt kê /me/accounts → chọn page (theo FB_PAGE_ID hoặc
 *     page duy nhất) + dùng access_token RIÊNG của page đó.
 *  3) Page access token sẵn: /me trả về chính Page (có `category`) → dùng token đó.
 * Nếu token chỉ là trang CÁ NHÂN (không quản page nào) → ném lỗi rõ ràng.
 */
export async function resolvePage(
  token: string,
  pageIdOverride?: string,
  signal?: AbortSignal,
): Promise<ResolvedPage> {
  const enc = encodeURIComponent;

  // (1) Ép page id → lấy access_token của chính page đó.
  if (pageIdOverride?.trim()) {
    const pid = pageIdOverride.trim();
    const { res, body } = await graphGet(
      `${GRAPH}/${enc(pid)}?fields=id,name,access_token&access_token=${enc(token)}`,
      signal,
    );
    if (!res.ok || !body.id) {
      throwGraphError(body, `Không truy cập được Trang id ${pid} (HTTP ${res.status})`);
    }
    return { id: body.id, name: body.name ?? pid, token: body.access_token ?? token };
  }

  // (2) User token → danh sách page quản lý (mỗi page có access_token riêng).
  const acc = await graphGet(
    `${GRAPH}/me/accounts?fields=id,name,access_token&limit=100&access_token=${enc(token)}`,
    signal,
  );
  const pages: Array<{ id: string; name?: string; access_token?: string }> = Array.isArray(
    acc.body?.data,
  )
    ? acc.body.data.filter((p: { id?: string }) => typeof p?.id === "string")
    : [];
  if (pages.length === 1) {
    const p = pages[0];
    return { id: p.id, name: p.name ?? p.id, token: p.access_token ?? token };
  }
  if (pages.length > 1) {
    const list = pages.map((p) => `${p.name ?? "?"} (${p.id})`).join("; ");
    throw new Error(
      `Token quản nhiều Trang — đặt FB_PAGE_ID trong .env để chọn. Các Trang: ${list}`,
    );
  }

  // (3) Không có page qua /me/accounts → có thể token đã là PAGE token.
  const me = await graphGet(
    `${GRAPH}/me?fields=id,name,category&access_token=${enc(token)}`,
    signal,
  );
  if (me.res.ok && me.body?.id && me.body?.category) {
    return { id: me.body.id, name: me.body.name ?? me.body.id, token };
  }

  // Trang cá nhân / thiếu quyền.
  throw new Error(
    me.body?.name
      ? `Token đang trỏ tới trang CÁ NHÂN "${me.body.name}", không phải Facebook Page. Reels chỉ đăng được lên Page. Dùng Page Access Token, hoặc User token có quyền pages_show_list + pages_manage_posts (và đặt FB_PAGE_ID nếu quản nhiều Trang).`
      : "Không tìm thấy Facebook Page nào từ token. Cần Page Access Token (hoặc User token có pages_show_list + pages_manage_posts).",
  );
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
  const url = `${GRAPH}/${encodeURIComponent(page.id)}/video_lists?fields=id,title,videos_count&limit=100&access_token=${encodeURIComponent(page.token)}`;
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

// ─── Comment management ───────────────────────────────────────────────────

export type FbComment = {
  commentId: string;
  postId: string;
  postExcerpt: string;
  postPermalink: string;
  fromName: string;
  message: string;
  createdTime: string;
};

/**
 * Thu thập comment top-level trên các bài GẦN ĐÂY của Page cần trả lời:
 * bỏ comment do chính Page viết + comment Page ĐÃ trả lời. Cần quyền
 * pages_read_engagement. postLimit = số bài quét (mặc định 25).
 */
export async function listPageComments(
  token: string,
  pageIdOverride?: string,
  opts?: { postLimit?: number },
  signal?: AbortSignal,
): Promise<{ pageId: string; pageName: string; comments: FbComment[] }> {
  const enc = encodeURIComponent;
  const page = await resolvePage(token, pageIdOverride, signal);
  const postLimit = Math.max(1, Math.min(100, opts?.postLimit ?? 25));
  const fields =
    "id,message,created_time,permalink_url,attachments{title,description}," +
    "comments.limit(100){id,message,created_time,from,comments.limit(50){from}}";
  const url = `${GRAPH}/${enc(page.id)}/feed?fields=${enc(fields)}&limit=${postLimit}&access_token=${enc(page.token)}`;
  const { res, body } = await graphGet(url, signal);
  if (!res.ok || !Array.isArray(body?.data)) {
    throwGraphError(body, `Không lấy được bài/comment của Trang (HTTP ${res.status})`);
  }

  const comments: FbComment[] = [];
  for (const post of body.data as any[]) {
    const att = post.attachments?.data?.[0];
    const postMsg: string = post.message || att?.title || att?.description || "(bài không có mô tả)";
    const postComments = post.comments?.data ?? [];
    for (const cm of postComments) {
      if (!cm?.id) continue;
      if (cm.from?.id && cm.from.id === page.id) continue; // comment của chính Page
      const replies = cm.comments?.data ?? [];
      const repliedByPage = replies.some((r: any) => r?.from?.id === page.id);
      if (repliedByPage) continue; // Page đã trả lời
      comments.push({
        commentId: cm.id,
        postId: post.id ?? "",
        postExcerpt: String(postMsg).slice(0, 400),
        postPermalink: post.permalink_url ?? "",
        fromName: cm.from?.name ?? "Người dùng Facebook",
        message: cm.message ?? "",
        createdTime: cm.created_time ?? "",
      });
    }
  }
  return { pageId: page.id, pageName: page.name, comments };
}

/**
 * Page thả "Like" (👍) lên 1 comment. Cần quyền pages_manage_engagement.
 * LƯU Ý: Graph API chỉ hỗ trợ Like — KHÔNG set được reaction tim/love/haha…
 */
export async function likeComment(
  token: string,
  pageIdOverride: string | undefined,
  commentId: string,
  signal?: AbortSignal,
): Promise<{ ok: boolean }> {
  const page = await resolvePage(token, pageIdOverride, signal);
  const url = `${GRAPH}/${encodeURIComponent(commentId)}/likes`;
  const params = new URLSearchParams({ access_token: page.token });
  const res = await fetch(url, { method: "POST", body: params, signal });
  const body = (await parseJson(res)) as { success?: boolean } & GraphError;
  if (!res.ok || body.error) {
    throwGraphError(body, `Thả like thất bại (HTTP ${res.status})`);
  }
  return { ok: true };
}

/** Trả lời (rep) 1 comment. Cần quyền pages_manage_engagement. */
export async function replyToComment(
  token: string,
  pageIdOverride: string | undefined,
  commentId: string,
  message: string,
  signal?: AbortSignal,
): Promise<{ id: string }> {
  const page = await resolvePage(token, pageIdOverride, signal);
  const url = `${GRAPH}/${encodeURIComponent(commentId)}/comments`;
  const params = new URLSearchParams({ message, access_token: page.token });
  const res = await fetch(url, { method: "POST", body: params, signal });
  const body = (await parseJson(res)) as { id?: string } & GraphError;
  if (!res.ok || !body.id) {
    throwGraphError(body, `Trả lời comment thất bại (HTTP ${res.status})`);
  }
  return { id: body.id! };
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

/** Pha 3: chốt + publish (hoặc lên lịch nếu có scheduledPublishTime). */
async function finishReel(
  token: string,
  pageId: string,
  videoId: string,
  description: string,
  scheduledPublishTime?: number,
  signal?: AbortSignal,
): Promise<void> {
  const url = `${GRAPH}/${encodeURIComponent(pageId)}/video_reels`;
  const params = new URLSearchParams({
    upload_phase: "finish",
    video_id: videoId,
    description,
    access_token: token,
  });
  if (scheduledPublishTime && scheduledPublishTime > 0) {
    params.set("video_state", "SCHEDULED");
    params.set("scheduled_publish_time", String(scheduledPublishTime));
  } else {
    params.set("video_state", "PUBLISHED");
  }
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

/** Đăng 1 file video (mp4 dọc) lên Trang dưới dạng Reel (đăng ngay hoặc lên lịch). */
export async function publishReel(opts: {
  token: string;
  pageIdOverride?: string;
  videoPath: string;
  description: string;
  /** Unix seconds — nếu có (>0) thì LÊN LỊCH thay vì đăng ngay. */
  scheduledPublishTime?: number;
  onProgress?: FbProgress;
  signal?: AbortSignal;
}): Promise<PublishReelResult> {
  const { token, pageIdOverride, videoPath, description, scheduledPublishTime, onProgress, signal } = opts;
  if (!fs.existsSync(videoPath)) {
    throw new Error(`Không tìm thấy video: ${videoPath} — hãy Assemble (ráp mp4) trước.`);
  }
  const isScheduled = !!scheduledPublishTime && scheduledPublishTime > 0;

  onProgress?.("Đang xác định Trang từ token…");
  const page = await resolvePage(token, pageIdOverride, signal);
  onProgress?.(`Trang: ${page.name} (id ${page.id})`);
  // TỪ ĐÂY dùng PAGE token (không dùng user token) cho mọi lệnh video_reels.
  const pageToken = page.token;

  onProgress?.("Khởi tạo phiên upload Reel…");
  const { videoId, uploadUrl } = await startReel(pageToken, page.id, signal);

  const sizeMb = (fs.statSync(videoPath).size / 1024 / 1024).toFixed(1);
  onProgress?.(`Đang tải video lên Facebook (${sizeMb} MB)…`);
  await uploadBinary(uploadUrl, pageToken, videoPath, signal);

  onProgress?.(isScheduled ? "Đang chốt & lên lịch Reel…" : "Đang chốt & xuất bản Reel…");
  await finishReel(pageToken, page.id, videoId, description, scheduledPublishTime, signal);

  if (isScheduled) {
    // Reel lên lịch chưa xử lý/hiển thị công khai ngay → không poll ready/permalink.
    onProgress?.("✓ Đã lên lịch Reel thành công.");
    return { videoId, permalink: null, pageName: page.name, pageId: page.id, scheduled: true };
  }

  await waitReady(pageToken, videoId, onProgress, signal);

  const permalink = await fetchPermalink(pageToken, videoId, signal);
  onProgress?.("✓ Đã đăng Reel thành công.");
  return { videoId, permalink, pageName: page.name, pageId: page.id, scheduled: false };
}
