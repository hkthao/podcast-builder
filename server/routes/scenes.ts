import { Hono } from "hono";
import {
  SCENE_CATALOG,
  countSceneUsage,
  type SceneCatalogEntry,
} from "../lib/scene-catalog";
import {
  generateAllSceneThumbs,
  getThumbUrl,
} from "../lib/scene-catalog-thumbs";

export const scenesRoutes = new Hono();

export type SceneCatalogResponse = {
  scenes: Array<
    SceneCatalogEntry & { usageCount: number; thumbUrl: string | null }
  >;
  totalScenes: number;
  totalUsage: number;
  thumbsGenerated: number;
};

/** GET /api/scenes/catalog — danh sách 17 scene + usage count + thumb URL. */
scenesRoutes.get("/catalog", async (c) => {
  const usage = await countSceneUsage();
  const scenes = SCENE_CATALOG.map((s) => ({
    ...s,
    usageCount: usage[s.key] ?? 0,
    thumbUrl: getThumbUrl(s.key),
  }));
  const totalUsage = scenes.reduce((sum, s) => sum + s.usageCount, 0);
  const thumbsGenerated = scenes.filter((s) => s.thumbUrl).length;
  const payload: SceneCatalogResponse = {
    scenes,
    totalScenes: scenes.length,
    totalUsage,
    thumbsGenerated,
  };
  return c.json(payload);
});

/**
 * POST /api/scenes/catalog/thumbs/regenerate
 * Re-render thumbnail cho TẤT CẢ scene (cost ~20-25s). Sync — long-running.
 * Client nên show loader trong khi đợi.
 */
scenesRoutes.post("/catalog/thumbs/regenerate", async (c) => {
  try {
    const result = await generateAllSceneThumbs();
    return c.json(result);
  } catch (e) {
    return c.json({ error: (e as Error).message }, 500);
  }
});
