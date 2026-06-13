import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  Network,
  Search,
  ChevronDown,
  ChevronRight,
  Sparkles,
} from "lucide-react";
import { api, type KnowledgeEntry } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

const GROUP_ORDER = [
  "Philosophy",
  "Psychology",
  "Neuroscience",
  "Sociology",
  "AI",
  "Work",
];

const GROUP_LABELS: Record<string, string> = {
  Philosophy: "Triết học",
  Psychology: "Tâm lý học",
  Neuroscience: "Khoa học thần kinh",
  Sociology: "Xã hội học",
  AI: "AI / Công nghệ",
  Work: "Tác phẩm kinh điển",
};

export function KnowledgePage() {
  const q = useQuery({
    queryKey: ["knowledge-graph"],
    queryFn: () => api.getKnowledgeGraph(),
    staleTime: 30_000,
  });
  const [search, setSearch] = useState("");

  const groups = q.data?.groups ?? {};
  const total = q.data?.total ?? 0;

  // Filter entries theo search
  const filteredGroups: Record<string, KnowledgeEntry[]> = {};
  for (const [groupName, entries] of Object.entries(groups)) {
    const filtered = search
      ? entries.filter(
          (e) =>
            e.name.toLowerCase().includes(search.toLowerCase()) ||
            e.sessions.some((s) =>
              s.topic.toLowerCase().includes(search.toLowerCase()),
            ),
        )
      : entries;
    if (filtered.length > 0) filteredGroups[groupName] = filtered;
  }

  const orderedKeys = [
    ...GROUP_ORDER.filter((k) => filteredGroups[k]),
    ...Object.keys(filteredGroups).filter((k) => !GROUP_ORDER.includes(k)),
  ];

  return (
    <div className="container max-w-6xl py-10">
      <header className="mb-6">
        <h1 className="text-3xl font-serif tracking-tight flex items-center gap-3">
          <Network className="size-7 text-accent" />
          Bản đồ tri thức
        </h1>
        <p className="mt-1 text-muted-foreground text-sm">
          {total} concept đã dùng qua các session. Click concept → xem session
          nào đã reference. 1 paper đọc 1 lần dùng nhiều video.
        </p>
      </header>

      <div className="mb-6 relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <Input
          data-search
          placeholder="Tìm framework / thinker / session topic…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      {q.isLoading ? (
        <Card className="h-64 animate-pulse bg-muted/30" />
      ) : total === 0 ? (
        <Card className="p-12 text-center border-dashed">
          <Network className="mx-auto mb-3 size-10 text-muted-foreground" />
          <p className="font-medium">Chưa có concept nào</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Brainstorm vài topic trước, hệ thống tự index các framework/thinker.
          </p>
        </Card>
      ) : (
        <div className="space-y-6">
          {orderedKeys.map((groupName) => (
            <GroupSection
              key={groupName}
              groupName={groupName}
              entries={filteredGroups[groupName]}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function GroupSection({
  groupName,
  entries,
}: {
  groupName: string;
  entries: KnowledgeEntry[];
}) {
  const label = GROUP_LABELS[groupName] ?? groupName;
  return (
    <Card className="p-0 overflow-hidden">
      <div className="px-6 py-3 border-b bg-secondary/30 flex items-center gap-2">
        <h2 className="font-medium">{label}</h2>
        <Badge variant="outline" className="font-mono">
          {groupName}
        </Badge>
        <span className="ml-auto text-xs text-muted-foreground">
          {entries.length} concept
        </span>
      </div>
      <div className="divide-y">
        {entries.map((entry) => (
          <EntryRow key={entry.name} entry={entry} />
        ))}
      </div>
    </Card>
  );
}

function EntryRow({ entry }: { entry: KnowledgeEntry }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full px-6 py-3 flex items-center gap-3 hover:bg-secondary/40 transition-colors text-left"
      >
        {open ? (
          <ChevronDown className="size-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="size-4 text-muted-foreground" />
        )}
        <span className="font-medium">{entry.name}</span>
        <Badge
          variant={entry.count >= 3 ? "default" : "outline"}
          className="ml-auto font-mono tabular-nums"
        >
          × {entry.count}
        </Badge>
      </button>
      {open && (
        <div className="px-6 py-3 pl-14 space-y-2 border-t bg-secondary/10">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">
            Sessions referencing this
          </p>
          {entry.sessions.map((s) => (
            <div
              key={s.id}
              className="flex items-center gap-3 text-sm py-1"
            >
              <Sparkles className="size-3 text-accent shrink-0" />
              <Link
                to="/brainstorm"
                state={{ jumpToSessionId: s.id }}
                className="hover:text-accent hover:underline truncate flex-1"
              >
                {s.topic}
              </Link>
              <span className="text-xs text-muted-foreground font-mono shrink-0">
                {s.createdAt.slice(0, 10)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
