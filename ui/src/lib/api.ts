/**
 * Fetch wrapper cho Studio API.
 *
 * Vite dev server proxy /api → Hono :3001 (xem vite.config.ts), nên FE
 * gọi relative path. Sau khi build, FE host độc lập + Hono cần CORS đúng.
 */

export type ServerErrorEntry = {
  timestamp: string;
  source: "uncaught" | "rejection" | "api" | "manual";
  message: string;
  stack: string | null;
  context: { method?: string; path?: string } | null;
};

export type ServerHealth = {
  ok: true;
  uptime: number;
  startedAt: string;
  errorCount: number;
  errors: ServerErrorEntry[];
};

export type EpisodeStatus =
  | "no-audio"
  | "draft"
  | "rendering"
  | "rendered"
  | "outdated";

/** Workspace style — Phase 2 team split. */
export type Style = "podcast" | "gallery";

export type EpisodeConfig = {
  style: Style;
  title: string;
  hook: string | null;
  episodeNumber: number;
  moodOverride: string | null;
  bgm: string | null;
  bgmVolumeDb: number;
  showIntro: boolean;
  showOutro: boolean;
  sceneOverrides: unknown;
  essayId: string | null;
  coverImage: string | null;
  coverFit: "cover" | "contain";
  coverPosition: "top" | "center" | "bottom";
  publishStatus: "draft" | "ready" | "published";
  publishedAt: string | null;
  publishCaption: string | null;
  publishHashtags: string[];
};

export type EpisodeSummary = {
  name: string;
  audioPath: string | null;
  configPath: string;
  config: EpisodeConfig;
  status: EpisodeStatus;
  hasOutput: boolean;
  outputPath: string | null;
  thumbnailPath: string | null;
  lockedEpisodeHash: string | null;
  renderedAt: string | null;
  mtimeMs: number;
};

class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "ApiError";
  }
}

async function jsonFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
  if (!res.ok) {
    let msg = `${res.status} ${res.statusText}`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) msg = body.error;
    } catch {
      /* not json */
    }
    throw new ApiError(res.status, msg);
  }
  return (await res.json()) as T;
}

export type TranscriptSegment = {
  startMs: number;
  endMs: number;
  text: string;
};

export type TranscriptPayload = {
  source: "corrected" | "raw" | "none";
  segments: TranscriptSegment[];
  totalSegments: number;
};

export type ScenePlanItem = {
  index: number;
  startMs: number;
  endMs: number;
  mood: string;
  sceneType: string;
  text: string;
};

export type PlanPayload = {
  scenes: ScenePlanItem[];
  totalScenes: number;
  totalDurationMs: number;
};

export type EpisodeFileKind =
  | "audio-original"
  | "audio-normalized"
  | "video-full"
  | "video-preview"
  | "thumbnail"
  | "cover"
  | "lock"
  | "transcript-raw"
  | "transcript-corrected"
  | "plan";

export type EpisodeFile = {
  filename: string;
  url: string;
  size: number;
  mtime: string;
  kind: EpisodeFileKind;
};

export type EpisodeFiles = {
  input: EpisodeFile[];
  output: EpisodeFile[];
  tmp: EpisodeFile[];
};

export type ReferenceType =
  | "pdf"
  | "article"
  | "video"
  | "book"
  | "podcast"
  | "other";

export type Reference = {
  id: string;
  url: string;
  /** Link PDF direct (tách khỏi url trang). Optional. */
  pdfUrl: string | null;
  title: string;
  author: string | null;
  type: ReferenceType;
  source: string;
  tags: string[];
  notes: string;
  addedAt: string;
  lastAccessedAt: string | null;
  usedInEpisodes: string[];
};

export type ScrapeResult = {
  title: string;
  author: string | null;
  source: string;
  pdfUrl: string | null;
};

export type SuggestedRef = {
  title: string;
  author: string | null;
  type: ReferenceType;
  reason: string;
  searchHint: string;
  /** Research Priority Tier 1-5 (1=meta, 5=blog). */
  tier: 1 | 2 | 3 | 4 | 5;
  /** Lĩnh vực: Psychology / Neuroscience / Philosophy / Sociology / AI… */
  field: string;
};

export type BrainstormScores = {
  universal: number;
  emotional: number;
  philosophical: number;
  aiRelevance: number;
  originality: number;
};

export type BrainstormIdea = {
  title: string;
  hook: string;
  angle: string;
  why: string;
  /** Step A v2: quan sát đời thường — gốc của idea, KHÔNG phải hook. */
  observation: string;
  /** Step F v2: 5 chiều 1-10. */
  scores: BrainstormScores;
  /** Step I v2: lĩnh vực liên quan. [] cho legacy. */
  knowledgeMap: string[];
  /** Phase A mục 3: luận điểm phản biện. "" cho legacy. */
  contrarianView: string;
  /** Phase A mục 7: 3-5 alt hook ngắn cho thumbnail. [] cho legacy. */
  thumbnailHooks: string[];
  /** Phase A mục 9: AI/AGI projection ending. "" cho legacy. */
  futureConnection: string;
  /** Phase B mục 4: 3-5 nhân vật/sự kiện lịch sử + context 1 dòng. */
  historicalExamples: string[];
  /** Phase B mục 5: 3-4 câu chuyện cụ thể với prefix [Hiện đại]/[Lịch sử]/[Cá nhân]. */
  storyBank: string[];
  /** Dàn ý 12 mục theo Framework v1. "" cho legacy. */
  outline: string;
};

export type LLMProvider = "openai" | "ollama";

export type LLMModel = {
  id: string;
  label: string;
  sizeBytes: number | null;
};

export type LLMModels = {
  openai: LLMModel[];
  ollama: LLMModel[];
};

export type TopicCategory =
  | "Meaning"
  | "Psychology"
  | "Time"
  | "AI"
  | "Loss"
  | "Freedom"
  | "Self"
  | "Death"
  | "Memory"
  | "Connection"
  | "Power"
  | "Technology"
  | "Happiness"
  | "Solitude"
  | "Ethics"
  | "Future";

// Phase 3a: Gallery brainstorm schema — hoàn toàn khác podcast.
export type GalleryArchetype =
  | "monograph"
  | "masterpiece"
  | "movement"
  | "theme";

export type LicenseRisk = "safe" | "check" | "blocked";

export type ChapterKind = "narration" | "music";

export type StructureMode = "linear" | "doubled";

export type GalleryChapter = {
  kind: ChapterKind;
  title: string;
  minutes: number;
  keyWorks: string[];
  summary: string;
  musicCue?: string;
};

export type GalleryKeyWork = {
  title: string;
  year: string;
  location: string;
  medium: string;
  whyImportant: string;
};

export type GalleryAssetSources = {
  wikimedia: boolean;
  met: boolean;
  customMuseums: string[];
  estimatedImageCount: number;
  estimatedClipCount: number;
};

export type GalleryBrainstormIdea = {
  title: string;
  archetype: GalleryArchetype;
  hook: string;
  era: string;
  region: string;
  estimatedMinutes: number;
  structureMode: StructureMode;
  chapters: GalleryChapter[];
  keyWorks: GalleryKeyWork[];
  licenseRisk: LicenseRisk;
  licenseNote: string;
  assetSources: GalleryAssetSources;
  references: string[];
  scholarlyDebate: string;
  audience: string;
  uniqueAngle: string;
};

export type BrainstormSession = {
  id: string;
  topic: string;
  tone: string;
  /** Phase 3a: union — kiểu thực phụ thuộc style (podcast vs gallery). */
  ideas: BrainstormIdea[] | GalleryBrainstormIdea[];
  createdAt: string;
  pickedIdx: number | null;
  categories: TopicCategory[];
  provider?: LLMProvider;
  model?: string;
  /** Phase 2: workspace style — default "podcast" cho legacy. */
  style: Style;
};

/** Type guards để narrow union. */
export const isPodcastSession = (
  s: BrainstormSession,
): s is BrainstormSession & { ideas: BrainstormIdea[] } => s.style === "podcast";

export const isGallerySession = (
  s: BrainstormSession,
): s is BrainstormSession & { ideas: GalleryBrainstormIdea[] } =>
  s.style === "gallery";

export type EssayBrainstormRef = {
  id: string;
  ideaIdx: number;
};

export type ShortsScript = {
  duration: number;
  hook: string;
  body: string;
  cta: string;
};

export type EssayDerivatives = {
  shorts: ShortsScript[];
  fbPosts: string[];
  quotes: string[];
  blog: string | null;
  newsletter: string | null;
};

export type DerivativeType =
  | "shorts"
  | "fb-posts"
  | "quotes"
  | "blog"
  | "newsletter";

export type Essay = {
  id: string;
  title: string;
  outline: string | null;
  content: string;
  nlmPrompt: string | null;
  brainstormRef: EssayBrainstormRef | null;
  suggestedRefs: SuggestedRef[];
  derivatives: EssayDerivatives;
  provider: LLMProvider;
  model: string;
  createdAt: string;
  updatedAt: string;
  /** Phase 2: workspace style — default "podcast" cho legacy. */
  style: Style;
};

export type EssayStreamEvent =
  | { type: "start"; essay: Essay }
  | { type: "delta"; text: string }
  | { type: "done"; essay: Essay }
  | { type: "error"; error: string };

export type KnowledgeEntry = {
  name: string;
  group: string;
  count: number;
  sessions: Array<{ id: string; topic: string; createdAt: string }>;
};

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

export type SceneCatalogEntry = {
  key: string;
  label: string;
  description: string;
  stickers: string[];
  doodles: string[];
  keywords: string[];
  suggestedMoods: string[];
  category:
    | "default"
    | "broadcast"
    | "dialogue"
    | "reflection"
    | "calm"
    | "emotion"
    | "social"
    | "thought"
    | "wisdom"
    | "giving"
    | "transformation";
  usageCount: number;
  thumbUrl: string | null;
};

export type SceneCatalogResponse = {
  scenes: SceneCatalogEntry[];
  totalScenes: number;
  totalUsage: number;
  thumbsGenerated: number;
};

export type KnowledgeGraph = {
  groups: Record<string, KnowledgeEntry[]>;
  total: number;
};

export type WorkflowChain = {
  id: string;
  source: "brainstorm" | "essay" | "episode";
  topic: string;
  brainstorm: {
    id: string;
    topic: string;
    pickedIdx: number | null;
    ideaCount: number;
    tone: string;
    createdAt: string;
    categories: string[];
    topScore: number | null;
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
    status: EpisodeStatus;
  } | null;
  refsCount: number;
  updatedAt: string;
};

export type RenderPhase =
  | "queued"
  | "process-audio"
  | "transcribe"
  | "spell-fix"
  | "plan-episode"
  | "bundle"
  | "render"
  | "thumbnail"
  | "lock"
  | "done"
  | "error"
  | "cancelled";

export type JobType = "transcribe" | "plan" | "render";

export type RenderJob = {
  id: string;
  episodeName: string;
  jobType: JobType;
  preview: boolean;
  status: RenderPhase;
  percent: number;
  message: string;
  startedAt: number;
  finishedAt: number | null;
  outputPath: string | null;
  error: string | null;
  regenTranscribe: boolean;
  regenPlan: boolean;
};

export type RenderProgressEvent = RenderJob & {
  jobId: string;
  elapsedMs: number;
};

// ─── Phase 26 — Research / Gallery assets ───────────────────────────────
export type AssetKind = "image" | "video" | "audio";
export type LicenseStatus = "safe" | "check" | "blocked";

export type AssetResult = {
  id: string;
  provider: string;
  kind: AssetKind;
  title: string;
  author?: string;
  year?: string;
  thumbUrl: string;
  fullUrl: string;
  sourcePage: string;
  license: string;
  licenseStatus: LicenseStatus;
  width?: number;
  height?: number;
  durationMs?: number;
};

export type SavedAsset = AssetResult & {
  tags: string[];
  savedAt: string;
  pinned: boolean;
  usedInEpisodes: string[];
};

export type ProviderInfo = {
  id: string;
  label: string;
  kinds: AssetKind[];
  needsKey: boolean;
  enabled: boolean;
  note?: string;
};

// ─── Phase 3d — Gallery chapter plan ────────────────────────────────────
export type GalleryPlanChapter = GalleryChapter & {
  transcript: string;
  status: "pending" | "draft" | "approved";
};

export type GalleryChapterPlan = {
  id: string;
  brainstormId: string;
  ideaIdx: number;
  ideaSnapshot: GalleryBrainstormIdea;
  chapters: GalleryPlanChapter[];
  provider: LLMProvider | null;
  model: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ResearchSearchResponse = {
  results: AssetResult[];
  total: number;
  perProvider: Record<string, { count: number; error?: string }>;
  page: number;
  pageSize: number;
};

const styleQuery = (style?: Style): string =>
  style ? `?style=${style}` : "";

export const api = {
  listEpisodes: (style?: Style) =>
    jsonFetch<{ episodes: EpisodeSummary[] }>(
      `/api/episodes${styleQuery(style)}`,
    ),

  getEpisode: (name: string) =>
    jsonFetch<EpisodeSummary>(`/api/episodes/${encodeURIComponent(name)}`),

  getTranscript: (name: string) =>
    jsonFetch<TranscriptPayload>(
      `/api/episodes/${encodeURIComponent(name)}/transcript`,
    ),

  saveTranscript: (name: string, segments: TranscriptSegment[]) =>
    jsonFetch<TranscriptPayload>(
      `/api/episodes/${encodeURIComponent(name)}/transcript`,
      { method: "PUT", body: JSON.stringify({ segments }) },
    ),

  getPlan: (name: string) =>
    jsonFetch<PlanPayload>(`/api/episodes/${encodeURIComponent(name)}/plan`),

  getFiles: (name: string) =>
    jsonFetch<EpisodeFiles>(
      `/api/episodes/${encodeURIComponent(name)}/files`,
    ),

  deleteFile: (
    name: string,
    bucket: "input" | "output" | "tmp",
    filename: string,
  ) =>
    jsonFetch<EpisodeFiles>(
      `/api/episodes/${encodeURIComponent(name)}/files`,
      {
        method: "DELETE",
        body: JSON.stringify({ bucket, filename }),
      },
    ),

  savePlan: (name: string, scenes: ScenePlanItem[]) =>
    jsonFetch<PlanPayload>(`/api/episodes/${encodeURIComponent(name)}/plan`, {
      method: "PUT",
      body: JSON.stringify({ scenes }),
    }),

  listSceneThumbnails: (name: string) =>
    jsonFetch<{ urls: string[] }>(
      `/api/episodes/${encodeURIComponent(name)}/scene-thumbnails`,
    ),

  genSceneThumbnails: (name: string) =>
    jsonFetch<{ urls: string[] }>(
      `/api/episodes/${encodeURIComponent(name)}/scene-thumbnails`,
      { method: "POST" },
    ),

  getPlanOptions: () =>
    jsonFetch<{ moods: string[]; sceneTypes: string[] }>(
      "/api/episodes/_/plan-options",
    ),

  saveEpisodeConfig: (name: string, config: EpisodeConfig) =>
    jsonFetch<EpisodeSummary>(
      `/api/episodes/${encodeURIComponent(name)}/config`,
      { method: "PUT", body: JSON.stringify(config) },
    ),

  listReferences: (filters: {
    tag?: string;
    episode?: string;
    q?: string;
    type?: string;
  } = {}) => {
    const params = new URLSearchParams();
    if (filters.tag) params.set("tag", filters.tag);
    if (filters.episode) params.set("episode", filters.episode);
    if (filters.q) params.set("q", filters.q);
    if (filters.type) params.set("type", filters.type);
    const qs = params.toString();
    return jsonFetch<{ items: Reference[] }>(
      `/api/references${qs ? `?${qs}` : ""}`,
    );
  },

  listTags: () =>
    jsonFetch<{ tags: Array<{ tag: string; count: number }> }>(
      "/api/references/_/tags",
    ),

  scrapeReference: (url: string) =>
    jsonFetch<ScrapeResult>("/api/references/_/scrape", {
      method: "POST",
      body: JSON.stringify({ url }),
    }),

  suggestRefs: (input: {
    title: string;
    essayContent: string;
    provider: LLMProvider;
    model: string;
    /** Nếu có, server persist suggestions vào essay row. */
    essayId?: string;
  }) =>
    jsonFetch<{ suggestions: SuggestedRef[] }>("/api/references/_/suggest", {
      method: "POST",
      body: JSON.stringify(input),
    }),

  addReference: (
    input: Pick<Reference, "url" | "title"> & Partial<Reference>,
  ) =>
    jsonFetch<Reference>("/api/references", {
      method: "POST",
      body: JSON.stringify(input),
    }),

  updateReference: (id: string, patch: Partial<Reference>) =>
    jsonFetch<Reference>(`/api/references/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: JSON.stringify(patch),
    }),

  deleteReference: (id: string) =>
    jsonFetch<{ deleted: boolean }>(
      `/api/references/${encodeURIComponent(id)}`,
      { method: "DELETE" },
    ),

  linkReference: (id: string, episodeName: string) =>
    jsonFetch<Reference>(
      `/api/references/${encodeURIComponent(id)}/link`,
      { method: "POST", body: JSON.stringify({ episodeName }) },
    ),

  unlinkReference: (id: string, episodeName: string) =>
    jsonFetch<Reference>(
      `/api/references/${encodeURIComponent(id)}/unlink`,
      { method: "POST", body: JSON.stringify({ episodeName }) },
    ),

  listBrainstorm: (style?: Style) =>
    jsonFetch<{ sessions: BrainstormSession[] }>(
      `/api/brainstorm${styleQuery(style)}`,
    ),

  getBrainstorm: (id: string) =>
    jsonFetch<BrainstormSession>(
      `/api/brainstorm/${encodeURIComponent(id)}`,
    ),

  createBrainstorm: (input: {
    topic: string;
    tone: string;
    count?: number;
    provider?: LLMProvider;
    model?: string;
    style?: Style;
  }) =>
    jsonFetch<BrainstormSession>("/api/brainstorm", {
      method: "POST",
      body: JSON.stringify(input),
    }),

  listLLMModels: () => jsonFetch<LLMModels>("/api/llm/models"),

  genSocialCaption: (input: {
    title: string;
    hook?: string | null;
    essayContent?: string;
    provider: LLMProvider;
    model: string;
  }) =>
    jsonFetch<{ caption: string; hashtags: string[] }>(
      "/api/llm/social-caption",
      { method: "POST", body: JSON.stringify(input) },
    ),

  getHealth: () => jsonFetch<ServerHealth>("/api/health"),

  clearServerErrors: () =>
    jsonFetch<{ ok: boolean }>("/api/health/errors", { method: "DELETE" }),

  listWorkflow: (style?: Style) =>
    jsonFetch<{ chains: WorkflowChain[] }>(`/api/workflow${styleQuery(style)}`),

  getKnowledgeGraph: () => jsonFetch<KnowledgeGraph>("/api/knowledge"),

  getVisualLibrary: () => jsonFetch<VisualLibrary>("/api/visual"),

  getSceneCatalog: () =>
    jsonFetch<SceneCatalogResponse>("/api/scenes/catalog"),

  regenerateSceneThumbs: () =>
    jsonFetch<{ generated: string[] }>(
      "/api/scenes/catalog/thumbs/regenerate",
      { method: "POST" },
    ),

  listEssays: (style?: Style) =>
    jsonFetch<{ essays: Essay[] }>(`/api/essay${styleQuery(style)}`),
  getEssay: (id: string) =>
    jsonFetch<Essay>(`/api/essay/${encodeURIComponent(id)}`),
  saveEssay: (
    id: string,
    patch: {
      title?: string;
      content?: string;
      outline?: string | null;
      nlmPrompt?: string | null;
    },
  ) =>
    jsonFetch<Essay>(`/api/essay/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: JSON.stringify(patch),
    }),

  genNlmPrompt: (
    id: string,
    input: { provider: LLMProvider; model: string },
  ) =>
    jsonFetch<Essay>(`/api/essay/${encodeURIComponent(id)}/nlm-prompt`, {
      method: "POST",
      body: JSON.stringify(input),
    }),

  genDerivative: (
    id: string,
    type: DerivativeType,
    input: { provider: LLMProvider; model: string },
  ) =>
    jsonFetch<Essay>(
      `/api/essay/${encodeURIComponent(id)}/derivatives/${type}`,
      { method: "POST", body: JSON.stringify(input) },
    ),
  deleteEssay: (id: string) =>
    jsonFetch<{ deleted: boolean }>(
      `/api/essay/${encodeURIComponent(id)}`,
      { method: "DELETE" },
    ),

  /**
   * Stream essay generation. Caller cung cấp `onEvent` để xử lý từng event SSE.
   * Trả về abort function để hủy nửa chừng.
   */
  streamEssay: (
    input: {
      title: string;
      outline?: string;
      brainstormRef?: EssayBrainstormRef;
      provider: LLMProvider;
      model: string;
      style?: Style;
    },
    onEvent: (ev: EssayStreamEvent) => void,
  ): (() => void) => {
    const ctl = new AbortController();
    (async () => {
      try {
        const res = await fetch("/api/essay/stream", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
          signal: ctl.signal,
        });
        if (!res.ok || !res.body) {
          const errMsg = await res.text().catch(() => res.statusText);
          onEvent({ type: "error", error: errMsg });
          return;
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          // SSE event boundary là \n\n
          const events = buffer.split("\n\n");
          buffer = events.pop() ?? "";
          for (const evRaw of events) {
            // Parse "data: …" lines
            const dataLine = evRaw
              .split("\n")
              .find((l) => l.startsWith("data:"));
            if (!dataLine) continue;
            const payload = dataLine.slice(5).trim();
            if (!payload) continue;
            try {
              onEvent(JSON.parse(payload) as EssayStreamEvent);
            } catch {
              /* không parse được — bỏ qua */
            }
          }
        }
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        onEvent({ type: "error", error: String(e) });
      }
    })();
    return () => ctl.abort();
  },

  pickBrainstormIdea: (id: string, pickedIdx: number | null) =>
    jsonFetch<BrainstormSession>(
      `/api/brainstorm/${encodeURIComponent(id)}/pick`,
      { method: "PUT", body: JSON.stringify({ pickedIdx }) },
    ),

  deleteBrainstorm: (id: string) =>
    jsonFetch<{ deleted: boolean }>(
      `/api/brainstorm/${encodeURIComponent(id)}`,
      { method: "DELETE" },
    ),

  startRender: (
    episodeName: string,
    preview: boolean,
    opts: { regenTranscribe?: boolean; regenPlan?: boolean } = {},
  ) =>
    jsonFetch<RenderJob>("/api/render", {
      method: "POST",
      body: JSON.stringify({
        episodeName,
        preview,
        regenTranscribe: opts.regenTranscribe,
        regenPlan: opts.regenPlan,
      }),
    }),

  startTranscribe: (episodeName: string) =>
    jsonFetch<RenderJob>("/api/render/transcribe", {
      method: "POST",
      body: JSON.stringify({ episodeName }),
    }),

  startPlan: (episodeName: string) =>
    jsonFetch<RenderJob>("/api/render/plan", {
      method: "POST",
      body: JSON.stringify({ episodeName }),
    }),

  cancelJob: (jobId: string) =>
    jsonFetch<{ cancelled: boolean }>(
      `/api/render/jobs/${encodeURIComponent(jobId)}/cancel`,
      { method: "POST" },
    ),

  listRenderJobs: () =>
    jsonFetch<{ jobs: RenderJob[] }>("/api/render/jobs"),

  resetRenderQueue: () =>
    jsonFetch<{ cancelledJobs: number }>("/api/render/jobs/_reset", {
      method: "POST",
    }),

  uploadAudio: async (
    file: File,
    options: { essayId?: string; cover?: File; style?: Style } = {},
  ): Promise<EpisodeSummary> => {
    const form = new FormData();
    form.append("audio", file);
    if (options.essayId) form.append("essayId", options.essayId);
    if (options.cover) form.append("cover", options.cover);
    if (options.style) form.append("style", options.style);
    const res = await fetch("/api/episodes/upload", {
      method: "POST",
      body: form,
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
      };
      throw new ApiError(res.status, body.error ?? res.statusText);
    }
    return (await res.json()) as EpisodeSummary;
  },

  uploadCover: async (
    episodeName: string,
    file: File,
  ): Promise<EpisodeSummary> => {
    const form = new FormData();
    form.append("cover", file);
    const res = await fetch(
      `/api/episodes/${encodeURIComponent(episodeName)}/cover`,
      { method: "POST", body: form },
    );
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      throw new ApiError(res.status, body.error ?? res.statusText);
    }
    return (await res.json()) as EpisodeSummary;
  },

  deleteCover: (episodeName: string) =>
    jsonFetch<EpisodeSummary>(
      `/api/episodes/${encodeURIComponent(episodeName)}/cover`,
      { method: "DELETE" },
    ),

  // ─── Phase 26 — Research / Gallery assets ─────────────────────────────
  listResearchProviders: () =>
    jsonFetch<{ providers: ProviderInfo[] }>("/api/research/providers"),

  searchResearch: (input: {
    q: string;
    kind: AssetKind;
    providers?: string[];
    page?: number;
    pageSize?: number;
  }) => {
    const params = new URLSearchParams();
    params.set("q", input.q);
    params.set("kind", input.kind);
    if (input.providers && input.providers.length > 0)
      params.set("providers", input.providers.join(","));
    if (input.page) params.set("page", String(input.page));
    if (input.pageSize) params.set("pageSize", String(input.pageSize));
    return jsonFetch<ResearchSearchResponse>(
      `/api/research/search?${params.toString()}`,
    );
  },

  saveResearchAsset: (asset: AssetResult, tags: string[] = []) =>
    jsonFetch<SavedAsset>("/api/research/save", {
      method: "POST",
      body: JSON.stringify({ asset, tags }),
    }),

  listResearchLibrary: (filters: {
    q?: string;
    kind?: AssetKind;
    provider?: string;
    licenseStatus?: LicenseStatus;
    tag?: string;
    pinned?: boolean;
  } = {}) => {
    const params = new URLSearchParams();
    if (filters.q) params.set("q", filters.q);
    if (filters.kind) params.set("kind", filters.kind);
    if (filters.provider) params.set("provider", filters.provider);
    if (filters.licenseStatus) params.set("licenseStatus", filters.licenseStatus);
    if (filters.tag) params.set("tag", filters.tag);
    if (filters.pinned !== undefined)
      params.set("pinned", filters.pinned ? "true" : "false");
    const qs = params.toString();
    return jsonFetch<{ assets: SavedAsset[] }>(
      `/api/research/library${qs ? `?${qs}` : ""}`,
    );
  },

  deleteResearchAsset: (id: string) =>
    jsonFetch<{ deleted: boolean }>(
      `/api/research/library/${encodeURIComponent(id)}`,
      { method: "DELETE" },
    ),

  toggleResearchAssetPin: (id: string) =>
    jsonFetch<SavedAsset>(
      `/api/research/library/${encodeURIComponent(id)}/pin`,
      { method: "PUT" },
    ),

  updateResearchAssetTags: (id: string, tags: string[]) =>
    jsonFetch<SavedAsset>(
      `/api/research/library/${encodeURIComponent(id)}/tags`,
      { method: "PUT", body: JSON.stringify({ tags }) },
    ),

  // ─── Phase 3d — Gallery chapter plans ────────────────────────────────
  listGalleryPlans: (brainstormId?: string) => {
    const qs = brainstormId
      ? `?brainstormId=${encodeURIComponent(brainstormId)}`
      : "";
    return jsonFetch<{ plans: GalleryChapterPlan[] }>(
      `/api/gallery/plans${qs}`,
    );
  },

  getGalleryPlan: (id: string) =>
    jsonFetch<GalleryChapterPlan>(
      `/api/gallery/plans/${encodeURIComponent(id)}`,
    ),

  lookupGalleryPlan: (brainstormId: string, ideaIdx: number) =>
    jsonFetch<{ plan: GalleryChapterPlan | null }>(
      `/api/gallery/plans/_/lookup?brainstormId=${encodeURIComponent(
        brainstormId,
      )}&ideaIdx=${ideaIdx}`,
    ),

  createGalleryPlan: (brainstormId: string, ideaIdx: number) =>
    jsonFetch<GalleryChapterPlan>("/api/gallery/plans", {
      method: "POST",
      body: JSON.stringify({ brainstormId, ideaIdx }),
    }),

  updateGalleryPlanChapter: (
    planId: string,
    chapterIdx: number,
    patch: { transcript?: string; status?: GalleryPlanChapter["status"] },
  ) =>
    jsonFetch<GalleryChapterPlan>(
      `/api/gallery/plans/${encodeURIComponent(planId)}/chapters/${chapterIdx}`,
      { method: "PUT", body: JSON.stringify(patch) },
    ),

  saveGalleryPlanChapters: (
    planId: string,
    chapters: GalleryPlanChapter[],
  ) =>
    jsonFetch<GalleryChapterPlan>(
      `/api/gallery/plans/${encodeURIComponent(planId)}/chapters`,
      { method: "PUT", body: JSON.stringify({ chapters }) },
    ),

  genGalleryPlanChapter: (
    planId: string,
    chapterIdx: number,
    input: { provider: LLMProvider; model: string },
  ) =>
    jsonFetch<GalleryChapterPlan>(
      `/api/gallery/plans/${encodeURIComponent(planId)}/chapters/${chapterIdx}/generate`,
      { method: "POST", body: JSON.stringify(input) },
    ),

  deleteGalleryPlan: (id: string) =>
    jsonFetch<{ deleted: boolean }>(
      `/api/gallery/plans/${encodeURIComponent(id)}`,
      { method: "DELETE" },
    ),
};

export { ApiError };
