import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, useNavigate } from "react-router-dom";
import {
  FileText,
  Sparkles,
  Loader2,
  Save,
  Trash2,
  History,
  AlertCircle,
  Square,
  Copy,
  Check,
  ExternalLink,
  Headphones,
  Library,
  Search,
  Upload,
  Mic2,
  X,
  Image as ImageIcon,
  Volume2,
  Download,
} from "lucide-react";
import {
  api,
  type Essay,
  type EssayBrainstormRef,
  type EssayDerivatives,
  type EssayStreamEvent,
  type LLMProvider,
  type ShortsScript,
  type SuggestedRef,
  type DerivativeType,
} from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type LocationState = {
  prefillTitle?: string;
  prefillOutline?: string;
  brainstormRef?: EssayBrainstormRef;
};

export function EssayPage() {
  const qc = useQueryClient();
  const location = useLocation();
  const navigate = useNavigate();
  const state = (location.state ?? null) as LocationState | null;

  const [title, setTitle] = useState("");
  const [outline, setOutline] = useState("");
  const [provider, setProvider] = useState<LLMProvider>("openai");
  const [model, setModel] = useState<string>("gpt-4o-mini");
  const [brainstormRef, setBrainstormRef] =
    useState<EssayBrainstormRef | null>(null);

  // Streaming state
  const [streaming, setStreaming] = useState(false);
  const [streamContent, setStreamContent] = useState("");
  const [streamError, setStreamError] = useState<string | null>(null);
  const abortRef = useRef<(() => void) | null>(null);

  // Editing state
  const [activeId, setActiveId] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const [nlmPrompt, setNlmPrompt] = useState("");
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const saveTimer = useRef<number | null>(null);

  const essaysQ = useQuery({
    queryKey: ["essays"],
    queryFn: () => api.listEssays(),
  });

  const modelsQ = useQuery({
    queryKey: ["llm-models"],
    queryFn: () => api.listLLMModels(),
    staleTime: 60_000,
  });

  // Auto-fix model khi đổi provider
  useEffect(() => {
    const list = modelsQ.data?.[provider] ?? [];
    if (list.length === 0) return;
    if (!list.some((m) => m.id === model)) {
      setModel(list[0].id);
    }
  }, [provider, modelsQ.data, model]);

  // Auto-switch nếu openai unavailable
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

  // Prefill từ Brainstorm navigation state (1 lần)
  const prefillAppliedRef = useRef(false);
  useEffect(() => {
    if (prefillAppliedRef.current) return;
    if (state?.prefillTitle) {
      setTitle(state.prefillTitle);
      if (state.prefillOutline) setOutline(state.prefillOutline);
      if (state.brainstormRef) setBrainstormRef(state.brainstormRef);
      prefillAppliedRef.current = true;
      // Clear state để không re-prefill khi navigate trở lại
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [state, navigate, location.pathname]);

  // Khi click vào essay cũ — load nó
  const loadEssay = (e: Essay) => {
    if (streaming) return;
    setActiveId(e.id);
    setTitle(e.title);
    setOutline(e.outline ?? "");
    setProvider(e.provider);
    setModel(e.model);
    setBrainstormRef(e.brainstormRef);
    setContent(e.content);
    setNlmPrompt(e.nlmPrompt ?? "");
    setStreamContent("");
    setSavedAt(e.updatedAt);
    setSuggestions(e.suggestedRefs ?? []);
    setDerivatives(
      e.derivatives ?? {
        shorts: [],
        fbPosts: [],
        quotes: [],
        blog: null,
        newsletter: null,
      },
    );
  };

  const newEssay = () => {
    if (streaming) return;
    setActiveId(null);
    setTitle("");
    setOutline("");
    setBrainstormRef(null);
    setContent("");
    setNlmPrompt("");
    setStreamContent("");
    setSavedAt(null);
    setSuggestions([]);
    setDerivatives({
      shorts: [],
      fbPosts: [],
      quotes: [],
      blog: null,
      newsletter: null,
    });
  };

  const startStream = () => {
    if (!title.trim() || !model) return;
    setStreaming(true);
    setStreamContent("");
    setStreamError(null);
    setActiveId(null);
    setContent("");

    const onEvent = (ev: EssayStreamEvent) => {
      if (ev.type === "start") {
        setActiveId(ev.essay.id);
      } else if (ev.type === "delta") {
        setStreamContent((prev) => prev + ev.text);
      } else if (ev.type === "done") {
        setContent(ev.essay.content);
        setNlmPrompt(ev.essay.nlmPrompt ?? "");
        setStreamContent("");
        setSavedAt(ev.essay.updatedAt);
        setStreaming(false);
        abortRef.current = null;
        qc.invalidateQueries({ queryKey: ["essays"] });
      } else if (ev.type === "error") {
        setStreamError(ev.error);
        setStreaming(false);
        abortRef.current = null;
      }
    };

    abortRef.current = api.streamEssay(
      {
        title: title.trim(),
        outline: outline.trim() || undefined,
        brainstormRef: brainstormRef ?? undefined,
        provider,
        model,
      },
      onEvent,
    );
  };

  const cancelStream = () => {
    abortRef.current?.();
    abortRef.current = null;
    setStreaming(false);
  };

  const saveMut = useMutation({
    mutationFn: (vars: {
      id: string;
      title: string;
      content: string;
      nlmPrompt: string;
    }) =>
      api.saveEssay(vars.id, {
        title: vars.title,
        content: vars.content,
        nlmPrompt: vars.nlmPrompt || null,
      }),
    onSuccess: (updated) => {
      setSavedAt(updated.updatedAt);
      qc.setQueryData<{ essays: Essay[] }>(["essays"], (prev) =>
        prev
          ? {
              essays: prev.essays.map((e) =>
                e.id === updated.id ? updated : e,
              ),
            }
          : prev,
      );
    },
  });

  const [suggestions, setSuggestions] = useState<SuggestedRef[]>([]);
  const [derivatives, setDerivatives] = useState<EssayDerivatives>({
    shorts: [],
    fbPosts: [],
    quotes: [],
    blog: null,
    newsletter: null,
  });
  const suggestMut = useMutation({
    mutationFn: () =>
      api.suggestRefs({
        title,
        essayContent: content,
        provider,
        model,
        essayId: activeId ?? undefined,
      }),
    onSuccess: (data) => {
      setSuggestions(data.suggestions);
      // Refresh essay query để pick up suggestedRefs từ DB
      if (activeId) qc.invalidateQueries({ queryKey: ["essays"] });
    },
  });

  const [coverFile, setCoverFile] = useState<File | null>(null);
  const coverPreviewUrl = coverFile ? URL.createObjectURL(coverFile) : null;
  useEffect(() => {
    return () => {
      if (coverPreviewUrl) URL.revokeObjectURL(coverPreviewUrl);
    };
  }, [coverPreviewUrl]);

  const uploadMut = useMutation({
    mutationFn: (file: File) =>
      api.uploadAudio(file, {
        essayId: activeId ?? undefined,
        cover: coverFile ?? undefined,
      }),
    onSuccess: (summary) => {
      qc.invalidateQueries({ queryKey: ["episodes"] });
      setCoverFile(null);
      navigate(`/episodes/${encodeURIComponent(summary.name)}`);
    },
  });

  const onPickAudio = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadMut.mutate(file);
    e.target.value = ""; // reset để chọn lại cùng file được
  };

  const onPickCover = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) setCoverFile(file);
    e.target.value = "";
  };

  const genNlmMut = useMutation({
    mutationFn: (id: string) => api.genNlmPrompt(id, { provider, model }),
    onSuccess: (updated) => {
      setNlmPrompt(updated.nlmPrompt ?? "");
      setSavedAt(updated.updatedAt);
      qc.setQueryData<{ essays: Essay[] }>(["essays"], (prev) =>
        prev
          ? {
              essays: prev.essays.map((e) =>
                e.id === updated.id ? updated : e,
              ),
            }
          : prev,
      );
    },
  });

  // Auto-save debounced 1.2s khi user edit content/title/nlmPrompt của essay đã saved
  useEffect(() => {
    if (!activeId || streaming) return;
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      saveMut.mutate({ id: activeId, title, content, nlmPrompt });
    }, 1200);
    return () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content, title, nlmPrompt, activeId, streaming]);

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.deleteEssay(id),
    onSuccess: (_, deletedId) => {
      qc.invalidateQueries({ queryKey: ["essays"] });
      if (activeId === deletedId) newEssay();
    },
  });

  const essays = essaysQ.data?.essays ?? [];
  const liveContent = streaming ? streamContent : content;
  const wordCount = countWords(liveContent);

  return (
    <div className="container max-w-7xl py-10">
      <header className="mb-6">
        <h1 className="text-3xl font-serif tracking-tight flex items-center gap-3">
          <FileText className="size-7 text-accent" />
          Essay
        </h1>
        <p className="mt-1 text-muted-foreground text-sm">
          Gen bài luận 1500-2500 từ từ title + outline. Sau khi xong, paste
          vào NotebookLM làm nguồn để gen podcast audio.
        </p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
        {/* History sidebar */}
        <aside>
          <Card className="p-0 overflow-hidden">
            <div className="px-4 py-3 border-b bg-secondary/30 flex items-center gap-2">
              <History className="size-4" />
              <span className="font-medium text-sm">Lịch sử</span>
              <span className="ml-auto text-xs text-muted-foreground">
                {essays.length}
              </span>
            </div>
            <div className="p-2">
              <Button
                variant="outline"
                size="sm"
                onClick={newEssay}
                disabled={streaming}
                className="w-full"
              >
                <Sparkles className="size-4" />
                Bài mới
              </Button>
            </div>
            {essays.length === 0 ? (
              <p className="px-4 py-6 text-sm text-muted-foreground text-center">
                Chưa có
              </p>
            ) : (
              <div className="divide-y max-h-[700px] overflow-y-auto">
                {essays.map((e) => (
                  <button
                    key={e.id}
                    onClick={() => loadEssay(e)}
                    className={cn(
                      "w-full text-left px-4 py-3 hover:bg-secondary/40 transition-colors",
                      activeId === e.id && "bg-secondary/60",
                    )}
                  >
                    <p className="text-sm line-clamp-2 font-medium">
                      {e.title}
                    </p>
                    <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                      <span>{countWords(e.content)} từ</span>
                      {e.brainstormRef && (
                        <Badge variant="secondary" className="ml-auto">
                          ← brainstorm
                        </Badge>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </Card>
        </aside>

        {/* Main editor */}
        <div className="space-y-4">
          <Card className="p-6 space-y-4">
            <div>
              <Label htmlFor="title">Tiêu đề</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="VD: Mù loà trước giá trị hiện tại"
                disabled={streaming}
                className="mt-1.5"
              />
            </div>
            <div>
              <Label htmlFor="outline">Dàn ý (optional)</Label>
              <Textarea
                id="outline"
                value={outline}
                onChange={(e) => setOutline(e.target.value)}
                placeholder="Mở: hook 2-3 câu&#10;Thân: 3 luận điểm...&#10;Kết: ..."
                rows={4}
                disabled={streaming}
                className="mt-1.5 font-mono text-sm"
              />
            </div>

            {modelsQ.isError && (
              <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive flex items-start gap-2">
                <AlertCircle className="size-4 mt-0.5 shrink-0" />
                <span>
                  Server studio chưa chạy? Mở terminal mới:{" "}
                  <code className="font-mono">npm run studio</code>.
                </span>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="provider">Provider</Label>
                <select
                  id="provider"
                  value={provider}
                  onChange={(e) => setProvider(e.target.value as LLMProvider)}
                  disabled={streaming || modelsQ.isLoading || modelsQ.isError}
                  className="mt-1.5 h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                >
                  <option
                    value="openai"
                    disabled={
                      !!modelsQ.data && modelsQ.data.openai.length === 0
                    }
                  >
                    OpenAI
                    {modelsQ.data &&
                      modelsQ.data.openai.length === 0 &&
                      " (no key)"}
                  </option>
                  <option
                    value="ollama"
                    disabled={
                      !!modelsQ.data && modelsQ.data.ollama.length === 0
                    }
                  >
                    Ollama (local)
                    {modelsQ.data &&
                      modelsQ.data.ollama.length === 0 &&
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
                  disabled={
                    streaming ||
                    (modelsQ.data?.[provider]?.length ?? 0) === 0
                  }
                  className="mt-1.5 h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                >
                  {(modelsQ.data?.[provider] ?? []).length === 0 ? (
                    <option value="">— không có model —</option>
                  ) : (
                    (modelsQ.data?.[provider] ?? []).map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.label}
                      </option>
                    ))
                  )}
                </select>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              <p className="text-xs text-muted-foreground">
                {provider === "openai"
                  ? `OpenAI ${model} · stream 30s-2 phút`
                  : `Ollama ${model} · local (có thể 3-10 phút)`}
              </p>
              {streaming ? (
                <Button
                  variant="outline"
                  className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                  onClick={cancelStream}
                >
                  <Square className="size-4" />
                  Huỷ
                </Button>
              ) : (
                <Button
                  onClick={startStream}
                  disabled={!title.trim() || !model}
                >
                  <Sparkles className="size-4" />
                  {activeId ? "Tạo lại" : "Tạo bài luận"}
                </Button>
              )}
            </div>
            {streamError && (
              <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive flex items-start gap-2">
                <AlertCircle className="size-4 mt-0.5 shrink-0" />
                <span>{streamError}</span>
              </div>
            )}
          </Card>

          {/* Hint khi chưa có essay nào */}
          {!activeId && liveContent.length === 0 && !streaming && (
            <Card className="p-6 border-dashed">
              <p className="text-sm font-medium mb-3">
                Sau khi Generate sẽ xuất hiện 3 panel:
              </p>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li className="flex items-start gap-2">
                  <FileText className="size-4 mt-0.5 shrink-0 text-accent" />
                  <span>
                    <strong>Editor essay</strong> — live stream khi gen, edit
                    sau gen, auto-save 1.2s debounce.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <Headphones className="size-4 mt-0.5 shrink-0 text-accent" />
                  <span>
                    <strong>NotebookLM prompt</strong> — LLM viết prompt tối ưu
                    paste vào NLM để gen podcast 2-host tiếng Việt.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <Library className="size-4 mt-0.5 shrink-0 text-accent" />
                  <span>
                    <strong>Suggest tài liệu tham khảo</strong> — LLM gợi ý
                    5-7 sách/bài/video liên quan, click "Thêm vào thư viện" để
                    save vào References.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <Mic2 className="size-4 mt-0.5 shrink-0 text-accent" />
                  <span>
                    <strong>Upload audio NotebookLM</strong> — drop .m4a vào,
                    tự tạo episode prefill title/hook → sẵn render.
                  </span>
                </li>
              </ul>
            </Card>
          )}

          {/* Editor */}
          {(liveContent.length > 0 || activeId) && (
            <Card className="p-0 overflow-hidden">
              <div className="px-6 py-3 border-b bg-secondary/30 flex items-center gap-3">
                <span className="font-medium text-sm flex items-center gap-2">
                  <FileText className="size-4" />
                  Nội dung
                </span>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {wordCount.toLocaleString("vi-VN")} từ
                </span>
                {streaming && (
                  <Badge variant="secondary" className="gap-1 ml-auto">
                    <Loader2 className="size-3 animate-spin" />
                    streaming…
                  </Badge>
                )}
                {!streaming && activeId && savedAt && (
                  <span className="text-xs text-muted-foreground flex items-center gap-1 ml-auto">
                    {saveMut.isPending ? (
                      <>
                        <Loader2 className="size-3 animate-spin" />
                        đang save…
                      </>
                    ) : (
                      <>
                        <Check className="size-3 text-accent" />
                        saved {timeAgo(savedAt)}
                      </>
                    )}
                  </span>
                )}
              </div>
              <Textarea
                value={liveContent}
                onChange={(e) => setContent(e.target.value)}
                readOnly={streaming}
                placeholder="Bài luận sẽ xuất hiện ở đây khi gen xong…"
                className="min-h-[600px] rounded-none border-0 font-serif text-base leading-relaxed focus-visible:ring-0 resize-none"
              />
              <div className="px-6 py-3 border-t flex items-center justify-end gap-2">
                <CopyButton text={liveContent} />
                {activeId && !streaming && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => {
                      if (
                        window.confirm(
                          `Xoá essay "${title.slice(0, 40)}…"?`,
                        )
                      ) {
                        deleteMut.mutate(activeId);
                      }
                    }}
                    disabled={deleteMut.isPending}
                  >
                    {deleteMut.isPending ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="size-3.5" />
                    )}
                    Xoá
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    activeId &&
                    saveMut.mutate({
                      id: activeId,
                      title,
                      content,
                      nlmPrompt,
                    })
                  }
                  disabled={!activeId || streaming || saveMut.isPending}
                >
                  <Save className="size-3.5" />
                  Lưu
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  asChild
                >
                  <a
                    href="https://notebooklm.google.com/"
                    target="_blank"
                    rel="noreferrer"
                  >
                    <ExternalLink className="size-3.5" />
                    NotebookLM ↗
                  </a>
                </Button>
              </div>
            </Card>
          )}

          {/* NLM Prompt card — chỉ hiện khi essay đã có activeId + content */}
          {activeId && content.length > 0 && !streaming && (
            <Card className="p-0 overflow-hidden">
              <div className="px-6 py-3 border-b bg-secondary/30 flex items-center gap-3">
                <span className="font-medium text-sm flex items-center gap-2">
                  <Headphones className="size-4" />
                  NotebookLM prompt
                </span>
                {nlmPrompt && (
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {nlmPrompt.length} chars
                  </span>
                )}
                <div className="ml-auto flex items-center gap-2">
                  {!nlmPrompt && (
                    <span className="text-xs text-muted-foreground">
                      Bấm "Tạo prompt" để LLM viết từ essay
                    </span>
                  )}
                </div>
              </div>
              {nlmPrompt ? (
                <Textarea
                  value={nlmPrompt}
                  onChange={(e) => setNlmPrompt(e.target.value)}
                  rows={6}
                  className="rounded-none border-0 font-sans text-sm leading-relaxed focus-visible:ring-0 resize-y"
                  placeholder="Prompt để paste vào NotebookLM…"
                />
              ) : (
                <div className="px-6 py-8 text-center text-sm text-muted-foreground">
                  <Headphones className="mx-auto mb-2 size-8 opacity-40" />
                  Chưa có prompt. Bấm <strong>Generate</strong> bên dưới để LLM
                  viết prompt tối ưu paste vào NotebookLM.
                </div>
              )}
              <div className="px-6 py-3 border-t flex items-center justify-end gap-2">
                {genNlmMut.isError && (
                  <span className="mr-auto text-xs text-destructive flex items-center gap-1">
                    <AlertCircle className="size-3.5" />
                    {String(genNlmMut.error)}
                  </span>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => genNlmMut.mutate(activeId)}
                  disabled={genNlmMut.isPending || !model}
                >
                  {genNlmMut.isPending ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="size-3.5" />
                  )}
                  {nlmPrompt ? "Tạo lại" : "Tạo prompt"}
                </Button>
                <CopyButton text={nlmPrompt} />
                <Button variant="outline" size="sm" asChild>
                  <a
                    href="https://notebooklm.google.com/"
                    target="_blank"
                    rel="noreferrer"
                  >
                    <ExternalLink className="size-3.5" />
                    Open NotebookLM ↗
                  </a>
                </Button>
              </div>
            </Card>
          )}

          {/* Suggest references card */}
          {activeId && content.length > 0 && !streaming && (
            <Card className="p-0 overflow-hidden">
              <div className="px-6 py-3 border-b bg-secondary/30 flex items-center gap-3">
                <span className="font-medium text-sm flex items-center gap-2">
                  <Library className="size-4" />
                  Đề xuất tài liệu tham khảo
                </span>
                {suggestions.length > 0 && (
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {suggestions.length} gợi ý
                  </span>
                )}
                <div className="ml-auto flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    LLM gợi ý, KHÔNG bịa URL — user tự search Google
                  </span>
                </div>
              </div>

              {suggestions.length === 0 ? (
                <div className="px-6 py-8 text-center text-sm text-muted-foreground">
                  <Library className="mx-auto mb-2 size-8 opacity-40" />
                  Bấm <strong>Suggest</strong> để LLM đề xuất 5-7 sách/bài/video.
                </div>
              ) : (
                <div className="divide-y">
                  {suggestions.map((s, idx) => (
                    <SuggestionRow key={idx} suggestion={s} />
                  ))}
                </div>
              )}

              <div className="px-6 py-3 border-t flex items-center justify-end gap-2">
                {suggestMut.isError && (
                  <span className="mr-auto text-xs text-destructive flex items-center gap-1">
                    <AlertCircle className="size-3.5" />
                    {String(suggestMut.error)}
                  </span>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => suggestMut.mutate()}
                  disabled={suggestMut.isPending || !model}
                >
                  {suggestMut.isPending ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="size-3.5" />
                  )}
                  {suggestions.length > 0 ? "Đề xuất lại" : "Đề xuất"}
                </Button>
                <Button variant="outline" size="sm" asChild>
                  <a href="/references">
                    <Library className="size-3.5" />
                    Mở thư viện ↗
                  </a>
                </Button>
              </div>
            </Card>
          )}

          {/* Phase E: Tái sử dụng nội dung */}
          {activeId && content.length > 0 && !streaming && (
            <ContentReusePanel
              essayId={activeId}
              derivatives={derivatives}
              provider={provider}
              model={model}
              onUpdate={(updated) => setDerivatives(updated)}
            />
          )}

          {/* TTS audio gen — Phase 27b */}
          {activeId && content.length > 0 && !streaming && (
            <TTSGenCard
              essayContent={content}
              essayTitle={title}
              essayId={activeId}
              onAudioReady={(file) => {
                setCoverFile(null);
                uploadMut.mutate(file);
              }}
              uploadPending={uploadMut.isPending}
            />
          )}

          {/* Upload audio from NotebookLM → tạo episode mới */}
          {activeId && content.length > 0 && !streaming && (
            <Card className="p-0 overflow-hidden">
              <div className="px-6 py-3 border-b bg-secondary/30 flex items-center gap-3">
                <span className="font-medium text-sm flex items-center gap-2">
                  <Mic2 className="size-4" />
                  Audio từ NotebookLM
                </span>
                <span className="ml-auto text-xs text-muted-foreground">
                  Bước cuối: upload .m4a/.mp3 → tạo episode prefill title/hook
                </span>
              </div>
              <div className="px-6 py-6 space-y-4">
                {/* Cover image (optional) — chọn trước audio để gắn luôn vào episode */}
                <div>
                  <Label className="flex items-center gap-2 mb-1.5">
                    <ImageIcon className="size-4" />
                    Ảnh cover{" "}
                    <span className="text-muted-foreground font-normal text-xs">
                      (optional — dùng làm intro 3s thay vì auto-gen)
                    </span>
                  </Label>
                  <div className="flex items-start gap-3 rounded-md border p-3">
                    {coverPreviewUrl ? (
                      <img
                        src={coverPreviewUrl}
                        alt="cover preview"
                        className="w-20 h-36 object-cover rounded border shrink-0 bg-secondary"
                      />
                    ) : (
                      <div className="w-20 h-36 rounded border border-dashed flex items-center justify-center shrink-0 bg-secondary/30">
                        <ImageIcon className="size-5 text-muted-foreground/40" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0 space-y-2">
                      <p className="text-sm">
                        {coverFile ? (
                          <code className="font-mono text-xs">
                            {coverFile.name}
                          </code>
                        ) : (
                          <span className="text-muted-foreground">
                            Chưa chọn ảnh — bỏ trống để dùng auto-gen từ title
                          </span>
                        )}
                      </p>
                      <div className="flex gap-2">
                        <label>
                          <input
                            type="file"
                            accept=".jpg,.jpeg,.png,.webp,image/*"
                            onChange={onPickCover}
                            disabled={uploadMut.isPending}
                            className="hidden"
                          />
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            asChild
                            disabled={uploadMut.isPending}
                          >
                            <span className="cursor-pointer">
                              <Upload className="size-3.5" />
                              {coverFile ? "Đổi ảnh" : "Chọn ảnh"}
                            </span>
                          </Button>
                        </label>
                        {coverFile && (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                            onClick={() => setCoverFile(null)}
                            disabled={uploadMut.isPending}
                          >
                            <X className="size-3.5" />
                            Bỏ
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Audio drop zone */}
                <label className="block">
                  <input
                    type="file"
                    accept=".m4a,.mp3,.wav,audio/*"
                    onChange={onPickAudio}
                    disabled={uploadMut.isPending}
                    className="hidden"
                  />
                  <div
                    className={cn(
                      "border-2 border-dashed rounded-md p-8 text-center cursor-pointer transition-colors",
                      uploadMut.isPending
                        ? "opacity-50 cursor-wait"
                        : "hover:border-accent hover:bg-secondary/30",
                    )}
                  >
                    {uploadMut.isPending ? (
                      <>
                        <Loader2 className="mx-auto size-8 animate-spin text-accent" />
                        <p className="mt-2 text-sm">Đang upload + tạo episode…</p>
                      </>
                    ) : (
                      <>
                        <Upload className="mx-auto size-8 text-muted-foreground" />
                        <p className="mt-2 text-sm font-medium">
                          Click để chọn file audio
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Title + hook + essayId{coverFile ? " + ảnh cover" : ""} sẽ auto-link vào episode
                        </p>
                      </>
                    )}
                  </div>
                </label>
                {uploadMut.isError && (
                  <div className="mt-3 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive flex items-start gap-2">
                    <AlertCircle className="size-4 mt-0.5 shrink-0" />
                    <span>{String(uploadMut.error)}</span>
                  </div>
                )}
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

const TIER_LABELS: Record<1 | 2 | 3 | 4 | 5, string> = {
  1: "T1 · Meta",
  2: "T2 · Review",
  3: "T3 · Classic",
  4: "T4 · Paper",
  5: "T5 · Blog",
};

function tierColor(tier: 1 | 2 | 3 | 4 | 5): string {
  if (tier === 1) return "border-accent bg-accent/15 text-foreground";
  if (tier === 2) return "border-primary/60 bg-primary/10 text-foreground";
  if (tier === 3) return "border-amber-500/60 bg-amber-500/10";
  if (tier === 4) return "border-muted-foreground/40";
  return "border-muted-foreground/30 text-muted-foreground";
}

function SuggestionRow({ suggestion }: { suggestion: SuggestedRef }) {
  const [modalOpen, setModalOpen] = useState(false);
  const googleUrl = `https://www.google.com/search?q=${encodeURIComponent(suggestion.searchHint + " PDF")}`;
  return (
    <div className="px-6 py-4 space-y-2">
      <div className="flex items-start gap-3">
        <div className="flex flex-col gap-1 shrink-0 mt-0.5 w-20">
          <Badge
            variant="outline"
            className={cn("font-mono text-[10px]", tierColor(suggestion.tier))}
            title="Research Priority Tier (1=Meta-analysis, 5=Blog)"
          >
            {TIER_LABELS[suggestion.tier]}
          </Badge>
          <Badge variant="outline" className="font-mono text-[10px] uppercase">
            {suggestion.type}
          </Badge>
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-medium leading-tight">{suggestion.title}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {suggestion.author && <span>{suggestion.author} · </span>}
            <span className="italic">{suggestion.field}</span>
          </p>
          <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
            {suggestion.reason}
          </p>
          <code className="mt-2 inline-block px-2 py-0.5 rounded bg-secondary text-xs font-mono">
            {suggestion.searchHint}
          </code>
        </div>
      </div>
      <div className="flex justify-end gap-2 pt-1">
        <Button variant="outline" size="sm" asChild>
          <a href={googleUrl} target="_blank" rel="noreferrer">
            <Search className="size-3.5" />
            Google ↗
          </a>
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setModalOpen(true)}
        >
          <Library className="size-3.5" />
          Thêm vào thư viện
        </Button>
      </div>
      {modalOpen && (
        <QuickAddRefModal
          suggestion={suggestion}
          onClose={() => setModalOpen(false)}
        />
      )}
    </div>
  );
}

// ─── ContentReusePanel — Phase E: 5 derivative formats ────────────────────

type ReuseTab = "shorts" | "fb-posts" | "quotes" | "blog" | "newsletter";

const TAB_META: Array<{ key: ReuseTab; label: string; icon: string }> = [
  { key: "shorts", label: "Shorts", icon: "🎬" },
  { key: "fb-posts", label: "FB Posts", icon: "📱" },
  { key: "quotes", label: "Quotes", icon: "💬" },
  { key: "blog", label: "Blog", icon: "📝" },
  { key: "newsletter", label: "Newsletter", icon: "✉️" },
];

function ContentReusePanel({
  essayId,
  derivatives,
  provider,
  model,
  onUpdate,
}: {
  essayId: string;
  derivatives: EssayDerivatives;
  provider: LLMProvider;
  model: string;
  onUpdate: (next: EssayDerivatives) => void;
}) {
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<ReuseTab>("shorts");

  const genMut = useMutation({
    mutationFn: (type: DerivativeType) =>
      api.genDerivative(essayId, type, { provider, model }),
    onSuccess: (essay) => {
      onUpdate(essay.derivatives);
      qc.invalidateQueries({ queryKey: ["essays"] });
    },
  });

  const isReady = (key: ReuseTab): boolean => {
    if (key === "shorts") return derivatives.shorts.length > 0;
    if (key === "fb-posts") return derivatives.fbPosts.length > 0;
    if (key === "quotes") return derivatives.quotes.length > 0;
    if (key === "blog") return !!derivatives.blog;
    if (key === "newsletter") return !!derivatives.newsletter;
    return false;
  };

  return (
    <Card className="p-0 overflow-hidden">
      <div className="px-6 py-3 border-b bg-secondary/30 flex items-center gap-3">
        <span className="font-medium text-sm">♻️ Tái sử dụng nội dung</span>
        <span className="ml-auto text-xs text-muted-foreground">
          1 essay → 5 format: shorts / FB / quotes / blog / newsletter
        </span>
      </div>
      <div className="px-6 pt-3 flex gap-1 border-b">
        {TAB_META.map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-2 text-sm border-b-2 -mb-px transition-colors",
              activeTab === t.key
                ? "border-primary text-foreground font-medium"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            <span>{t.icon}</span>
            {t.label}
            {isReady(t.key) && (
              <Check className="size-3 text-accent" />
            )}
          </button>
        ))}
      </div>

      {activeTab === "shorts" && <ShortsView shorts={derivatives.shorts} />}
      {activeTab === "fb-posts" && (
        <ListView items={derivatives.fbPosts} placeholder="FB post" />
      )}
      {activeTab === "quotes" && (
        <ListView items={derivatives.quotes} placeholder="quote" quoted />
      )}
      {activeTab === "blog" && (
        <LongFormView content={derivatives.blog} placeholder="blog" />
      )}
      {activeTab === "newsletter" && (
        <LongFormView
          content={derivatives.newsletter}
          placeholder="newsletter"
        />
      )}
      <div className="px-6 py-3 border-t flex items-center justify-end gap-2">
        {genMut.isError && (
          <span className="mr-auto text-xs text-destructive flex items-center gap-1">
            <AlertCircle className="size-3.5" />
            {String(genMut.error)}
          </span>
        )}
        <Button
          variant="outline"
          size="sm"
          onClick={() => genMut.mutate(activeTab)}
          disabled={genMut.isPending || !model}
        >
          {genMut.isPending && genMut.variables === activeTab ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Sparkles className="size-3.5" />
          )}
          {isReady(activeTab) ? "Gen lại" : "Generate"}
        </Button>
      </div>
    </Card>
  );
}

function ShortsView({ shorts }: { shorts: ShortsScript[] }) {
  if (shorts.length === 0) {
    return (
      <p className="text-center text-sm text-muted-foreground py-12">
        Chưa có. Bấm Generate để gen 3 scripts (30s / 60s / 60s narrative).
      </p>
    );
  }
  return (
    <div className="divide-y">
      {shorts.map((s, i) => (
        <div key={i} className="px-6 py-4 space-y-3">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="font-mono">
              #{i + 1} · {s.duration}s
            </Badge>
            <span className="text-xs text-muted-foreground tabular-nums">
              {(s.hook + " " + s.body + " " + s.cta).split(/\s+/).length} từ
            </span>
            <div className="ml-auto">
              <CopyButton
                text={`HOOK: ${s.hook}\n\nBODY:\n${s.body}\n\nCTA: ${s.cta}`}
              />
            </div>
          </div>
          <div className="text-sm space-y-2">
            <div>
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                Hook (3s)
              </Label>
              <p className="mt-0.5 italic">{s.hook}</p>
            </div>
            <div>
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                Body
              </Label>
              <p className="mt-0.5 whitespace-pre-wrap leading-relaxed">
                {s.body}
              </p>
            </div>
            <div>
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                CTA
              </Label>
              <p className="mt-0.5">{s.cta}</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function ListView({
  items,
  placeholder,
  quoted,
}: {
  items: string[];
  placeholder: string;
  quoted?: boolean;
}) {
  if (items.length === 0) {
    return (
      <p className="text-center text-sm text-muted-foreground py-12">
        Chưa có {placeholder}. Bấm Generate.
      </p>
    );
  }
  return (
    <div className="divide-y">
      {items.map((item, i) => (
        <div key={i} className="px-6 py-3 flex items-start gap-3">
          <Badge variant="outline" className="font-mono shrink-0 mt-0.5">
            #{i + 1}
          </Badge>
          <p
            className={cn(
              "flex-1 text-sm whitespace-pre-wrap leading-relaxed",
              quoted && "italic",
            )}
          >
            {quoted ? `"${item}"` : item}
          </p>
          <div className="shrink-0">
            <CopyButton text={quoted ? `"${item}"` : item} />
          </div>
        </div>
      ))}
    </div>
  );
}

function LongFormView({
  content,
  placeholder,
}: {
  content: string | null;
  placeholder: string;
}) {
  if (!content) {
    return (
      <p className="text-center text-sm text-muted-foreground py-12">
        Chưa có {placeholder}. Bấm Generate.
      </p>
    );
  }
  return (
    <div>
      <div className="px-6 py-2 border-b flex items-center gap-2">
        <span className="text-xs text-muted-foreground tabular-nums">
          {content.split(/\s+/).length} từ
        </span>
        <div className="ml-auto">
          <CopyButton text={content} />
        </div>
      </div>
      <pre className="px-6 py-4 text-sm whitespace-pre-wrap font-sans leading-relaxed max-h-[500px] overflow-y-auto">
        {content}
      </pre>
    </div>
  );
}

function QuickAddRefModal({
  suggestion,
  onClose,
}: {
  suggestion: SuggestedRef;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [url, setUrl] = useState("");
  const [pdfUrl, setPdfUrl] = useState("");
  const [title, setTitle] = useState(suggestion.title);
  const [author, setAuthor] = useState(suggestion.author ?? "");
  const [tags, setTags] = useState("");
  const [notes, setNotes] = useState(
    `Search hint: ${suggestion.searchHint}\n\nWhy: ${suggestion.reason}`,
  );
  const [error, setError] = useState<string | null>(null);

  const addMut = useMutation({
    mutationFn: () =>
      api.addReference({
        url: url.trim(),
        pdfUrl: pdfUrl.trim() || null,
        title: title.trim(),
        author: author.trim() || null,
        type: suggestion.type,
        source: "",
        tags: tags
          .split(/[,\s]+/)
          .map((t) => t.trim())
          .filter(Boolean),
        notes: notes.trim(),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["references"] });
      qc.invalidateQueries({ queryKey: ["reference-tags"] });
      onClose();
    },
    onError: (e) => setError(String(e)),
  });

  const scrapeMut = useMutation({
    mutationFn: (u: string) => api.scrapeReference(u),
    onSuccess: (meta) => {
      if (meta.title && meta.title !== url) setTitle(meta.title);
      if (meta.author && !author) setAuthor(meta.author);
      if (meta.pdfUrl) setPdfUrl(meta.pdfUrl);
    },
  });

  return (
    <div
      className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <Card
        className="max-w-xl w-full p-0 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-3 border-b bg-secondary/30 flex items-center gap-2">
          <Library className="size-5 text-accent" />
          <h2 className="font-medium">Thêm vào thư viện</h2>
          <Badge variant="outline" className="font-mono text-xs uppercase ml-auto">
            T{suggestion.tier} · {suggestion.type}
          </Badge>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-secondary"
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="px-6 py-4 space-y-3">
          {/* Step 1: Google search */}
          <div className="rounded-md border bg-secondary/30 p-3 space-y-2">
            <p className="text-xs">
              <span className="font-medium">Bước 1.</span>{" "}
              <span className="text-muted-foreground">
                Bấm Google để tìm <strong>{suggestion.title}</strong>.
                Trong kết quả → click vào trang chính (Amazon / arXiv /
                Wikipedia / Goodreads / PDF…) → copy URL ở thanh address bar.
              </span>
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 h-9 inline-flex items-center text-xs font-mono px-3 rounded-md bg-background border truncate">
                {suggestion.searchHint} PDF
              </code>
              <Button variant="outline" size="sm" asChild>
                <a
                  href={`https://www.google.com/search?q=${encodeURIComponent(suggestion.searchHint + " PDF")}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <Search className="size-3.5" />
                  Google ↗
                </a>
              </Button>
            </div>
          </div>

          {/* Step 2: paste link (PDF ưu tiên, page URL fallback) */}
          <div>
            <Label>Bước 2. URL PDF</Label>
            <p className="text-xs text-muted-foreground mt-0.5 mb-1.5">
              Link PDF direct nếu có. VD:{" "}
              <code>arxiv.org/pdf/2304.12345.pdf</code>,{" "}
              <code>example.com/paper.pdf</code>.
            </p>
            <Input
              value={pdfUrl}
              onChange={(e) => setPdfUrl(e.target.value)}
              placeholder="https://…pdf"
              autoFocus
            />
          </div>
          <div>
            <Label>
              URL trang{" "}
              <span className="text-muted-foreground font-normal">
                (optional, nếu chưa có PDF)
              </span>
            </Label>
            <p className="text-xs text-muted-foreground mt-0.5 mb-1.5">
              VD: <code>amazon.com/dp/…</code>,{" "}
              <code>en.wikipedia.org/wiki/…</code>. KHÔNG paste link{" "}
              <code>google.com/search</code>. Cần ÍT NHẤT 1 trong 2 (PDF hoặc
              trang).
            </p>
            <div className="relative">
              <Input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://amazon.com/… hoặc https://arxiv.org/abs/…"
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => url.trim() && scrapeMut.mutate(url.trim())}
                disabled={!url.trim() || scrapeMut.isPending}
                title="Auto-fetch title/author từ URL"
                className="absolute right-1.5 top-1/2 -translate-y-1/2 inline-flex items-center justify-center size-7 rounded text-muted-foreground hover:text-accent hover:bg-secondary disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                {scrapeMut.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Sparkles className="size-4" />
                )}
              </button>
            </div>
          </div>
          <div>
            <Label>Tiêu đề</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1.5"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Tác giả</Label>
              <Input
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
                className="mt-1.5"
              />
            </div>
            <div>
              <Label>Tags <span className="text-muted-foreground font-normal">(cách nhau bằng phẩy)</span></Label>
              <Input
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                placeholder="triết-học, AI, hạnh-phúc"
                className="mt-1.5"
              />
            </div>
          </div>
          <div>
            <Label>Ghi chú</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="mt-1.5 text-sm"
            />
          </div>
          {error && (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 p-2 text-sm text-destructive">
              {error}
            </div>
          )}
        </div>
        <div className="px-6 py-3 border-t flex items-center justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Huỷ
          </Button>
          <Button
            size="sm"
            onClick={() => {
              setError(null);
              if (!url.trim() && !pdfUrl.trim()) {
                setError("Cần ít nhất 1 trong 2: URL trang hoặc URL PDF");
                return;
              }
              addMut.mutate();
            }}
            disabled={addMut.isPending}
          >
            {addMut.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Check className="size-4" />
            )}
            Lưu
          </Button>
        </div>
      </Card>
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={text.length === 0}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          /* clipboard denied */
        }
      }}
    >
      {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      Copy
    </Button>
  );
}

const TTS_VOICES = ["nova", "shimmer", "alloy", "echo", "fable", "onyx"] as const;
type TtsVoice = (typeof TTS_VOICES)[number];
const TTS_MODELS = ["tts-1-hd", "tts-1"] as const;
type TtsModel = (typeof TTS_MODELS)[number];

function TTSGenCard({
  essayContent,
  essayTitle,
  essayId,
  onAudioReady,
  uploadPending,
}: {
  essayContent: string;
  essayTitle: string;
  essayId: string;
  onAudioReady: (file: File) => void;
  uploadPending: boolean;
}) {
  const [voice, setVoice] = useState<TtsVoice>("nova");
  const [model, setModel] = useState<TtsModel>("tts-1-hd");
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Cleanup blob URL khi unmount or new blob
  useEffect(() => {
    return () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
  }, [audioUrl]);

  const charCount = essayContent.length;
  // tts-1-hd = $30/1M chars, tts-1 = $15/1M chars
  const ratePerMillion = model === "tts-1-hd" ? 30 : 15;
  const estimatedCost = (charCount / 1_000_000) * ratePerMillion;

  const genMut = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: essayContent, voice, model }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
          (body as { error?: string }).error ?? `${res.status} ${res.statusText}`,
        );
      }
      const blob = await res.blob();
      return blob;
    },
    onSuccess: (blob) => {
      setAudioBlob(blob);
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      setAudioUrl(URL.createObjectURL(blob));
      setError(null);
    },
    onError: (e) => {
      setError(String(e));
    },
  });

  const handleUseAudio = () => {
    if (!audioBlob) return;
    // Build filename slug từ title
    const slug = essayTitle
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/đ/gi, "d")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60) || `essay-${essayId}`;
    const file = new File([audioBlob], `${slug}.m4a`, { type: "audio/aac" });
    onAudioReady(file);
  };

  return (
    <Card className="p-0 overflow-hidden">
      <div className="px-6 py-3 border-b bg-secondary/30 flex items-center gap-3">
        <span className="font-medium text-sm flex items-center gap-2">
          <Volume2 className="size-4 text-accent" />
          Tạo audio narration (TTS)
        </span>
        <span className="ml-auto text-xs text-muted-foreground">
          AI đọc bài luận → audio cho style documentary
        </span>
      </div>
      <div className="px-6 py-5 space-y-3">
        <p className="text-xs text-muted-foreground">
          Dùng cho phong cách <strong>documentary lịch sử</strong> (1 giọng dẫn
          chuyện). Đối lập với NotebookLM (2 host hội thoại) phía dưới.
        </p>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="tts-voice" className="text-xs">
              Voice
            </Label>
            <select
              id="tts-voice"
              value={voice}
              onChange={(e) => setVoice(e.target.value as TtsVoice)}
              disabled={genMut.isPending}
              className="mt-1 h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              {TTS_VOICES.map((v) => (
                <option key={v} value={v}>
                  {v}
                  {v === "nova" ? " (mặc định, VN mềm)" : ""}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="tts-model" className="text-xs">
              Model
            </Label>
            <select
              id="tts-model"
              value={model}
              onChange={(e) => setModel(e.target.value as TtsModel)}
              disabled={genMut.isPending}
              className="mt-1 h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              {TTS_MODELS.map((m) => (
                <option key={m} value={m}>
                  {m}
                  {m === "tts-1-hd" ? " (HD)" : " (rẻ hơn)"}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="rounded-md border bg-secondary/20 p-3 text-xs space-y-1">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Bài luận:</span>
            <span className="font-mono tabular-nums">
              {charCount.toLocaleString("vi-VN")} chars
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Cost ước tính:</span>
            <span className="font-mono tabular-nums">
              ${estimatedCost.toFixed(3)} USD
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Audio gen time:</span>
            <span className="font-mono tabular-nums">
              ~{Math.max(5, Math.round(charCount / 60))}s
            </span>
          </div>
        </div>

        {audioUrl && (
          <div className="rounded-md border bg-accent/5 p-3 space-y-2">
            <div className="flex items-center gap-2 text-sm">
              <Check className="size-4 text-accent" />
              <span className="font-medium">Audio sẵn sàng</span>
              {audioBlob && (
                <span className="ml-auto text-xs text-muted-foreground font-mono">
                  {(audioBlob.size / 1024 / 1024).toFixed(2)} MB
                </span>
              )}
            </div>
            <audio controls src={audioUrl} className="w-full" />
          </div>
        )}

        {error && (
          <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive flex items-start gap-2">
            <AlertCircle className="size-4 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}
      </div>
      <div className="px-6 py-3 border-t flex items-center justify-end gap-2">
        {audioUrl && audioBlob && (
          <Button variant="outline" size="sm" asChild>
            <a
              href={audioUrl}
              download={`${essayId}.m4a`}
            >
              <Download className="size-3.5" />
              Tải về
            </a>
          </Button>
        )}
        {audioBlob && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleUseAudio}
            disabled={uploadPending}
          >
            {uploadPending ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Upload className="size-3.5" />
            )}
            Tạo episode
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          onClick={() => genMut.mutate()}
          disabled={genMut.isPending || charCount === 0}
        >
          {genMut.isPending ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Sparkles className="size-3.5" />
          )}
          {audioBlob ? "Tạo lại" : "Tạo audio"}
        </Button>
      </div>
    </Card>
  );
}

function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const seconds = Math.floor(ms / 1000);
  if (seconds < 5) return "vừa xong";
  if (seconds < 60) return `${seconds}s trước`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}p trước`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h trước`;
  return new Date(iso).toLocaleDateString("vi-VN");
}
