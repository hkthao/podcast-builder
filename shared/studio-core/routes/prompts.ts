/**
 * Prompts management routes — list / get / save override / reset cho từng
 * system prompt trong app.
 */
import { Hono } from "hono";
import {
  deleteOverride,
  getPrompt,
  isValidPromptKey,
  listAllPrompts,
  setOverride,
  type PromptKey,
} from "../prompt-overrides-store";

export const promptsRoutes = new Hono();

/** List tất cả prompt với default + override. */
promptsRoutes.get("/", (c) => c.json({ prompts: listAllPrompts() }));

/** Get 1 prompt cụ thể. */
promptsRoutes.get("/:key", (c) => {
  const key = c.req.param("key");
  if (!isValidPromptKey(key)) {
    return c.json({ error: `Prompt key không hợp lệ: ${key}` }, 400);
  }
  const meta = getPrompt(key as PromptKey);
  if (!meta) return c.json({ error: "Not found" }, 404);
  return c.json(meta);
});

/**
 * Save override. Body: { value: string }. Nếu value rỗng hoặc === default
 * thì store sẽ tự xoá row.
 */
promptsRoutes.put("/:key", async (c) => {
  const key = c.req.param("key");
  if (!isValidPromptKey(key)) {
    return c.json({ error: `Prompt key không hợp lệ: ${key}` }, 400);
  }
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    return c.json({ error: "Body không phải JSON hợp lệ" }, 400);
  }
  const body = raw as { value?: unknown };
  if (typeof body.value !== "string") {
    return c.json({ error: "Body cần field 'value' (string)" }, 400);
  }
  try {
    const meta = setOverride(key as PromptKey, body.value);
    return c.json(meta);
  } catch (e) {
    return c.json({ error: (e as Error).message }, 500);
  }
});

/** Reset về default — xoá override row. */
promptsRoutes.delete("/:key", (c) => {
  const key = c.req.param("key");
  if (!isValidPromptKey(key)) {
    return c.json({ error: `Prompt key không hợp lệ: ${key}` }, 400);
  }
  try {
    const meta = deleteOverride(key as PromptKey);
    return c.json(meta);
  } catch (e) {
    return c.json({ error: (e as Error).message }, 500);
  }
});
