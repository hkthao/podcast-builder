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
} from "lucide-react";
import {
  api,
  type ScenePlanItem,
  type TranscriptSegment,
} from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Tab = "config" | "scenes" | "transcript";

export function EpisodeEdit() {
  const { name = "" } = useParams<{ name: string }>();
  const [tab, setTab] = useState<Tab>("config");

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
          Episodes
        </Link>
        <Card className="border-destructive/40 bg-destructive/5 p-6">
          <div className="font-medium text-destructive">
            Không load được episode "{name}"
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

  return (
    <div className="container max-w-4xl py-10">
      <Link
        to="/"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4"
      >
        <ArrowLeft className="size-4" />
        Episodes
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
        </div>
        <Badge variant={ep.status === "rendered" ? "accent" : "outline"}>
          {labelFor(ep.status)}
        </Badge>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <Meta icon={<Hash className="size-4" />} label="Episode #">
          {String(ep.config.episodeNumber).padStart(3, "0")}
        </Meta>
        <Meta icon={<FileAudio2 className="size-4" />} label="Audio">
          {ep.audioPath ? "✓" : "—"}
        </Meta>
        <Meta icon={<Calendar className="size-4" />} label="Rendered">
          {ep.renderedAt ? new Date(ep.renderedAt).toLocaleDateString() : "—"}
        </Meta>
        <Meta icon={<Download className="size-4" />} label="Output">
          {ep.hasOutput ? "✓ mp4" : "—"}
        </Meta>
      </div>

      {/* Tabs */}
      <div className="mb-6 flex gap-1 border-b">
        <TabButton
          active={tab === "config"}
          onClick={() => setTab("config")}
          icon={<Settings className="size-4" />}
          label="Config"
        />
        <TabButton
          active={tab === "scenes"}
          onClick={() => setTab("scenes")}
          icon={<Film className="size-4" />}
          label={`Scenes${planCount > 0 ? ` (${planCount})` : ""}`}
        />
        <TabButton
          active={tab === "transcript"}
          onClick={() => setTab("transcript")}
          icon={<FileText className="size-4" />}
          label={`Transcript${transcriptCount > 0 ? ` (${transcriptCount})` : ""}`}
        />
      </div>

      {tab === "config" && <ConfigPanel ep={ep} />}
      {tab === "scenes" && (
        <ScenesPanel
          episodeName={name}
          scenes={planQ.data?.scenes ?? []}
          totalDurationMs={planQ.data?.totalDurationMs ?? 0}
          loading={planQ.isLoading}
        />
      )}
      {tab === "transcript" && (
        <TranscriptPanel
          segments={transcriptQ.data?.segments ?? []}
          source={transcriptQ.data?.source ?? "none"}
          loading={transcriptQ.isLoading}
        />
      )}

      <div className="flex gap-3 mt-8 pt-6 border-t">
        <Button disabled title="Phase 10.4">
          <Play className="size-4" />
          Render preview (10s)
        </Button>
        <Button variant="secondary" disabled title="Phase 10.4">
          <Play className="size-4" />
          Render full
        </Button>
        {ep.hasOutput && (
          <Button variant="outline" asChild>
            <a
              href={`/output/${encodeURIComponent(ep.name)}.mp4`}
              target="_blank"
              rel="noreferrer"
            >
              <Download className="size-4" />
              Download mp4
            </a>
          </Button>
        )}
      </div>
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

function ConfigPanel({
  ep,
}: {
  ep: ReturnType<typeof api.getEpisode> extends Promise<infer T> ? T : never;
}) {
  return (
    <Card className="p-6">
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-y-3 gap-x-6 text-sm">
        <Row label="Title">{ep.config.title}</Row>
        <Row label="Hook">{ep.config.hook ?? "—"}</Row>
        <Row label="Episode number">{ep.config.episodeNumber}</Row>
        <Row label="Mood override">{ep.config.moodOverride ?? "auto"}</Row>
        <Row label="BGM">{ep.config.bgm ?? "—"}</Row>
        <Row label="BGM volume">{ep.config.bgmVolumeDb} dB</Row>
        <Row label="Intro">{ep.config.showIntro ? "có" : "không"}</Row>
        <Row label="Outro">{ep.config.showOutro ? "có" : "không"}</Row>
      </dl>
      <p className="mt-6 text-xs text-muted-foreground">
        Form edit auto-save sẽ có ở Phase 10.3.
      </p>
    </Card>
  );
}

function ScenesPanel({
  episodeName,
  scenes,
  totalDurationMs,
  loading,
}: {
  episodeName: string;
  scenes: ScenePlanItem[];
  totalDurationMs: number;
  loading: boolean;
}) {
  const qc = useQueryClient();
  const [editingIdx, setEditingIdx] = useState<number | null>(null);

  const optionsQ = useQuery({
    queryKey: ["plan-options"],
    queryFn: () => api.getPlanOptions(),
    staleTime: Infinity,
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
        <p className="mt-1 text-sm text-muted-foreground">
          Plan sinh ra sau khi render lần đầu (transcribe → spell-fix →
          plan-episode).
        </p>
      </Card>
    );
  }
  return (
    <Card className="p-0 overflow-hidden">
      <div className="px-6 py-3 border-b bg-secondary/30 text-sm text-muted-foreground flex items-center justify-between">
        <span>{scenes.length} cảnh — click row để sửa</span>
        <span className="font-mono">{formatDuration(totalDurationMs)}</span>
      </div>
      {saveMutation.isError && (
        <div className="px-6 py-2 bg-destructive/10 text-destructive text-sm border-b">
          Save thất bại: {String(saveMutation.error)}
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
];

function SceneViewRow({
  scene,
  onEdit,
}: {
  scene: ScenePlanItem;
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
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 text-xs">
            <Badge variant="outline" className="font-mono">
              {formatTime(scene.startMs)} – {formatTime(scene.endMs)}
            </Badge>
            <Badge variant="secondary">{scene.mood}</Badge>
            <Badge variant="default">{scene.sceneType}</Badge>
          </div>
          <p className="text-sm text-foreground line-clamp-2">
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
  segments,
  source,
  loading,
}: {
  segments: TranscriptSegment[];
  source: "corrected" | "raw" | "none";
  loading: boolean;
}) {
  if (loading) {
    return <Card className="h-64 animate-pulse bg-muted/30" />;
  }
  if (segments.length === 0) {
    return (
      <Card className="p-12 text-center border-dashed">
        <FileText className="mx-auto mb-3 size-10 text-muted-foreground" />
        <p className="font-medium">Chưa có transcript</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Transcript sinh ra sau khi chạy <code className="rounded bg-muted px-1.5">npm run make</code> (Whisper transcribe).
        </p>
      </Card>
    );
  }
  // Hiển thị tối đa 200 segment đầu để tránh DOM quá lớn — Phase 10.6 sẽ virtualize.
  const LIMIT = 200;
  const shown = segments.slice(0, LIMIT);
  const truncated = segments.length > LIMIT;
  return (
    <Card className="p-0 overflow-hidden">
      <div className="px-6 py-3 border-b bg-secondary/30 text-sm text-muted-foreground flex items-center justify-between">
        <span>
          {segments.length} câu
          {" · "}
          <Badge variant={source === "corrected" ? "accent" : "outline"} className="ml-1">
            {source === "corrected" ? "đã sửa chính tả" : source === "raw" ? "chưa sửa" : "—"}
          </Badge>
        </span>
        {truncated && (
          <span className="text-xs">
            Hiển thị {LIMIT}/{segments.length} (Phase 10.6 sẽ virtualize)
          </span>
        )}
      </div>
      <div className="divide-y max-h-[600px] overflow-y-auto">
        {shown.map((s, i) => (
          <div key={i} className="px-6 py-2.5 hover:bg-secondary/20 flex items-start gap-3">
            <span className="font-mono text-xs text-muted-foreground shrink-0 mt-0.5 tabular-nums">
              {formatTime(s.startMs)}
            </span>
            <p className="text-sm text-foreground flex-1">{s.text}</p>
          </div>
        ))}
      </div>
    </Card>
  );
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

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium break-words">{children}</dd>
    </>
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
