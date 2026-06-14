/**
 * LLM-generated JSON đôi khi sai cú pháp (thiếu comma, unescaped quote,
 * truncate giữa chừng, markdown wrap). Try JSON.parse trước, fallback
 * jsonrepair nếu fail.
 */
import { jsonrepair } from "jsonrepair";

export function safeParseJson<T = unknown>(text: string): T {
  // Strip markdown wrap nếu LLM bọc ```json ... ```
  let cleaned = text.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/```\s*$/i, "")
      .trim();
  }
  try {
    return JSON.parse(cleaned) as T;
  } catch (e1) {
    try {
      const repaired = jsonrepair(cleaned);
      return JSON.parse(repaired) as T;
    } catch {
      const err = e1 as Error;
      const snippet = cleaned.slice(
        Math.max(0, posFromError(err.message) - 80),
        posFromError(err.message) + 80,
      );
      throw new Error(
        `JSON parse fail (cả jsonrepair cũng không cứu được). Lỗi gốc: ${err.message}. Đoạn quanh điểm lỗi: …${snippet}…`,
      );
    }
  }
}

const posFromError = (msg: string): number => {
  const m = msg.match(/position\s+(\d+)/);
  return m ? Number(m[1]) : 0;
};
