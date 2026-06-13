/**
 * Fetch wrapper cho Studio API.
 *
 * Vite dev server proxy /api → Hono :3001 (xem vite.config.ts), nên FE
 * gọi relative path. Sau khi build, FE host độc lập + Hono cần CORS đúng.
 */

export type EpisodeStatus =
  | "no-audio"
  | "draft"
  | "rendering"
  | "rendered"
  | "outdated";

export type EpisodeConfig = {
  title: string;
  hook: string | null;
  episodeNumber: number;
  moodOverride: string | null;
  bgm: string | null;
  bgmVolumeDb: number;
  showIntro: boolean;
  showOutro: boolean;
  sceneOverrides: unknown;
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

export type RenderJob = {
  id: string;
  episodeName: string;
  preview: boolean;
  status: RenderPhase;
  percent: number;
  message: string;
  startedAt: number;
  finishedAt: number | null;
  outputPath: string | null;
  error: string | null;
};

export type RenderProgressEvent = RenderJob & {
  jobId: string;
  elapsedMs: number;
};

export const api = {
  listEpisodes: () =>
    jsonFetch<{ episodes: EpisodeSummary[] }>("/api/episodes"),

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

  savePlan: (name: string, scenes: ScenePlanItem[]) =>
    jsonFetch<PlanPayload>(`/api/episodes/${encodeURIComponent(name)}/plan`, {
      method: "PUT",
      body: JSON.stringify({ scenes }),
    }),

  getPlanOptions: () =>
    jsonFetch<{ moods: string[]; sceneTypes: string[] }>(
      "/api/episodes/_/plan-options",
    ),

  saveEpisodeConfig: (name: string, config: EpisodeConfig) =>
    jsonFetch<EpisodeSummary>(
      `/api/episodes/${encodeURIComponent(name)}/config`,
      { method: "PUT", body: JSON.stringify(config) },
    ),

  startRender: (episodeName: string, preview: boolean) =>
    jsonFetch<RenderJob>("/api/render", {
      method: "POST",
      body: JSON.stringify({ episodeName, preview }),
    }),

  cancelJob: (jobId: string) =>
    jsonFetch<{ cancelled: boolean }>(
      `/api/render/jobs/${encodeURIComponent(jobId)}/cancel`,
      { method: "POST" },
    ),

  uploadAudio: async (file: File): Promise<EpisodeSummary> => {
    const form = new FormData();
    form.append("audio", file);
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
};

export { ApiError };
