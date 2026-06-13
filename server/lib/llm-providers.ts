/**
 * Provider abstraction cho LLM chat.
 *
 * Hỗ trợ:
 * - "openai" — qua OpenAI SDK, dùng OPENAI_API_KEY
 * - "ollama" — qua HTTP `http://localhost:11434` (configurable bằng OLLAMA_HOST)
 *
 * Cả 2 đều phải hỗ trợ JSON-mode để brainstorm parse strict được.
 */
import OpenAI from "openai";

export type LLMProvider = "openai" | "ollama";

export type LLMModel = {
  id: string;
  /** Tên đẹp hiển thị UI */
  label: string;
  /** Có thể null nếu provider không trả size (OpenAI) */
  sizeBytes: number | null;
};

const OPENAI_MODELS: LLMModel[] = [
  { id: "gpt-4o-mini", label: "gpt-4o-mini (rẻ, nhanh)", sizeBytes: null },
  { id: "gpt-4o", label: "gpt-4o (chất lượng)", sizeBytes: null },
  { id: "gpt-4-turbo", label: "gpt-4-turbo", sizeBytes: null },
];

const OLLAMA_HOST = process.env.OLLAMA_HOST ?? "http://localhost:11434";

export async function listOpenAIModels(): Promise<LLMModel[]> {
  if (!process.env.OPENAI_API_KEY) return [];
  return OPENAI_MODELS;
}

export async function listOllamaModels(): Promise<LLMModel[]> {
  try {
    const res = await fetch(`${OLLAMA_HOST}/api/tags`, {
      signal: AbortSignal.timeout(2000),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as {
      models?: Array<{ name?: string; size?: number; capabilities?: string[] }>;
    };
    if (!Array.isArray(data.models)) return [];
    return data.models
      .filter(
        (m): m is { name: string; size?: number; capabilities?: string[] } =>
          typeof m.name === "string",
      )
      .filter((m) => {
        // Loại embedding-only models (nomic-embed, etc) — không chat được
        const caps = m.capabilities;
        if (!caps || !Array.isArray(caps)) return true;
        return !(caps.length === 1 && caps[0] === "embedding");
      })
      .map((m) => ({
        id: m.name,
        label: m.name,
        sizeBytes: typeof m.size === "number" ? m.size : null,
      }))
      .sort((a, b) => a.id.localeCompare(b.id));
  } catch {
    return [];
  }
}

export type LLMChatRequest = {
  provider: LLMProvider;
  model: string;
  systemPrompt: string;
  userContent: string;
  temperature?: number;
  /** Yêu cầu JSON output. Provider tự config. */
  jsonMode?: boolean;
};

export async function chat(req: LLMChatRequest): Promise<string> {
  if (req.provider === "openai") {
    if (!process.env.OPENAI_API_KEY) {
      const err = new Error("Thiếu OPENAI_API_KEY trong .env") as Error & {
        code: string;
      };
      err.code = "VALIDATION";
      throw err;
    }
    const openai = new OpenAI();
    const response = await openai.chat.completions.create({
      model: req.model,
      temperature: req.temperature ?? 0.7,
      messages: [
        { role: "system", content: req.systemPrompt },
        { role: "user", content: req.userContent },
      ],
      ...(req.jsonMode ? { response_format: { type: "json_object" as const } } : {}),
    });
    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error("OpenAI trả về empty response");
    return content;
  }

  if (req.provider === "ollama") {
    // 5 phút timeout cho local model (CPU inference có thể chậm)
    const res = await fetch(`${OLLAMA_HOST}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: req.model,
        messages: [
          { role: "system", content: req.systemPrompt },
          { role: "user", content: req.userContent },
        ],
        stream: false,
        ...(req.jsonMode ? { format: "json" as const } : {}),
        options: { temperature: req.temperature ?? 0.7 },
      }),
      signal: AbortSignal.timeout(5 * 60 * 1000),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(
        `Ollama lỗi ${res.status}: ${body.slice(0, 200) || res.statusText}`,
      );
    }
    const data = (await res.json()) as {
      message?: { content?: string };
    };
    const content = data.message?.content;
    if (!content) throw new Error("Ollama trả về empty content");
    return content;
  }

  const err = new Error(`Provider không hỗ trợ: ${req.provider}`) as Error & {
    code: string;
  };
  err.code = "VALIDATION";
  throw err;
}
