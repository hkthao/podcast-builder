import { useCallback, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Play,
  X as XIcon,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Download,
  FolderOpen,
  Trash2,
  Image as ImageIcon,
  FileJson,
} from "lucide-react";
import {
  api,
  type EpisodeFile,
  type EpisodeFiles,
  type EpisodeSummary,
  type RenderJob,
  type RenderPhase,
  type RenderProgressEvent,
} from "@/lib/api";
import { useRenderProgress } from "@/lib/sse";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const PHASES: Array<{ key: RenderPhase; label: string }> = [
  { key: "process-audio", label: "Xử lý audio (loudness norm)" },
  { key: "transcribe", label: "Whisper transcribe" },
  { key: "spell-fix", label: "Sửa chính tả (OpenAI)" },
  { key: "plan-episode", label: "Lên kế hoạch cảnh" },
  { key: "bundle", label: "Bundle Remotion" },
  { key: "render", label: "Render frame" },
  { key: "thumbnail", label: "Thumbnail + lock file" },
];

const PHASE_ORDER: Record<RenderPhase, number> = {
  queued: -1,
  "process-audio": 0,
  transcribe: 1,
  "spell-fix": 2,
  "plan-episode": 3,
  bundle: 4,
  render: 5,
  thumbnail: 6,
  lock: 6,
  done: 7,
  error: 99,
  cancelled: 99,
};

export function RenderTab({
  ep,
  files,
  loading,
  hasTranscript,
  hasPlan,
}: {
  ep: EpisodeSummary;
  files: EpisodeFiles;
  loading: boolean;
  hasTranscript: boolean;
  hasPlan: boolean;
}) {
  const qc = useQueryClient();
  const [job, setJob] = useState<RenderJob | null>(null);
  const [deletingUrl, setDeletingUrl] = useState<string | null>(null);
  // Default checkboxes off if artifacts exist (don't regen by default).
  // If artifacts missing, render must run those phases anyway — checkbox forced on.
  const [regenTranscribe, setRegenTranscribe] = useState(!hasTranscript);
  const [regenPlan, setRegenPlan] = useState(!hasPlan);

  const startMutation = useMutation({
    mutationFn: (preview: boolean) =>
      api.startRender(ep.name, preview, { regenTranscribe, regenPlan }),
    onSuccess: (j) => setJob(j),
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => api.cancelJob(id),
  });

  // Surface server queue state — giúp debug khi job kẹt
  const jobsQ = useQuery({
    queryKey: ["render-jobs"],
    queryFn: () => api.listRenderJobs(),
    // Poll mỗi 2s khi component mount để bắt stuck jobs
    refetchInterval: 2000,
  });
  const activeServerJobs =
    jobsQ.data?.jobs.filter(
      (j) =>
        j.status !== "done" &&
        j.status !== "error" &&
        j.status !== "cancelled",
    ) ?? [];
  const otherActiveJobs = activeServerJobs.filter((j) => j.id !== job?.id);

  const resetMut = useMutation({
    mutationFn: () => api.resetRenderQueue(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["render-jobs"] });
      setJob(null);
    },
  });

  const deleteMut = useMutation({
    mutationFn: (vars: { filename: string }) =>
      api.deleteFile(ep.name, "output", vars.filename),
    onSuccess: (data) => {
      qc.setQueryData(["episode-files", ep.name], data);
      qc.invalidateQueries({ queryKey: ["episode", ep.name] });
      qc.invalidateQueries({ queryKey: ["episodes"] });
    },
    onSettled: () => setDeletingUrl(null),
  });

  const onProgress = useCallback(
    (ev: RenderProgressEvent) => {
      setJob((prev) =>
        prev
          ? {
              ...prev,
              status: ev.status,
              percent: ev.percent,
              message: ev.message,
              finishedAt: ev.finishedAt,
              outputPath: ev.outputPath,
              error: ev.error,
            }
          : prev,
      );
      if (
        ev.status === "done" ||
        ev.status === "error" ||
        ev.status === "cancelled"
      ) {
        qc.invalidateQueries({ queryKey: ["episodes"] });
        qc.invalidateQueries({ queryKey: ["episode", ev.episodeName] });
        qc.invalidateQueries({ queryKey: ["episode-files", ev.episodeName] });
      }
    },
    [qc],
  );
  useRenderProgress(job?.id ?? null, onProgress);

  // Re-attach to job đang chạy khi user mở lại tab Render giữa chừng render.
  useEffect(() => {
    if (job) return;
    if (!jobsQ.data) return;
    const active = jobsQ.data.jobs
      .filter(
        (j) =>
          j.episodeName === ep.name &&
          j.status !== "done" &&
          j.status !== "error" &&
          j.status !== "cancelled",
      )
      .sort((a, b) => b.startedAt - a.startedAt)[0];
    if (active) setJob(active);
  }, [job, jobsQ.data, ep.name]);

  // Fallback polling — SSE event giữa lúc subscribe có thể bị miss (race
  // condition: server emit "process-audio" trước khi useEffect subscribe
  // chạy). `jobsQ` đã poll mỗi 2s → sync trạng thái mới nhất từ đó.
  useEffect(() => {
    if (!job || !jobsQ.data) return;
    const latest = jobsQ.data.jobs.find((j) => j.id === job.id);
    if (!latest) {
      // Local có job đang chạy nhưng server không biết → server đã restart
      // (vd tsx watch reload mid-render → in-memory jobs Map mất sạch).
      // Job trên Chrome subprocess có thể vẫn chạy zombie nhưng không emit
      // được. Mark cancelled để user dismiss + restart.
      if (job.status !== "done" && job.status !== "error" && job.status !== "cancelled") {
        setJob({
          ...job,
          status: "error",
          error:
            "Server lost track of this job (restarted?). Subprocess có thể vẫn chạy ngầm — kill manually nếu cần. Restart render mới ở đây.",
          finishedAt: Date.now(),
        });
      }
      return;
    }
    if (
      latest.status === job.status &&
      latest.percent === job.percent &&
      latest.message === job.message
    ) {
      return;
    }
    setJob(latest);
    if (
      latest.status === "done" ||
      latest.status === "error" ||
      latest.status === "cancelled"
    ) {
      qc.invalidateQueries({ queryKey: ["episodes"] });
      qc.invalidateQueries({ queryKey: ["episode", ep.name] });
      qc.invalidateQueries({ queryKey: ["episode-files", ep.name] });
    }
  }, [job, jobsQ.data, qc, ep.name]);

  const isFinished =
    job?.status === "done" ||
    job?.status === "error" ||
    job?.status === "cancelled";
  const isRunning = !!job && !isFinished;

  const triggerRender = (preview: boolean) => {
    if (startMutation.isPending || isRunning) return;
    setJob(null);
    startMutation.mutate(preview);
  };

  const confirmAndDelete = (f: EpisodeFile) => {
    const warn =
      f.kind === "video-full"
        ? `XOÁ video full "${f.filename}" (${humanSize(f.size)})?\n\nPhải render lại để tái tạo.`
        : `XOÁ "${f.filename}"?`;
    if (!window.confirm(warn)) return;
    setDeletingUrl(f.url);
    deleteMut.mutate({ filename: f.filename });
  };

  if (loading) {
    return <Card className="h-64 animate-pulse bg-muted/30" />;
  }

  const fullVideo = files.output.find((f) => f.kind === "video-full");
  const previewVideo = files.output.find((f) => f.kind === "video-preview");
  const thumbnail = files.output.find((f) => f.kind === "thumbnail");
  const lockFile = files.output.find((f) => f.kind === "lock");
  const hasResult = fullVideo || previewVideo || thumbnail || lockFile;

  return (
    <div className="space-y-6">
      {/* Stuck-queue banner: hiện khi có job khác đang chiếm slot */}
      {otherActiveJobs.length > 0 && (
        <Card className="p-4 border-amber-500/40 bg-amber-500/5">
          <div className="flex items-start gap-3">
            <AlertCircle className="size-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm">
                Server đang chạy {otherActiveJobs.length} render khác
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Job mới sẽ chờ trong queue. Nếu đã &gt;5 phút mà phase không
                đổi → có thể đang kẹt → bấm "Force reset" để clear hết.
              </p>
              <div className="mt-2 space-y-1">
                {otherActiveJobs.map((j) => (
                  <div
                    key={j.id}
                    className="flex items-center gap-2 text-xs"
                  >
                    <code className="font-mono text-muted-foreground">
                      {j.episodeName}
                    </code>
                    <span className="text-muted-foreground">
                      · {j.status} · {Math.round(j.percent)}%
                    </span>
                    <button
                      onClick={() => cancelMutation.mutate(j.id)}
                      className="ml-2 text-destructive hover:underline"
                    >
                      cancel
                    </button>
                  </div>
                ))}
              </div>
              <Button
                variant="outline"
                size="sm"
                className="mt-3 text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={() => {
                  if (
                    window.confirm(
                      `Force reset queue? Sẽ hủy tất cả ${activeServerJobs.length} job đang chạy. Subprocess (ffmpeg/whisper) có thể còn chạy ngầm tới khi tự kết thúc.`,
                    )
                  )
                    resetMut.mutate();
                }}
                disabled={resetMut.isPending}
              >
                {resetMut.isPending ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <XIcon className="size-3.5" />
                )}
                Force reset queue ({activeServerJobs.length})
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Trigger / Progress */}
      {isRunning ? (
        <ProgressCard
          job={job!}
          onCancel={() => cancelMutation.mutate(job!.id)}
          cancelling={cancelMutation.isPending}
        />
      ) : (
        <TriggerCard
          ep={ep}
          job={job}
          pending={startMutation.isPending}
          startError={
            startMutation.isError ? String(startMutation.error) : null
          }
          onRender={triggerRender}
          onReset={() => setJob(null)}
          hasTranscript={hasTranscript}
          hasPlan={hasPlan}
          regenTranscribe={regenTranscribe}
          regenPlan={regenPlan}
          onRegenTranscribeChange={setRegenTranscribe}
          onRegenPlanChange={setRegenPlan}
        />
      )}

      {/* Last output section */}
      {hasResult && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-medium text-sm text-muted-foreground uppercase tracking-wider">
              Kết quả render gần nhất
            </h3>
            {ep.renderedAt && (
              <span className="text-xs text-muted-foreground">
                {timeAgo(ep.renderedAt)}
              </span>
            )}
          </div>

          {fullVideo && (
            <VideoCard
              file={fullVideo}
              label="Video full"
              poster={thumbnail?.url}
              maxHeight={480}
              accentIcon
              deletingUrl={deletingUrl}
              onDelete={confirmAndDelete}
            />
          )}

          {previewVideo && (
            <VideoCard
              file={previewVideo}
              label="Preview 10s"
              maxHeight={320}
              deletingUrl={deletingUrl}
              onDelete={confirmAndDelete}
            />
          )}

          {(thumbnail || lockFile) && (
            <Card className="p-0 overflow-hidden">
              <div className="px-6 py-3 border-b bg-secondary/30 flex items-center gap-2">
                <FileJson className="size-4 text-muted-foreground" />
                <span className="font-medium text-sm">Metadata</span>
              </div>
              <div className="divide-y">
                {thumbnail && (
                  <FileRow
                    file={thumbnail}
                    icon={<ImageIcon className="size-3.5" />}
                    label="Thumbnail (cover FB)"
                    deletingUrl={deletingUrl}
                    onDelete={confirmAndDelete}
                  >
                    <img
                      src={thumbnail.url}
                      alt="thumbnail"
                      className="mt-2 max-h-40 rounded border"
                    />
                  </FileRow>
                )}
                {lockFile && (
                  <FileRow
                    file={lockFile}
                    icon={<FileJson className="size-3.5" />}
                    label="Lock file (reproducibility)"
                    deletingUrl={deletingUrl}
                    onDelete={confirmAndDelete}
                  />
                )}
              </div>
            </Card>
          )}
        </div>
      )}

      {!hasResult && !isRunning && !job && (
        <Card className="p-8 text-center border-dashed">
          <Play className="mx-auto mb-3 size-10 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">
            Chưa có video render. Bấm <strong>Render preview</strong> để test
            nhanh 10s đầu, hoặc <strong>Render full</strong> cho bản hoàn chỉnh.
          </p>
        </Card>
      )}
    </div>
  );
}

function TriggerCard({
  ep,
  job,
  pending,
  startError,
  onRender,
  onReset,
  hasTranscript,
  hasPlan,
  regenTranscribe,
  regenPlan,
  onRegenTranscribeChange,
  onRegenPlanChange,
}: {
  ep: EpisodeSummary;
  job: RenderJob | null;
  pending: boolean;
  startError: string | null;
  onRender: (preview: boolean) => void;
  onReset: () => void;
  hasTranscript: boolean;
  hasPlan: boolean;
  regenTranscribe: boolean;
  regenPlan: boolean;
  onRegenTranscribeChange: (v: boolean) => void;
  onRegenPlanChange: (v: boolean) => void;
}) {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between mb-3 gap-3">
        <div className="min-w-0">
          <h3 className="font-medium flex items-center gap-2">
            <Play className="size-4 text-accent" />
            Tạo video
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Preview = 10s đầu, ~30s render. Full = hoàn chỉnh (~5-10 phút tuỳ
            độ dài audio).
          </p>
        </div>
        {job && (
          <Button variant="ghost" size="sm" onClick={onReset}>
            <XIcon className="size-3.5" />
            Đóng
          </Button>
        )}
      </div>

      {/* Regen options — reuse hay tạo lại transcript/plan */}
      <div className="mb-4 rounded-md border bg-secondary/20 p-3 space-y-2">
        <p className="text-xs text-muted-foreground">
          Mặc định reuse transcript + plan đã có. Tick để chạy lại (sẽ GHI ĐÈ
          các sửa của bạn).
        </p>
        <label
          className={cn(
            "flex items-start gap-2 text-sm cursor-pointer",
            !hasTranscript && "text-muted-foreground italic",
          )}
        >
          <input
            type="checkbox"
            checked={regenTranscribe}
            onChange={(e) => onRegenTranscribeChange(e.target.checked)}
            disabled={!hasTranscript}
            className="mt-0.5"
          />
          <span>
            Tạo lại transcript{" "}
            {!hasTranscript && "(chưa có — sẽ tự chạy)"}
          </span>
        </label>
        <label
          className={cn(
            "flex items-start gap-2 text-sm cursor-pointer",
            !hasPlan && "text-muted-foreground italic",
          )}
        >
          <input
            type="checkbox"
            checked={regenPlan}
            onChange={(e) => onRegenPlanChange(e.target.checked)}
            disabled={!hasPlan}
            className="mt-0.5"
          />
          <span>Tạo lại plan cảnh {!hasPlan && "(chưa có — sẽ tự chạy)"}</span>
        </label>
      </div>

      <div className="flex flex-wrap gap-3">
        <Button
          disabled={!ep.audioPath || pending}
          onClick={() => onRender(true)}
        >
          {pending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Play className="size-4" />
          )}
          Render preview (10s)
        </Button>
        <Button
          variant="secondary"
          disabled={!ep.audioPath || pending}
          onClick={() => onRender(false)}
        >
          <Play className="size-4" />
          Render full
        </Button>
        {!ep.audioPath && (
          <p className="self-center text-sm text-muted-foreground">
            Thiếu audio — upload trước ở trang Episodes hoặc Essay.
          </p>
        )}
      </div>

      {startError && (
        <div className="mt-3 rounded-md bg-destructive/10 border border-destructive/40 p-3 text-sm text-destructive">
          {startError}
        </div>
      )}

      {job?.status === "done" && job.outputPath && (
        <div className="mt-4 rounded-md bg-accent/10 border border-accent/40 p-3 text-sm">
          <div className="flex items-center gap-2 font-medium text-accent">
            <CheckCircle2 className="size-4" />
            Render xong
            {job.finishedAt
              ? ` · ${formatDuration(job.finishedAt - job.startedAt)}`
              : ""}
          </div>
          <p className="text-xs text-muted-foreground font-mono break-all mt-1">
            {job.outputPath}
          </p>
        </div>
      )}

      {job?.status === "error" && (
        <div className="mt-4 rounded-md bg-destructive/10 border border-destructive/40 p-3 text-sm">
          <div className="flex items-center gap-2 font-medium text-destructive">
            <AlertCircle className="size-4" />
            Render thất bại
          </div>
          <p className="text-xs text-muted-foreground mt-1">{job.error}</p>
        </div>
      )}

      {job?.status === "cancelled" && (
        <div className="mt-4 rounded-md bg-secondary p-3 text-sm">
          Đã hủy render
        </div>
      )}
    </Card>
  );
}

const PHASES_BY_JOB: Record<RenderJob["jobType"], typeof PHASES> = {
  transcribe: PHASES.filter((p) =>
    ["process-audio", "transcribe", "spell-fix"].includes(p.key),
  ),
  plan: PHASES.filter((p) => p.key === "plan-episode"),
  render: PHASES,
};

const JOB_TITLE: Record<RenderJob["jobType"], string> = {
  transcribe: "Đang tạo transcript",
  plan: "Đang tạo plan cảnh",
  render: "Đang render video",
};

function ProgressCard({
  job,
  onCancel,
  cancelling,
}: {
  job: RenderJob;
  onCancel: () => void;
  cancelling: boolean;
}) {
  const currentOrder =
    job.status === "queued" ? -1 : PHASE_ORDER[job.status];
  const phases = PHASES_BY_JOB[job.jobType] ?? PHASES;
  const title = JOB_TITLE[job.jobType] ?? "Đang chạy";
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Loader2 className="size-4 animate-spin text-accent" />
          <h3 className="font-medium text-sm">
            {title}
            {job.jobType === "render" &&
              ` (${job.preview ? "Preview 10s" : "Full"})`}
          </h3>
          <span className="font-mono text-xs text-muted-foreground">
            {Math.round(job.percent)}%
          </span>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
          onClick={onCancel}
          disabled={cancelling}
        >
          {cancelling ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <XIcon className="size-3.5" />
          )}
          Hủy
        </Button>
      </div>

      {job.status === "queued" && (
        <div className="mb-3 rounded-md border bg-secondary/30 p-3 text-sm flex items-center gap-2">
          <Loader2 className="size-4 animate-spin shrink-0 text-muted-foreground" />
          <span className="text-muted-foreground">
            Đang chờ trong queue… Nếu kẹt &gt;1 phút → restart server.
          </span>
        </div>
      )}

      <div className="space-y-1.5 mb-4">
        {phases.map((p) => {
          const order = PHASE_ORDER[p.key];
          const done = currentOrder > order;
          const active = currentOrder === order;
          return (
            <div
              key={p.key}
              className={cn(
                "flex items-center gap-2 text-sm",
                active && "text-foreground font-medium",
                done && "text-accent",
                !active && !done && "text-muted-foreground",
              )}
            >
              {done ? (
                <CheckCircle2 className="size-4 shrink-0" />
              ) : active ? (
                <Loader2 className="size-4 animate-spin shrink-0" />
              ) : (
                <div className="size-4 shrink-0 rounded-full border-2 border-current" />
              )}
              <span>{p.label}</span>
            </div>
          );
        })}
      </div>

      <div>
        <div className="h-2 w-full rounded-full bg-secondary overflow-hidden">
          <div
            className="h-full bg-primary transition-all"
            style={{ width: `${Math.min(100, job.percent)}%` }}
          />
        </div>
        <div className="mt-2 flex justify-between text-xs text-muted-foreground">
          <span>{job.message || "…"}</span>
          <span>{Math.round(job.percent)}%</span>
        </div>
      </div>
    </Card>
  );
}

function VideoCard({
  file,
  label,
  poster,
  maxHeight,
  accentIcon,
  deletingUrl,
  onDelete,
}: {
  file: EpisodeFile;
  label: string;
  poster?: string;
  maxHeight: number;
  accentIcon?: boolean;
  deletingUrl: string | null;
  onDelete: (f: EpisodeFile) => void;
}) {
  return (
    <Card className="p-0 overflow-hidden">
      <div className="px-6 py-3 border-b bg-secondary/30 flex items-center gap-2">
        <Play
          className={cn(
            "size-4",
            accentIcon ? "text-accent" : "text-muted-foreground",
          )}
        />
        <span className="font-medium">{label}</span>
        <code className="text-xs text-muted-foreground font-mono truncate">
          · {file.filename}
        </code>
        <span className="text-xs text-muted-foreground ml-auto font-mono shrink-0">
          {humanSize(file.size)} · {timeAgo(file.mtime)}
        </span>
      </div>
      <div className="bg-black">
        <video
          controls
          src={file.url}
          className="w-full object-contain mx-auto"
          style={{ maxHeight }}
          preload="metadata"
          poster={poster}
        />
      </div>
      <div className="px-6 py-3 border-t flex items-center justify-end gap-2">
        <Button variant="outline" size="sm" asChild>
          <a href={file.url} download={file.filename}>
            <Download className="size-4" />
            Tải về
          </a>
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={async () => {
            await navigator.clipboard?.writeText(file.url);
            alert(`Đã copy URL:\n${file.url}`);
          }}
          title="Copy URL"
        >
          <FolderOpen className="size-4" />
          Copy URL
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
          onClick={() => onDelete(file)}
          disabled={deletingUrl === file.url}
        >
          {deletingUrl === file.url ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Trash2 className="size-4" />
          )}
          Xoá
        </Button>
      </div>
    </Card>
  );
}

function FileRow({
  file,
  icon,
  label,
  deletingUrl,
  onDelete,
  children,
}: {
  file: EpisodeFile;
  icon: React.ReactNode;
  label: string;
  deletingUrl: string | null;
  onDelete: (f: EpisodeFile) => void;
  children?: React.ReactNode;
}) {
  return (
    <div className="px-6 py-3 space-y-2">
      <div className="flex items-center gap-3">
        <span className="text-muted-foreground shrink-0">{icon}</span>
        <span className="text-sm font-medium">{label}</span>
        <code className="text-xs text-muted-foreground font-mono truncate ml-1">
          {file.filename}
        </code>
        <span className="text-xs text-muted-foreground tabular-nums shrink-0 ml-auto">
          {humanSize(file.size)}
        </span>
      </div>
      {children}
      <div className="flex justify-end gap-2 pt-1">
        <Button variant="outline" size="sm" asChild>
          <a href={file.url} download={file.filename}>
            <Download className="size-3.5" />
            Tải về
          </a>
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
          onClick={() => onDelete(file)}
          disabled={deletingUrl === file.url}
        >
          {deletingUrl === file.url ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Trash2 className="size-3.5" />
          )}
          Xoá
        </Button>
      </div>
    </div>
  );
}

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(ms / 60000);
  if (minutes < 1) return "vừa xong";
  if (minutes < 60) return `${minutes}p trước`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h trước`;
  const days = Math.floor(hours / 24);
  return `${days}d trước`;
}

function formatDuration(ms: number): string {
  const totalSec = Math.round(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  if (m === 0) return `${s}s`;
  return `${m}m ${s}s`;
}
