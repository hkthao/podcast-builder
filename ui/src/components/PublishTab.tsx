import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Send,
  CheckCircle2,
  Circle,
  Clock,
  Copy,
  Check,
  Download,
  ExternalLink,
  FileText,
  Image as ImageIcon,
  Hash,
  Quote,
  AlertCircle,
  RotateCcw,
  Sparkles,
  Loader2,
  X as XIcon,
  Plus,
  ShieldCheck,
  ChevronDown,
} from "lucide-react";
import {
  api,
  ApiError,
  type EpisodeConfig,
  type EpisodeFiles,
  type EpisodeSummary,
  type LLMProvider,
} from "@/lib/api";
import { Facebook } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/** FB Reels best practice: 3-5 hashtags max. */
const MAX_HASHTAGS = 5;

/** Tên brand mặc định cho phần ghi công khi scriptCredit để trống. */
const BRAND_NAME = "ByteCast Tech";

/**
 * Dựng khối "công bố AI + ghi công" chèn vào cuối mô tả khi đăng.
 * Đáp ứng yêu cầu originality của Meta: công bố nội dung AI + ghi rõ đóng góp
 * người thật (kịch bản gốc, biên tập, nguồn). Xem docs/originality-upgrade-plan.md §5.1.
 */
function buildDisclosure(opts: {
  aiAssisted: boolean;
  editor: string;
  musicCredit: string;
  footageCredit: string;
  sources: string[];
}): string {
  const lines: string[] = [];
  if (opts.aiAssisted) {
    lines.push(
      `Kịch bản gốc do ${opts.editor} biên soạn và biên tập từ nhiều nguồn tham khảo; phần lời dẫn được tạo bằng công cụ giọng nói AI, do ${BRAND_NAME} định hướng và biên tập.`,
    );
  } else {
    lines.push(`Kịch bản gốc do ${opts.editor} biên soạn và biên tập.`);
  }
  if (opts.musicCredit) lines.push(`Nhạc nền: ${opts.musicCredit}.`);
  if (opts.footageCredit) lines.push(`${opts.footageCredit}.`);
  if (opts.sources.length) {
    lines.push(`Nguồn tham khảo: ${opts.sources.join("; ")}.`);
  }
  return lines.join("\n");
}

/** Curated short list — FB ưu tiên ÍT mà RELEVANT. User add custom thêm. */
const DEFAULT_HASHTAGS = [
  "bytecasttech",
  "podcast",
  "triethoc",
  "tamlyhoc",
  "suyngam",
];

/** Suggestions thêm — user có thể quick-add đến khi đạt 5 max. */
const SUGGESTED_HASHTAGS = [
  "bytecasttech",
  "podcast",
  "podcasttiengviet",
  "triethoc",
  "tamlyhoc",
  "suyngam",
  "cuocsong",
  "chodi",
  "philosophy",
  "psychology",
  "mindfulness",
];

const FB_REELS_URL =
  "https://www.facebook.com/reels/create/";

type PublishStatus = EpisodeConfig["publishStatus"];

const STATUS_META: Record<
  PublishStatus,
  { label: string; icon: React.ReactNode; color: string; description: string }
> = {
  draft: {
    label: "Bản nháp",
    icon: <Circle className="size-4" />,
    color: "text-muted-foreground",
    description: "Chưa review xong — soạn caption + hashtag trước khi đăng.",
  },
  ready: {
    label: "Sẵn sàng đăng",
    icon: <Clock className="size-4 text-amber-500" />,
    color: "text-amber-600 dark:text-amber-400",
    description: "Đã review OK — mở FB Reels Creator + paste caption.",
  },
  published: {
    label: "Đã đăng",
    icon: <CheckCircle2 className="size-4 text-accent" />,
    color: "text-accent",
    description: "Tập này đã lên sóng.",
  },
};

export function PublishTab({
  ep,
  files,
  loading,
}: {
  ep: EpisodeSummary;
  files: EpisodeFiles;
  loading: boolean;
}) {
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  // Local mirror of publish fields — auto-save on change
  const [caption, setCaption] = useState(ep.config.publishCaption ?? "");
  const [hashtags, setHashtags] = useState<string[]>(
    ep.config.publishHashtags.length > 0
      ? ep.config.publishHashtags.slice(0, MAX_HASHTAGS)
      : DEFAULT_HASHTAGS,
  );
  const [hashtagInput, setHashtagInput] = useState("");

  // Công bố AI + ghi công (Meta originality)
  const [aiAssisted, setAiAssisted] = useState(ep.config.aiAssisted ?? true);
  const [scriptCredit, setScriptCredit] = useState(ep.config.scriptCredit ?? "");
  const [musicCredit, setMusicCredit] = useState(ep.config.musicCredit ?? "");
  const [footageCredit, setFootageCredit] = useState(
    ep.config.footageCredit ?? "",
  );
  const [sourcesText, setSourcesText] = useState(
    (ep.config.sources ?? []).join("\n"),
  );

  // Sync local ↔ server when ep changes (e.g., after save)
  const lastSeenMtime = useRef(ep.mtimeMs);
  useEffect(() => {
    if (ep.mtimeMs !== lastSeenMtime.current) {
      lastSeenMtime.current = ep.mtimeMs;
      setCaption(ep.config.publishCaption ?? "");
      if (ep.config.publishHashtags.length > 0) {
        setHashtags(ep.config.publishHashtags);
      }
      setAiAssisted(ep.config.aiAssisted ?? true);
      setScriptCredit(ep.config.scriptCredit ?? "");
      setMusicCredit(ep.config.musicCredit ?? "");
      setFootageCredit(ep.config.footageCredit ?? "");
      setSourcesText((ep.config.sources ?? []).join("\n"));
    }
  }, [ep.mtimeMs, ep.config]);

  const saveMut = useMutation({
    mutationFn: (patch: Partial<EpisodeConfig>) =>
      api.saveEpisodeConfig(ep.name, { ...ep.config, ...patch }),
    onSuccess: (updated) => {
      qc.setQueryData(["episode", ep.name], updated);
      qc.invalidateQueries({ queryKey: ["episodes"] });
      setError(null);
    },
    onError: (err) => {
      setError(err instanceof ApiError ? err.message : String(err));
    },
  });

  // Nguồn parse từ textarea (mỗi dòng 1 nguồn)
  const sourcesArr = sourcesText
    .split("\n")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  // Debounce save when any publish field changes
  const debounceRef = useRef<number | null>(null);
  useEffect(() => {
    const unchanged =
      caption === (ep.config.publishCaption ?? "") &&
      JSON.stringify(hashtags) === JSON.stringify(ep.config.publishHashtags) &&
      aiAssisted === (ep.config.aiAssisted ?? true) &&
      scriptCredit === (ep.config.scriptCredit ?? "") &&
      musicCredit === (ep.config.musicCredit ?? "") &&
      footageCredit === (ep.config.footageCredit ?? "") &&
      JSON.stringify(sourcesArr) === JSON.stringify(ep.config.sources ?? []);
    if (unchanged) return;
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      saveMut.mutate({
        publishCaption: caption || null,
        publishHashtags: hashtags,
        aiAssisted,
        scriptCredit: scriptCredit || null,
        musicCredit: musicCredit || null,
        footageCredit: footageCredit || null,
        sources: sourcesArr,
      });
    }, 700);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caption, hashtags, aiAssisted, scriptCredit, musicCredit, footageCredit, sourcesText]);

  const setStatus = (next: PublishStatus) => {
    saveMut.mutate({
      publishStatus: next,
      publishedAt: next === "published" ? new Date().toISOString() : null,
    });
  };

  // Lưu ngay caption/hashtag/công bố trước khi đăng (server dựng mô tả từ config).
  const flushPublishFields = async (): Promise<void> => {
    await saveMut.mutateAsync({
      publishCaption: caption || null,
      publishHashtags: hashtags,
      aiAssisted,
      scriptCredit: scriptCredit || null,
      musicCredit: musicCredit || null,
      footageCredit: footageCredit || null,
      sources: sourcesArr,
    });
  };

  // Fetch linked essay for derivatives (fbPosts, quotes)
  const essayQ = useQuery({
    queryKey: ["essay", ep.config.essayId],
    queryFn: () => api.getEssay(ep.config.essayId!),
    enabled: !!ep.config.essayId,
    staleTime: 60_000,
  });
  const essay = essayQ.data;
  const fbPostSuggestions = essay?.derivatives.fbPosts ?? [];
  const quoteSuggestions = essay?.derivatives.quotes ?? [];

  // LLM models for "AI gen" button
  const modelsQ = useQuery({
    queryKey: ["llm-models"],
    queryFn: () => api.listLLMModels(),
    staleTime: 60_000,
  });
  const [llmProvider, setLlmProvider] = useState<LLMProvider>(
    essay?.provider ?? "openai",
  );
  const [llmModel, setLlmModel] = useState<string>(
    essay?.model ?? "gpt-4o-mini",
  );
  // Sync default to essay's provider/model when essay loads
  useEffect(() => {
    if (!essay) return;
    setLlmProvider(essay.provider);
    setLlmModel(essay.model);
  }, [essay]);

  const aiGenMut = useMutation({
    mutationFn: () =>
      api.genSocialCaption({
        title: ep.config.title,
        hook: ep.config.hook,
        essayContent: essay?.content,
        provider: llmProvider,
        model: llmModel,
      }),
    onSuccess: (data) => {
      setCaption(data.caption);
      if (data.hashtags.length > 0) setHashtags(data.hashtags);
    },
  });

  const addHashtag = (raw: string) => {
    const clean = raw
      .replace(/^#/, "")
      .trim()
      .replace(/\s+/g, "")
      .toLowerCase();
    if (!clean) return;
    if (hashtags.includes(clean)) return;
    if (hashtags.length >= MAX_HASHTAGS) return;
    setHashtags([...hashtags, clean]);
  };

  const removeHashtag = (h: string) => {
    setHashtags(hashtags.filter((x) => x !== h));
  };

  const disclosure = buildDisclosure({
    aiAssisted,
    editor: scriptCredit.trim() || BRAND_NAME,
    musicCredit: musicCredit.trim(),
    footageCredit: footageCredit.trim(),
    sources: sourcesArr,
  });
  const hashtagLine = hashtags.map((h) => `#${h}`).join(" ");
  // Mô tả cuối = caption + hashtags + khối công bố (bỏ phần rỗng).
  const fullCaption = [caption, hashtagLine, disclosure]
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .join("\n\n");

  if (loading) {
    return <Card className="h-64 animate-pulse bg-muted/30" />;
  }

  const fullVideo = files.output.find((f) => f.kind === "video-full");
  const renderThumbnail = files.output.find((f) => f.kind === "thumbnail");
  // Cover ưu tiên: user-uploaded coverImage (input/) > thumb render (output/)
  const userCover = ep.config.coverImage
    ? files.input.find(
        (f) => f.kind === "cover" && f.filename === ep.config.coverImage,
      )
    : null;
  const displayCover = userCover ?? renderThumbnail;
  const isUserCover = !!userCover;
  const status = ep.config.publishStatus;
  const statusMeta = STATUS_META[status];
  const isReady = !!fullVideo;

  return (
    <div className="space-y-6">
      {/* Status banner */}
      <Card
        className={cn(
          "p-0 overflow-hidden border-l-4",
          status === "published"
            ? "border-l-accent"
            : status === "ready"
              ? "border-l-amber-500"
              : "border-l-muted",
        )}
      >
        <header className="px-5 py-3 border-b bg-secondary/30 flex items-center gap-2">
          <Send className="size-4 text-accent" />
          <span className="font-medium text-sm">Đăng lên FB Reels</span>
          <Badge
            variant="outline"
            className={cn("gap-1.5 font-mono ml-1", statusMeta.color)}
          >
            {statusMeta.icon}
            {statusMeta.label}
          </Badge>
        </header>
        <div className="p-5">
          <p className="text-sm text-muted-foreground">
            {statusMeta.description}
          </p>
          {status === "published" && ep.config.publishedAt && (
            <p className="text-xs text-muted-foreground mt-2">
              Đã đăng lúc:{" "}
              <code className="font-mono">
                {new Date(ep.config.publishedAt).toLocaleString("vi-VN")}
              </code>
            </p>
          )}
          {error && (
            <p className="mt-3 text-xs text-destructive flex items-center gap-1">
              <AlertCircle className="size-3" />
              {error}
            </p>
          )}
        </div>
        <footer className="px-5 py-3 border-t flex items-center justify-end gap-2">
          {status === "draft" && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setStatus("ready")}
              disabled={!isReady}
              title={isReady ? "" : "Cần render video trước"}
            >
              <Clock className="size-3.5" />
              Sẵn sàng đăng
            </Button>
          )}
          {status === "ready" && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setStatus("draft")}
              >
                <RotateCcw className="size-3.5" />
                Về draft
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setStatus("published")}
              >
                <CheckCircle2 className="size-3.5" />
                Đánh dấu đã đăng
              </Button>
            </>
          )}
          {status === "published" && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (window.confirm("Đặt lại về 'sẵn sàng đăng'?"))
                  setStatus("ready");
              }}
            >
              <RotateCcw className="size-3.5" />
              Đăng lại
            </Button>
          )}
        </footer>
      </Card>

      {!isReady && (
        <Card className="p-4 border-amber-500/40 bg-amber-500/5 text-sm flex items-start gap-2">
          <AlertCircle className="size-4 text-amber-600 shrink-0 mt-0.5" />
          <span>
            Chưa có video render. Sang tab <strong>Render</strong> bấm "Render
            full" trước.
          </span>
        </Card>
      )}

      {/* Video & thumbnail block */}
      {isReady && fullVideo && (
        <CollapsibleCard
          icon={<ImageIcon className="size-4 text-accent" />}
          title="Asset cần upload"
          headerRight={
            <code className="text-xs text-muted-foreground font-mono truncate max-w-[220px]">
              {fullVideo.filename}
            </code>
          }
        >
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_180px] gap-4 p-5">
            <div>
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                Video (.mp4)
              </Label>
              <div className="mt-2 bg-black rounded-md overflow-hidden">
                <video
                  controls
                  src={fullVideo.url}
                  className="w-full max-h-72 object-contain"
                  preload="metadata"
                  poster={displayCover?.url}
                />
              </div>
            </div>
            <div>
              <Label className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                Cover{isUserCover && <Badge variant="accent" className="text-[9px] ml-1">user</Badge>}
              </Label>
              <div className="mt-2 bg-secondary/30 rounded-md overflow-hidden border">
                {displayCover ? (
                  <img
                    src={displayCover.url}
                    alt="cover"
                    className="w-full object-cover"
                    style={{ aspectRatio: "9/16" }}
                  />
                ) : (
                  <div
                    className="flex items-center justify-center text-muted-foreground/60"
                    style={{ aspectRatio: "9/16" }}
                  >
                    <ImageIcon className="size-8" />
                  </div>
                )}
              </div>
              <p className="mt-1.5 text-[10px] text-muted-foreground">
                {isUserCover
                  ? "Ảnh user upload (Cấu hình → Ảnh cover)"
                  : "Thumbnail tự gen từ video render"}
              </p>
            </div>
          </div>
          <footer className="px-5 py-3 border-t flex items-center justify-end gap-2">
            {displayCover && (
              <Button variant="outline" size="sm" asChild>
                <a href={displayCover.url} download={displayCover.filename}>
                  <Download className="size-3.5" />
                  Tải cover
                </a>
              </Button>
            )}
            <Button variant="outline" size="sm" asChild>
              <a href={fullVideo.url} download={fullVideo.filename}>
                <Download className="size-3.5" />
                Tải video
              </a>
            </Button>
          </footer>
        </CollapsibleCard>
      )}

      {/* Caption */}
      <CollapsibleCard
        icon={<FileText className="size-4 text-accent" />}
        title="Caption"
        headerRight={
          <span className="text-xs text-muted-foreground tabular-nums">
            {caption.length} ký tự
          </span>
        }
      >
        <div className="p-5 space-y-3">
          <p className="text-xs text-muted-foreground">
            <strong>FB mobile</strong> cut sau ~125 ký tự → dòng 1 nên là{" "}
            <strong>video title</strong>, dòng 2 hook. Phần sau bị fold vào "Xem
            thêm".
          </p>

          {/* Mobile preview — 125 chars cut indicator */}
          {caption.length > 0 && (
            <div className="rounded-md border bg-secondary/20 p-3 text-xs">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5 flex items-center justify-between">
                <span>Preview mobile (dòng feed)</span>
                <span className="tabular-nums">
                  {Math.min(caption.length, 125)}/125
                </span>
              </div>
              <div className="font-sans leading-relaxed whitespace-pre-wrap">
                <span>{caption.slice(0, 125)}</span>
                {caption.length > 125 && (
                  <span className="text-accent font-medium">
                    … <span className="underline">Xem thêm</span>
                  </span>
                )}
              </div>
            </div>
          )}

          {aiGenMut.isError && (
            <p className="text-xs text-destructive flex items-center gap-1">
              <AlertCircle className="size-3" />
              AI gen thất bại: {String(aiGenMut.error)}
            </p>
          )}
          {aiGenMut.isSuccess && !aiGenMut.isPending && (
            <p className="text-xs text-accent flex items-center gap-1">
              <CheckCircle2 className="size-3" />
              Đã gen caption + hashtags. Sửa thoải mái.
            </p>
          )}
          <Textarea
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            placeholder={
              fbPostSuggestions.length > 0
                ? "Dòng 1 nên là video title, dòng 2 hook. Hoặc bấm 'AI gen' dưới…"
                : "Dòng 1 = title, dòng 2 = hook. Hoặc bấm 'AI gen' dưới…"
            }
            rows={5}
            className="font-sans text-sm leading-relaxed"
          />
          {/* Auto-suggestions from essay derivatives */}
          {fbPostSuggestions.length > 0 && (
            <div>
              <Label className="text-xs uppercase tracking-wider text-muted-foreground mb-1.5 flex items-center gap-1">
                <Sparkles className="size-3" />
                Gợi ý từ essay derivatives (FB posts)
              </Label>
              <div className="space-y-1.5">
                {fbPostSuggestions.map((p, i) => (
                  <div
                    key={i}
                    className="rounded-md border bg-secondary/20 p-2 text-xs space-y-1.5"
                  >
                    <p className="line-clamp-2 leading-relaxed">{p}</p>
                    <div className="flex gap-1.5">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-6 text-[10px] px-2"
                        onClick={() => setCaption(p)}
                      >
                        <Check className="size-3" />
                        Dùng
                      </Button>
                      <CopyChip text={p} label="Copy" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        <footer className="px-5 py-3 border-t flex items-center justify-end gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const title = ep.config.title.trim();
              if (!title) return;
              // Prepend nếu chưa có title ở dòng 1
              const firstLine = caption.split("\n")[0]?.trim() ?? "";
              if (firstLine.toLowerCase().includes(title.toLowerCase())) return;
              setCaption(caption ? `${title}\n${caption}` : title);
            }}
            disabled={
              !ep.config.title ||
              caption
                .split("\n")[0]
                ?.toLowerCase()
                .includes(ep.config.title.toLowerCase())
            }
            title="Chèn video title làm dòng 1 (để mobile hiển thị đúng title)"
          >
            <FileText className="size-3.5" />
            Chèn title
          </Button>
          <select
            value={llmProvider}
            onChange={(e) => setLlmProvider(e.target.value as LLMProvider)}
            disabled={modelsQ.isLoading || aiGenMut.isPending}
            className="h-8 text-xs rounded-md border border-input bg-background px-2"
            title="LLM provider"
          >
            <option value="openai" disabled={!modelsQ.data?.openai.length}>
              OpenAI
            </option>
            <option value="ollama" disabled={!modelsQ.data?.ollama.length}>
              Ollama
            </option>
          </select>
          <select
            value={llmModel}
            onChange={(e) => setLlmModel(e.target.value)}
            disabled={
              modelsQ.isLoading ||
              aiGenMut.isPending ||
              (modelsQ.data?.[llmProvider]?.length ?? 0) === 0
            }
            className="h-8 text-xs rounded-md border border-input bg-background px-2 max-w-[180px]"
            title="LLM model"
          >
            {(modelsQ.data?.[llmProvider] ?? []).map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
          <Button
            variant="outline"
            size="sm"
            onClick={() => aiGenMut.mutate()}
            disabled={aiGenMut.isPending || !ep.config.title}
            title="LLM gen caption + hashtags từ title + hook + essay"
          >
            {aiGenMut.isPending ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Sparkles className="size-3.5" />
            )}
            AI gen
          </Button>
          <CopyButton
            text={fullCaption}
            label={`Copy caption + ${hashtags.length} hashtag`}
            disabled={fullCaption.length === 0}
          />
        </footer>
      </CollapsibleCard>

      {/* Hashtags */}
      <CollapsibleCard
        icon={<Hash className="size-4 text-accent" />}
        title="Hashtags"
        headerRight={
          <span
            className={cn(
              "text-xs tabular-nums",
              hashtags.length >= MAX_HASHTAGS
                ? "text-accent font-medium"
                : "text-muted-foreground",
            )}
          >
            {hashtags.length}/{MAX_HASHTAGS}
          </span>
        }
      >
        <div className="p-5 space-y-3">
          <p className="text-xs text-muted-foreground">
            FB Reels recommend tối đa <strong>5 hashtag</strong> — chọn cái
            relevant nhất, KHÔNG spam (FB ranking penalize hashtag stuffing).
          </p>
          <div className="flex flex-wrap gap-1.5">
            {hashtags.map((h) => (
              <Badge
                key={h}
                variant="secondary"
                className="gap-1 pl-2 pr-1 py-1 text-sm"
              >
                #{h}
                <button
                  type="button"
                  onClick={() => removeHashtag(h)}
                  className="hover:text-destructive rounded p-0.5"
                  aria-label={`Xoá ${h}`}
                >
                  <XIcon className="size-3" />
                </button>
              </Badge>
            ))}
            {hashtags.length === 0 && (
              <p className="text-xs text-muted-foreground italic">
                Chưa có hashtag — thêm vài cái bên dưới (max {MAX_HASHTAGS}).
              </p>
            )}
          </div>
          <div className="flex gap-2">
            <Input
              value={hashtagInput}
              onChange={(e) => setHashtagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === ",") {
                  e.preventDefault();
                  addHashtag(hashtagInput);
                  setHashtagInput("");
                }
              }}
              placeholder={
                hashtags.length >= MAX_HASHTAGS
                  ? `Đã đạt ${MAX_HASHTAGS} max — xoá bớt để add mới`
                  : `Thêm hashtag (Enter để add)…`
              }
              disabled={hashtags.length >= MAX_HASHTAGS}
              className="text-sm"
            />
          </div>
          {hashtags.length < MAX_HASHTAGS && (
            <div>
              <Label className="text-xs uppercase tracking-wider text-muted-foreground mb-1.5">
                Gợi ý nhanh ({MAX_HASHTAGS - hashtags.length} slot trống)
              </Label>
              <div className="flex flex-wrap gap-1.5">
                {SUGGESTED_HASHTAGS.filter((h) => !hashtags.includes(h)).map(
                  (h) => (
                    <button
                      key={h}
                      type="button"
                      onClick={() => addHashtag(h)}
                      className="text-xs px-2 py-1 rounded border border-dashed text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
                    >
                      + #{h}
                    </button>
                  ),
                )}
              </div>
            </div>
          )}
        </div>
        <footer className="px-5 py-3 border-t flex items-center justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              addHashtag(hashtagInput);
              setHashtagInput("");
            }}
            disabled={!hashtagInput.trim() || hashtags.length >= MAX_HASHTAGS}
          >
            <Plus className="size-3.5" />
            Thêm hashtag
          </Button>
          <CopyButton
            text={hashtags.map((h) => `#${h}`).join(" ")}
            label="Copy hashtags"
            disabled={hashtags.length === 0}
          />
        </footer>
      </CollapsibleCard>

      {/* Công bố AI + ghi công (Meta originality) */}
      <CollapsibleCard
        cardClassName="border-accent/30"
        defaultOpen={false}
        icon={<ShieldCheck className="size-4 text-accent" />}
        title="Công bố AI + ghi công"
        headerRight={
          <Badge variant="outline" className="text-[10px]">
            Meta originality
          </Badge>
        }
      >
        <div className="p-5 space-y-3">
          <p className="text-xs text-muted-foreground">
            Meta yêu cầu nội dung AI phải <strong>công bố</strong> + ghi rõ đóng
            góp người thật (kịch bản gốc, biên tập, nguồn) mới đủ điều kiện kiếm
            tiền. Khối này <strong>tự chèn vào cuối phần mô tả</strong> khi bấm
            "Copy caption". Ngoài ra nhớ <strong>bật nhãn "AI" trong trình đăng
            của Facebook</strong> khi upload.
          </p>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={aiAssisted}
              onChange={(e) => setAiAssisted(e.target.checked)}
              className="size-4 accent-[var(--accent)]"
            />
            Video dùng giọng đọc AI (bật công bố AI)
          </label>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                Người biên soạn
              </Label>
              <Input
                value={scriptCredit}
                onChange={(e) => setScriptCredit(e.target.value)}
                placeholder={`Mặc định: ${BRAND_NAME}`}
                className="mt-1 text-sm"
              />
            </div>
            <div>
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                Nhạc nền (ghi công)
              </Label>
              <Input
                value={musicCredit}
                onChange={(e) => setMusicCredit(e.target.value)}
                placeholder="vd: Scott Buckley — CC BY 4.0"
                className="mt-1 text-sm"
              />
            </div>
            <div className="sm:col-span-2">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                Footage (ghi công stock)
              </Label>
              <Input
                value={footageCredit}
                onChange={(e) => setFootageCredit(e.target.value)}
                placeholder="vd: Footage: Şeyma Gül, Buket Ülkü (Pexels) — tự điền khi footage-plan tải Pexels"
                className="mt-1 text-sm"
              />
            </div>
          </div>

          <div>
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">
              Nguồn tham khảo (mỗi dòng 1 nguồn)
            </Label>
            <Textarea
              value={sourcesText}
              onChange={(e) => setSourcesText(e.target.value)}
              placeholder={"Terror Management Theory — Wikipedia\nEpicurus — IEP\n..."}
              rows={3}
              className="mt-1 font-sans text-sm leading-relaxed"
            />
          </div>

          {disclosure && (
            <div className="rounded-md border bg-secondary/20 p-3 text-xs">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">
                Xem trước khối công bố
              </div>
              <div className="font-sans leading-relaxed whitespace-pre-wrap">
                {disclosure}
              </div>
            </div>
          )}
        </div>
        <footer className="px-5 py-3 border-t flex items-center justify-end gap-2">
          <CopyButton
            text={disclosure}
            label="Copy khối công bố"
            disabled={disclosure.length === 0}
          />
        </footer>
      </CollapsibleCard>

      {/* Quotes — for pinned comment */}
      {quoteSuggestions.length > 0 && (
        <CollapsibleCard
          defaultOpen={false}
          icon={<Quote className="size-4 text-accent" />}
          title="Quote cho first-comment (engagement bait)"
          headerRight={
            <span className="text-xs text-muted-foreground tabular-nums">
              {quoteSuggestions.length}
            </span>
          }
        >
          <div className="divide-y">
            {quoteSuggestions.map((q, i) => (
              <div
                key={i}
                className="px-5 py-3 flex items-start gap-3 hover:bg-secondary/20"
              >
                <Badge variant="outline" className="font-mono shrink-0 mt-0.5">
                  #{i + 1}
                </Badge>
                <p className="flex-1 text-sm italic leading-relaxed">"{q}"</p>
                <div className="shrink-0">
                  <CopyChip text={`"${q}"`} label="Copy" />
                </div>
              </div>
            ))}
          </div>
        </CollapsibleCard>
      )}

      {/* Đăng thẳng lên Facebook Reel + fallback thủ công */}
      <FacebookPublishCard
        ep={ep}
        isReady={isReady}
        onBeforePublish={flushPublishFields}
      />
    </div>
  );
}

/**
 * Đăng video render lên Trang Facebook dạng Reel (SSE). Mô tả = fullCaption đã
 * dựng ở PublishTab (server dựng lại từ config đã lưu). Playlist chỉ để nhắc
 * thêm tay — Graph API không cho tự thêm Reel vào playlist.
 */
function FacebookPublishCard({
  ep,
  isReady,
  onBeforePublish,
}: {
  ep: EpisodeSummary;
  isReady: boolean;
  onBeforePublish: () => Promise<void>;
}) {
  const qc = useQueryClient();
  const [lines, setLines] = useState<Array<{ text: string; cls?: string }>>([]);
  const [publishing, setPublishing] = useState(false);
  const esRef = useRef<EventSource | null>(null);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => () => esRef.current?.close(), []);
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [lines]);

  const keysQ = useQuery({
    queryKey: ["api-keys"],
    queryFn: () => api.listApiKeys(),
    staleTime: 30_000,
  });
  const hasToken = !!keysQ.data?.keys.find((k) => k.provider === "facebook")?.hasKey;

  const playlistsQ = useQuery({
    queryKey: ["fb-playlists"],
    queryFn: () => api.fbPlaylists(),
    enabled: hasToken,
    staleTime: 60_000,
    retry: false,
  });
  const [playlistId, setPlaylistId] = useState(ep.config.fbPlaylistId ?? "");
  const selectedPlaylist = playlistsQ.data?.playlists.find((p) => p.id === playlistId);

  const publishedAt = ep.config.publishedAt;
  const permalink = ep.config.fbPermalink;

  const publish = async () => {
    esRef.current?.close();
    setLines([]);
    setPublishing(true);
    try {
      await onBeforePublish();
    } catch {
      /* lưu lỗi vẫn cho đăng — server đọc config gần nhất */
    }
    const es = new EventSource(
      api.publishEpisodeUrl(
        ep.name,
        selectedPlaylist ? { id: selectedPlaylist.id, title: selectedPlaylist.title } : undefined,
      ),
    );
    esRef.current = es;
    const push = (text: string, cls?: string) =>
      setLines((prev) => [...prev, { text, cls }]);

    es.addEventListener("log", (e) => push(JSON.parse((e as MessageEvent).data).line));
    es.addEventListener("error", (e) => {
      try {
        push("⚠ " + JSON.parse((e as MessageEvent).data).message, "text-destructive");
      } catch {
        /* connection error */
      }
    });
    es.addEventListener("published", (e) => {
      const d = JSON.parse((e as MessageEvent).data) as { permalink?: string };
      push(d.permalink ? `✓ Đã đăng: ${d.permalink}` : "✓ Đã đăng Reel.", "text-accent");
      qc.invalidateQueries({ queryKey: ["episode", ep.name] });
      qc.invalidateQueries({ queryKey: ["episodes"] });
    });
    es.addEventListener("done", (e) => {
      const code = JSON.parse((e as MessageEvent).data).code;
      if (code !== 0) push(`✗ Đăng thất bại (mã ${code})`, "text-destructive");
      es.close();
      setPublishing(false);
    });
    es.onerror = () => {
      es.close();
      setPublishing(false);
    };
  };

  return (
    <Card className="p-0 overflow-hidden border-primary/30">
      <header className="px-5 py-3 border-b bg-primary/10 flex items-center gap-2">
        <Facebook className="size-4 text-primary" />
        <span className="font-medium text-sm">Đăng thẳng lên Facebook Reel</span>
        {publishedAt && (
          <Badge
            variant="outline"
            className="ml-auto gap-1 border-emerald-500/40 text-emerald-700 dark:text-emerald-400 bg-emerald-500/5"
          >
            <CheckCircle2 className="size-3" /> Đã đăng
          </Badge>
        )}
      </header>
      <div className="p-5 space-y-3">
        {!hasToken && (
          <p className="text-sm text-muted-foreground">
            Chưa có Page Access Token.{" "}
            <Link to="/settings" className="text-accent hover:underline">
              Vào Settings để nhập
            </Link>
            .
          </p>
        )}
        {hasToken && !isReady && (
          <p className="text-sm text-muted-foreground">
            Chưa có video render — sang tab <strong>Render</strong> bấm "Render full" trước.
          </p>
        )}

        {hasToken && (
          <div>
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">
              Playlist (tuỳ chọn)
            </Label>
            <select
              value={playlistId}
              onChange={(e) => setPlaylistId(e.target.value)}
              disabled={publishing || playlistsQ.isLoading}
              className="mt-1 h-9 w-full max-w-md rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="">— Không thêm playlist —</option>
              {playlistsQ.data?.playlists.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title} ({p.videosCount})
                </option>
              ))}
            </select>
            {playlistsQ.isError && (
              <p className="mt-1 text-xs text-destructive">
                Không tải được playlist: {String(playlistsQ.error)}
              </p>
            )}
            {selectedPlaylist && (
              <p className="mt-1 text-[11px] text-muted-foreground">
                Facebook không cho tự thêm Reel vào playlist qua API — sau khi đăng,
                app sẽ nhắc bạn mở Reel và thêm tay vào "{selectedPlaylist.title}".
              </p>
            )}
          </div>
        )}

        {permalink && publishedAt && (
          <div className="text-sm">
            <a
              href={permalink}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-accent hover:underline"
            >
              Xem Reel đã đăng <ExternalLink className="size-3" />
            </a>
            {ep.config.fbPlaylistName && (
              <p className="mt-1 text-[11px] text-muted-foreground">
                Nhớ thêm vào playlist "{ep.config.fbPlaylistName}" (mở Reel → ⋯ → Thêm vào playlist).
              </p>
            )}
          </div>
        )}

        {lines.length > 0 && (
          <div
            ref={logRef}
            className="h-40 overflow-auto whitespace-pre-wrap rounded-md bg-foreground/5 p-3 font-mono text-xs leading-relaxed"
          >
            {lines.map((l, i) => (
              <div key={i} className={cn("text-muted-foreground", l.cls)}>
                {l.text}
              </div>
            ))}
          </div>
        )}
      </div>
      <footer className="px-5 py-3 border-t flex items-center justify-end gap-2 flex-wrap">
        <Button variant="outline" size="sm" asChild>
          <a href={FB_REELS_URL} target="_blank" rel="noreferrer">
            <ExternalLink className="size-3.5" />
            Mở FB Reels Creator (thủ công)
          </a>
        </Button>
        <Button
          size="sm"
          className="gap-1.5"
          disabled={!hasToken || !isReady || publishing}
          onClick={publish}
        >
          {publishing ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Facebook className="size-3.5" />
          )}
          {publishedAt ? "Đăng lại Reel" : "Đăng lên Facebook Reel"}
        </Button>
      </footer>
    </Card>
  );
}

/**
 * Card có nút thu gọn/mở rộng. Header khớp style các card trong PublishTab
 * (icon + title + phần phải), bấm header để toggle. Nội dung + footer bọc trong
 * children — ẩn khi thu gọn.
 */
function CollapsibleCard({
  icon,
  title,
  headerRight,
  defaultOpen = true,
  cardClassName,
  children,
}: {
  icon?: React.ReactNode;
  title: React.ReactNode;
  headerRight?: React.ReactNode;
  defaultOpen?: boolean;
  cardClassName?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Card className={cn("p-0 overflow-hidden", cardClassName)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={cn(
          "w-full px-5 py-3 flex items-center gap-2 bg-secondary/30 text-left transition-colors hover:bg-secondary/50",
          open && "border-b",
        )}
      >
        {icon}
        <span className="font-medium text-sm">{title}</span>
        <span className="ml-auto flex items-center gap-2">
          {headerRight}
          <ChevronDown
            className={cn(
              "size-4 text-muted-foreground transition-transform",
              !open && "-rotate-90",
            )}
          />
        </span>
      </button>
      {open && children}
    </Card>
  );
}

function CopyButton({
  text,
  label,
  disabled,
}: {
  text: string;
  label: string;
  disabled?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={disabled}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          alert("Clipboard không khả dụng — copy thủ công.");
        }
      }}
    >
      {copied ? (
        <Check className="size-3.5 text-accent" />
      ) : (
        <Copy className="size-3.5" />
      )}
      {copied ? "Đã copy" : label}
    </Button>
  );
}

function CopyChip({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className={cn(
        "text-[10px] px-2 py-1 rounded border inline-flex items-center gap-1 transition-colors",
        copied
          ? "border-accent bg-accent/20 text-accent"
          : "border-input hover:bg-secondary text-muted-foreground",
      )}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          /* ignore */
        }
      }}
    >
      {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
      {copied ? "Đã copy" : label}
    </button>
  );
}

// Mute unused-loader warning
void Loader2;
