import { Hono } from "hono";
import { buildWorkflowChains } from "../lib/workflow";

export const workflowRoutes = new Hono();

workflowRoutes.get("/", async (c) => {
  const chains = await buildWorkflowChains();
  return c.json({ chains });
});
