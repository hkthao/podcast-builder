import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Lightbulb,
  Sparkles,
  Copy,
  Check,
  Trash2,
  Loader2,
  History,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { api, type BrainstormSession, type BrainstormIdea } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const TONES = [
  "Triết học suy ngẫm",
  "Phê phán xã hội",
  "Thực tế khoa học",
  "Câu chuyện cá nhân",
  "Hỏi đáp gây tranh luận",
  "Hài hước nhẹ nhàng",
];

export function Brainstorm() {
  const qc = useQueryClient();
  const [topic, setTopic] = useState("");
  const [tone, setTone] = useState(TONES[0]);
  const [count, setCount] = useState(5);
  const [activeId, setActiveId] = useState<string | null>(null);

  const sessionsQ = useQuery({
    queryKey: ["brainstorm-sessions"],
    queryFn: () => api.listBrainstorm(),
  });

  const sessions = sessionsQ.data?.sessions ?? [];
  const activeSession =
    activeId !== null
      ? (sessions.find((s) => s.id === activeId) ?? null)
      : (sessions[0] ?? null);

  // Auto-select latest session khi load lần đầu
  useEffect(() => {
    if (!activeId && sessions.length > 0) {
      setActiveId(sessions[0].id);
    }
  }, [sessions, activeId]);

  const genMut = useMutation({
    mutationFn: () => api.createBrainstorm({ topic, tone, count }),
    onSuccess: (newSession) => {
      qc.invalidateQueries({ queryKey: ["brainstorm-sessions"] });
      setActiveId(newSession.id);
    },
  });

  const pickMut = useMutation({
    mutationFn: (vars: { id: string; pickedIdx: number | null }) =>
      api.pickBrainstormIdea(vars.id, vars.pickedIdx),
    onSuccess: (updated) => {
      qc.setQueryData<{ sessions: BrainstormSession[] }>(
        ["brainstorm-sessions"],
        (prev) =>
          prev
            ? {
                sessions: prev.sessions.map((s) =>
                  s.id === updated.id ? updated : s,
                ),
              }
            : prev,
      );
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.deleteBrainstorm(id),
    onSuccess: (_, deletedId) => {
      qc.invalidateQueries({ queryKey: ["brainstorm-sessions"] });
      if (activeId === deletedId) setActiveId(null);
    },
  });

  return (
    <div className="container max-w-6xl py-10">
      <header className="mb-6">
        <h1 className="text-3xl font-serif tracking-tight flex items-center gap-3">
          <Lightbulb className="size-7 text-accent" />
          Brainstorm
        </h1>
        <p className="mt-1 text-muted-foreground text-sm">
          Generate 5 ý tưởng tập từ chủ đề + tone. Sau khi pick → copy
          title/hook, upload audio NotebookLM rồi điền vào episode config.
        </p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-6">
        <div className="space-y-6">
          {/* Generate form */}
          <Card className="p-6">
            <div className="space-y-4">
              <div>
                <Label htmlFor="topic">Chủ đề</Label>
                <Textarea
                  id="topic"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder="VD: Mù loà trước giá trị hiện tại — vì sao con người không nhận ra điều mình đang có cho tới khi mất…"
                  rows={3}
                  className="mt-1.5"
                />
              </div>
              <div className="flex flex-wrap gap-4">
                <div className="flex-1 min-w-[200px]">
                  <Label htmlFor="tone">Tone</Label>
                  <select
                    id="tone"
                    value={tone}
                    onChange={(e) => setTone(e.target.value)}
                    className="mt-1.5 h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {TONES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="w-32">
                  <Label htmlFor="count">Số ý tưởng</Label>
                  <select
                    id="count"
                    value={count}
                    onChange={(e) => setCount(Number(e.target.value))}
                    className="mt-1.5 h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {[3, 5, 7, 10].map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex items-center justify-between pt-2">
                <p className="text-xs text-muted-foreground">
                  Dùng OpenAI gpt-4o-mini · ~5-10s
                </p>
                <Button
                  onClick={() => genMut.mutate()}
                  disabled={!topic.trim() || genMut.isPending}
                >
                  {genMut.isPending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Sparkles className="size-4" />
                  )}
                  {genMut.isPending ? "Đang gen…" : "Generate"}
                </Button>
              </div>
              {genMut.isError && (
                <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive flex items-start gap-2">
                  <AlertCircle className="size-4 mt-0.5 shrink-0" />
                  <span>{String(genMut.error)}</span>
                </div>
              )}
            </div>
          </Card>

          {/* Active session ideas */}
          {activeSession ? (
            <IdeasView
              session={activeSession}
              onPick={(idx) =>
                pickMut.mutate({ id: activeSession.id, pickedIdx: idx })
              }
              pickingIdx={
                pickMut.isPending
                  ? (pickMut.variables?.pickedIdx ?? null)
                  : null
              }
              onDelete={() => {
                if (window.confirm(`Xoá brainstorm session "${activeSession.topic.slice(0, 40)}…"?`)) {
                  deleteMut.mutate(activeSession.id);
                }
              }}
              deleting={deleteMut.isPending}
            />
          ) : (
            <Card className="p-12 text-center border-dashed">
              <Lightbulb className="mx-auto mb-3 size-10 text-muted-foreground" />
              <p className="font-medium">Chưa có session nào</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Nhập chủ đề + click Generate để brainstorm 5 ý tưởng.
              </p>
            </Card>
          )}
        </div>

        {/* History sidebar */}
        <aside>
          <Card className="p-0 overflow-hidden">
            <div className="px-4 py-3 border-b bg-secondary/30 flex items-center gap-2">
              <History className="size-4" />
              <span className="font-medium text-sm">Lịch sử</span>
              <span className="ml-auto text-xs text-muted-foreground">
                {sessions.length}
              </span>
            </div>
            {sessions.length === 0 ? (
              <p className="px-4 py-6 text-sm text-muted-foreground text-center">
                Chưa có
              </p>
            ) : (
              <div className="divide-y max-h-[600px] overflow-y-auto">
                {sessions.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => setActiveId(s.id)}
                    className={cn(
                      "w-full text-left px-4 py-3 hover:bg-secondary/40 transition-colors",
                      activeSession?.id === s.id && "bg-secondary/60",
                    )}
                  >
                    <p className="text-sm line-clamp-2 font-medium">{s.topic}</p>
                    <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                      <span>{s.tone}</span>
                      <span>·</span>
                      <span>{s.ideas.length} ý</span>
                      {s.pickedIdx !== null && (
                        <Badge variant="secondary" className="ml-auto">
                          <CheckCircle2 className="size-3" />
                          picked
                        </Badge>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </Card>
        </aside>
      </div>
    </div>
  );
}

function IdeasView({
  session,
  onPick,
  pickingIdx,
  onDelete,
  deleting,
}: {
  session: BrainstormSession;
  onPick: (idx: number | null) => void;
  pickingIdx: number | null;
  onDelete: () => void;
  deleting: boolean;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium text-sm">{session.topic}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {session.tone} · {new Date(session.createdAt).toLocaleString("vi-VN")}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="text-destructive hover:bg-destructive/10 hover:text-destructive shrink-0"
          onClick={onDelete}
          disabled={deleting}
        >
          {deleting ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Trash2 className="size-4" />
          )}
          Xoá session
        </Button>
      </div>

      {session.ideas.map((idea, idx) => (
        <IdeaCard
          key={idx}
          idea={idea}
          idx={idx}
          picked={session.pickedIdx === idx}
          onPick={() => onPick(session.pickedIdx === idx ? null : idx)}
          loading={pickingIdx === idx}
        />
      ))}
    </div>
  );
}

function IdeaCard({
  idea,
  idx,
  picked,
  onPick,
  loading,
}: {
  idea: BrainstormIdea;
  idx: number;
  picked: boolean;
  onPick: () => void;
  loading: boolean;
}) {
  return (
    <Card
      className={cn(
        "p-0 overflow-hidden transition-colors",
        picked && "border-accent ring-1 ring-accent/40",
      )}
    >
      <div className="px-6 py-3 border-b bg-secondary/30 flex items-center gap-2">
        <Badge variant="outline" className="font-mono">
          #{String(idx + 1).padStart(2, "0")}
        </Badge>
        <h3 className="font-serif text-lg flex-1 leading-tight">
          {idea.title}
        </h3>
        {picked && (
          <Badge variant="secondary" className="shrink-0">
            <CheckCircle2 className="size-3" />
            Đã pick
          </Badge>
        )}
      </div>
      <div className="px-6 py-4 space-y-3">
        <div>
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">
            Hook
          </Label>
          <p className="mt-1 italic text-sm leading-relaxed">{idea.hook}</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
          <div>
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">
              Góc nhìn
            </Label>
            <p className="mt-1 text-muted-foreground leading-relaxed">
              {idea.angle}
            </p>
          </div>
          <div>
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">
              Vì sao
            </Label>
            <p className="mt-1 text-muted-foreground leading-relaxed">
              {idea.why}
            </p>
          </div>
        </div>
      </div>
      <div className="px-6 py-3 border-t flex items-center justify-end gap-2">
        <CopyButton text={idea.title} label="Title" />
        <CopyButton text={idea.hook} label="Hook" />
        <CopyButton
          text={`${idea.title}\n\n${idea.hook}`}
          label="Cả 2"
        />
        <Button
          variant={picked ? "secondary" : "outline"}
          size="sm"
          onClick={onPick}
          disabled={loading}
        >
          {loading ? (
            <Loader2 className="size-4 animate-spin" />
          ) : picked ? (
            <Check className="size-4" />
          ) : (
            <Sparkles className="size-4" />
          )}
          {picked ? "Bỏ pick" : "Pick"}
        </Button>
      </div>
    </Card>
  );
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          /* clipboard denied — bỏ qua */
        }
      }}
    >
      {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      {label}
    </Button>
  );
}
