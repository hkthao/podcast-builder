import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Search,
  Image as ImageIcon,
  Video,
  Music,
  Sparkles,
  Loader2,
  ExternalLink,
  Star,
  Trash2,
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
  ShieldAlert,
  ShieldX,
  Compass,
} from "lucide-react";
import {
  api,
  type AssetKind,
  type AssetResult,
  type LicenseStatus,
  type SavedAsset,
} from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Tab = "search" | "library";

const KIND_META: Record<AssetKind, { label: string; icon: React.ReactNode }> = {
  image: { label: "Ảnh", icon: <ImageIcon className="size-4" /> },
  video: { label: "Video", icon: <Video className="size-4" /> },
  audio: { label: "Nhạc", icon: <Music className="size-4" /> },
};

const LICENSE_META: Record<
  LicenseStatus,
  {
    label: string;
    color: string;
    icon: React.ReactNode;
    tooltip: string;
  }
> = {
  safe: {
    label: "Safe",
    color: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
    icon: <ShieldCheck className="size-3" />,
    tooltip: "Public domain / open license — render thoải mái",
  },
  check: {
    label: "Check",
    color: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400",
    icon: <ShieldAlert className="size-3" />,
    tooltip: "Cần đọc kỹ license + tick xác nhận trước render (vd CC BY cần credit)",
  },
  blocked: {
    label: "Blocked",
    color: "border-destructive/40 bg-destructive/10 text-destructive",
    icon: <ShieldX className="size-3" />,
    tooltip: "Cấm render — chỉ giữ trong library cho audit",
  },
};

export function ResearchPage() {
  const [tab, setTab] = useState<Tab>("search");
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<AssetKind>("image");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [submittedKind, setSubmittedKind] = useState<AssetKind>("image");
  const [selectedProviders, setSelectedProviders] = useState<Set<string>>(
    new Set(),
  );

  const providersQ = useQuery({
    queryKey: ["research-providers"],
    queryFn: () => api.listResearchProviders(),
    staleTime: Infinity,
  });
  const providers = providersQ.data?.providers ?? [];
  const enabledProviders = useMemo(
    () => providers.filter((p) => p.enabled),
    [providers],
  );
  const providersForKind = useMemo(
    () => enabledProviders.filter((p) => p.kinds.includes(submittedKind)),
    [enabledProviders, submittedKind],
  );

  const searchQ = useQuery({
    queryKey: [
      "research-search",
      submittedQuery,
      submittedKind,
      [...selectedProviders].sort().join(","),
    ],
    queryFn: () =>
      api.searchResearch({
        q: submittedQuery,
        kind: submittedKind,
        providers:
          selectedProviders.size > 0 ? [...selectedProviders] : undefined,
        pageSize: 20,
      }),
    enabled: submittedQuery.length > 0,
    staleTime: 5 * 60_000,
  });

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    setSubmittedQuery(query.trim());
    setSubmittedKind(kind);
  };

  return (
    <div className="container max-w-7xl py-10">
      <header className="mb-6">
        <h1 className="text-3xl font-serif tracking-tight flex items-center gap-3">
          <Compass className="size-7 text-accent" />
          Research panel
        </h1>
        <p className="mt-1 text-muted-foreground text-sm">
          Tìm ảnh/clip/nhạc từ nguồn an toàn (Wikimedia, Met...) cho phong cách
          gallery documentary. Link-only — manifest lưu URL, render khi cần.
        </p>
      </header>

      {/* Tabs */}
      <div className="mb-6 flex gap-1 border-b">
        <TabButton
          active={tab === "search"}
          onClick={() => setTab("search")}
          icon={<Search className="size-4" />}
          label="Tìm kiếm"
        />
        <TabButton
          active={tab === "library"}
          onClick={() => setTab("library")}
          icon={<Star className="size-4" />}
          label="Library"
        />
      </div>

      {tab === "search" && (
        <>
          <form onSubmit={onSubmit} className="mb-4 space-y-3">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                <Input
                  data-search
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder='Tìm asset… vd "Giotto Lamentation"'
                  className="pl-10"
                />
              </div>
              <Button
                type="submit"
                variant="outline"
                disabled={!query.trim() || searchQ.isFetching}
              >
                {searchQ.isFetching ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Search className="size-4" />
                )}
                Tìm
              </Button>
            </div>

            <div className="flex flex-wrap gap-2 items-center">
              <span className="text-xs text-muted-foreground uppercase tracking-wider">
                Loại:
              </span>
              {(["image", "video", "audio"] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setKind(k)}
                  className={cn(
                    "h-10 px-3 rounded-md border text-sm inline-flex items-center gap-1.5 transition-colors",
                    kind === k
                      ? "border-accent bg-accent/20 text-foreground"
                      : "border-input hover:bg-secondary text-muted-foreground",
                  )}
                >
                  {KIND_META[k].icon}
                  {KIND_META[k].label}
                </button>
              ))}

              <span className="text-xs text-muted-foreground uppercase tracking-wider ml-4">
                Provider:
              </span>
              {enabledProviders.map((p) => {
                const supportsKind = p.kinds.includes(kind);
                const active = selectedProviders.has(p.id);
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      const next = new Set(selectedProviders);
                      if (next.has(p.id)) next.delete(p.id);
                      else next.add(p.id);
                      setSelectedProviders(next);
                    }}
                    disabled={!supportsKind}
                    title={p.note}
                    className={cn(
                      "h-10 px-3 rounded-md border text-sm transition-colors",
                      !supportsKind && "opacity-30 cursor-not-allowed",
                      active && supportsKind
                        ? "border-accent bg-accent/20 text-foreground"
                        : "border-input hover:bg-secondary text-muted-foreground",
                    )}
                  >
                    {p.label}
                  </button>
                );
              })}
              {selectedProviders.size === 0 && (
                <span className="text-xs text-muted-foreground italic">
                  (default: tất cả provider hỗ trợ {KIND_META[kind].label})
                </span>
              )}
            </div>
          </form>

          {searchQ.isError && (
            <Card className="p-3 mb-4 border-destructive/40 bg-destructive/5 text-sm text-destructive flex items-start gap-2">
              <AlertCircle className="size-4 mt-0.5 shrink-0" />
              <span>Lỗi search: {String(searchQ.error)}</span>
            </Card>
          )}

          {searchQ.data?.perProvider && (
            <div className="mb-4 flex flex-wrap gap-1.5 text-xs text-muted-foreground">
              {Object.entries(searchQ.data.perProvider).map(([id, info]) => (
                <Badge
                  key={id}
                  variant="outline"
                  className={cn(
                    "gap-1",
                    info.error && "border-destructive/40 text-destructive",
                  )}
                >
                  {id}: {info.error ? "lỗi" : `${info.count} kết quả`}
                </Badge>
              ))}
            </div>
          )}

          {submittedQuery && searchQ.data?.results.length === 0 && !searchQ.isFetching && (
            <Card className="p-10 text-center border-dashed">
              <Compass className="mx-auto mb-3 size-10 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Không tìm thấy kết quả cho "{submittedQuery}" với loại {KIND_META[submittedKind].label}.
                Thử query khác hoặc đổi provider.
              </p>
            </Card>
          )}

          {searchQ.data?.results && searchQ.data.results.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {searchQ.data.results.map((r) => (
                <SearchResultCard key={r.id} result={r} />
              ))}
            </div>
          )}

          {!submittedQuery && providersForKind.length === 0 && providersQ.data && (
            <Card className="p-10 text-center border-dashed">
              <AlertCircle className="mx-auto mb-3 size-10 text-amber-500" />
              <p className="text-sm">
                Chưa có provider nào hỗ trợ {KIND_META[kind].label} (hoặc thiếu
                API key trong <code>.env</code>).
              </p>
            </Card>
          )}
        </>
      )}

      {tab === "library" && <LibraryPanel />}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
        active
          ? "border-primary text-foreground"
          : "border-transparent text-muted-foreground hover:text-foreground",
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function SearchResultCard({ result }: { result: AssetResult }) {
  const qc = useQueryClient();
  const [saved, setSaved] = useState(false);
  const saveMut = useMutation({
    mutationFn: () => api.saveResearchAsset(result),
    onSuccess: () => {
      setSaved(true);
      qc.invalidateQueries({ queryKey: ["research-library"] });
    },
  });
  const license = LICENSE_META[result.licenseStatus];

  return (
    <Card className="p-0 overflow-hidden flex flex-col hover:border-accent/40 transition-colors">
      <div
        className="relative bg-secondary/40"
        style={{ aspectRatio: "4/3" }}
      >
        <img
          src={result.thumbUrl}
          alt={result.title}
          loading="lazy"
          className="absolute inset-0 w-full h-full object-cover"
        />
        <Badge
          variant="outline"
          className={cn(
            "absolute top-2 left-2 text-[10px] gap-1 shadow-md",
            license.color,
          )}
          title={license.tooltip}
        >
          {license.icon}
          {license.label}
        </Badge>
        <Badge
          variant="outline"
          className="absolute top-2 right-2 text-[10px] bg-background/80 shadow-md"
        >
          {result.provider}
        </Badge>
      </div>
      <div className="p-3 flex flex-col gap-1.5 flex-1">
        <p className="font-medium text-sm leading-tight line-clamp-2">
          {result.title}
        </p>
        <p className="text-xs text-muted-foreground line-clamp-1">
          {result.author && <span>{result.author}</span>}
          {result.author && result.year && <span> · </span>}
          {result.year && <span>{result.year}</span>}
        </p>
        {(result.width || result.durationMs) && (
          <p className="text-[10px] text-muted-foreground font-mono">
            {result.width && result.height && `${result.width}×${result.height}`}
            {result.durationMs &&
              ` · ${Math.round(result.durationMs / 1000)}s`}
          </p>
        )}
        <p className="text-[10px] text-muted-foreground line-clamp-1 mt-auto">
          {result.license}
        </p>
      </div>
      <div className="px-3 py-2 border-t flex items-center justify-end gap-1.5">
        <Button variant="outline" size="sm" asChild>
          <a href={result.sourcePage} target="_blank" rel="noreferrer">
            <ExternalLink className="size-3" />
            Xem
          </a>
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => saveMut.mutate()}
          disabled={saveMut.isPending || saved}
        >
          {saveMut.isPending ? (
            <Loader2 className="size-3 animate-spin" />
          ) : saved ? (
            <CheckCircle2 className="size-3 text-accent" />
          ) : (
            <Star className="size-3" />
          )}
          {saved ? "Đã lưu" : "Lưu"}
        </Button>
      </div>
    </Card>
  );
}

function LibraryPanel() {
  const qc = useQueryClient();
  const [libFilter, setLibFilter] = useState<AssetKind | "all">("all");
  const [libQuery, setLibQuery] = useState("");

  const libraryQ = useQuery({
    queryKey: ["research-library", libFilter, libQuery],
    queryFn: () =>
      api.listResearchLibrary({
        kind: libFilter === "all" ? undefined : libFilter,
        q: libQuery || undefined,
      }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.deleteResearchAsset(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["research-library"] }),
  });
  const pinMut = useMutation({
    mutationFn: (id: string) => api.toggleResearchAssetPin(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["research-library"] }),
  });

  const assets = libraryQ.data?.assets ?? [];

  return (
    <>
      <div className="mb-4 flex flex-wrap gap-2 items-center">
        <div className="relative max-w-md flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            value={libQuery}
            onChange={(e) => setLibQuery(e.target.value)}
            placeholder="Tìm trong library…"
            className="pl-10"
          />
        </div>
        {(["all", "image", "video", "audio"] as const).map((k) => (
          <button
            key={k}
            onClick={() => setLibFilter(k)}
            className={cn(
              "h-10 px-3 rounded-md border text-sm inline-flex items-center gap-1.5 transition-colors",
              libFilter === k
                ? "border-accent bg-accent/20 text-foreground"
                : "border-input hover:bg-secondary text-muted-foreground",
            )}
          >
            {k !== "all" && KIND_META[k].icon}
            {k === "all" ? "Tất cả" : KIND_META[k].label}
          </button>
        ))}
        <span className="ml-auto text-xs text-muted-foreground">
          {assets.length} asset
        </span>
      </div>

      {libraryQ.isLoading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="h-72 animate-pulse bg-muted/30" />
          ))}
        </div>
      )}

      {assets.length === 0 && !libraryQ.isLoading && (
        <Card className="p-10 text-center border-dashed">
          <Star className="mx-auto mb-3 size-10 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Library trống. Sang tab <strong>Tìm kiếm</strong> để thêm asset.
          </p>
        </Card>
      )}

      {assets.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {assets.map((a) => (
            <LibraryAssetCard
              key={a.id}
              asset={a}
              onDelete={() => {
                if (window.confirm(`Xoá "${a.title}" khỏi library?`))
                  deleteMut.mutate(a.id);
              }}
              onTogglePin={() => pinMut.mutate(a.id)}
            />
          ))}
        </div>
      )}
    </>
  );
}

function LibraryAssetCard({
  asset,
  onDelete,
  onTogglePin,
}: {
  asset: SavedAsset;
  onDelete: () => void;
  onTogglePin: () => void;
}) {
  const license = LICENSE_META[asset.licenseStatus];
  return (
    <Card className="p-0 overflow-hidden flex flex-col">
      <div
        className="relative bg-secondary/40"
        style={{ aspectRatio: "4/3" }}
      >
        <img
          src={asset.thumbUrl}
          alt={asset.title}
          loading="lazy"
          className="absolute inset-0 w-full h-full object-cover"
        />
        <Badge
          variant="outline"
          className={cn(
            "absolute top-2 left-2 text-[10px] gap-1 shadow-md",
            license.color,
          )}
        >
          {license.icon}
          {license.label}
        </Badge>
        {asset.pinned && (
          <Badge variant="accent" className="absolute top-2 right-2 shadow-md gap-1">
            <Star className="size-3 fill-current" />
            pin
          </Badge>
        )}
      </div>
      <div className="p-3 flex flex-col gap-1.5 flex-1">
        <p className="font-medium text-sm leading-tight line-clamp-2">
          {asset.title}
        </p>
        <p className="text-xs text-muted-foreground line-clamp-1">
          {asset.provider}
          {asset.author && ` · ${asset.author}`}
        </p>
        {asset.usedInEpisodes.length > 0 && (
          <Badge variant="secondary" className="text-[10px] self-start">
            Dùng ở {asset.usedInEpisodes.length} episode
          </Badge>
        )}
        {asset.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {asset.tags.slice(0, 3).map((t) => (
              <Badge key={t} variant="outline" className="text-[10px]">
                #{t}
              </Badge>
            ))}
          </div>
        )}
      </div>
      <div className="px-3 py-2 border-t flex items-center justify-end gap-1.5">
        <Button variant="outline" size="sm" asChild>
          <a href={asset.sourcePage} target="_blank" rel="noreferrer">
            <ExternalLink className="size-3" />
          </a>
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={onTogglePin}
          title={asset.pinned ? "Bỏ pin" : "Pin (không evict cache)"}
        >
          <Star
            className={cn(
              "size-3",
              asset.pinned && "fill-amber-500 text-amber-500",
            )}
          />
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
          onClick={onDelete}
        >
          <Trash2 className="size-3" />
        </Button>
      </div>
    </Card>
  );
}

// Suppress unused warning if Sparkles ever needed
void Sparkles;
