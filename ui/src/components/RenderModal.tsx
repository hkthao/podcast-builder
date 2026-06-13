import { useCallback, useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  X as XIcon,
  Play,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Download,
  FolderOpen,
} from "lucide-react";
import {
  api,
  type RenderJob,
  type RenderPhase,
  type RenderProgressEvent,
} from "@/lib/api";
import { useRenderProgress } from "@/lib/sse";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  episodeName: string;
  preview: boolean;
  onClose: () => void;
};

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

export function RenderModal({ open, episodeName, preview, onClose }: Props) {
  const qc = useQueryClient();
  const [job, setJob] = useState<RenderJob | null>(null);

  // Reset khi mở modal
  useEffect(() => {
    if (!open) setJob(null);
  }, [open]);

  const startMutation = useMutation({
    mutationFn: () => api.startRender(episodeName, preview),
    onSuccess: (j) => setJob(j),
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => api.cancelJob(id),
  });

  const onProgress = useCallback((ev: RenderProgressEvent) => {
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
    if (ev.status === "done" || ev.status === "error" || ev.status === "cancelled") {
      qc.invalidateQueries({ queryKey: ["episodes"] });
      qc.invalidateQueries({ queryKey: ["episode", ev.episodeName] });
    }
  }, [qc]);
  useRenderProgress(job?.id ?? null, onProgress);

  // Auto start khi mở
  useEffect(() => {
    if (open && !job && !startMutation.isPending) {
      startMutation.mutate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  const isFinished =
    job?.status === "done" ||
    job?.status === "error" ||
    job?.status === "cancelled";
  const isRunning = !!job && !isFinished;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && isFinished) onClose();
      }}
    >
      <Card className="w-full max-w-xl">
        <header className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="font-serif text-xl">
            Rendering {preview ? "Preview (10s)" : "Full episode"}
          </h2>
          <button
            onClick={() => {
              if (isRunning) {
                if (
                  !confirm(
                    "Render đang chạy. Hủy job và đóng modal?",
                  )
                )
                  return;
                if (job) cancelMutation.mutate(job.id);
              }
              onClose();
            }}
            className="text-muted-foreground hover:text-foreground"
            aria-label="Close"
          >
            <XIcon className="size-5" />
          </button>
        </header>

        <div className="p-6 space-y-4">
          {startMutation.isError && (
            <div className="rounded-md bg-destructive/10 border border-destructive/40 p-3 text-sm text-destructive">
              {String(startMutation.error)}
            </div>
          )}

          {!job && startMutation.isPending && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Starting…
            </div>
          )}

          {job && (
            <>
              {/* Phase list */}
              <div className="space-y-1.5">
                {PHASES.map((p) => {
                  const order = PHASE_ORDER[p.key];
                  const currentOrder =
                    job.status === "queued" ? -1 : PHASE_ORDER[job.status];
                  const done = currentOrder > order || job.status === "done";
                  const active = currentOrder === order && !isFinished;
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

              {/* Progress bar */}
              {!isFinished && (
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
              )}

              {/* Done state */}
              {job.status === "done" && (
                <div className="rounded-md bg-accent/10 border border-accent/40 p-4">
                  <div className="flex items-center gap-2 font-medium text-accent mb-2">
                    <CheckCircle2 className="size-5" />
                    Render xong{" "}
                    {job.finishedAt
                      ? `· ${formatDuration(job.finishedAt - job.startedAt)}`
                      : ""}
                  </div>
                  {job.outputPath && (
                    <p className="text-xs text-muted-foreground font-mono break-all">
                      {job.outputPath}
                    </p>
                  )}
                </div>
              )}

              {/* Error state */}
              {job.status === "error" && (
                <div className="rounded-md bg-destructive/10 border border-destructive/40 p-4">
                  <div className="flex items-center gap-2 font-medium text-destructive mb-2">
                    <AlertCircle className="size-5" />
                    Render thất bại
                  </div>
                  <p className="text-sm text-muted-foreground">{job.error}</p>
                </div>
              )}

              {/* Cancelled state */}
              {job.status === "cancelled" && (
                <div className="rounded-md bg-secondary p-4 text-sm">
                  Đã hủy
                </div>
              )}
            </>
          )}
        </div>

        <footer className="px-6 py-4 border-t flex items-center justify-end gap-2">
          {job && isRunning && (
            <Button
              variant="destructive"
              onClick={() => {
                if (job) cancelMutation.mutate(job.id);
              }}
              disabled={cancelMutation.isPending}
            >
              <XIcon className="size-4" />
              Hủy render
            </Button>
          )}
          {job?.status === "done" && job.outputPath && (
            <>
              <Button variant="outline" asChild>
                <a
                  href={`/output/${job.episodeName}${preview ? ".preview" : ""}.mp4`}
                  target="_blank"
                  rel="noreferrer"
                  download
                >
                  <Download className="size-4" />
                  Tải mp4
                </a>
              </Button>
              <Button
                variant="outline"
                onClick={async () => {
                  // Try open in Finder via macOS scheme
                  const url = `file://${encodeURI(job.outputPath!).replace(/^file:\/\//, "")}`;
                  await navigator.clipboard?.writeText(job.outputPath!);
                  alert(
                    `Đã copy path:\n${job.outputPath}\n\nMở Finder + dán vào "Go to Folder" (⌘⇧G)`,
                  );
                  void url;
                }}
              >
                <FolderOpen className="size-4" />
                Mở trong Finder
              </Button>
            </>
          )}
          {isFinished && (
            <Button variant={job?.status === "done" ? "default" : "secondary"} onClick={onClose}>
              Đóng
            </Button>
          )}
        </footer>
      </Card>
    </div>
  );
}

function formatDuration(ms: number): string {
  const totalSec = Math.round(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  if (m === 0) return `${s}s`;
  return `${m}m ${s}s`;
}

void Play;
