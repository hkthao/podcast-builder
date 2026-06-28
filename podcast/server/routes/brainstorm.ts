import { Hono } from "hono";
import {
  deleteIdeaAt,
  deleteSession,
  generateAndSave,
  getSession,
  listSessions,
  PODCAST_EXPAND_SYSTEM_PROMPT,
  PODCAST_SYSTEM_PROMPT,
  updatePickedIdx,
} from "../lib/brainstorm-store";

export const brainstormRoutes = new Hono();

brainstormRoutes.get("/", async (c) => {
  const style = c.req.query("style") === "podcast" ? "podcast" : undefined;
  const sessions = await listSessions(style ? { style } : {});
  return c.json({ sessions });
});

/**
 * Default system prompts — UI load để pre-fill textarea cho phép user
 * tinh chỉnh + A/B test mà không cần đụng code.
 */
brainstormRoutes.get("/_/prompts", (c) =>
  c.json({
    podcast: {
      brainstorm: PODCAST_SYSTEM_PROMPT,
      expand: PODCAST_EXPAND_SYSTEM_PROMPT,
    },
  }),
);

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
  const body = raw as {
    topic?: string;
    tone?: string;
    count?: number;
    provider?: string;
    model?: string;
    style?: string;
    expandUserIdeas?: boolean;
    systemPromptOverride?: string;
  };
  if (typeof body.topic !== "string" || typeof body.tone !== "string") {
    return c.json({ error: "Cần field 'topic' và 'tone' (string)" }, 400);
  }
  if (body.provider && body.provider !== "openai" && body.provider !== "ollama") {
    return c.json({ error: "provider phải là 'openai' hoặc 'ollama'" }, 400);
  }
  if (body.style && body.style !== "podcast") {
    return c.json({ error: "style phải là 'podcast'" }, 400);
  }
  try {
    const session = await generateAndSave({
      topic: body.topic,
      tone: body.tone,
      count: typeof body.count === "number" ? body.count : undefined,
      provider: body.provider as "openai" | "ollama" | undefined,
      model: typeof body.model === "string" ? body.model : undefined,
      style: body.style as "podcast" | undefined,
      expandUserIdeas: body.expandUserIdeas === true,
      systemPromptOverride:
        typeof body.systemPromptOverride === "string" &&
        body.systemPromptOverride.trim().length > 0
          ? body.systemPromptOverride
          : undefined,
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

/** Xoá 1 idea cụ thể trong session — KHÔNG xoá cả session. */
brainstormRoutes.delete("/:id/ideas/:idx", async (c) => {
  const id = c.req.param("id");
  const idx = Number(c.req.param("idx"));
  if (!Number.isInteger(idx) || idx < 0) {
    return c.json({ error: "ideaIdx phải là integer ≥ 0" }, 400);
  }
  try {
    const s = await deleteIdeaAt(id, idx);
    if (!s) return c.json({ error: "Session not found" }, 404);
    return c.json(s);
  } catch (e) {
    const err = e as Error & { code?: string };
    const status = err.code === "VALIDATION" ? 400 : 500;
    return c.json({ error: err.message }, status);
  }
});
