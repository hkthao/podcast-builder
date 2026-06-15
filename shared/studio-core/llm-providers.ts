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
import { getApiKey } from "./api-keys-store";

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
  if (!getApiKey("openai")) return [];
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
  /**
   * Cap output tokens. Khi gen JSON cấu trúc lớn (5 idea × 13 field) cần
   * set cao để LLM không truncate giữa chừng → JSON malformed/thiếu idea.
   * Default null = provider tự quyết.
   */
  maxTokens?: number;
};

/**
 * Stream chat. Callback `onChunk` được gọi mỗi token mới.
 * Trả về full content khi xong.
 * Throws nếu abort signal trigger giữa chừng.
 */
export async function chatStream(
  req: LLMChatRequest,
  onChunk: (delta: string) => void,
  signal?: AbortSignal,
): Promise<string> {
  if (req.provider === "openai") {
    const apiKey = getApiKey("openai");
    if (!apiKey) {
      const err = new Error(
        "Thiếu OPENAI_API_KEY — set qua Settings (/settings) hoặc .env",
      ) as Error & { code: string };
      err.code = "VALIDATION";
      throw err;
    }
    const openai = new OpenAI({ apiKey });
    const stream = await openai.chat.completions.create(
      {
        model: req.model,
        temperature: req.temperature ?? 0.7,
        messages: [
          { role: "system", content: req.systemPrompt },
          { role: "user", content: req.userContent },
        ],
        stream: true,
        ...(req.jsonMode ? { response_format: { type: "json_object" as const } } : {}),
      },
      { signal },
    );
    let full = "";
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) {
        full += delta;
        onChunk(delta);
      }
    }
    return full;
  }

  if (req.provider === "ollama") {
    const res = await fetch(`${OLLAMA_HOST}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: req.model,
        messages: [
          { role: "system", content: req.systemPrompt },
          { role: "user", content: req.userContent },
        ],
        stream: true,
        ...(req.jsonMode ? { format: "json" as const } : {}),
        options: { temperature: req.temperature ?? 0.7 },
      }),
      signal,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(
        `Ollama lỗi ${res.status}: ${body.slice(0, 200) || res.statusText}`,
      );
    }
    if (!res.body) throw new Error("Ollama không trả về body");
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let full = "";
    let buffer = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      // ndjson: tách theo \n
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const obj = JSON.parse(line) as {
            message?: { content?: string };
            done?: boolean;
          };
          const delta = obj.message?.content;
          if (delta) {
            full += delta;
            onChunk(delta);
          }
        } catch {
          /* line không phải JSON hợp lệ — bỏ qua */
        }
      }
    }
    return full;
  }

  const err = new Error(`Provider không hỗ trợ: ${req.provider}`) as Error & {
    code: string;
  };
  err.code = "VALIDATION";
  throw err;
}

export async function chat(req: LLMChatRequest): Promise<string> {
  if (req.provider === "openai") {
    const apiKey = getApiKey("openai");
    if (!apiKey) {
      const err = new Error(
        "Thiếu OPENAI_API_KEY — set qua Settings (/settings) hoặc .env",
      ) as Error & { code: string };
      err.code = "VALIDATION";
      throw err;
    }
    const openai = new OpenAI({ apiKey });
    const response = await openai.chat.completions.create({
      model: req.model,
      temperature: req.temperature ?? 0.7,
      messages: [
        { role: "system", content: req.systemPrompt },
        { role: "user", content: req.userContent },
      ],
      ...(req.jsonMode ? { response_format: { type: "json_object" as const } } : {}),
      ...(req.maxTokens ? { max_tokens: req.maxTokens } : {}),
    });
    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error("OpenAI trả về empty response");
    const finishReason = response.choices[0]?.finish_reason;
    if (finishReason === "length") {
      console.warn(
        `[llm] OpenAI ${req.model} truncate output do hit max_tokens — JSON có thể không hoàn chỉnh. Tăng maxTokens hoặc giảm scope yêu cầu.`,
      );
    }
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
