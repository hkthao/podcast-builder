import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  ImageIcon,
  Search,
  Copy,
  Check,
} from "lucide-react";
import { api, type VisualEntry } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function VisualPage() {
  const q = useQuery({
    queryKey: ["visual-library"],
    queryFn: () => api.getVisualLibrary(),
    staleTime: 30_000,
  });
  const [search, setSearch] = useState("");
  const [activeCat, setActiveCat] = useState<string | null>(null);

  const byCategory = q.data?.byCategory ?? {};
  const uncategorized = q.data?.uncategorized ?? [];
  const total = q.data?.total ?? 0;

  const allCats = Object.keys(byCategory).sort();

  // Apply search + category filter
  const filterEntries = (entries: VisualEntry[]): VisualEntry[] => {
    return entries.filter((e) => {
      if (search) {
        const needle = search.toLowerCase();
        const hay = `${e.metaphor} ${e.sessionTopic}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  };

  const visibleCats = activeCat
    ? allCats.filter((c) => c === activeCat)
    : allCats;

  return (
    <div className="container max-w-6xl py-10">
      <header className="mb-6">
        <h1 className="text-3xl font-serif tracking-tight flex items-center gap-3">
          <ImageIcon className="size-7 text-accent" />
          Thư viện hình ảnh
        </h1>
        <p className="mt-1 text-muted-foreground text-sm">
          {total} ẩn dụ hình ảnh đã có. Tái dùng cho thumbnail / AI gen
          ảnh thay vì nghĩ lại từ đầu mỗi tập.
        </p>
      </header>

      <div className="mb-6 space-y-3">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            data-search
            placeholder="Tìm metaphor / topic…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setActiveCat(null)}
            className={cn(
              "h-8 px-3 rounded-md border text-sm font-medium transition-colors",
              activeCat === null
                ? "border-accent bg-accent/20 text-foreground"
                : "border-input hover:bg-secondary text-muted-foreground",
            )}
          >
            All
          </button>
          {allCats.map((c) => (
            <button
              key={c}
              onClick={() => setActiveCat(activeCat === c ? null : c)}
              className={cn(
                "h-8 px-3 rounded-md border text-sm font-medium transition-colors inline-flex items-center gap-1.5",
                activeCat === c
                  ? "border-accent bg-accent/20 text-foreground"
                  : "border-input hover:bg-secondary text-muted-foreground",
              )}
            >
              #{c}
              <span
                className={cn(
                  "text-xs tabular-nums",
                  activeCat === c
                    ? "text-foreground/70"
                    : "text-muted-foreground/70",
                )}
              >
                {byCategory[c].length}
              </span>
            </button>
          ))}
        </div>
      </div>

      {q.isLoading ? (
        <Card className="h-64 animate-pulse bg-muted/30" />
      ) : total === 0 ? (
        <Card className="p-12 text-center border-dashed">
          <ImageIcon className="mx-auto mb-3 size-10 text-muted-foreground" />
          <p className="font-medium">Chưa có visual metaphor nào</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Brainstorm session sẽ tự gen visual metaphor ở mục 12 của
            outline, hiện ra đây sau.
          </p>
        </Card>
      ) : (
        <div className="space-y-6">
          {visibleCats.map((cat) => {
            const entries = filterEntries(byCategory[cat]);
            if (entries.length === 0) return null;
            return (
              <CategorySection key={cat} cat={cat} entries={entries} />
            );
          })}
          {!activeCat && uncategorized.length > 0 && (
            <CategorySection
              cat="(Uncategorized)"
              entries={filterEntries(uncategorized)}
            />
          )}
        </div>
      )}
    </div>
  );
}

function CategorySection({
  cat,
  entries,
}: {
  cat: string;
  entries: VisualEntry[];
}) {
  if (entries.length === 0) return null;
  return (
    <Card className="p-0 overflow-hidden">
      <div className="px-6 py-3 border-b bg-secondary/30 flex items-center gap-2">
        <h2 className="font-medium">#{cat}</h2>
        <span className="ml-auto text-xs text-muted-foreground">
          {entries.length} metaphor
        </span>
      </div>
      <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {entries.map((e, idx) => (
          <MetaphorCard key={`${e.sessionId}-${idx}`} entry={e} />
        ))}
      </div>
    </Card>
  );
}

function MetaphorCard({ entry }: { entry: VisualEntry }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="rounded border bg-background p-3 flex flex-col gap-2 group hover:border-accent/60 transition-colors">
      <p className="text-sm leading-relaxed flex-1">{entry.metaphor}</p>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Link
          to="/brainstorm"
          state={{ jumpToSessionId: entry.sessionId }}
          className="truncate hover:text-accent hover:underline flex-1"
          title={entry.sessionTopic}
        >
          ← {entry.sessionTopic}
        </Link>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-2 opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(entry.metaphor);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            } catch {
              /* clipboard denied */
            }
          }}
        >
          {copied ? (
            <Check className="size-3" />
          ) : (
            <Copy className="size-3" />
          )}
        </Button>
      </div>
      {entry.categories.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {entry.categories.map((c) => (
            <Badge
              key={c}
              variant="outline"
              className="text-[10px] font-normal h-4 px-1"
            >
              {c}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
