/**
 * comments.ts — quản lý comment Facebook Page, mount tại /api/comments.
 *
 * Luồng: thu thập comment cần trả lời (lưu DB) → AI gợi ý câu trả lời theo ngữ
 * cảnh bài post → user sửa/duyệt → Approve để đăng rep lên FB.
 *
 * Endpoints:
 *   POST /collect                 → kéo comment mới từ FB, upsert DB, trả list
 *   GET  /                        → list comment trong DB (?status=pending|...)
 *   POST /:commentId/generate     → { provider, model } AI gen câu trả lời
 *   PUT  /:commentId/draft        → { message } lưu bản nháp trả lời (sửa tay)
 *   POST /:commentId/reply        → { message } ĐĂNG rep lên FB (Approve)
 *   POST /:commentId/skip         → bỏ qua comment
 */
import { Hono } from "hono";
import { getDb } from "../../../shared/studio-core/db";
import { getApiKey } from "../../../shared/studio-core/api-keys-store";
import {
  listPageComments,
  replyToComment,
  likeComment,
  unlikeComment,
  likeCommentsBatch,
} from "../../../shared/studio-core/facebook";
import { chat, type LLMProvider } from "../../../shared/studio-core/llm-providers";
import { safeParseJson } from "../../../shared/lib/safe-json";
import path from "node:path";
import fs from "node:fs";
import fsp from "node:fs/promises";

export const commentsRoutes = new Hono();

/** Folder lưu ảnh/sticker của comment — gitignore (input/*), dễ dọn dẹp về sau. */
const MEDIA_DIR = path.resolve("input", "fb-comment-media");
const safeName = (s: string) => (s && !s.includes("/") && !s.includes("..") ? s : null);

const extFromContentType = (ct: string): string => {
  const t = ct.toLowerCase();
  return t.includes("png") ? "png"
    : t.includes("gif") ? "gif"
    : t.includes("webp") ? "webp"
    : t.includes("mp4") ? "mp4"
    : t.includes("jpeg") || t.includes("jpg") ? "jpg"
    : "bin";
};

/** Tải media của comment về MEDIA_DIR, trả tên file (null nếu lỗi). */
const downloadCommentMedia = async (commentId: string, url: string): Promise<string | null> => {
  try {
    if (!fs.existsSync(MEDIA_DIR)) fs.mkdirSync(MEDIA_DIR, { recursive: true });
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 20_000);
    let res: Response;
    try {
      res = await fetch(url, { signal: ac.signal });
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) return null;
    const ext = extFromContentType(res.headers.get("content-type") ?? "");
    const name = `${commentId.replace(/[^A-Za-z0-9_]/g, "_")}.${ext}`;
    await fsp.writeFile(path.join(MEDIA_DIR, name), Buffer.from(await res.arrayBuffer()));
    return name;
  } catch {
    return null;
  }
};

type CommentRow = {
  comment_id: string;
  post_id: string | null;
  post_excerpt: string | null;
  post_permalink: string | null;
  from_name: string | null;
  message: string | null;
  created_time: string | null;
  suggested_reply: string | null;
  status: string;
  replied_at: string | null;
  reacted_at: string | null;
  attachment_type: string | null;
  media_url: string | null;
  media_local: string | null;
  kind: string | null;
  fetched_at: string;
};

/** List có phân trang + lọc trạng thái/loại. Trả rows + total. */
const listRows = (opts: {
  status?: string;
  type?: string; // text | sticker
  limit: number;
  offset: number;
}): { rows: CommentRow[]; total: number } => {
  const db = getDb();
  const conds: string[] = [];
  const args: unknown[] = [];
  // "liked" = đã thả tim, độc lập với trạng thái xử lý (dùng reacted_at).
  if (opts.status === "liked") {
    conds.push("reacted_at IS NOT NULL");
  } else if (opts.status) {
    conds.push("status = ?");
    args.push(opts.status);
  }
  if (opts.type) {
    conds.push("kind = ?");
    args.push(opts.type);
  }
  const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";
  const total = (
    db.prepare(`SELECT COUNT(*) AS n FROM fb_comments ${where}`).get(...args) as {
      n: number;
    }
  ).n;
  const rows = db
    .prepare(
      `SELECT * FROM fb_comments ${where} ORDER BY created_time DESC LIMIT ? OFFSET ?`,
    )
    .all(...args, opts.limit, opts.offset) as CommentRow[];
  return { rows, total };
};

const getRow = (id: string): CommentRow | undefined =>
  getDb().prepare("SELECT * FROM fb_comments WHERE comment_id = ?").get(id) as
    | CommentRow
    | undefined;

/** Thu thập comment mới từ FB, upsert (GIỮ suggested_reply/status nếu đã có). */
commentsRoutes.post("/collect", async (c) => {
  const token = getApiKey("facebook");
  if (!token) {
    return c.json({ error: "Chưa có Facebook Page Access Token — nhập ở Settings." }, 400);
  }
  const postLimit = Number(c.req.query("postLimit") ?? "25") || 25;
  let fetched;
  try {
    fetched = await listPageComments(token, process.env.FB_PAGE_ID, { postLimit });
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 502);
  }

  const db = getDb();
  const now = new Date().toISOString();

  // Map các row đã có (để đếm "mới" + tái dùng media đã tải).
  const existingRows = db
    .prepare("SELECT comment_id, media_local FROM fb_comments")
    .all() as Array<{ comment_id: string; media_local: string | null }>;
  const existing = new Set(existingRows.map((r) => r.comment_id));
  const existingMedia = new Map(existingRows.map((r) => [r.comment_id, r.media_local]));

  // Tải media (sticker/ảnh) TRƯỚC transaction (bất đồng bộ). Tái dùng file cũ nếu còn.
  const mediaLocal = new Map<string, string | null>();
  for (const cm of fetched.comments) {
    if (!cm.mediaUrl) continue;
    const prev = existingMedia.get(cm.commentId);
    if (prev && fs.existsSync(path.join(MEDIA_DIR, prev))) {
      mediaLocal.set(cm.commentId, prev);
      continue;
    }
    mediaLocal.set(cm.commentId, await downloadCommentMedia(cm.commentId, cm.mediaUrl));
  }

  const insert = db.prepare(`
    INSERT INTO fb_comments
      (comment_id, post_id, post_excerpt, post_permalink, from_name, message, created_time,
       attachment_type, media_url, media_local, kind, status, fetched_at)
    VALUES
      (@comment_id, @post_id, @post_excerpt, @post_permalink, @from_name, @message, @created_time,
       @attachment_type, @media_url, @media_local, @kind, 'pending', @fetched_at)
    ON CONFLICT(comment_id) DO UPDATE SET
      post_excerpt  = excluded.post_excerpt,
      post_permalink = excluded.post_permalink,
      from_name     = excluded.from_name,
      message       = excluded.message,
      created_time  = excluded.created_time,
      attachment_type = excluded.attachment_type,
      media_url     = excluded.media_url,
      media_local   = COALESCE(excluded.media_local, fb_comments.media_local),
      kind          = excluded.kind,
      fetched_at    = excluded.fetched_at
  `);
  let added = 0;
  const tx = db.transaction((rows: typeof fetched.comments) => {
    for (const cm of rows) {
      if (!existing.has(cm.commentId)) added++;
      insert.run({
        comment_id: cm.commentId,
        post_id: cm.postId,
        post_excerpt: cm.postExcerpt,
        post_permalink: cm.postPermalink,
        from_name: cm.fromName,
        message: cm.message,
        created_time: cm.createdTime,
        attachment_type: cm.attachmentType || null,
        media_url: cm.mediaUrl || null,
        media_local: mediaLocal.get(cm.commentId) ?? null,
        kind: cm.kind || null,
        fetched_at: now,
      });
    }
  });
  tx(fetched.comments);

  return c.json({
    pageName: fetched.pageName,
    fetched: fetched.comments.length,
    added,
  });
});

/** Serve ảnh/sticker đã tải của comment. */
commentsRoutes.get("/media/:file", async (c) => {
  const file = safeName(c.req.param("file"));
  if (!file) return c.json({ error: "invalid" }, 400);
  const p = path.join(MEDIA_DIR, file);
  try {
    const buf = await fsp.readFile(p);
    const ext = file.split(".").pop()?.toLowerCase();
    const ct = ext === "png" ? "image/png"
      : ext === "gif" ? "image/gif"
      : ext === "webp" ? "image/webp"
      : ext === "mp4" ? "video/mp4"
      : ext === "jpg" || ext === "jpeg" ? "image/jpeg"
      : "application/octet-stream";
    return new Response(buf as unknown as BodyInit, {
      headers: { "Content-Type": ct, "Cache-Control": "max-age=86400" },
    });
  } catch {
    return c.json({ error: "not found" }, 404);
  }
});

/** Dọn dẹp: xoá toàn bộ file media đã tải + clear media_local trong DB. */
commentsRoutes.post("/media/cleanup", async (c) => {
  let removed = 0;
  try {
    if (fs.existsSync(MEDIA_DIR)) {
      for (const f of await fsp.readdir(MEDIA_DIR)) {
        await fsp.unlink(path.join(MEDIA_DIR, f)).then(() => removed++).catch(() => {});
      }
    }
  } catch {
    /* ignore */
  }
  getDb().prepare("UPDATE fb_comments SET media_local = NULL").run();
  return c.json({ ok: true, removed });
});

commentsRoutes.get("/", (c) => {
  const status = c.req.query("status") || undefined;
  const type = c.req.query("type") || undefined;
  const limit = Math.max(1, Math.min(100, Number(c.req.query("limit") ?? "20") || 20));
  const offset = Math.max(0, Number(c.req.query("offset") ?? "0") || 0);
  const { rows, total } = listRows({ status, type, limit, offset });
  return c.json({ comments: rows, total, limit, offset });
});

/** Mô tả Page — cho AI hiểu bối cảnh/chất giọng kênh khi trả lời comment. */
const PAGE_DESC =
  "ByteCast Tech khám phá những câu hỏi lớn của thời đại AI, nơi công nghệ giao thoa với triết học, tâm lý học và xã hội học để giúp chúng ta hiểu rõ hơn về con người, ý nghĩa và tương lai.";

const REPLY_SYSTEM = `Bạn là người quản lý fanpage "ByteCast Tech". VỀ TRANG: ${PAGE_DESC}
Trả lời comment đúng tinh thần đó (chiêm nghiệm, gần gũi, tôn trọng người xem).

Bạn trả lời bình luận fanpage NHƯ MỘT NGƯỜI THẬT — tự nhiên, gần gũi, BÁM SÁT nội dung từng bình luận.

Nguyên tắc:
- TRỌNG TÂM là CHÍNH BÌNH LUẬN, KHÔNG phải bài post. Ngữ cảnh bài chỉ là nền — CHỈ nhắc chủ đề bài khi bình luận trực tiếp bàn/hỏi về nội dung bài. Nếu bình luận là cảm nhận/khen chung (vd "thích nghe đối thoại của các bạn") thì đáp đúng điều đó, TUYỆT ĐỐI KHÔNG lái sang chủ đề triết học của bài.
  Ví dụ: "Mình rất thích nghe đối thoại của các bạn" → "Cảm ơn bạn nhiều nha, tụi mình vui khi bạn thích những cuộc trò chuyện này." (KHÔNG nhắc ánh sáng/minh bạch/chủ đề bài).
- Trả lời ĐÚNG điều người ta nói: nhắc lại/hưởng ứng ý cụ thể của họ, hoặc trả lời thẳng câu họ hỏi. KHÔNG trả lời chung chung.
- TUYỆT ĐỐI TRÁNH các câu mẫu robot lặp đi lặp lại như "Cảm ơn bạn đã chia sẻ suy nghĩ của mình", "Cảm ơn bạn đã theo dõi". Mỗi câu trả lời phải RIÊNG, tươi, khác nhau, không rập khuôn.
- KHÔNG mở đầu bằng câu khẳng định đại ngôn/giảng giải kiểu "X thật sự là điều cần thiết cho cuộc sống!". KHÔNG lên gân, KHÔNG dùng dấu "!".
- KHÔNG bắt đầu bằng "Cảm ơn bạn đã chia sẻ…". Muốn cảm ơn thì nói tự nhiên, ngắn ("Cảm ơn bạn nha", "Cảm ơn bạn nhiều").
- KHÔNG hỏi ngược sáo rỗng/dẫn dắt gượng chỉ để có câu hỏi (vd "Bạn có cảm thấy rằng…?", "Bạn có nghĩ…?"). Chỉ hỏi lại khi đó là câu hỏi THẬT, tự nhiên — và KHÔNG bắt buộc phải có câu hỏi.
- ĐỘ DÀI KHỚP với bình luận: comment ngắn (vài từ, "Rất đúng", "💯", "Hay quá") → trả lời RẤT ngắn (một câu ngắn, ấm áp), KHÔNG thêm triết lý.
- Nhận diện GIỠN/ĐÙA (kkk, haha, 😂, "nghe người máy quá") → đáp lại vui, nhẹ, hài hước; KHÔNG bịa rằng họ "thích bài viết" nếu họ không nói vậy.
- Vào thẳng, giọng nói đời thường, có cảm xúc thật.
- Khen → hưởng ứng đúng điều họ khen. Kể chuyện/tâm sự → đồng cảm đúng chỗ. Bình luận ngắn/emoji/nhãn dán → đáp lại ấm áp, tự nhiên (có thể dí dỏm nhẹ), vẫn khác nhau mỗi câu.
- TIÊU CỰC / BẤT LỊCH SỰ / khiêu khích → BÌNH TĨNH, lịch sự, không đôi co, không phòng thủ, không mỉa mai, không hứa hẹn; phản hồi ngắn chân thành, vẫn giống người thật.
- Tiếng Việt tự nhiên, xưng "mình"/"kênh". Tối đa 0-1 emoji. KHÔNG hashtag, KHÔNG bịa thông tin ngoài bài, KHÔNG chào kiểu "Kính gửi".
- CHỈ trả về đúng câu trả lời (không giải thích, không ngoặc kép).`;

commentsRoutes.post("/:commentId/generate", async (c) => {
  const id = c.req.param("commentId");
  const row = getRow(id);
  if (!row) return c.json({ error: "Không thấy comment" }, 404);
  let body: { provider?: LLMProvider; model?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Body không phải JSON hợp lệ" }, 400);
  }
  const { provider, model } = body;
  if (!provider || !model) return c.json({ error: "thiếu provider/model" }, 400);

  try {
    const raw = await chat({
      provider,
      model,
      systemPrompt: REPLY_SYSTEM,
      userContent: `Ngữ cảnh bài (chỉ để tham khảo, ĐỪNG lái câu trả lời sang chủ đề này nếu bình luận không nhắc tới):\n${row.post_excerpt ?? "(không rõ)"}\n\n>>> TRẢ LỜI CHO BÌNH LUẬN NÀY của ${row.from_name ?? "người xem"}:\n"${row.message ?? ""}"\n\nViết 1 câu trả lời tự nhiên, bám đúng điều họ nói.`,
      temperature: 0.9,
    });
    const reply = raw.trim().replace(/^["']|["']$/g, "");
    getDb()
      .prepare("UPDATE fb_comments SET suggested_reply = ? WHERE comment_id = ?")
      .run(reply, id);
    return c.json({ reply });
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

const REPLY_BATCH_SYSTEM = `Bạn là người quản lý fanpage "ByteCast Tech". VỀ TRANG: ${PAGE_DESC}
Trả lời đúng tinh thần đó (chiêm nghiệm, gần gũi, tôn trọng người xem).

Bạn trả lời NHIỀU bình luận fanpage (kèm ngữ cảnh bài) trong MỘT lần, mỗi câu NHƯ MỘT NGƯỜI THẬT.

- TRỌNG TÂM là CHÍNH BÌNH LUẬN, KHÔNG phải bài post. Chỉ nhắc chủ đề bài khi bình luận trực tiếp bàn về nó; nếu là cảm nhận/khen chung (vd "thích nghe đối thoại của các bạn") thì đáp đúng điều đó, KHÔNG lái sang chủ đề bài.
- Mỗi câu BÁM SÁT nội dung CỤ THỂ của bình luận tương ứng (nhắc lại/trả lời đúng điều họ nói). KHÔNG trả lời chung chung.
- MỖI CÂU PHẢI KHÁC NHAU — TUYỆT ĐỐI KHÔNG dùng cùng một mẫu (vd "Cảm ơn bạn đã chia sẻ suy nghĩ") cho nhiều comment. Đa dạng cách mở đầu, tự nhiên như trò chuyện.
- KHÔNG mở đầu bằng câu khẳng định đại ngôn/giảng giải ("X thật sự là điều cần thiết cho cuộc sống!"), KHÔNG "!", KHÔNG hỏi ngược sáo rỗng ("Bạn có cảm thấy rằng…?"). Vào thẳng, chỉ hỏi lại khi thật sự tự nhiên.
- Ngắn (1-2 câu), giọng đời thường, có cảm xúc thật. Khen → hưởng ứng đúng ý; tâm sự → đồng cảm; comment ngắn/emoji/nhãn dán → đáp ấm áp, tự nhiên.
- Tiêu cực/bất lịch sự → bình tĩnh, lịch sự, không đôi co/mỉa mai/hứa hẹn, vẫn giống người.
- Xưng "mình"/"kênh", tối đa 0-1 emoji, KHÔNG hashtag, KHÔNG bịa.

Đầu vào là danh sách, mỗi mục có id. Trả về ĐÚNG JSON:
{"replies":[{"id":"<id>","reply":"<câu trả lời>"}, ...]}
Đủ mọi id được cho, không thêm id lạ. Chỉ JSON, không markdown.`;

/** Batch: gom nhiều comment → 1 request LLM (tiết kiệm chi phí). */
commentsRoutes.post("/generate-batch", async (c) => {
  let body: { provider?: LLMProvider; model?: string; commentIds?: string[] };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Body không phải JSON hợp lệ" }, 400);
  }
  const { provider, model } = body;
  if (!provider || !model) return c.json({ error: "thiếu provider/model" }, 400);

  const db = getDb();
  let rows: CommentRow[];
  if (Array.isArray(body.commentIds) && body.commentIds.length) {
    const ids = body.commentIds.slice(0, 30);
    const ph = ids.map(() => "?").join(",");
    rows = db
      .prepare(`SELECT * FROM fb_comments WHERE comment_id IN (${ph})`)
      .all(...ids) as CommentRow[];
  } else {
    rows = db
      .prepare(
        "SELECT * FROM fb_comments WHERE status = 'pending' ORDER BY created_time DESC LIMIT 30",
      )
      .all() as CommentRow[];
  }
  if (!rows.length) return c.json({ error: "Không có comment để gợi ý" }, 400);

  const listStr = rows
    .map(
      (r, i) =>
        `[${i + 1}] id=${r.comment_id}\nBài: ${r.post_excerpt ?? "(không rõ)"}\nBình luận (${r.from_name ?? "người xem"}): "${r.message ?? ""}"`,
    )
    .join("\n\n");

  try {
    const raw = await chat({
      provider,
      model,
      systemPrompt: REPLY_BATCH_SYSTEM,
      userContent: `Viết câu trả lời cho từng bình luận sau (giữ đúng id):\n\n${listStr}\n\nTrả JSON {"replies":[...]}.`,
      temperature: 0.9,
      jsonMode: true,
    });
    const parsed = safeParseJson<{ replies?: Array<{ id?: string; reply?: string }> }>(raw);
    const replies = Array.isArray(parsed.replies) ? parsed.replies : [];
    const valid = new Set(rows.map((r) => r.comment_id));
    const upd = db.prepare(
      "UPDATE fb_comments SET suggested_reply = ? WHERE comment_id = ?",
    );
    let saved = 0;
    const tx = db.transaction((items: typeof replies) => {
      for (const it of items) {
        if (it?.id && typeof it.reply === "string" && valid.has(it.id)) {
          upd.run(it.reply.trim().replace(/^["']|["']$/g, ""), it.id);
          saved++;
        }
      }
    });
    tx(replies);
    return c.json({ requested: rows.length, saved });
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

commentsRoutes.put("/:commentId/draft", async (c) => {
  const id = c.req.param("commentId");
  if (!getRow(id)) return c.json({ error: "Không thấy comment" }, 404);
  const { message } = await c.req.json<{ message?: string }>();
  getDb()
    .prepare("UPDATE fb_comments SET suggested_reply = ? WHERE comment_id = ?")
    .run(typeof message === "string" ? message : "", id);
  return c.json({ ok: true });
});

/** Approve: đăng câu trả lời lên FB rồi đánh dấu đã trả lời. */
commentsRoutes.post("/:commentId/reply", async (c) => {
  const id = c.req.param("commentId");
  const row = getRow(id);
  if (!row) return c.json({ error: "Không thấy comment" }, 404);
  const { message } = await c.req.json<{ message?: string }>();
  const text = (typeof message === "string" ? message : row.suggested_reply ?? "").trim();
  if (!text) return c.json({ error: "Chưa có nội dung trả lời" }, 400);

  const token = getApiKey("facebook");
  if (!token) return c.json({ error: "Chưa có Facebook Page Access Token." }, 400);

  try {
    const r = await replyToComment(token, process.env.FB_PAGE_ID, id, text);
    getDb()
      .prepare(
        "UPDATE fb_comments SET suggested_reply = ?, status = 'replied', replied_at = ? WHERE comment_id = ?",
      )
      .run(text, new Date().toISOString(), id);
    return c.json({ ok: true, replyId: r.id, comment: getRow(id) });
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 502);
  }
});

/** Thả like (👍) lên comment. KHÔNG đổi status → vẫn có thể trả lời sau. */
commentsRoutes.post("/:commentId/like", async (c) => {
  const id = c.req.param("commentId");
  if (!getRow(id)) return c.json({ error: "Không thấy comment" }, 404);
  const token = getApiKey("facebook");
  if (!token) return c.json({ error: "Chưa có Facebook Page Access Token." }, 400);
  try {
    await likeComment(token, process.env.FB_PAGE_ID, id);
    getDb()
      .prepare("UPDATE fb_comments SET reacted_at = ? WHERE comment_id = ?")
      .run(new Date().toISOString(), id);
    return c.json({ ok: true, comment: getRow(id) });
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 502);
  }
});

/** Comment "phản hồi ngắn" (nhãn dán/GIF/emoji) — thao tác hàng loạt. */
const REACTION_KINDS = "'sticker','gif','emoji'";

/** Thả like cho TẤT CẢ comment nhãn dán/GIF/emoji chưa like. */
commentsRoutes.post("/like-stickers", async (c) => {
  const token = getApiKey("facebook");
  if (!token) return c.json({ error: "Chưa có Facebook Page Access Token." }, 400);
  const ids = (
    getDb()
      .prepare(
        `SELECT comment_id FROM fb_comments WHERE kind IN (${REACTION_KINDS}) AND reacted_at IS NULL LIMIT 200`,
      )
      .all() as Array<{ comment_id: string }>
  ).map((r) => r.comment_id);
  if (!ids.length) return c.json({ ok: true, liked: 0, failed: 0 });

  try {
    const r = await likeCommentsBatch(token, process.env.FB_PAGE_ID, ids);
    if (r.liked.length) {
      const now = new Date().toISOString();
      const upd = getDb().prepare(
        "UPDATE fb_comments SET reacted_at = ? WHERE comment_id = ?",
      );
      const tx = getDb().transaction((list: string[]) => {
        for (const id of list) upd.run(now, id);
      });
      tx(r.liked);
    }
    return c.json({ ok: true, liked: r.liked.length, failed: r.failed.length });
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 502);
  }
});

/** Bỏ qua (đóng) tất cả comment nhãn dán/GIF/emoji ĐÃ like còn đang chờ. Chỉ đổi DB. */
commentsRoutes.post("/skip-liked-stickers", (c) => {
  const r = getDb()
    .prepare(
      `UPDATE fb_comments SET status = 'skipped' WHERE kind IN (${REACTION_KINDS}) AND reacted_at IS NOT NULL AND status = 'pending'`,
    )
    .run();
  return c.json({ ok: true, skipped: r.changes });
});

/** Bỏ like (👍) khỏi comment. */
commentsRoutes.post("/:commentId/unlike", async (c) => {
  const id = c.req.param("commentId");
  if (!getRow(id)) return c.json({ error: "Không thấy comment" }, 404);
  const token = getApiKey("facebook");
  if (!token) return c.json({ error: "Chưa có Facebook Page Access Token." }, 400);
  try {
    await unlikeComment(token, process.env.FB_PAGE_ID, id);
    getDb()
      .prepare("UPDATE fb_comments SET reacted_at = NULL WHERE comment_id = ?")
      .run(id);
    return c.json({ ok: true, comment: getRow(id) });
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 502);
  }
});

commentsRoutes.post("/:commentId/skip", (c) => {
  const id = c.req.param("commentId");
  if (!getRow(id)) return c.json({ error: "Không thấy comment" }, 404);
  getDb().prepare("UPDATE fb_comments SET status = 'skipped' WHERE comment_id = ?").run(id);
  return c.json({ ok: true });
});

/** Đưa comment về 'pending' (khi lỡ bỏ qua / lỡ like). */
commentsRoutes.post("/:commentId/reopen", (c) => {
  const id = c.req.param("commentId");
  if (!getRow(id)) return c.json({ error: "Không thấy comment" }, 404);
  getDb()
    .prepare("UPDATE fb_comments SET status = 'pending' WHERE comment_id = ?")
    .run(id);
  return c.json({ ok: true, comment: getRow(id) });
});
