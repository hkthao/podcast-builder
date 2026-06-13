import { Hono } from "hono";
import {
  cancelJob,
  getJob,
  listJobs,
  startRender,
} from "../lib/render-runner";

export const renderRoutes = new Hono();

renderRoutes.get("/jobs", (c) => {
  return c.json({ jobs: listJobs() });
});

renderRoutes.get("/jobs/:id", (c) => {
  const job = getJob(c.req.param("id"));
  if (!job) return c.json({ error: "Job not found" }, 404);
  return c.json(job);
});

renderRoutes.post("/jobs/:id/cancel", (c) => {
  const ok = cancelJob(c.req.param("id"));
  if (!ok) return c.json({ error: "Job not found or already finished" }, 404);
  return c.json({ cancelled: true });
});

/** Start render — POST /api/render { episodeName, preview } */
renderRoutes.post("/", async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Body không phải JSON hợp lệ" }, 400);
  }
  const { episodeName, preview } = (body as {
    episodeName?: string;
    preview?: boolean;
  });
  if (typeof episodeName !== "string") {
    return c.json({ error: "Thiếu episodeName" }, 400);
  }
  try {
    const job = await startRender(episodeName, { preview: !!preview });
    return c.json(job, 201);
  } catch (e) {
    return c.json({ error: (e as Error).message }, 400);
  }
});
