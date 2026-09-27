import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
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
import { Switch } from "@/components/ui/switch";
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

const pad2 = (n: number) => String(n).padStart(2, "0");
/** Date → giá trị cho <input type="datetime-local"> (giờ địa phương). */
const toLocalInputValue = (d: Date) =>
  `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;

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
  const isReady = !!fullVideo;

  return (
    <div className="space-y-6">
      {error && (
        <Card className="p-4 border-destructive/40 bg-destructive/5 text-sm flex items-start gap-2">
          <AlertCircle className="size-4 text-destructive shrink-0 mt-0.5" />
          <span className="text-destructive">{error}</span>
        </Card>
      )}

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

      {/* Caption & Hashtags */}
      <CollapsibleCard
        icon={<FileText className="size-4 text-accent" />}
        title="Caption & Hashtags"
        headerRight={
          <span className="text-xs text-muted-foreground tabular-nums">
            {caption.length} ký tự · {hashtags.length}/{MAX_HASHTAGS} tag
          </span>
        }
      >
        <div className="p-5 space-y-4">
          {/* ── Caption ── */}
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              <strong>FB mobile</strong> cut sau ~125 ký tự → dòng 1 nên là{" "}
              <strong>video title</strong>, dòng 2 hook. Phần sau bị fold vào "Xem thêm".
            </p>
            {caption.length > 0 && (
              <div className="rounded-md border bg-secondary/20 p-3 text-xs">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5 flex items-center justify-between">
                  <span>Preview mobile (dòng feed)</span>
                  <span className="tabular-nums">{Math.min(caption.length, 125)}/125</span>
                </div>
                <div className="font-sans leading-relaxed whitespace-pre-wrap">
                  <span>{caption.slice(0, 125)}</span>
                  {caption.length > 125 && (
                    <span className="text-accent font-medium"> … <span className="underline">Xem thêm</span></span>
                  )}
                </div>
              </div>
            )}
            {aiGenMut.isError && (
              <p className="text-xs text-destructive flex items-center gap-1">
                <AlertCircle className="size-3" /> AI gen thất bại: {String(aiGenMut.error)}
              </p>
            )}
            {aiGenMut.isSuccess && !aiGenMut.isPending && (
              <p className="text-xs text-accent flex items-center gap-1">
                <CheckCircle2 className="size-3" /> Đã gen caption + hashtags. Sửa thoải mái.
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
            {fbPostSuggestions.length > 0 && (
              <div>
                <Label className="text-xs uppercase tracking-wider text-muted-foreground mb-1.5 flex items-center gap-1">
                  <Sparkles className="size-3" /> Gợi ý từ essay derivatives (FB posts)
                </Label>
                <div className="space-y-1.5">
                  {fbPostSuggestions.map((p, i) => (
                    <div key={i} className="rounded-md border bg-secondary/20 p-2 text-xs space-y-1.5">
                      <p className="line-clamp-2 leading-relaxed">{p}</p>
                      <div className="flex gap-1.5">
                        <Button size="sm" variant="outline" className="h-6 text-[10px] px-2" onClick={() => setCaption(p)}>
                          <Check className="size-3" /> Dùng
                        </Button>
                        <CopyChip text={p} label="Copy" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* ── Hashtags ── */}
          <div className="space-y-3 border-t pt-4">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-medium uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                <Hash className="size-3" /> Hashtags
              </Label>
              <span className={cn("text-xs tabular-nums", hashtags.length >= MAX_HASHTAGS ? "text-accent font-medium" : "text-muted-foreground")}>
                {hashtags.length}/{MAX_HASHTAGS}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              FB Reels recommend tối đa <strong>5 hashtag</strong> — chọn cái relevant nhất, KHÔNG spam.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {hashtags.map((h) => (
                <Badge key={h} variant="secondary" className="gap-1 pl-2 pr-1 py-1 text-sm">
                  #{h}
                  <button type="button" onClick={() => removeHashtag(h)} className="hover:text-destructive rounded p-0.5" aria-label={`Xoá ${h}`}>
                    <XIcon className="size-3" />
                  </button>
                </Badge>
              ))}
              {hashtags.length === 0 && (
                <p className="text-xs text-muted-foreground italic">Chưa có hashtag — thêm bên dưới (max {MAX_HASHTAGS}).</p>
              )}
            </div>
            <div className="relative">
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
                    ? `Đã đạt ${MAX_HASHTAGS} max — xoá bớt để add`
                    : "Thêm hashtag (Enter để add)…"
                }
                disabled={hashtags.length >= MAX_HASHTAGS}
                className="text-sm pr-10"
              />
              <button
                type="button"
                onClick={() => {
                  addHashtag(hashtagInput);
                  setHashtagInput("");
                }}
                disabled={!hashtagInput.trim() || hashtags.length >= MAX_HASHTAGS}
                aria-label="Thêm hashtag"
                title="Thêm hashtag"
                className="absolute right-1.5 top-1/2 -translate-y-1/2 inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
              >
                <Plus className="size-4" />
              </button>
            </div>
            {hashtags.length < MAX_HASHTAGS && (
              <div className="flex flex-wrap gap-1.5">
                {SUGGESTED_HASHTAGS.filter((h) => !hashtags.includes(h)).map((h) => (
                  <button
                    key={h}
                    type="button"
                    onClick={() => addHashtag(h)}
                    className="text-xs px-2 py-1 rounded border border-dashed text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
                  >
                    + #{h}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <footer className="px-5 py-3 border-t flex items-center justify-end gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const title = ep.config.title.trim();
              if (!title) return;
              const firstLine = caption.split("\n")[0]?.trim() ?? "";
              if (firstLine.toLowerCase().includes(title.toLowerCase())) return;
              setCaption(caption ? `${title}\n${caption}` : title);
            }}
            disabled={
              !ep.config.title ||
              caption.split("\n")[0]?.toLowerCase().includes(ep.config.title.toLowerCase())
            }
            title="Chèn video title làm dòng 1"
          >
            <FileText className="size-3.5" /> Chèn title
          </Button>
          <select
            value={llmProvider}
            onChange={(e) => setLlmProvider(e.target.value as LLMProvider)}
            disabled={modelsQ.isLoading || aiGenMut.isPending}
            className="h-8 text-xs rounded-md border border-input bg-background px-2"
            title="LLM provider"
          >
            <option value="openai" disabled={!modelsQ.data?.openai.length}>OpenAI</option>
            <option value="ollama" disabled={!modelsQ.data?.ollama.length}>Ollama</option>
          </select>
          <select
            value={llmModel}
            onChange={(e) => setLlmModel(e.target.value)}
            disabled={modelsQ.isLoading || aiGenMut.isPending || (modelsQ.data?.[llmProvider]?.length ?? 0) === 0}
            className="h-8 text-xs rounded-md border border-input bg-background px-2 max-w-[180px]"
            title="LLM model"
          >
            {(modelsQ.data?.[llmProvider] ?? []).map((m) => (
              <option key={m.id} value={m.id}>{m.label}</option>
            ))}
          </select>
          <Button
            variant="outline"
            size="sm"
            onClick={() => aiGenMut.mutate()}
            disabled={aiGenMut.isPending || !ep.config.title}
            title="LLM gen caption + hashtags"
          >
            {aiGenMut.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />} AI gen
          </Button>
          <CopyButton
            text={fullCaption}
            label={`Copy caption + ${hashtags.length} hashtag`}
            disabled={fullCaption.length === 0}
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
        llmProvider={llmProvider}
        llmModel={llmModel}
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
  llmProvider,
  llmModel,
}: {
  ep: EpisodeSummary;
  isReady: boolean;
  onBeforePublish: () => Promise<void>;
  llmProvider: LLMProvider;
  llmModel: string;
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

  // Gợi ý playlist bằng AI (dùng lại / tạo mới)
  const suggestMut = useMutation({
    mutationFn: () => api.suggestPlaylist(ep.name, { provider: llmProvider, model: llmModel }),
  });
  const suggestion = suggestMut.data;

  // Lên lịch (scheduler FB)
  const [scheduleOn, setScheduleOn] = useState(false);
  const [scheduleAt, setScheduleAt] = useState("");
  const minSchedule = toLocalInputValue(new Date(Date.now() + 11 * 60_000));

  // Trạng thái đăng trực tiếp (live)
  const [statusKind, setStatusKind] = useState<
    null | "publishing" | "success" | "scheduled" | "error"
  >(null);
  const [statusText, setStatusText] = useState("");

  const publishedAt = ep.config.publishedAt;
  const permalink = ep.config.fbPermalink;

  const publish = async () => {
    let scheduledAtIso: string | undefined;
    if (scheduleOn) {
      if (!scheduleAt) return;
      const ms = new Date(scheduleAt).getTime();
      if (Number.isNaN(ms) || ms < Date.now() + 10 * 60_000) {
        setStatusKind("error");
        setStatusText("Lên lịch phải cách hiện tại ít nhất 10 phút.");
        return;
      }
      scheduledAtIso = new Date(ms).toISOString();
    }

    esRef.current?.close();
    setLines([]);
    setPublishing(true);
    setStatusKind("publishing");
    setStatusText(scheduledAtIso ? "Đang lên lịch…" : "Đang chuẩn bị…");
    try {
      await onBeforePublish();
    } catch {
      /* lưu lỗi vẫn cho đăng — server đọc config gần nhất */
    }
    const es = new EventSource(
      api.publishEpisodeUrl(ep.name, {
        playlist: selectedPlaylist ? { id: selectedPlaylist.id, title: selectedPlaylist.title } : undefined,
        scheduledAt: scheduledAtIso,
      }),
    );
    esRef.current = es;
    const push = (text: string, cls?: string) =>
      setLines((prev) => [...prev, { text, cls }]);

    es.addEventListener("log", (e) => {
      const line = JSON.parse((e as MessageEvent).data).line as string;
      push(line);
      setStatusText(line);
    });
    es.addEventListener("error", (e) => {
      try {
        const msg = JSON.parse((e as MessageEvent).data).message as string;
        push("⚠ " + msg, "text-destructive");
        setStatusKind("error");
        setStatusText(msg);
      } catch {
        /* connection error */
      }
    });
    es.addEventListener("published", (e) => {
      const d = JSON.parse((e as MessageEvent).data) as {
        permalink?: string;
        scheduled?: boolean;
        scheduledAt?: string | null;
      };
      if (d.scheduled) {
        setStatusKind("scheduled");
        setStatusText(
          d.scheduledAt
            ? `Đã lên lịch lúc ${new Date(d.scheduledAt).toLocaleString("vi-VN")}`
            : "Đã lên lịch",
        );
        push("✓ Đã lên lịch Reel.", "text-accent");
      } else {
        setStatusKind("success");
        setStatusText("Đã đăng");
        push(d.permalink ? `✓ Đã đăng: ${d.permalink}` : "✓ Đã đăng Reel.", "text-accent");
      }
      qc.invalidateQueries({ queryKey: ["episode", ep.name] });
      qc.invalidateQueries({ queryKey: ["episodes"] });
    });
    es.addEventListener("done", (e) => {
      const code = JSON.parse((e as MessageEvent).data).code;
      if (code !== 0) {
        push(`✗ Thất bại (mã ${code})`, "text-destructive");
        setStatusKind((k) => (k === "publishing" ? "error" : k));
      }
      es.close();
      setPublishing(false);
    });
    es.onerror = () => {
      es.close();
      setPublishing(false);
      setStatusKind((k) => (k === "publishing" ? "error" : k));
    };
  };

  // Badge trạng thái ở header: ưu tiên trạng thái live, fallback config đã lưu.
  const headerBadge = (() => {
    const kind =
      statusKind ??
      (ep.config.publishStatus === "scheduled"
        ? "scheduled"
        : publishedAt
          ? "success"
          : null);
    if (!kind) return null;
    if (kind === "publishing")
      return { cls: "border-blue-500/40 text-blue-700 dark:text-blue-400 bg-blue-500/5", icon: <Loader2 className="size-3 animate-spin" />, label: "Đang đăng…" };
    if (kind === "scheduled")
      return { cls: "border-blue-500/40 text-blue-700 dark:text-blue-400 bg-blue-500/5", icon: <Clock className="size-3" />, label: "Đã lên lịch" };
    if (kind === "error")
      return { cls: "border-destructive/40 text-destructive bg-destructive/5", icon: <AlertCircle className="size-3" />, label: "Lỗi" };
    return { cls: "border-emerald-500/40 text-emerald-700 dark:text-emerald-400 bg-emerald-500/5", icon: <CheckCircle2 className="size-3" />, label: "Đã đăng" };
  })();

  return (
    <Card className="p-0 overflow-hidden border-primary/30">
      <header className="px-5 py-3 border-b bg-primary/10 flex items-center gap-2">
        <Facebook className="size-4 text-primary" />
        <span className="font-medium text-sm">Đăng thẳng lên Facebook Reel</span>
        {headerBadge && (
          <Badge variant="outline" className={cn("ml-auto gap-1", headerBadge.cls)}>
            {headerBadge.icon} {headerBadge.label}
          </Badge>
        )}
      </header>
      <div className="p-5 space-y-4">
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
          <p className="rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-sm text-muted-foreground">
            Chưa có video render — sang tab <strong>Render</strong> bấm "Render full" trước.
          </p>
        )}

        {hasToken && (
          <div className="grid gap-4 sm:grid-cols-2">
            {/* Playlist */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <Label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Playlist (tuỳ chọn)
                </Label>
                <button
                  type="button"
                  onClick={() => suggestMut.mutate()}
                  disabled={suggestMut.isPending || playlistsQ.isLoading}
                  className="inline-flex items-center gap-1 text-[11px] text-accent hover:underline disabled:opacity-50"
                  title="Dùng AI gợi ý playlist theo chủ đề tập"
                >
                  {suggestMut.isPending ? (
                    <Loader2 className="size-3 animate-spin" />
                  ) : (
                    <Sparkles className="size-3" />
                  )}
                  Gợi ý AI
                </button>
              </div>
              <select
                value={playlistId}
                onChange={(e) => setPlaylistId(e.target.value)}
                disabled={publishing || playlistsQ.isLoading}
                className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm disabled:opacity-50"
              >
                <option value="">— Không thêm playlist —</option>
                {playlistsQ.data?.playlists.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title} ({p.videosCount})
                  </option>
                ))}
              </select>

              {suggestMut.isError && (
                <p className="text-[11px] text-destructive">
                  Gợi ý lỗi: {String(suggestMut.error)}
                </p>
              )}
              {suggestion && (
                <div className="rounded-md border border-accent/40 bg-accent/5 p-2 text-[11px] leading-relaxed">
                  {suggestion.mode === "reuse" ? (
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Sparkles className="size-3 text-accent" />
                      <span>
                        Nên dùng: <strong>{suggestion.playlistTitle}</strong>
                        {suggestion.confidence ? ` (độ tin ${suggestion.confidence})` : ""}
                      </span>
                      {suggestion.playlistId && suggestion.playlistId !== playlistId && (
                        <button
                          type="button"
                          onClick={() => setPlaylistId(suggestion.playlistId!)}
                          className="rounded border border-accent/50 px-1.5 py-0.5 text-accent hover:bg-accent/10"
                        >
                          Dùng
                        </button>
                      )}
                      {suggestion.playlistId === playlistId && (
                        <span className="inline-flex items-center gap-0.5 text-accent">
                          <Check className="size-3" /> đã chọn
                        </span>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-start gap-1.5">
                      <Plus className="size-3 mt-0.5 text-accent" />
                      <span>
                        Nên <strong>tạo playlist mới</strong>: "{suggestion.playlistTitle}"
                        {suggestion.confidence ? ` (độ tin ${suggestion.confidence})` : ""}. Tạo
                        trên Facebook rồi thêm vào{" "}
                        <code className="font-mono">input/_fb-playlists.json</code>.
                      </span>
                    </div>
                  )}
                  {suggestion.reason && (
                    <p className="mt-1 text-muted-foreground">{suggestion.reason}</p>
                  )}
                </div>
              )}

              {!suggestion && !suggestMut.isError && (
                playlistsQ.isError ? (
                  <p className="text-[11px] text-destructive">
                    Không tải được playlist: {String(playlistsQ.error)}
                  </p>
                ) : selectedPlaylist ? (
                  <p className="text-[11px] leading-relaxed text-muted-foreground">
                    FB không cho tự thêm vào playlist qua API — app sẽ nhắc thêm tay sau khi đăng.
                  </p>
                ) : (
                  <p className="text-[11px] text-muted-foreground">
                    Chọn thủ công hoặc bấm "Gợi ý AI" để chọn theo chủ đề.
                  </p>
                )
              )}
            </div>

            {/* Lịch đăng */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <Label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Lịch đăng
                </Label>
                <Switch
                  checked={scheduleOn}
                  onCheckedChange={(v) => {
                    setScheduleOn(v);
                    if (v && !scheduleAt) {
                      setScheduleAt(toLocalInputValue(new Date(Date.now() + 60 * 60_000)));
                    }
                  }}
                  disabled={publishing}
                />
              </div>
              {scheduleOn ? (
                <>
                  <input
                    type="datetime-local"
                    value={scheduleAt}
                    min={minSchedule}
                    onChange={(e) => setScheduleAt(e.target.value)}
                    disabled={publishing}
                    className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm disabled:opacity-50"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    FB cho lên lịch 10 phút – 75 ngày kể từ bây giờ.
                  </p>
                </>
              ) : (
                <p className="flex h-9 items-center text-[11px] text-muted-foreground">
                  Tắt = đăng ngay khi bấm nút.
                </p>
              )}
            </div>
          </div>
        )}

        {statusText && (
          <div
            className={cn(
              "flex items-center gap-1.5 rounded-md border px-3 py-2 text-xs",
              statusKind === "error"
                ? "border-destructive/40 bg-destructive/5 text-destructive"
                : statusKind === "success" || statusKind === "scheduled"
                  ? "border-accent/40 bg-accent/5 text-accent"
                  : "border-border bg-secondary/30 text-muted-foreground",
            )}
          >
            {publishing && <Loader2 className="size-3 shrink-0 animate-spin" />}
            <span className="truncate">{statusText}</span>
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
          disabled={!hasToken || !isReady || publishing || (scheduleOn && !scheduleAt)}
          onClick={publish}
        >
          {publishing ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : scheduleOn ? (
            <Clock className="size-3.5" />
          ) : (
            <Facebook className="size-3.5" />
          )}
          {scheduleOn
            ? "Lên lịch đăng"
            : publishedAt
              ? "Đăng lại Reel"
              : "Đăng lên Facebook Reel"}
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
