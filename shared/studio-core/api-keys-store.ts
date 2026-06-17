/**
 * API keys store — Phase 4b''.
 *
 * User edit API keys qua Settings UI thay vì sửa .env. DB-first, env fallback
 * để backward-compat với key đã có trong .env.
 *
 * Security model: local-only studio app. DB là file plaintext trên máy user
 * không khác gì .env file. Không lưu trên server shared / không expose qua
 * HTTP với CORS rộng. UI KHÔNG GET API key value — chỉ POST/DELETE.
 *
 * Status response cho UI chỉ chứa:
 *   - hasKey: boolean
 *   - source: "db" | "env" | "none"
 *   - keyHint: last 4 chars (chỉ khi source="db")
 */
import { getDb } from "./db";

export const KNOWN_PROVIDERS = [
  "openai",
  "gemini",
  "anthropic",
  "google-vertex-ai",
  "pexels",
] as const;
export type ApiKeyProvider = (typeof KNOWN_PROVIDERS)[number];

/** Env var name theo convention `<PROVIDER>_API_KEY`. Hyphen → underscore. */
const envVarName = (p: ApiKeyProvider): string =>
  `${p.toUpperCase().replace(/-/g, "_")}_API_KEY`;

/** Special fallback: Gemini có thể đặt `GOOGLE_API_KEY` cũ. */
const fallbackEnvNames = (p: ApiKeyProvider): string[] => {
  if (p === "gemini") return ["GOOGLE_API_KEY"];
  return [];
};

/**
 * Get API key cho 1 provider. DB row ưu tiên — nếu user set qua UI sẽ override
 * env var. Fallback env var nếu DB không có.
 */
export function getApiKey(provider: ApiKeyProvider): string | null {
  const row = getDb()
    .prepare("SELECT api_key FROM api_keys WHERE provider = ?")
    .get(provider) as { api_key?: string } | undefined;
  if (row?.api_key) return row.api_key;

  const envValue = process.env[envVarName(provider)];
  if (envValue) return envValue;

  for (const fb of fallbackEnvNames(provider)) {
    const v = process.env[fb];
    if (v) return v;
  }
  return null;
}

export type ApiKeyStatus = {
  provider: ApiKeyProvider;
  hasKey: boolean;
  source: "db" | "env" | "none";
  /** Last 4 chars của key — chỉ trả khi source="db". UI dùng để xác nhận. */
  keyHint: string | null;
};

export function getApiKeyStatus(provider: ApiKeyProvider): ApiKeyStatus {
  const row = getDb()
    .prepare("SELECT api_key FROM api_keys WHERE provider = ?")
    .get(provider) as { api_key?: string } | undefined;
  if (row?.api_key) {
    return {
      provider,
      hasKey: true,
      source: "db",
      keyHint: row.api_key.slice(-4),
    };
  }
  const envValue = process.env[envVarName(provider)];
  if (envValue) {
    return { provider, hasKey: true, source: "env", keyHint: null };
  }
  for (const fb of fallbackEnvNames(provider)) {
    if (process.env[fb]) {
      return { provider, hasKey: true, source: "env", keyHint: null };
    }
  }
  return { provider, hasKey: false, source: "none", keyHint: null };
}

export function listApiKeyStatuses(): ApiKeyStatus[] {
  return KNOWN_PROVIDERS.map((p) => getApiKeyStatus(p));
}

/** Set/replace API key cho 1 provider. */
export function setApiKey(provider: ApiKeyProvider, apiKey: string): void {
  const trimmed = apiKey.trim();
  if (!trimmed) {
    const err = new Error("API key không được để trống") as Error & {
      code: string;
    };
    err.code = "VALIDATION";
    throw err;
  }
  getDb()
    .prepare(
      `INSERT OR REPLACE INTO api_keys (provider, api_key, updated_at)
       VALUES (?, ?, ?)`,
    )
    .run(provider, trimmed, new Date().toISOString());
}

/** Xoá key trong DB. Sau khi xoá, getApiKey fallback về env (nếu có). */
export function deleteApiKey(provider: ApiKeyProvider): boolean {
  const result = getDb()
    .prepare("DELETE FROM api_keys WHERE provider = ?")
    .run(provider);
  return result.changes > 0;
}
