/**
 * Visual Metaphor Library — extract metaphors từ outline mục #12 của
 * mỗi idea, aggregate qua tất cả sessions, group theo session.categories.
 *
 * Phase D part 2: tái dùng visual ẩn dụ thay vì nghĩ lại từ đầu mỗi tập.
 */
import { listSessions, isPodcastSession, type TopicCategory } from "./brainstorm-store";

export type VisualEntry = {
  metaphor: string;
  sessionId: string;
  sessionTopic: string;
  categories: TopicCategory[];
};

export type VisualLibrary = {
  total: number;
  byCategory: Record<string, VisualEntry[]>;
  uncategorized: VisualEntry[];
};

/**
 * Tìm section "VISUAL METAPHOR" trong outline (có hoặc không có số "12.").
 * Capture bullet items đến khi gặp section tiếp theo (số.) hoặc EOF.
 */
const extractMetaphors = (outline: string): string[] => {
  if (!outline) return [];
  const re = /(?:^|\n)\s*(?:12\.\s*)?VISUAL METAPHOR\s*\n([\s\S]*?)(?=\n\s*\d+\.\s|\n\s*[A-Z][A-Z\s/]+\n|$)/i;
  const match = outline.match(re);
  if (!match) return [];
  const block = match[1];
  // Bullet line: "- xxx" hoặc "• xxx" hoặc "* xxx"
  const items: string[] = [];
  for (const rawLine of block.split("\n")) {
    const line = rawLine.trim();
    const bullet = line.match(/^(?:[-•*]|\d+\.)\s+(.+)$/);
    if (bullet) {
      const text = bullet[1].trim();
      if (text.length > 2) items.push(text);
    }
  }
  return items;
};

export async function buildVisualLibrary(): Promise<VisualLibrary> {
  // Phase 3a: visual library extract từ outline mục #12 — chỉ podcast có.
  const sessions = (await listSessions({ style: "podcast" })).filter(
    isPodcastSession,
  );
  const all: VisualEntry[] = [];

  for (const session of sessions) {
    for (const idea of session.ideas) {
      const metaphors = extractMetaphors(idea.outline);
      for (const m of metaphors) {
        all.push({
          metaphor: m,
          sessionId: session.id,
          sessionTopic: session.topic,
          categories: session.categories ?? [],
        });
      }
    }
  }

  const byCategory: Record<string, VisualEntry[]> = {};
  const uncategorized: VisualEntry[] = [];

  for (const entry of all) {
    if (entry.categories.length === 0) {
      uncategorized.push(entry);
      continue;
    }
    for (const cat of entry.categories) {
      if (!byCategory[cat]) byCategory[cat] = [];
      byCategory[cat].push(entry);
    }
  }

  return { total: all.length, byCategory, uncategorized };
}
