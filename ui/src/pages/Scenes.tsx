import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Film,
  Search,
  Sparkles,
  Image as ImageIcon,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { api, type SceneCatalogEntry } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const CATEGORY_LABEL: Record<SceneCatalogEntry["category"], string> = {
  default: "Mặc định",
  broadcast: "Broadcast",
  dialogue: "Đối thoại",
  reflection: "Suy ngẫm",
  calm: "Bình yên",
  emotion: "Cảm xúc",
  social: "Xã hội",
  thought: "Suy nghĩ",
  wisdom: "Tri thức",
  giving: "Cho đi",
  transformation: "Chuyển hóa",
};

const CATEGORY_ORDER: SceneCatalogEntry["category"][] = [
  "default",
  "broadcast",
  "dialogue",
  "reflection",
  "calm",
  "emotion",
  "social",
  "thought",
  "wisdom",
  "giving",
  "transformation",
];

const MOOD_COLOR: Record<string, string> = {
  positive: "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-500/40",
  social: "bg-pink-500/10 text-pink-700 dark:text-pink-400 border-pink-500/40",
  healing: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/40",
  energetic: "bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-500/40",
  contemplative: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/40",
};

export function ScenesPage() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["scene-catalog"],
    queryFn: () => api.getSceneCatalog(),
    staleTime: 30_000,
  });

  const regenMut = useMutation({
    mutationFn: () => api.regenerateSceneThumbs(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["scene-catalog"] }),
  });

  const [search, setSearch] = useState("");
  const [activeCat, setActiveCat] = useState<SceneCatalogEntry["category"] | null>(null);

  const scenes = q.data?.scenes ?? [];
  const totalUsage = q.data?.totalUsage ?? 0;
  const thumbsGenerated = q.data?.thumbsGenerated ?? 0;
  const allThumbsReady = thumbsGenerated === scenes.length && scenes.length > 0;

  const filtered = useMemo(() => {
    let list = scenes;
    if (activeCat) list = list.filter((s) => s.category === activeCat);
    if (search) {
      const needle = search.toLowerCase();
      list = list.filter((s) => {
        const hay = [
          s.label,
          s.key,
          s.description,
          ...s.keywords,
          ...s.stickers,
        ]
          .join(" ")
          .toLowerCase();
        return hay.includes(needle);
      });
    }
    return list;
  }, [scenes, search, activeCat]);

  // Group by category for display
  const grouped = useMemo(() => {
    const m = new Map<SceneCatalogEntry["category"], SceneCatalogEntry[]>();
    for (const cat of CATEGORY_ORDER) m.set(cat, []);
    for (const s of filtered) m.get(s.category)?.push(s);
    return m;
  }, [filtered]);

  // Stats by category (uses unfiltered scenes for accurate counts)
  const catCounts = useMemo(() => {
    const m: Partial<Record<SceneCatalogEntry["category"], number>> = {};
    for (const s of scenes) m[s.category] = (m[s.category] ?? 0) + 1;
    return m;
  }, [scenes]);

  return (
    <div className="container max-w-6xl py-10">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-3xl font-serif tracking-tight flex items-center gap-3">
            <Film className="size-7 text-accent" />
            Quản lý Scene
          </h1>
          <p className="mt-1 text-muted-foreground text-sm">
            {scenes.length} scene template — dùng{" "}
            {totalUsage.toLocaleString("vi-VN")} lần trong các plan đã render.
            Preview: {thumbsGenerated}/{scenes.length} thumb đã render.
          </p>
        </div>
        <Button
          variant={allThumbsReady ? "outline" : "default"}
          size="sm"
          onClick={() => {
            if (
              !allThumbsReady ||
              window.confirm(
                "Render lại thumbnails cho tất cả 17 scene? Cost ~25s (bundle Remotion + renderStill ×17).",
              )
            )
              regenMut.mutate();
          }}
          disabled={regenMut.isPending}
          className="shrink-0"
        >
          {regenMut.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : allThumbsReady ? (
            <RefreshCw className="size-4" />
          ) : (
            <ImageIcon className="size-4" />
          )}
          {regenMut.isPending
            ? "Đang render…"
            : allThumbsReady
              ? "Render lại preview"
              : "Tạo preview"}
        </Button>
      </header>

      {regenMut.isError && (
        <Card className="mb-4 p-3 border-destructive/40 bg-destructive/5 text-sm text-destructive">
          Lỗi render thumbnails: {String(regenMut.error)}
        </Card>
      )}
      {regenMut.isPending && (
        <Card className="mb-4 p-3 border-amber-500/40 bg-amber-500/5 text-sm">
          <div className="flex items-center gap-2">
            <Loader2 className="size-4 animate-spin text-amber-600 shrink-0" />
            <span className="text-muted-foreground">
              Đang bundle Remotion + render still 17 lần (~25s). Đừng đóng tab.
            </span>
          </div>
        </Card>
      )}

      <div className="mb-6 space-y-3">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            data-search
            placeholder="Tìm scene / keyword / sticker…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <CategoryChip
            label="Tất cả"
            count={scenes.length}
            active={activeCat === null}
            onClick={() => setActiveCat(null)}
          />
          {CATEGORY_ORDER.map((cat) => (
            <CategoryChip
              key={cat}
              label={CATEGORY_LABEL[cat]}
              count={catCounts[cat] ?? 0}
              active={activeCat === cat}
              onClick={() => setActiveCat(activeCat === cat ? null : cat)}
            />
          ))}
        </div>
      </div>

      {q.isLoading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className="h-56 animate-pulse bg-muted/30" />
          ))}
        </div>
      )}

      {q.isError && (
        <Card className="p-6 border-destructive/40 bg-destructive/5 text-sm text-destructive">
          Lỗi tải catalog: {String(q.error)}
        </Card>
      )}

      {!q.isLoading && filtered.length === 0 && (
        <Card className="p-12 text-center border-dashed">
          <Film className="mx-auto mb-3 size-10 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Không scene nào match{search ? ` "${search}"` : ""}.
          </p>
        </Card>
      )}

      <div className="space-y-8">
        {CATEGORY_ORDER.map((cat) => {
          const items = grouped.get(cat) ?? [];
          if (items.length === 0) return null;
          return (
            <section key={cat}>
              <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground mb-3">
                {CATEGORY_LABEL[cat]} · {items.length}
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {items.map((s) => (
                  <SceneCard key={s.key} scene={s} />
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function CategoryChip({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "h-8 px-3 rounded-md border text-sm font-medium transition-colors inline-flex items-center gap-1.5",
        active
          ? "border-accent bg-accent/20 text-foreground"
          : "border-input hover:bg-secondary text-muted-foreground",
      )}
    >
      {label}
      <span
        className={cn(
          "text-xs tabular-nums",
          active ? "text-foreground/70" : "text-muted-foreground/60",
        )}
      >
        {count}
      </span>
    </button>
  );
}

function SceneCard({ scene }: { scene: SceneCatalogEntry }) {
  return (
    <Card className="p-0 overflow-hidden flex flex-col hover:border-accent/40 transition-colors">
      {/* Thumbnail preview 9:16 — tỉ lệ thật của video */}
      <div className="relative bg-secondary/40 border-b">
        <div className="relative" style={{ paddingBottom: "177.78%" }}>
          {scene.thumbUrl ? (
            <img
              src={scene.thumbUrl}
              alt={`${scene.label} preview`}
              loading="lazy"
              className="absolute inset-0 w-full h-full object-cover"
            />
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-muted-foreground/60">
              <ImageIcon className="size-8" />
              <span className="text-xs">Chưa có preview</span>
            </div>
          )}
          {scene.usageCount > 0 && (
            <Badge
              variant="accent"
              className="absolute top-2 right-2 tabular-nums shadow-md"
            >
              {scene.usageCount}× dùng
            </Badge>
          )}
        </div>
      </div>

      <div className="p-4 flex flex-col gap-3">
        <div>
          <h3 className="font-medium text-base flex items-center gap-2">
            <Sparkles className="size-3.5 text-accent shrink-0" />
            <span className="truncate">{scene.label}</span>
          </h3>
          <code className="text-[10px] font-mono text-muted-foreground">
            {scene.key}
          </code>
        </div>

      <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3">
        {scene.description}
      </p>

      <div>
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
          Stickers
        </div>
        <div className="flex flex-wrap gap-1">
          {scene.stickers.map((st) => (
            <Badge key={st} variant="outline" className="text-[10px] font-mono">
              {st}
            </Badge>
          ))}
          {scene.doodles.map((d) => (
            <Badge
              key={d}
              variant="outline"
              className="text-[10px] font-mono opacity-60"
            >
              {d}
            </Badge>
          ))}
        </div>
      </div>

      {scene.keywords.length > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
            Keywords auto-match
          </div>
          <div className="flex flex-wrap gap-1">
            {scene.keywords.slice(0, 6).map((k) => (
              <Badge key={k} variant="secondary" className="text-[10px]">
                {k}
              </Badge>
            ))}
            {scene.keywords.length > 6 && (
              <Badge
                variant="secondary"
                className="text-[10px] text-muted-foreground"
              >
                +{scene.keywords.length - 6}
              </Badge>
            )}
          </div>
        </div>
      )}

      <div>
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
          Mood hợp
        </div>
        <div className="flex flex-wrap gap-1">
          {scene.suggestedMoods.map((m) => (
            <Badge
              key={m}
              variant="outline"
              className={cn(
                "text-[10px] capitalize",
                MOOD_COLOR[m] ?? "",
              )}
            >
              {m}
            </Badge>
          ))}
        </div>
      </div>
      </div>
    </Card>
  );
}
