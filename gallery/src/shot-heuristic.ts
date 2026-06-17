/**
 * Shot heuristic — Documentary direction Phase 2.
 *
 * Rule-based classifier biến 1 câu narration → suggestion {role, assetType,
 * lowerThird?, prompt?} dùng làm fallback cho LLM hoặc bootstrap khi LLM
 * không cung cấp đủ field.
 *
 * Triết lý:
 * - LLM có CONTEXT toàn chương → judge "this is a payoff" tốt hơn keyword match.
 * - Heuristic có SURFACE match cao confidence → judge "this names Giotto, it's
 *   subject + archive" chắc chắn hơn LLM.
 * - Kết hợp: heuristic chạy SAU LLM, chỉ override khi tự tin (match keyword
 *   trong knowledge graph). Câu không match keyword nào → giữ nguyên LLM choice.
 *
 * Knowledge graph load từ `gallery/data/seasons/<series>.json` lúc gen.
 * Series unknown → trả empty graph, heuristic fall back về detail+archive.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import type {
  AssetType,
  ShotRole,
} from "./shot";

// ── Knowledge graph schema (per-series JSON) ──────────────────────────────

type LowerThird = { primary: string; secondary?: string };

type PersonEntry = {
  aliases: string[];
  era?: string;
  lowerThird?: LowerThird;
  aiHint?: string;
  wikimediaQuery?: string;
};

type PlaceEntry = {
  aliases: string[];
  stockQuery?: string;
  aiHint?: string;
  wikimediaQuery?: string;
  lowerThird?: LowerThird;
};

type WorkEntry = {
  aliases: string[];
  year?: string;
  location?: string;
  wikimediaQuery?: string;
  lowerThird?: LowerThird;
};

type ConceptEntry = {
  keywords: string[];
  recipe: string;
  label?: string;
};

export type KnowledgeGraph = {
  series: string;
  people: Record<string, PersonEntry>;
  places: Record<string, PlaceEntry>;
  works: Record<string, WorkEntry>;
  concepts: ConceptEntry[];
  quoteSignals: string[];
};

const EMPTY_GRAPH: KnowledgeGraph = {
  series: "",
  people: {},
  places: {},
  works: {},
  concepts: [],
  quoteSignals: [],
};

// ── Loader ───────────────────────────────────────────────────────────────

/**
 * Cache load knowledge graph per series. Đọc file 1 lần, giữ trong memory.
 * Series unknown → trả EMPTY_GRAPH (không throw — heuristic fallback graceful).
 */
const graphCache = new Map<string, KnowledgeGraph>();

const DATA_DIR = path.resolve("gallery/data/seasons");

export async function loadKnowledgeGraph(
  seriesSlug: string | null | undefined,
): Promise<KnowledgeGraph> {
  if (!seriesSlug) return EMPTY_GRAPH;
  const key = seriesSlug.toLowerCase();
  const cached = graphCache.get(key);
  if (cached) return cached;
  const filePath = path.join(DATA_DIR, `${key}.json`);
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    const parsed = JSON.parse(raw) as Partial<KnowledgeGraph>;
    const graph: KnowledgeGraph = {
      series: parsed.series ?? key,
      people: parsed.people ?? {},
      places: parsed.places ?? {},
      works: parsed.works ?? {},
      concepts: parsed.concepts ?? [],
      quoteSignals: parsed.quoteSignals ?? [],
    };
    graphCache.set(key, graph);
    return graph;
  } catch {
    // File không tồn tại / JSON lỗi → empty graph, không throw.
    graphCache.set(key, EMPTY_GRAPH);
    return EMPTY_GRAPH;
  }
}

/** Sync version cho contexts đã có graph object trong tay (tests, batch). */
export function classifyBeatSync(input: ClassifyInput): ClassifyResult {
  return runClassifier(input);
}

/** Async convenience: load graph + classify. */
export async function classifyBeat(input: {
  sentence: string;
  series: string | null | undefined;
}): Promise<ClassifyResult> {
  const graph = await loadKnowledgeGraph(input.series);
  return runClassifier({ sentence: input.sentence, graph });
}

// ── Classifier core ──────────────────────────────────────────────────────

export type ClassifyInput = {
  sentence: string;
  graph: KnowledgeGraph;
};

export type ClassifyResult = {
  role: ShotRole;
  assetType: AssetType;
  /** Khi match person/work/place có lowerThird, return luôn cho lower-third overlay. */
  lowerThird?: LowerThird;
  /** Wikimedia search query — khi assetType="archive". */
  archiveQuery?: string;
  /** Pexels search query — khi assetType="stock". */
  stockQuery?: string;
  /** Draw Things AI prompt — khi assetType="ai". */
  aiPrompt?: string;
  /** Motion graphic recipe name — khi assetType="motion". */
  motionRecipe?: string;
  /**
   * Độ tự tin (0..1). Cao = override LLM tự tin. Thấp = chỉ điền field LLM
   * bỏ trống, không override LLM's role.
   */
  confidence: number;
};

const normalize = (s: string): string =>
  s.toLowerCase().normalize("NFC").trim();

const containsAlias = (haystack: string, aliases: string[]): boolean =>
  aliases.some((a) => haystack.includes(normalize(a)));

const containsAnyKeyword = (haystack: string, keywords: string[]): boolean =>
  keywords.some((k) => haystack.includes(normalize(k)));

const ENGLISH_NUMBER_LIKE_YEAR = /\b(?:1[0-9]{3}|c\.?\s?1[0-9]{3})\b/i;
const VN_NUMBER_LIKE_YEAR = /\b(thế kỷ\s+\d{1,2}|năm\s+\d{3,4})\b/i;

function findWork(text: string, graph: KnowledgeGraph) {
  for (const [name, entry] of Object.entries(graph.works)) {
    if (containsAlias(text, entry.aliases)) return { name, entry };
  }
  return null;
}

function findPerson(text: string, graph: KnowledgeGraph) {
  for (const [name, entry] of Object.entries(graph.people)) {
    if (containsAlias(text, entry.aliases)) return { name, entry };
  }
  return null;
}

function findPlace(text: string, graph: KnowledgeGraph) {
  for (const [name, entry] of Object.entries(graph.places)) {
    if (containsAlias(text, entry.aliases)) return { name, entry };
  }
  return null;
}

function findConcept(text: string, graph: KnowledgeGraph) {
  for (const entry of graph.concepts) {
    if (containsAnyKeyword(text, entry.keywords)) return entry;
  }
  return null;
}

function isQuote(text: string, graph: KnowledgeGraph): boolean {
  if (containsAnyKeyword(text, graph.quoteSignals)) return true;
  // Quote heuristic: câu mở/kết bằng dấu ngoặc kép Việt/Anh
  return /["'“”‘’]/.test(text);
}

function runClassifier(input: ClassifyInput): ClassifyResult {
  const text = normalize(input.sentence);
  const { graph } = input;

  // Quote signal mạnh nhất → payoff + motion graphic.
  if (isQuote(text, graph)) {
    return {
      role: "payoff",
      assetType: "motion",
      motionRecipe: "Quote",
      confidence: 0.85,
    };
  }

  // Work-specific (Lamentation, Kiss of Judas, ...) — strongest match,
  // luôn archive vì tranh public-domain trên Wikimedia.
  const work = findWork(text, graph);
  if (work) {
    return {
      role: "subject",
      assetType: "archive",
      lowerThird: work.entry.lowerThird,
      archiveQuery: work.entry.wikimediaQuery ?? `${work.name} painting`,
      confidence: 0.95,
    };
  }

  // Person — tranh archive nếu có ảnh chân dung được vẽ; AI nếu nhân vật cổ
  // (vd Saint Francis, Dante) cần dramatize cảnh trong workshop.
  const person = findPerson(text, graph);
  if (person) {
    // Heuristic: nếu có wikimediaQuery → archive (có ảnh chân dung).
    // Không có → AI dựng (Phase 2 đơn giản hoá: luôn archive nếu có query,
    // còn lại ai. User edit qua UI nếu muốn ép kiểu khác.)
    if (person.entry.wikimediaQuery) {
      return {
        role: "subject",
        assetType: "archive",
        lowerThird: person.entry.lowerThird,
        archiveQuery: person.entry.wikimediaQuery,
        confidence: 0.9,
      };
    }
    if (person.entry.aiHint) {
      return {
        role: "subject",
        assetType: "ai",
        lowerThird: person.entry.lowerThird,
        aiPrompt: person.entry.aiHint,
        confidence: 0.85,
      };
    }
  }

  // Place → establishing. Prefer stock footage (cảnh thật ngày nay) nếu có,
  // fallback AI khi cần dựng cảnh cổ (vd Padua 1305).
  const place = findPlace(text, graph);
  if (place) {
    if (place.entry.stockQuery) {
      return {
        role: "establishing",
        assetType: "stock",
        lowerThird: place.entry.lowerThird,
        stockQuery: place.entry.stockQuery,
        confidence: 0.85,
      };
    }
    if (place.entry.aiHint) {
      return {
        role: "establishing",
        assetType: "ai",
        lowerThird: place.entry.lowerThird,
        aiPrompt: place.entry.aiHint,
        confidence: 0.8,
      };
    }
    if (place.entry.wikimediaQuery) {
      return {
        role: "establishing",
        assetType: "archive",
        lowerThird: place.entry.lowerThird,
        archiveQuery: place.entry.wikimediaQuery,
        confidence: 0.8,
      };
    }
  }

  // Concept → motion graphic (perspective, chiaroscuro, fresco technique, …).
  const concept = findConcept(text, graph);
  if (concept) {
    return {
      role: "concept",
      assetType: "motion",
      motionRecipe: concept.recipe,
      confidence: 0.8,
    };
  }

  // Niên đại → establishing archive (timeline graphic hoặc map archive).
  if (ENGLISH_NUMBER_LIKE_YEAR.test(text) || VN_NUMBER_LIKE_YEAR.test(text)) {
    return {
      role: "establishing",
      assetType: "motion",
      motionRecipe: "Timeline",
      confidence: 0.6,
    };
  }

  // Fallback: detail + archive (Wikimedia art history catch-all).
  return {
    role: "detail",
    assetType: "archive",
    archiveQuery: `${graph.series || "art history"} ${text.split(/\s+/).slice(0, 4).join(" ")}`,
    confidence: 0.3,
  };
}

// ── Test helper (export cho smoke tests) ─────────────────────────────────

/** Reset cache — dùng trong test khi cần reload graph từ disk. */
export function _clearGraphCache(): void {
  graphCache.clear();
}
