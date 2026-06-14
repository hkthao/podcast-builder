import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import {
  buildEssayUserPrompt,
  buildNlmPromptUserContent,
  deleteEssay,
  ESSAY_SYSTEM_PROMPT,
  getEssay,
  listEssays,
  newEssayId,
  NLM_PROMPT_SYSTEM,
  saveEssay,
  saveEssayDerivative,
  updateEssayContent,
  type DerivativeType,
  type Essay,
  type EssayBrainstormRef,
  type ShortsScript,
} from "../lib/essay-store";
import { chat, chatStream, type LLMProvider } from "../../../shared/studio-core/llm-providers";
import { safeParseJson } from "../../../shared/lib/safe-json";
import {
  BLOG_SYSTEM,
  FB_POSTS_SYSTEM,
  NEWSLETTER_SYSTEM,
  QUOTES_SYSTEM,
  SHORTS_SYSTEM,
} from "../lib/derivative-prompts";

export const essayRoutes = new Hono();

essayRoutes.get("/", async (c) => {
  const styleParam = c.req.query("style");
  const style =
    styleParam === "gallery" || styleParam === "podcast" ? styleParam : undefined;
  const essays = await listEssays(style ? { style } : {});
  return c.json({ essays });
});

essayRoutes.get("/:id", async (c) => {
  const id = c.req.param("id");
  const e = await getEssay(id);
  if (!e) return c.json({ error: "Essay not found" }, 404);
  return c.json(e);
});

essayRoutes.delete("/:id", async (c) => {
  const id = c.req.param("id");
  const ok = await deleteEssay(id);
  return c.json({ deleted: ok });
});

essayRoutes.put("/:id", async (c) => {
  const id = c.req.param("id");
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    return c.json({ error: "Body không phải JSON hợp lệ" }, 400);
  }
  const body = raw as {
    title?: string;
    content?: string;
    outline?: string | null;
    nlmPrompt?: string | null;
  };
  const updated = await updateEssayContent(id, body);
  if (!updated) return c.json({ error: "Essay not found" }, 404);
  return c.json(updated);
});

/**
 * Gen NotebookLM prompt từ title + essay content. KHÔNG streaming —
 * prompt ngắn (4-8 câu), 1 shot đủ nhanh.
 * Body: {provider, model}
 * Trả: Essay đã save với nlmPrompt field cập nhật.
 */
essayRoutes.post("/:id/nlm-prompt", async (c) => {
  const id = c.req.param("id");
  const essay = await getEssay(id);
  if (!essay) return c.json({ error: "Essay not found" }, 404);
  if (!essay.content || essay.content.trim().length === 0) {
    return c.json(
      { error: "Essay chưa có content. Gen essay trước rồi mới gen prompt." },
      400,
    );
  }
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    return c.json({ error: "Body không phải JSON hợp lệ" }, 400);
  }
  const body = raw as { provider?: string; model?: string };
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
      systemPrompt: NLM_PROMPT_SYSTEM,
      userContent: buildNlmPromptUserContent(essay.title, essay.content),
      temperature: 0.7,
    });
    const updated = await updateEssayContent(id, {
      nlmPrompt: content.trim(),
    });
    if (!updated) return c.json({ error: "Update failed" }, 500);
    return c.json(updated);
  } catch (e) {
    const err = e as Error & { code?: string };
    const status = err.code === "VALIDATION" ? 400 : 500;
    return c.json({ error: err.message }, status);
  }
});

/**
 * Stream gen essay qua SSE.
 * Body: {title, outline?, brainstormRef?, provider, model}
 *
 * Events:
 *   - {type:"start", essay:{id,...}} ngay sau khi tạo
 *   - {type:"delta", text:"…"} từng chunk
 *   - {type:"done", essay:{...}} khi xong (full content đã save)
 *   - {type:"error", error:"…"} nếu lỗi
 */
essayRoutes.post("/stream", async (c) => {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    return c.json({ error: "Body không phải JSON hợp lệ" }, 400);
  }
  const body = raw as {
    title?: string;
    outline?: string;
    brainstormRef?: EssayBrainstormRef;
    provider?: string;
    model?: string;
    style?: string;
  };
  if (typeof body.title !== "string" || body.title.trim().length === 0) {
    return c.json({ error: "Thiếu title" }, 400);
  }
  if (
    body.provider !== "openai" &&
    body.provider !== "ollama"
  ) {
    return c.json({ error: "provider phải là 'openai' hoặc 'ollama'" }, 400);
  }
  if (typeof body.model !== "string" || body.model.trim().length === 0) {
    return c.json({ error: "Thiếu model" }, 400);
  }
  if (body.style && body.style !== "podcast" && body.style !== "gallery") {
    return c.json({ error: "style phải là 'podcast' hoặc 'gallery'" }, 400);
  }

  const title = body.title.trim();
  const outline = body.outline?.trim() || null;
  const provider = body.provider as LLMProvider;
  const model = body.model.trim();
  const brainstormRef = body.brainstormRef ?? null;
  const style = (body.style as "podcast" | "gallery" | undefined) ?? "podcast";

  const id = newEssayId(title);
  const now = new Date().toISOString();
  const essay: Essay = {
    id,
    title,
    outline,
    content: "",
    nlmPrompt: null,
    suggestedRefs: [],
    derivatives: {
      shorts: [],
      fbPosts: [],
      quotes: [],
      blog: null,
      newsletter: null,
    },
    brainstormRef,
    provider,
    model,
    createdAt: now,
    updatedAt: now,
    style,
  };

  return streamSSE(c, async (stream) => {
    await stream.writeSSE({
      data: JSON.stringify({ type: "start", essay }),
    });

    const abortCtl = new AbortController();
    stream.onAbort(() => abortCtl.abort());

    try {
      // Buffer accumulator để flush delta event mỗi vài token
      let buffered = "";
      let flushTimer: NodeJS.Timeout | null = null;
      const flush = async () => {
        if (buffered.length === 0) return;
        const text = buffered;
        buffered = "";
        await stream.writeSSE({
          data: JSON.stringify({ type: "delta", text }),
        });
      };

      const fullContent = await chatStream(
        {
          provider,
          model,
          systemPrompt: ESSAY_SYSTEM_PROMPT,
          userContent: buildEssayUserPrompt(title, outline),
          temperature: 0.8,
        },
        (delta) => {
          buffered += delta;
          // flush mỗi 100ms hoặc khi >256 chars
          if (buffered.length > 256) {
            if (flushTimer) {
              clearTimeout(flushTimer);
              flushTimer = null;
            }
            void flush();
          } else if (!flushTimer) {
            flushTimer = setTimeout(() => {
              flushTimer = null;
              void flush();
            }, 100);
          }
        },
        abortCtl.signal,
      );
      if (flushTimer) clearTimeout(flushTimer);
      await flush();

      essay.content = fullContent;
      essay.updatedAt = new Date().toISOString();
      await saveEssay(essay);

      await stream.writeSSE({
        data: JSON.stringify({ type: "done", essay }),
      });
    } catch (e) {
      const err = e as Error;
      await stream.writeSSE({
        data: JSON.stringify({ type: "error", error: err.message }),
      });
    }
  });
});

/**
 * Phase E: Tái sử dụng nội dung — 5 LLM endpoint sinh derivative từ essay.
 * Body: {provider, model}. Persist vào essay row.
 */

type DerivBody = { provider?: string; model?: string };

type DerivStatus = 400 | 404 | 500;

const requireEssayWithContent = async (
  id: string,
): Promise<Essay | { error: string; status: DerivStatus }> => {
  const essay = await getEssay(id);
  if (!essay) return { error: "Essay not found", status: 404 };
  if (!essay.content || essay.content.trim().length < 200) {
    return {
      error: "Essay content quá ngắn (< 200 chars). Gen essay trước.",
      status: 400,
    };
  }
  return essay;
};

const parseDerivBody = (
  raw: unknown,
):
  | { provider: LLMProvider; model: string }
  | { error: string; status: DerivStatus } => {
  const body = raw as DerivBody;
  if (body.provider !== "openai" && body.provider !== "ollama") {
    return { error: "provider phải là 'openai' hoặc 'ollama'", status: 400 };
  }
  if (typeof body.model !== "string" || body.model.trim().length === 0) {
    return { error: "Thiếu model", status: 400 };
  }
  return {
    provider: body.provider as LLMProvider,
    model: body.model.trim(),
  };
};

const userPromptForDerivative = (essay: Essay): string => {
  return [
    `Title: ${essay.title}`,
    `\nEssay content:\n${essay.content}`,
    `\nViết derivative ngay bây giờ.`,
  ].join("");
};

const callDeriv = async (
  essay: Essay,
  systemPrompt: string,
  body: { provider: LLMProvider; model: string },
  jsonMode: boolean,
): Promise<string> => {
  return chat({
    provider: body.provider,
    model: body.model,
    systemPrompt,
    userContent: userPromptForDerivative(essay),
    temperature: 0.8,
    jsonMode,
  });
};

const persistDerivative = async <K extends DerivativeType>(
  id: string,
  type: K,
  value: Essay["derivatives"][K],
): Promise<Essay> => {
  const updated = await saveEssayDerivative(id, type, value);
  if (!updated) throw new Error("Essay biến mất giữa chừng");
  return updated;
};

// ---- Shorts (3 scripts) ----
essayRoutes.post("/:id/derivatives/shorts", async (c) => {
  const id = c.req.param("id");
  const essay = await requireEssayWithContent(id);
  if ("error" in essay) return c.json({ error: essay.error }, essay.status);
  const raw = await c.req.json().catch(() => ({}));
  const body = parseDerivBody(raw);
  if ("error" in body) return c.json({ error: body.error }, body.status);
  try {
    const content = await callDeriv(essay, SHORTS_SYSTEM, body, true);
    const parsed = safeParseJson<{ shorts?: unknown }>(content);
    if (!Array.isArray(parsed.shorts)) {
      return c.json({ error: "LLM thiếu 'shorts' array" }, 502);
    }
    const shorts: ShortsScript[] = [];
    for (const r of parsed.shorts as unknown[]) {
      const o = r as Partial<ShortsScript>;
      if (
        typeof o.hook !== "string" ||
        typeof o.body !== "string" ||
        typeof o.cta !== "string"
      )
        continue;
      shorts.push({
        duration: typeof o.duration === "number" ? o.duration : 60,
        hook: o.hook.trim(),
        body: o.body.trim(),
        cta: o.cta.trim(),
      });
    }
    if (shorts.length === 0) return c.json({ error: "0 shorts parse được" }, 502);
    const updated = await persistDerivative(id, "shorts", shorts);
    return c.json(updated);
  } catch (e) {
    return c.json({ error: (e as Error).message }, 500);
  }
});

// ---- FB Posts (5) ----
essayRoutes.post("/:id/derivatives/fb-posts", async (c) => {
  const id = c.req.param("id");
  const essay = await requireEssayWithContent(id);
  if ("error" in essay) return c.json({ error: essay.error }, essay.status);
  const raw = await c.req.json().catch(() => ({}));
  const body = parseDerivBody(raw);
  if ("error" in body) return c.json({ error: body.error }, body.status);
  try {
    const content = await callDeriv(essay, FB_POSTS_SYSTEM, body, true);
    const parsed = safeParseJson<{ posts?: unknown }>(content);
    if (!Array.isArray(parsed.posts)) {
      return c.json({ error: "LLM thiếu 'posts' array" }, 502);
    }
    const posts = (parsed.posts as unknown[])
      .filter((p): p is string => typeof p === "string" && p.trim().length > 0)
      .map((p) => p.trim());
    if (posts.length === 0) return c.json({ error: "0 post parse được" }, 502);
    const updated = await persistDerivative(id, "fbPosts", posts);
    return c.json(updated);
  } catch (e) {
    return c.json({ error: (e as Error).message }, 500);
  }
});

// ---- Quotes (10) ----
essayRoutes.post("/:id/derivatives/quotes", async (c) => {
  const id = c.req.param("id");
  const essay = await requireEssayWithContent(id);
  if ("error" in essay) return c.json({ error: essay.error }, essay.status);
  const raw = await c.req.json().catch(() => ({}));
  const body = parseDerivBody(raw);
  if ("error" in body) return c.json({ error: body.error }, body.status);
  try {
    const content = await callDeriv(essay, QUOTES_SYSTEM, body, true);
    const parsed = safeParseJson<{ quotes?: unknown }>(content);
    if (!Array.isArray(parsed.quotes)) {
      return c.json({ error: "LLM thiếu 'quotes' array" }, 502);
    }
    const quotes = (parsed.quotes as unknown[])
      .filter((q): q is string => typeof q === "string" && q.trim().length > 0)
      .map((q) => q.trim().replace(/^["']|["']$/g, ""));
    if (quotes.length === 0) return c.json({ error: "0 quote parse được" }, 502);
    const updated = await persistDerivative(id, "quotes", quotes);
    return c.json(updated);
  } catch (e) {
    return c.json({ error: (e as Error).message }, 500);
  }
});

// ---- Blog (markdown) ----
essayRoutes.post("/:id/derivatives/blog", async (c) => {
  const id = c.req.param("id");
  const essay = await requireEssayWithContent(id);
  if ("error" in essay) return c.json({ error: essay.error }, essay.status);
  const raw = await c.req.json().catch(() => ({}));
  const body = parseDerivBody(raw);
  if ("error" in body) return c.json({ error: body.error }, body.status);
  try {
    const content = await callDeriv(essay, BLOG_SYSTEM, body, false);
    const cleaned = content.trim().replace(/^```(?:markdown|md)?\s*/i, "").replace(/```\s*$/, "");
    const updated = await persistDerivative(id, "blog", cleaned);
    return c.json(updated);
  } catch (e) {
    return c.json({ error: (e as Error).message }, 500);
  }
});

// ---- Newsletter (markdown) ----
essayRoutes.post("/:id/derivatives/newsletter", async (c) => {
  const id = c.req.param("id");
  const essay = await requireEssayWithContent(id);
  if ("error" in essay) return c.json({ error: essay.error }, essay.status);
  const raw = await c.req.json().catch(() => ({}));
  const body = parseDerivBody(raw);
  if ("error" in body) return c.json({ error: body.error }, body.status);
  try {
    const content = await callDeriv(essay, NEWSLETTER_SYSTEM, body, false);
    const cleaned = content.trim().replace(/^```(?:markdown|md)?\s*/i, "").replace(/```\s*$/, "");
    const updated = await persistDerivative(id, "newsletter", cleaned);
    return c.json(updated);
  } catch (e) {
    return c.json({ error: (e as Error).message }, 500);
  }
});
