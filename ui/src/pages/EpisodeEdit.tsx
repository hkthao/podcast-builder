import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  FileAudio2,
  Calendar,
  Hash,
  Play,
  Download,
  FileText,
  Settings,
  Film,
  Pencil,
  Save,
  X as XIcon,
  Loader2,
  Trash2,
  Files,
  Volume2,
  Lock,
  Search,
  AlertCircle,
  Sparkles,
  Copy,
  Check,
  Send,
} from "lucide-react";
import {
  api,
  type EpisodeFile,
  type EpisodeFileKind,
  type EpisodeSummary,
  type ScenePlanItem,
  type TranscriptSegment,
} from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EpisodeConfigForm } from "@/components/EpisodeConfigForm";
import { RenderTab } from "@/components/RenderTab";
import { PublishTab } from "@/components/PublishTab";
import { ScriptTab } from "@/components/ScriptTab";
import { cn } from "@/lib/utils";

/**
 * 5 tab top-level (gộp từ 7): config / content / render / publish / files.
 * `content` chứa 3 sub-tab pipeline tạo: script → transcript → scenes.
 */
type Tab = "config" | "content" | "render" | "publish" | "files";
type ContentSubTab = "script" | "transcript" | "scenes";

export function EpisodeEdit() {
  const { name = "" } = useParams<{ name: string }>();
  const [tab, setTab] = useState<Tab>("config");
  const [contentSub, setContentSub] = useState<ContentSubTab>("script");

  const epQ = useQuery({
    queryKey: ["episode", name],
    queryFn: () => api.getEpisode(name),
    enabled: !!name,
  });
  const planQ = useQuery({
    queryKey: ["plan", name],
    queryFn: () => api.getPlan(name),
    enabled: !!name,
  });
  const transcriptQ = useQuery({
    queryKey: ["transcript", name],
    queryFn: () => api.getTranscript(name),
    enabled: !!name,
  });

  const filesQ = useQuery({
    queryKey: ["episode-files", name],
    queryFn: () => api.getFiles(name),
    enabled: !!name,
  });

  if (epQ.isLoading) {
    return (
      <div className="container max-w-4xl py-10">
        <div className="h-8 w-48 animate-pulse rounded bg-muted/40 mb-6" />
        <Card className="h-96 animate-pulse bg-muted/30" />
      </div>
    );
  }

  if (epQ.error || !epQ.data) {
    return (
      <div className="container max-w-4xl py-10">
        <Link
          to="/"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4"
        >
          <ArrowLeft className="size-4" />
          Danh sách tập
        </Link>
        <Card className="border-destructive/40 bg-destructive/5 p-6">
          <div className="font-medium text-destructive">
            Không load được tập "{name}"
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            {String(epQ.error)}
          </p>
        </Card>
      </div>
    );
  }

  const ep = epQ.data;
  const planCount = planQ.data?.totalScenes ?? 0;
  const transcriptCount = transcriptQ.data?.totalSegments ?? 0;
  const filesCount =
    (filesQ.data?.input.length ?? 0) +
    (filesQ.data?.output.length ?? 0) +
    (filesQ.data?.tmp.length ?? 0);

  return (
    <div className="container max-w-4xl py-10">
      <Link
        to="/"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4"
      >
        <ArrowLeft className="size-4" />
        Danh sách tập
      </Link>

      <header className="mb-6 flex items-start justify-between gap-6">
        <div className="flex-1 min-w-0">
          <h1 className="font-serif text-3xl tracking-tight">
            {ep.config.title}
          </h1>
          {ep.config.hook && (
            <p className="mt-2 text-muted-foreground italic">
              "{ep.config.hook}"
            </p>
          )}
          {ep.config.essayId && (
            <p className="mt-2 text-xs text-muted-foreground">
              <Link
                to="/essay"
                className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
                title={ep.config.essayId}
              >
                <FileText className="size-3" />
                Essay đã link: <code className="font-mono">{ep.config.essayId}</code>
              </Link>
            </p>
          )}
        </div>
        <Badge variant={ep.status === "rendered" ? "accent" : "outline"}>
          {labelFor(ep.status)}
        </Badge>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <Meta icon={<Hash className="size-4" />} label="Số tập">
          {String(ep.config.episodeNumber).padStart(3, "0")}
        </Meta>
        <Meta icon={<FileAudio2 className="size-4" />} label="Audio">
          {ep.audioPath ? "✓" : "—"}
        </Meta>
        <Meta icon={<Calendar className="size-4" />} label="Đã render">
          {ep.renderedAt ? new Date(ep.renderedAt).toLocaleDateString() : "—"}
        </Meta>
        <Meta icon={<Download className="size-4" />} label="Đầu ra">
          {ep.hasOutput ? "✓ mp4" : "—"}
        </Meta>
      </div>

      {/* Audio uploader — luôn hiện. Prompt mạnh nếu chưa có audio. */}
      <AudioUploadPanel ep={ep} />


      {/* Tabs — 5 top-level (gộp 3 production stage thành "Nội dung") */}
      <div className="mb-4 flex gap-1 border-b">
        <TabButton
          active={tab === "config"}
          onClick={() => setTab("config")}
          icon={<Settings className="size-4" />}
          label="Cấu hình"
        />
        <TabButton
          active={tab === "content"}
          onClick={() => setTab("content")}
          icon={<FileText className="size-4" />}
          label={`Nội dung${
            transcriptCount > 0 || planCount > 0
              ? ` (${[transcriptCount && `${transcriptCount} câu`, planCount && `${planCount} cảnh`].filter(Boolean).join(" · ")})`
              : ""
          }`}
        />
        <TabButton
          active={tab === "render"}
          onClick={() => setTab("render")}
          icon={<Play className="size-4" />}
          label={`Render${ep.hasOutput ? " ✓" : ""}`}
        />
        <TabButton
          active={tab === "publish"}
          onClick={() => setTab("publish")}
          icon={<Send className="size-4" />}
          label={`Đăng${
            ep.config.publishStatus === "published"
              ? " ✓"
              : ep.config.publishStatus === "ready"
                ? " ●"
                : ""
          }`}
        />
        <TabButton
          active={tab === "files"}
          onClick={() => setTab("files")}
          icon={<Files className="size-4" />}
          label={`File${filesCount > 0 ? ` (${filesCount})` : ""}`}
        />
      </div>

      {tab === "config" && <EpisodeConfigForm ep={ep} />}

      {tab === "content" && (
        <>
          {/* Sub-tabs: script (podcast only) → transcript → cảnh */}
          <div className="mb-4 flex gap-1 flex-wrap text-xs">
            {ep.config.style === "podcast" && (
              <SubTabButton
                active={contentSub === "script"}
                onClick={() => setContentSub("script")}
                icon={<Sparkles className="size-3.5" />}
                label="Kịch bản"
              />
            )}
            <SubTabButton
              active={contentSub === "transcript"}
              onClick={() => setContentSub("transcript")}
              icon={<FileText className="size-3.5" />}
              label={`Transcript${transcriptCount > 0 ? ` · ${transcriptCount}` : ""}`}
            />
            <SubTabButton
              active={contentSub === "scenes"}
              onClick={() => setContentSub("scenes")}
              icon={<Film className="size-3.5" />}
              label={`Cảnh${planCount > 0 ? ` · ${planCount}` : ""}`}
            />
          </div>

          {contentSub === "script" && ep.config.style === "podcast" && (
            <ScriptTab ep={ep} />
          )}
          {contentSub === "script" && ep.config.style !== "podcast" && (
            <p className="text-sm text-muted-foreground italic">
              Kịch bản dialogue chỉ áp dụng cho podcast style.
            </p>
          )}
          {contentSub === "transcript" && (
            <TranscriptPanel
              episodeName={name}
              segments={transcriptQ.data?.segments ?? []}
              source={transcriptQ.data?.source ?? "none"}
              loading={transcriptQ.isLoading}
              hasAudio={!!ep.audioPath}
            />
          )}
          {contentSub === "scenes" && (
            <ScenesPanel
              episodeName={name}
              scenes={planQ.data?.scenes ?? []}
              totalDurationMs={planQ.data?.totalDurationMs ?? 0}
              loading={planQ.isLoading}
              hasTranscript={transcriptCount > 0}
            />
          )}
        </>
      )}

      {tab === "render" && (
        <RenderTab
          ep={ep}
          files={
            filesQ.data ?? { input: [], output: [], tmp: [] }
          }
          loading={filesQ.isLoading}
          hasTranscript={transcriptCount > 0}
          hasPlan={planCount > 0}
        />
      )}
      {tab === "publish" && (
        <PublishTab
          ep={ep}
          files={filesQ.data ?? { input: [], output: [], tmp: [] }}
          loading={filesQ.isLoading}
        />
      )}
      {tab === "files" && (
        <FilesPanel
          episodeName={name}
          input={filesQ.data?.input ?? []}
          tmp={filesQ.data?.tmp ?? []}
          loading={filesQ.isLoading}
        />
      )}
    </div>
  );
}

function AudioUploadPanel({ ep }: { ep: EpisodeSummary }) {
  const qc = useQueryClient();
  const uploadMut = useMutation({
    mutationFn: (file: File) => api.uploadEpisodeAudio(ep.name, file),
    onSuccess: (updated) => {
      qc.setQueryData(["episode", ep.name], updated);
      qc.invalidateQueries({ queryKey: ["episode-files", ep.name] });
      qc.invalidateQueries({ queryKey: ["transcript", ep.name] });
    },
  });

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) uploadMut.mutate(f);
    e.target.value = "";
  };

  const hasAudio = !!ep.audioPath;
  const filename = ep.audioPath?.split("/").pop() ?? "";
  const audioUrl = hasAudio
    ? `/input/${encodeURIComponent(filename)}`
    : null;

  return (
    <Card
      className={cn(
        "p-5 mb-6",
        !hasAudio && "border-amber-500/40 bg-amber-500/5",
      )}
    >
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <FileAudio2
          className={cn(
            "size-4",
            hasAudio
              ? "text-emerald-600 dark:text-emerald-400"
              : "text-amber-600 dark:text-amber-400",
          )}
        />
        <h3 className="font-medium">
          {hasAudio ? "Audio đã có" : "Chưa có audio"}
        </h3>
        {hasAudio && (
          <code className="text-xs font-mono text-muted-foreground truncate ml-auto">
            {filename}
          </code>
        )}
      </div>

      {hasAudio && audioUrl ? (
        <audio
          controls
          preload="metadata"
          src={audioUrl}
          className="w-full h-10"
        />
      ) : (
        <p className="text-xs text-muted-foreground leading-relaxed">
          Tải lên file <code className="font-mono">.m4a</code> /{" "}
          <code className="font-mono">.mp3</code> /{" "}
          <code className="font-mono">.wav</code> để pipeline transcribe →
          plan → render có thể chạy. Hoặc vào tab{" "}
          <strong>Nội dung → Kịch bản</strong> để gen audio TTS từ kịch bản.
        </p>
      )}

      {uploadMut.isError && (
        <div className="mt-3 rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive flex items-start gap-2">
          <AlertCircle className="size-3.5 mt-0.5 shrink-0" />
          <span>{String(uploadMut.error)}</span>
        </div>
      )}

      {/* Footer action — căn phải */}
      <div className="mt-4 pt-3 border-t flex items-center justify-end">
        <label>
          <input
            type="file"
            accept=".m4a,.mp3,.wav,audio/*"
            onChange={onPick}
            disabled={uploadMut.isPending}
            className="hidden"
          />
          <Button
            asChild
            size="sm"
            variant="outline"
            disabled={uploadMut.isPending}
          >
            <span className="cursor-pointer">
              {uploadMut.isPending ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Volume2 className="size-3.5" />
              )}
              {uploadMut.isPending
                ? "Đang tải lên…"
                : hasAudio
                  ? "Thay audio"
                  : "Tải audio lên"}
            </span>
          </Button>
        </label>
      </div>
    </Card>
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
        "flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap",
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

function SubTabButton({
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
        "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium transition-colors whitespace-nowrap",
        active
          ? "bg-primary/10 text-primary"
          : "text-muted-foreground hover:bg-secondary/40 hover:text-foreground",
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function ScenesPanel({
  episodeName,
  scenes,
  totalDurationMs,
  loading,
  hasTranscript,
}: {
  episodeName: string;
  scenes: ScenePlanItem[];
  totalDurationMs: number;
  loading: boolean;
  hasTranscript: boolean;
}) {
  const qc = useQueryClient();
  const [editingIdx, setEditingIdx] = useState<number | null>(null);

  const optionsQ = useQuery({
    queryKey: ["plan-options"],
    queryFn: () => api.getPlanOptions(),
    staleTime: Infinity,
  });

  const thumbsQ = useQuery({
    queryKey: ["scene-thumbs", episodeName],
    queryFn: () => api.listSceneThumbnails(episodeName),
    enabled: scenes.length > 0,
  });

  const genThumbsMut = useMutation({
    mutationFn: () => api.genSceneThumbnails(episodeName),
    onSuccess: (data) =>
      qc.setQueryData(["scene-thumbs", episodeName], data),
  });

  const planJobMut = useMutation({
    mutationFn: () => api.startPlan(episodeName),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["render-jobs"] });
    },
  });

  const saveMutation = useMutation({
    mutationFn: (next: ScenePlanItem[]) => api.savePlan(episodeName, next),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["plan", episodeName] });
      qc.invalidateQueries({ queryKey: ["episode", episodeName] });
      qc.invalidateQueries({ queryKey: ["episodes"] });
      setEditingIdx(null);
    },
  });

  const onSaveScene = (idx: number, patch: Partial<ScenePlanItem>) => {
    const next = scenes.map((s) =>
      s.index === idx ? { ...s, ...patch } : s,
    );
    saveMutation.mutate(next);
  };

  if (loading) {
    return <Card className="h-64 animate-pulse bg-muted/30" />;
  }
  if (scenes.length === 0) {
    return (
      <Card className="p-12 text-center border-dashed">
        <Film className="mx-auto mb-3 size-10 text-muted-foreground" />
        <p className="font-medium">Chưa có scene plan</p>
        <p className="mt-1 text-sm text-muted-foreground mb-4">
          {hasTranscript
            ? "Bấm nút bên dưới để tự gen plan cảnh từ transcript."
            : "Cần transcript trước — vào tab Transcript bấm 'Tạo transcript'."}
        </p>
        <Button
          onClick={() => planJobMut.mutate()}
          disabled={!hasTranscript || planJobMut.isPending}
        >
          {planJobMut.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Sparkles className="size-4" />
          )}
          Tạo plan cảnh
        </Button>
        {planJobMut.isSuccess && (
          <p className="mt-3 text-xs text-muted-foreground">
            Đang chạy — xem progress ở tab Render.
          </p>
        )}
        {planJobMut.isError && (
          <p className="mt-3 text-xs text-destructive flex items-center justify-center gap-1">
            <AlertCircle className="size-3" />
            {String(planJobMut.error)}
          </p>
        )}
      </Card>
    );
  }

  const thumbUrls = thumbsQ.data?.urls ?? [];
  // Map idx → url qua filename pattern .scene-NN.jpg
  const thumbByIdx = new Map<number, string>();
  for (const url of thumbUrls) {
    const m = url.match(/\.scene-(\d{2})\.jpg$/);
    if (m) thumbByIdx.set(parseInt(m[1], 10), url);
  }

  return (
    <Card className="p-0 overflow-hidden">
      <div className="px-6 py-3 border-b bg-secondary/30 text-sm flex items-center gap-3">
        <span className="text-muted-foreground">
          {scenes.length} cảnh — click row để sửa
        </span>
        <span className="font-mono text-muted-foreground">
          {formatDuration(totalDurationMs)}
        </span>
        <div className="ml-auto flex items-center gap-2">
          {thumbUrls.length > 0 && (
            <span className="text-xs text-muted-foreground">
              {thumbUrls.length}/{scenes.length} thumb
            </span>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if (
                window.confirm(
                  "Tạo lại plan cảnh sẽ ghi đè plan hiện tại (mất các sửa của bạn). Tiếp tục?",
                )
              )
                planJobMut.mutate();
            }}
            disabled={planJobMut.isPending || !hasTranscript}
            title="Re-run plan-episode từ transcript hiện tại. GHI ĐÈ plan đang có."
          >
            {planJobMut.isPending ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Sparkles className="size-3.5" />
            )}
            Tạo lại plan
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => genThumbsMut.mutate()}
            disabled={genThumbsMut.isPending}
            title="Render thumbnail .jpg cho mỗi cảnh (~10-60s, cần đã render preview/full trước)"
          >
            {genThumbsMut.isPending ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Film className="size-3.5" />
            )}
            {thumbUrls.length > 0 ? "Render lại ảnh" : "Render ảnh cảnh"}
          </Button>
        </div>
      </div>
      {(saveMutation.isError ||
        genThumbsMut.isError ||
        planJobMut.isError) && (
        <div className="px-6 py-2 bg-destructive/10 text-destructive text-sm border-b">
          {saveMutation.isError
            ? `Save thất bại: ${String(saveMutation.error)}`
            : genThumbsMut.isError
              ? `Render ảnh thất bại: ${String(genThumbsMut.error)}`
              : `Tạo plan thất bại: ${String(planJobMut.error)}`}
        </div>
      )}
      <div className="divide-y">
        {scenes.map((s) =>
          editingIdx === s.index ? (
            <SceneEditRow
              key={s.index}
              scene={s}
              moods={optionsQ.data?.moods ?? FALLBACK_MOODS}
              sceneTypes={optionsQ.data?.sceneTypes ?? FALLBACK_SCENE_TYPES}
              saving={saveMutation.isPending}
              onCancel={() => setEditingIdx(null)}
              onSave={(patch) => onSaveScene(s.index, patch)}
            />
          ) : (
            <SceneViewRow
              key={s.index}
              scene={s}
              thumbUrl={thumbByIdx.get(s.index) ?? null}
              onEdit={() => setEditingIdx(s.index)}
            />
          ),
        )}
      </div>
    </Card>
  );
}

const FALLBACK_MOODS = [
  "positive",
  "social",
  "healing",
  "energetic",
  "contemplative",
];
const FALLBACK_SCENE_TYPES = [
  "PodcastDesk",
  "Idea",
  "Connection",
  "Crowd",
  "InnerSelf",
  "Choice",
  "Knowledge",
  "OnAir",
  "DualMic",
  "Journal",
  "Morning",
  "Listening",
  "Voices",
  "Growth",
  "Quote",
  "Doubt",
  "LettingGo",
  "Sacrifice",
  "Metamorphosis",
  "Bridge",
  "Mirror",
  "Threshold",
];

function SceneViewRow({
  scene,
  thumbUrl,
  onEdit,
}: {
  scene: ScenePlanItem;
  thumbUrl: string | null;
  onEdit: () => void;
}) {
  return (
    <div
      className="px-6 py-3 hover:bg-secondary/20 cursor-pointer group"
      onClick={onEdit}
    >
      <div className="flex items-start gap-4">
        <div className="font-mono text-xs text-muted-foreground w-12 shrink-0 pt-1">
          #{String(scene.index).padStart(2, "0")}
        </div>
        {thumbUrl ? (
          <img
            src={thumbUrl}
            alt={`Scene ${scene.index} thumbnail`}
            className="w-20 h-36 object-cover rounded border shrink-0 bg-secondary"
            loading="lazy"
          />
        ) : (
          <div className="w-20 h-36 rounded border border-dashed flex items-center justify-center shrink-0 bg-secondary/30">
            <Film className="size-5 text-muted-foreground/40" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 text-xs">
            <Badge variant="outline" className="font-mono">
              {formatTime(scene.startMs)} – {formatTime(scene.endMs)}
            </Badge>
            <Badge variant="secondary">{scene.mood}</Badge>
            <Badge variant="default">{scene.sceneType}</Badge>
          </div>
          <p className="text-sm text-foreground line-clamp-3">
            {scene.text || (
              <span className="text-muted-foreground italic">
                — (không có text)
              </span>
            )}
          </p>
        </div>
        <Pencil className="size-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-1" />
      </div>
    </div>
  );
}

function SceneEditRow({
  scene,
  moods,
  sceneTypes,
  saving,
  onCancel,
  onSave,
}: {
  scene: ScenePlanItem;
  moods: string[];
  sceneTypes: string[];
  saving: boolean;
  onCancel: () => void;
  onSave: (patch: Partial<ScenePlanItem>) => void;
}) {
  const [text, setText] = useState(scene.text);
  const [mood, setMood] = useState(scene.mood);
  const [sceneType, setSceneType] = useState(scene.sceneType);
  const dirty =
    text !== scene.text || mood !== scene.mood || sceneType !== scene.sceneType;

  // Esc → cancel, Cmd/Ctrl+Enter → save
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && dirty) {
        onSave({ text, mood, sceneType });
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [dirty, text, mood, sceneType, onSave, onCancel]);

  return (
    <div className="px-6 py-4 bg-secondary/20">
      <div className="flex items-center gap-4 mb-3">
        <div className="font-mono text-xs text-muted-foreground w-12 shrink-0">
          #{String(scene.index).padStart(2, "0")}
        </div>
        <Badge variant="outline" className="font-mono shrink-0">
          {formatTime(scene.startMs)} – {formatTime(scene.endMs)}
        </Badge>
        <div className="flex items-center gap-2 flex-1">
          <label className="text-xs text-muted-foreground">Mood</label>
          <select
            value={mood}
            onChange={(e) => setMood(e.target.value)}
            disabled={saving}
            className="h-8 rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {moods.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
          <label className="text-xs text-muted-foreground ml-2">Scene</label>
          <select
            value={sceneType}
            onChange={(e) => setSceneType(e.target.value)}
            disabled={saving}
            className="h-8 rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {sceneTypes.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
      </div>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        disabled={saving}
        rows={Math.min(8, Math.max(3, text.split("\n").length + 1))}
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-sans leading-relaxed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-y"
        autoFocus
      />

      <div className="flex items-center justify-between mt-3">
        <p className="text-xs text-muted-foreground">
          <kbd className="rounded bg-muted px-1.5 py-0.5 text-xs">⌘↵</kbd> save
          {" · "}
          <kbd className="rounded bg-muted px-1.5 py-0.5 text-xs">Esc</kbd>{" "}
          cancel
        </p>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={onCancel}
            disabled={saving}
          >
            <XIcon className="size-4" />
            Hủy
          </Button>
          <Button
            size="sm"
            onClick={() => onSave({ text, mood, sceneType })}
            disabled={!dirty || saving}
          >
            {saving ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Save className="size-4" />
            )}
            Lưu
          </Button>
        </div>
      </div>
    </div>
  );
}

function TranscriptPanel({
  episodeName,
  segments,
  source,
  loading,
  hasAudio,
}: {
  episodeName: string;
  segments: TranscriptSegment[];
  source: "corrected" | "raw" | "none";
  loading: boolean;
  hasAudio: boolean;
}) {
  const qc = useQueryClient();
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editValue, setEditValue] = useState("");
  const [findQuery, setFindQuery] = useState("");
  const [replaceWith, setReplaceWith] = useState("");
  const [showFindBar, setShowFindBar] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [copied, setCopied] = useState(false);

  const copyFullTranscript = async () => {
    const fullText = segments
      .map((s) => s.text.trim())
      .filter((t) => t.length > 0)
      .join("\n");
    try {
      await navigator.clipboard.writeText(fullText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      alert("Clipboard không khả dụng — copy thủ công.");
    }
  };

  const transcribeJobMut = useMutation({
    mutationFn: () => api.startTranscribe(episodeName),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["render-jobs"] });
    },
  });

  const saveMutation = useMutation({
    mutationFn: (newSegments: TranscriptSegment[]) =>
      api.saveTranscript(episodeName, newSegments),
    onSuccess: (data) => {
      qc.setQueryData(["transcript", episodeName], data);
      qc.invalidateQueries({ queryKey: ["episodes"] });
      qc.invalidateQueries({ queryKey: ["episode", episodeName] });
      setEditingIdx(null);
    },
  });

  const saveSingle = (idx: number, newText: string) => {
    const next = segments.map((s, i) =>
      i === idx ? { ...s, text: newText } : s,
    );
    saveMutation.mutate(next);
  };

  const replaceAll = () => {
    if (!findQuery) return;
    const next = segments.map((s) => ({
      ...s,
      text: s.text.split(findQuery).join(replaceWith),
    }));
    const changedCount = next.filter(
      (s, i) => s.text !== segments[i]!.text,
    ).length;
    if (changedCount === 0) {
      alert(`Không tìm thấy "${findQuery}"`);
      return;
    }
    if (
      !confirm(
        `Thay "${findQuery}" → "${replaceWith}" trên ${changedCount} câu?`,
      )
    )
      return;
    saveMutation.mutate(next);
    setShowFindBar(false);
    setFindQuery("");
    setReplaceWith("");
  };

  if (loading) {
    return <Card className="h-64 animate-pulse bg-muted/30" />;
  }
  if (segments.length === 0) {
    return (
      <Card className="p-12 text-center border-dashed">
        <FileText className="mx-auto mb-3 size-10 text-muted-foreground" />
        <p className="font-medium">Chưa có transcript</p>
        <p className="mt-1 text-sm text-muted-foreground mb-4">
          {hasAudio
            ? "Bấm nút bên dưới để chạy Whisper transcribe + sửa chính tả (~30-60s)."
            : "Cần audio trước — upload .m4a vào trang Episodes."}
        </p>
        <Button
          onClick={() => transcribeJobMut.mutate()}
          disabled={!hasAudio || transcribeJobMut.isPending}
        >
          {transcribeJobMut.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Sparkles className="size-4" />
          )}
          Tạo transcript
        </Button>
        {transcribeJobMut.isSuccess && (
          <p className="mt-3 text-xs text-muted-foreground">
            Đang chạy — xem progress ở tab Render.
          </p>
        )}
        {transcribeJobMut.isError && (
          <p className="mt-3 text-xs text-destructive flex items-center justify-center gap-1">
            <AlertCircle className="size-3" />
            {String(transcribeJobMut.error)}
          </p>
        )}
      </Card>
    );
  }

  const LIMIT = 200;
  const matchCount = findQuery
    ? segments.filter((s) => s.text.includes(findQuery)).length
    : 0;
  const shown = showAll ? segments : segments.slice(0, LIMIT);
  const truncated = !showAll && segments.length > LIMIT;

  return (
    <Card className="p-0 overflow-hidden">
      <div className="px-6 py-3 border-b bg-secondary/30 flex items-center justify-between gap-3 flex-wrap">
        <span className="text-sm text-muted-foreground">
          {segments.length} câu
          {" · "}
          <Badge
            variant={source === "corrected" ? "accent" : "outline"}
            className="ml-1"
          >
            {source === "corrected"
              ? "đã sửa chính tả"
              : source === "raw"
                ? "chưa sửa"
                : "—"}
          </Badge>
        </span>
        <div className="flex items-center gap-2">
          {truncated && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowAll(true)}
              className="text-xs"
            >
              Hiện tất cả {segments.length}
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if (
                window.confirm(
                  "Tạo lại transcript sẽ ghi đè bản đang có (mất các sửa chính tả của bạn). Tiếp tục?",
                )
              )
                transcribeJobMut.mutate();
            }}
            disabled={transcribeJobMut.isPending}
            title="Re-run Whisper transcribe + spell-fix. GHI ĐÈ transcript hiện tại."
          >
            {transcribeJobMut.isPending ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Sparkles className="size-3.5" />
            )}
            Tạo lại
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={copyFullTranscript}
            disabled={segments.length === 0}
            title={`Copy ${segments.length} câu vào clipboard`}
          >
            {copied ? (
              <Check className="size-3.5 text-accent" />
            ) : (
              <Copy className="size-3.5" />
            )}
            {copied ? "Đã copy" : "Copy toàn bộ"}
          </Button>
          <Button
            variant={showFindBar ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setShowFindBar((v) => !v)}
            title="Find & Replace"
          >
            <Pencil className="size-4" />
            Find & Replace
          </Button>
        </div>
      </div>

      {showFindBar && (
        <div className="px-6 py-3 border-b bg-secondary/10 flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Tìm…"
              value={findQuery}
              onChange={(e) => setFindQuery(e.target.value)}
              className="w-full h-9 rounded-md border border-input bg-background pl-10 pr-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              autoFocus
            />
          </div>
          <span className="text-xs text-muted-foreground tabular-nums w-16">
            {findQuery ? `${matchCount} câu` : ""}
          </span>
          <input
            type="text"
            placeholder="Thay bằng…"
            value={replaceWith}
            onChange={(e) => setReplaceWith(e.target.value)}
            className="flex-1 h-9 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <Button
            size="sm"
            onClick={replaceAll}
            disabled={!findQuery || matchCount === 0 || saveMutation.isPending}
          >
            {saveMutation.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : null}
            Replace all
          </Button>
        </div>
      )}

      {saveMutation.isError && (
        <div className="px-6 py-2 bg-destructive/10 text-destructive text-sm border-b">
          Lưu thất bại: {String(saveMutation.error)}
        </div>
      )}

      <div className="divide-y max-h-[600px] overflow-y-auto">
        {shown.map((s, i) =>
          editingIdx === i ? (
            <div key={i} className="px-6 py-3 bg-secondary/20">
              <div className="flex items-center gap-2 mb-2">
                <span className="font-mono text-xs text-muted-foreground tabular-nums">
                  {formatTime(s.startMs)} – {formatTime(s.endMs)}
                </span>
                <span className="text-xs text-muted-foreground">
                  #{String(i).padStart(3, "0")}
                </span>
              </div>
              <textarea
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") setEditingIdx(null);
                  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                    saveSingle(i, editValue);
                  }
                }}
                rows={Math.min(6, Math.max(2, editValue.split("\n").length + 1))}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-y"
                autoFocus
              />
              <div className="flex items-center justify-between mt-2">
                <p className="text-xs text-muted-foreground">
                  <kbd className="rounded bg-muted px-1.5 py-0.5 text-xs">⌘↵</kbd>{" "}
                  save · <kbd className="rounded bg-muted px-1.5 py-0.5 text-xs">Esc</kbd>{" "}
                  cancel
                </p>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setEditingIdx(null)}
                  >
                    Hủy
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => saveSingle(i, editValue)}
                    disabled={
                      editValue === s.text || saveMutation.isPending
                    }
                  >
                    {saveMutation.isPending ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : null}
                    Lưu
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <div
              key={i}
              className="px-6 py-2.5 hover:bg-secondary/20 flex items-start gap-3 cursor-pointer group"
              onClick={() => {
                setEditingIdx(i);
                setEditValue(s.text);
              }}
            >
              <span className="font-mono text-xs text-muted-foreground shrink-0 mt-0.5 tabular-nums">
                {formatTime(s.startMs)}
              </span>
              <p
                className="text-sm text-foreground flex-1"
                dangerouslySetInnerHTML={{
                  __html: highlightMatches(s.text, findQuery),
                }}
              />
              <Pencil className="size-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-1" />
            </div>
          ),
        )}
      </div>
    </Card>
  );
}

/** Bôi vàng các đoạn match với query. Escape HTML để tránh XSS. */
function highlightMatches(text: string, query: string): string {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  if (!query) return escaped;
  const escQuery = query
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  const pattern = escQuery.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return escaped.replace(
    new RegExp(pattern, "gi"),
    (m) => `<mark class="bg-accent/40 text-foreground rounded px-0.5">${m}</mark>`,
  );
}

function FilesPanel({
  episodeName,
  input,
  tmp,
  loading,
}: {
  episodeName: string;
  input: EpisodeFile[];
  tmp: EpisodeFile[];
  loading: boolean;
}) {
  const queryClient = useQueryClient();
  const [deletingUrl, setDeletingUrl] = useState<string | null>(null);

  const deleteMut = useMutation({
    mutationFn: (vars: {
      bucket: "input" | "tmp";
      filename: string;
    }) => api.deleteFile(episodeName, vars.bucket, vars.filename),
    onSuccess: (data) => {
      queryClient.setQueryData(["episode-files", episodeName], data);
      queryClient.invalidateQueries({
        queryKey: ["episode", episodeName],
      });
      queryClient.invalidateQueries({ queryKey: ["episodes"] });
    },
    onSettled: () => setDeletingUrl(null),
  });

  const confirmAndDelete = (f: EpisodeFile) => {
    const bucket: "input" | "tmp" = f.url.startsWith("/input")
      ? "input"
      : "tmp";
    const warn =
      f.kind === "audio-original"
        ? `XOÁ audio gốc "${f.filename}"?\n\nEpisode sẽ chuyển sang trạng thái no-audio. Phải upload lại để render.`
        : `XOÁ "${f.filename}"?`;
    if (!window.confirm(warn)) return;
    setDeletingUrl(f.url);
    deleteMut.mutate({ bucket, filename: f.filename });
  };

  if (loading) {
    return <Card className="h-64 animate-pulse bg-muted/30" />;
  }
  if (input.length === 0 && tmp.length === 0) {
    return (
      <Card className="p-12 text-center border-dashed">
        <Files className="mx-auto mb-3 size-10 text-muted-foreground" />
        <p className="font-medium">Chưa có file</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Drag audio vào trang Episodes hoặc render full để có outputs.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Audio originals + cover image */}
      {input.length > 0 && (
        <FileSection
          title="Input (audio + cover)"
          icon={<Volume2 className="size-4" />}
          files={input}
          deletingUrl={deletingUrl}
          onDelete={confirmAndDelete}
          renderInline={(f) =>
            f.kind === "audio-original" ? (
              <audio
                controls
                src={f.url}
                className="w-full mt-2"
                preload="metadata"
              />
            ) : f.kind === "cover" ? (
              <img
                src={f.url}
                alt="cover"
                className="mt-2 max-h-48 rounded border"
              />
            ) : null
          }
        />
      )}

      {/* Tmp artifacts */}
      {tmp.length > 0 && (
        <FileSection
          title={`Tmp artifacts (${tmp.length})`}
          icon={<Lock className="size-4" />}
          files={tmp}
          deletingUrl={deletingUrl}
          onDelete={confirmAndDelete}
          collapsed
        />
      )}

      <p className="text-xs text-muted-foreground">
        Episode: <code className="font-mono">{episodeName}</code>
        {" · "}
        Video / thumbnail / lock đã được chuyển sang tab{" "}
        <strong>Render</strong>.
      </p>
    </div>
  );
}

function FileSection({
  title,
  icon,
  files,
  renderInline,
  onDelete,
  deletingUrl,
  collapsed = false,
}: {
  title: string;
  icon: React.ReactNode;
  files: EpisodeFile[];
  renderInline?: (f: EpisodeFile) => React.ReactNode;
  onDelete: (f: EpisodeFile) => void;
  deletingUrl: string | null;
  collapsed?: boolean;
}) {
  const [open, setOpen] = useState(!collapsed);
  return (
    <Card className="p-0 overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full px-6 py-3 border-b bg-secondary/30 flex items-center gap-2 hover:bg-secondary/50 transition-colors text-left"
      >
        {icon}
        <span className="font-medium">{title}</span>
        <span className="ml-auto text-xs text-muted-foreground">
          {files.length} file{collapsed ? (open ? " ▾" : " ▸") : ""}
        </span>
      </button>
      {open && (
        <div className="divide-y">
          {files.map((f) => (
            <div key={f.url} className="px-6 py-3 space-y-2">
              <div className="flex items-center gap-3">
                <Badge variant="outline" className="font-mono text-xs uppercase shrink-0">
                  {kindLabel(f.kind)}
                </Badge>
                <code className="text-sm font-mono flex-1 truncate">
                  {f.filename}
                </code>
                <span className="text-xs text-muted-foreground tabular-nums shrink-0">
                  {humanSize(f.size)}
                </span>
                <span className="text-xs text-muted-foreground shrink-0">
                  {timeAgo(f.mtime)}
                </span>
              </div>
              {renderInline?.(f)}
              <div className="flex justify-end gap-2 pt-1">
                <Button variant="outline" size="sm" asChild>
                  <a href={f.url} download={f.filename}>
                    <Download className="size-3.5" />
                    Tải về
                  </a>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => onDelete(f)}
                  disabled={deletingUrl === f.url}
                >
                  {deletingUrl === f.url ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="size-3.5" />
                  )}
                  Xoá
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

const kindLabel = (k: EpisodeFileKind): string =>
  ({
    "audio-original": "audio",
    "audio-normalized": "wav",
    "video-full": "mp4",
    "video-preview": "preview",
    thumbnail: "thumb",
    cover: "cover",
    lock: "lock",
    "transcript-raw": "raw",
    "transcript-corrected": "fixed",
    plan: "plan",
  })[k];

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(ms / 60000);
  if (minutes < 1) return "vừa xong";
  if (minutes < 60) return `${minutes}p trước`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h trước`;
  const days = Math.floor(hours / 24);
  return `${days}d trước`;
}

function Meta({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground uppercase tracking-wider mb-1">
        {icon}
        {label}
      </div>
      <div className="font-mono text-lg">{children}</div>
    </Card>
  );
}

function formatTime(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function formatDuration(ms: number): string {
  const totalSec = Math.round(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  return `${m}m ${s}s`;
}

function labelFor(s: string): string {
  return (
    {
      "no-audio": "Thiếu audio",
      draft: "Chưa render",
      rendering: "Đang render",
      rendered: "Đã render",
      outdated: "Cũ",
    } as Record<string, string>
  )[s] ?? s;
}
