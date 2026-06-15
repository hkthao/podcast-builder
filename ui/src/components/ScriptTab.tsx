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
import { useEffect, useState, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  ChevronDown,
  FileAudio2,
  FileText,
  Headphones,
  Lightbulb,
  Loader2,
  Mic2,
  Music,
  Plus,
  RefreshCw,
  Sparkles,
  SpellCheck,
  Volume2,
  X,
} from "lucide-react";
import { SpellFixPanel } from "./SpellFixPanel";
import { applySpellFix } from "./spell-fix-rules";
import type { SpellFixRule } from "./spell-fix-rules";
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

      {scriptQ.isLoading ? (
        <Card className="h-32 animate-pulse bg-muted/30" />
      ) : scriptQ.data && scriptQ.data.turns.length > 0 ? (
        <>
          <ScriptEditor
            episodeName={ep.name}
            script={scriptQ.data}
            onUpdate={(s) =>
              qc.setQueryData(["podcast-script", ep.name], s)
            }
          />
          <VoiceStudioPanel
            ep={ep}
            script={scriptQ.data}
            voices={voicesQ.data?.voices ?? []}
            defaults={
              voicesQ.data?.defaults ?? {
                hostNam: "Charon",
                hostNu: "Aoede",
              }
            }
            onAudioGen={() => {
              // Audio đã ghi vào input/{slug}.aac — refresh episode để pick up
              qc.invalidateQueries({ queryKey: ["episode", ep.name] });
              qc.invalidateQueries({ queryKey: ["episode-files", ep.name] });
            }}
          />
        </>
      ) : (
        <Card className="p-8 text-center border-dashed">
          <FileText className="mx-auto mb-3 size-10 text-muted-foreground" />
          <p className="font-medium">Chưa có kịch bản</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Pick nguồn (essay/brainstorm/tài liệu) ở panel trên rồi bấm{" "}
            <strong>Gen kịch bản</strong>.
          </p>
        </Card>
      )}
    </div>
  );
}

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
  episodeName,
  script,
  onUpdate,
}: {
  episodeName: string;
  script: PodcastScript;
  onUpdate: (s: PodcastScript) => void;
}) {
  const [turns, setTurns] = useState<PodcastScriptTurn[]>(script.turns);
  const [dirty, setDirty] = useState(false);

  // Sync khi parent refresh (sau gen)
  useEffect(() => {
    if (!dirty) setTurns(script.turns);
  }, [script.turns, dirty]);

  const saveMut = useMutation({
    mutationFn: (next: PodcastScriptTurn[]) =>
      api.savePodcastScript(episodeName, { turns: next }),
    onSuccess: (s) => {
      onUpdate(s);
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

  return (
    <Card className="p-5">
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <Mic2 className="size-4 text-primary" />
        <h3 className="font-medium">Kịch bản dialogue</h3>
        <Badge variant="outline" className="text-xs font-mono ml-auto">
          {turns.length} lượt · {wordCount} từ · ~{estMinutes.toFixed(1)}p
        </Badge>
      </div>

      <div className="space-y-2">
        {turns.map((turn, i) => (
          <TurnRow
            key={i}
            turn={turn}
            idx={i}
            onUpdate={(patch) => updateTurn(i, patch)}
            onDelete={() => deleteTurn(i)}
            onAddAfter={() => addTurn(i)}
            onSwapSpeaker={() => swapSpeaker(i)}
          />
        ))}
      </div>

      {saveMut.isError && (
        <div className="mt-3 rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive">
          Lưu thất bại: {String(saveMut.error)}
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
    </Card>
  );
}

function TurnRow({
  turn,
  idx,
  onUpdate,
  onDelete,
  onAddAfter,
  onSwapSpeaker,
}: {
  turn: PodcastScriptTurn;
  idx: number;
  onUpdate: (patch: Partial<PodcastScriptTurn>) => void;
  onDelete: () => void;
  onAddAfter: () => void;
  onSwapSpeaker: () => void;
}) {
  const meta = SPEAKER_META[turn.speaker];
  const wordCount = turn.text.trim().split(/\s+/).filter(Boolean).length;

  return (
    <div className="group flex gap-3 items-start">
      <div className="flex flex-col items-center gap-1 shrink-0 pt-1">
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
        <div className="mt-0.5 flex items-center justify-between text-[10px] text-muted-foreground">
          <span>{wordCount} từ</span>
          {turn.text.match(/\[(laughs|sighs|whispers)\]/g) && (
            <span className="text-accent">
              audio tag: {turn.text.match(/\[(laughs|sighs|whispers)\]/g)?.join(" ")}
            </span>
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

function VoiceStudioPanel({
  ep,
  script,
  voices,
  defaults,
  onAudioGen,
}: {
  ep: EpisodeSummary;
  script: PodcastScript;
  voices: VoiceInfo[];
  defaults: { hostNam: string; hostNu: string };
  onAudioGen: () => void;
}) {
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
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const audioMut = useMutation({
    mutationFn: () =>
      api.genPodcastScriptAudio(ep.name, {
        ttsModel,
        hostNam: { voice: hostNamVoice, styleInstruction: hostNamStyle },
        hostNu: { voice: hostNuVoice, styleInstruction: hostNuStyle },
        mixBgm,
        force: true,
      }),
    onSuccess: () => onAudioGen(),
  });

  const geminiVoices = voices.filter((v) => v.provider === "gemini");
  const hostNamSuggestions = geminiVoices.filter(
    (v) => v.suggestedRole === "host_nam",
  );
  const hostNuSuggestions = geminiVoices.filter(
    (v) => v.suggestedRole === "host_nu",
  );

  const hasBgm = !!ep.config.bgm;
  const hasAudio = !!ep.audioPath;

  return (
    <Card className="p-5">
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <Headphones className="size-4 text-primary" />
        <h3 className="font-medium">Voice studio</h3>
        {hasAudio && (
          <Badge variant="outline" className="text-[10px] gap-1">
            <FileAudio2 className="size-3" />
            Đã có audio
          </Badge>
        )}
      </div>

      <p className="text-xs text-muted-foreground mb-4 leading-relaxed">
        Gen audio TTS turn-by-turn 2 voice qua Gemini AI Studio. Mỗi turn dispatch
        sang voice tương ứng speaker. Audio output ghi đè <code className="font-mono">input/{ep.name}.aac</code>{" "}
        — pipeline render/transcript cũ tự pick up. Mất ~60-120s tuỳ độ dài.
      </p>

      {/* 2 voice columns — flat, dùng vertical divider thay vì border box */}
      <div className="grid grid-cols-1 md:grid-cols-2 md:divide-x md:divide-border gap-6 md:gap-0">
        <VoiceColumn
          label="Host Nam"
          emoji="♂"
          accentColor="text-sky-600 dark:text-sky-400"
          voice={hostNamVoice}
          onVoiceChange={setHostNamVoice}
          style={hostNamStyle}
          onStyleChange={setHostNamStyle}
          defaultStyle={DEFAULT_HOST_NAM_STYLE}
          voices={geminiVoices}
          suggestions={hostNamSuggestions}
          cellPadding="md:pr-6"
        />
        <VoiceColumn
          label="Host Nữ"
          emoji="♀"
          accentColor="text-rose-600 dark:text-rose-400"
          voice={hostNuVoice}
          onVoiceChange={setHostNuVoice}
          style={hostNuStyle}
          onStyleChange={setHostNuStyle}
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
              <Label className="text-xs text-muted-foreground">TTS model</Label>
              <select
                value={ttsModel}
                onChange={(e) => setTtsModel(e.target.value)}
                className="h-9 w-full rounded-md border border-input bg-background px-2 text-xs"
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
                checked={mixBgm && hasBgm}
                onChange={(e) => setMixBgm(e.target.checked)}
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
                      Episode chưa set BGM. Set qua tab <strong>Cấu hình</strong>{" "}
                      hoặc upload file vào <code className="font-mono">input/</code>{" "}
                      và set tên trong config.
                    </>
                  )}
                </p>
              </label>
            </div>
          </div>
        )}
      </div>

      {/* Audio preview — flat section, không box */}
      {hasAudio && (
        <div className="mt-4 pt-3 border-t">
          <Label className="text-xs text-muted-foreground mb-1.5 block">
            Audio đang có
          </Label>
          <audio
            controls
            preload="metadata"
            src={`/input/${encodeURIComponent(ep.audioPath!.split("/").pop()!)}`}
            className="w-full h-10"
          />
        </div>
      )}

      {audioMut.isError && (
        <div className="mt-3 rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive flex items-start gap-2">
          <AlertCircle className="size-3.5 mt-0.5 shrink-0" />
          <span>{String(audioMut.error)}</span>
        </div>
      )}

      {audioMut.isPending && (
        <p className="mt-3 text-xs text-muted-foreground">
          TTS {script.turns.length} lượt → loudnorm AAC
          {mixBgm && hasBgm ? " → BGM mix" : ""}. Hold tight ~60-120s…
        </p>
      )}

      <div className="mt-4 pt-3 border-t flex items-center justify-end">
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            if (
              hasAudio &&
              !window.confirm(
                `Episode đã có audio (${ep.audioPath?.split("/").pop()}). Gen mới sẽ GHI ĐÈ. Tiếp tục?`,
              )
            ) {
              return;
            }
            audioMut.mutate();
          }}
          disabled={audioMut.isPending || script.turns.length === 0}
        >
          {audioMut.isPending ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : hasAudio ? (
            <RefreshCw className="size-3.5" />
          ) : (
            <Volume2 className="size-3.5" />
          )}
          {audioMut.isPending
            ? "Đang gen…"
            : hasAudio
              ? "Re-gen audio"
              : "Gen audio"}
        </Button>
      </div>
    </Card>
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
          mô tả, KHÔNG đọc thành tiếng. Pattern: <code className="font-mono">[Hồ sơ âm thanh: …]</code>.
        </p>
      </div>
    </div>
  );
}
