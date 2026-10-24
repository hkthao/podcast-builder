/**
 * Hàng đợi render — mọi job (render/transcribe/plan) của server: đang chạy (pha + %),
 * đang chờ, đã xong gần đây. Huỷ từng job hoặc reset cả hàng đợi.
 * Route: /render-queue
 */
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Clapperboard, Clock, Loader2, RotateCcw, X as XIcon, AlertCircle } from "lucide-react";
import { api, type RenderJob } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const isActiveJob = (status: string) => !["done", "error", "cancelled"].includes(status);

const PHASE_LABEL: Record<string, string> = {
  queued: "Đang chờ",
  "process-audio": "Chuẩn hoá audio",
  transcribe: "Whisper",
  "spell-fix": "Gom câu",
  "plan-episode": "Lập cảnh",
  bundle: "Đóng gói",
  render: "Render",
  thumbnail: "Thumbnail",
  lock: "Hoàn tất",
  done: "Xong",
  error: "Lỗi",
  cancelled: "Đã huỷ",
};

const fmtDuration = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(s / 60);
  return m >= 60 ? `${Math.floor(m / 60)}h${String(m % 60).padStart(2, "0")}` : `${m}:${String(s % 60).padStart(2, "0")}`;
};

/** ETA thô theo % (job chạy tuyến tính đủ để ước lượng). */
const eta = (j: RenderJob) =>
  j.percent > 3 ? fmtDuration(((Date.now() - j.startedAt) * (100 - j.percent)) / j.percent) : "—";

export function RenderQueuePage() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["render-jobs"],
    queryFn: () => api.listRenderJobs(),
    refetchInterval: (query) => (query.state.data?.jobs.some((j) => isActiveJob(j.status)) ? 3000 : 15000),
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["render-jobs"] });
  const cancelMut = useMutation({ mutationFn: (id: string) => api.cancelJob(id), onSuccess: refresh });
  const resetMut = useMutation({ mutationFn: () => api.resetRenderQueue(), onSuccess: refresh });

  const jobs = [...(q.data?.jobs ?? [])].sort((a, b) => b.startedAt - a.startedAt);
  const running = jobs.filter((j) => isActiveJob(j.status) && j.status !== "queued");
  const waiting = jobs.filter((j) => j.status === "queued").sort((a, b) => a.startedAt - b.startedAt);
  const finished = jobs.filter((j) => !isActiveJob(j.status)).slice(0, 30);

  return (
    <div className="container max-w-5xl py-5 pb-24 md:py-10">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 font-serif text-2xl md:text-3xl tracking-tight">
            <Clapperboard className="size-7 text-accent" /> Hàng đợi render
          </h1>
          <p className="mt-1 text-sm text-muted-foreground line-clamp-2 md:line-clamp-none">
            {q.data ? `${running.length} đang chạy · ${waiting.length} đang chờ` : "Đang tải…"} · server chạy tối đa 2 job song song. Danh sách mất khi
            server khởi động lại.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => confirm("Huỷ TẤT CẢ job đang chạy/chờ và reset hàng đợi?") && resetMut.mutate()}
          disabled={resetMut.isPending || (!running.length && !waiting.length)}
          title="Dùng khi hàng đợi bị kẹt (job treo không chạy tiếp)"
        >
          <RotateCcw className="size-4" /> Reset
        </Button>
      </header>

      {q.isLoading && <Card className="mb-4 h-24 animate-pulse bg-muted/30" />}
      {q.error && <Card className="mb-4 p-4 text-sm text-destructive">{String(q.error)}</Card>}
      {q.data && (
      <>
      <Section title="Đang chạy" empty="Không có job nào đang chạy.">
        {running.map((j) => (
          <JobRow key={j.id} job={j} onCancel={() => cancelMut.mutate(j.id)} />
        ))}
      </Section>
      <Section title="Đang chờ" empty="Hàng đợi trống.">
        {waiting.map((j, i) => (
          <JobRow key={j.id} job={j} position={i + 1} onCancel={() => cancelMut.mutate(j.id)} />
        ))}
      </Section>
      <Section title="Đã xong gần đây" empty="Chưa có job nào kết thúc từ lần server khởi động.">
        {finished.map((j) => (
          <JobRow key={j.id} job={j} />
        ))}
      </Section>
      </>
      )}
    </div>
  );
}

function Section({ title, empty, children }: { title: string; empty: string; children: React.ReactNode[] }) {
  return (
    <Card className="mb-4 overflow-hidden p-0">
      <div className="border-b bg-muted/30 px-4 py-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {title}
      </div>
      {children.length ? <div className="divide-y">{children}</div> : <p className="px-4 py-4 text-sm text-muted-foreground">{empty}</p>}
    </Card>
  );
}

function JobRow({ job, position, onCancel }: { job: RenderJob; position?: number; onCancel?: () => void }) {
  const active = isActiveJob(job.status);
  const kind =
    job.jobType === "render"
      ? `${job.preview ? "Preview" : "Render"} ${job.format === "landscape" ? "16:9" : "9:16"}`
      : job.jobType === "transcribe"
        ? "Transcript"
        : "Plan";
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <span className="shrink-0">
        {job.status === "done" ? (
          <CheckCircle2 className="size-4 text-emerald-500" />
        ) : job.status === "error" ? (
          <AlertCircle className="size-4 text-destructive" />
        ) : job.status === "cancelled" ? (
          <XIcon className="size-4 text-muted-foreground" />
        ) : job.status === "queued" ? (
          <Clock className="size-4 text-muted-foreground" />
        ) : (
          <Loader2 className="size-4 animate-spin text-accent" />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <Link to={`/episodes/${encodeURIComponent(job.episodeName)}`} className="truncate text-sm font-medium hover:underline">
            {job.episodeName}
          </Link>
          <Badge variant="outline" className="shrink-0 text-[10px]">
            {kind}
          </Badge>
          {position && <span className="text-xs text-muted-foreground">#{position} trong hàng</span>}
        </div>
        {active && job.status !== "queued" && (
          <div className="mt-1.5 flex items-center gap-2">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${Math.round(job.percent)}%` }} />
            </div>
            <span className="w-10 text-right text-xs tabular-nums">{Math.round(job.percent)}%</span>
          </div>
        )}
        <div className={cn("mt-0.5 truncate text-xs", job.status === "error" ? "text-destructive" : "text-muted-foreground")}>
          {PHASE_LABEL[job.status] ?? job.status}
          {job.message ? ` · ${job.message}` : ""}
          {job.error ? ` · ${job.error}` : ""}
        </div>
      </div>
      <div className="shrink-0 text-right text-xs tabular-nums text-muted-foreground">
        {active && job.status !== "queued" ? (
          <>
            <div>{fmtDuration(Date.now() - job.startedAt)}</div>
            <div>còn {eta(job)}</div>
          </>
        ) : job.finishedAt ? (
          <div title={new Date(job.finishedAt).toLocaleString("vi-VN")}>{fmtDuration(job.finishedAt - job.startedAt)}</div>
        ) : null}
      </div>
      {onCancel && active && (
        <Button variant="ghost" size="sm" className="h-7 px-2 text-muted-foreground hover:text-destructive" onClick={onCancel} title="Huỷ job">
          <XIcon className="size-4" />
        </Button>
      )}
    </div>
  );
}
