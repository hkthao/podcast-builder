import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import {
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  FileAudio2,
  Plus,
  Loader2,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { api, type EpisodeStatus, type EpisodeSummary } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const PAGE_SIZE = 12;

export function EpisodeList() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data, isLoading, error } = useQuery({
    queryKey: ["episodes", "podcast"],
    queryFn: () => api.listEpisodes("podcast"),
  });

  const createEpisode = useMutation({
    mutationFn: (title: string) =>
      api.createEpisode({ title, style: "podcast" }),
    onSuccess: (ep) => {
      qc.invalidateQueries({ queryKey: ["episodes"] });
      navigate(`/episodes/${encodeURIComponent(ep.name)}`);
    },
  });

  const [createOpen, setCreateOpen] = useState(false);

  // --- Search / lọc ngày / phân trang (client-side) ---
  const [q, setQ] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);

  const all = data?.episodes ?? [];
  const total = all.length;
  const hasFilter = q.trim() !== "" || dateFrom !== "" || dateTo !== "";

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const fromMs = dateFrom ? new Date(`${dateFrom}T00:00:00`).getTime() : null;
    const toMs = dateTo ? new Date(`${dateTo}T23:59:59.999`).getTime() : null;
    return all.filter((ep) => {
      if (needle) {
        const hay = `${ep.config.title ?? ""} ${ep.config.hook ?? ""} ${ep.name}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      if (fromMs !== null && ep.mtimeMs < fromMs) return false;
      if (toMs !== null && ep.mtimeMs > toMs) return false;
      return true;
    });
  }, [all, q, dateFrom, dateTo]);

  // Reset về trang 1 khi bộ lọc đổi
  useEffect(() => {
    setPage(1);
  }, [q, dateFrom, dateTo]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageItems = filtered.slice(
    (safePage - 1) * PAGE_SIZE,
    safePage * PAGE_SIZE,
  );

  const clearFilters = () => {
    setQ("");
    setDateFrom("");
    setDateTo("");
  };

  return (
    <div className="min-h-screen relative">
      <div className="container max-w-5xl py-10">
        <header className="mb-6 flex items-center justify-between gap-6">
          <div>
            <h1 className="text-3xl font-serif tracking-tight">Danh sách tập</h1>
            <p className="mt-1 text-muted-foreground text-sm">
              {data
                ? hasFilter
                  ? `Hiển thị ${filtered.length} / ${total} tập`
                  : `${total} tập`
                : "Đang tải…"}
              {" · "}
              Tạo tập mới rồi upload audio (hoặc gen TTS) trong trang chi tiết
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              onClick={() => setCreateOpen(true)}
              disabled={createEpisode.isPending}
            >
              <Plus className="size-4" />
              Tạo tập mới
            </Button>
          </div>
        </header>

        {/* Thanh tìm kiếm + lọc ngày */}
        {data && total > 0 && (
          <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:flex-wrap">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Tìm theo tên tập / hook…"
                className="pl-9 pr-9"
              />
              {q && (
                <button
                  onClick={() => setQ("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-secondary"
                  title="Xoá tìm kiếm"
                >
                  <X className="size-4 text-muted-foreground" />
                </button>
              )}
            </div>
            <div className="flex items-end gap-2">
              <div>
                <label className="block text-xs text-muted-foreground mb-1">
                  Từ ngày
                </label>
                <input
                  type="date"
                  value={dateFrom}
                  max={dateTo || undefined}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="h-10 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">
                  Đến ngày
                </label>
                <input
                  type="date"
                  value={dateTo}
                  min={dateFrom || undefined}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="h-10 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>
              {hasFilter && (
                <Button variant="ghost" size="sm" onClick={clearFilters}>
                  <X className="size-4" />
                  Xoá lọc
                </Button>
              )}
            </div>
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

        {data && total === 0 && (
          <Card className="border-dashed p-12 text-center">
            <FileAudio2 className="mx-auto mb-4 size-12 text-muted-foreground" />
            <h2 className="mb-2 text-xl font-serif">Chưa có tập nào</h2>
            <p className="text-muted-foreground">
              Bấm <strong>"Tạo tập mới"</strong> ở góc trên — nhập title rồi
              vào trang chi tiết để upload audio hoặc gen TTS từ kịch bản.
            </p>
          </Card>
        )}

        {data && total > 0 && filtered.length === 0 && (
          <Card className="border-dashed p-12 text-center">
            <Search className="mx-auto mb-4 size-12 text-muted-foreground" />
            <h2 className="mb-2 text-xl font-serif">Không có tập nào khớp bộ lọc</h2>
            <p className="text-muted-foreground mb-4">
              Thử đổi từ khoá hoặc khoảng ngày.
            </p>
            <Button variant="outline" size="sm" onClick={clearFilters}>
              <X className="size-4" />
              Xoá lọc
            </Button>
          </Card>
        )}

        {data && pageItems.length > 0 && (
          <>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {pageItems.map((ep) => (
                <EpisodeCard key={ep.name} ep={ep} />
              ))}
            </div>

            {totalPages > 1 && (
              <div className="mt-8 flex items-center justify-center gap-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={safePage <= 1}
                >
                  <ChevronLeft className="size-4" />
                  Trước
                </Button>
                <span className="text-sm text-muted-foreground tabular-nums">
                  Trang {safePage} / {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={safePage >= totalPages}
                >
                  Sau
                  <ChevronRight className="size-4" />
                </Button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Create-empty-episode modal */}
      {createOpen && (
        <CreateEpisodeDialog
          onCancel={() => setCreateOpen(false)}
          onCreate={(title) => createEpisode.mutate(title)}
          pending={createEpisode.isPending}
          error={createEpisode.isError ? String(createEpisode.error) : null}
        />
      )}
    </div>
  );
}

function CreateEpisodeDialog({
  onCancel,
  onCreate,
  pending,
  error,
}: {
  onCancel: () => void;
  onCreate: (title: string) => void;
  pending: boolean;
  error: string | null;
}) {
  const [title, setTitle] = useState("");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
      <Card className="w-full max-w-md p-0 overflow-hidden">
        <div className="px-5 py-3 border-b bg-secondary/30 flex items-center gap-2">
          <Plus className="size-4 text-accent" />
          <span className="font-medium">Tạo tập mới</span>
          <button
            onClick={onCancel}
            disabled={pending}
            className="ml-auto p-1 rounded hover:bg-secondary disabled:opacity-50"
            title="Đóng"
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="px-5 py-5 space-y-3">
          <p className="text-xs text-muted-foreground leading-relaxed">
            Tạo episode trống (chưa cần audio). Sau đó vào tab{" "}
            <strong>Kịch bản</strong> để gen script + audio TTS từ essay /
            brainstorm / tài liệu của bạn.
          </p>
          <div>
            <label className="block text-sm font-medium mb-1.5">
              Tên tập <span className="text-destructive">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
              placeholder="VD: Mù loà trước giá trị hiện tại"
              disabled={pending}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onKeyDown={(e) => {
                if (e.key === "Enter" && title.trim()) onCreate(title.trim());
                if (e.key === "Escape") onCancel();
              }}
            />
            <p className="mt-1 text-[10px] text-muted-foreground">
              Sẽ slugify thành tên file (vd "mu-loa-truoc-gia-tri-hien-tai")
            </p>
          </div>
          {error && (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive flex items-start gap-2">
              <AlertCircle className="size-3.5 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>
        <div className="px-5 py-3 border-t flex items-center justify-end gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={onCancel}
            disabled={pending}
          >
            Huỷ
          </Button>
          <Button
            size="sm"
            onClick={() => title.trim() && onCreate(title.trim())}
            disabled={pending || !title.trim()}
          >
            {pending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Plus className="size-4" />
            )}
            Tạo tập
          </Button>
        </div>
      </Card>
    </div>
  );
}

function EpisodeCard({ ep }: { ep: EpisodeSummary }) {
  const qc = useQueryClient();
  const title = ep.config.title || ep.name;

  const deleteEpisode = useMutation({
    mutationFn: () => api.deleteEpisode(ep.name),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["episodes"] });
    },
  });

  const handleDelete = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (deleteEpisode.isPending) return;
    if (
      confirm(
        `Xoá tập "${title}"?\n\nXoá toàn bộ audio, cover, script, transcript và video đã render. Không hoàn tác được.`,
      )
    ) {
      deleteEpisode.mutate();
    }
  };

  return (
    <Link
      to={`/episodes/${encodeURIComponent(ep.name)}`}
      className="group block focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-lg"
    >
      <Card className="relative flex flex-col p-5 h-full transition-colors hover:bg-secondary/40 hover:border-primary/40 cursor-pointer">
        <div className="mb-3 flex items-start justify-between gap-2">
          <h3 className="font-serif text-lg leading-tight line-clamp-2">
            {title}
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
          <button
            onClick={handleDelete}
            disabled={deleteEpisode.isPending}
            title="Xoá tập"
            className="ml-auto p-1.5 rounded text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100 disabled:opacity-50"
          >
            {deleteEpisode.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Trash2 className="size-4" />
            )}
          </button>
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
