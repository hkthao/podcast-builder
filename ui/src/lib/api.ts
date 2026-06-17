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
  /**
   * Server-supplied error code (e.g. "TTS_BLOCKED", "MISSING_CACHE",
   * "VALIDATION"). Empty if server didn't return one. UI dùng để phân biệt
   * loại lỗi → skip + continue vs abort.
   */
  code: string;
  /** Server-supplied details (vd `blockReason`, `missing[]`). Untyped. */
  details: Record<string, unknown>;
  constructor(
    public status: number,
    message: string,
    extra?: { code?: string; details?: Record<string, unknown> },
  ) {
    super(message);
    this.name = "ApiError";
    this.code = extra?.code ?? "";
    this.details = extra?.details ?? {};
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
    let code: string | undefined;
    let details: Record<string, unknown> = {};
    try {
      const body = (await res.json()) as Record<string, unknown>;
      if (typeof body.error === "string") msg = body.error;
      if (typeof body.code === "string") code = body.code;
      details = body;
    } catch {
      /* not json */
    }
    throw new ApiError(res.status, msg, { code, details });
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

// ────── Podcast script (dialogue 2 voice) ──────
export type PodcastSpeaker = "host_nam" | "host_nu";

export type PodcastScriptTurn = {
  speaker: PodcastSpeaker;
  text: string;
};

export type PodcastScriptSource = {
  essayId: string | null;
  brainstormRef: { id: string; ideaIdx: number } | null;
  extraNotes: string;
};

export type PodcastScript = {
  episodeName: string;
  turns: PodcastScriptTurn[];
  source: PodcastScriptSource;
  provider: LLMProvider | null;
  model: string | null;
  generatedAt: string | null;
  updatedAt: string;
};

// Voice catalog — re-export gọn lại cho UI dropdown
export type VoiceGender = "male" | "female" | "neutral";
export type VoiceSuggestedRole = "host_nam" | "host_nu" | "narrator" | "any";
export type VoiceInfo = {
  id: string;
  provider: "gemini" | "openai";
  displayName: string;
  gender: VoiceGender;
  character: string;
  suggestedRole: VoiceSuggestedRole;
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

// ─── Phase 3d / 4a — Gallery chapter plan ──────────────────────────────
export type KenBurnsMode =
  | "zoom-in"
  | "zoom-out"
  | "pan-left"
  | "pan-right"
  | "pan-up"
  | "pan-down"
  | "static";

export type Shot = {
  sentenceIdx: number;
  keyword: string;
  assetIdRef: string | null;
  kenBurns: KenBurnsMode;
  durationMs: number | null;
  note: string;
};

export type WordTimestamp = {
  word: string;
  startMs: number;
  endMs: number;
};

export type StoryboardChapter = GalleryChapter & {
  transcript: string;
  /** Phase 4a: visual beats sidecar — anchored bằng sentenceIdx. */
  shots: Shot[];
  status: "pending" | "draft" | "approved";
  /** Phase 4b: TTS audio filename (trong /tmp/) + duration + word timestamps. */
  audioFilename: string | null;
  audioDurationMs: number | null;
  wordTimestamps: WordTimestamp[];
  /** Phase 4d: video MP4 filename (trong /tmp/) sau khi render qua Remotion. */
  videoFilename: string | null;
  videoDurationMs: number | null;
  renderedAt: string | null;
};

export type Storyboard = {
  id: string;
  brainstormId: string;
  ideaIdx: number;
  ideaSnapshot: GalleryBrainstormIdea;
  chapters: StoryboardChapter[];
  provider: LLMProvider | null;
  model: string | null;
  createdAt: string;
  updatedAt: string;
  /** Phase 4e: final video MP4 sau khi concat tất cả chapters. */
  outputFilename: string | null;
  outputDurationMs: number | null;
  exportedAt: string | null;
  /** Phase 4e.x: BGM file của plan. Auto-mix với voice cho narration, BGM segment cho music. */
  bgmFilename: string | null;
};

// ─── Documentary direction resolver types (Phase 4) ─────────────────────

export type ResolvedAssetSource =
  | "wikimedia"
  | "pexels"
  | "drawthings"
  | "motion";

export type ResolvedAssetClient = {
  beatIdx: number;
  localPath: string;
  remoteUrl?: string;
  isVideo: boolean;
  source: ResolvedAssetSource;
  title?: string;
  author?: string;
  year?: string;
  license: string;
  sourceUrl?: string;
};

export type PendingBeatClient = {
  beatIdx: number;
  hash: string;
  promptPath: string;
  prompt: string;
  expectedFilename: string;
};

export type FailedBeatClient = {
  beatIdx: number;
  reason: string;
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

  getBrainstormPrompts: () =>
    jsonFetch<{
      podcast: { brainstorm: string; expand: string };
      gallery: string;
    }>("/api/brainstorm/_/prompts"),


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
    /**
     * Khi true, topic = danh sách ý có sẵn của user. LLM expand mỗi ý
     * theo schema 13 field thay vì brainstorm idea mới. Bỏ qua field count.
     */
    expandUserIdeas?: boolean;
    /** Override system prompt — empty = dùng default. */
    systemPromptOverride?: string;
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

  deleteBrainstormIdea: (id: string, ideaIdx: number) =>
    jsonFetch<BrainstormSession>(
      `/api/brainstorm/${encodeURIComponent(id)}/ideas/${ideaIdx}`,
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

  createEpisode: (input: {
    title: string;
    hook?: string | null;
    essayId?: string | null;
    style?: Style;
  }) =>
    jsonFetch<EpisodeSummary>("/api/episodes", {
      method: "POST",
      body: JSON.stringify(input),
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

  uploadEpisodeBgm: async (
    episodeName: string,
    file: File,
  ): Promise<EpisodeSummary> => {
    const form = new FormData();
    form.append("bgm", file);
    const res = await fetch(
      `/api/episodes/${encodeURIComponent(episodeName)}/bgm`,
      { method: "POST", body: form },
    );
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      throw new ApiError(res.status, body.error ?? res.statusText);
    }
    return (await res.json()) as EpisodeSummary;
  },

  deleteEpisodeBgm: (episodeName: string) =>
    jsonFetch<EpisodeSummary>(
      `/api/episodes/${encodeURIComponent(episodeName)}/bgm`,
      { method: "DELETE" },
    ),

  genEpisodeCoverPrompt: (
    episodeName: string,
    input: { provider: LLMProvider; model: string },
  ) =>
    jsonFetch<{ prompt: string }>(
      `/api/episodes/${encodeURIComponent(episodeName)}/cover-prompt`,
      { method: "POST", body: JSON.stringify(input) },
    ),

  uploadEpisodeAudio: async (
    episodeName: string,
    file: File,
  ): Promise<EpisodeSummary> => {
    const form = new FormData();
    form.append("audio", file);
    const res = await fetch(
      `/api/episodes/${encodeURIComponent(episodeName)}/audio`,
      { method: "POST", body: form },
    );
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
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

  getResearchAsset: (id: string) =>
    jsonFetch<SavedAsset>(
      `/api/research/library/${encodeURIComponent(id)}`,
    ),

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
  listStoryboards: (brainstormId?: string) => {
    const qs = brainstormId
      ? `?brainstormId=${encodeURIComponent(brainstormId)}`
      : "";
    return jsonFetch<{ plans: Storyboard[] }>(
      `/api/gallery/storyboards${qs}`,
    );
  },

  getStoryboard: (id: string) =>
    jsonFetch<Storyboard>(
      `/api/gallery/storyboards/${encodeURIComponent(id)}`,
    ),

  lookupStoryboard: (brainstormId: string, ideaIdx: number) =>
    jsonFetch<{ plan: Storyboard | null }>(
      `/api/gallery/storyboards/_/lookup?brainstormId=${encodeURIComponent(
        brainstormId,
      )}&ideaIdx=${ideaIdx}`,
    ),

  createStoryboard: (brainstormId: string, ideaIdx: number) =>
    jsonFetch<Storyboard>("/api/gallery/storyboards", {
      method: "POST",
      body: JSON.stringify({ brainstormId, ideaIdx }),
    }),

  updateStoryboardChapter: (
    planId: string,
    chapterIdx: number,
    patch: {
      transcript?: string;
      status?: StoryboardChapter["status"];
      shots?: Shot[];
    },
  ) =>
    jsonFetch<Storyboard>(
      `/api/gallery/storyboards/${encodeURIComponent(planId)}/chapters/${chapterIdx}`,
      { method: "PUT", body: JSON.stringify(patch) },
    ),

  saveStoryboardChapters: (
    planId: string,
    chapters: StoryboardChapter[],
  ) =>
    jsonFetch<Storyboard>(
      `/api/gallery/storyboards/${encodeURIComponent(planId)}/chapters`,
      { method: "PUT", body: JSON.stringify({ chapters }) },
    ),

  genStoryboardChapter: (
    planId: string,
    chapterIdx: number,
    input: { provider: LLMProvider; model: string },
  ) =>
    jsonFetch<Storyboard>(
      `/api/gallery/storyboards/${encodeURIComponent(planId)}/chapters/${chapterIdx}/generate`,
      { method: "POST", body: JSON.stringify(input) },
    ),

  genStoryboardChapterAudio: (
    planId: string,
    chapterIdx: number,
    input: {
      ttsProvider?: "openai" | "gemini";
      voice?: string;
      ttsModel?: string;
      force?: boolean;
      // Gemini Cloud TTS extras
      speakingRate?: number;
      pitch?: number;
      languageCode?: string;
      styleInstruction?: string;
    } = {},
  ) =>
    jsonFetch<Storyboard>(
      `/api/gallery/storyboards/${encodeURIComponent(planId)}/chapters/${chapterIdx}/audio`,
      { method: "POST", body: JSON.stringify(input) },
    ),

  /** Phase 4e.x: upload BGM file (mp3/m4a/wav/aac). */
  uploadGalleryPlanBgm: async (
    planId: string,
    file: File,
  ): Promise<Storyboard> => {
    const form = new FormData();
    form.append("bgm", file);
    const res = await fetch(
      `/api/gallery/storyboards/${encodeURIComponent(planId)}/bgm`,
      { method: "POST", body: form },
    );
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      throw new ApiError(res.status, body.error ?? res.statusText);
    }
    return (await res.json()) as Storyboard;
  },

  deleteStoryboardBgm: (planId: string) =>
    jsonFetch<Storyboard>(
      `/api/gallery/storyboards/${encodeURIComponent(planId)}/bgm`,
      { method: "DELETE" },
    ),

  /** Phase 4e: concat tất cả chapter MP4 + inject FFMETADATA chapter markers. */
  exportStoryboard: (planId: string) =>
    jsonFetch<{
      plan: Storyboard;
      outputPath: string;
      outputDurationMs: number;
      chaptersTxtPath: string;
    }>(
      `/api/gallery/storyboards/${encodeURIComponent(planId)}/export`,
      { method: "POST" },
    ),

  /** Phase 4d: render chapter qua Remotion. Sync, ~60-90s. */
  renderStoryboardChapter: (planId: string, chapterIdx: number) =>
    jsonFetch<{
      plan: Storyboard;
      outputPath: string;
      durationMs: number;
    }>(
      `/api/gallery/storyboards/${encodeURIComponent(planId)}/chapters/${chapterIdx}/render`,
      { method: "POST" },
    ),

  /**
   * Documentary Phase 4: resolve assets multi-backend cho 1 chapter.
   * Server tự wire kết quả vào gallery_assets DB + set beat.assetIdRef
   * cho archive/stock/AI. Sync, có thể chậm 10-30s (Pexels rate limit).
   * Idempotent: re-call OK (cache hash-based).
   */
  resolveStoryboardChapter: (
    planId: string,
    chapterIdx: number,
    opts: { watchDir?: string } = {},
  ) =>
    jsonFetch<{
      resolved: ResolvedAssetClient[];
      pending: PendingBeatClient[];
      failed: FailedBeatClient[];
      attached: number;
      plan: Storyboard;
    }>(
      `/api/gallery/storyboards/${encodeURIComponent(planId)}/chapters/${chapterIdx}/resolve`,
      { method: "POST", body: JSON.stringify(opts) },
    ),

  deleteStoryboard: (id: string) =>
    jsonFetch<{ deleted: boolean }>(
      `/api/gallery/storyboards/${encodeURIComponent(id)}`,
      { method: "DELETE" },
    ),

  // ─── Podcast script gen + audio gen (dialogue 2 voice) ────────────────
  listVoices: () =>
    jsonFetch<{
      voices: VoiceInfo[];
      defaults: { hostNam: string; hostNu: string };
    }>("/api/episodes/_/voices"),

  getPodcastScript: (name: string) =>
    jsonFetch<PodcastScript | null>(
      `/api/episodes/${encodeURIComponent(name)}/script`,
    ),

  genPodcastScript: (
    name: string,
    input: {
      provider: LLMProvider;
      model: string;
      essayId?: string | null;
      brainstormRef?: { id: string; ideaIdx: number } | null;
      extraNotes: string;
      targetMinutes?: number;
    },
  ) =>
    jsonFetch<PodcastScript>(
      `/api/episodes/${encodeURIComponent(name)}/script/generate`,
      { method: "POST", body: JSON.stringify(input) },
    ),

  savePodcastScript: (
    name: string,
    input: { turns: PodcastScriptTurn[]; extraNotes?: string },
  ) =>
    jsonFetch<PodcastScript>(
      `/api/episodes/${encodeURIComponent(name)}/script`,
      { method: "PUT", body: JSON.stringify(input) },
    ),

  deletePodcastScript: (name: string) =>
    jsonFetch<{ deleted: boolean; audioCleared: number }>(
      `/api/episodes/${encodeURIComponent(name)}/script`,
      { method: "DELETE" },
    ),

  getPodcastScriptAudioStatus: (name: string) =>
    jsonFetch<{
      turns: Array<{
        idx: number;
        cached: boolean;
        aacFilename: string | null;
        mtimeMs: number | null;
      }>;
    }>(`/api/episodes/${encodeURIComponent(name)}/script/audio-status`),

  genPodcastScriptTurnAudio: (
    name: string,
    input: {
      turnIdx: number;
      voice: string;
      styleInstruction: string;
      ttsModel?: string;
      /** TTS channel — "gemini" (AI Studio, AIza key) hoặc "vertex-gemini" (Vertex AI Express, AQ key). */
      provider?: "gemini" | "vertex-gemini";
      force?: boolean;
    },
  ) =>
    jsonFetch<{
      aacFilename: string;
      pcmFilename: string;
      durationMs: number;
      cached: boolean;
    }>(`/api/episodes/${encodeURIComponent(name)}/script/audio/turn`, {
      method: "POST",
      body: JSON.stringify(input),
    }),

  deletePodcastScriptTurnAudio: (name: string, turnIdx: number) =>
    jsonFetch<{ deleted: boolean }>(
      `/api/episodes/${encodeURIComponent(name)}/script/audio/turn/${turnIdx}`,
      { method: "DELETE" },
    ),

  /** Concat-only: ráp các PCM cache hiện có → final AAC. Throw 400 nếu turn
   * nào chưa có PCM (UI thấy `err.details.missing[]`). */
  concatPodcastScript: (name: string, input: { mixBgm?: boolean } = {}) =>
    jsonFetch<{
      outputPath: string;
      durationMs: number;
      turnCount: number;
      missing: number[];
    }>(`/api/episodes/${encodeURIComponent(name)}/script/audio/concat`, {
      method: "POST",
      body: JSON.stringify(input),
    }),

  batchGenPodcastScriptTurnAudio: (
    name: string,
    input: {
      fromIdx: number;
      count: number;
      ttsModel?: string;
      hostNam: { voice: string; styleInstruction: string };
      hostNu: { voice: string; styleInstruction: string };
      force?: boolean;
      pacingMs?: number;
    },
  ) =>
    jsonFetch<{
      range: { from: number; to: number };
      generated: number[];
      cached: number[];
      skipped: number[];
      blocked: Array<{ idx: number; reason: string }>;
    }>(`/api/episodes/${encodeURIComponent(name)}/script/audio/batch`, {
      method: "POST",
      body: JSON.stringify(input),
    }),

  previewPodcastScriptTurns: (name: string, turnIndices: number[]) =>
    jsonFetch<{
      aacFilename: string;
      durationMs: number;
      included: number[];
      missing: number[];
      mtimeMs: number;
    }>(
      `/api/episodes/${encodeURIComponent(name)}/script/audio/preview`,
      { method: "POST", body: JSON.stringify({ turnIndices }) },
    ),

  uploadPodcastScriptTurnAudio: async (
    name: string,
    turnIdx: number,
    file: File,
  ): Promise<{
    aacFilename: string;
    pcmFilename: string;
    durationMs: number;
    cached: boolean;
  }> => {
    const form = new FormData();
    form.append("audio", file);
    const res = await fetch(
      `/api/episodes/${encodeURIComponent(name)}/script/audio/turn/${turnIdx}/upload`,
      { method: "POST", body: form },
    );
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      throw new ApiError(res.status, body.error ?? res.statusText);
    }
    return (await res.json()) as {
      aacFilename: string;
      pcmFilename: string;
      durationMs: number;
      cached: boolean;
    };
  },

  genPodcastScriptAudio: (
    name: string,
    input: {
      ttsModel?: string;
      hostNam: { voice: string; styleInstruction: string };
      hostNu: { voice: string; styleInstruction: string };
      mixBgm?: boolean;
      turnGapMs?: number;
      force?: boolean;
    },
  ) =>
    jsonFetch<{
      episode: EpisodeSummary | null;
      audioPath: string;
      durationMs: number;
      turnCount: number;
      bgmMixed: boolean;
    }>(`/api/episodes/${encodeURIComponent(name)}/script/audio`, {
      method: "POST",
      body: JSON.stringify(input),
    }),

  // ─── System prompts management ──────────────────────────────────────
  listPrompts: () => jsonFetch<{ prompts: PromptMeta[] }>("/api/prompts"),
  getPrompt: (key: string) =>
    jsonFetch<PromptMeta>(`/api/prompts/${encodeURIComponent(key)}`),
  savePromptOverride: (key: string, value: string) =>
    jsonFetch<PromptMeta>(`/api/prompts/${encodeURIComponent(key)}`, {
      method: "PUT",
      body: JSON.stringify({ value }),
    }),
  resetPromptOverride: (key: string) =>
    jsonFetch<PromptMeta>(`/api/prompts/${encodeURIComponent(key)}`, {
      method: "DELETE",
    }),

  // ─── Phase 4b'' — API keys settings ─────────────────────────────────
  listApiKeys: () =>
    jsonFetch<{ keys: ApiKeyStatus[] }>("/api/settings/keys"),
  setApiKey: (provider: string, apiKey: string) =>
    jsonFetch<{ ok: boolean }>(
      `/api/settings/keys/${encodeURIComponent(provider)}`,
      { method: "PUT", body: JSON.stringify({ apiKey }) },
    ),
  deleteApiKey: (provider: string) =>
    jsonFetch<{ deleted: boolean }>(
      `/api/settings/keys/${encodeURIComponent(provider)}`,
      { method: "DELETE" },
    ),
};

export type PromptMeta = {
  key: string;
  label: string;
  description: string;
  usedBy: string;
  defaultValue: string;
  override: string | null;
  updatedAt: string | null;
};

export type ApiKeyProvider =
  | "openai"
  | "gemini"
  | "anthropic"
  | "google-vertex-ai"
  | "pexels";

export type ApiKeyStatus = {
  provider: ApiKeyProvider;
  hasKey: boolean;
  source: "db" | "env" | "none";
  keyHint: string | null;
};

export { ApiError };
