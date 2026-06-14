import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { Upload, AlertCircle, CheckCircle2, Clock, FileAudio2 } from "lucide-react";
import { api, type EpisodeStatus, type EpisodeSummary } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useWorkspace } from "@/lib/workspace";

export function EpisodeList() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { workspace } = useWorkspace();
  const { data, isLoading, error } = useQuery({
    queryKey: ["episodes", workspace],
    queryFn: () => api.listEpisodes(workspace),
  });

  const upload = useMutation({
    mutationFn: (file: File) => api.uploadAudio(file, { style: workspace }),
    onSuccess: (ep) => {
      qc.invalidateQueries({ queryKey: ["episodes"] });
      navigate(`/episodes/${encodeURIComponent(ep.name)}`);
    },
  });

  const [dragOver, setDragOver] = useState(false);

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    const audio = files.find((f) => /\.(m4a|mp3|wav)$/i.test(f.name));
    if (!audio) return;
    upload.mutate(audio);
  };

  return (
    <div
      onDragEnter={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragOver={(e) => e.preventDefault()}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
      className={cn(
        "min-h-screen relative",
        dragOver && "bg-secondary/40",
      )}
    >
      <div className="container max-w-5xl py-10">
        <header className="mb-8 flex items-center justify-between gap-6">
          <div>
            <h1 className="text-3xl font-serif tracking-tight">Danh sách tập</h1>
            <p className="mt-1 text-muted-foreground text-sm">
              {data ? `${data.episodes.length} tập` : "Đang tải…"}
              {" · "}
              Kéo audio (.m4a/.mp3/.wav) vào trang để tạo tập mới
            </p>
          </div>
          <UploadButton
            onPick={(f) => upload.mutate(f)}
            isUploading={upload.isPending}
          />
        </header>

        {upload.isError && (
          <div className="mb-6 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-destructive">
            <div className="flex items-center gap-2 font-medium">
              <AlertCircle className="size-5" />
              Upload thất bại
            </div>
            <p className="mt-1 text-sm">{String(upload.error)}</p>
          </div>
        )}

        {isLoading && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <Card key={i} className="h-44 animate-pulse bg-muted/30" />
            ))}
          </div>
        )}

        {error && (
          <Card className="border-destructive/40 bg-destructive/5 p-6">
            <div className="flex items-center gap-2 font-medium text-destructive">
              <AlertCircle className="size-5" />
              Không kết nối được server
            </div>
            <p className="mt-2 text-sm text-muted-foreground">{String(error)}</p>
            <p className="mt-2 text-sm">
              Đảm bảo backend đang chạy: <code className="rounded bg-muted px-1.5 py-0.5">npm run studio:server</code>
            </p>
          </Card>
        )}

        {data && data.episodes.length === 0 && !upload.isPending && (
          <Card className="border-dashed p-12 text-center">
            <FileAudio2 className="mx-auto mb-4 size-12 text-muted-foreground" />
            <h2 className="mb-2 text-xl font-serif">Chưa có tập nào</h2>
            <p className="text-muted-foreground">
              Kéo file audio đầu tiên vào trang, hoặc bấm nút "Upload" ở góc.
            </p>
          </Card>
        )}

        {data && data.episodes.length > 0 && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data.episodes.map((ep) => (
              <EpisodeCard key={ep.name} ep={ep} />
            ))}
          </div>
        )}
      </div>

      {/* Drag overlay */}
      {dragOver && (
        <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
          <Card className="border-primary border-dashed border-2 px-10 py-12 text-center">
            <Upload className="mx-auto mb-3 size-12 text-primary" />
            <p className="text-xl font-medium">Thả audio để tạo tập mới</p>
            <p className="mt-1 text-sm text-muted-foreground">
              .m4a / .mp3 / .wav
            </p>
          </Card>
        </div>
      )}

      {upload.isPending && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-lg border bg-card px-5 py-3 shadow-lg">
          <div className="size-3 animate-pulse rounded-full bg-primary" />
          <span>Đang upload…</span>
        </div>
      )}
    </div>
  );
}

function UploadButton({
  onPick,
  isUploading,
}: {
  onPick: (f: File) => void;
  isUploading: boolean;
}) {
  return (
    <Button asChild disabled={isUploading} variant="default">
      <label className="cursor-pointer">
        <Upload className="size-5" />
        Upload audio
        <input
          type="file"
          accept=".m4a,.mp3,.wav,audio/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onPick(f);
            e.target.value = "";
          }}
        />
      </label>
    </Button>
  );
}

function EpisodeCard({ ep }: { ep: EpisodeSummary }) {
  return (
    <Link
      to={`/episodes/${encodeURIComponent(ep.name)}`}
      className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-lg"
    >
      <Card className="flex flex-col p-5 h-full transition-colors hover:bg-secondary/40 hover:border-primary/40 cursor-pointer">
        <div className="mb-3 flex items-start justify-between gap-2">
          <h3 className="font-serif text-lg leading-tight line-clamp-2">
            {ep.config.title || ep.name}
          </h3>
          <StatusBadge status={ep.status} />
        </div>
        {ep.config.hook && (
          <p className="mb-3 line-clamp-2 text-sm text-muted-foreground italic">
            "{ep.config.hook}"
          </p>
        )}
        <div className="mt-auto flex items-center gap-3 text-xs text-muted-foreground">
          <span className="font-mono">
            #{String(ep.config.episodeNumber).padStart(3, "0")}
          </span>
          {ep.renderedAt && (
            <>
              <span>·</span>
              <span>Rendered {timeAgo(ep.renderedAt)}</span>
            </>
          )}
        </div>
      </Card>
    </Link>
  );
}

function StatusBadge({ status }: { status: EpisodeStatus }) {
  const cfg: Record<
    EpisodeStatus,
    { label: string; variant: "default" | "secondary" | "destructive" | "outline" | "accent"; icon: React.ReactNode }
  > = {
    "no-audio": {
      label: "Thiếu audio",
      variant: "destructive",
      icon: <AlertCircle className="size-3.5" />,
    },
    draft: {
      label: "Chưa render",
      variant: "outline",
      icon: <Clock className="size-3.5" />,
    },
    rendering: {
      label: "Đang render",
      variant: "default",
      icon: <Clock className="size-3.5 animate-spin" />,
    },
    rendered: {
      label: "Đã render",
      variant: "accent",
      icon: <CheckCircle2 className="size-3.5" />,
    },
    outdated: {
      label: "Cũ",
      variant: "secondary",
      icon: <AlertCircle className="size-3.5" />,
    },
  };
  const c = cfg[status];
  return (
    <Badge variant={c.variant} className="gap-1 shrink-0">
      {c.icon}
      {c.label}
    </Badge>
  );
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(ms / 60000);
  if (minutes < 1) return "vừa xong";
  if (minutes < 60) return `${minutes} phút trước`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} giờ trước`;
  const days = Math.floor(hours / 24);
  return `${days} ngày trước`;
}
