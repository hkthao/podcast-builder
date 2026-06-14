/**
 * Settings routes — Phase 4b''.
 * Path: /api/settings
 *
 * Endpoints:
 *   GET    /api/settings/keys         → list status (KHÔNG return key value)
 *   PUT    /api/settings/keys/:provider  body {apiKey} → save
 *   DELETE /api/settings/keys/:provider  → unset (fallback env)
 */
import { Hono } from "hono";
import {
  deleteApiKey,
  KNOWN_PROVIDERS,
  listApiKeyStatuses,
  setApiKey,
  type ApiKeyProvider,
} from "../api-keys-store";

export const settingsRoutes = new Hono();

const isValidProvider = (p: string): p is ApiKeyProvider =>
  (KNOWN_PROVIDERS as readonly string[]).includes(p);

settingsRoutes.get("/keys", (c) => {
  return c.json({ keys: listApiKeyStatuses() });
});

settingsRoutes.put("/keys/:provider", async (c) => {
  const provider = c.req.param("provider");
  if (!isValidProvider(provider)) {
    return c.json(
      { error: `provider không hợp lệ. Hợp lệ: ${KNOWN_PROVIDERS.join(", ")}` },
      400,
    );
  }
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    return c.json({ error: "Body không phải JSON hợp lệ" }, 400);
  }
  const body = raw as { apiKey?: string };
  if (typeof body.apiKey !== "string") {
    return c.json({ error: "Thiếu field 'apiKey' (string)" }, 400);
  }
  try {
    setApiKey(provider, body.apiKey);
    return c.json({ ok: true });
  } catch (e) {
    const err = e as Error & { code?: string };
    const status = err.code === "VALIDATION" ? 400 : 500;
    return c.json({ error: err.message }, status);
  }
});

settingsRoutes.delete("/keys/:provider", (c) => {
  const provider = c.req.param("provider");
  if (!isValidProvider(provider)) {
    return c.json(
      { error: `provider không hợp lệ. Hợp lệ: ${KNOWN_PROVIDERS.join(", ")}` },
      400,
    );
  }
  const deleted = deleteApiKey(provider);
  return c.json({ deleted });
});
