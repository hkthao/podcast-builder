import { Hono } from "hono";
import {
  deleteSession,
  generateAndSave,
  getSession,
  listSessions,
  updatePickedIdx,
} from "../lib/brainstorm-store";

export const brainstormRoutes = new Hono();

brainstormRoutes.get("/", async (c) => {
  const sessions = await listSessions();
  return c.json({ sessions });
});

brainstormRoutes.get("/:id", async (c) => {
  const id = c.req.param("id");
  const s = await getSession(id);
  if (!s) return c.json({ error: "Session not found" }, 404);
  return c.json(s);
});

brainstormRoutes.post("/", async (c) => {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    return c.json({ error: "Body không phải JSON hợp lệ" }, 400);
  }
  const body = raw as { topic?: string; tone?: string; count?: number };
  if (typeof body.topic !== "string" || typeof body.tone !== "string") {
    return c.json({ error: "Cần field 'topic' và 'tone' (string)" }, 400);
  }
  try {
    const session = await generateAndSave({
      topic: body.topic,
      tone: body.tone,
      count: typeof body.count === "number" ? body.count : undefined,
    });
    return c.json(session, 201);
  } catch (e) {
    const err = e as Error & { code?: string };
    const status = err.code === "VALIDATION" ? 400 : 500;
    return c.json({ error: err.message }, status);
  }
});

brainstormRoutes.put("/:id/pick", async (c) => {
  const id = c.req.param("id");
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    return c.json({ error: "Body không phải JSON hợp lệ" }, 400);
  }
  const body = raw as { pickedIdx?: number | null };
  if (
    body.pickedIdx !== null &&
    body.pickedIdx !== undefined &&
    typeof body.pickedIdx !== "number"
  ) {
    return c.json({ error: "pickedIdx phải là number hoặc null" }, 400);
  }
  try {
    const s = await updatePickedIdx(
      id,
      body.pickedIdx === undefined ? null : body.pickedIdx,
    );
    if (!s) return c.json({ error: "Session not found" }, 404);
    return c.json(s);
  } catch (e) {
    const err = e as Error & { code?: string };
    const status = err.code === "VALIDATION" ? 400 : 500;
    return c.json({ error: err.message }, status);
  }
});

brainstormRoutes.delete("/:id", async (c) => {
  const id = c.req.param("id");
  const ok = await deleteSession(id);
  return c.json({ deleted: ok });
});
