import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  CheckCircle2,
  Download,
  ExternalLink,
  FileText,
  Hash,
  Image as ImageIcon,
  ListChecks,
  ListOrdered,
  Plus,
  ShieldCheck,
  Tag,
  X as XIcon,
} from "lucide-react";
import {
  api,
  ApiError,
  type EpisodeConfig,
  type EpisodeFiles,
  type EpisodeSummary,
} from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  BRAND_NAME,
  buildDisclosure,
  CollapsibleCard,
  CopyButton,
} from "@/components/publish-ui";

/** Giới hạn của YouTube Studio. */
const YT_TITLE_MAX = 100;
const YT_DESC_MAX = 5000;
const YT_TAGS_MAX_CHARS = 500;
/** YouTube chỉ hiện 3 hashtag đầu phía trên tiêu đề. */
const YT_HASHTAGS_SHOWN = 3;

const DEFAULT_YT_HASHTAGS = ["podcast", "triethoc", "tamlyhoc"];
/** Thời lượng intro + hook (giây) — PHẢI khớp podcast/src/timing.ts. */
const INTRO_SECONDS = 3.0;

/** Bản sao splitHookLines + hookSeconds của podcast/src/timing.ts (UI không import được ngoài src/). */
const splitHookLines = (text: string): string[] => {
  const cleaned = text.trim();
  if (cleaned.includes(",")) {
    return cleaned.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 3);
  }
  const words = cleaned.split(/\s+/);
  if (words.length <= 5) return [cleaned];
  if (words.length <= 10) {
    const mid = Math.ceil(words.length / 2);
    return [words.slice(0, mid).join(" "), words.slice(mid).join(" ")];
  }
  const third = Math.ceil(words.length / 3);
  return [
    words.slice(0, third).join(" "),
    words.slice(third, third * 2).join(" "),
    words.slice(third * 2).join(" "),
  ];
};
const hookSeconds = (hook: string | null | undefined): number => {
  if (!hook?.trim()) return 0;
  const words = splitHookLines(hook).join(" ").split(/\s+/).filter(Boolean).length;
  const sec = 1.5 + words / 3;
  return Math.round(Math.min(10, Math.max(3.5, sec)) * 10) / 10;
};
/** YouTube: mỗi chapter tối thiểu 10s, cần ≥3 chapter, chapter đầu = 00:00. */
const CHAPTER_MIN_MS = 10_000;

type Editorial = {
  chapters: Array<{ atMs: number; title: string }>;
};

const fmtTs = (ms: number): string => {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const p2 = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${p2(m)}:${p2(s)}` : `${p2(m)}:${p2(s)}`;
};

/**
 * Dựng chapter YouTube từ editorial (tmp/<slug>.editorial.json). Mốc chương
 * theo transcript → cộng đoạn mở đầu chỉ có nhạc (intro + hook) để ra mốc video. Trả null nếu không đủ 3 chapter hợp lệ.
 */
function buildChapters(
  editorial: Editorial | null | undefined,
  cfg: Pick<EpisodeConfig, "showIntro" | "hook">,
): string | null {
  if (!editorial?.chapters?.length) return null;
  const revealMs =
    ((cfg.showIntro ? INTRO_SECONDS : 0) + hookSeconds(cfg.hook)) * 1000;
  const list: Array<{ ms: number; title: string }> = [{ ms: 0, title: "Mở đầu" }];
  for (const c of [...editorial.chapters].sort((a, b) => a.atMs - b.atMs)) {
    // Giọng bắt đầu SAU intro + hook (đoạn đầu chỉ có nhạc) → mốc video = lead + mốc transcript.
    const ms = revealMs + c.atMs;
    const title = c.title.trim();
    if (!title) continue;
    // Chương sát đầu video → thay nhãn "Mở đầu" ở 00:00.
    if (list.length === 1 && ms < CHAPTER_MIN_MS) {
      list[0].title = title;
      continue;
    }
    if (ms - list[list.length - 1].ms < CHAPTER_MIN_MS) continue;
    list.push({ ms, title });
  }
  if (list.length < 3) return null;
  return list.map((c) => `${fmtTs(c.ms)} ${c.title}`).join("\n");
}

const cleanTag = (raw: string) => raw.replace(/^#/, "").trim();

/**
 * Soạn data đăng YouTube cho bản 16:9 (upload TAY trong YouTube Studio): tiêu
 * đề, mô tả (+ chapter tự sinh + hashtag + công bố AI), tags, ghi công footage
 * ngang. Lưu vào config (yt*) — tách khỏi data Facebook.
 */
export function YouTubePublishPanel({
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

  const [title, setTitle] = useState(ep.config.ytTitle ?? "");
  const [description, setDescription] = useState(ep.config.ytDescription ?? "");
  const [tags, setTags] = useState<string[]>(ep.config.ytTags ?? []);
  const [tagInput, setTagInput] = useState("");
  const [hashtags, setHashtags] = useState<string[]>(
    ep.config.ytHashtags?.length ? ep.config.ytHashtags : DEFAULT_YT_HASHTAGS,
  );
  const [hashtagInput, setHashtagInput] = useState("");
  const [footageCredit, setFootageCredit] = useState(
    ep.config.footageCreditLandscape ?? "",
  );
  const [ytUrl, setYtUrl] = useState(ep.config.ytUrl ?? "");
  const [includeChapters, setIncludeChapters] = useState(true);

  // Đồng bộ khi config đổi từ nơi khác (vd footage-plan ghi credit).
  const lastSeenMtime = useRef(ep.mtimeMs);
  useEffect(() => {
    if (ep.mtimeMs === lastSeenMtime.current) return;
    lastSeenMtime.current = ep.mtimeMs;
    setTitle(ep.config.ytTitle ?? "");
    setDescription(ep.config.ytDescription ?? "");
    setTags(ep.config.ytTags ?? []);
    if (ep.config.ytHashtags?.length) setHashtags(ep.config.ytHashtags);
    setFootageCredit(ep.config.footageCreditLandscape ?? "");
    setYtUrl(ep.config.ytUrl ?? "");
  }, [ep.mtimeMs, ep.config]);

  const saveMut = useMutation({
    mutationFn: (patch: Partial<EpisodeConfig>) =>
      api.saveEpisodeConfig(ep.name, { ...ep.config, ...patch }),
    onSuccess: (updated) => {
      lastSeenMtime.current = updated.mtimeMs;
      qc.setQueryData(["episode", ep.name], updated);
      qc.invalidateQueries({ queryKey: ["episodes"] });
      setError(null);
    },
    onError: (err) => {
      setError(err instanceof ApiError ? err.message : String(err));
    },
  });

  // Auto-save debounce các field soạn thảo.
  const debounceRef = useRef<number | null>(null);
  useEffect(() => {
    const unchanged =
      title === (ep.config.ytTitle ?? "") &&
      description === (ep.config.ytDescription ?? "") &&
      JSON.stringify(tags) === JSON.stringify(ep.config.ytTags ?? []) &&
      JSON.stringify(hashtags) === JSON.stringify(ep.config.ytHashtags ?? []) &&
      footageCredit === (ep.config.footageCreditLandscape ?? "");
    if (unchanged) return;
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      saveMut.mutate({
        ytTitle: title || null,
        ytDescription: description || null,
        ytTags: tags,
        ytHashtags: hashtags,
        footageCreditLandscape: footageCredit || null,
      });
    }, 700);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, description, tags, hashtags, footageCredit]);

  // Chapter từ editorial overlay (cùng mốc chương hiện trên video).
  const editorialQ = useQuery({
    queryKey: ["editorial", ep.name, ep.mtimeMs],
    queryFn: async (): Promise<Editorial | null> => {
      const res = await fetch(`/tmp/${encodeURIComponent(`${ep.name}.editorial.json`)}`);
      if (!res.ok) return null;
      return (await res.json()) as Editorial;
    },
    staleTime: 60_000,
  });
  const chapters = buildChapters(editorialQ.data, ep.config);

  const effectiveTitle = (title || ep.config.title).trim();
  const sources = ep.config.sources ?? [];
  const disclosure = buildDisclosure({
    aiAssisted: ep.config.aiAssisted ?? true,
    editor: (ep.config.scriptCredit ?? "").trim() || BRAND_NAME,
    musicCredit: (ep.config.musicCredit ?? "").trim(),
    footageCredit: footageCredit.trim(),
    sources,
  });
  const hashtagLine = hashtags.map((h) => `#${h}`).join(" ");
  const fullDescription = [
    description,
    includeChapters && chapters ? `Mục lục:\n${chapters}` : "",
    disclosure,
    hashtagLine,
  ]
    .map((s) => s.trim())
    .filter(Boolean)
    .join("\n\n");
  const tagsCsv = tags.join(", ");

  const addTag = (raw: string) => {
    const t = cleanTag(raw);
    if (!t || tags.includes(t)) return;
    if ([...tags, t].join(", ").length > YT_TAGS_MAX_CHARS) return;
    setTags([...tags, t]);
  };
  const addHashtag = (raw: string) => {
    const h = cleanTag(raw).replace(/\s+/g, "").toLowerCase();
    if (!h || hashtags.includes(h)) return;
    setHashtags([...hashtags, h]);
  };

  const markMut = useMutation({
    mutationFn: (published: boolean) =>
      api.saveEpisodeConfig(ep.name, {
        ...ep.config,
        ytPublishStatus: published ? "published" : "draft",
        ytPublishedAt: published ? new Date().toISOString() : null,
        ytUrl: ytUrl.trim() || null,
      }),
    onSuccess: (updated) => {
      lastSeenMtime.current = updated.mtimeMs;
      qc.setQueryData(["episode", ep.name], updated);
      qc.invalidateQueries({ queryKey: ["episodes"] });
    },
    onError: (err) => {
      setError(err instanceof ApiError ? err.message : String(err));
    },
  });

  if (loading) {
    return <Card className="h-64 animate-pulse bg-muted/30" />;
  }

  const ytVideo = files.output.find((f) => f.kind === "yt-video-full");
  const ytThumb = files.output.find((f) => f.kind === "yt-thumbnail");
  const published = ep.config.ytPublishStatus === "published";

  return (
    <div className="space-y-6">
      {error && (
        <Card className="p-4 border-destructive/40 bg-destructive/5 text-sm flex items-start gap-2">
          <AlertCircle className="size-4 text-destructive shrink-0 mt-0.5" />
          <span className="text-destructive">{error}</span>
        </Card>
      )}

      {!ytVideo && (
        <Card className="p-4 border-amber-500/40 bg-amber-500/5 text-sm flex items-start gap-2">
          <AlertCircle className="size-4 text-amber-600 shrink-0 mt-0.5" />
          <span>
            Chưa có bản YouTube. Sang tab <strong>Render → YouTube 16:9</strong>{" "}
            bấm "Render full" trước.
          </span>
        </Card>
      )}

      {/* Asset cần upload */}
      {ytVideo && (
        <CollapsibleCard
          icon={<ImageIcon className="size-4 text-accent" />}
          title="Asset cần upload"
          headerRight={
            <code className="text-xs text-muted-foreground font-mono truncate max-w-[220px]">
              {ytVideo.filename}
            </code>
          }
        >
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_240px] gap-4 p-5">
            <div>
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                Video 16:9 (.mp4)
              </Label>
              <div className="mt-2 bg-black rounded-md overflow-hidden">
                <video
                  controls
                  src={ytVideo.url}
                  className="w-full max-h-72 object-contain"
                  preload="metadata"
                  poster={ytThumb?.url}
                />
              </div>
            </div>
            <div>
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                Thumbnail 1280×720
              </Label>
              <div className="mt-2 bg-secondary/30 rounded-md overflow-hidden border aspect-video">
                {ytThumb ? (
                  <img src={ytThumb.url} alt="thumbnail" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-muted-foreground/60">
                    <ImageIcon className="size-8" />
                  </div>
                )}
              </div>
            </div>
          </div>
          <footer className="px-5 py-3 border-t flex items-center justify-end gap-2">
            {ytThumb && (
              <Button variant="outline" size="sm" asChild>
                <a href={ytThumb.url} download={ytThumb.filename}>
                  <Download className="size-3.5" />
                  Tải thumbnail
                </a>
              </Button>
            )}
            <Button variant="outline" size="sm" asChild>
              <a href={ytVideo.url} download={ytVideo.filename}>
                <Download className="size-3.5" />
                Tải video
              </a>
            </Button>
          </footer>
        </CollapsibleCard>
      )}

      {/* Tiêu đề + mô tả */}
      <CollapsibleCard
        icon={<FileText className="size-4 text-accent" />}
        title="Tiêu đề & mô tả"
        headerRight={
          <span
            className={cn(
              "text-xs tabular-nums",
              fullDescription.length > YT_DESC_MAX ? "text-destructive" : "text-muted-foreground",
            )}
          >
            {fullDescription.length}/{YT_DESC_MAX} ký tự mô tả
          </span>
        }
      >
        <div className="p-5 space-y-4">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                Tiêu đề
              </Label>
              <span
                className={cn(
                  "text-xs tabular-nums",
                  effectiveTitle.length > YT_TITLE_MAX ? "text-destructive" : "text-muted-foreground",
                )}
              >
                {effectiveTitle.length}/{YT_TITLE_MAX}
              </span>
            </div>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={ep.config.title}
              className="text-sm"
            />
            <p className="text-[11px] text-muted-foreground">
              Để trống = dùng tiêu đề tập. YouTube cắt hiển thị ở ~60-70 ký tự —
              đưa từ khoá chính lên đầu.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">
              Mô tả (phần bạn viết)
            </Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={
                "2-3 câu đầu hiện trước nút \"Xem thêm\" → nêu câu hỏi của tập + lý do nên xem.\nMục lục, công bố AI và hashtag được ghép tự động bên dưới khi copy."
              }
              rows={5}
              className="font-sans text-sm leading-relaxed"
            />
            {ep.config.publishCaption && (
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-[11px]"
                onClick={() => setDescription(ep.config.publishCaption ?? "")}
                title="Lấy caption đã soạn ở tab Facebook làm điểm xuất phát"
              >
                Dùng caption Facebook
              </Button>
            )}
          </div>

          {/* Hashtag */}
          <div className="space-y-2 border-t pt-4">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1">
              <Hash className="size-3" /> Hashtag (cuối mô tả)
            </Label>
            <p className="text-[11px] text-muted-foreground">
              {YT_HASHTAGS_SHOWN} hashtag đầu hiện phía trên tiêu đề video — chọn cái relevant nhất.
            </p>
            <ChipInput
              items={hashtags}
              prefix="#"
              highlightFirst={YT_HASHTAGS_SHOWN}
              onRemove={(h) => setHashtags(hashtags.filter((x) => x !== h))}
              input={hashtagInput}
              onInput={setHashtagInput}
              onAdd={(v) => addHashtag(v)}
              placeholder="Thêm hashtag (Enter)…"
            />
          </div>

          {/* Chapter */}
          <div className="space-y-2 border-t pt-4">
            <div className="flex items-center justify-between">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                <ListOrdered className="size-3" /> Mục lục (chapter)
              </Label>
              {chapters && (
                <label className="flex items-center gap-1.5 text-xs">
                  <input
                    type="checkbox"
                    checked={includeChapters}
                    onChange={(e) => setIncludeChapters(e.target.checked)}
                  />
                  Ghép vào mô tả
                </label>
              )}
            </div>
            {chapters ? (
              <pre className="rounded-md border bg-secondary/20 p-3 text-xs font-mono whitespace-pre-wrap">
                {chapters}
              </pre>
            ) : (
              <p className="text-xs text-muted-foreground italic">
                Chưa đủ ≥3 chương từ editorial (tmp/{ep.name}.editorial.json) —
                render với "Lớp biên tập" bật để có chương.
              </p>
            )}
          </div>

          <div className="rounded-md border bg-secondary/20 p-3 text-xs">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">
              Xem trước mô tả đầy đủ
            </div>
            <div className="font-sans leading-relaxed whitespace-pre-wrap max-h-72 overflow-y-auto">
              {fullDescription || "—"}
            </div>
          </div>
        </div>
        <footer className="px-5 py-3 border-t flex items-center justify-end gap-2 flex-wrap">
          <CopyButton text={effectiveTitle} label="Copy tiêu đề" disabled={!effectiveTitle} />
          <CopyButton
            text={fullDescription}
            label="Copy mô tả đầy đủ"
            disabled={!fullDescription}
          />
        </footer>
      </CollapsibleCard>

      {/* Tags */}
      <CollapsibleCard
        icon={<Tag className="size-4 text-accent" />}
        title="Thẻ (tags)"
        headerRight={
          <span className="text-xs text-muted-foreground tabular-nums">
            {tagsCsv.length}/{YT_TAGS_MAX_CHARS} ký tự
          </span>
        }
      >
        <div className="p-5 space-y-2">
          <p className="text-[11px] text-muted-foreground">
            Dán vào ô "Thẻ" trong YouTube Studio (phần "Hiện thêm"). Ảnh hưởng nhỏ
            tới tìm kiếm — chủ yếu giúp với từ viết sai chính tả / không dấu.
          </p>
          <ChipInput
            items={tags}
            onRemove={(t) => setTags(tags.filter((x) => x !== t))}
            input={tagInput}
            onInput={setTagInput}
            onAdd={(v) => v.split(",").forEach(addTag)}
            placeholder="Thêm thẻ (Enter, hoặc dán nhiều thẻ cách nhau dấu phẩy)…"
          />
        </div>
        <footer className="px-5 py-3 border-t flex items-center justify-end gap-2">
          <CopyButton text={tagsCsv} label={`Copy ${tags.length} thẻ`} disabled={!tags.length} />
        </footer>
      </CollapsibleCard>

      {/* Ghi công */}
      <CollapsibleCard
        cardClassName="border-accent/30"
        defaultOpen={false}
        icon={<ShieldCheck className="size-4 text-accent" />}
        title="Công bố AI + ghi công"
        headerRight={
          <Badge variant="outline" className="text-[10px]">
            YouTube
          </Badge>
        }
      >
        <div className="p-5 space-y-3">
          <p className="text-xs text-muted-foreground">
            Người biên soạn, nhạc nền, nguồn tham khảo và bật/tắt công bố AI{" "}
            <strong>dùng chung với tab Facebook</strong> (sửa ở đó). Ghi công
            footage là riêng — bản YouTube dùng bộ footage ngang.
          </p>
          <div>
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">
              Footage ngang (ghi công stock)
            </Label>
            <Input
              value={footageCredit}
              onChange={(e) => setFootageCredit(e.target.value)}
              placeholder="Tự điền khi chạy footage-plan --landscape"
              className="mt-1 text-sm"
            />
          </div>
          <div className="rounded-md border bg-secondary/20 p-3 text-xs">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">
              Xem trước khối công bố
            </div>
            <div className="font-sans leading-relaxed whitespace-pre-wrap">{disclosure}</div>
          </div>
        </div>
      </CollapsibleCard>

      {/* Checklist Studio */}
      <CollapsibleCard
        defaultOpen={false}
        icon={<ListChecks className="size-4 text-accent" />}
        title="Checklist upload trong YouTube Studio"
      >
        <ol className="p-5 space-y-1.5 text-sm list-decimal list-inside">
          <li>Tải video + thumbnail ở trên, upload video trong Studio.</li>
          <li>Dán tiêu đề, mô tả đầy đủ; tải thumbnail lên.</li>
          <li>Thêm vào playlist theo series.</li>
          <li>
            Đối tượng: <strong>Không, nội dung này không dành cho trẻ em</strong>.
          </li>
          <li>
            "Nội dung bị thay đổi / tổng hợp" (Altered content): chọn{" "}
            <strong>Có</strong> — giọng đọc AI.
          </li>
          <li>Hiện thêm → dán thẻ; ngôn ngữ video: Tiếng Việt.</li>
          <li>Thêm màn hình kết thúc (end screen) dẫn sang tập khác + nút đăng ký.</li>
          <li>Chế độ hiển thị: công khai ngay hoặc lên lịch.</li>
        </ol>
        <footer className="px-5 py-3 border-t flex items-center justify-end">
          <Button variant="outline" size="sm" asChild>
            <a href="https://studio.youtube.com" target="_blank" rel="noreferrer">
              <ExternalLink className="size-3.5" />
              Mở YouTube Studio
            </a>
          </Button>
        </footer>
      </CollapsibleCard>

      {/* Đánh dấu đã đăng */}
      <Card className={cn("p-5 space-y-3", published && "border-accent/40 bg-accent/5")}>
        <div className="flex items-center gap-2">
          {published ? (
            <CheckCircle2 className="size-4 text-accent" />
          ) : (
            <ExternalLink className="size-4 text-muted-foreground" />
          )}
          <h3 className="font-medium text-sm">
            {published ? "Đã đăng YouTube" : "Sau khi upload xong"}
          </h3>
          {published && ep.config.ytPublishedAt && (
            <span className="text-xs text-muted-foreground ml-auto">
              {new Date(ep.config.ytPublishedAt).toLocaleString("vi-VN")}
            </span>
          )}
        </div>
        <div className="flex gap-2 flex-wrap">
          <Input
            value={ytUrl}
            onChange={(e) => setYtUrl(e.target.value)}
            placeholder="https://youtu.be/…"
            className="text-sm flex-1 min-w-[220px]"
          />
          {published ? (
            <>
              {ep.config.ytUrl && (
                <Button variant="outline" size="sm" asChild>
                  <a href={ep.config.ytUrl} target="_blank" rel="noreferrer">
                    <ExternalLink className="size-3.5" />
                    Mở video
                  </a>
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => markMut.mutate(true)}
                disabled={markMut.isPending || ytUrl.trim() === (ep.config.ytUrl ?? "")}
              >
                Lưu link
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => markMut.mutate(false)}
                disabled={markMut.isPending}
              >
                Bỏ đánh dấu
              </Button>
            </>
          ) : (
            <Button size="sm" onClick={() => markMut.mutate(true)} disabled={markMut.isPending}>
              <CheckCircle2 className="size-3.5" />
              Đánh dấu đã đăng
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}

/** Ô nhập dạng chip (hashtag / thẻ). */
function ChipInput({
  items,
  prefix = "",
  highlightFirst = 0,
  onRemove,
  input,
  onInput,
  onAdd,
  placeholder,
}: {
  items: string[];
  prefix?: string;
  /** Số chip đầu tô nổi (vd 3 hashtag hiện trên tiêu đề). */
  highlightFirst?: number;
  onRemove: (v: string) => void;
  input: string;
  onInput: (v: string) => void;
  onAdd: (v: string) => void;
  placeholder: string;
}) {
  const submit = () => {
    if (!input.trim()) return;
    onAdd(input);
    onInput("");
  };
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {items.map((v, i) => (
          <Badge
            key={v}
            variant={i < highlightFirst ? "accent" : "secondary"}
            className="gap-1 pl-2 pr-1 py-1 text-sm"
          >
            {prefix}
            {v}
            <button
              type="button"
              onClick={() => onRemove(v)}
              className="hover:text-destructive rounded p-0.5"
              aria-label={`Xoá ${v}`}
            >
              <XIcon className="size-3" />
            </button>
          </Badge>
        ))}
        {items.length === 0 && (
          <p className="text-xs text-muted-foreground italic">Chưa có — thêm bên dưới.</p>
        )}
      </div>
      <div className="relative">
        <Input
          value={input}
          onChange={(e) => onInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submit();
            }
          }}
          placeholder={placeholder}
          className="text-sm pr-10"
        />
        <button
          type="button"
          onClick={submit}
          disabled={!input.trim()}
          aria-label="Thêm"
          className="absolute right-1.5 top-1/2 -translate-y-1/2 inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
        >
          <Plus className="size-4" />
        </button>
      </div>
    </div>
  );
}
