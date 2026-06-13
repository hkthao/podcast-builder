/**
 * Workflow chain aggregator.
 *
 * Quan hệ artifact:
 *   Brainstorm (ideas) ← brainstormRef
 *   Essay ← essayId
 *   Episode (audio, render output)
 *   References (refs.usedInEpisodes)
 *
 * 1 "chain" = bộ artifact của cùng 1 topic. Anchor:
 *   - Nếu có brainstorm → id = brainstorm.id, theo brainstormRef link sang essay rồi episode
 *   - Nếu essay standalone (không brainstormRef) → id = essay.id, theo essayId
 *   - Nếu episode standalone (upload trực tiếp, không qua essay) → id = episode.name
 */
import { listSessions, type BrainstormSession } from "./brainstorm-store";
import { listEssays, type Essay } from "./essay-store";
import { listEpisodes, type EpisodeSummary } from "./episode-store";
import { listReferences } from "./reference-store";

export type WorkflowStepStatus =
  | "done"
  | "partial"
  | "todo";

export type WorkflowChain = {
  /** Stable id để dedup + navigate. brainstorm.id | essay.id | episode.name */
  id: string;
  source: "brainstorm" | "essay" | "episode";
  /** Topic hiển thị. Ưu tiên brainstorm.topic > essay.title > episode.config.title */
  topic: string;

  brainstorm: {
    id: string;
    topic: string;
    pickedIdx: number | null;
    ideaCount: number;
    tone: string;
    createdAt: string;
  } | null;

  essay: {
    id: string;
    title: string;
    wordCount: number;
    hasNlmPrompt: boolean;
    updatedAt: string;
  } | null;

  episode: {
    name: string;
    title: string;
    hasAudio: boolean;
    hasOutput: boolean;
    status: EpisodeSummary["status"];
  } | null;

  /** Số references đã link tới episode (nếu có episode) */
  refsCount: number;

  /** Mtime gần nhất giữa các artifact để sort */
  updatedAt: string;
};

const countWords = (text: string): number => {
  const t = text.trim();
  if (!t) return 0;
  return t.split(/\s+/).length;
};

const maxIso = (...isos: Array<string | null | undefined>): string => {
  const valid = isos.filter((s): s is string => !!s);
  if (valid.length === 0) return new Date(0).toISOString();
  return valid.sort().pop()!;
};

export async function buildWorkflowChains(): Promise<WorkflowChain[]> {
  const [brainstorms, essays, episodes, refs] = await Promise.all([
    listSessions(),
    listEssays(),
    listEpisodes(),
    listReferences({}),
  ]);

  const refsByEpisode = new Map<string, number>();
  for (const r of refs) {
    for (const ep of r.usedInEpisodes) {
      refsByEpisode.set(ep, (refsByEpisode.get(ep) ?? 0) + 1);
    }
  }

  // Index để lookup nhanh
  const essayByBrainstormId = new Map<string, Essay>();
  const standaloneEssays: Essay[] = [];
  for (const e of essays) {
    if (e.brainstormRef) {
      // Nếu cùng brainstorm có nhiều essay (regen), giữ essay mới nhất
      const existing = essayByBrainstormId.get(e.brainstormRef.id);
      if (!existing || existing.updatedAt < e.updatedAt) {
        essayByBrainstormId.set(e.brainstormRef.id, e);
      }
    } else {
      standaloneEssays.push(e);
    }
  }

  const episodeByEssayId = new Map<string, EpisodeSummary>();
  const standaloneEpisodes: EpisodeSummary[] = [];
  for (const ep of episodes) {
    if (ep.config.essayId) {
      const existing = episodeByEssayId.get(ep.config.essayId);
      if (!existing || existing.mtimeMs < ep.mtimeMs) {
        episodeByEssayId.set(ep.config.essayId, ep);
      }
    } else {
      standaloneEpisodes.push(ep);
    }
  }

  const chains: WorkflowChain[] = [];

  // Chain bắt đầu từ brainstorm
  for (const bs of brainstorms) {
    const essay = essayByBrainstormId.get(bs.id) ?? null;
    const episode = essay ? (episodeByEssayId.get(essay.id) ?? null) : null;
    chains.push(buildChain("brainstorm", bs, essay, episode, refsByEpisode));
  }

  // Chain essay standalone (không có brainstorm parent)
  for (const essay of standaloneEssays) {
    const episode = episodeByEssayId.get(essay.id) ?? null;
    chains.push(buildChain("essay", null, essay, episode, refsByEpisode));
  }

  // Chain episode standalone (upload trực tiếp, không qua essay)
  for (const ep of standaloneEpisodes) {
    chains.push(buildChain("episode", null, null, ep, refsByEpisode));
  }

  // Sort by updatedAt desc
  chains.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return chains;
}

function buildChain(
  source: WorkflowChain["source"],
  bs: BrainstormSession | null,
  essay: Essay | null,
  episode: EpisodeSummary | null,
  refsByEpisode: Map<string, number>,
): WorkflowChain {
  const id =
    source === "brainstorm" && bs
      ? bs.id
      : source === "essay" && essay
        ? essay.id
        : source === "episode" && episode
          ? episode.name
          : "_unknown";
  const topic = bs?.topic ?? essay?.title ?? episode?.config.title ?? "(untitled)";
  const updatedAt = maxIso(
    bs?.createdAt,
    essay?.updatedAt,
    episode ? new Date(episode.mtimeMs).toISOString() : null,
  );
  return {
    id,
    source,
    topic,
    brainstorm: bs
      ? {
          id: bs.id,
          topic: bs.topic,
          pickedIdx: bs.pickedIdx,
          ideaCount: bs.ideas.length,
          tone: bs.tone,
          createdAt: bs.createdAt,
        }
      : null,
    essay: essay
      ? {
          id: essay.id,
          title: essay.title,
          wordCount: countWords(essay.content),
          hasNlmPrompt: !!essay.nlmPrompt && essay.nlmPrompt.trim().length > 0,
          updatedAt: essay.updatedAt,
        }
      : null,
    episode: episode
      ? {
          name: episode.name,
          title: episode.config.title,
          hasAudio: !!episode.audioPath,
          hasOutput: episode.hasOutput,
          status: episode.status,
        }
      : null,
    refsCount: episode ? (refsByEpisode.get(episode.name) ?? 0) : 0,
    updatedAt,
  };
}
