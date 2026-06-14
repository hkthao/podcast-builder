import { Hono } from "hono";
import { buildVisualLibrary } from "../lib/visual-library";

export const visualRoutes = new Hono();

visualRoutes.get("/", async (c) => {
  const data = await buildVisualLibrary();
  return c.json(data);
});
