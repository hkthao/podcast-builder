/**
 * Research endpoints — search asset providers + save to library.
 *
 * GET  /api/research/providers                  → list providers (enabled + needsKey)
 * GET  /api/research/search?q=&kind=&providers= → fan-out search, merged results
 * (Stage 3 sẽ thêm: POST /save, GET /library cho cross-episode reuse.)
 */
import { Hono } from "hono";
import { PROVIDERS, PROVIDERS_BY_ID } from "../asset-sources";
import type { AssetKind, AssetResult } from "../asset-sources/types";

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
