/** /api/cleanup — dọn ổ cứng: GET quét dung lượng từng mục, POST xoá các mục đã chọn. */
import { Hono } from "hono";
import { diskUsage, runCleanup, scanCleanup } from "../lib/cleanup";

export const cleanupRoutes = new Hono();

cleanupRoutes.get("/", (c) => c.json(scanCleanup()));
cleanupRoutes.get("/disk", (c) => c.json(diskUsage()));
cleanupRoutes.post("/", async (c) => {
  const { categories } = (await c.req.json()) as { categories?: string[] };
  if (!Array.isArray(categories) || !categories.length) return c.json({ error: "Chọn ít nhất 1 mục" }, 400);
  return c.json({ ...runCleanup(categories), disk: diskUsage() });
});
