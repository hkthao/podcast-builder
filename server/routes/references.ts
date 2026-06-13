import { Hono } from "hono";
import {
  addReference,
  buildRefsSuggestUserContent,
  deleteReference,
  getReference,
  linkReference,
  listAllTags,
  listReferences,
  REFS_SUGGEST_SYSTEM,
  scrapeTitle,
  unlinkReference,
  updateReference,
  type Reference,
  type SuggestedRef,
} from "../lib/reference-store";
import { chat, type LLMProvider } from "../lib/llm-providers";

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
 * LLM gợi ý 5-7 reference cho essay (title + content snippet).
 * Body: {title, essayContent, provider, model}
 * KHÔNG save vào library — chỉ trả suggestions ephemeral. User pick + add tay.
 * Lý do: LLM hay bịa URL → không trả URL, user paste vào Google tìm bản thật.
 */
referencesRoutes.post("/_/suggest", async (c) => {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    return c.json({ error: "Body không phải JSON" }, 400);
  }
  const body = raw as {
    title?: string;
    essayContent?: string;
    provider?: string;
    model?: string;
  };
  if (typeof body.title !== "string" || body.title.trim().length === 0) {
    return c.json({ error: "Thiếu title" }, 400);
  }
  if (
    typeof body.essayContent !== "string" ||
    body.essayContent.trim().length < 100
  ) {
    return c.json(
      { error: "Cần essayContent ≥ 100 chars để LLM bắt chủ đề" },
      400,
    );
  }
  if (body.provider !== "openai" && body.provider !== "ollama") {
    return c.json({ error: "provider phải là 'openai' hoặc 'ollama'" }, 400);
  }
  if (typeof body.model !== "string" || body.model.trim().length === 0) {
    return c.json({ error: "Thiếu model" }, 400);
  }
  try {
    const content = await chat({
      provider: body.provider as LLMProvider,
      model: body.model.trim(),
      systemPrompt: REFS_SUGGEST_SYSTEM,
      userContent: buildRefsSuggestUserContent(
        body.title.trim(),
        body.essayContent,
      ),
      temperature: 0.4,
      jsonMode: true,
    });
    const parsed = JSON.parse(content) as { suggestions?: unknown };
    if (!Array.isArray(parsed.suggestions)) {
      return c.json({ error: "LLM response thiếu 'suggestions' array" }, 502);
    }
    const VALID_TYPES = ["pdf", "article", "video", "book", "podcast", "other"];
    const suggestions: SuggestedRef[] = [];
    for (const r of parsed.suggestions as unknown[]) {
      const o = r as Partial<SuggestedRef>;
      if (
        typeof o.title !== "string" ||
        typeof o.reason !== "string" ||
        typeof o.searchHint !== "string"
      )
        continue;
      const type =
        typeof o.type === "string" && VALID_TYPES.includes(o.type)
          ? (o.type as SuggestedRef["type"])
          : "other";
      const tierRaw = typeof o.tier === "number" ? Math.round(o.tier) : 4;
      const tier = (Math.max(1, Math.min(5, tierRaw)) as 1 | 2 | 3 | 4 | 5);
      suggestions.push({
        title: o.title.trim(),
        author:
          typeof o.author === "string" && o.author.trim()
            ? o.author.trim()
            : null,
        type,
        reason: o.reason.trim(),
        searchHint: o.searchHint.trim(),
        tier,
        field:
          typeof o.field === "string" && o.field.trim()
            ? o.field.trim()
            : "Other",
      });
    }
    // Sort theo tier asc — meta-analysis lên đầu
    suggestions.sort((a, b) => a.tier - b.tier);
    if (suggestions.length === 0) {
      return c.json({ error: "LLM trả về 0 suggestion parse được" }, 502);
    }
    return c.json({ suggestions });
  } catch (e) {
    const err = e as Error & { code?: string };
    const status = err.code === "VALIDATION" ? 400 : 500;
    return c.json({ error: err.message }, status);
  }
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
