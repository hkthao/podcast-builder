import { Hono } from "hono";
import {
  listOpenAIModels,
  listOllamaModels,
  type LLMModel,
} from "../lib/llm-providers";

export const llmRoutes = new Hono();

/**
 * Bảng model khả dụng cho UI dropdown.
 * - openai: hardcoded list (chỉ trả nếu OPENAI_API_KEY có)
 * - ollama: query `http://localhost:11434/api/tags`, trả [] nếu Ollama không chạy
 */
llmRoutes.get("/models", async (c) => {
  const [openai, ollama] = await Promise.all([
    listOpenAIModels(),
    listOllamaModels(),
  ]);
  const result: Record<string, LLMModel[]> = { openai, ollama };
  return c.json(result);
});
