/**
 * GalleryPlan page — Phase 3d.
 * Route: /gallery/plans/:id
 *
 * Sau khi user pick 1 gallery brainstorm idea + tạo plan, page này hiện
 * danh sách chapter trong order + transcript editor inline.
 *
 * Mỗi narration chapter có nút "Gen transcript" → call LLM sinh voiceover
 * ~160 từ/phút. Music chapter chỉ hiện musicCue, không cần transcript.
 *
 * User edit + approve từng chapter. Khi tất cả approved → ready để feed
 * vào TTS gen audio (Phase 26b/27).
 */
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Sparkles,
  Loader2,
  Mic2,
  Music,
  CheckCircle2,
  Circle,
  AlertCircle,
  RefreshCw,
  Trash2,
  Copy,
  Check,
} from "lucide-react";
import {
  api,
  type GalleryChapterPlan,
  type GalleryPlanChapter,
  type LLMProvider,
} from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { usePersistedState } from "@/lib/persist";

const STATUS_META: Record<
  GalleryPlanChapter["status"],
  { label: string; icon: React.ElementType; cls: string }
> = {
  pending: {
    label: "Chưa gen",
    icon: Circle,
    cls: "text-muted-foreground",
  },
  draft: {
    label: "Draft",
    icon: AlertCircle,
    cls: "text-amber-600 dark:text-amber-400",
  },
  approved: {
    label: "Approved",
    icon: CheckCircle2,
    cls: "text-emerald-600 dark:text-emerald-400",
  },
};

export function GalleryPlanPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [provider, setProvider] = usePersistedState<LLMProvider>(
    "gallery-plan.provider",
    "openai",
  );
  const [model, setModel] = usePersistedState<string>(
    "gallery-plan.model",
    "gpt-4o-mini",
  );

  const planQ = useQuery({
    queryKey: ["gallery-plan", id],
    queryFn: () => api.getGalleryPlan(id!),
    enabled: !!id,
  });

  const modelsQ = useQuery({
    queryKey: ["llm-models"],
    queryFn: () => api.listLLMModels(),
    staleTime: 60_000,
  });

  useEffect(() => {
    const list = modelsQ.data?.[provider] ?? [];
    if (list.length > 0 && !list.some((m) => m.id === model)) {
      setModel(list[0].id);
    }
  }, [provider, modelsQ.data, model]);

  const deleteMut = useMutation({
    mutationFn: () => api.deleteGalleryPlan(id!),
    onSuccess: () => {
      navigate("/brainstorm");
    },
  });

  if (!id) {
    return (
      <div className="container max-w-4xl py-10">
        <p className="text-sm text-destructive">Thiếu plan id trong URL.</p>
      </div>
    );
  }
  if (planQ.isLoading) {
    return (
      <div className="container max-w-4xl py-10 flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Đang tải plan…
      </div>
    );
  }
  if (planQ.isError || !planQ.data) {
    return (
      <div className="container max-w-4xl py-10">
        <p className="text-sm text-destructive">
          Không tải được plan: {String(planQ.error ?? "not found")}
        </p>
      </div>
    );
  }

  const plan = planQ.data;
  const idea = plan.ideaSnapshot;
  const totalMin = plan.chapters.reduce((s, c) => s + c.minutes, 0);
  const narrationChapters = plan.chapters.filter((c) => c.kind === "narration");
  const approvedCount = narrationChapters.filter(
    (c) => c.status === "approved",
  ).length;
  const draftCount = narrationChapters.filter(
    (c) => c.status === "draft",
  ).length;

  return (
    <div className="container max-w-5xl py-8">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/brainstorm")}
            className="mb-2 -ml-2"
          >
            <ArrowLeft className="size-4" />
            Quay lại Brainstorm
          </Button>
          <h1 className="text-2xl font-serif tracking-tight">{idea.title}</h1>
          <p className="text-sm text-muted-foreground italic mt-1">
            "{idea.hook}"
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {idea.era} · {idea.region} · {idea.estimatedMinutes}p video ·{" "}
            {plan.chapters.length} chương ({totalMin}p)
            {idea.structureMode === "doubled" && " · Doubled (Part1+Part2 mirror)"}
          </p>
        </div>
        <div className="text-right shrink-0">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="gap-1">
              <CheckCircle2 className="size-3 text-emerald-600 dark:text-emerald-400" />
              {approvedCount}/{narrationChapters.length} approved
            </Badge>
            {draftCount > 0 && (
              <Badge variant="outline" className="gap-1">
                <AlertCircle className="size-3 text-amber-600 dark:text-amber-400" />
                {draftCount} draft
              </Badge>
            )}
          </div>
          <Button
            variant="outline"
            size="sm"
            className="text-destructive hover:bg-destructive/10 hover:text-destructive mt-2"
            onClick={() => {
              if (
                window.confirm(`Xoá plan "${idea.title.slice(0, 50)}…"?`)
              ) {
                deleteMut.mutate();
              }
            }}
            disabled={deleteMut.isPending}
          >
            <Trash2 className="size-4" />
            Xoá plan
          </Button>
        </div>
      </div>

      {/* Provider/model picker */}
      <Card className="p-4 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <Label htmlFor="provider">Provider</Label>
            <select
              id="provider"
              value={provider}
              onChange={(e) => setProvider(e.target.value as LLMProvider)}
              className="mt-1.5 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option
                value="openai"
                disabled={!!modelsQ.data && modelsQ.data.openai.length === 0}
              >
                OpenAI
              </option>
              <option
                value="ollama"
                disabled={!!modelsQ.data && modelsQ.data.ollama.length === 0}
              >
                Ollama (local)
              </option>
            </select>
          </div>
          <div className="md:col-span-2">
            <Label htmlFor="model">Model</Label>
            <select
              id="model"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="mt-1.5 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              {(modelsQ.data?.[provider] ?? []).map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </Card>

      {/* Chapter list */}
      <div className="space-y-3">
        {plan.chapters.map((chapter, idx) => (
          <ChapterCard
            key={idx}
            chapter={chapter}
            chapterIdx={idx}
            planId={plan.id}
            provider={provider}
            model={model}
            onMutate={(updated) => {
              qc.setQueryData<GalleryChapterPlan>(
                ["gallery-plan", plan.id],
                updated,
              );
            }}
          />
        ))}
      </div>
    </div>
  );
}

function ChapterCard({
  chapter,
  chapterIdx,
  planId,
  provider,
  model,
  onMutate,
}: {
  chapter: GalleryPlanChapter;
  chapterIdx: number;
  planId: string;
  provider: LLMProvider;
  model: string;
  onMutate: (plan: GalleryChapterPlan) => void;
}) {
  const isMusic = chapter.kind === "music";
  const status = STATUS_META[chapter.status];
  const StatusIcon = status.icon;
  const KindIcon = isMusic ? Music : Mic2;

  const [transcript, setTranscript] = useState(chapter.transcript);
  const [dirty, setDirty] = useState(false);
  const saveTimer = useRef<number | null>(null);

  // Sync khi parent refresh chapter (sau gen) — nhưng giữ pending edit
  useEffect(() => {
    if (!dirty) setTranscript(chapter.transcript);
  }, [chapter.transcript, dirty]);

  const genMut = useMutation({
    mutationFn: () =>
      api.genGalleryPlanChapter(planId, chapterIdx, { provider, model }),
    onSuccess: (plan) => {
      onMutate(plan);
      setDirty(false);
    },
  });

  const saveMut = useMutation({
    mutationFn: (patch: Parameters<typeof api.updateGalleryPlanChapter>[2]) =>
      api.updateGalleryPlanChapter(planId, chapterIdx, patch),
    onSuccess: (plan) => {
      onMutate(plan);
      setDirty(false);
    },
  });

  // Debounced autosave khi transcript dirty
  useEffect(() => {
    if (!dirty) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      saveMut.mutate({ transcript });
    }, 1500);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [transcript, dirty]);

  const wordCount = transcript.trim().split(/\s+/).filter(Boolean).length;
  const targetWords = chapter.minutes * 160;

  return (
    <Card className="p-5">
      <div className="flex items-start gap-3">
        <KindIcon
          className={cn(
            "size-5 mt-0.5 shrink-0",
            isMusic ? "text-accent" : "text-primary",
          )}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-mono text-muted-foreground">
              #{String(chapterIdx + 1).padStart(2, "0")}
            </span>
            <h3 className="font-medium">{chapter.title}</h3>
            <Badge variant="outline" className="text-xs font-mono">
              {chapter.minutes}p
            </Badge>
            <Badge
              variant="outline"
              className={cn("text-xs gap-1", status.cls)}
            >
              <StatusIcon className="size-3" />
              {status.label}
            </Badge>
            {isMusic && <Badge variant="secondary">Music interlude</Badge>}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {chapter.summary}
          </p>
          {chapter.keyWorks.length > 0 && (
            <p className="text-xs text-muted-foreground mt-0.5">
              <span className="font-medium">Tác phẩm:</span>{" "}
              {chapter.keyWorks.join(", ")}
            </p>
          )}
          {isMusic && chapter.musicCue && (
            <p className="text-xs italic text-accent mt-1">
              <Music className="inline size-3 mr-1" />
              {chapter.musicCue}
            </p>
          )}
        </div>
      </div>

      {/* Body — chỉ narration mới có transcript */}
      {!isMusic && (
        <div className="mt-4">
          <div className="flex items-center justify-between mb-1.5">
            <Label className="text-xs">
              Transcript voiceover{" "}
              <span className="font-mono text-muted-foreground">
                ({wordCount}/{targetWords} từ)
              </span>
            </Label>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => genMut.mutate()}
                disabled={genMut.isPending || !model}
              >
                {genMut.isPending ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : chapter.transcript ? (
                  <RefreshCw className="size-3.5" />
                ) : (
                  <Sparkles className="size-3.5" />
                )}
                {chapter.transcript ? "Re-gen" : "Gen transcript"}
              </Button>
              {transcript && (
                <CopyChip text={transcript} />
              )}
            </div>
          </div>
          <Textarea
            value={transcript}
            onChange={(e) => {
              setTranscript(e.target.value);
              setDirty(true);
            }}
            rows={Math.min(16, Math.max(6, Math.ceil(transcript.length / 80)))}
            placeholder={
              chapter.transcript
                ? ""
                : 'Chưa có. Click "Gen transcript" để LLM sinh, hoặc tự viết.'
            }
            className="font-serif leading-relaxed"
          />
          {genMut.isError && (
            <p className="mt-1 text-xs text-destructive">
              {String(genMut.error)}
            </p>
          )}

          <div className="mt-2 flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              {dirty && saveMut.isPending && (
                <span className="inline-flex items-center gap-1">
                  <Loader2 className="size-3 animate-spin" />
                  Đang lưu…
                </span>
              )}
              {!dirty && !saveMut.isPending && saveMut.isSuccess && (
                <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                  <Check className="size-3" />
                  Đã lưu
                </span>
              )}
            </p>
            <div className="flex items-center gap-2">
              {chapter.status !== "approved" && transcript && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    saveMut.mutate({ transcript, status: "approved" })
                  }
                  disabled={saveMut.isPending}
                >
                  <CheckCircle2 className="size-3.5" />
                  Approve
                </Button>
              )}
              {chapter.status === "approved" && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => saveMut.mutate({ status: "draft" })}
                  disabled={saveMut.isPending}
                >
                  Unapprove
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Music chapter: chỉ cho approve toggle */}
      {isMusic && (
        <div className="mt-3 flex items-center justify-end">
          {chapter.status !== "approved" ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => saveMut.mutate({ status: "approved" })}
              disabled={saveMut.isPending}
            >
              <CheckCircle2 className="size-3.5" />
              Approve music cue
            </Button>
          ) : (
            <Button
              size="sm"
              variant="outline"
              onClick={() => saveMut.mutate({ status: "draft" })}
              disabled={saveMut.isPending}
            >
              Unapprove
            </Button>
          )}
        </div>
      )}
    </Card>
  );
}

function CopyChip({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      size="sm"
      variant="ghost"
      className="h-7 px-2"
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
      {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
    </Button>
  );
}

