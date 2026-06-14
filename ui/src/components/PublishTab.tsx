import { useEffect, useRef, useState } from "react";
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
} from "lucide-react";
import {
  api,
  ApiError,
  type EpisodeConfig,
  type EpisodeFiles,
  type EpisodeSummary,
  type LLMProvider,
} from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/** FB Reels best practice: 3-5 hashtags max. */
const MAX_HASHTAGS = 5;

/** Curated short list — FB ưu tiên ÍT mà RELEVANT. User add custom thêm. */
const DEFAULT_HASHTAGS = [
  "bytecasttech",
  "podcast",
  "trietoc",
  "tamlyhoc",
  "suyngam",
];

/** Suggestions thêm — user có thể quick-add đến khi đạt 5 max. */
const SUGGESTED_HASHTAGS = [
  "bytecasttech",
  "podcast",
  "podcasttiengviet",
  "trietoc",
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

  // Sync local ↔ server when ep changes (e.g., after save)
  const lastSeenMtime = useRef(ep.mtimeMs);
  useEffect(() => {
    if (ep.mtimeMs !== lastSeenMtime.current) {
      lastSeenMtime.current = ep.mtimeMs;
      setCaption(ep.config.publishCaption ?? "");
      if (ep.config.publishHashtags.length > 0) {
        setHashtags(ep.config.publishHashtags);
      }
    }
  }, [ep.mtimeMs, ep.config.publishCaption, ep.config.publishHashtags]);

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

  // Debounce save when caption/hashtags change
  const debounceRef = useRef<number | null>(null);
  useEffect(() => {
    if (
      caption === (ep.config.publishCaption ?? "") &&
      JSON.stringify(hashtags) === JSON.stringify(ep.config.publishHashtags)
    ) {
      return;
    }
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      saveMut.mutate({
        publishCaption: caption || null,
        publishHashtags: hashtags,
      });
    }, 700);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caption, hashtags]);

  const setStatus = (next: PublishStatus) => {
    saveMut.mutate({
      publishStatus: next,
      publishedAt: next === "published" ? new Date().toISOString() : null,
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

  const fullCaption = caption
    ? `${caption}\n\n${hashtags.map((h) => `#${h}`).join(" ")}`.trim()
    : hashtags.map((h) => `#${h}`).join(" ");

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
        <Card className="p-0 overflow-hidden">
          <header className="px-5 py-3 border-b bg-secondary/30 flex items-center gap-2">
            <ImageIcon className="size-4 text-accent" />
            <span className="font-medium text-sm">Asset cần upload</span>
            <code className="ml-auto text-xs text-muted-foreground font-mono truncate max-w-[280px]">
              {fullVideo.filename}
            </code>
          </header>
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
        </Card>
      )}

      {/* Caption */}
      <Card className="p-0 overflow-hidden">
        <header className="px-5 py-3 border-b bg-secondary/30 flex items-center gap-2">
          <FileText className="size-4 text-accent" />
          <span className="font-medium text-sm">Caption</span>
          <span className="ml-auto text-xs text-muted-foreground tabular-nums">
            {caption.length} ký tự
          </span>
        </header>
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
      </Card>

      {/* Hashtags */}
      <Card className="p-0 overflow-hidden">
        <header className="px-5 py-3 border-b bg-secondary/30 flex items-center gap-2">
          <Hash className="size-4 text-accent" />
          <span className="font-medium text-sm">Hashtags</span>
          <span
            className={cn(
              "ml-auto text-xs tabular-nums",
              hashtags.length >= MAX_HASHTAGS
                ? "text-accent font-medium"
                : "text-muted-foreground",
            )}
          >
            {hashtags.length}/{MAX_HASHTAGS}
          </span>
        </header>
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
      </Card>

      {/* Quotes — for pinned comment */}
      {quoteSuggestions.length > 0 && (
        <Card className="p-0 overflow-hidden">
          <div className="px-5 py-3 border-b bg-secondary/30 flex items-center gap-2">
            <Quote className="size-4 text-accent" />
            <span className="font-medium text-sm">
              Quote cho first-comment (engagement bait)
            </span>
            <span className="ml-auto text-xs text-muted-foreground tabular-nums">
              {quoteSuggestions.length}
            </span>
          </div>
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
        </Card>
      )}

      {/* Open FB Reels CTA */}
      <Card className="p-0 overflow-hidden border-primary/30">
        <header className="px-5 py-3 border-b bg-primary/10 flex items-center gap-2">
          <ExternalLink className="size-4 text-primary" />
          <span className="font-medium text-sm">Bước cuối — mở FB Reels</span>
        </header>
        <div className="p-5">
          <p className="text-sm text-muted-foreground">
            Upload .mp4 + .jpg cover, paste caption (đã có hashtag), paste
            quote vào comment đầu.
          </p>
        </div>
        <footer className="px-5 py-3 border-t flex items-center justify-end gap-2">
          <Button variant="outline" size="sm" asChild>
            <a href={FB_REELS_URL} target="_blank" rel="noreferrer">
              <ExternalLink className="size-3.5" />
              Mở FB Reels Creator
            </a>
          </Button>
        </footer>
      </Card>
    </div>
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
