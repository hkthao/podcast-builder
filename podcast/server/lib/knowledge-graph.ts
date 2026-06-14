/**
 * Knowledge Graph — aggregate framework/thinker/concept mentions
 * across all brainstorm sessions.
 *
 * Phase D: 1 paper đọc 1 lần dùng 20 video. Cho user thấy concept
 * nào đã cover, session nào dùng nó, để tái sử dụng + tránh trùng.
 *
 * Extraction strategy: curated concept list + case-insensitive substring
 * match trên text fields (outline + observation + storyBank + historicalExamples).
 */
import { listSessions } from "./brainstorm-store";

const CONCEPTS: Array<{ name: string; aliases?: string[]; group: string }> = [
  // Triết gia
  { name: "Heidegger", group: "Philosophy" },
  { name: "Nietzsche", group: "Philosophy" },
  { name: "Camus", group: "Philosophy" },
  { name: "Sartre", group: "Philosophy" },
  { name: "Schopenhauer", group: "Philosophy" },
  { name: "Marcus Aurelius", group: "Philosophy" },
  { name: "Byung-Chul Han", aliases: ["Han", "Byung Chul Han"], group: "Philosophy" },
  { name: "Hannah Arendt", aliases: ["Arendt"], group: "Philosophy" },
  { name: "Carl Jung", aliases: ["Jung"], group: "Philosophy" },
  { name: "Stoicism", aliases: ["Stoic"], group: "Philosophy" },
  { name: "Existentialism", aliases: ["chủ nghĩa hiện sinh"], group: "Philosophy" },

  // Psychology theories
  { name: "Hedonic Adaptation", aliases: ["thích nghi khoái cảm"], group: "Psychology" },
  { name: "Loss Aversion", aliases: ["sợ mất"], group: "Psychology" },
  { name: "Cognitive Dissonance", aliases: ["bất hoà nhận thức"], group: "Psychology" },
  { name: "Self Determination Theory", aliases: ["SDT"], group: "Psychology" },
  { name: "Terror Management Theory", aliases: ["TMT"], group: "Psychology" },
  { name: "Daniel Kahneman", aliases: ["Kahneman"], group: "Psychology" },
  { name: "Maslow", group: "Psychology" },
  { name: "FOMO", aliases: ["Fear of Missing Out"], group: "Psychology" },

  // Neuroscience
  { name: "Dopamine", group: "Neuroscience" },
  { name: "Default Mode Network", aliases: ["DMN"], group: "Neuroscience" },
  { name: "Predictive Brain", aliases: ["Predictive Coding", "Karl Friston"], group: "Neuroscience" },
  { name: "Reward System", aliases: ["hệ thống tưởng thưởng"], group: "Neuroscience" },
  { name: "Prediction Error", group: "Neuroscience" },
  { name: "Attention Mechanism", group: "Neuroscience" },

  // Sociology
  { name: "Consumerism", aliases: ["tiêu dùng chủ nghĩa"], group: "Sociology" },
  { name: "Social Comparison", aliases: ["so sánh xã hội"], group: "Sociology" },
  { name: "Status Competition", group: "Sociology" },
  { name: "Attention Economy", aliases: ["kinh tế chú ý"], group: "Sociology" },
  { name: "Hyperreality", aliases: ["Baudrillard"], group: "Sociology" },
  { name: "Performance Society", aliases: ["xã hội biểu diễn"], group: "Sociology" },
  { name: "Surveillance Capitalism", aliases: ["Zuboff"], group: "Sociology" },

  // AI / Tech
  { name: "Recommendation Algorithms", aliases: ["Recommendation System", "thuật toán đề xuất"], group: "AI" },
  { name: "Predictive AI", group: "AI" },
  { name: "AI Companion", group: "AI" },
  { name: "Digital Immortality", group: "AI" },
  { name: "LLM", aliases: ["Large Language Model"], group: "AI" },
  { name: "AGI", group: "AI" },
  { name: "AI Alignment", group: "AI" },
  { name: "Filter Bubble", aliases: ["echo chamber"], group: "AI" },

  // Classic books / works
  { name: "Being and Time", aliases: ["Sein und Zeit"], group: "Work" },
  { name: "The Myth of Sisyphus", aliases: ["Sisyphus"], group: "Work" },
  { name: "Meditations", aliases: ["Suy tưởng"], group: "Work" },
  { name: "Alone Together", aliases: ["Sherry Turkle"], group: "Work" },
  { name: "The Burnout Society", aliases: ["Burnout Society"], group: "Work" },
  { name: "Being-toward-death", aliases: ["Sein-zum-Tode"], group: "Work" },
];

export type KnowledgeEntry = {
  name: string;
  group: string;
  count: number;
  sessions: Array<{
    id: string;
    topic: string;
    createdAt: string;
  }>;
};

const extractFromSession = (session: {
  ideas: Array<{
    outline: string;
    observation: string;
    storyBank: string[];
    historicalExamples: string[];
    contrarianView: string;
    futureConnection: string;
  }>;
}): string => {
  const parts: string[] = [];
  for (const idea of session.ideas) {
    parts.push(idea.outline);
    parts.push(idea.observation);
    parts.push(idea.contrarianView);
    parts.push(idea.futureConnection);
    parts.push(...idea.storyBank);
    parts.push(...idea.historicalExamples);
  }
  return parts.join("\n").toLowerCase();
};

export async function buildKnowledgeGraph(): Promise<{
  groups: Record<string, KnowledgeEntry[]>;
  total: number;
}> {
  const sessions = await listSessions();
  const groups: Record<string, KnowledgeEntry[]> = {};

  for (const concept of CONCEPTS) {
    const needles = [concept.name, ...(concept.aliases ?? [])].map((s) =>
      s.toLowerCase(),
    );
    const matchedSessions: KnowledgeEntry["sessions"] = [];
    for (const session of sessions) {
      const haystack = extractFromSession(session);
      const hit = needles.some((n) => haystack.includes(n));
      if (hit) {
        matchedSessions.push({
          id: session.id,
          topic: session.topic,
          createdAt: session.createdAt,
        });
      }
    }
    if (matchedSessions.length === 0) continue;
    const entry: KnowledgeEntry = {
      name: concept.name,
      group: concept.group,
      count: matchedSessions.length,
      sessions: matchedSessions,
    };
    if (!groups[concept.group]) groups[concept.group] = [];
    groups[concept.group].push(entry);
  }

  // Sort entries trong mỗi group theo count desc
  for (const group of Object.keys(groups)) {
    groups[group].sort((a, b) => b.count - a.count);
  }

  const total = Object.values(groups).reduce(
    (sum, arr) => sum + arr.length,
    0,
  );

  return { groups, total };
}
