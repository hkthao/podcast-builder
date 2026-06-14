import { Hono } from "hono";
import { buildWorkflowChains } from "../lib/workflow";

export const workflowRoutes = new Hono();

workflowRoutes.get("/", async (c) => {
  const styleParam = c.req.query("style");
  const style =
    styleParam === "gallery" || styleParam === "podcast" ? styleParam : undefined;
  const chains = await buildWorkflowChains(style ? { style } : {});
  return c.json({ chains });
});
