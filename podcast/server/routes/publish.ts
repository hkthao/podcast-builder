import { Hono } from "hono";
import {
  cancelPublishJob,
  clearFinishedPublishJobs,
  enqueuePublish,
  getPublishJob,
  listPublishJobs,
  retryPublishJob,
} from "../lib/publish-queue";

/**
 * Hàng đợi đăng Facebook (upload chạy nền trên server, tuần tự).
 *   GET  /api/publish/jobs                 → { jobs }
 *   POST /api/publish/jobs                 body { episodeName, scheduledAt?, playlistId?, playlistName? }
 *                                          hoặc { items: [...] } để xếp nhiều tập 1 lần
 *   POST /api/publish/jobs/:id/cancel|retry
 *   POST /api/publish/jobs/_clear          → xoá job đã kết thúc
 */
export const publishRoutes = new Hono();

type Item = { episodeName?: unknown; scheduledAt?: unknown; playlistId?: unknown; playlistName?: unknown };
const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);

publishRoutes.get("/jobs", (c) => c.json({ jobs: listPublishJobs() }));

publishRoutes.post("/jobs", async (c) => {
  let body: Item & { items?: Item[] };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Body JSON không hợp lệ." }, 400);
  }
  const items = Array.isArray(body.items) ? body.items : [body];
  const jobs = [];
  const errors: { episodeName: string; error: string }[] = [];
  for (const it of items) {
    const episodeName = str(it.episodeName);
    if (!episodeName) {
      errors.push({ episodeName: "", error: "Thiếu episodeName." });
      continue;
    }
    try {
      jobs.push(
        await enqueuePublish({
          episodeName,
          scheduledAt: str(it.scheduledAt) ?? null,
          playlistId: str(it.playlistId),
          playlistName: str(it.playlistName),
        }),
      );
    } catch (e) {
      errors.push({ episodeName, error: e instanceof Error ? e.message : String(e) });
    }
  }
  if (!jobs.length && errors.length) return c.json({ jobs, errors, error: errors.map((e) => e.error).join(" · ") }, 400);
  return c.json({ jobs, errors });
});

publishRoutes.post("/jobs/_clear", (c) => c.json({ removed: clearFinishedPublishJobs() }));

publishRoutes.get("/jobs/:id", (c) => {
  const job = getPublishJob(c.req.param("id"));
  return job ? c.json(job) : c.json({ error: "Job not found" }, 404);
});

publishRoutes.post("/jobs/:id/cancel", (c) =>
  cancelPublishJob(c.req.param("id")) ? c.json({ cancelled: true }) : c.json({ error: "Job không tồn tại hoặc đã kết thúc" }, 404),
);

publishRoutes.post("/jobs/:id/retry", async (c) => {
  try {
    return c.json(await retryPublishJob(c.req.param("id")));
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 400);
  }
});
