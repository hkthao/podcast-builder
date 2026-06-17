/**
 * Script tab — gen kịch bản 2 host + gen audio TTS.
 *
 * Pipeline: pick essay/brainstorm/extra notes → LLM gen JSON {turns} →
 * user edit turns → pick voice host_nam + host_nu → TTS turn-by-turn →
 * concat + loudnorm → input/{slug}.aac → optional BGM mix.
 *
 * Note: gen audio sẽ XOÁ audio gốc khác extension (m4a/mp3/wav) trong
 * input/ vì pipeline make.ts ưu tiên theo thứ tự AUDIO_EXTS. UI confirm
 * trước khi gen lần đầu.
 */
import { useEffect, useRef, useState, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  CheckSquare,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  CircleDollarSign,
  ClipboardPaste,
  FileAudio2,
  FileText,
  Headphones,
  Lightbulb,
  Loader2,
  Mic2,
  Music,
  Play,
  Plus,
  RefreshCw,
  Sparkles,
  SpellCheck,
  Square,
  Trash2,
  Upload,
  Volume2,
  X,
} from "lucide-react";
import { SpellFixPanel } from "./SpellFixPanel";
import { applySpellFix } from "./spell-fix-rules";
import type { SpellFixRule } from "./spell-fix-rules";
import {
  estimateGeminiTtsCost,
  formatUsdCost,
} from "../../../shared/studio-core/tts-providers/gemini-tts-pricing";
import {
  api,
  isPodcastSession,
  type BrainstormSession,
  type EpisodeSummary,
  type LLMProvider,
  type PodcastScript,
  type PodcastScriptTurn,
  type PodcastSpeaker,
  type VoiceInfo,
} from "@/lib/api";
import { usePersistedState } from "@/lib/persist";
import { cn } from "@/lib/utils";
import { Card } from "./ui/card";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";

const DEFAULT_HOST_NAM_STYLE =
  "[Hồ sơ âm thanh: Giọng nam phát thanh viên miền Bắc, trầm ấm, dí dỏm, đặt câu hỏi gợi mở. Tốc độ vừa phải, ngắt câu rõ, pacing tự nhiên như podcast Khan Academy.]";

const DEFAULT_HOST_NU_STYLE =
  "[Hồ sơ âm thanh: Giọng nữ Hà Nội chuẩn, sắc sảo, chuyên gia giải thích bản chất vấn đề. Truyền cảm, nhịp điệu tự nhiên, có cảm xúc khi giải thích.]";

const GEMINI_TTS_MODELS = [
  {
    value: "gemini-3.1-flash-tts-preview",
    label: "Gemini 3.1 Flash TTS (mới nhất, recommend)",
  },
  {
    value: "gemini-2.5-flash-preview-tts",
    label: "Gemini 2.5 Flash TTS",
  },
  {
    value: "gemini-2.5-flash-lite-preview-tts",
    label: "Gemini 2.5 Flash Lite TTS (rẻ)",
  },
  {
    value: "gemini-2.5-pro-preview-tts",
    label: "Gemini 2.5 Pro TTS (cao nhất)",
  },
];

const SPEAKER_META: Record<
  PodcastSpeaker,
  { label: string; cls: string; emoji: string }
> = {
  host_nam: {
    label: "Host Nam",
    cls: "bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30",
    emoji: "♂",
  },
  host_nu: {
    label: "Host Nữ",
    cls: "bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30",
    emoji: "♀",
  },
};

export function ScriptTab({ ep }: { ep: EpisodeSummary }) {
  const qc = useQueryClient();
  const scriptQ = useQuery({
    queryKey: ["podcast-script", ep.name],
    queryFn: () => api.getPodcastScript(ep.name),
  });
  const voicesQ = useQuery({
    queryKey: ["voices"],
    queryFn: () => api.listVoices(),
    staleTime: Infinity,
  });
  const essaysQ = useQuery({
    queryKey: ["essays", "podcast"],
    queryFn: () => api.listEssays("podcast"),
  });
  const brainstormQ = useQuery({
    queryKey: ["brainstorm", "podcast"],
    queryFn: () => api.listBrainstorm("podcast"),
  });
  const modelsQ = useQuery({
    queryKey: ["llm-models"],
    queryFn: () => api.listLLMModels(),
    staleTime: 60_000,
  });

  // Lift voice config state lên ScriptTab — chia sẻ giữa per-turn gen
  // (TurnRow) và Voice Studio Modal (final concat). Persist per episode
  // qua localStorage.
  const defaults = voicesQ.data?.defaults ?? { hostNam: "Charon", hostNu: "Aoede" };
  const stateKey = `episode.${ep.name}.voice-studio`;
  const [hostNamVoice, setHostNamVoice] = usePersistedState<string>(
    `${stateKey}.hostNam.voice`,
    defaults.hostNam,
  );
  const [hostNuVoice, setHostNuVoice] = usePersistedState<string>(
    `${stateKey}.hostNu.voice`,
    defaults.hostNu,
  );
  const [hostNamStyle, setHostNamStyle] = usePersistedState<string>(
    `${stateKey}.hostNam.style`,
    DEFAULT_HOST_NAM_STYLE,
  );
  const [hostNuStyle, setHostNuStyle] = usePersistedState<string>(
    `${stateKey}.hostNu.style`,
    DEFAULT_HOST_NU_STYLE,
  );
  const [ttsModel, setTtsModel] = usePersistedState<string>(
    `${stateKey}.ttsModel`,
    "gemini-3.1-flash-tts-preview",
  );
  const [mixBgm, setMixBgm] = usePersistedState<boolean>(
    `${stateKey}.mixBgm`,
    false,
  );
  // TTS channel chung cho cả 2 host. AI Studio (key AIza, tốn quota nhanh)
  // vs Vertex AI Express (key AQ.Ab8, free tier ~1500 RPD / 15 RPM / 1M TPM).
  // Cùng voices + model, chỉ khác endpoint URL.
  const [ttsProvider, setTtsProvider] = usePersistedState<TtsProviderUi>(
    `${stateKey}.ttsProvider`,
    "gemini",
  );

  // Audio status mỗi turn — UI hiển thị "đã gen / chưa" + player URL
  const audioStatusQ = useQuery({
    queryKey: ["podcast-script-audio-status", ep.name],
    queryFn: () => api.getPodcastScriptAudioStatus(ep.name),
    enabled:
      !!scriptQ.data && (scriptQ.data?.turns.length ?? 0) > 0,
  });

  const voiceConfig: VoiceConfigState = {
    hostNamVoice,
    setHostNamVoice,
    hostNuVoice,
    setHostNuVoice,
    hostNamStyle,
    setHostNamStyle,
    hostNuStyle,
    setHostNuStyle,
    ttsModel,
    setTtsModel,
    mixBgm,
    setMixBgm,
    ttsProvider,
    setTtsProvider,
  };

  // Import-from-text modal — paste raw "M:/F:" dialogue → parse + save as
  // script. Accessible từ cả empty state lẫn header (replace mode).
  const [importOpen, setImportOpen] = useState(false);

  // Batch gen progress state — lift lên ScriptTab để cả AudioActionsPanel
  // (controls) lẫn ScriptEditor (TurnRow highlight) đọc cùng 1 nguồn.
  const [batchState, setBatchState] = useState<BatchState>({
    phase: "idle",
    generated: 0,
    cached: 0,
    blocked: [],
  });
  // Hint cho ScriptEditor auto-jump page khi turn đang gen ở trang khác.
  // ScriptEditor watch giá trị này + setPage tương ứng.
  const [pageJumpHint, setPageJumpHint] = useState<number | null>(null);

  return (
    <div className="space-y-4">
      <SourcesPanel
        ep={ep}
        script={scriptQ.data ?? null}
        essays={essaysQ.data?.essays ?? []}
        brainstormSessions={brainstormQ.data?.sessions ?? []}
        modelsData={modelsQ.data}
        onScriptUpdate={(s) => qc.setQueryData(["podcast-script", ep.name], s)}
      />

      {scriptQ.data && scriptQ.data.turns.length > 0 && (
        <AudioActionsPanel
          ep={ep}
          script={scriptQ.data}
          voiceConfig={voiceConfig}
          audioStatus={audioStatusQ.data?.turns ?? []}
          batchState={batchState}
          setBatchState={setBatchState}
          onTurnGenned={(idx) => {
            qc.invalidateQueries({
              queryKey: ["podcast-script-audio-status", ep.name],
            });
            // Cập nhật page hint → ScriptEditor sẽ auto-jump
            setPageJumpHint(idx);
          }}
          onConcatDone={() => {
            qc.invalidateQueries({ queryKey: ["episode", ep.name] });
            qc.invalidateQueries({ queryKey: ["episode-files", ep.name] });
          }}
        />
      )}

      {scriptQ.isLoading ? (
        <Card className="h-32 animate-pulse bg-muted/30" />
      ) : scriptQ.data && scriptQ.data.turns.length > 0 ? (
        <ScriptEditor
          ep={ep}
          script={scriptQ.data}
          voiceConfig={voiceConfig}
          voices={voicesQ.data?.voices ?? []}
          audioStatus={audioStatusQ.data?.turns ?? []}
          onScriptUpdate={(s) =>
            qc.setQueryData(["podcast-script", ep.name], s)
          }
          onOpenImport={() => setImportOpen(true)}
          currentBatchIdx={
            batchState.phase === "genning" ? batchState.current ?? null : null
          }
          pageJumpHint={pageJumpHint}
          onPageJumpHandled={() => setPageJumpHint(null)}
        />
      ) : (
        <Card className="p-8 text-center border-dashed">
          <FileText className="mx-auto mb-3 size-10 text-muted-foreground" />
          <p className="font-medium">Chưa có kịch bản</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Pick nguồn (essay/brainstorm/tài liệu) ở panel trên rồi bấm{" "}
            <strong>Gen kịch bản</strong>, hoặc paste sẵn kịch bản dạng{" "}
            <code className="font-mono text-xs">M: … / F: …</code>.
          </p>
          <Button
            size="sm"
            variant="outline"
            className="mt-4"
            onClick={() => setImportOpen(true)}
          >
            <ClipboardPaste className="size-3.5" />
            Paste kịch bản
          </Button>
        </Card>
      )}

      {importOpen && (
        <ImportScriptModal
          episodeName={ep.name}
          hasExisting={
            !!scriptQ.data && (scriptQ.data?.turns.length ?? 0) > 0
          }
          onClose={() => setImportOpen(false)}
          onSaved={(s) => {
            qc.setQueryData(["podcast-script", ep.name], s);
            qc.invalidateQueries({
              queryKey: ["podcast-script-audio-status", ep.name],
            });
            setImportOpen(false);
          }}
        />
      )}
    </div>
  );
}

/**
 * Trạng thái batch gen audio — lift lên ScriptTab để cả AudioActionsPanel
 * (controls) lẫn ScriptEditor (TurnRow highlight) cùng đọc.
 *
 * Phase machine:
 *  idle      — chưa chạy hoặc đã reset
 *  genning   — đang loop per-turn TTS, `current` = turn idx hiện tại
 *  concatting — đã gen xong, đang ráp PCM → AAC
 *  done      — kết thúc OK
 *  error     — abort vì lỗi không phải SAFETY
 */
type BatchState = {
  phase: "idle" | "genning" | "concatting" | "done" | "error";
  /** Turn idx đang gen (chỉ khi phase=genning). */
  current?: number;
  /** Tổng số turn trong batch hiện tại. */
  total?: number;
  range?: { from: number; to: number };
  generated: number;
  cached: number;
  blocked: Array<{ idx: number; reason: string }>;
  error?: string;
  /** True nếu phase=genning đến xong rồi sẽ gọi concat. */
  alsoConcat?: boolean;
};

type TtsProviderUi = "gemini" | "vertex-gemini";

type VoiceConfigState = {
  hostNamVoice: string;
  setHostNamVoice: (v: string) => void;
  hostNuVoice: string;
  setHostNuVoice: (v: string) => void;
  hostNamStyle: string;
  setHostNamStyle: (v: string) => void;
  hostNuStyle: string;
  setHostNuStyle: (v: string) => void;
  ttsProvider: TtsProviderUi;
  setTtsProvider: (v: TtsProviderUi) => void;
  ttsModel: string;
  setTtsModel: (v: string) => void;
  mixBgm: boolean;
  setMixBgm: (v: boolean) => void;
};

type TurnAudioStatus = {
  idx: number;
  cached: boolean;
  aacFilename: string | null;
  mtimeMs: number | null;
};

// ────── Sources Panel ──────

function SourcesPanel({
  ep,
  script,
  essays,
  brainstormSessions,
  modelsData,
  onScriptUpdate,
}: {
  ep: EpisodeSummary;
  script: PodcastScript | null;
  essays: Array<{ id: string; title: string }>;
  brainstormSessions: BrainstormSession[];
  modelsData: { openai: { id: string; label: string }[]; ollama: { id: string; label: string }[] } | undefined;
  onScriptUpdate: (s: PodcastScript) => void;
}) {
  // Source pick — persist riêng per episode để user reload không mất
  const stateKey = `episode.${ep.name}.script-source`;

  const [essayId, setEssayId] = usePersistedState<string | null>(
    `${stateKey}.essayId`,
    script?.source.essayId ?? ep.config.essayId ?? null,
  );
  const [brainstormId, setBrainstormId] = usePersistedState<string | null>(
    `${stateKey}.brainstormId`,
    script?.source.brainstormRef?.id ?? null,
  );
  const [ideaIdx, setIdeaIdx] = usePersistedState<number | null>(
    `${stateKey}.ideaIdx`,
    script?.source.brainstormRef?.ideaIdx ?? null,
  );
  const [extraNotes, setExtraNotes] = usePersistedState<string>(
    `${stateKey}.extraNotes`,
    script?.source.extraNotes ?? "",
  );
  const [targetMinutes, setTargetMinutes] = usePersistedState<number>(
    `${stateKey}.targetMinutes`,
    8,
  );

  const [provider, setProvider] = usePersistedState<LLMProvider>(
    `${stateKey}.provider`,
    "openai",
  );
  const [model, setModel] = usePersistedState<string>(
    `${stateKey}.model`,
    "gpt-4o",
  );

  // Auto-fix model nếu không có trong list provider hiện tại
  useEffect(() => {
    const list = modelsData?.[provider] ?? [];
    if (list.length > 0 && !list.some((m) => m.id === model)) {
      setModel(list[0].id);
    }
  }, [provider, modelsData, model, setModel]);

  const selectedSession = brainstormSessions.find(
    (s) => s.id === brainstormId,
  );
  const isPodcast =
    selectedSession && isPodcastSession(selectedSession)
      ? selectedSession
      : null;

  const genMut = useMutation({
    mutationFn: () =>
      api.genPodcastScript(ep.name, {
        provider,
        model,
        essayId: essayId || null,
        brainstormRef:
          brainstormId && ideaIdx !== null
            ? { id: brainstormId, ideaIdx }
            : null,
        extraNotes,
        targetMinutes,
      }),
    onSuccess: (s) => onScriptUpdate(s),
  });

  const hasSource =
    essayId !== null || (brainstormId !== null && ideaIdx !== null) || extraNotes.trim().length > 0;

  return (
    <Card className="p-5">
      <div className="flex items-center gap-2 mb-4">
        <Lightbulb className="size-4 text-accent" />
        <h3 className="font-medium">Nguồn input cho kịch bản</h3>
        {script?.generatedAt && (
          <Badge variant="outline" className="text-[10px] ml-auto">
            Đã gen {new Date(script.generatedAt).toLocaleString("vi-VN")}
          </Badge>
        )}
      </div>

      <div className="space-y-3">
        {/* Essay picker */}
        <div className="grid grid-cols-[100px_1fr] gap-2 items-center">
          <Label className="text-sm text-muted-foreground">Bài luận</Label>
          <select
            value={essayId ?? ""}
            onChange={(e) => setEssayId(e.target.value || null)}
            className="h-10 w-full rounded-md border border-input bg-background px-2 text-sm"
          >
            <option value="">— Không dùng bài luận —</option>
            {essays.map((e) => (
              <option key={e.id} value={e.id}>
                {e.title}
              </option>
            ))}
          </select>
        </div>

        {/* Brainstorm picker */}
        <div className="grid grid-cols-[100px_1fr] gap-2 items-center">
          <Label className="text-sm text-muted-foreground">Ý tưởng</Label>
          <div className="flex gap-2">
            <select
              value={brainstormId ?? ""}
              onChange={(e) => {
                setBrainstormId(e.target.value || null);
                setIdeaIdx(0);
              }}
              className="h-10 flex-1 rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="">— Không dùng ý tưởng —</option>
              {brainstormSessions
                .filter((s) => s.style === "podcast")
                .map((s) => {
                  const topic =
                    s.topic.length > 60
                      ? `${s.topic.slice(0, 60).trim()}…`
                      : s.topic;
                  return (
                    <option key={s.id} value={s.id} title={s.topic}>
                      {topic} ({s.ideas.length} ý)
                    </option>
                  );
                })}
            </select>
            {isPodcast && (
              <select
                value={ideaIdx ?? 0}
                onChange={(e) => setIdeaIdx(Number(e.target.value))}
                className="h-10 w-48 rounded-md border border-input bg-background px-2 text-sm"
              >
                {isPodcast.ideas.map((idea, i) => (
                  <option key={i} value={i}>
                    #{i + 1} {idea.title.slice(0, 30)}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        {/* Extra notes */}
        <div className="grid grid-cols-[100px_1fr] gap-2 items-start">
          <Label className="text-sm text-muted-foreground mt-2">
            Tài liệu bổ sung
          </Label>
          <Textarea
            value={extraNotes}
            onChange={(e) => setExtraNotes(e.target.value)}
            rows={4}
            placeholder="Dán đoạn trích PDF, transcript bài viết khác, tóm tắt liên kết… (tuỳ chọn — sẽ chèn vào prompt cùng bài luận / ý tưởng)"
            className="text-sm font-sans"
          />
        </div>

        {/* Độ dài + LLM picker (input row, không phải action) */}
        <div className="grid grid-cols-[100px_1fr] gap-2 items-center">
          <Label className="text-sm text-muted-foreground">Độ dài</Label>
          <div className="flex items-center gap-2 flex-wrap">
            <input
              type="number"
              value={targetMinutes}
              min={3}
              max={20}
              step={1}
              onChange={(e) => setTargetMinutes(Number(e.target.value))}
              className="h-10 w-16 rounded-md border border-input bg-background px-2 text-sm font-mono"
            />
            <span className="text-sm text-muted-foreground mr-2">phút</span>
            <select
              value={provider}
              onChange={(e) => setProvider(e.target.value as LLMProvider)}
              className="h-10 rounded-md border border-input bg-background px-2 text-sm"
              title="Nhà cung cấp LLM"
            >
              <option value="openai" disabled={!!modelsData && modelsData.openai.length === 0}>
                OpenAI
              </option>
              <option value="ollama" disabled={!!modelsData && modelsData.ollama.length === 0}>
                Ollama
              </option>
            </select>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="h-10 rounded-md border border-input bg-background px-2 text-sm max-w-[200px]"
              title="Mô hình LLM"
            >
              {(modelsData?.[provider] ?? []).map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {genMut.isError && (
          <div className="rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive flex items-start gap-2">
            <AlertCircle className="size-3.5 mt-0.5 shrink-0" />
            <span>{String(genMut.error)}</span>
          </div>
        )}
      </div>

      {/* Footer action — căn phải */}
      <div className="mt-4 pt-3 border-t flex items-center justify-end">
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            if (
              script &&
              script.turns.length > 0 &&
              !window.confirm(
                "Đã có kịch bản — gen mới sẽ GHI ĐÈ kịch bản hiện tại và các edit của bạn. Tiếp tục?",
              )
            ) {
              return;
            }
            genMut.mutate();
          }}
          disabled={genMut.isPending || !hasSource || !model}
          title={
            !hasSource
              ? "Cần ít nhất 1 nguồn (essay/brainstorm/tài liệu)"
              : script
                ? "Re-gen kịch bản (ghi đè)"
                : "Gen kịch bản LLM ~10-30s"
          }
        >
          {genMut.isPending ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : script ? (
            <RefreshCw className="size-3.5" />
          ) : (
            <Sparkles className="size-3.5" />
          )}
          {genMut.isPending
            ? "Đang gen…"
            : script
              ? "Re-gen kịch bản"
              : "Gen kịch bản"}
        </Button>
      </div>
    </Card>
  );
}

// ────── Script Editor ──────

function ScriptEditor({
  ep,
  script,
  voiceConfig,
  voices,
  audioStatus,
  onScriptUpdate,
  onOpenImport,
  currentBatchIdx,
  pageJumpHint,
  onPageJumpHandled,
}: {
  ep: EpisodeSummary;
  script: PodcastScript;
  voiceConfig: VoiceConfigState;
  voices: VoiceInfo[];
  audioStatus: TurnAudioStatus[];
  onScriptUpdate: (s: PodcastScript) => void;
  onOpenImport: () => void;
  /** Turn idx batch đang gen — TurnRow tương ứng highlight. */
  currentBatchIdx: number | null;
  /** Khi đổi (vd batch gen turn ở page khác), ScriptEditor setPage theo. */
  pageJumpHint: number | null;
  onPageJumpHandled: () => void;
}) {
  const episodeName = ep.name;
  const qc = useQueryClient();
  const [voiceStudioOpen, setVoiceStudioOpen] = useState(false);

  // Per-turn gen mutation — dùng voice config từ voiceConfig (shared state)
  const turnGenMut = useMutation({
    mutationFn: (vars: { turnIdx: number; force?: boolean }) => {
      const turn = script.turns[vars.turnIdx];
      if (!turn) throw new Error("Turn không tồn tại");
      const voiceCfg =
        turn.speaker === "host_nam"
          ? {
              voice: voiceConfig.hostNamVoice,
              styleInstruction: voiceConfig.hostNamStyle,
            }
          : {
              voice: voiceConfig.hostNuVoice,
              styleInstruction: voiceConfig.hostNuStyle,
            };
      return api.genPodcastScriptTurnAudio(episodeName, {
        turnIdx: vars.turnIdx,
        voice: voiceCfg.voice,
        styleInstruction: voiceCfg.styleInstruction,
        ttsModel: voiceConfig.ttsModel,
        provider: voiceConfig.ttsProvider,
        force: vars.force,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: ["podcast-script-audio-status", episodeName],
      });
    },
  });
  const turnDeleteAudioMut = useMutation({
    mutationFn: (turnIdx: number) =>
      api.deletePodcastScriptTurnAudio(episodeName, turnIdx),
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: ["podcast-script-audio-status", episodeName],
      });
    },
  });
  // Upload audio user-provided cho 1 turn — bypass Gemini TTS.
  const turnUploadAudioMut = useMutation({
    mutationFn: (vars: { turnIdx: number; file: File }) =>
      api.uploadPodcastScriptTurnAudio(episodeName, vars.turnIdx, vars.file),
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: ["podcast-script-audio-status", episodeName],
      });
    },
  });

  // Multi-select preview — user check N turn → concat PCM → AAC preview file.
  const [selectedTurns, setSelectedTurns] = useState<Set<number>>(new Set());
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewMissing, setPreviewMissing] = useState<number[]>([]);
  const [previewDurationMs, setPreviewDurationMs] = useState<number>(0);
  const previewMut = useMutation({
    mutationFn: (indices: number[]) =>
      api.previewPodcastScriptTurns(episodeName, indices),
    onSuccess: (data) => {
      setPreviewUrl(
        `/tmp/${encodeURIComponent(data.aacFilename)}?v=${data.mtimeMs}`,
      );
      setPreviewMissing(data.missing);
      setPreviewDurationMs(data.durationMs);
    },
  });
  const toggleTurnSelected = (i: number) => {
    setSelectedTurns((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
    // Selection đổi → clear preview cũ để user biết phải re-gen
    setPreviewUrl(null);
    setPreviewMissing([]);
  };
  const clearSelection = () => {
    setSelectedTurns(new Set());
    setPreviewUrl(null);
    setPreviewMissing([]);
  };
  // Xoá toàn bộ kịch bản — script JSON + tất cả cached turn audio. Sau khi
  // xoá, ScriptTab unmount editor (turns.length === 0) → hiện empty state.
  const deleteScriptMut = useMutation({
    mutationFn: () => api.deletePodcastScript(episodeName),
    onSuccess: () => {
      qc.setQueryData(["podcast-script", episodeName], null);
      qc.invalidateQueries({ queryKey: ["podcast-script", episodeName] });
      qc.invalidateQueries({
        queryKey: ["podcast-script-audio-status", episodeName],
      });
      qc.invalidateQueries({ queryKey: ["episode", episodeName] });
      qc.invalidateQueries({ queryKey: ["episode-files", episodeName] });
    },
  });

  const [turns, setTurns] = useState<PodcastScriptTurn[]>(script.turns);
  const [dirty, setDirty] = useState(false);

  // Pagination — script dài (100+ turns) sẽ DOM-heavy nếu render hết. Mỗi
  // turn có textarea + audio player. PAGE_SIZE 5 = list ngắn dễ scan, không
  // phải scroll dài. Page state thuần client, không persist.
  const PAGE_SIZE = 5;
  const [page, setPage] = useState(0);
  const totalPages = Math.max(1, Math.ceil(turns.length / PAGE_SIZE));
  // Clamp page khi turns shrink (spell-fix, paste import, xoá turn cuối...)
  useEffect(() => {
    if (page >= totalPages) setPage(Math.max(0, totalPages - 1));
  }, [totalPages, page]);
  const pageStart = page * PAGE_SIZE;
  const pageEnd = Math.min(turns.length, pageStart + PAGE_SIZE);
  // Auto-jump page khi batch gen yêu cầu (vd đang gen turn #28 nhưng user
  // đang ở page 1). `pageJumpHint` được parent set mỗi lần batch tiến turn,
  // ScriptEditor flip page nếu turn đó không trong [pageStart, pageEnd).
  useEffect(() => {
    if (pageJumpHint === null) return;
    const targetPage = Math.floor(pageJumpHint / PAGE_SIZE);
    if (targetPage !== page) setPage(targetPage);
    onPageJumpHandled();
  }, [pageJumpHint, page, PAGE_SIZE, onPageJumpHandled]);
  // Clear selection khi length thay đổi (add/delete/paste) — index có thể shift
  // làm preview ghép sai turn. Spell-fix giữ length nên không reset.
  const prevTurnsLength = useRef(turns.length);
  useEffect(() => {
    if (prevTurnsLength.current !== turns.length) {
      setSelectedTurns(new Set());
      setPreviewUrl(null);
      setPreviewMissing([]);
      prevTurnsLength.current = turns.length;
    }
  }, [turns.length]);

  // Sync khi parent refresh (sau gen)
  useEffect(() => {
    if (!dirty) setTurns(script.turns);
  }, [script.turns, dirty]);

  const saveMut = useMutation({
    mutationFn: (next: PodcastScriptTurn[]) =>
      api.savePodcastScript(episodeName, { turns: next }),
    onSuccess: (s) => {
      onScriptUpdate(s);
      setDirty(false);
    },
  });

  const wordCount = useMemo(
    () =>
      turns.reduce(
        (s, t) => s + t.text.trim().split(/\s+/).filter(Boolean).length,
        0,
      ),
    [turns],
  );
  const estMinutes = wordCount / 150;

  const updateTurn = (idx: number, patch: Partial<PodcastScriptTurn>) => {
    setTurns((prev) =>
      prev.map((t, i) => (i === idx ? { ...t, ...patch } : t)),
    );
    setDirty(true);
  };
  const deleteTurn = (idx: number) => {
    setTurns((prev) => prev.filter((_, i) => i !== idx));
    setDirty(true);
  };
  const addTurn = (afterIdx: number) => {
    const prevSpeaker = turns[afterIdx]?.speaker ?? "host_nam";
    const newTurn: PodcastScriptTurn = {
      speaker: prevSpeaker === "host_nam" ? "host_nu" : "host_nam",
      text: "",
    };
    setTurns((prev) => [
      ...prev.slice(0, afterIdx + 1),
      newTurn,
      ...prev.slice(afterIdx + 1),
    ]);
    setDirty(true);
    // Nếu turn mới rơi sang page khác → nhảy theo để user thấy nó ngay.
    const newIdx = afterIdx + 1;
    const newPage = Math.floor(newIdx / PAGE_SIZE);
    if (newPage !== page) setPage(newPage);
  };
  const swapSpeaker = (idx: number) => {
    updateTurn(idx, {
      speaker: turns[idx].speaker === "host_nam" ? "host_nu" : "host_nam",
    });
  };

  // Sửa chính tả: apply user-pasted dictionary lên toàn bộ turns. Set
  // dirty=true để user tự bấm "Lưu" (script không auto-save). Trả report
  // cho SpellFixPanel hiển thị.
  const [showSpellFix, setShowSpellFix] = useState(false);
  const runSpellFix = (
    rules: SpellFixRule[],
  ): { wrong: string; right: string; count: number; note?: string }[] => {
    const aggregated = new Map<
      string,
      { wrong: string; right: string; count: number; note?: string }
    >();
    const nextTurns = turns.map((turn) => {
      const { text, applied } = applySpellFix(turn.text, rules);
      for (const a of applied) {
        const prev = aggregated.get(a.wrong);
        if (prev) prev.count += a.count;
        else aggregated.set(a.wrong, { ...a });
      }
      return { ...turn, text };
    });
    const report = Array.from(aggregated.values()).sort(
      (a, b) => b.count - a.count,
    );
    if (report.length > 0) {
      setTurns(nextTurns);
      setDirty(true);
    }
    return report;
  };

  const statusByIdx = new Map<number, TurnAudioStatus>();
  for (const s of audioStatus) statusByIdx.set(s.idx, s);

  // Cost estimate — chia 2 nhóm: full (mọi turn, kể cả đã cached) và pending
  // (chỉ turn chưa có audio). UI ưu tiên show pending cost vì đó là số sẽ
  // bị bill nếu user bấm "Gen audio" bây giờ.
  const ttsCost = useMemo(() => {
    const allTurns = turns.map((t) => ({
      text: t.text,
      styleInstruction:
        t.speaker === "host_nam"
          ? voiceConfig.hostNamStyle
          : voiceConfig.hostNuStyle,
    }));
    const pendingTurns = turns
      .map((t, i) => ({ turn: t, i }))
      .filter(({ i }) => !statusByIdx.get(i)?.cached)
      .map(({ turn }) => ({
        text: turn.text,
        styleInstruction:
          turn.speaker === "host_nam"
            ? voiceConfig.hostNamStyle
            : voiceConfig.hostNuStyle,
      }));
    return {
      full: estimateGeminiTtsCost({
        turns: allTurns,
        model: voiceConfig.ttsModel,
      }),
      pending: estimateGeminiTtsCost({
        turns: pendingTurns,
        model: voiceConfig.ttsModel,
      }),
    };
  }, [
    turns,
    statusByIdx,
    voiceConfig.hostNamStyle,
    voiceConfig.hostNuStyle,
    voiceConfig.ttsModel,
  ]);
  const cachedCount = audioStatus.filter((s) => s.cached).length;
  const showPendingCost =
    cachedCount > 0 && ttsCost.pending.turnCount < turns.length;

  return (
    <Card className="p-5">
      {/* Header row 1: title + primary action. Row 2 (muted): inline stats.
          Cost + actions phụ inline với title để cụm nút không xuống dòng. */}
      <div className="mb-4">
        <div className="flex items-center gap-2 flex-wrap">
          <Mic2 className="size-4 text-primary shrink-0" />
          <h3 className="font-medium">Kịch bản dialogue</h3>
          <Button
            size="sm"
            variant="default"
            onClick={() => setVoiceStudioOpen(true)}
            className="ml-auto h-8"
            title="Cấu hình voice + gen audio toàn bộ"
          >
            <Headphones className="size-3.5" />
            Voice studio
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={onOpenImport}
            className="h-8"
            title="Paste kịch bản dạng M:/F: → parse + ghi đè"
          >
            <ClipboardPaste className="size-3.5" />
            Paste
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="size-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
            onClick={() => {
              const audioCount = audioStatus.filter((s) => s.cached).length;
              const warn =
                `Xoá TOÀN BỘ kịch bản (${turns.length} lượt` +
                (audioCount > 0 ? ` + ${audioCount} audio đã gen` : "") +
                `)?\n\nKhông thể hoàn tác.`;
              if (!window.confirm(warn)) return;
              deleteScriptMut.mutate();
            }}
            disabled={deleteScriptMut.isPending}
            title="Xoá toàn bộ script + cached audio"
          >
            {deleteScriptMut.isPending ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Trash2 className="size-3.5" />
            )}
          </Button>
        </div>

        {/* Stats strip — text-only, separator dots */}
        <div className="mt-1.5 flex items-center flex-wrap gap-x-3 gap-y-1 text-xs font-mono text-muted-foreground">
          <span>{turns.length} lượt</span>
          <span className="text-muted-foreground/40">·</span>
          <span>{wordCount} từ</span>
          <span className="text-muted-foreground/40">·</span>
          <span>~{estMinutes.toFixed(1)}p</span>
          {audioStatus.length > 0 && (
            <>
              <span className="text-muted-foreground/40">·</span>
              <span className="inline-flex items-center gap-1">
                <Volume2 className="size-3" />
                {cachedCount}/{turns.length} đã gen
              </span>
            </>
          )}
          {turns.length > 0 && (
            <>
              <span className="text-muted-foreground/40">·</span>
              <span
                className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-300 cursor-help"
                title={
                  `Model: ${voiceConfig.ttsModel}\n` +
                  `Input: ${ttsCost.full.inputTokens.toLocaleString()} tokens @ $${ttsCost.full.pricing.inputUsdPer1M}/M\n` +
                  `Output: ${ttsCost.full.outputTokens.toLocaleString()} audio tokens @ $${ttsCost.full.pricing.outputUsdPer1M}/M\n` +
                  `Duration ước tính: ~${(ttsCost.full.estDurationSec / 60).toFixed(1)} phút\n\n` +
                  (showPendingCost
                    ? `Số bên ngoài = ${ttsCost.pending.turnCount} turn chưa gen. Full ${turns.length} turn = ${formatUsdCost(ttsCost.full.usd)}.`
                    : `Tổng ${turns.length} turn — gen toàn bộ.`) +
                  `\n\nƯớc tính ± 30% — speech-token billing không tuyến tính với duration.`
                }
              >
                <CircleDollarSign className="size-3" />
                {showPendingCost
                  ? `${formatUsdCost(ttsCost.pending.usd)} (${ttsCost.pending.turnCount}/${turns.length})`
                  : formatUsdCost(ttsCost.full.usd)}
              </span>
            </>
          )}
        </div>
      </div>
      {deleteScriptMut.isError && (
        <div className="mb-3 rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive">
          Xoá kịch bản thất bại: {String(deleteScriptMut.error)}
        </div>
      )}

      {selectedTurns.size > 0 && (
        <SelectionBar
          selected={selectedTurns}
          turnsWithAudio={audioStatus
            .filter((s) => s.cached)
            .map((s) => s.idx)}
          totalTurns={turns.length}
          onClear={clearSelection}
          onSelectAllWithAudio={() => {
            const withAudio = audioStatus
              .filter((s) => s.cached)
              .map((s) => s.idx);
            setSelectedTurns(new Set(withAudio));
            setPreviewUrl(null);
            setPreviewMissing([]);
          }}
          onPreview={() =>
            previewMut.mutate(Array.from(selectedTurns).sort((a, b) => a - b))
          }
          previewPending={previewMut.isPending}
          previewError={
            previewMut.isError ? String(previewMut.error) : null
          }
          previewUrl={previewUrl}
          previewDurationMs={previewDurationMs}
          previewMissing={previewMissing}
        />
      )}

      {totalPages > 1 && (
        <PaginationBar
          page={page}
          totalPages={totalPages}
          pageStart={pageStart}
          pageEnd={pageEnd}
          total={turns.length}
          onChange={setPage}
          className="mb-3"
        />
      )}

      <div className="space-y-2">
        {turns.slice(pageStart, pageEnd).map((turn, vi) => {
          const i = pageStart + vi;
          return (
            <TurnRow
              key={i}
              turn={turn}
              idx={i}
              episodeName={episodeName}
              audioStatus={statusByIdx.get(i)}
              selected={selectedTurns.has(i)}
              isCurrentlyGenerating={currentBatchIdx === i}
              onToggleSelected={() => toggleTurnSelected(i)}
              onUpdate={(patch) => updateTurn(i, patch)}
              onDelete={() => deleteTurn(i)}
              onAddAfter={() => addTurn(i)}
              onSwapSpeaker={() => swapSpeaker(i)}
              onGenAudio={(force) =>
                turnGenMut.mutate({ turnIdx: i, force })
              }
              onDeleteAudio={() => turnDeleteAudioMut.mutate(i)}
              onUploadAudio={(file) =>
                turnUploadAudioMut.mutate({ turnIdx: i, file })
              }
              genPending={
                turnGenMut.isPending &&
                turnGenMut.variables?.turnIdx === i
              }
              deletePending={
                turnDeleteAudioMut.isPending &&
                turnDeleteAudioMut.variables === i
              }
              uploadPending={
                turnUploadAudioMut.isPending &&
                turnUploadAudioMut.variables?.turnIdx === i
              }
            />
          );
        })}
      </div>

      {totalPages > 1 && (
        <PaginationBar
          page={page}
          totalPages={totalPages}
          pageStart={pageStart}
          pageEnd={pageEnd}
          total={turns.length}
          onChange={setPage}
          className="mt-3"
        />
      )}

      {saveMut.isError && (
        <div className="mt-3 rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive">
          Lưu thất bại: {String(saveMut.error)}
        </div>
      )}
      {turnGenMut.isError && (
        <div className="mt-3 rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive">
          Gen turn audio thất bại: {String(turnGenMut.error)}
        </div>
      )}

      {showSpellFix && (
        <div className="mt-3 -mx-5 -mb-5 border-t">
          <SpellFixPanel
            storageKey="script.spell-fix-rules"
            pending={saveMut.isPending}
            onApply={runSpellFix}
            onClose={() => setShowSpellFix(false)}
          />
        </div>
      )}

      {/* Footer action — căn phải */}
      <div className="mt-4 pt-3 border-t flex items-center justify-end gap-2">
        {dirty && !saveMut.isPending && (
          <span className="text-xs text-muted-foreground mr-auto">
            Có thay đổi chưa lưu
          </span>
        )}
        <Button
          size="sm"
          variant={showSpellFix ? "secondary" : "outline"}
          onClick={() => setShowSpellFix((v) => !v)}
          disabled={turns.length === 0 || saveMut.isPending}
          title="Mở dictionary các lỗi chính tả — user paste cặp wrong → right"
        >
          <SpellCheck className="size-3.5" />
          Sửa chính tả
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => saveMut.mutate(turns)}
          disabled={!dirty || saveMut.isPending}
        >
          {saveMut.isPending ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : null}
          Lưu thay đổi
        </Button>
      </div>

      {voiceStudioOpen && (
        <VoiceStudioModal
          ep={ep}
          script={script}
          voices={voices}
          voiceConfig={voiceConfig}
          audioStatus={audioStatus}
          onClose={() => setVoiceStudioOpen(false)}
        />
      )}
    </Card>
  );
}

function TurnRow({
  turn,
  idx,
  episodeName,
  audioStatus,
  selected,
  isCurrentlyGenerating,
  onToggleSelected,
  onUpdate,
  onDelete,
  onAddAfter,
  onSwapSpeaker,
  onGenAudio,
  onDeleteAudio,
  onUploadAudio,
  genPending,
  deletePending,
  uploadPending,
}: {
  turn: PodcastScriptTurn;
  idx: number;
  episodeName: string;
  audioStatus: TurnAudioStatus | undefined;
  selected: boolean;
  /** True khi batch loop đang gen turn này → row highlight. */
  isCurrentlyGenerating: boolean;
  onToggleSelected: () => void;
  onUpdate: (patch: Partial<PodcastScriptTurn>) => void;
  onDelete: () => void;
  onAddAfter: () => void;
  onSwapSpeaker: () => void;
  onGenAudio: (force: boolean) => void;
  onDeleteAudio: () => void;
  onUploadAudio: (file: File) => void;
  genPending: boolean;
  deletePending: boolean;
  uploadPending: boolean;
}) {
  const meta = SPEAKER_META[turn.speaker];
  const wordCount = turn.text.trim().split(/\s+/).filter(Boolean).length;
  const hasAudio = audioStatus?.cached === true;
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Cache-bust query string với mtime — sau khi regen, mtime đổi → URL
  // đổi → browser fetch file mới thay vì play cached old version.
  const audioUrl =
    hasAudio && audioStatus?.aacFilename
      ? `/tmp/${encodeURIComponent(audioStatus.aacFilename)}?v=${audioStatus.mtimeMs ?? 0}`
      : null;
  // Unused episodeName silence — kept for future use (vd direct URL build)
  void episodeName;

  return (
    <div
      className={cn(
        "group flex gap-3 items-start rounded-md transition-colors",
        // bg + ring là box-shadow → KHÔNG ảnh hưởng layout, các row align nhau
        // dù selected hay không. Tránh padding/margin riêng cho selected vì
        // sẽ làm row đó wider/taller hơn các row khác.
        selected && "bg-primary/5 ring-1 ring-primary/30",
        isCurrentlyGenerating &&
          "bg-accent/10 ring-2 ring-accent animate-pulse",
      )}
    >
      <div className="flex flex-col items-center gap-1 shrink-0 pt-1">
        <button
          type="button"
          onClick={onToggleSelected}
          className={cn(
            "p-1 rounded transition-colors",
            selected
              ? "text-primary"
              : "text-muted-foreground/50 hover:text-muted-foreground",
          )}
          title={selected ? "Bỏ chọn turn này" : "Chọn turn này để nghe thử"}
        >
          {selected ? (
            <CheckSquare className="size-4" />
          ) : (
            <Square className="size-4" />
          )}
        </button>
        <span className="text-[10px] font-mono text-muted-foreground">
          #{String(idx + 1).padStart(2, "0")}
        </span>
        <button
          type="button"
          onClick={onSwapSpeaker}
          className={cn(
            "h-7 w-16 inline-flex items-center justify-center gap-1 rounded-md border text-[10px] font-medium transition-colors hover:opacity-80",
            meta.cls,
          )}
          title="Click để đổi sang speaker kia"
        >
          <span className="text-sm">{meta.emoji}</span>
          {meta.label.replace("Host ", "")}
        </button>
      </div>
      <div className="flex-1 min-w-0">
        <Textarea
          value={turn.text}
          onChange={(e) => onUpdate({ text: e.target.value })}
          rows={Math.min(6, Math.max(2, Math.ceil(turn.text.length / 80)))}
          className="text-sm font-sans leading-relaxed"
          placeholder="Lời thoại tiếng Việt. Có thể chèn [laughs], [sighs], [whispers] cho TTS biểu cảm."
        />
        <div className="mt-0.5 flex items-center justify-between text-[10px] text-muted-foreground gap-2 flex-wrap">
          <span>{wordCount} từ</span>
          {turn.text.match(/\[(laughs|sighs|whispers)\]/g) && (
            <span className="text-accent">
              audio tag: {turn.text.match(/\[(laughs|sighs|whispers)\]/g)?.join(" ")}
            </span>
          )}
        </div>

        {/* Per-turn audio controls */}
        <div className="mt-1.5 flex items-center gap-2 flex-wrap">
          {hasAudio && audioUrl && (
            <audio
              controls
              preload="metadata"
              src={audioUrl}
              className="h-8 flex-1 min-w-[200px] max-w-md"
            />
          )}
          <Button
            size="sm"
            variant="outline"
            className="h-8"
            onClick={() => onGenAudio(hasAudio)}
            disabled={genPending || uploadPending || !turn.text.trim()}
            title={
              hasAudio
                ? "Re-gen audio cho turn này (overwrite cache)"
                : "Gen audio TTS cho turn này"
            }
          >
            {genPending ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : hasAudio ? (
              <RefreshCw className="size-3.5" />
            ) : (
              <Play className="size-3.5" />
            )}
            {genPending
              ? "Đang gen…"
              : hasAudio
                ? "Gen lại"
                : "Gen audio"}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*,.mp3,.m4a,.wav,.aac,.ogg,.flac,.opus"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onUploadAudio(file);
              // reset để chọn lại cùng file vẫn fire onChange
              e.target.value = "";
            }}
          />
          <Button
            size="sm"
            variant="outline"
            className="h-8"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadPending || genPending}
            title={
              hasAudio
                ? "Upload file audio thay TTS (sẽ ghi đè cache)"
                : "Upload file audio thay vì gen TTS"
            }
          >
            {uploadPending ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Upload className="size-3.5" />
            )}
            {uploadPending ? "Đang upload…" : "Upload"}
          </Button>
          {hasAudio && (
            <Button
              size="sm"
              variant="ghost"
              className="h-8 w-8 p-0 text-destructive hover:bg-destructive/10"
              onClick={onDeleteAudio}
              disabled={deletePending}
              title="Xoá audio cache turn này"
            >
              {deletePending ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <X className="size-3.5" />
              )}
            </Button>
          )}
        </div>
      </div>
      <div className="flex flex-col gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity pt-1">
        <Button
          size="sm"
          variant="ghost"
          className="h-7 w-7 p-0"
          onClick={onAddAfter}
          title="Thêm turn sau"
        >
          <Plus className="size-3.5" />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 w-7 p-0 text-destructive hover:bg-destructive/10"
          onClick={onDelete}
          title="Xoá turn"
        >
          <X className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}

// ────── Voice Studio ──────

function VoiceStudioModal({
  ep,
  script,
  voices,
  voiceConfig,
  audioStatus,
  onClose,
}: {
  ep: EpisodeSummary;
  script: PodcastScript;
  voices: VoiceInfo[];
  voiceConfig: VoiceConfigState;
  audioStatus: TurnAudioStatus[];
  onClose: () => void;
}) {
  const [advancedOpen, setAdvancedOpen] = useState(false);

  // Vertex AI Gemini dùng CÙNG voice catalog với AI Studio Gemini (cùng model
  // series). UI chỉ cần lọc theo "gemini" provider voice cho cả 2 channel.
  const geminiVoices = voices.filter((v) => v.provider === "gemini");
  const hostNamSuggestions = geminiVoices.filter(
    (v) => v.suggestedRole === "host_nam",
  );
  const hostNuSuggestions = geminiVoices.filter(
    (v) => v.suggestedRole === "host_nu",
  );

  const isVertex = voiceConfig.ttsProvider === "vertex-gemini";
  const hasBgm = !!ep.config.bgm;
  const hasAudio = !!ep.audioPath;
  const cachedCount = audioStatus.filter((s) => s.cached).length;
  const totalTurns = script.turns.length;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <Card
        className="w-full max-w-3xl max-h-[90vh] overflow-y-auto p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <Headphones className="size-4 text-primary" />
          <h3 className="font-medium">Voice studio</h3>
          {hasAudio && (
            <Badge variant="outline" className="text-[10px] gap-1">
              <FileAudio2 className="size-3" />
              Có audio
            </Badge>
          )}
          {cachedCount > 0 && (
            <Badge variant="outline" className="text-[10px] gap-1 bg-accent/5">
              <Volume2 className="size-3" />
              {cachedCount}/{totalTurns} turn cache
            </Badge>
          )}
          <button
            type="button"
            onClick={onClose}
            className="ml-auto p-1 rounded hover:bg-secondary"
            title="Đóng"
          >
            <X className="size-4" />
          </button>
        </div>

        <p className="text-xs text-muted-foreground mb-4 leading-relaxed">
          Cấu hình voice + style cho 2 host. Nút Gen audio nằm ở panel{" "}
          <strong>Audio actions</strong> ngoài modal.
        </p>

        {/* Channel selector — AI Studio (AIza key) vs Vertex AI Express (AQ key).
            Cùng voices Gemini + style instruction, chỉ khác endpoint + billing. */}
        <div className="mb-4 rounded-md border bg-muted/30 p-3 space-y-2">
          <Label className="text-xs text-muted-foreground">TTS channel</Label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => voiceConfig.setTtsProvider("gemini")}
              className={cn(
                "flex-1 rounded-md border px-3 py-2 text-left text-xs transition-colors",
                voiceConfig.ttsProvider === "gemini"
                  ? "border-primary bg-primary/10"
                  : "border-input hover:bg-secondary",
              )}
            >
              <div className="font-medium">Gemini AI Studio</div>
              <div className="text-[10px] text-muted-foreground mt-0.5">
                Key <code className="font-mono">AIza...</code> · Free tier
                hạn chế, dễ tốn tiền nếu hit quota.
              </div>
            </button>
            <button
              type="button"
              onClick={() => voiceConfig.setTtsProvider("vertex-gemini")}
              className={cn(
                "flex-1 rounded-md border px-3 py-2 text-left text-xs transition-colors",
                voiceConfig.ttsProvider === "vertex-gemini"
                  ? "border-primary bg-primary/10"
                  : "border-input hover:bg-secondary",
              )}
            >
              <div className="font-medium">Vertex AI Express</div>
              <div className="text-[10px] text-muted-foreground mt-0.5">
                Key <code className="font-mono">AQ.Ab8...</code> · Free tier
                hào phóng (~15 RPM, 1500 RPD, 1M TPM). Cùng voices + style.
              </div>
            </button>
          </div>
          {isVertex && (
            <p className="text-[10px] text-emerald-700 dark:text-emerald-300 leading-relaxed">
              Cần set{" "}
              <code className="font-mono">GOOGLE_VERTEX_AI_API_KEY</code>{" "}
              (Vertex Express AQ key) qua{" "}
              <a href="/settings" className="underline">
                Settings
              </a>
              . Endpoint <code className="font-mono">aiplatform.googleapis.com</code>.
            </p>
          )}
        </div>

        {/* 2 voice columns — flat, dùng vertical divider thay vì border box */}
        <div className="grid grid-cols-1 md:grid-cols-2 md:divide-x md:divide-border gap-6 md:gap-0">
          <VoiceColumn
            label="Host Nam"
            emoji="♂"
            accentColor="text-sky-600 dark:text-sky-400"
            voice={voiceConfig.hostNamVoice}
            onVoiceChange={voiceConfig.setHostNamVoice}
            style={voiceConfig.hostNamStyle}
            onStyleChange={voiceConfig.setHostNamStyle}
            defaultStyle={DEFAULT_HOST_NAM_STYLE}
            voices={geminiVoices}
            suggestions={hostNamSuggestions}
            cellPadding="md:pr-6"
          />
          <VoiceColumn
            label="Host Nữ"
            emoji="♀"
            accentColor="text-rose-600 dark:text-rose-400"
            voice={voiceConfig.hostNuVoice}
            onVoiceChange={voiceConfig.setHostNuVoice}
            style={voiceConfig.hostNuStyle}
            onStyleChange={voiceConfig.setHostNuStyle}
            defaultStyle={DEFAULT_HOST_NU_STYLE}
            voices={geminiVoices}
            suggestions={hostNuSuggestions}
            cellPadding="md:pl-6"
          />
        </div>

        <div className="mt-4 pt-3 border-t">
          <button
            type="button"
            onClick={() => setAdvancedOpen((v) => !v)}
            className="w-full inline-flex items-center gap-1.5 text-xs text-accent hover:underline"
          >
            <span>{advancedOpen ? "Thu gọn" : "TTS model + BGM mix"}</span>
            <ChevronDown
              className={cn(
                "size-3 ml-auto transition-transform",
                advancedOpen && "rotate-180",
              )}
            />
          </button>
          {advancedOpen && (
            <div className="mt-3 space-y-3">
              <div className="grid grid-cols-[100px_1fr] gap-2 items-center">
                <Label className="text-sm text-muted-foreground">
                  TTS model
                </Label>
                <select
                  value={voiceConfig.ttsModel}
                  onChange={(e) => voiceConfig.setTtsModel(e.target.value)}
                  className="h-10 w-full rounded-md border border-input bg-background px-2 text-sm"
                >
                  {GEMINI_TTS_MODELS.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className={cn("flex items-start gap-2", !hasBgm && "opacity-50")}>
                <input
                  id="mix-bgm-toggle"
                  type="checkbox"
                  checked={voiceConfig.mixBgm && hasBgm}
                  onChange={(e) => voiceConfig.setMixBgm(e.target.checked)}
                  disabled={!hasBgm}
                  className="mt-1 shrink-0"
                />
                <label htmlFor="mix-bgm-toggle" className="flex-1 min-w-0 cursor-pointer">
                  <div className="flex items-center gap-2">
                    <Music className="size-3.5 text-accent" />
                    <span className="text-sm font-medium">
                      Mix BGM (ducking + EQ + intro/outro bump)
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                    {hasBgm ? (
                      <>
                        BGM: <code className="font-mono">{ep.config.bgm}</code>.
                        Auto-ducking khi voice nói (giảm ~8dB), EQ notch 1-4kHz,
                        intro/outro 3s đầu+cuối boost +10dB. Base -22dB.
                      </>
                    ) : (
                      <>
                        Episode chưa set BGM. Upload qua <strong>BGM panel</strong>{" "}
                        ngay dưới Meta cards.
                      </>
                    )}
                  </p>
                </label>
              </div>
            </div>
          )}
        </div>

        {/* Audio preview — read-only của file đã có */}
        {hasAudio && (
          <div className="mt-4 pt-3 border-t">
            <Label className="text-sm text-muted-foreground mb-1.5 block">
              Audio final đang có
            </Label>
            <audio
              controls
              preload="metadata"
              src={`/input/${encodeURIComponent(ep.audioPath!.split("/").pop()!)}`}
              className="w-full h-10"
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              Để gen lại, đóng modal và dùng panel <strong>Audio actions</strong>.
            </p>
          </div>
        )}

        <div className="mt-4 pt-3 border-t flex items-center justify-end">
          <Button size="sm" variant="ghost" onClick={onClose}>
            Đóng
          </Button>
        </div>
      </Card>
    </div>
  );
}

function VoiceColumn({
  label,
  emoji,
  voice,
  onVoiceChange,
  style,
  onStyleChange,
  defaultStyle,
  voices,
  suggestions,
  accentColor,
  cellPadding,
}: {
  label: string;
  emoji: string;
  accentColor: string;
  cellPadding?: string;
  voice: string;
  onVoiceChange: (v: string) => void;
  style: string;
  onStyleChange: (v: string) => void;
  defaultStyle: string;
  voices: VoiceInfo[];
  suggestions: VoiceInfo[];
}) {
  const selectedInfo = voices.find((v) => v.id === voice);
  return (
    <div className={cn("space-y-3", cellPadding)}>
      <div className="flex items-center gap-2">
        <span className={cn("text-xl", accentColor)}>{emoji}</span>
        <span className="font-medium text-sm">{label}</span>
      </div>

      <div>
        <Label className="text-xs text-muted-foreground mb-1 block">Voice</Label>
        <select
          value={voice}
          onChange={(e) => onVoiceChange(e.target.value)}
          className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
        >
          {suggestions.length > 0 && (
            <optgroup label={`Gợi ý cho ${label}`}>
              {suggestions.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.displayName} — {v.character}
                </option>
              ))}
            </optgroup>
          )}
          <optgroup label="Tất cả Gemini voices">
            {voices.map((v) => (
              <option key={v.id} value={v.id}>
                {v.displayName} ({v.gender === "male" ? "nam" : "nữ"}) —{" "}
                {v.character}
              </option>
            ))}
          </optgroup>
        </select>
        {selectedInfo && (
          <p className="mt-1 text-[10px] text-muted-foreground italic">
            {selectedInfo.character}
          </p>
        )}
      </div>

      <div>
        <div className="flex items-center justify-between mb-1">
          <Label className="text-xs text-muted-foreground">
            Hồ sơ âm thanh (style instruction)
          </Label>
          {style !== defaultStyle && (
            <button
              type="button"
              onClick={() => onStyleChange(defaultStyle)}
              className="text-[10px] text-accent hover:underline"
            >
              Reset
            </button>
          )}
        </div>
        <Textarea
          value={style}
          onChange={(e) => onStyleChange(e.target.value)}
          rows={3}
          className="text-xs"
          placeholder='[Hồ sơ âm thanh: Giọng …]'
        />
        <p className="mt-1 text-[10px] text-muted-foreground leading-relaxed">
          Gemini hiểu bracket prefix là "director's note" → cố bẻ dải âm khớp
          mô tả, KHÔNG đọc thành tiếng. Pattern:{" "}
          <code className="font-mono">[Hồ sơ âm thanh: …]</code>.
        </p>
      </div>
    </div>
  );
}

// ────── Import script từ text paste ──────

/**
 * Parse 1 đoạn dialogue text dạng `M: …` / `F: …` thành turns.
 * Hỗ trợ prefix:
 *   - host_nam: M, Nam, H1, Host Nam, Anh
 *   - host_nu : F, Nữ, Nu, H2, Host Nữ, Em, Chị
 * Phân cách prefix với text bằng `:` hoặc `：` (full-width).
 * Dòng không match prefix → coi là tiếp nối turn hiện tại. Dòng trống bỏ
 * qua. Trả về cả số dòng bị skip ở đầu (khi chưa có turn nào để gắn).
 */
const HOST_NAM_PREFIX_RE =
  /^\s*(M|Nam|H1|Host\s*Nam|host_nam|Anh)\s*[:：]\s*/i;
const HOST_NU_PREFIX_RE =
  /^\s*(F|Nữ|Nu|H2|Host\s*Nữ|Host\s*Nu|host_nu|Em|Chị|Chi)\s*[:：]\s*/i;

export function parseDialogueText(raw: string): {
  turns: PodcastScriptTurn[];
  skippedLines: number;
} {
  const lines = raw.split(/\r?\n/);
  const turns: PodcastScriptTurn[] = [];
  let current: PodcastScriptTurn | null = null;
  let skippedLines = 0;
  const pushCurrent = () => {
    if (!current) return;
    const text = current.text.trim();
    if (text) turns.push({ speaker: current.speaker, text });
    current = null;
  };
  for (const line of lines) {
    if (!line.trim()) continue;
    const namMatch = line.match(HOST_NAM_PREFIX_RE);
    const nuMatch = line.match(HOST_NU_PREFIX_RE);
    if (namMatch) {
      pushCurrent();
      current = { speaker: "host_nam", text: line.slice(namMatch[0].length) };
      continue;
    }
    if (nuMatch) {
      pushCurrent();
      current = { speaker: "host_nu", text: line.slice(nuMatch[0].length) };
      continue;
    }
    if (current) {
      current.text += (current.text ? " " : "") + line.trim();
    } else {
      skippedLines++;
    }
  }
  pushCurrent();
  return { turns, skippedLines };
}

const SAMPLE_DIALOGUE = `M: Chị biết không, dạo gần đây tôi hay suy nghĩ về một hình ảnh.

F: Hình ảnh gì vậy anh?

M: Một người hiện đại, ngồi trong phòng điều hòa, tay cầm điện thoại nhưng ánh mắt trĩu nặng âu lo.

F: Ừm, em hiểu rồi.`;

function ImportScriptModal({
  episodeName,
  hasExisting,
  onClose,
  onSaved,
}: {
  episodeName: string;
  hasExisting: boolean;
  onClose: () => void;
  onSaved: (s: PodcastScript) => void;
}) {
  const [raw, setRaw] = useState("");
  const parsed = useMemo(() => parseDialogueText(raw), [raw]);
  const canSave = parsed.turns.length > 0;

  const saveMut = useMutation({
    mutationFn: (turns: PodcastScriptTurn[]) =>
      api.savePodcastScript(episodeName, { turns }),
    onSuccess: (s) => onSaved(s),
  });

  const confirmAndSave = () => {
    if (!canSave || saveMut.isPending) return;
    if (
      hasExisting &&
      !window.confirm(
        `Sẽ GHI ĐÈ kịch bản hiện tại (mọi turn cũ + dirty state) bằng ${parsed.turns.length} lượt mới. Tiếp tục?`,
      )
    ) {
      return;
    }
    saveMut.mutate(parsed.turns);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <Card
        className="w-full max-w-3xl max-h-[90vh] overflow-y-auto p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <ClipboardPaste className="size-4 text-primary" />
          <h3 className="font-medium">Paste kịch bản</h3>
          {parsed.turns.length > 0 && (
            <Badge variant="outline" className="text-[10px] font-mono">
              {parsed.turns.length} lượt sẽ tạo
            </Badge>
          )}
          {parsed.skippedLines > 0 && (
            <Badge
              variant="outline"
              className="text-[10px] gap-1 border-amber-500/40 text-amber-700 dark:text-amber-300"
            >
              <AlertCircle className="size-3" />
              {parsed.skippedLines} dòng đầu bị bỏ
            </Badge>
          )}
          <button
            type="button"
            onClick={onClose}
            className="ml-auto p-1 rounded hover:bg-secondary"
            title="Đóng"
          >
            <X className="size-4" />
          </button>
        </div>

        <p className="text-xs text-muted-foreground mb-3 leading-relaxed">
          Mỗi lượt bắt đầu bằng prefix <code className="font-mono">M:</code>{" "}
          (Host Nam) hoặc <code className="font-mono">F:</code> (Host Nữ).
          Cũng nhận <code className="font-mono">Nam:/Nữ:</code>,{" "}
          <code className="font-mono">H1:/H2:</code>,{" "}
          <code className="font-mono">Anh:/Em:/Chị:</code>. Dòng tiếp theo
          không có prefix sẽ nối vào lượt hiện tại.
        </p>

        <Textarea
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          rows={12}
          className="font-mono text-xs"
          placeholder={SAMPLE_DIALOGUE}
          autoFocus
        />

        {raw.trim().length > 0 && parsed.turns.length === 0 && (
          <div className="mt-3 rounded-md border border-amber-500/40 bg-amber-500/5 p-2 text-xs">
            Không parse được lượt nào — kiểm tra prefix{" "}
            <code className="font-mono">M:</code> /{" "}
            <code className="font-mono">F:</code> đầu mỗi lượt.
          </div>
        )}

        {parsed.turns.length > 0 && (
          <div className="mt-3 rounded-md border bg-muted/30 p-3 max-h-60 overflow-y-auto space-y-1.5">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">
              Preview
            </div>
            {parsed.turns.map((t, i) => (
              <div key={i} className="flex gap-2 text-xs">
                <Badge
                  variant="outline"
                  className={cn(
                    "shrink-0 text-[10px] font-mono h-5 px-1.5",
                    SPEAKER_META[t.speaker].cls,
                  )}
                >
                  {SPEAKER_META[t.speaker].emoji}{" "}
                  {t.speaker === "host_nam" ? "Nam" : "Nữ"}
                </Badge>
                <span className="leading-snug">{t.text}</span>
              </div>
            ))}
          </div>
        )}

        {saveMut.isError && (
          <div className="mt-3 rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive">
            Lưu thất bại: {String(saveMut.error)}
          </div>
        )}

        <div className="mt-4 flex items-center justify-end gap-2">
          <Button size="sm" variant="ghost" onClick={onClose}>
            Huỷ
          </Button>
          <Button
            size="sm"
            onClick={confirmAndSave}
            disabled={!canSave || saveMut.isPending}
          >
            {saveMut.isPending ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <ClipboardPaste className="size-3.5" />
            )}
            {hasExisting
              ? `Ghi đè (${parsed.turns.length} lượt)`
              : `Tạo kịch bản (${parsed.turns.length} lượt)`}
          </Button>
        </div>
      </Card>
    </div>
  );
}

function PaginationBar({
  page,
  totalPages,
  pageStart,
  pageEnd,
  total,
  onChange,
  className,
}: {
  page: number;
  totalPages: number;
  pageStart: number;
  pageEnd: number;
  total: number;
  onChange: (p: number) => void;
  className?: string;
}) {
  const [draft, setDraft] = useState<string>(String(page + 1));
  useEffect(() => {
    setDraft(String(page + 1));
  }, [page]);
  const commitDraft = () => {
    const n = Number(draft);
    if (!Number.isFinite(n)) {
      setDraft(String(page + 1));
      return;
    }
    const clamped = Math.max(0, Math.min(totalPages - 1, Math.floor(n) - 1));
    onChange(clamped);
    setDraft(String(clamped + 1));
  };
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-2 py-1.5 px-2 rounded-md bg-muted/30 text-xs",
        className,
      )}
    >
      <span className="text-muted-foreground font-mono">
        Lượt {pageStart + 1}–{pageEnd} / {total}
      </span>
      <div className="flex items-center gap-0.5">
        <Button
          size="icon"
          variant="ghost"
          className="size-7"
          onClick={() => onChange(0)}
          disabled={page === 0}
          title="Trang đầu"
        >
          <ChevronsLeft className="size-3.5" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="size-7"
          onClick={() => onChange(Math.max(0, page - 1))}
          disabled={page === 0}
          title="Trang trước"
        >
          <ChevronLeft className="size-3.5" />
        </Button>
        <span className="font-mono px-1.5 flex items-center gap-1">
          <span>Trang</span>
          <input
            type="number"
            min={1}
            max={totalPages}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitDraft}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commitDraft();
                (e.target as HTMLInputElement).blur();
              }
            }}
            className="w-10 h-6 text-center bg-background border rounded text-xs font-mono [&::-webkit-inner-spin-button]:appearance-none [appearance:textfield]"
          />
          <span className="text-muted-foreground">/ {totalPages}</span>
        </span>
        <Button
          size="icon"
          variant="ghost"
          className="size-7"
          onClick={() => onChange(Math.min(totalPages - 1, page + 1))}
          disabled={page >= totalPages - 1}
          title="Trang sau"
        >
          <ChevronRight className="size-3.5" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="size-7"
          onClick={() => onChange(totalPages - 1)}
          disabled={page >= totalPages - 1}
          title="Trang cuối"
        >
          <ChevronsRight className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}

function SelectionBar({
  selected,
  turnsWithAudio,
  totalTurns,
  onClear,
  onSelectAllWithAudio,
  onPreview,
  previewPending,
  previewError,
  previewUrl,
  previewDurationMs,
  previewMissing,
}: {
  selected: Set<number>;
  turnsWithAudio: number[];
  totalTurns: number;
  onClear: () => void;
  onSelectAllWithAudio: () => void;
  onPreview: () => void;
  previewPending: boolean;
  previewError: string | null;
  previewUrl: string | null;
  previewDurationMs: number;
  previewMissing: number[];
}) {
  const selectedWithAudio = Array.from(selected).filter((i) =>
    turnsWithAudio.includes(i),
  );
  const canPreview = selectedWithAudio.length > 0 && !previewPending;
  const allWithAudioSelected =
    turnsWithAudio.length > 0 &&
    turnsWithAudio.every((i) => selected.has(i));
  return (
    <div className="mb-3 sticky top-2 z-10 rounded-md border border-primary/30 bg-card/95 backdrop-blur-sm shadow-sm">
      <div className="flex items-center gap-2 p-2 flex-wrap">
        <Badge variant="outline" className="font-mono text-xs gap-1">
          <CheckSquare className="size-3" />
          {selected.size} / {totalTurns} lượt
        </Badge>
        {selectedWithAudio.length !== selected.size && (
          <span className="text-[11px] text-muted-foreground">
            ({selectedWithAudio.length} có audio)
          </span>
        )}
        <Button
          size="sm"
          variant="default"
          className="h-8 ml-auto"
          onClick={onPreview}
          disabled={!canPreview}
          title="Concat audio các turn đã chọn → AAC preview"
        >
          {previewPending ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Play className="size-3.5" />
          )}
          {previewPending
            ? "Đang ghép…"
            : `Nghe thử (${selectedWithAudio.length})`}
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-8"
          onClick={onSelectAllWithAudio}
          disabled={
            turnsWithAudio.length === 0 || allWithAudioSelected
          }
          title="Chọn mọi turn đã có audio cache trong toàn bộ script"
        >
          Chọn tất cả có audio ({turnsWithAudio.length})
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-8"
          onClick={onClear}
        >
          Bỏ chọn
        </Button>
      </div>

      {previewError && (
        <div className="mx-2 mb-2 rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive">
          {previewError}
        </div>
      )}

      {previewMissing.length > 0 && (
        <div className="mx-2 mb-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-2 text-xs text-amber-700 dark:text-amber-300 flex items-start gap-1.5">
          <AlertCircle className="size-3.5 shrink-0 mt-0.5" />
          <span>
            Bỏ qua {previewMissing.length} turn chưa có audio: #
            {previewMissing
              .slice(0, 6)
              .map((i) => String(i + 1).padStart(2, "0"))
              .join(", #")}
            {previewMissing.length > 6 ? "…" : ""}. Gen audio những turn này
            trước nếu muốn ghép vào preview.
          </span>
        </div>
      )}

      {previewUrl && !previewPending && (
        <div className="mx-2 mb-2 flex items-center gap-2 flex-wrap">
          <audio
            controls
            preload="metadata"
            src={previewUrl}
            className="h-9 flex-1 min-w-[240px]"
          />
          <span className="text-[11px] font-mono text-muted-foreground">
            ~{(previewDurationMs / 1000).toFixed(1)}s
          </span>
        </div>
      )}
    </div>
  );
}

// ────── Audio Actions Panel ──────

/**
 * Pacing giữa các Gemini TTS live call để né rate limit (10 req/min free tier).
 * Server cũng có constant này — UI duplicate vì loop chạy client-side.
 */
const TTS_PACING_MS_UI = 6000;
const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

function AudioActionsPanel({
  ep,
  script,
  voiceConfig,
  audioStatus,
  batchState,
  setBatchState,
  onTurnGenned,
  onConcatDone,
}: {
  ep: EpisodeSummary;
  script: PodcastScript;
  voiceConfig: VoiceConfigState;
  audioStatus: TurnAudioStatus[];
  batchState: BatchState;
  setBatchState: React.Dispatch<React.SetStateAction<BatchState>>;
  onTurnGenned: (idx: number) => void;
  onConcatDone: () => void;
}) {
  const [forceRegen, setForceRegen] = useState(false);
  const [previewCount, setPreviewCount] = useState(10);
  const abortRef = useRef<AbortController | null>(null);

  const totalTurns = script.turns.length;
  const cachedCount = audioStatus.filter((s) => s.cached).length;
  const hasAudio = !!ep.audioPath;
  const isRunning =
    batchState.phase === "genning" || batchState.phase === "concatting";

  // Estimate seconds: turn ngoài cache đều phải gen + chờ pacing.
  const estimateSec = (count: number): number => {
    if (forceRegen) return count * 6;
    // Đoán số turn chưa cache trong phạm vi count đầu
    let missing = 0;
    const statusMap = new Map(audioStatus.map((s) => [s.idx, s]));
    for (let i = 0; i < count; i++) {
      if (!statusMap.get(i)?.cached) missing++;
    }
    return missing * 6;
  };

  const runBatch = async (
    fromIdx: number,
    count: number,
    alsoConcat: boolean,
  ) => {
    abortRef.current = new AbortController();
    const signal = abortRef.current.signal;
    const to = Math.min(script.turns.length, fromIdx + count);
    const statusMap = new Map(audioStatus.map((s) => [s.idx, s]));

    let liveCalls = 0;
    let generated = 0;
    let cached = 0;
    const blocked: Array<{ idx: number; reason: string }> = [];

    setBatchState({
      phase: "genning",
      current: fromIdx,
      total: to - fromIdx,
      range: { from: fromIdx, to },
      generated: 0,
      cached: 0,
      blocked: [],
      alsoConcat,
    });

    for (let i = fromIdx; i < to; i++) {
      if (signal.aborted) break;
      const turn = script.turns[i];
      if (!turn.text.trim()) continue;

      // Update progress + page hint trước mỗi turn
      setBatchState((prev) => ({ ...prev, current: i }));
      onTurnGenned(i);

      // Skip cached unless force
      if (!forceRegen && statusMap.get(i)?.cached) {
        cached++;
        setBatchState((prev) => ({ ...prev, cached }));
        continue;
      }

      if (liveCalls > 0) {
        // Pace — chia nhỏ để có thể abort giữa chừng
        const startWait = Date.now();
        while (Date.now() - startWait < TTS_PACING_MS_UI) {
          if (signal.aborted) break;
          await sleep(200);
        }
        if (signal.aborted) break;
      }

      const voiceCfg =
        turn.speaker === "host_nam"
          ? {
              voice: voiceConfig.hostNamVoice,
              styleInstruction: voiceConfig.hostNamStyle,
            }
          : {
              voice: voiceConfig.hostNuVoice,
              styleInstruction: voiceConfig.hostNuStyle,
            };

      try {
        await api.genPodcastScriptTurnAudio(ep.name, {
          turnIdx: i,
          voice: voiceCfg.voice,
          styleInstruction: voiceCfg.styleInstruction,
          ttsModel: voiceConfig.ttsModel,
          provider: voiceConfig.ttsProvider,
          force: forceRegen,
        });
        generated++;
        liveCalls++;
        setBatchState((prev) => ({ ...prev, generated }));
        onTurnGenned(i);
      } catch (e) {
        const err = e as { status?: number; code?: string; message?: string };
        if (err.status === 422 && err.code === "TTS_BLOCKED") {
          blocked.push({
            idx: i,
            reason:
              typeof (err as { details?: { blockReason?: unknown } }).details
                ?.blockReason === "string"
                ? ((err as { details?: { blockReason?: string } }).details
                    ?.blockReason as string)
                : "SAFETY",
          });
          liveCalls++; // vẫn tốn API call
          setBatchState((prev) => ({ ...prev, blocked: [...blocked] }));
          continue;
        }
        // Lỗi khác → abort
        setBatchState({
          phase: "error",
          generated,
          cached,
          blocked,
          error: err.message ?? String(e),
        });
        abortRef.current = null;
        return;
      }
    }

    // Phase 2: concat (nếu yêu cầu + chưa abort)
    if (alsoConcat && !signal.aborted) {
      setBatchState((prev) => ({
        ...prev,
        phase: "concatting",
        current: undefined,
      }));
      try {
        await api.concatPodcastScript(ep.name, { mixBgm: voiceConfig.mixBgm });
        onConcatDone();
      } catch (e) {
        const err = e as { code?: string; message?: string; details?: { missing?: number[] } };
        setBatchState({
          phase: "error",
          generated,
          cached,
          blocked,
          error:
            err.code === "MISSING_CACHE" && err.details?.missing
              ? `Concat fail: ${err.details.missing.length} turn còn thiếu PCM cache.`
              : err.message ?? String(e),
        });
        abortRef.current = null;
        return;
      }
    }

    setBatchState({
      phase: "done",
      generated,
      cached,
      blocked,
      range: { from: fromIdx, to },
      total: to - fromIdx,
      alsoConcat,
    });
    abortRef.current = null;
  };

  const cancel = () => {
    abortRef.current?.abort();
  };

  return (
    <Card className="p-5">
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <Music className="size-4 text-primary" />
        <h3 className="font-medium">Audio actions</h3>
        <Badge variant="outline" className="text-xs font-mono gap-1 bg-accent/5">
          <Volume2 className="size-3" />
          {cachedCount}/{totalTurns} turn cache
        </Badge>
        <Badge
          variant="outline"
          className={cn(
            "text-xs font-mono gap-1",
            voiceConfig.ttsProvider === "vertex-gemini"
              ? "bg-emerald-500/10 border-emerald-500/40 text-emerald-700 dark:text-emerald-300"
              : "bg-primary/5",
          )}
          title="Đổi channel trong Voice studio"
        >
          {voiceConfig.ttsProvider === "vertex-gemini"
            ? "Vertex AI (free)"
            : "AI Studio"}
        </Badge>
        <label className="ml-auto flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
          <input
            type="checkbox"
            checked={forceRegen}
            onChange={(e) => setForceRegen(e.target.checked)}
            disabled={isRunning}
            className="shrink-0"
          />
          Force re-gen (bỏ qua cache)
        </label>
      </div>

      {/* 2 actions: batch N + full concat */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Batch N */}
        <div className="rounded-md border p-3">
          <Label className="text-xs text-muted-foreground mb-2 block">
            Nghe thử nhanh
          </Label>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-muted-foreground">Gen</span>
            <input
              type="number"
              min={1}
              max={Math.max(1, totalTurns)}
              value={previewCount}
              onChange={(e) => {
                const v = Number(e.target.value);
                if (Number.isFinite(v))
                  setPreviewCount(
                    Math.max(1, Math.min(totalTurns || 1, v)),
                  );
              }}
              className="h-8 w-14 text-center bg-background border rounded text-xs font-mono"
              disabled={isRunning}
            />
            <span className="text-xs text-muted-foreground">lượt đầu</span>
            <Button
              size="sm"
              variant="default"
              className="h-8 ml-auto"
              onClick={() => runBatch(0, previewCount, false)}
              disabled={isRunning || totalTurns === 0}
              title={`Ước tính ~${estimateSec(previewCount)}s`}
            >
              {forceRegen ? (
                <RefreshCw className="size-3.5" />
              ) : (
                <Play className="size-3.5" />
              )}
              {forceRegen
                ? `Force gen ${previewCount}`
                : `Gen ${previewCount} lượt`}
            </Button>
          </div>
          <p className="mt-1.5 text-[11px] text-muted-foreground leading-relaxed">
            Gen audio cho {previewCount} turn đầu để nghe thử. Pace ~6s/req.
            Sau gen, dùng multi-select trong list để concat preview.
          </p>
        </div>

        {/* Full gen + concat */}
        <div className="rounded-md border p-3">
          <Label className="text-xs text-muted-foreground mb-2 block">
            Toàn bộ
          </Label>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-muted-foreground">
              {totalTurns} lượt
              {!forceRegen && cachedCount > 0
                ? ` · skip ${cachedCount} cached`
                : ""}
            </span>
            <Button
              size="sm"
              variant="default"
              className="h-8 ml-auto"
              onClick={() => {
                if (
                  hasAudio &&
                  !window.confirm(
                    `Episode đã có audio. Gen mới sẽ GHI ĐÈ. Tiếp tục?`,
                  )
                ) {
                  return;
                }
                runBatch(0, totalTurns, true);
              }}
              disabled={isRunning || totalTurns === 0}
              title={`Ước tính ~${estimateSec(totalTurns)}s + concat`}
            >
              {hasAudio ? (
                <RefreshCw className="size-3.5" />
              ) : (
                <Volume2 className="size-3.5" />
              )}
              Gen + concat toàn bộ
            </Button>
          </div>
          <p className="mt-1.5 text-[11px] text-muted-foreground leading-relaxed">
            Gen mọi turn còn thiếu + concat + loudnorm{" "}
            {voiceConfig.mixBgm && ep.config.bgm ? "+ BGM mix " : ""}→{" "}
            <code className="font-mono">input/{ep.name}.aac</code>.
          </p>
        </div>
      </div>

      {/* Progress / status */}
      {isRunning && (
        <div className="mt-3 rounded-md border border-accent/40 bg-accent/5 p-3">
          <div className="flex items-center gap-2 flex-wrap">
            <Loader2 className="size-4 animate-spin text-accent shrink-0" />
            <span className="text-sm font-medium">
              {batchState.phase === "concatting"
                ? "Đang concat + loudnorm…"
                : batchState.current !== undefined
                  ? `Đang gen turn #${String(batchState.current + 1).padStart(2, "0")} / ${batchState.range?.to ?? "?"}`
                  : "Đang chạy…"}
            </span>
            <span className="text-xs text-muted-foreground font-mono">
              {batchState.generated} mới · {batchState.cached} cache
              {batchState.blocked.length > 0
                ? ` · ${batchState.blocked.length} blocked`
                : ""}
            </span>
            <Button
              size="sm"
              variant="ghost"
              className="ml-auto h-7 text-destructive hover:bg-destructive/10"
              onClick={cancel}
              title="Dừng sau turn hiện tại — turn đã gen được giữ"
            >
              <X className="size-3.5" />
              Cancel
            </Button>
          </div>
          {batchState.range && batchState.total ? (
            <div className="mt-2 h-1.5 w-full rounded-full bg-secondary overflow-hidden">
              <div
                className="h-full bg-accent transition-all"
                style={{
                  width: `${Math.min(100, ((batchState.generated + batchState.cached + batchState.blocked.length) / batchState.total) * 100)}%`,
                }}
              />
            </div>
          ) : null}
        </div>
      )}

      {batchState.phase === "done" && (
        <div className="mt-3 space-y-1.5">
          <div className="rounded-md border border-accent/30 bg-accent/5 p-2 text-xs">
            ✓ {batchState.range ? `Range #${batchState.range.from + 1}–#${batchState.range.to} · ` : ""}
            {batchState.generated} gen mới · {batchState.cached} reuse cache
            {batchState.blocked.length > 0
              ? ` · ${batchState.blocked.length} blocked`
              : ""}
            {batchState.alsoConcat ? " · concat done" : ""}
          </div>
          {batchState.blocked.length > 0 && (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-2 text-xs text-amber-700 dark:text-amber-300 flex items-start gap-1.5">
              <AlertCircle className="size-3.5 shrink-0 mt-0.5" />
              <span>
                Gemini chặn{" "}
                {batchState.blocked
                  .map(
                    (b) =>
                      `#${String(b.idx + 1).padStart(2, "0")} (${b.reason})`,
                  )
                  .join(", ")}
                . Sửa text turn đó rồi bấm Gen lại — các turn khác đã gen
                xong.
              </span>
            </div>
          )}
        </div>
      )}

      {batchState.phase === "error" && batchState.error && (
        <div className="mt-3 rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive flex items-start gap-2">
          <AlertCircle className="size-3.5 mt-0.5 shrink-0" />
          <span>{batchState.error}</span>
        </div>
      )}

      {hasAudio && !isRunning && (
        <div className="mt-3 pt-3 border-t">
          <Label className="text-xs text-muted-foreground mb-1.5 block">
            Audio final đang có
          </Label>
          <audio
            controls
            preload="metadata"
            src={`/input/${encodeURIComponent(ep.audioPath!.split("/").pop()!)}`}
            className="w-full h-10"
          />
        </div>
      )}
    </Card>
  );
}
