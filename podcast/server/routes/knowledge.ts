import { Hono } from "hono";
import { buildKnowledgeGraph } from "../lib/knowledge-graph";

export const knowledgeRoutes = new Hono();

knowledgeRoutes.get("/", async (c) => {
  const data = await buildKnowledgeGraph();
  return c.json(data);
});
