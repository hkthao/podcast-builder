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
} from "../../../shared/studio-core/facebook";
import { chat, type LLMProvider } from "../../../shared/studio-core/llm-providers";
import { safeParseJson } from "../../../shared/lib/safe-json";

export const commentsRoutes = new Hono();

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
  fetched_at: string;
};

/** List có phân trang. Trả rows + total (để UI tính số trang). */
const listRows = (
  status: string | undefined,
  limit: number,
  offset: number,
): { rows: CommentRow[]; total: number } => {
  const db = getDb();
  const where = status ? "WHERE status = ?" : "";
  const args = status ? [status] : [];
  const total = (
    db.prepare(`SELECT COUNT(*) AS n FROM fb_comments ${where}`).get(...args) as {
      n: number;
    }
  ).n;
  const rows = db
    .prepare(
      `SELECT * FROM fb_comments ${where} ORDER BY created_time DESC LIMIT ? OFFSET ?`,
    )
    .all(...args, limit, offset) as CommentRow[];
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
  const insert = db.prepare(`
    INSERT INTO fb_comments
      (comment_id, post_id, post_excerpt, post_permalink, from_name, message, created_time, status, fetched_at)
    VALUES
      (@comment_id, @post_id, @post_excerpt, @post_permalink, @from_name, @message, @created_time, 'pending', @fetched_at)
    ON CONFLICT(comment_id) DO UPDATE SET
      post_excerpt  = excluded.post_excerpt,
      post_permalink = excluded.post_permalink,
      from_name     = excluded.from_name,
      message       = excluded.message,
      created_time  = excluded.created_time,
      fetched_at    = excluded.fetched_at
  `);
  let added = 0;
  const existing = new Set(
    (db.prepare("SELECT comment_id FROM fb_comments").all() as Array<{ comment_id: string }>).map(
      (r) => r.comment_id,
    ),
  );
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

commentsRoutes.get("/", (c) => {
  const status = c.req.query("status") || undefined;
  const limit = Math.max(1, Math.min(100, Number(c.req.query("limit") ?? "20") || 20));
  const offset = Math.max(0, Number(c.req.query("offset") ?? "0") || 0);
  const { rows, total } = listRows(status, limit, offset);
  return c.json({ comments: rows, total, limit, offset });
});

const REPLY_SYSTEM = `Bạn là quản trị viên fanpage tiếng Việt, trả lời bình luận NGẮN GỌN, SÚC TÍCH, TRUNG LẬP.

Nguyên tắc:
- RẤT ngắn: 1-2 câu, đi thẳng vào ý, KHÔNG dài dòng, KHÔNG sáo rỗng, KHÔNG lan man.
- Giọng TRUNG LẬP, điềm đạm, lịch sự — không nịnh, không cảm thán quá mức, tối đa 0-1 emoji (thường là không).
- Hỏi → trả lời thẳng, gọn. Khen → cảm ơn ngắn. Góp ý → ghi nhận ngắn gọn, trung tính.
- TIÊU CỰC / BẤT LỊCH SỰ / khiêu khích → GIỮ TRUNG LẬP tuyệt đối: bình tĩnh, không đôi co, không phòng thủ, không xin lỗi rối rít, không hứa hẹn, không kích động, không mỉa mai. Chỉ phản hồi trung tính/nhã nhặn 1 câu (hoặc cảm ơn góp ý một cách trung lập), KHÔNG emoji.
- Tiếng Việt tự nhiên. KHÔNG bịa thông tin ngoài bài. KHÔNG hashtag. KHÔNG chào kiểu "Kính gửi".
- CHỈ trả về đúng nội dung câu trả lời (không giải thích, không ngoặc kép).`;

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
      userContent: `NGỮ CẢNH BÀI POST:\n${row.post_excerpt ?? "(không rõ)"}\n\nBÌNH LUẬN của ${row.from_name ?? "người xem"}:\n"${row.message ?? ""}"\n\nViết câu trả lời của fanpage cho bình luận này.`,
      temperature: 0.7,
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

const REPLY_BATCH_SYSTEM = `Bạn là quản trị viên fanpage tiếng Việt. Bạn nhận NHIỀU bình luận (kèm ngữ cảnh bài post) và viết câu trả lời cho TỪNG cái trong MỘT lần.

Mỗi câu trả lời: NGẮN GỌN, SÚC TÍCH, TRUNG LẬP (1-2 câu), đúng ngữ cảnh bài + nội dung bình luận. Hỏi → trả lời thẳng gọn; khen → cảm ơn ngắn; góp ý → ghi nhận trung tính. TIÊU CỰC/BẤT LỊCH SỰ/khiêu khích → GIỮ TRUNG LẬP: bình tĩnh, không đôi co, không xin lỗi rối rít, không hứa hẹn, không kích động, không mỉa mai; chỉ 1 câu nhã nhặn/trung tính, không emoji. Điềm đạm, tối đa 0-1 emoji, KHÔNG hashtag, KHÔNG bịa.

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
      temperature: 0.7,
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

/** Thả like (👍) lên comment + đánh dấu đã xử lý (status 'liked'). */
commentsRoutes.post("/:commentId/like", async (c) => {
  const id = c.req.param("commentId");
  if (!getRow(id)) return c.json({ error: "Không thấy comment" }, 404);
  const token = getApiKey("facebook");
  if (!token) return c.json({ error: "Chưa có Facebook Page Access Token." }, 400);
  try {
    await likeComment(token, process.env.FB_PAGE_ID, id);
    getDb()
      .prepare(
        "UPDATE fb_comments SET status = 'liked', reacted_at = ? WHERE comment_id = ?",
      )
      .run(new Date().toISOString(), id);
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
