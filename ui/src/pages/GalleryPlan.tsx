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
  Image as ImageIcon,
  Plus,
  X,
  ExternalLink,
  ChevronDown,
  Volume2,
  Headphones,
  Video as VideoIcon,
  Film,
  Download,
  FileText,
  Upload,
} from "lucide-react";
import {
  api,
  type AssetResult,
  type GalleryChapterPlan,
  type GalleryPlanChapter,
  type KenBurnsMode,
  type LLMProvider,
  type SavedAsset,
  type VisualBeat,
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

const OPENAI_TTS_VOICES = [
  "alloy",
  "echo",
  "fable",
  "onyx",
  "nova",
  "shimmer",
];

const GEMINI_TTS_VOICES = [
  "Kore", // deep contemplative — default cho gallery
  "Aoede", // warm breezy
  "Puck", // bright energetic
  "Charon", // baritone serious
  "Zephyr", // light airy
  "Fenrir", // gravelly deep
  "Leda", // soft warm
  "Orus", // narrator standard
  "Schedar", // measured scholarly
  "Sulafat", // smooth mid
];

type TtsProvider = "openai" | "gemini";

const LANGUAGE_CODES = [
  { value: "vi-VN", label: "Vietnamese (Vietnam)" },
  { value: "en-US", label: "English (US)" },
  { value: "en-GB", label: "English (UK)" },
  { value: "ja-JP", label: "Japanese" },
  { value: "ko-KR", label: "Korean" },
  { value: "zh-CN", label: "Chinese (Simplified)" },
  { value: "fr-FR", label: "French" },
  { value: "de-DE", label: "German" },
  { value: "es-ES", label: "Spanish" },
  { value: "it-IT", label: "Italian" },
];

const GEMINI_TTS_MODELS = [
  { value: "gemini-2.5-flash-tts", label: "Gemini 2.5 Flash TTS (recommend)" },
  { value: "gemini-2.5-pro-tts", label: "Gemini 2.5 Pro TTS" },
];

const DEFAULT_STYLE =
  "Đọc giọng trầm ấm, chiêm nghiệm, học thuật. Tốc độ vừa phải, ngắt câu rõ. Giọng miền Bắc, phong cách documentary nghệ thuật.";

export function GalleryPlanPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();

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

      {/* Phase 4e.x: BGM uploader */}
      <BgmPanel
        plan={plan}
        onMutate={(updated) =>
          qc.setQueryData<GalleryChapterPlan>(
            ["gallery-plan", plan.id],
            updated,
          )
        }
      />


      {/* Chapter list */}
      <div className="space-y-3">
        {plan.chapters.map((chapter, idx) => (
          <ChapterCard
            key={idx}
            chapter={chapter}
            chapterIdx={idx}
            planId={plan.id}
            ideaSnapshot={plan.ideaSnapshot}
            modelsData={modelsQ.data}
            onMutate={(updated) => {
              qc.setQueryData<GalleryChapterPlan>(
                ["gallery-plan", plan.id],
                updated,
              );
            }}
          />
        ))}
      </div>

      {/* Phase 4e: plan-level export */}
      <ExportPanel
        plan={plan}
        onMutate={(updated) =>
          qc.setQueryData<GalleryChapterPlan>(
            ["gallery-plan", plan.id],
            updated,
          )
        }
      />
    </div>
  );
}

function ChapterCard({
  chapter,
  chapterIdx,
  planId,
  ideaSnapshot,
  modelsData,
  onMutate,
}: {
  chapter: GalleryPlanChapter;
  chapterIdx: number;
  planId: string;
  ideaSnapshot: import("@/lib/api").GalleryBrainstormIdea;
  modelsData: import("@/lib/api").LLMModels | undefined;
  onMutate: (plan: GalleryChapterPlan) => void;
}) {
  // Phase: per-chapter LLM provider/model. Persist riêng per (plan, chapter)
  // vì mỗi chương có thể cần model khác (vd intro dùng mini cho rẻ, deep
  // analysis dùng gpt-4o cho chất lượng).
  const [provider, setProvider] = usePersistedState<LLMProvider>(
    `gallery-plan.${planId}.ch${chapterIdx}.llm-provider`,
    "openai",
  );
  const [model, setModel] = usePersistedState<string>(
    `gallery-plan.${planId}.ch${chapterIdx}.llm-model`,
    "gpt-4o-mini",
  );
  // Auto-fix model nếu không có trong list của provider
  useEffect(() => {
    const list = modelsData?.[provider] ?? [];
    if (list.length > 0 && !list.some((m) => m.id === model)) {
      setModel(list[0].id);
    }
  }, [provider, modelsData, model]);
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

  // Phase 4d.2: Remotion render
  const renderMut = useMutation({
    mutationFn: () => api.renderGalleryPlanChapter(planId, chapterIdx),
    onSuccess: (res) => onMutate(res.plan),
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
          <div className="flex items-center justify-between mb-1.5 gap-2 flex-wrap">
            <Label className="text-xs">
              Transcript voiceover{" "}
              <span className="font-mono text-muted-foreground">
                ({wordCount}/{targetWords} từ)
              </span>
            </Label>
            <div className="flex items-center gap-1.5 flex-wrap">
              {/* Per-chapter LLM picker — compact inline (h-9 = Button sm) */}
              <select
                value={provider}
                onChange={(e) => setProvider(e.target.value as LLMProvider)}
                className="h-9 rounded-md border border-input bg-background px-2 text-xs"
                title="LLM provider"
              >
                <option
                  value="openai"
                  disabled={
                    !!modelsData && modelsData.openai.length === 0
                  }
                >
                  OpenAI
                </option>
                <option
                  value="ollama"
                  disabled={
                    !!modelsData && modelsData.ollama.length === 0
                  }
                >
                  Ollama
                </option>
              </select>
              <select
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="h-9 rounded-md border border-input bg-background px-2 text-xs max-w-[180px]"
                title="LLM model"
              >
                {(modelsData?.[provider] ?? []).map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
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

          {/* Phase 4b: audio TTS + Whisper alignment — self-managed state per chapter */}
          <AudioPanel
            chapter={chapter}
            planId={planId}
            chapterIdx={chapterIdx}
            onMutate={onMutate}
          />

          {/* Phase 4a: visual beats editor */}
          <VisualBeatsEditor
            beats={chapter.visualBeats}
            transcript={transcript}
            sentenceCount={countSentences(transcript)}
            keywordSuggestions={buildBeatKeywordSuggestions(
              chapter,
              ideaSnapshot,
            )}
            onSave={(beats) => saveMut.mutate({ visualBeats: beats })}
            saving={saveMut.isPending}
          />

        </div>
      )}

      {/* Music chapter: render + approve toggle */}
      {isMusic && (
        <>
          <VideoPanel
            chapter={chapter}
            onRender={() => renderMut.mutate()}
            renderPending={renderMut.isPending}
            renderError={renderMut.error}
          />
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
        </>
      )}

      {/* Phase 4d.2: video render — narration mới ở trong !isMusic block trên */}
      {!isMusic && (
        <VideoPanel
          chapter={chapter}
          onRender={() => renderMut.mutate()}
          renderPending={renderMut.isPending}
          renderError={renderMut.error}
        />
      )}
    </Card>
  );
}

function countSentences(text: string): number {
  if (!text.trim()) return 0;
  return text
    .split(/[.!?]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0).length;
}

function splitIntoSentences(text: string): string[] {
  if (!text.trim()) return [];
  return text
    .split(/([.!?]+)/)
    .reduce<string[]>((acc, part, i, arr) => {
      // Re-attach punctuation to sentence
      if (i % 2 === 0) {
        const punct = arr[i + 1] ?? "";
        const sentence = (part + punct).trim();
        if (sentence) acc.push(sentence);
      }
      return acc;
    }, []);
}

const KEN_BURNS_OPTIONS: KenBurnsMode[] = [
  "zoom-in",
  "zoom-out",
  "pan-left",
  "pan-right",
  "pan-up",
  "pan-down",
  "static",
];

function AudioPanel({
  chapter,
  planId,
  chapterIdx,
  onMutate,
}: {
  chapter: GalleryPlanChapter;
  planId: string;
  chapterIdx: number;
  onMutate: (plan: GalleryChapterPlan) => void;
}) {
  // Per-chapter TTS state — persisted độc lập với chapter khác
  const stateKey = `gallery-plan.${planId}.ch${chapterIdx}`;
  const [ttsProvider, setTtsProvider] = usePersistedState<TtsProvider>(
    `${stateKey}.tts-provider`,
    "gemini",
  );
  const [ttsVoice, setTtsVoice] = usePersistedState<string>(
    `${stateKey}.tts-voice`,
    "Kore",
  );
  const [ttsModel, setTtsModel] = usePersistedState<string>(
    `${stateKey}.tts-model`,
    "gemini-2.5-flash-tts",
  );
  const [ttsLanguage, setTtsLanguage] = usePersistedState<string>(
    `${stateKey}.tts-language`,
    "vi-VN",
  );
  const [ttsSpeakingRate, setTtsSpeakingRate] = usePersistedState<number>(
    `${stateKey}.tts-rate`,
    1.0,
  );
  const [ttsPitch, setTtsPitch] = usePersistedState<number>(
    `${stateKey}.tts-pitch`,
    0,
  );
  const [ttsStyleInstruction, setTtsStyleInstruction] = usePersistedState<string>(
    `${stateKey}.tts-style`,
    DEFAULT_STYLE,
  );
  const [advancedOpen, setAdvancedOpen] = useState(false);

  // Auto-fix voice khi đổi TTS provider
  useEffect(() => {
    const valid =
      ttsProvider === "gemini" ? GEMINI_TTS_VOICES : OPENAI_TTS_VOICES;
    if (!valid.includes(ttsVoice)) setTtsVoice(valid[0]);
  }, [ttsProvider, ttsVoice]);

  const audioMut = useMutation({
    mutationFn: (force: boolean) =>
      api.genGalleryPlanChapterAudio(planId, chapterIdx, {
        ttsProvider,
        voice: ttsVoice,
        ttsModel: ttsProvider === "gemini" ? ttsModel : undefined,
        force,
        ...(ttsProvider === "gemini"
          ? {
              languageCode: ttsLanguage,
              speakingRate: ttsSpeakingRate,
              pitch: ttsPitch,
              styleInstruction: ttsStyleInstruction,
            }
          : {}),
      }),
    onSuccess: (plan) => onMutate(plan),
  });

  const hasAudio = chapter.audioFilename !== null;
  const durSec = chapter.audioDurationMs
    ? Math.round(chapter.audioDurationMs / 1000)
    : 0;
  const targetSec = chapter.minutes * 60;
  const wordCount = chapter.wordTimestamps.length;
  const genPending = audioMut.isPending;
  const genError = audioMut.error;

  return (
    <div className="mt-5 border-t pt-4">
      <div className="flex items-center gap-2 mb-1 flex-wrap">
        <h4 className="text-sm font-medium flex items-center gap-2">
          <Headphones className="size-4" />
          Audio + word timestamps
        </h4>
        {hasAudio && (
          <Badge variant="outline" className="text-[10px] gap-1">
            <CheckCircle2 className="size-3 text-emerald-600 dark:text-emerald-400" />
            {durSec}s · {wordCount} words
          </Badge>
        )}
      </div>

      <p className="mb-3 text-xs text-muted-foreground leading-relaxed">
        AI đọc bản transcript thành giọng nói. Hệ thống tự cân bằng âm lượng
        (rõ + đều) và ghi nhận thời điểm đọc từng từ — để sau khớp ảnh với
        từng câu. Mất 30-60 giây cho 1 chương 4-10 phút.
      </p>

      {/* Advanced TTS (Gemini only) — collapsible */}
      {ttsProvider === "gemini" && (
        <div className="mb-3">
          <button
            type="button"
            onClick={() => setAdvancedOpen((v) => !v)}
            className="inline-flex items-center gap-1.5 text-xs text-accent hover:underline"
          >
            <ChevronDown
              className={cn(
                "size-3 transition-transform",
                advancedOpen && "rotate-180",
              )}
            />
            {advancedOpen ? "Thu gọn" : "Tuỳ chọn TTS"} (model, language,
            rate, pitch, style)
          </button>
          {advancedOpen && (
            <div className="mt-2 pt-2 space-y-2 text-xs">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <div>
                  <Label className="text-[10px]">Model</Label>
                  <select
                    value={ttsModel}
                    onChange={(e) => setTtsModel(e.target.value)}
                    className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-xs"
                  >
                    {GEMINI_TTS_MODELS.map((m) => (
                      <option key={m.value} value={m.value}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label className="text-[10px]">Language</Label>
                  <select
                    value={ttsLanguage}
                    onChange={(e) => setTtsLanguage(e.target.value)}
                    className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-xs"
                  >
                    {LANGUAGE_CODES.map((l) => (
                      <option key={l.value} value={l.value}>
                        {l.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label className="text-[10px]">
                    Rate
                    <span className="ml-1 font-mono text-muted-foreground">
                      {ttsSpeakingRate.toFixed(2)}×
                    </span>
                  </Label>
                  <input
                    type="range"
                    min={0.25}
                    max={2}
                    step={0.05}
                    value={ttsSpeakingRate}
                    onChange={(e) =>
                      setTtsSpeakingRate(Number(e.target.value))
                    }
                    className="mt-3 w-full accent-accent"
                  />
                </div>
                <div>
                  <Label className="text-[10px]">
                    Pitch
                    <span className="ml-1 font-mono text-muted-foreground">
                      {ttsPitch > 0 ? "+" : ""}
                      {ttsPitch}
                    </span>
                  </Label>
                  <input
                    type="range"
                    min={-20}
                    max={20}
                    step={1}
                    value={ttsPitch}
                    onChange={(e) => setTtsPitch(Number(e.target.value))}
                    className="mt-3 w-full accent-accent"
                  />
                </div>
              </div>
              <div>
                <Label className="text-[10px]">
                  Hướng dẫn phong cách đọc
                  <span className="ml-1 text-muted-foreground font-normal">
                    · AI chỉ DÙNG làm gợi ý giọng đọc, KHÔNG đọc đoạn này
                    thành tiếng
                  </span>
                </Label>
                <Textarea
                  value={ttsStyleInstruction}
                  onChange={(e) => setTtsStyleInstruction(e.target.value)}
                  rows={2}
                  className="mt-1 text-xs"
                  placeholder='vd: "Read aloud in a warm tone. Giọng miền Bắc."'
                />
                {ttsStyleInstruction !== DEFAULT_STYLE && (
                  <button
                    type="button"
                    onClick={() => setTtsStyleInstruction(DEFAULT_STYLE)}
                    className="mt-1 text-[10px] text-accent hover:underline"
                  >
                    Reset default
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {genError !== null && genError !== undefined ? (
        <div className="mt-2 rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive flex items-start gap-2">
          <AlertCircle className="size-3.5 mt-0.5 shrink-0" />
          <span>{String(genError)}</span>
        </div>
      ) : null}

      {hasAudio && (
        <div className="mt-3 space-y-2">
          <audio
            controls
            preload="metadata"
            src={`/tmp/${encodeURIComponent(chapter.audioFilename!)}`}
            className="w-full h-10"
          />
          <p className="text-xs text-muted-foreground">
            <span className="font-mono">
              {durSec}s / target ~{targetSec}s
            </span>
            {durSec > 0 && (
              <span className="ml-2">
                ({wordCount > 0 ? Math.round((wordCount / durSec) * 60) : 0} từ/phút
                {durSec < targetSec * 0.7 && (
                  <span className="text-amber-600 dark:text-amber-400">
                    {" "}
                    — ngắn hơn dự kiến
                  </span>
                )}
                {durSec > targetSec * 1.3 && (
                  <span className="text-amber-600 dark:text-amber-400">
                    {" "}
                    — dài hơn dự kiến
                  </span>
                )}
                )
              </span>
            )}
          </p>
        </div>
      )}
      {genPending && !hasAudio && (
        <p className="mt-2 text-xs text-muted-foreground">
          TTS ~20s, Whisper alignment ~20s. Tổng ~30-60s. Hold tight…
        </p>
      )}

      {/* Footer actions — provider/voice/Gen button outline căn phải */}
      <div className="mt-4 pt-3 border-t flex items-center justify-end gap-1.5 flex-wrap">
        <select
          value={ttsProvider}
          onChange={(e) => setTtsProvider(e.target.value as TtsProvider)}
          className="h-9 rounded-md border border-input bg-background px-2 text-xs"
          title="TTS provider"
        >
          <option value="gemini">Gemini</option>
          <option value="openai">OpenAI</option>
        </select>
        <select
          value={ttsVoice}
          onChange={(e) => setTtsVoice(e.target.value)}
          className="h-9 rounded-md border border-input bg-background px-2 text-xs"
          title="Voice"
        >
          {(ttsProvider === "gemini"
            ? GEMINI_TTS_VOICES
            : OPENAI_TTS_VOICES
          ).map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
        <Button
          size="sm"
          variant="outline"
          onClick={() => audioMut.mutate(hasAudio)}
          disabled={genPending || !chapter.transcript.trim()}
          title={
            !chapter.transcript.trim()
              ? "Cần transcript trước khi gen audio"
              : hasAudio
                ? "Re-gen audio (overwrite file cũ)"
                : "Gen TTS + Whisper alignment"
          }
        >
          {genPending ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : hasAudio ? (
            <RefreshCw className="size-3.5" />
          ) : (
            <Volume2 className="size-3.5" />
          )}
          {genPending
            ? "Đang gen…"
            : hasAudio
              ? "Re-gen"
              : "Gen audio"}
        </Button>
      </div>
    </div>
  );
}

function VideoPanel({
  chapter,
  onRender,
  renderPending,
  renderError,
}: {
  chapter: GalleryPlanChapter;
  onRender: () => void;
  renderPending: boolean;
  renderError: unknown;
}) {
  const isMusic = chapter.kind === "music";
  const hasVideo = chapter.videoFilename !== null;
  const hasAudio = chapter.audioFilename !== null;
  const beatsCount = chapter.visualBeats.length;
  const beatsWithAsset = chapter.visualBeats.filter(
    (b) => b.assetIdRef !== null,
  ).length;
  const durSec = chapter.videoDurationMs
    ? Math.round(chapter.videoDurationMs / 1000)
    : 0;

  // Phase 4e: music chapter render được luôn (silent track + overlay text).
  // Narration cần audio + ≥1 beat.
  const canRender = isMusic ? true : hasAudio && beatsCount > 0;
  const disableReason = isMusic
    ? null
    : !hasAudio
      ? "Cần gen audio trước"
      : beatsCount === 0
        ? "Cần ít nhất 1 visual beat"
        : null;

  return (
    <div className="mt-5 border-t pt-4">
      <div className="flex items-center gap-2 mb-1 flex-wrap">
        <h4 className="text-sm font-medium flex items-center gap-2">
          <Film className="size-4" />
          Video render
        </h4>
        {hasVideo && (
          <Badge variant="outline" className="text-[10px] gap-1">
            <CheckCircle2 className="size-3 text-emerald-600 dark:text-emerald-400" />
            {durSec}s · 1920×1080 @ 24fps
          </Badge>
        )}
        {beatsCount > 0 && (
          <Badge variant="outline" className="text-[10px]">
            {beatsWithAsset}/{beatsCount} beat có asset
          </Badge>
        )}
      </div>

      <p className="mb-2 text-xs text-muted-foreground leading-relaxed">
        Ghép giọng đọc + ảnh thành video Full HD. Khi voiceover đọc đến từng
        câu, ảnh tương ứng sẽ hiện ra với hiệu ứng phóng to / lia chậm như
        phim tài liệu. Beat nào chưa chọn ảnh → video sẽ hiện chữ thay thế.
        Mất 60-90 giây cho 1 chương.
      </p>

      {disableReason && !hasVideo && (
        <p className="mt-2 text-xs text-muted-foreground">
          <AlertCircle className="inline size-3 mr-1" />
          {disableReason}
        </p>
      )}

      {renderError !== null && renderError !== undefined ? (
        <div className="mt-2 rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive flex items-start gap-2">
          <AlertCircle className="size-3.5 mt-0.5 shrink-0" />
          <span>{String(renderError)}</span>
        </div>
      ) : null}

      {hasVideo && (
        <div className="mt-3 space-y-2">
          <video
            controls
            preload="metadata"
            src={`/tmp/${encodeURIComponent(chapter.videoFilename!)}`}
            className="w-full rounded-md border bg-black aspect-video"
          />
          <p className="text-xs text-muted-foreground">
            <span className="font-mono">{durSec}s</span>
            {chapter.renderedAt && (
              <span className="ml-2">
                · render {new Date(chapter.renderedAt).toLocaleString("vi-VN")}
              </span>
            )}
            {beatsWithAsset < beatsCount && (
              <span className="ml-2 text-amber-600 dark:text-amber-400">
                · {beatsCount - beatsWithAsset} beat hiện placeholder (chưa
                attach asset)
              </span>
            )}
          </p>
        </div>
      )}

      {renderPending && !hasVideo && (
        <p className="mt-2 text-xs text-muted-foreground">
          Bundle Remotion ~5s, render ~3x realtime. Chapter 4 phút → ~60-90s.
          Hold tight…
        </p>
      )}

      {/* Footer actions — Render button outline căn phải */}
      <div className="mt-4 pt-3 border-t flex items-center justify-end">
        <Button
          size="sm"
          variant="outline"
          onClick={onRender}
          disabled={renderPending || !canRender}
          title={disableReason ?? (hasVideo ? "Re-render" : "Render MP4")}
        >
          {renderPending ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : hasVideo ? (
            <RefreshCw className="size-3.5" />
          ) : (
            <VideoIcon className="size-3.5" />
          )}
          {renderPending
            ? "Đang render…"
            : hasVideo
              ? "Re-render"
              : "Render video"}
        </Button>
      </div>
    </div>
  );
}

/**
 * Build danh sách keyword gợi ý cho beat picker — kết hợp chapter.keyWorks
 * (ưu tiên, vì user đang work trong chapter này) với plan.ideaSnapshot.keyWorks
 * (broader scope). Dedup giữ thứ tự, max 10.
 *
 * Format: "{title} {medium} {year}" — đủ specific để Wikimedia/Met ra đúng ảnh.
 */
function buildBeatKeywordSuggestions(
  chapter: GalleryPlanChapter,
  idea: import("@/lib/api").GalleryBrainstormIdea,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  // 1. Tác phẩm chapter này focus (ưu tiên)
  for (const ref of chapter.keyWorks) {
    if (!ref.trim()) continue;
    const key = ref.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(ref.trim());
    if (out.length >= 10) return out;
  }
  // 2. Tác phẩm plan-wide (từ ideaSnapshot)
  for (const kw of idea.keyWorks) {
    const phrase = [kw.title, kw.medium, kw.year]
      .filter((x) => x && x.trim().length > 0)
      .join(" ")
      .trim();
    if (!phrase) continue;
    const key = phrase.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(phrase);
    if (out.length >= 10) return out;
  }
  // 3. Fallback: era/region của idea (cho ảnh bối cảnh chung)
  if (out.length < 10 && idea.era) {
    const fallback = `${idea.era} ${idea.region ?? ""} art`.trim();
    if (!seen.has(fallback.toLowerCase())) out.push(fallback);
  }
  return out;
}

function VisualBeatsEditor({
  beats,
  transcript,
  sentenceCount,
  keywordSuggestions,
  onSave,
  saving,
}: {
  beats: VisualBeat[];
  transcript: string;
  sentenceCount: number;
  keywordSuggestions: string[];
  onSave: (beats: VisualBeat[]) => void;
  saving: boolean;
}) {
  const [expanded, setExpanded] = useState(beats.length > 0);
  const sentences = splitIntoSentences(transcript);

  // Detect mismatch: beat trỏ ra ngoài range câu (sau khi user edit transcript)
  const staleBeats = beats.filter(
    (b) => b.sentenceIdx < 0 || b.sentenceIdx >= sentenceCount,
  );

  const updateBeat = (i: number, patch: Partial<VisualBeat>) => {
    const next = beats.map((b, j) => (j === i ? { ...b, ...patch } : b));
    onSave(next);
  };
  const deleteBeat = (i: number) => {
    onSave(beats.filter((_, j) => j !== i));
  };
  const addBeat = () => {
    // Thêm beat mới sau beat cuối, +2 câu hoặc cuối transcript
    const lastIdx = beats.length > 0 ? beats[beats.length - 1].sentenceIdx : -1;
    const newIdx = Math.min(lastIdx + 2, Math.max(0, sentenceCount - 1));
    onSave([
      ...beats,
      {
        sentenceIdx: newIdx,
        keyword: "",
        assetIdRef: null,
        kenBurns: "zoom-in",
        durationMs: null,
        note: "",
      },
    ]);
  };

  // Auto-fill: target ~1 beat mỗi 2.5 câu (= 6-12 giây mỗi ảnh ở tốc độ đọc
  // 160 từ/phút). Min 3 beat cho chapter ngắn.
  const targetBeatCount = Math.max(3, Math.round(sentenceCount / 2.5));
  const KEN_BURNS_ROTATION: KenBurnsMode[] = [
    "zoom-in",
    "pan-right",
    "zoom-out",
    "pan-left",
    "zoom-in",
    "pan-up",
  ];
  const autoFillBeats = () => {
    const needed = targetBeatCount - beats.length;
    if (needed <= 0) return;
    const existingIdxs = new Set(beats.map((b) => b.sentenceIdx));
    const keywordPool =
      keywordSuggestions.length > 0 ? keywordSuggestions : [""];
    const stride = Math.max(1, sentenceCount / targetBeatCount);
    const added: VisualBeat[] = [];
    for (let i = 0; i < targetBeatCount && added.length < needed; i++) {
      const idx = Math.min(
        sentenceCount - 1,
        Math.max(0, Math.round(i * stride)),
      );
      if (existingIdxs.has(idx)) continue;
      existingIdxs.add(idx);
      added.push({
        sentenceIdx: idx,
        keyword: keywordPool[added.length % keywordPool.length] ?? "",
        assetIdRef: null,
        kenBurns:
          KEN_BURNS_ROTATION[added.length % KEN_BURNS_ROTATION.length],
        durationMs: null,
        note: "",
      });
    }
    if (added.length === 0) return;
    const next = [...beats, ...added].sort(
      (a, b) => a.sentenceIdx - b.sentenceIdx,
    );
    onSave(next);
  };

  return (
    <div className="mt-5 border-t pt-4">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-2 text-sm font-medium hover:text-accent transition-colors"
      >
        <ChevronDown
          className={cn(
            "size-4 transition-transform",
            expanded && "rotate-180",
          )}
        />
        <ImageIcon className="size-4" />
        Visual beats ({beats.length})
        {staleBeats.length > 0 && (
          <Badge
            variant="outline"
            className="ml-1 text-[10px] bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30"
          >
            {staleBeats.length} stale
          </Badge>
        )}
        <span className="ml-auto text-xs text-muted-foreground font-normal">
          ~1 ảnh/{Math.max(1, Math.round(sentenceCount / Math.max(1, beats.length)))} câu
        </span>
      </button>

      <p className="mt-1.5 ml-6 text-xs text-muted-foreground leading-relaxed">
        Danh sách các "khoảnh khắc hình ảnh" trong video — mỗi beat là 1 ảnh
        đi kèm voiceover. Khi đọc đến câu nào, ảnh tương ứng sẽ hiện ra với
        hiệu ứng phóng to / lia chậm.
        {sentenceCount > 0 && (
          <>
            {" "}Chương này dài <strong>{sentenceCount} câu</strong> → gợi ý
            khoảng <strong>{targetBeatCount} ảnh</strong> ({beats.length}{" "}
            beat hiện có). Bấm "Tự fill" để hệ thống sinh đủ scaffold, rồi
            "Attach asset" cho từng beat — hoặc xoá beat không cần.
          </>
        )}
      </p>

      {expanded && (
        <div className="mt-3 space-y-2">
          {beats.length === 0 ? (
            <div className="rounded-md bg-secondary/20 p-4 text-center space-y-2">
              <p className="text-xs text-muted-foreground">
                Chưa có beat nào. Bấm <strong>"Tự fill"</strong> để hệ thống
                tạo sẵn {targetBeatCount} beat scaffold theo độ dài chương,
                hoặc <strong>"Thêm beat"</strong> để thêm từng cái.
              </p>
            </div>
          ) : (
            beats.map((beat, i) => (
              <BeatRow
                key={i}
                beat={beat}
                idx={i}
                totalBeats={beats.length}
                sentences={sentences}
                sentenceCount={sentenceCount}
                keywordSuggestions={keywordSuggestions}
                onUpdate={(patch) => updateBeat(i, patch)}
                onDelete={() => deleteBeat(i)}
                disabled={saving}
              />
            ))
          )}

          {/* Footer actions — Tự fill + Thêm beat căn phải */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t mt-2">
            {saving && (
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground mr-auto">
                <Loader2 className="size-3 animate-spin" />
                Đang lưu…
              </span>
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={autoFillBeats}
              disabled={
                saving ||
                sentenceCount === 0 ||
                beats.length >= targetBeatCount
              }
              title={
                beats.length >= targetBeatCount
                  ? `Đã đủ ${beats.length}/${targetBeatCount} beat — nếu cần thêm bấm "Thêm beat"`
                  : `Sinh thêm ${targetBeatCount - beats.length} beat để đủ scaffold`
              }
            >
              <Sparkles className="size-3.5" />
              Tự fill ~{targetBeatCount} beat
              {beats.length > 0 && beats.length < targetBeatCount && (
                <span className="text-muted-foreground font-normal">
                  {" "}(+{targetBeatCount - beats.length})
                </span>
              )}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={addBeat}
              disabled={saving || sentenceCount === 0}
            >
              <Plus className="size-3.5" />
              Thêm beat
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function BeatRow({
  beat,
  idx,
  totalBeats,
  sentences,
  sentenceCount,
  keywordSuggestions,
  onUpdate,
  onDelete,
  disabled,
}: {
  beat: VisualBeat;
  idx: number;
  totalBeats: number;
  sentences: string[];
  sentenceCount: number;
  keywordSuggestions: string[];
  onUpdate: (patch: Partial<VisualBeat>) => void;
  onDelete: () => void;
  disabled: boolean;
}) {
  const isStale =
    beat.sentenceIdx < 0 || beat.sentenceIdx >= sentenceCount;
  const sentencePreview = sentences[beat.sentenceIdx]?.slice(0, 80) ?? "(out of range)";

  return (
    <div
      className={cn(
        "rounded-md bg-secondary/30 p-3 space-y-2",
        isStale && "bg-amber-500/10 ring-1 ring-amber-500/30",
      )}
    >
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-mono text-muted-foreground w-6 shrink-0">
          #{idx + 1}/{totalBeats}
        </span>
        <div className="flex items-center gap-1">
          <span className="text-xs text-muted-foreground">@câu</span>
          <input
            type="number"
            min={0}
            max={Math.max(0, sentenceCount - 1)}
            value={beat.sentenceIdx}
            onChange={(e) =>
              onUpdate({ sentenceIdx: Math.max(0, Number(e.target.value)) })
            }
            disabled={disabled}
            className="h-7 w-14 rounded border bg-background px-2 text-xs font-mono"
          />
        </div>
        <select
          value={beat.kenBurns}
          onChange={(e) =>
            onUpdate({ kenBurns: e.target.value as KenBurnsMode })
          }
          disabled={disabled}
          className="h-7 rounded border bg-background px-2 text-xs"
          title="Ken Burns motion"
        >
          {KEN_BURNS_OPTIONS.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        <a
          href={`https://commons.wikimedia.org/w/index.php?search=${encodeURIComponent(beat.keyword)}&title=Special:MediaSearch&go=Go&type=image`}
          target="_blank"
          rel="noreferrer"
          className={cn(
            "text-xs text-accent hover:underline inline-flex items-center gap-0.5 ml-auto",
            !beat.keyword && "pointer-events-none opacity-40",
          )}
          title="Search Wikimedia Commons"
        >
          <ExternalLink className="size-3" />
          Search
        </a>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 w-7 p-0 text-destructive hover:bg-destructive/10"
          onClick={onDelete}
          disabled={disabled}
          title="Xoá beat"
        >
          <X className="size-3.5" />
        </Button>
      </div>
      <input
        type="text"
        value={beat.keyword}
        onChange={(e) => onUpdate({ keyword: e.target.value })}
        disabled={disabled}
        placeholder='Keyword (tiếng Anh): vd "Giotto Lamentation full fresco Arena Chapel"'
        className="w-full h-8 rounded border bg-background px-2 text-sm"
      />
      <p
        className={cn(
          "text-xs italic",
          isStale ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground",
        )}
      >
        {isStale
          ? `⚠ Stale — câu #${beat.sentenceIdx} không còn trong transcript (chỉ có ${sentenceCount} câu)`
          : `Câu khớp: "${sentencePreview}${sentencePreview.length === 80 ? "…" : ""}"`}
      </p>
      {beat.note && (
        <p className="text-xs text-muted-foreground">
          <span className="font-medium">Note:</span> {beat.note}
        </p>
      )}

      {/* Phase 4c: asset attach */}
      <BeatAssetSlot
        beat={beat}
        keywordSuggestions={keywordSuggestions}
        onAttach={(assetId) => onUpdate({ assetIdRef: assetId })}
        onDetach={() => onUpdate({ assetIdRef: null })}
        disabled={disabled}
      />
    </div>
  );
}

function BeatAssetSlot({
  beat,
  keywordSuggestions,
  onAttach,
  onDetach,
  disabled,
}: {
  beat: VisualBeat;
  keywordSuggestions: string[];
  onAttach: (assetId: string) => void;
  onDetach: () => void;
  disabled: boolean;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);

  // Resolve assetIdRef → asset (chỉ fetch khi có ref)
  const assetQ = useQuery({
    queryKey: ["research-asset", beat.assetIdRef],
    queryFn: () => api.getResearchAsset(beat.assetIdRef!),
    enabled: !!beat.assetIdRef,
    // Asset bị xoá khỏi library → 404. Đừng retry vô tận.
    retry: false,
  });

  const attached = assetQ.data;
  const isMissing = !!beat.assetIdRef && assetQ.isError;

  return (
    <div className="border-t pt-2">
      {attached ? (
        <div className="flex items-center gap-3">
          <img
            src={attached.thumbUrl}
            alt={attached.title}
            className="size-12 rounded object-cover bg-secondary shrink-0"
            loading="lazy"
          />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium truncate">{attached.title}</p>
            <p className="text-[10px] text-muted-foreground truncate">
              {attached.provider} · {attached.license}
              {attached.year && ` · ${attached.year}`}
            </p>
          </div>
          <a
            href={attached.sourcePage}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-accent hover:underline shrink-0"
            title="Open source page"
          >
            <ExternalLink className="size-3" />
          </a>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs"
            onClick={() => setPickerOpen((v) => !v)}
            disabled={disabled}
          >
            Replace
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0 text-destructive hover:bg-destructive/10"
            onClick={onDetach}
            disabled={disabled}
            title="Detach asset"
          >
            <X className="size-3.5" />
          </Button>
        </div>
      ) : isMissing ? (
        <div className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400">
          <AlertCircle className="size-3.5" />
          <span>Asset {beat.assetIdRef} không còn trong library.</span>
          <Button size="sm" variant="ghost" className="h-7" onClick={onDetach}>
            Detach
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7"
            onClick={() => setPickerOpen(true)}
          >
            Pick lại
          </Button>
        </div>
      ) : (
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs w-full"
          onClick={() => setPickerOpen((v) => !v)}
          disabled={disabled || !beat.keyword.trim()}
        >
          <ImageIcon className="size-3.5" />
          Attach asset
          {!beat.keyword.trim() && " — cần keyword trước"}
        </Button>
      )}

      {pickerOpen && (
        <BeatAssetPicker
          initialQuery={beat.keyword}
          suggestions={keywordSuggestions}
          onPick={(assetId) => {
            onAttach(assetId);
            setPickerOpen(false);
          }}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  );
}

function BeatAssetPicker({
  initialQuery,
  suggestions,
  onPick,
  onClose,
}: {
  initialQuery: string;
  suggestions: string[];
  onPick: (assetId: string) => void;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [q, setQ] = useState(initialQuery);
  const [tab, setTab] = useState<"library" | "live">("library");

  const libraryQ = useQuery({
    queryKey: ["research-library-pick", q],
    queryFn: () => api.listResearchLibrary({ q, kind: "image" }),
    enabled: tab === "library",
  });

  const searchQ = useQuery({
    queryKey: ["research-search-pick", q],
    queryFn: () =>
      api.searchResearch({
        q,
        kind: "image",
        page: 1,
        pageSize: 12,
      }),
    enabled: tab === "live" && q.trim().length >= 2,
    // Live search có rate limit — không auto refetch
    staleTime: 5 * 60_000,
  });

  // Save + attach trong 1 click cho live search result (chưa trong library)
  const saveMut = useMutation({
    mutationFn: (asset: AssetResult) => api.saveResearchAsset(asset),
    onSuccess: (saved) => {
      qc.invalidateQueries({ queryKey: ["research-library-pick"] });
      onPick(saved.id);
    },
  });

  return (
    <div className="mt-2 pt-3 border-t space-y-2">
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search keyword (tiếng Anh)…"
          className="h-9 flex-1 rounded-md border border-input bg-background px-2 text-sm"
        />
        <div className="flex items-center gap-0.5 p-0.5 rounded border bg-secondary/30">
          <button
            onClick={() => setTab("library")}
            className={cn(
              "px-2 py-1 text-xs rounded transition-colors",
              tab === "library"
                ? "bg-card text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            Library
          </button>
          <button
            onClick={() => setTab("live")}
            className={cn(
              "px-2 py-1 text-xs rounded transition-colors",
              tab === "live"
                ? "bg-card text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            Wikimedia/Met
          </button>
        </div>
        <Button
          size="sm"
          variant="ghost"
          className="h-8 w-8 p-0"
          onClick={onClose}
          title="Đóng"
        >
          <X className="size-3.5" />
        </Button>
      </div>

      {/* Gợi ý keyword từ plan / chapter — click để fill search */}
      {suggestions.length > 0 && (
        <div className="flex flex-wrap gap-1.5 items-center">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground self-center">
            Gợi ý:
          </span>
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setQ(s)}
              className={cn(
                "h-7 px-2 rounded-md border text-xs transition-colors max-w-[260px] truncate",
                q === s
                  ? "border-accent bg-accent/20 text-foreground"
                  : "border-input hover:bg-secondary text-muted-foreground",
              )}
              title={`Search "${s}"`}
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {tab === "library" && (
        <AssetGrid
          items={libraryQ.data?.assets ?? []}
          isLoading={libraryQ.isLoading}
          emptyMsg={
            q.trim()
              ? `Library chưa có ảnh khớp "${q}". Thử tab "Wikimedia/Met".`
              : "Library chưa có ảnh nào."
          }
          onPick={(asset) => onPick(asset.id)}
        />
      )}

      {tab === "live" && (
        <AssetGrid
          items={searchQ.data?.results ?? []}
          isLoading={searchQ.isLoading}
          emptyMsg={
            q.trim().length < 2
              ? "Nhập keyword tối thiểu 2 chars."
              : `Không tìm thấy kết quả cho "${q}".`
          }
          onPick={(asset) => saveMut.mutate(asset)}
          actionLabel="Save + Attach"
          saving={saveMut.isPending}
        />
      )}
    </div>
  );
}

function AssetGrid({
  items,
  isLoading,
  emptyMsg,
  onPick,
  actionLabel = "Attach",
  saving = false,
}: {
  items: Array<SavedAsset | AssetResult>;
  isLoading: boolean;
  emptyMsg: string;
  onPick: (asset: AssetResult) => void;
  actionLabel?: string;
  saving?: boolean;
}) {
  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground py-3">
        <Loader2 className="size-3.5 animate-spin" />
        Đang tải…
      </div>
    );
  }
  if (items.length === 0) {
    return <p className="text-xs text-muted-foreground py-3">{emptyMsg}</p>;
  }
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
      {items.map((asset) => (
        <button
          key={asset.id}
          onClick={() => onPick(asset)}
          disabled={saving}
          className="group relative rounded-md border bg-secondary/20 overflow-hidden hover:border-accent transition-colors text-left disabled:opacity-50"
          title={asset.title}
        >
          <img
            src={asset.thumbUrl}
            alt={asset.title}
            loading="lazy"
            className="w-full aspect-[4/3] object-cover"
          />
          <div className="p-1.5 space-y-0.5">
            <p className="text-[10px] font-medium truncate">{asset.title}</p>
            <p className="text-[9px] text-muted-foreground truncate">
              {asset.provider} · {asset.license}
            </p>
          </div>
          <div className="absolute inset-x-0 bottom-0 bg-accent text-accent-foreground text-[10px] py-1 px-2 opacity-0 group-hover:opacity-100 transition-opacity text-center font-medium">
            {actionLabel}
          </div>
        </button>
      ))}
    </div>
  );
}

function CopyChip({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      size="sm"
      variant="ghost"
      className="h-9 px-2"
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

// ─── Phase 4e: Plan-level concat export ─────────────────────────────────

function ExportPanel({
  plan,
  onMutate,
}: {
  plan: GalleryChapterPlan;
  onMutate: (plan: GalleryChapterPlan) => void;
}) {
  const exportMut = useMutation({
    mutationFn: () => api.exportGalleryPlan(plan.id),
    onSuccess: (res) => onMutate(res.plan),
  });

  const totalChapters = plan.chapters.length;
  const renderedChapters = plan.chapters.filter(
    (c) => c.videoFilename !== null,
  ).length;
  const allRendered = renderedChapters === totalChapters && totalChapters > 0;
  const hasOutput = plan.outputFilename !== null;
  const outputDurMin = plan.outputDurationMs
    ? Math.round(plan.outputDurationMs / 60_000)
    : 0;
  const outputDurSec = plan.outputDurationMs
    ? Math.round(plan.outputDurationMs / 1000) % 60
    : 0;

  const chaptersTxtUrl = `/tmp/gallery-${plan.id}-chapters.txt`;

  return (
    <Card className="p-5 mt-6">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="font-serif text-lg flex items-center gap-2">
            <Film className="size-5 text-accent" />
            Export final video
          </h2>
          <p className="text-xs text-muted-foreground mt-1">
            Ghép tất cả chương thành 1 video hoàn chỉnh + nhúng mốc chương để
            YouTube tự nhận diện (vạch chia chương khi xem) + tạo file mô tả
            để dán vào phần Description khi upload YouTube.
          </p>
        </div>
        <Badge variant="outline" className="gap-1 shrink-0">
          <CheckCircle2
            className={cn(
              "size-3",
              allRendered
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-muted-foreground",
            )}
          />
          {renderedChapters}/{totalChapters} chương rendered
        </Badge>
      </div>

      {!allRendered && (
        <p className="mt-3 text-xs text-amber-600 dark:text-amber-400 inline-flex items-center gap-1">
          <AlertCircle className="size-3.5" />
          Cần render tất cả chương trước khi concat. Còn{" "}
          {totalChapters - renderedChapters} chương chưa render.
        </p>
      )}

      {exportMut.isError && (
        <div className="mt-3 rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive flex items-start gap-2">
          <AlertCircle className="size-3.5 mt-0.5 shrink-0" />
          <span>{String(exportMut.error)}</span>
        </div>
      )}

      {hasOutput && (
        <div className="mt-4 space-y-2">
          <video
            controls
            preload="metadata"
            src={`/tmp/${encodeURIComponent(plan.outputFilename!)}`}
            className="w-full rounded-md border bg-black aspect-video"
          />
          <p className="text-xs text-muted-foreground">
            <span className="font-mono">
              {outputDurMin}m {outputDurSec}s
            </span>
            {plan.exportedAt && (
              <span className="ml-2">
                · export {new Date(plan.exportedAt).toLocaleString("vi-VN")}
              </span>
            )}
          </p>
        </div>
      )}

      {/* Footer actions — outline + căn phải */}
      <div className="mt-4 pt-4 border-t flex items-center justify-end gap-2">
        {hasOutput && (
          <>
            <a
              href={chaptersTxtUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border hover:bg-secondary transition-colors"
              title="Mở chapters.txt cho YouTube description"
            >
              <FileText className="size-3.5" />
              chapters.txt
            </a>
            <a
              href={`/tmp/${encodeURIComponent(plan.outputFilename!)}`}
              download={plan.outputFilename!}
              className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border hover:bg-secondary transition-colors"
            >
              <Download className="size-3.5" />
              Tải MP4
            </a>
          </>
        )}
        <Button
          size="sm"
          variant="outline"
          onClick={() => exportMut.mutate()}
          disabled={!allRendered || exportMut.isPending}
        >
          {exportMut.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : hasOutput ? (
            <RefreshCw className="size-4" />
          ) : (
            <Film className="size-4" />
          )}
          {exportMut.isPending
            ? "Đang concat…"
            : hasOutput
              ? "Re-export"
              : "Export final video"}
        </Button>
      </div>

      {exportMut.isPending && (
        <p className="mt-2 text-xs text-muted-foreground">
          ffmpeg concat copy mode (không re-encode) + inject metadata ~10-30s.
          Hold tight…
        </p>
      )}
    </Card>
  );
}

// ─── Phase 4e.x: Plan-level BGM uploader ─────────────────────────────

const BGM_ACCEPT = ".mp3,.m4a,.wav,.aac,audio/*";

/**
 * Mapping era → music keyword gợi ý cho user search BGM. Mỗi era 5-6 keyword
 * specific (composer + form) — phù hợp atmosphere documentary art. Generic
 * fallback cho era không match.
 */
const ERA_MUSIC_KEYWORDS: Record<string, string[]> = {
  Ancient: [
    "Ancient Greek lyre",
    "Roman cithara",
    "Egyptian harp drone",
    "Antique flute solo",
  ],
  Medieval: [
    "Gregorian chant",
    "Medieval organum",
    "Plainsong contemplative",
    "Hildegard von Bingen",
    "Troubadour song lute",
  ],
  "Early-Renaissance": [
    "Early Renaissance choir",
    "Gregorian polyphony",
    "Medieval lute solo",
    "Sacred plainsong",
    "Du Fay motet",
  ],
  "High-Renaissance": [
    "Renaissance lute solo",
    "Madrigal a cappella",
    "Viol consort",
    "Palestrina motet",
    "Josquin des Prez",
    "Recorder ensemble",
  ],
  Mannerism: [
    "Late Renaissance choral",
    "Monteverdi madrigal",
    "Early Baroque vocal",
  ],
  Baroque: [
    "Bach cello suite",
    "Vivaldi Four Seasons",
    "Pachelbel Canon",
    "Handel Largo",
    "Baroque harpsichord solo",
    "Corelli concerto grosso",
    "Albinoni adagio",
  ],
  Rococo: [
    "Couperin harpsichord",
    "Galant style chamber",
    "Telemann flute",
    "Early Mozart divertimento",
  ],
  Neoclassical: [
    "Mozart string quartet",
    "Haydn adagio",
    "Beethoven moonlight sonata",
    "Classical piano sonata",
    "Schubert impromptu",
  ],
  Romanticism: [
    "Chopin nocturne",
    "Schumann träumerei",
    "Brahms intermezzo",
    "Liszt liebestraum",
    "Mendelssohn songs without words",
  ],
  Realism: [
    "Late Romantic strings",
    "Mahler adagietto",
    "Saint-Saëns swan",
  ],
  Impressionism: [
    "Debussy clair de lune",
    "Ravel pavane defunte",
    "Satie Gymnopédie",
    "Fauré pavane",
  ],
  "Post-Impressionism": [
    "Satie ambient piano",
    "Early Stravinsky",
    "Vaughan Williams lark ascending",
  ],
  Modern: [
    "Arvo Pärt minimalist",
    "Philip Glass piano études",
    "Górecki sorrowful symphony",
    "Henryk Górecki",
  ],
  Contemporary: [
    "Max Richter on the nature of daylight",
    "Ludovico Einaudi piano",
    "Ólafur Arnalds ambient strings",
    "Nils Frahm",
  ],
};

const GENERIC_BGM_KEYWORDS = [
  "Cinematic strings ambient",
  "Documentary contemplative piano",
  "Classical instrumental no vocals",
  "Solo cello documentary",
  "Slow chamber music",
];

const REGION_BGM_HINT: Record<string, string> = {
  Italian: "Italian Baroque Vivaldi",
  "Dutch-Flemish": "Dutch Golden Age Sweelinck",
  French: "French Baroque Couperin",
  Spanish: "Spanish Renaissance Victoria",
  German: "German Baroque Bach",
  English: "English Renaissance Tallis",
  American: "American minimalist Glass",
  Asian: "Traditional Asian instrumental",
  Russian: "Russian Orthodox choir",
};

function buildBgmKeywordSuggestions(
  idea: import("@/lib/api").GalleryBrainstormIdea,
): string[] {
  // Tìm era key bằng partial match (era field free-text từ LLM, vd "1267-1337, tiền-Phục Hưng Ý")
  const eraLower = idea.era.toLowerCase();
  let eraKeywords: string[] = [];
  for (const [eraKey, kws] of Object.entries(ERA_MUSIC_KEYWORDS)) {
    if (eraLower.includes(eraKey.toLowerCase().replace(/-/g, " "))) {
      eraKeywords = kws;
      break;
    }
  }
  if (eraKeywords.length === 0) eraKeywords = GENERIC_BGM_KEYWORDS;

  const regionHint = REGION_BGM_HINT[idea.region];
  const out: string[] = [];
  if (regionHint) out.push(regionHint);
  for (const kw of eraKeywords) {
    if (out.length >= 10) break;
    if (!out.includes(kw)) out.push(kw);
  }
  // Pad với generic nếu chưa đủ 10
  for (const kw of GENERIC_BGM_KEYWORDS) {
    if (out.length >= 10) break;
    if (!out.includes(kw)) out.push(kw);
  }
  return out;
}

function BgmPanel({
  plan,
  onMutate,
}: {
  plan: GalleryChapterPlan;
  onMutate: (plan: GalleryChapterPlan) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const uploadMut = useMutation({
    mutationFn: (file: File) => api.uploadGalleryPlanBgm(plan.id, file),
    onSuccess: (updated) => onMutate(updated),
  });

  const deleteMut = useMutation({
    mutationFn: () => api.deleteGalleryPlanBgm(plan.id),
    onSuccess: (updated) => onMutate(updated),
  });

  const hasBgm = plan.bgmFilename !== null;
  const bgmUrl = hasBgm
    ? `/tmp/${encodeURIComponent(plan.bgmFilename!)}`
    : null;

  const musicSuggestions = buildBgmKeywordSuggestions(plan.ideaSnapshot);
  const [copiedKw, setCopiedKw] = useState<string | null>(null);
  const copyKeyword = async (kw: string) => {
    try {
      await navigator.clipboard.writeText(kw);
      setCopiedKw(kw);
      setTimeout(() => setCopiedKw(null), 1500);
    } catch {
      /* clipboard denied */
    }
  };

  return (
    <Card className="p-4 mb-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h4 className="text-sm font-medium flex items-center gap-2">
            <Music className="size-4" />
            Nhạc nền (BGM)
            {hasBgm ? (
              <Badge variant="outline" className="text-[10px] gap-1 border-emerald-500/40 text-emerald-700 dark:text-emerald-400 bg-emerald-500/5">
                <CheckCircle2 className="size-3" />
                {plan.bgmFilename!.split("-bgm.")[1]?.toUpperCase() ??
                  "uploaded"}
              </Badge>
            ) : (
              <Badge variant="outline" className="text-[10px]">
                Chưa upload
              </Badge>
            )}
          </h4>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
            {hasBgm
              ? "Hệ thống tự phối nhạc nền với giọng đọc (nhạc nhỏ lại khi có lời, đầy đủ khi không). Các đoạn nhạc xen kẽ sẽ phát đầy đủ + lặp lại nếu cần."
              : "Tải lên 1 bản nhạc nền (mp3/m4a/wav). Có nhạc nền thì voiceover sẽ có ambient đệm + các đoạn nhạc xen kẽ giữa chương sẽ phát nhạc thay vì im lặng."}
          </p>
        </div>
      </div>

      {/* Keyword gợi ý tìm nhạc theo era của plan — click chip để copy + search */}
      {musicSuggestions.length > 0 && (
        <div className="mt-3">
          <div className="flex flex-wrap gap-1.5 items-center">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground self-center">
              Gợi ý tìm nhạc:
            </span>
            {musicSuggestions.map((kw) => (
              <button
                key={kw}
                type="button"
                onClick={() => copyKeyword(kw)}
                className={cn(
                  "h-7 px-2 rounded-md border text-xs transition-colors max-w-[260px] truncate",
                  copiedKw === kw
                    ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                    : "border-input hover:bg-secondary text-muted-foreground",
                )}
                title={
                  copiedKw === kw
                    ? "Đã copy vào clipboard"
                    : `Copy "${kw}" rồi paste vào trang nhạc bên dưới`
                }
              >
                {copiedKw === kw ? `✓ Đã copy: ${kw}` : kw}
              </button>
            ))}
          </div>
          <p className="mt-2 text-[10px] text-muted-foreground">
            Tải nhạc royalty-free từ:{" "}
            <a
              href="https://freemusicarchive.org/genres/Classical"
              target="_blank"
              rel="noreferrer"
              className="text-accent hover:underline"
            >
              Free Music Archive
            </a>{" "}
            ·{" "}
            <a
              href="https://pixabay.com/music/search/classical/"
              target="_blank"
              rel="noreferrer"
              className="text-accent hover:underline"
            >
              Pixabay Music
            </a>{" "}
            ·{" "}
            <a
              href="https://www.youtube.com/audiolibrary"
              target="_blank"
              rel="noreferrer"
              className="text-accent hover:underline"
            >
              YouTube Audio Library
            </a>{" "}
            ·{" "}
            <a
              href="https://incompetech.com/music/royalty-free/music.html"
              target="_blank"
              rel="noreferrer"
              className="text-accent hover:underline"
            >
              Incompetech (Kevin MacLeod)
            </a>
          </p>
        </div>
      )}

      {hasBgm && bgmUrl && (
        <audio
          controls
          preload="metadata"
          src={bgmUrl}
          className="w-full h-10 mt-3"
        />
      )}

      {uploadMut.isError && (
        <p className="mt-2 text-xs text-destructive">
          <AlertCircle className="inline size-3" /> {String(uploadMut.error)}
        </p>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept={BGM_ACCEPT}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) uploadMut.mutate(f);
          e.target.value = "";
        }}
      />

      {/* Footer actions — outline + căn phải */}
      <div className="mt-3 pt-3 border-t flex items-center justify-end gap-2">
        {hasBgm && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              if (window.confirm("Xoá BGM khỏi plan?")) {
                deleteMut.mutate();
              }
            }}
            disabled={deleteMut.isPending}
            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
          >
            {deleteMut.isPending ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Trash2 className="size-3.5" />
            )}
            Xoá BGM
          </Button>
        )}
        <Button
          size="sm"
          variant="outline"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploadMut.isPending}
        >
          {uploadMut.isPending ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Upload className="size-3.5" />
          )}
          {hasBgm ? "Đổi BGM" : "Upload BGM"}
        </Button>
      </div>
    </Card>
  );
}

