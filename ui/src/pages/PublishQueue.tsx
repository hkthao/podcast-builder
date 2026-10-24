/**
 * Hàng đợi đăng Facebook — upload chạy nền trên server (tuần tự), không phụ thuộc tab này:
 * đóng trang / chạy từ skill vẫn hiện ở đây. Mỗi job: % + MB đã tải + tốc độ + ETA + log.
 * Route: /publish-queue
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  ExternalLink,
  Loader2,
  RotateCcw,
  Trash2,
  UploadCloud,
  X as XIcon,
} from "lucide-react";
import { publishApi, type PublishJob } from "@/lib/api";
import { seriesInfo } from "@/lib/series";
import { fmtBytes } from "@/pages/Cleanup";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const isActivePublish = (j: PublishJob) => j.status === "queued" || j.status === "uploading";

const fmtDuration = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(s / 60);
  return m >= 60 ? `${Math.floor(m / 60)}h${String(m % 60).padStart(2, "0")}` : `${m}:${String(s % 60).padStart(2, "0")}`;
};

const fmtWhen = (iso: string) =>
  new Date(iso).toLocaleString("vi-VN", { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

export function PublishQueuePage() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["publish-jobs"],
    queryFn: () => publishApi.list(),
    refetchInterval: (query) => (query.state.data?.jobs.some(isActivePublish) ? 2000 : 15000),
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["publish-jobs"] });
  const cancelMut = useMutation({ mutationFn: (id: string) => publishApi.cancel(id), onSuccess: refresh });
  const retryMut = useMutation({ mutationFn: (id: string) => publishApi.retry(id), onSuccess: refresh });
  const clearMut = useMutation({ mutationFn: () => publishApi.clearFinished(), onSuccess: refresh });

  const jobs = q.data?.jobs ?? [];
  const uploading = jobs.filter((j) => j.status === "uploading");
  const waiting = jobs.filter((j) => j.status === "queued");
  const finished = jobs.filter((j) => !isActivePublish(j)).sort((a, b) => (b.finishedAt ?? 0) - (a.finishedAt ?? 0));

  // ETA cả hàng: phần còn lại của job đang tải + toàn bộ job chờ, theo tốc độ hiện tại.
  const speed = uploading[0]?.bytesPerSec ?? 0;
  const remainingBytes =
    uploading.reduce((s, j) => s + (j.bytesTotal - j.bytesSent), 0) + waiting.reduce((s, j) => s + j.bytesTotal, 0);

  return (
    <div className="container max-w-5xl py-5 pb-24 md:py-10">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 font-serif text-2xl md:text-3xl tracking-tight">
            <UploadCloud className="size-7 text-accent" /> Hàng đợi đăng
          </h1>
          <p className="mt-1 text-sm text-muted-foreground line-clamp-2 md:line-clamp-none">
            {q.data
              ? `${uploading.length} đang tải · ${waiting.length} đang chờ` +
                (remainingBytes ? ` · còn ${fmtBytes(remainingBytes)}` : "") +
                (speed > 0 && remainingBytes ? ` ≈ ${fmtDuration((remainingBytes / speed) * 1000)}` : "")
              : "Đang tải…"}{" "}
            · tải tuần tự từng tập lên Facebook, chạy nền trên server (đóng trang không huỷ).
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => clearMut.mutate()} disabled={clearMut.isPending || !finished.length}>
          <Trash2 className="size-4" /> Xoá đã xong
        </Button>
      </header>

      {q.isLoading && <Card className="mb-4 h-24 animate-pulse bg-muted/30" />}
      {q.error && <Card className="mb-4 p-4 text-sm text-destructive">{String(q.error)}</Card>}
      {(cancelMut.error || retryMut.error) && (
        <Card className="mb-4 p-4 text-sm text-destructive">{String(cancelMut.error ?? retryMut.error)}</Card>
      )}
      {q.data && (
        <>
          <Section title="Đang tải" empty="Không có video nào đang tải.">
            {uploading.map((j) => (
              <JobRow
                key={j.id}
                job={j}
                defaultOpen
                onCancel={j.via !== "business-suite" ? () => cancelMut.mutate(j.id) : undefined}
              />
            ))}
          </Section>
          <Section title="Đang chờ" empty="Hàng đợi trống.">
            {waiting.map((j, i) => (
              <JobRow key={j.id} job={j} position={i + 1} onCancel={() => cancelMut.mutate(j.id)} />
            ))}
          </Section>
          <Section title="Đã kết thúc" empty="Chưa có lượt đăng nào.">
            {finished.map((j) => (
              <JobRow
                key={j.id}
                job={j}
                onRetry={j.status !== "done" && j.via !== "business-suite" ? () => retryMut.mutate(j.id) : undefined}
              />
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

function JobRow({
  job,
  position,
  defaultOpen,
  onCancel,
  onRetry,
}: {
  job: PublishJob;
  position?: number;
  defaultOpen?: boolean;
  onCancel?: () => void;
  onRetry?: () => void;
}) {
  const [open, setOpen] = useState(!!defaultOpen);
  const info = seriesInfo(job.series);
  const active = isActivePublish(job);
  const eta = job.bytesPerSec > 0 ? fmtDuration(((job.bytesTotal - job.bytesSent) / job.bytesPerSec) * 1000) : "—";
  const fbUrl = job.result?.permalink ?? (job.result ? `https://www.facebook.com/${job.result.videoId}` : null);

  return (
    <div className="px-4 py-3">
      <div className="flex items-center gap-3">
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
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="shrink-0 text-muted-foreground hover:text-foreground"
          title={open ? "Ẩn log" : "Xem log"}
        >
          {open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <Link
              to={`/episodes/${encodeURIComponent(job.episodeName)}`}
              className="w-full truncate text-sm font-medium hover:underline sm:w-auto"
            >
              {job.title || job.episodeName}
            </Link>
            <Badge variant="outline" className="shrink-0 text-[10px]">
              {info.channelName}
            </Badge>
            {job.via === "business-suite" && (
              <Badge variant="secondary" className="shrink-0 text-[10px]" title="Đăng qua Meta Business Suite (fb-browser)">
                Business Suite
              </Badge>
            )}
            {position && <span className="shrink-0 text-xs text-muted-foreground">#{position} trong hàng</span>}
          </div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            {job.scheduledAt ? `Hẹn đăng ${fmtWhen(job.scheduledAt)}` : "Đăng ngay"} · {fmtBytes(job.bytesTotal)}
          </div>
          {job.status === "uploading" && job.via !== "business-suite" && (
            <div className="mt-1.5 flex items-center gap-2">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${job.percent.toFixed(1)}%` }} />
              </div>
              <span className="w-12 text-right text-xs tabular-nums">{job.percent.toFixed(1)}%</span>
            </div>
          )}
          <div className={cn("mt-0.5 truncate text-xs", job.status === "error" ? "text-destructive" : "text-muted-foreground")}>
            {job.error ?? job.message}
          </div>
        </div>
        <div className="shrink-0 text-right text-xs tabular-nums text-muted-foreground">
          {job.status === "uploading" && job.via !== "business-suite" ? (
            <>
              <div>
                {fmtBytes(job.bytesSent)} · {job.bytesPerSec > 0 ? `${(job.bytesPerSec / 1024 ** 2).toFixed(2)} MB/s` : "…"}
              </div>
              <div>còn {eta}</div>
            </>
          ) : job.finishedAt && job.startedAt ? (
            <div title={new Date(job.finishedAt).toLocaleString("vi-VN")}>{fmtDuration(job.finishedAt - job.startedAt)}</div>
          ) : null}
        </div>
        {fbUrl && (
          <a href={fbUrl} target="_blank" rel="noreferrer" className="shrink-0 text-muted-foreground hover:text-foreground" title="Mở trên Facebook">
            <ExternalLink className="size-4" />
          </a>
        )}
        {onRetry && (
          <Button variant="ghost" size="sm" className="h-7 px-2 text-muted-foreground" onClick={onRetry} title="Thử lại (xếp cuối hàng)">
            <RotateCcw className="size-4" />
          </Button>
        )}
        {onCancel && active && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-muted-foreground hover:text-destructive"
            onClick={() => (job.status !== "uploading" || confirm("Huỷ upload đang chạy? Phần đã tải sẽ mất.")) && onCancel()}
            title="Huỷ"
          >
            <XIcon className="size-4" />
          </Button>
        )}
      </div>
      {open && (
        <pre className="mt-2 max-h-56 overflow-auto rounded-md bg-muted/40 p-2 pl-14 text-[11px] leading-relaxed text-muted-foreground">
          {job.log.length
            ? job.log.map((l) => `${new Date(l.at).toLocaleTimeString("vi-VN")}  ${l.line}`).join("\n")
            : "Chưa có log."}
        </pre>
      )}
    </div>
  );
}
