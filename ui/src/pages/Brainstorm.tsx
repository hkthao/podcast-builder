import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  Lightbulb,
  Sparkles,
  Copy,
  Check,
  Trash2,
  Loader2,
  History,
  Search,
  CheckCircle2,
  AlertCircle,
  FileText,
  ChevronDown,
  Mic2,
  Music,
  Image as ImageIcon,
  ShieldCheck,
  ShieldAlert,
  ShieldX,
  Clock,
  Landmark,
  ExternalLink,
} from "lucide-react";
import {
  api,
  isGallerySession,
  type BrainstormSession,
  type BrainstormIdea,
  type BrainstormScores,
  type GalleryBrainstormIdea,
  type GalleryChapter,
  type LicenseRisk,
  type LLMProvider,
  type TopicCategory,
} from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { usePersistedState } from "@/lib/persist";
import { useWorkspace } from "@/lib/workspace";

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
  const { workspace } = useWorkspace();
  // Persist form state qua localStorage để reload không mất draft
  const [topic, setTopic] = usePersistedState("brainstorm.topic", "");
  const [tone, setTone] = usePersistedState("brainstorm.tone", TONES[0]);
  const [count, setCount] = usePersistedState("brainstorm.count", 5);
  const [provider, setProvider] = usePersistedState<LLMProvider>(
    "brainstorm.provider",
    "openai",
  );
  const [model, setModel] = usePersistedState<string>(
    "brainstorm.model",
    "gpt-4o-mini",
  );
  const [activeId, setActiveId] = usePersistedState<string | null>(
    "brainstorm.activeId",
    null,
  );

  const sessionsQ = useQuery({
    queryKey: ["brainstorm-sessions", workspace],
    queryFn: () => api.listBrainstorm(workspace),
  });

  const modelsQ = useQuery({
    queryKey: ["llm-models"],
    queryFn: () => api.listLLMModels(),
    staleTime: 60_000,
  });

  // Auto-fix model khi đổi provider: pick model đầu tiên của provider mới
  useEffect(() => {
    const list = modelsQ.data?.[provider] ?? [];
    if (list.length === 0) return;
    if (!list.some((m) => m.id === model)) {
      setModel(list[0].id);
    }
  }, [provider, modelsQ.data, model]);

  // Auto-switch provider nếu OpenAI không có key
  useEffect(() => {
    if (
      modelsQ.data &&
      modelsQ.data.openai.length === 0 &&
      modelsQ.data.ollama.length > 0 &&
      provider === "openai"
    ) {
      setProvider("ollama");
    }
  }, [modelsQ.data, provider]);

  const sessions = sessionsQ.data?.sessions ?? [];
  const activeSession =
    activeId !== null
      ? (sessions.find((s) => s.id === activeId) ?? null)
      : (sessions[0] ?? null);

  // Auto-select latest session khi load lần đầu HOẶC activeId stale
  // (vd session đã bị xoá, hoặc localStorage persist id từ máy khác)
  useEffect(() => {
    if (sessions.length === 0) return;
    if (!activeId || !sessions.some((s) => s.id === activeId)) {
      setActiveId(sessions[0].id);
    }
  }, [sessions, activeId, setActiveId]);

  const genMut = useMutation({
    mutationFn: () =>
      api.createBrainstorm({
        topic,
        // Gallery có art-historian persona cố định — gửi placeholder để
        // backend không từ chối (field tone vẫn required)
        tone: workspace === "gallery" ? "documentary" : tone,
        count,
        provider,
        model,
        style: workspace,
      }),
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
          {workspace === "gallery" ? (
            <>
              Generate ý tưởng video tài liệu nghệ thuật từ chủ đề. Sau khi pick →
              "Lập kế hoạch chương" để gen transcript + visual beats per chương.
            </>
          ) : (
            <>
              Generate 5 ý tưởng tập từ chủ đề + tone. Sau khi pick → copy
              title/hook, upload audio NotebookLM rồi điền vào episode config.
            </>
          )}
        </p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
        {/* History sidebar LEFT — match Essay page layout */}
        <aside className="order-2 lg:order-1">
          <HistorySidebar
            sessions={sessions}
            activeId={activeSession?.id ?? null}
            onSelect={setActiveId}
          />
        </aside>

        <div className="space-y-6 order-1 lg:order-2">
          {/* Generate form */}
          <Card className="p-6">
            <div className="space-y-4">
              {modelsQ.isError && (
                <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive flex items-start gap-2">
                  <AlertCircle className="size-4 mt-0.5 shrink-0" />
                  <span>
                    Không fetch được danh sách model. Server studio chưa chạy?
                    Mở terminal mới chạy <code className="font-mono">npm run studio</code>.
                  </span>
                </div>
              )}
              <div>
                <Label htmlFor="topic">Chủ đề</Label>
                <Textarea
                  id="topic"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder={
                    workspace === "gallery"
                      ? "VD: Họa sĩ Phục Hưng Ý, Caravaggio và ánh sáng Baroque, Nghệ thuật Hà Lan thế kỷ 17…"
                      : "VD: Mù loà trước giá trị hiện tại — vì sao con người không nhận ra điều mình đang có cho tới khi mất…"
                  }
                  rows={3}
                  className="mt-1.5"
                />
              </div>
              <div
                className={cn(
                  "grid gap-3",
                  // Gallery bỏ field Tone (art-historian persona cố định trong
                  // system prompt) → còn 3 cột thay vì 4
                  workspace === "gallery"
                    ? "grid-cols-1 md:grid-cols-3"
                    : "grid-cols-2 md:grid-cols-4",
                )}
              >
                {workspace === "podcast" && (
                  <div>
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
                )}
                <div>
                  <Label htmlFor="provider">Provider</Label>
                  <select
                    id="provider"
                    value={provider}
                    onChange={(e) => setProvider(e.target.value as LLMProvider)}
                    disabled={modelsQ.isLoading || modelsQ.isError}
                    className="mt-1.5 h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                  >
                    <option
                      value="openai"
                      disabled={
                        !!modelsQ.data &&
                        (modelsQ.data?.openai.length ?? 0) === 0
                      }
                    >
                      OpenAI
                      {modelsQ.data &&
                        (modelsQ.data.openai.length ?? 0) === 0 &&
                        " (no key)"}
                    </option>
                    <option
                      value="ollama"
                      disabled={
                        !!modelsQ.data &&
                        (modelsQ.data?.ollama.length ?? 0) === 0
                      }
                    >
                      Ollama (local)
                      {modelsQ.data &&
                        (modelsQ.data.ollama.length ?? 0) === 0 &&
                        " (offline)"}
                    </option>
                  </select>
                </div>
                <div>
                  <Label htmlFor="model">Model</Label>
                  <select
                    id="model"
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    disabled={(modelsQ.data?.[provider]?.length ?? 0) === 0}
                    className="mt-1.5 h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                  >
                    {(modelsQ.data?.[provider] ?? []).length === 0 ? (
                      <option value="">— không có model —</option>
                    ) : (
                      (modelsQ.data?.[provider] ?? []).map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.label}
                          {m.sizeBytes ? ` · ${humanGB(m.sizeBytes)}` : ""}
                        </option>
                      ))
                    )}
                  </select>
                </div>
                <div>
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
                  {provider === "openai"
                    ? `OpenAI ${model} · ~5-10s`
                    : `Ollama ${model} · local (có thể 30s-2 phút)`}
                </p>
                <Button
                  onClick={() => genMut.mutate()}
                  disabled={!topic.trim() || !model || genMut.isPending}
                >
                  {genMut.isPending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Sparkles className="size-4" />
                  )}
                  {genMut.isPending ? "Đang tạo…" : "Tạo ý tưởng"}
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
      </div>
    </div>
  );
}

function HistorySidebar({
  sessions,
  activeId,
  onSelect,
}: {
  sessions: BrainstormSession[];
  activeId: string | null;
  onSelect: (id: string) => void;
}) {
  const [q, setQ] = useState("");
  const [catFilter, setCatFilter] = useState<TopicCategory | null>(null);
  const allCats = new Set<TopicCategory>();
  for (const s of sessions) for (const c of s.categories) allCats.add(c);

  const filtered = sessions.filter((s) => {
    if (catFilter && !s.categories.includes(catFilter)) return false;
    if (q) {
      const needle = q.toLowerCase();
      const haystack = [
        s.topic,
        s.tone,
        ...s.ideas.map((i) => i.title),
      ]
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(needle)) return false;
    }
    return true;
  });

  return (
    <Card className="p-0 overflow-hidden sticky top-4">
      <div className="px-4 py-3 border-b bg-secondary/30 flex items-center gap-2">
        <History className="size-4" />
        <span className="font-medium text-sm">Lịch sử</span>
        <span className="ml-auto text-xs text-muted-foreground">
          {filtered.length}/{sessions.length}
        </span>
      </div>
      <div className="p-2 space-y-2 border-b">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
          <input
            data-search
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Tìm topic / ý tưởng…"
            className="w-full h-8 pl-8 pr-2 rounded border bg-background text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>
        {allCats.size > 0 && (
          <div className="flex flex-wrap gap-1">
            <button
              onClick={() => setCatFilter(null)}
              className={cn(
                "text-[10px] px-1.5 py-0.5 rounded border transition-colors",
                catFilter === null
                  ? "border-accent bg-accent/20"
                  : "border-muted-foreground/30 hover:bg-secondary",
              )}
            >
              all
            </button>
            {Array.from(allCats)
              .sort()
              .map((c) => (
                <button
                  key={c}
                  onClick={() =>
                    setCatFilter(catFilter === c ? null : c)
                  }
                  className={cn(
                    "text-[10px] px-1.5 py-0.5 rounded border transition-colors",
                    catFilter === c
                      ? "border-accent bg-accent/20"
                      : "border-muted-foreground/30 hover:bg-secondary",
                  )}
                >
                  {c}
                </button>
              ))}
          </div>
        )}
      </div>
      {filtered.length === 0 ? (
        <p className="px-4 py-6 text-sm text-muted-foreground text-center">
          {sessions.length === 0 ? "Chưa có" : "Không khớp filter"}
        </p>
      ) : (
        <div className="divide-y max-h-[600px] overflow-y-auto">
          {filtered.map((s) => (
            <button
              key={s.id}
              onClick={() => onSelect(s.id)}
              className={cn(
                "w-full text-left px-4 py-3 hover:bg-secondary/40 transition-colors",
                activeId === s.id && "bg-secondary/60",
              )}
            >
              <p className="text-sm line-clamp-2 font-medium">{s.topic}</p>
              {s.categories.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-1">
                  {s.categories.map((c) => (
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
              <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                <span>{s.ideas.length} ý</span>
                {s.provider && (
                  <span className="font-mono truncate">· {s.provider}</span>
                )}
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
  const [topicExpanded, setTopicExpanded] = useState(false);
  // Collapse nếu topic dài > 200 chars (~3 dòng), short topic không show toggle
  const isLong = session.topic.length > 200;
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p
            className={cn(
              "font-medium text-sm leading-relaxed whitespace-pre-wrap",
              isLong && !topicExpanded && "line-clamp-3",
            )}
          >
            {session.topic}
          </p>
          {isLong && (
            <button
              onClick={() => setTopicExpanded((v) => !v)}
              className="mt-1 text-xs text-accent hover:underline inline-flex items-center gap-1"
            >
              {topicExpanded ? (
                <>
                  <ChevronDown className="size-3 rotate-180" />
                  Thu gọn
                </>
              ) : (
                <>
                  <ChevronDown className="size-3" />
                  Xem thêm ({session.topic.length} ký tự)
                </>
              )}
            </button>
          )}
          <p className="text-xs text-muted-foreground mt-1">
            {/* Gallery không show tone (placeholder "documentary") */}
            {session.style !== "gallery" && session.tone}
            {session.provider && session.model && (
              <>
                {session.style !== "gallery" && " · "}
                <code className="font-mono">
                  {session.provider}:{session.model}
                </code>
              </>
            )}
            {" · "}
            {new Date(session.createdAt).toLocaleString("vi-VN")}
          </p>
          {session.categories.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {session.categories.map((c) => (
                <Badge
                  key={c}
                  variant="secondary"
                  className="text-xs font-normal"
                >
                  #{c}
                </Badge>
              ))}
            </div>
          )}
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

      {/* Phase 3c: branch render theo style — gallery có schema riêng */}
      {isGallerySession(session)
        ? session.ideas.map((idea, idx) => (
            <GalleryIdeaCard
              key={idx}
              idea={idea}
              idx={idx}
              sessionId={session.id}
              picked={session.pickedIdx === idx}
              onPick={() => onPick(session.pickedIdx === idx ? null : idx)}
              loading={pickingIdx === idx}
            />
          ))
        : (session.ideas as BrainstormIdea[])
            .map((idea, idx) => ({ idea, idx }))
            .sort((a, b) => avgScore(b.idea.scores) - avgScore(a.idea.scores))
            .map(({ idea, idx }) => (
              <IdeaCard
                key={idx}
                idea={idea}
                idx={idx}
                sessionId={session.id}
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
  sessionId,
  picked,
  onPick,
  loading,
}: {
  idea: BrainstormIdea;
  idx: number;
  sessionId: string;
  picked: boolean;
  onPick: () => void;
  loading: boolean;
}) {
  const navigate = useNavigate();
  // Picked → mở mặc định, others collapsed
  const [expanded, setExpanded] = useState(picked);
  return (
    <Card
      className={cn(
        "p-0 overflow-hidden transition-colors",
        picked && "border-accent ring-1 ring-accent/40",
      )}
    >
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full px-6 py-3 border-b bg-secondary/30 flex items-center gap-2 hover:bg-secondary/50 transition-colors text-left"
      >
        <Badge variant="outline" className="font-mono">
          #{String(idx + 1).padStart(2, "0")}
        </Badge>
        <h3 className="font-serif text-lg flex-1 leading-tight">
          {idea.title}
        </h3>
        <Badge
          variant="outline"
          className="font-mono shrink-0"
          title={`avg score (universal+emotional+philosophical+aiRelevance+originality) / 5`}
        >
          {avgScore(idea.scores).toFixed(1)}
        </Badge>
        {picked && (
          <Badge variant="secondary" className="shrink-0">
            <CheckCircle2 className="size-3" />
            Đã pick
          </Badge>
        )}
        <ChevronDown
          className={cn(
            "size-4 text-muted-foreground transition-transform shrink-0 ml-1",
            !expanded && "-rotate-90",
          )}
        />
      </button>
      {!expanded && (
        <div className="px-6 py-3 border-b">
          <p className="italic text-sm text-muted-foreground leading-relaxed line-clamp-2">
            {idea.hook}
          </p>
        </div>
      )}
      {expanded && (
      <div className="px-6 py-4 space-y-3">
        {idea.observation && (
          <div className="rounded border-l-2 border-accent/40 bg-secondary/40 px-3 py-2">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">
              Quan sát gốc
            </Label>
            <p className="mt-0.5 text-sm leading-relaxed">{idea.observation}</p>
          </div>
        )}
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
        <ScoresStrip scores={idea.scores} />
        {idea.knowledgeMap.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground self-center">
              Knowledge map:
            </span>
            {idea.knowledgeMap.map((field) => (
              <Badge
                key={field}
                variant="outline"
                className="text-xs font-normal"
              >
                {field}
              </Badge>
            ))}
          </div>
        )}
        {idea.contrarianView && (
          <div className="rounded border-l-2 border-amber-500/50 bg-amber-500/5 px-3 py-2">
            <Label className="text-xs uppercase tracking-wider text-amber-600 dark:text-amber-400">
              ⚖ Phản biện
            </Label>
            <p className="mt-0.5 text-sm leading-relaxed italic">
              {idea.contrarianView}
            </p>
          </div>
        )}
        {idea.thumbnailHooks.length > 0 && (
          <div>
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">
              Thumbnail hooks
            </Label>
            <ul className="mt-1 space-y-0.5 text-sm">
              {idea.thumbnailHooks.map((h, i) => (
                <li key={i} className="text-muted-foreground">
                  • {h}
                </li>
              ))}
            </ul>
          </div>
        )}
        {idea.futureConnection && (
          <div className="rounded border-l-2 border-accent bg-accent/5 px-3 py-2">
            <Label className="text-xs uppercase tracking-wider text-accent">
              🔮 Future / AGI ending
            </Label>
            <p className="mt-0.5 text-sm leading-relaxed">
              {idea.futureConnection}
            </p>
          </div>
        )}
        {idea.historicalExamples.length > 0 && (
          <div>
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">
              📜 Historical examples
            </Label>
            <ul className="mt-1 space-y-0.5 text-sm">
              {idea.historicalExamples.map((h, i) => (
                <li key={i} className="text-muted-foreground">
                  • {h}
                </li>
              ))}
            </ul>
          </div>
        )}
        {idea.storyBank.length > 0 && (
          <div>
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">
              📖 Story bank
            </Label>
            <ul className="mt-1 space-y-1 text-sm">
              {idea.storyBank.map((s, i) => (
                <li key={i} className="text-muted-foreground leading-relaxed">
                  {s}
                </li>
              ))}
            </ul>
          </div>
        )}
        {idea.outline && (
          <details className="group">
            <summary className="cursor-pointer flex items-center gap-2">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground cursor-pointer">
                Dàn ý essay
              </Label>
              <span className="text-xs text-muted-foreground group-open:hidden">
                ▸ show
              </span>
              <span className="text-xs text-muted-foreground hidden group-open:inline">
                ▾ hide
              </span>
            </summary>
            <pre className="mt-2 text-xs leading-relaxed text-muted-foreground whitespace-pre-wrap font-sans bg-secondary/30 rounded p-3 border">
              {idea.outline}
            </pre>
          </details>
        )}
      </div>
      )}
      <div className="px-6 py-3 border-t flex items-center justify-end gap-2 flex-wrap">
        <CopyButton text={idea.title} label="Tiêu đề" />
        <CopyButton text={idea.hook} label="Hook" />
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            navigate("/essay", {
              state: {
                prefillTitle: idea.title,
                prefillOutline: composeOutlineForEssay(idea),
                brainstormRef: { id: sessionId, ideaIdx: idx },
              },
            });
          }}
        >
          <FileText className="size-4" />
          Gen essay
        </Button>
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

/**
 * Compose dàn ý đầy đủ feed vào Essay gen: 12-mục outline (Framework v1) +
 * 4 phụ lục từ Phase A/B (Contrarian / Historical / Story bank / Future).
 */
function composeOutlineForEssay(idea: BrainstormIdea): string {
  const parts: string[] = [];
  if (idea.outline) {
    parts.push(idea.outline);
  } else {
    // Fallback cho legacy idea không có outline
    parts.push(`Mở: ${idea.hook}\n\n1. Góc nhìn: ${idea.angle}\n\nKết: ${idea.why}`);
  }
  if (idea.observation) {
    parts.push(`QUAN SÁT GỐC\n${idea.observation}`);
  }
  if (idea.contrarianView) {
    parts.push(
      `PHẢN BIỆN (steel-man + rebuttal trong essay)\n${idea.contrarianView}`,
    );
  }
  if (idea.historicalExamples.length > 0) {
    parts.push(
      `NHÂN VẬT/SỰ KIỆN LỊCH SỬ (dùng trong section thân bài)\n${idea.historicalExamples.map((h) => `- ${h}`).join("\n")}`,
    );
  }
  if (idea.storyBank.length > 0) {
    parts.push(
      `STORY BANK (chèn 1-2 câu chuyện vào essay để cụ thể hoá)\n${idea.storyBank.map((s) => `- ${s}`).join("\n")}`,
    );
  }
  if (idea.futureConnection) {
    parts.push(
      `FUTURE/AGI ENDING (dùng cho 1 section gần cuối hoặc kết bài)\n${idea.futureConnection}`,
    );
  }
  return parts.join("\n\n---\n\n");
}

function avgScore(s: BrainstormScores): number {
  return (
    (s.universal + s.emotional + s.philosophical + s.aiRelevance + s.originality) /
    5
  );
}

const SCORE_LABELS: Array<[keyof BrainstormScores, string]> = [
  ["universal", "Phổ quát"],
  ["emotional", "Cảm xúc"],
  ["philosophical", "Triết học"],
  ["aiRelevance", "AI"],
  ["originality", "Nguyên bản"],
];

function ScoresStrip({ scores }: { scores: BrainstormScores }) {
  return (
    <div className="grid grid-cols-5 gap-2 pt-1">
      {SCORE_LABELS.map(([key, label]) => {
        const v = scores[key];
        return (
          <div key={key} className="flex flex-col items-center gap-1">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
              {label}
            </span>
            <div className="w-full h-1.5 rounded-full bg-secondary overflow-hidden">
              <div
                className={cn(
                  "h-full rounded-full transition-all",
                  v >= 8
                    ? "bg-accent"
                    : v >= 5
                      ? "bg-primary/70"
                      : "bg-muted-foreground/40",
                )}
                style={{ width: `${v * 10}%` }}
              />
            </div>
            <span className="text-xs font-mono tabular-nums">{v}</span>
          </div>
        );
      })}
    </div>
  );
}

function humanGB(bytes: number): string {
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)}GB`;
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

// ─── Phase 3c: Gallery idea card ─────────────────────────────────────

const ARCHETYPE_LABEL: Record<GalleryBrainstormIdea["archetype"], string> = {
  monograph: "Chân dung họa sĩ",
  masterpiece: "Đào sâu 1 tác phẩm",
  movement: "Trào lưu / thời kỳ",
  theme: "Chủ đề xuyên thời",
};

const LICENSE_META: Record<
  LicenseRisk,
  { label: string; icon: React.ElementType; cls: string }
> = {
  safe: {
    label: "Safe — public domain",
    icon: ShieldCheck,
    cls: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
  },
  check: {
    label: "Check — cần kiểm tra",
    icon: ShieldAlert,
    cls: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30",
  },
  blocked: {
    label: "Blocked — modern art",
    icon: ShieldX,
    cls: "bg-destructive/10 text-destructive border-destructive/40",
  },
};

function GalleryIdeaCard({
  idea,
  idx,
  sessionId,
  picked,
  onPick,
  loading,
}: {
  idea: GalleryBrainstormIdea;
  idx: number;
  sessionId: string;
  picked: boolean;
  onPick: () => void;
  loading: boolean;
}) {
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(false);
  const license = LICENSE_META[idea.licenseRisk];
  const LicenseIcon = license.icon;
  const totalChapterMinutes = idea.chapters.reduce(
    (s, c) => s + c.minutes,
    0,
  );

  // Phase 3d: lookup plan đã có để toggle nút "Mở plan" vs "Lập plan mới"
  const existingPlanQ = useQuery({
    queryKey: ["gallery-plan-lookup", sessionId, idx],
    queryFn: () => api.lookupGalleryPlan(sessionId, idx),
  });

  const createPlanMut = useMutation({
    mutationFn: () => api.createGalleryPlan(sessionId, idx),
    onSuccess: (plan) => {
      navigate(`/gallery/plans/${plan.id}`);
    },
  });

  const existingPlanId = existingPlanQ.data?.plan?.id;

  return (
    <Card
      className={cn(
        "p-5 transition-all",
        picked && "ring-2 ring-accent border-accent",
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1.5">
            <Badge variant="outline" className="text-[10px] font-mono">
              #{idx + 1}
            </Badge>
            <Badge variant="secondary" className="text-xs">
              {ARCHETYPE_LABEL[idea.archetype]}
            </Badge>
            <Badge
              variant="outline"
              className={cn("text-xs gap-1", license.cls)}
              title={idea.licenseNote}
            >
              <LicenseIcon className="size-3" />
              {license.label}
            </Badge>
            {idea.structureMode === "doubled" && (
              <Badge variant="outline" className="text-xs gap-1">
                <Clock className="size-3" />
                Doubled (mirror)
              </Badge>
            )}
          </div>
          <h3 className="font-serif text-lg leading-tight">{idea.title}</h3>
          <p className="mt-1 text-sm text-muted-foreground italic">
            "{idea.hook}"
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            {idea.era} · {idea.region} · ~{idea.estimatedMinutes}p
            {idea.structureMode === "doubled" &&
              ` (Part1 + Part2 mirror, content ${totalChapterMinutes}p)`}
          </p>
        </div>
        <Button
          variant={picked ? "default" : "outline"}
          size="sm"
          onClick={onPick}
          disabled={loading}
          className="shrink-0"
        >
          {loading ? (
            <Loader2 className="size-4 animate-spin" />
          ) : picked ? (
            <Check className="size-4" />
          ) : null}
          {picked ? "Đã chọn" : "Chọn ý này"}
        </Button>
      </div>

      {/* Chapters + KeyWorks expandable */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="mt-4 w-full inline-flex items-center gap-1.5 text-xs text-accent hover:underline"
      >
        <span>
          {expanded
            ? "Thu gọn"
            : `Chi tiết (${idea.chapters.length} chương · ${idea.keyWorks.length} tác phẩm)`}
        </span>
        <ChevronDown
          className={cn(
            "size-3 ml-auto transition-transform",
            expanded && "rotate-180",
          )}
        />
      </button>

      {expanded && (
        <div className="mt-4 space-y-4 border-t pt-4">
          {/* Chapters */}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
              Cấu trúc chương ({totalChapterMinutes}p tổng)
            </h4>
            <ol className="space-y-1.5">
              {idea.chapters.map((ch, i) => (
                <ChapterRow key={i} idx={i} chapter={ch} />
              ))}
            </ol>
          </div>

          {/* KeyWorks */}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
              Tác phẩm cần asset ({idea.keyWorks.length})
            </h4>
            <ul className="space-y-2">
              {idea.keyWorks.map((kw, i) => (
                <li
                  key={i}
                  className="text-sm border-l-2 border-secondary pl-3"
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium">{kw.title}</span>
                    <span className="text-xs text-muted-foreground font-mono">
                      {kw.year}
                    </span>
                    <Badge variant="outline" className="text-[10px]">
                      {kw.medium}
                    </Badge>
                    <a
                      href={`https://commons.wikimedia.org/w/index.php?search=${encodeURIComponent(kw.title)}&title=Special:MediaSearch&go=Go&type=image`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-accent hover:underline inline-flex items-center gap-0.5 ml-auto"
                    >
                      Wikimedia
                      <ExternalLink className="size-3" />
                    </a>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    <Landmark className="inline size-3 mr-1" />
                    {kw.location}
                  </p>
                  <p className="text-xs mt-0.5">{kw.whyImportant}</p>
                </li>
              ))}
            </ul>
          </div>

          {/* Assets summary */}
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="rounded-md border bg-secondary/30 p-3">
              <p className="font-semibold mb-1 flex items-center gap-1.5">
                <ImageIcon className="size-3.5" />
                Asset sources
              </p>
              <div className="space-y-0.5 text-muted-foreground">
                <p>
                  Wikimedia: {idea.assetSources.wikimedia ? "✓" : "✗"} · Met:{" "}
                  {idea.assetSources.met ? "✓" : "✗"}
                </p>
                {idea.assetSources.customMuseums.length > 0 && (
                  <p>Bảo tàng: {idea.assetSources.customMuseums.join(", ")}</p>
                )}
                <p>
                  ~{idea.assetSources.estimatedImageCount} ảnh,{" "}
                  {idea.assetSources.estimatedClipCount} clip
                </p>
              </div>
            </div>
            <div className="rounded-md border bg-secondary/30 p-3">
              <p className="font-semibold mb-1 flex items-center gap-1.5">
                <Sparkles className="size-3.5" />
                Unique angle
              </p>
              <p className="text-muted-foreground">{idea.uniqueAngle}</p>
            </div>
          </div>

          {/* Audience + scholarly debate */}
          <div className="grid grid-cols-1 gap-2 text-xs">
            <p>
              <span className="font-semibold text-muted-foreground">
                Audience:{" "}
              </span>
              {idea.audience}
            </p>
            {idea.scholarlyDebate && (
              <p>
                <span className="font-semibold text-muted-foreground">
                  Scholarly debate:{" "}
                </span>
                {idea.scholarlyDebate}
              </p>
            )}
            {idea.references.length > 0 && (
              <div>
                <span className="font-semibold text-muted-foreground">
                  References:{" "}
                </span>
                <span>{idea.references.join(" · ")}</span>
              </div>
            )}
            <p>
              <span className="font-semibold text-muted-foreground">
                License note:{" "}
              </span>
              {idea.licenseNote}
            </p>
          </div>

          {/* Copy actions */}
          <div className="flex flex-wrap gap-2 pt-1">
            <CopyButton text={idea.title} label="Title" />
            <CopyButton text={idea.hook} label="Hook" />
            <CopyButton
              text={idea.chapters
                .map(
                  (ch, i) =>
                    `${i + 1}. [${ch.kind}] ${ch.title} (${ch.minutes}p)${
                      ch.musicCue ? ` — ${ch.musicCue}` : ""
                    }`,
                )
                .join("\n")}
              label="Chapters"
            />
          </div>
        </div>
      )}

      {/* Phase 3d: Plan workflow CTA — luôn hiện, ngay cả khi card collapsed */}
      <div className="mt-4 pt-4 border-t flex items-center justify-end gap-2">
        {existingPlanId ? (
          <Button
            size="sm"
            variant="outline"
            onClick={() => navigate(`/gallery/plans/${existingPlanId}`)}
          >
            <FileText className="size-4" />
            Mở plan đã có
          </Button>
        ) : (
          <Button
            size="sm"
            variant="outline"
            onClick={() => createPlanMut.mutate()}
            disabled={createPlanMut.isPending}
          >
            {createPlanMut.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <FileText className="size-4" />
            )}
            Lập kế hoạch chương
          </Button>
        )}
      </div>
    </Card>
  );
}

function ChapterRow({ idx, chapter }: { idx: number; chapter: GalleryChapter }) {
  const isMusic = chapter.kind === "music";
  const Icon = isMusic ? Music : Mic2;
  return (
    <li className="flex items-start gap-2 text-sm">
      <span className="text-xs font-mono text-muted-foreground mt-0.5 w-5 shrink-0">
        {idx + 1}.
      </span>
      <Icon
        className={cn(
          "size-3.5 mt-0.5 shrink-0",
          isMusic ? "text-accent" : "text-primary",
        )}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className={cn(isMusic && "italic")}>{chapter.title}</span>
          <span className="text-xs text-muted-foreground font-mono shrink-0">
            {chapter.minutes}p
          </span>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">
          {chapter.summary}
          {isMusic && chapter.musicCue && (
            <span className="ml-1 italic">— {chapter.musicCue}</span>
          )}
        </p>
        {chapter.keyWorks.length > 0 && (
          <p className="text-xs text-muted-foreground mt-0.5">
            <span className="font-medium">Tác phẩm:</span>{" "}
            {chapter.keyWorks.join(", ")}
          </p>
        )}
      </div>
    </li>
  );
}
