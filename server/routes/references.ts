import { Hono } from "hono";
import {
  addReference,
  deleteReference,
  getReference,
  linkReference,
  listAllTags,
  listReferences,
  scrapeTitle,
  unlinkReference,
  updateReference,
  type Reference,
} from "../lib/reference-store";

export const referencesRoutes = new Hono();

referencesRoutes.get("/", async (c) => {
  const tag = c.req.query("tag");
  const episode = c.req.query("episode");
  const q = c.req.query("q");
  const type = c.req.query("type");
  const items = await listReferences({ tag, episode, q, type });
  return c.json({ items });
});

referencesRoutes.get("/_/tags", async (c) => {
  const tags = await listAllTags();
  return c.json({ tags });
});

/**
 * Scrape URL → trả về { title, author, source } để pre-fill form.
 * Body: { url }
 */
referencesRoutes.post("/_/scrape", async (c) => {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    return c.json({ error: "Body không phải JSON" }, 400);
  }
  const { url } = raw as { url?: string };
  if (typeof url !== "string" || !url.trim()) {
    return c.json({ error: "url là bắt buộc" }, 400);
  }
  try {
    new URL(url);
  } catch {
    return c.json({ error: "url không hợp lệ" }, 400);
  }
  try {
    const meta = await scrapeTitle(url);
    return c.json(meta);
  } catch (e) {
    return c.json(
      { error: `Scrape fail: ${(e as Error).message}` },
      500,
    );
  }
});

referencesRoutes.post("/", async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Body không phải JSON" }, 400);
  }
  try {
    const ref = await addReference(body as Parameters<typeof addReference>[0]);
    return c.json(ref, 201);
  } catch (e) {
    const err = e as Error & { code?: string; refId?: string };
    if (err.code === "DUPLICATE") {
      return c.json({ error: err.message, refId: err.refId }, 409);
    }
    return c.json({ error: err.message }, err.code === "VALIDATION" ? 400 : 500);
  }
});

referencesRoutes.get("/:id", async (c) => {
  const ref = await getReference(c.req.param("id"));
  if (!ref) return c.json({ error: "Reference not found" }, 404);
  return c.json(ref);
});

referencesRoutes.put("/:id", async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Body không phải JSON" }, 400);
  }
  try {
    const ref = await updateReference(
      c.req.param("id"),
      body as Partial<Reference>,
    );
    return c.json(ref);
  } catch (e) {
    const err = e as Error & { code?: string };
    const status =
      err.code === "NOT_FOUND" ? 404 : err.code === "VALIDATION" ? 400 : 500;
    return c.json({ error: err.message }, status);
  }
});

referencesRoutes.delete("/:id", async (c) => {
  const ok = await deleteReference(c.req.param("id"));
  if (!ok) return c.json({ error: "Reference not found" }, 404);
  return c.json({ deleted: true });
});

referencesRoutes.post("/:id/link", async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Body không phải JSON" }, 400);
  }
  const { episodeName } = body as { episodeName?: string };
  if (typeof episodeName !== "string") {
    return c.json({ error: "episodeName là bắt buộc" }, 400);
  }
  try {
    const ref = await linkReference(c.req.param("id"), episodeName);
    return c.json(ref);
  } catch (e) {
    const err = e as Error & { code?: string };
    return c.json({ error: err.message }, err.code === "NOT_FOUND" ? 404 : 500);
  }
});

referencesRoutes.post("/:id/unlink", async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Body không phải JSON" }, 400);
  }
  const { episodeName } = body as { episodeName?: string };
  if (typeof episodeName !== "string") {
    return c.json({ error: "episodeName là bắt buộc" }, 400);
  }
  try {
    const ref = await unlinkReference(c.req.param("id"), episodeName);
    return c.json(ref);
  } catch (e) {
    const err = e as Error & { code?: string };
    return c.json({ error: err.message }, err.code === "NOT_FOUND" ? 404 : 500);
  }
});
