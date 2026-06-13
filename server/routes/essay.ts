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
  updateEssayContent,
  type Essay,
  type EssayBrainstormRef,
} from "../lib/essay-store";
import { chat, chatStream, type LLMProvider } from "../lib/llm-providers";

export const essayRoutes = new Hono();

essayRoutes.get("/", async (c) => {
  const essays = await listEssays();
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

  const title = body.title.trim();
  const outline = body.outline?.trim() || null;
  const provider = body.provider as LLMProvider;
  const model = body.model.trim();
  const brainstormRef = body.brainstormRef ?? null;

  const id = newEssayId(title);
  const now = new Date().toISOString();
  const essay: Essay = {
    id,
    title,
    outline,
    content: "",
    nlmPrompt: null,
    brainstormRef,
    provider,
    model,
    createdAt: now,
    updatedAt: now,
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
