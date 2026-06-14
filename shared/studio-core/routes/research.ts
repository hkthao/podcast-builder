/**
 * Research endpoints — search asset providers + save to library.
 *
 * GET  /api/research/providers                  → list providers (enabled + needsKey)
 * GET  /api/research/search?q=&kind=&providers= → fan-out search, merged results
 * (Stage 3 sẽ thêm: POST /save, GET /library cho cross-episode reuse.)
 */
import { Hono } from "hono";
import { PROVIDERS, PROVIDERS_BY_ID } from "../asset-sources";
import type { AssetKind, AssetResult, LicenseStatus } from "../asset-sources/types";
import {
  deleteAsset,
  getAsset,
  linkToEpisode,
  listAssets,
  saveAsset,
  setTags,
  togglePin,
  unlinkFromEpisode,
  type LibraryFilters,
} from "../gallery-asset-store";

export const researchRoutes = new Hono();

const VALID_KINDS: ReadonlySet<AssetKind> = new Set([
  "image",
  "video",
  "audio",
]);

const SEARCH_TIMEOUT_MS = 15_000;

researchRoutes.get("/providers", (c) => {
  return c.json({
    providers: PROVIDERS.map((p) => p.info),
  });
});

researchRoutes.get("/search", async (c) => {
  const q = c.req.query("q")?.trim() ?? "";
  const kindRaw = c.req.query("kind") ?? "image";
  const providersParam = c.req.query("providers") ?? "";
  const pageRaw = c.req.query("page") ?? "1";
  const pageSizeRaw = c.req.query("pageSize") ?? "20";

  if (!q) {
    return c.json({ error: "Thiếu query param 'q'" }, 400);
  }
  if (!VALID_KINDS.has(kindRaw as AssetKind)) {
    return c.json(
      { error: `kind '${kindRaw}' không hợp lệ. Cho phép: image, video, audio` },
      400,
    );
  }
  const kind = kindRaw as AssetKind;
  const page = Math.max(1, Number(pageRaw) || 1);
  const pageSize = Math.min(50, Math.max(1, Number(pageSizeRaw) || 20));

  // Provider whitelist — nếu trống, dùng all enabled
  const enabledProviders = PROVIDERS.filter((p) => p.info.enabled);
  let selected = enabledProviders;
  if (providersParam) {
    const ids = providersParam.split(",").map((s) => s.trim());
    selected = enabledProviders.filter((p) => ids.includes(p.info.id));
    if (selected.length === 0) {
      return c.json(
        {
          error: `Không có provider hợp lệ. Available: ${enabledProviders.map((p) => p.info.id).join(", ")}`,
        },
        400,
      );
    }
  }
  // Filter providers support kind
  selected = selected.filter((p) => p.info.kinds.includes(kind));
  if (selected.length === 0) {
    return c.json({
      results: [],
      perProvider: {},
      note: `Không provider nào hỗ trợ kind=${kind}.`,
    });
  }

  // Fan-out song song với timeout per provider
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SEARCH_TIMEOUT_MS);

  const perProvider: Record<
    string,
    { count: number; error?: string }
  > = {};
  const settled = await Promise.allSettled(
    selected.map((p) =>
      p
        .search({ query: q, kind, page, pageSize, signal: controller.signal })
        .then((res) => ({ providerId: p.info.id, ...res })),
    ),
  );
  clearTimeout(timeout);

  const merged: AssetResult[] = [];
  for (let i = 0; i < settled.length; i++) {
    const provider = selected[i]!;
    const r = settled[i]!;
    if (r.status === "fulfilled") {
      merged.push(...r.value.results);
      perProvider[provider.info.id] = { count: r.value.results.length };
    } else {
      perProvider[provider.info.id] = {
        count: 0,
        error: r.reason instanceof Error ? r.reason.message : String(r.reason),
      };
    }
  }

  // Interleave để không bias theo provider order (round-robin)
  // Vẫn giữ tổng count đầy đủ cho UI.
  return c.json({
    results: merged,
    total: merged.length,
    perProvider,
    page,
    pageSize,
  });
});

// ──────────── Library: persisted gallery_assets table ────────────

/** Lưu AssetResult vào library (idempotent theo id). Optional tags. */
researchRoutes.post("/save", async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Body không phải JSON hợp lệ" }, 400);
  }
  const { asset, tags } = body as { asset?: AssetResult; tags?: string[] };
  if (!asset || typeof asset !== "object") {
    return c.json({ error: "Thiếu field 'asset' (AssetResult)" }, 400);
  }
  // Sanity-check required fields
  const required: Array<keyof AssetResult> = [
    "id",
    "provider",
    "kind",
    "title",
    "thumbUrl",
    "fullUrl",
    "sourcePage",
    "license",
    "licenseStatus",
  ];
  for (const f of required) {
    if (typeof (asset as Record<string, unknown>)[f] !== "string") {
      return c.json({ error: `Field 'asset.${f}' thiếu hoặc không phải string` }, 400);
    }
  }
  try {
    const saved = saveAsset(asset, Array.isArray(tags) ? tags : []);
    return c.json(saved, 201);
  } catch (e) {
    return c.json({ error: (e as Error).message }, 500);
  }
});

researchRoutes.get("/library", (c) => {
  const filters: LibraryFilters = {};
  const q = c.req.query("q");
  if (q) filters.q = q;
  const kind = c.req.query("kind");
  if (kind === "image" || kind === "video" || kind === "audio") filters.kind = kind;
  const provider = c.req.query("provider");
  if (provider) filters.provider = provider;
  const ls = c.req.query("licenseStatus");
  if (ls === "safe" || ls === "check" || ls === "blocked")
    filters.licenseStatus = ls as LicenseStatus;
  const tag = c.req.query("tag");
  if (tag) filters.tag = tag;
  const pinned = c.req.query("pinned");
  if (pinned === "true") filters.pinned = true;
  else if (pinned === "false") filters.pinned = false;
  return c.json({ assets: listAssets(filters) });
});

researchRoutes.get("/library/:id", (c) => {
  const asset = getAsset(c.req.param("id"));
  if (!asset) return c.json({ error: "Not found" }, 404);
  return c.json(asset);
});

researchRoutes.delete("/library/:id", (c) => {
  const ok = deleteAsset(c.req.param("id"));
  if (!ok) return c.json({ error: "Not found" }, 404);
  return c.json({ deleted: true });
});

researchRoutes.put("/library/:id/tags", async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Body không phải JSON hợp lệ" }, 400);
  }
  const { tags } = body as { tags?: string[] };
  if (!Array.isArray(tags)) {
    return c.json({ error: "Field 'tags' phải là array" }, 400);
  }
  const updated = setTags(c.req.param("id"), tags);
  if (!updated) return c.json({ error: "Not found" }, 404);
  return c.json(updated);
});

researchRoutes.put("/library/:id/pin", (c) => {
  const updated = togglePin(c.req.param("id"));
  if (!updated) return c.json({ error: "Not found" }, 404);
  return c.json(updated);
});

researchRoutes.post("/library/:id/link", async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Body không phải JSON hợp lệ" }, 400);
  }
  const { episodeName } = body as { episodeName?: string };
  if (typeof episodeName !== "string" || !episodeName) {
    return c.json({ error: "Thiếu episodeName" }, 400);
  }
  const updated = linkToEpisode(c.req.param("id"), episodeName);
  if (!updated) return c.json({ error: "Not found" }, 404);
  return c.json(updated);
});

researchRoutes.post("/library/:id/unlink", async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Body không phải JSON hợp lệ" }, 400);
  }
  const { episodeName } = body as { episodeName?: string };
  if (typeof episodeName !== "string" || !episodeName) {
    return c.json({ error: "Thiếu episodeName" }, 400);
  }
  const updated = unlinkFromEpisode(c.req.param("id"), episodeName);
  if (!updated) return c.json({ error: "Not found" }, 404);
  return c.json(updated);
});

/** Single-provider search — dùng cho dev/debug specific provider. */
researchRoutes.get("/search/:providerId", async (c) => {
  const providerId = c.req.param("providerId");
  const provider = PROVIDERS_BY_ID[providerId];
  if (!provider) {
    return c.json(
      { error: `Provider '${providerId}' không tồn tại` },
      404,
    );
  }
  const q = c.req.query("q")?.trim() ?? "";
  const kindRaw = c.req.query("kind") ?? "image";
  if (!q) return c.json({ error: "Thiếu query 'q'" }, 400);
  if (!VALID_KINDS.has(kindRaw as AssetKind)) {
    return c.json({ error: `kind '${kindRaw}' không hợp lệ` }, 400);
  }
  const kind = kindRaw as AssetKind;
  if (!provider.info.kinds.includes(kind)) {
    return c.json(
      { error: `${providerId} không hỗ trợ kind=${kind}` },
      400,
    );
  }
  try {
    const result = await provider.search({ query: q, kind });
    return c.json(result);
  } catch (e) {
    return c.json({ error: (e as Error).message }, 500);
  }
});
