import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Copy,
  Check,
  Upload,
  Download,
  Play,
  Trash2,
  Loader2,
  ExternalLink,
  ChevronDown,
  Clapperboard,
  Terminal,
  Info,
  GripVertical,
  Music,
  Send,
  Hash,
  Sparkles,
  Plus,
  Search,
  X as XIcon,
} from "lucide-react";
import {
  api,
  reelApi,
  type ReelEpisodeDetail,
  type ReelUploadKind,
  type ReelPexelsVideo,
  type LLMProvider,
} from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const fmtDur = (ms: number) =>
  ms ? `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, "0")}` : "—";
const fmtSec = (ms: number) => `${(ms / 1000).toFixed(1)}s`;

export function ReelEpisode() {
  const { slug = "" } = useParams();
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ["reel", slug],
    queryFn: () => reelApi.get(slug),
    enabled: !!slug,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["reel", slug] });
    qc.invalidateQueries({ queryKey: ["reel", "list"] });
  };

  if (isLoading)
    return (
      <div className="container max-w-4xl py-10 text-muted-foreground">
        <Loader2 className="mr-2 inline size-4 animate-spin" /> Đang tải…
      </div>
    );
  if (error || !data)
    return (
      <div className="container max-w-4xl py-10 text-destructive">
        Không tải được tập.
      </div>
    );

  return (
    <div className="container max-w-4xl py-8">
      <Link
        to="/reel"
        className="mb-5 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Tất cả tập reel
      </Link>

      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <h1 className="flex items-center gap-3 font-serif text-3xl tracking-tight">
          <Clapperboard className="size-7 text-accent" />
          {data.slug}
        </h1>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant={data.hasScript ? "secondary" : "destructive"}>
            {data.hasScript ? "script" : "thiếu script"}
          </Badge>
          <Badge variant="secondary">{data.audioParts.length} audio</Badge>
          <Badge variant="secondary">{data.footageCount} footage</Badge>
          {data.beats && (
            <Badge variant="outline" className="gap-1">
              {data.beats.count} beat · {fmtDur(data.beats.durationMs)}
              {data.beats.alignedPct != null && ` · neo ${data.beats.alignedPct}%`}
            </Badge>
          )}
        </div>
      </header>

      <div className="space-y-5">
        <TtsBlocks blocks={data.blocks} />
        <AudioCard data={data} onChange={invalidate} />
        <FootageCard data={data} onChange={invalidate} />
        <MusicCard data={data} onChange={invalidate} />
        <RunSection slug={slug} onDone={invalidate} />
        <ResultsSection data={data} />
        <PostCard data={data} />
      </div>
    </div>
  );
}

// ─── Card scaffolding ───────────────────────────────────────────────────

function StepCard({
  n,
  icon,
  title,
  subtitle,
  right,
  children,
}: {
  n?: number;
  icon?: React.ReactNode;
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center gap-3 border-b bg-secondary/30 px-4 py-3">
        <span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
          {n != null ? n : icon}
        </span>
        <div className="min-w-0">
          <div className="font-medium leading-tight">{title}</div>
          {subtitle && (
            <div className="text-xs text-muted-foreground">{subtitle}</div>
          )}
        </div>
        {right && <div className="ml-auto">{right}</div>}
      </div>
      {children}
    </Card>
  );
}

// ─── 1. Prompt TTS ──────────────────────────────────────────────────────

function TtsBlocks({ blocks }: { blocks: ReelEpisodeDetail["blocks"] }) {
  const [open, setOpen] = useState(true);
  return (
    <StepCard
      n={1}
      title="Prompt Gemini TTS"
      subtitle="Copy dán sang Google AI Studio"
      right={
        <Button
          variant="ghost"
          size="sm"
          className="gap-1"
          onClick={() => setOpen((o) => !o)}
        >
          {open ? "Thu gọn" : "Mở"}
          <ChevronDown
            className={cn("size-4 transition-transform", open && "rotate-180")}
          />
        </Button>
      }
    >
      {open && (
        <div className="divide-y px-4">
          <CopyBlock label="Scene" text={blocks.scene} />
          <CopyBlock label="Sample Context" text={blocks.sampleContext} />
          <CopyBlock label="Speaker / Voice" text={blocks.speaker} />
          {blocks.speechParts.length > 0 ? (
            <div className="py-3">
              <div className="mb-2 flex items-start gap-1.5 text-xs text-muted-foreground">
                <Info className="mt-0.5 size-3.5 shrink-0" />
                <span>
                  Gemini TTS tối đa ~1:30/lần — gen <b>từng phần</b>, tải về lưu
                  theo thứ tự <code>audio_01</code> … rồi upload ở bước 2.
                </span>
              </div>
              <div className="space-y-2">
                {blocks.speechParts.map((p, i) => (
                  <CopyBlock
                    key={i}
                    label={p.label || `Phần ${i + 1}`}
                    text={p.text}
                    scroll
                    rail
                  />
                ))}
              </div>
            </div>
          ) : (
            <CopyBlock label="Lời đọc (Speech block)" text={blocks.speech} scroll />
          )}
        </div>
      )}
    </StepCard>
  );
}

function CopyBlock({
  label,
  text,
  scroll,
  rail,
}: {
  label: string;
  text: string;
  scroll?: boolean;
  rail?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  if (!text) return null;
  const copy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <div className={cn("py-3", rail && "border-l-2 border-border py-2 pl-3")}>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        <button
          onClick={copy}
          className={cn(
            "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs transition-colors",
            copied
              ? "text-accent"
              : "text-muted-foreground hover:bg-secondary hover:text-foreground",
          )}
        >
          {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
          {copied ? "Đã copy" : "Copy"}
        </button>
      </div>
      <div
        className={cn(
          "whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground/90",
          scroll && "max-h-64 overflow-auto pr-1",
        )}
      >
        {text}
      </div>
    </div>
  );
}

// ─── 2. Audio + 3. Footage ──────────────────────────────────────────────

function AudioCard({
  data,
  onChange,
}: {
  data: ReelEpisodeDetail;
  onChange: () => void;
}) {
  return (
    <StepCard
      n={2}
      title="Audio"
      subtitle="Upload các part audio_01, 02… theo thứ tự"
      right={
        data.audioParts.length > 0 ? (
          <Badge variant="secondary" className="tabular-nums">
            tổng {fmtDur(data.audioDurationMs)}
          </Badge>
        ) : undefined
      }
    >
      <div className="p-4">
        <Dropzone
          slug={data.slug}
          kind="audio"
          label="Kéo-thả / bấm chọn audio"
          hint=".wav .mp3 .m4a — nhiều part tự đánh số"
          onChange={onChange}
        />
        <SortableMediaList
          slug={data.slug}
          names={data.audioParts}
          durations={data.durations.audio}
          bucket="audio"
          kind="audio"
          preview="audio"
          reorder={(order) => reelApi.reorderAudio(data.slug, order)}
          hint="Kéo để đổi thứ tự — sẽ đổi tên lại audio_01, 02… đúng thứ tự nối"
          onChange={onChange}
        />
      </div>
    </StepCard>
  );
}

function FootageCard({
  data,
  onChange,
}: {
  data: ReelEpisodeDetail;
  onChange: () => void;
}) {
  return (
    <StepCard
      n={3}
      title="Footage"
      subtitle="Tìm & thêm bên trái · storyboard (thứ tự ghép) bên phải"
      right={
        data.footageCount > 0 ? (
          <Badge variant="secondary" className="tabular-nums">
            {data.footageCount} clip · {fmtDur(data.footageDurationMs)}
          </Badge>
        ) : undefined
      }
    >
      <div className="grid gap-4 p-4 lg:grid-cols-[1.55fr_1fr]">
        {/* Cột trái — tìm & thêm nguồn footage */}
        <div className="min-w-0 space-y-3">
          <PexelsSearch data={data} onChange={onChange} />
          <Dropzone
            slug={data.slug}
            kind="footage"
            label="Kéo-thả / bấm chọn footage"
            hint=".mp4 .mov — hoặc dán URL bên dưới"
            onChange={onChange}
          />
          <UrlDownload slug={data.slug} kind="footage" onChange={onChange} />
        </div>

        {/* Cột phải — storyboard, dính (sticky) để clip vừa thêm hiện ngay */}
        <div className="min-w-0 lg:sticky lg:top-4 lg:self-start">
          <Storyboard data={data} onChange={onChange} />
        </div>
      </div>
    </StepCard>
  );
}

/** Cột storyboard: danh sách clip theo thứ tự ghép (kéo sắp xếp) + so khớp thời lượng. */
function Storyboard({
  data,
  onChange,
}: {
  data: ReelEpisodeDetail;
  onChange: () => void;
}) {
  return (
    <div className="rounded-lg border bg-secondary/10 p-3">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-sm font-medium">
          <Clapperboard className="size-3.5 text-accent" />
          Storyboard
        </span>
        {data.footageCount > 0 && (
          <Badge variant="secondary" className="tabular-nums">
            {data.footageCount}
          </Badge>
        )}
      </div>

      {data.footageCount === 0 ? (
        <div className="mt-2 rounded-md border border-dashed py-10 text-center text-xs text-muted-foreground">
          Chưa có clip. Tìm bên trái rồi bấm <b className="text-foreground">Thêm</b> —
          clip sẽ hiện ở đây.
        </div>
      ) : (
        <SortableMediaList
          slug={data.slug}
          names={data.footage}
          durations={data.durations.footage}
          bucket="footage"
          kind="footage"
          preview="video"
          reorder={(order) => reelApi.reorderFootage(data.slug, order)}
          hint="Kéo để đổi thứ tự ghép vào video"
          onChange={onChange}
        />
      )}
      <MatchHint
        audioMs={data.audioDurationMs}
        footageMs={data.footageDurationMs}
        hasAudio={data.audioParts.length > 0}
        hasFootage={data.footageCount > 0}
      />
    </div>
  );
}

type KwGroup = { label: string; keywords: string[] };

/**
 * Rút từ khoá tìm footage từ shot-list.md.
 * Ưu tiên mục "## Bộ từ khoá tìm nhanh" (các nhãn **...** + code fence, phân tách bằng · / xuống dòng);
 * nếu không có thì lấy các token `...` ở cột cuối bảng shot-list, gộp theo tên beat.
 */
function parseKeywordGroups(shotList: string): KwGroup[] {
  if (!shotList) return [];
  const uniq = (a: string[]) => [...new Set(a.map((s) => s.trim()).filter(Boolean))];
  const groups: KwGroup[] = [];

  const start = /^##\s+Bộ từ khoá.*$/im.exec(shotList);
  if (start) {
    const rest = shotList.slice(start.index + start[0].length);
    const next = rest.search(/\n##\s+/);
    const region = next >= 0 ? rest.slice(0, next) : rest;
    const re = /\*\*(.+?)\*\*\s*\n```[^\n]*\n([\s\S]*?)```/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(region))) {
      const label = m[1].replace(/[*`]/g, "").trim();
      const kws = uniq(m[2].split(/[\n·]/));
      if (kws.length) groups.push({ label, keywords: kws });
    }
  }
  if (groups.length) return groups;

  // Fallback: bảng markdown — cột cuối chứa token `...`, gộp theo cột "Beat".
  for (const line of shotList.split("\n")) {
    const t = line.trim();
    if (!t.startsWith("|") || /^\|[-\s|:]+\|?$/.test(t)) continue;
    const cols = t.split("|").slice(1, -1).map((c) => c.trim());
    if (cols.length < 3) continue;
    if (/^#$/.test(cols[0]) || /câu dẫn|Beat \(/.test(cols[1] ?? "")) continue; // header
    const tokens = uniq([...cols[cols.length - 1].matchAll(/`([^`]+)`/g)].map((x) => x[1]));
    if (!tokens.length) continue;
    const label = (cols[1] ?? "").replace(/[*`"]/g, "").trim() || "Từ khoá";
    groups.push({ label, keywords: tokens });
  }
  return groups;
}

/**
 * Gợi ý từ khoá tìm footage. Bấm chữ → tìm NGAY trong app (Pexels), bấm ↗ → mở Pexels ngoài.
 * `onPick` được gọi khi bấm 1 từ khoá để chạy tìm kiếm trong app.
 */
function FootageKeywords({
  shotList,
  onPick,
}: {
  shotList: string;
  onPick: (kw: string) => void;
}) {
  const groups = useMemo(() => parseKeywordGroups(shotList), [shotList]);
  const [open, setOpen] = useState(false);
  if (!groups.length) return null;

  const pexels = (kw: string) =>
    `https://www.pexels.com/search/videos/${encodeURIComponent(kw)}/?orientation=portrait`;

  return (
    <div className="mb-3 rounded-lg border border-border bg-secondary/20">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-3 py-2 text-left"
      >
        <span className="flex items-center gap-2 text-sm font-medium">
          <Search className="size-3.5 text-muted-foreground" />
          Gợi ý từ khoá tìm footage
          <Badge variant="secondary" className="tabular-nums">
            {groups.reduce((n, g) => n + g.keywords.length, 0)}
          </Badge>
        </span>
        <ChevronDown className={cn("size-4 transition-transform", !open && "-rotate-90")} />
      </button>

      {open && (
        <div className="space-y-3 px-3 pb-3">
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            Bấm chữ để <b className="text-foreground">tìm ngay</b> bên dưới · bấm
            <ExternalLink className="inline size-3" /> để mở Pexels ngoài.
          </p>
          {groups.map((g) => (
            <div key={g.label}>
              <div className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {g.label}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {g.keywords.map((kw) => (
                  <span
                    key={kw}
                    className="inline-flex items-center overflow-hidden rounded-full border border-border bg-background/60"
                  >
                    <button
                      onClick={() => onPick(kw)}
                      title="Tìm ngay trong app"
                      className="inline-flex items-center gap-1 py-1 pl-2.5 pr-1.5 text-xs text-foreground/90 transition-colors hover:bg-secondary"
                    >
                      <Search className="size-3 opacity-40" />
                      {kw}
                    </button>
                    <a
                      href={pexels(kw)}
                      target="_blank"
                      rel="noreferrer"
                      title="Mở Pexels ngoài (video dọc)"
                      className="flex items-center self-stretch border-l border-border px-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                    >
                      <ExternalLink className="size-3" />
                    </a>
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Tên file dự kiến khi tải 1 URL Pexels về (để đánh dấu clip đã thêm vào tập). */
function expectedFootageName(downloadUrl: string): string {
  try {
    const last = decodeURIComponent(new URL(downloadUrl).pathname.split("/").pop() ?? "");
    return last.replace(/[^a-zA-Z0-9._-]/g, "_");
  } catch {
    return "";
  }
}

/**
 * Tìm + xem + thêm footage dọc từ Pexels ngay trong app.
 * Bao gồm ô tìm kiếm, lưới kết quả (thumbnail → click xem thử video), nút Thêm (tải vào footage tập).
 */
function PexelsSearch({
  data,
  onChange,
}: {
  data: ReelEpisodeDetail;
  onChange: () => void;
}) {
  const [draft, setDraft] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);

  const submit = (kw?: string) => {
    const q = (kw ?? draft).trim();
    if (kw != null) setDraft(kw);
    setPage(1);
    setQuery(q);
  };
  const pick = (kw: string) => {
    submit(kw);
    // cuộn tới ô tìm để thấy kết quả (chip nằm ngay trên nên thường đã thấy)
  };

  const search = useQuery({
    queryKey: ["pexels", query, page],
    queryFn: () => reelApi.searchFootage(query, page),
    enabled: !!query,
    placeholderData: (prev) => prev,
    staleTime: 5 * 60_000,
  });

  const have = useMemo(() => new Set(data.footage), [data.footage]);

  return (
    <div>
      <FootageKeywords shotList={data.shotList} onPick={pick} />

      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            placeholder="Tìm footage dọc trên Pexels (vd: old family photos)…"
            className="h-9 pl-8 text-sm"
          />
          {draft && (
            <button
              onClick={() => {
                setDraft("");
                setQuery("");
              }}
              title="Xoá"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <XIcon className="size-3.5" />
            </button>
          )}
        </div>
        <Button size="sm" className="h-9" disabled={!draft.trim()} onClick={() => submit()}>
          {search.isFetching ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
          <span className="ml-1.5">Tìm</span>
        </Button>
      </div>

      {query && (
        <div className="mt-3">
          {search.isError ? (
            <div className="flex items-center gap-1.5 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
              <Info className="size-3.5 shrink-0" />
              {(search.error as Error).message}
            </div>
          ) : search.isLoading ? (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Đang tìm “{query}”…
            </div>
          ) : !search.data?.videos.length ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              Không có kết quả cho “{query}”. Thử từ khoá tiếng Anh khác.
            </div>
          ) : (
            <>
              <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
                <span>
                  {search.data.total.toLocaleString()} video dọc · trang {search.data.page}
                </span>
                <span className={cn("inline-flex items-center gap-1", search.isFetching && "opacity-100")}>
                  {search.isFetching && <Loader2 className="size-3 animate-spin" />}
                </span>
              </div>
              <div className="grid max-h-[62vh] grid-cols-2 gap-2 overflow-y-auto pr-1">
                {search.data.videos.map((v) => (
                  <PexelsCard
                    key={v.id}
                    v={v}
                    slug={data.slug}
                    added={have.has(expectedFootageName(v.download))}
                    onChange={onChange}
                  />
                ))}
              </div>
              <div className="mt-3 flex items-center justify-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1 || search.isFetching}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Trước
                </Button>
                <span className="text-xs tabular-nums text-muted-foreground">trang {page}</span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!search.data.hasMore || search.isFetching}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Sau
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/** 1 thẻ kết quả Pexels: thumbnail → bấm xem thử video, nút Thêm để tải vào footage tập. */
function PexelsCard({
  v,
  slug,
  added,
  onChange,
}: {
  v: ReelPexelsVideo;
  slug: string;
  added: boolean;
  onChange: () => void;
}) {
  const [playing, setPlaying] = useState(false);
  const [justAdded, setJustAdded] = useState(false);
  const add = useMutation({
    mutationFn: () => reelApi.download(slug, "footage", [v.download]),
    onSuccess: (res) => {
      if (res.failed.length) {
        alert(`Không tải được:\n${res.failed.map((f) => f.error).join("\n")}`);
      } else {
        setJustAdded(true);
      }
      onChange();
    },
    onError: (e) => alert(`Lỗi tải: ${(e as Error).message}`),
  });
  const isAdded = added || justAdded;

  return (
    <div className="group relative overflow-hidden rounded-lg border bg-black/40">
      <div className="relative aspect-[9/16] w-full">
        {playing ? (
          <video
            src={v.preview}
            poster={v.image}
            controls
            autoPlay
            loop
            muted
            className="h-full w-full object-cover"
          />
        ) : (
          <button
            onClick={() => setPlaying(true)}
            title="Xem thử"
            className="absolute inset-0 h-full w-full"
          >
            <img
              src={v.image}
              alt=""
              loading="lazy"
              className="h-full w-full object-cover"
            />
            <span className="absolute inset-0 grid place-items-center bg-black/10 text-white/90 transition-colors group-hover:bg-black/30">
              <Play className="size-7 drop-shadow" />
            </span>
          </button>
        )}
        <span className="pointer-events-none absolute left-1.5 top-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-white">
          {fmtDur(v.duration * 1000)}
        </span>
        <a
          href={v.url}
          target="_blank"
          rel="noreferrer"
          title={`Pexels · ${v.author || "xem gốc"}`}
          onClick={(e) => e.stopPropagation()}
          className="absolute right-1.5 top-1.5 rounded bg-black/60 p-1 text-white/90 opacity-0 transition-opacity hover:text-white group-hover:opacity-100"
        >
          <ExternalLink className="size-3" />
        </a>
      </div>
      <Button
        size="sm"
        variant={isAdded ? "secondary" : "default"}
        disabled={add.isPending || isAdded}
        onClick={() => add.mutate()}
        className="h-8 w-full rounded-none border-0"
      >
        {add.isPending ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : isAdded ? (
          <>
            <Check className="size-3.5" /> Đã thêm
          </>
        ) : (
          <>
            <Plus className="size-3.5" /> Thêm
          </>
        )}
      </Button>
    </div>
  );
}

/** So khớp tổng footage với tổng audio (audio là master timeline). */
function MatchHint({
  audioMs,
  footageMs,
  hasAudio,
  hasFootage,
}: {
  audioMs: number;
  footageMs: number;
  hasAudio: boolean;
  hasFootage: boolean;
}) {
  if (!hasAudio || !hasFootage) return null;
  const diff = footageMs - audioMs;
  const enough = diff >= 0;
  return (
    <div
      className={cn(
        "mt-3 flex items-start gap-1.5 rounded-md px-3 py-2 text-xs",
        enough ? "bg-accent/10 text-accent" : "bg-destructive/10 text-destructive",
      )}
    >
      <Info className="mt-0.5 size-3.5 shrink-0" />
      <span>
        Footage <b className="tabular-nums">{fmtDur(footageMs)}</b> / audio{" "}
        <b className="tabular-nums">{fmtDur(audioMs)}</b> —{" "}
        {enough
          ? `đủ (dư ${fmtDur(diff)}); assemble sẽ cắt cho khớp audio.`
          : `THIẾU ${fmtDur(-diff)}; cần thêm footage, nếu không sẽ phải lặp clip.`}
      </span>
    </div>
  );
}

function Dropzone({
  slug,
  kind,
  label,
  hint,
  onChange,
}: {
  slug: string;
  kind: ReelUploadKind;
  label: string;
  hint: string;
  onChange: () => void;
}) {
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const upload = async (files: File[]) => {
    if (!files.length) return;
    setBusy(true);
    try {
      await reelApi.upload(slug, kind, files);
      onChange();
    } catch (e) {
      alert(`Lỗi upload: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        upload([...e.dataTransfer.files]);
      }}
      className={cn(
        "flex min-h-[76px] cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed px-3 py-4 text-center text-sm transition-colors",
        over
          ? "border-primary bg-primary/5 text-foreground"
          : "text-muted-foreground hover:border-primary/40 hover:bg-secondary/40",
      )}
    >
      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => upload([...(e.target.files ?? [])])}
      />
      {busy ? (
        <span className="inline-flex items-center gap-2">
          <Loader2 className="size-4 animate-spin" /> Đang tải…
        </span>
      ) : (
        <>
          <Upload className="mb-1 size-5 opacity-70" />
          <div className="font-medium text-foreground/80">{label}</div>
          <div className="text-xs opacity-70">{hint}</div>
        </>
      )}
    </div>
  );
}

function UrlDownload({
  slug,
  kind,
  onChange,
}: {
  slug: string;
  kind: "footage" | "music";
  onChange: () => void;
}) {
  const [urls, setUrls] = useState("");
  const mut = useMutation({
    mutationFn: (list: string[]) => reelApi.download(slug, kind, list),
    onSuccess: (res) => {
      if (res.saved.length) setUrls("");
      if (res.failed.length) {
        alert(
          "Một số URL lỗi:\n\n" +
            res.failed.map((f) => `• ${f.url}\n  → ${f.error}`).join("\n\n"),
        );
      }
      onChange();
    },
    onError: (e) => alert(`Lỗi: ${(e as Error).message}`),
  });
  const submit = () => {
    const list = urls.split(/\n+/).map((s) => s.trim()).filter(Boolean);
    if (list.length) mut.mutate(list);
  };
  return (
    <div className="relative">
      <Textarea
        rows={2}
        value={urls}
        onChange={(e) => setUrls(e.target.value)}
        placeholder="Dán URL video trực tiếp (mỗi dòng 1 link Download)"
        className="min-h-0 w-full pr-20 text-xs"
      />
      <Button
        variant="outline"
        size="icon"
        title="Tải từ URL"
        className="absolute bottom-2 right-2 size-7"
        disabled={mut.isPending || !urls.trim()}
        onClick={submit}
      >
        {mut.isPending ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : (
          <Download className="size-3.5" />
        )}
      </Button>
    </div>
  );
}

/** List media kéo-thả sắp xếp + đánh số + preview (video: thumbnail; audio: player). */
function SortableMediaList({
  slug,
  names,
  durations,
  bucket,
  kind,
  preview,
  reorder,
  hint,
  onChange,
}: {
  slug: string;
  names: string[];
  durations?: Record<string, number>;
  bucket: "audio" | "footage";
  kind: ReelUploadKind;
  preview: "audio" | "video";
  reorder: (order: string[]) => Promise<unknown>;
  hint: string;
  onChange: () => void;
}) {
  const [items, setItems] = useState<string[]>(names);
  const dragFrom = useRef<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => setItems(names), [names]);

  const mut = useMutation({
    mutationFn: (order: string[]) => reorder(order),
    onSuccess: onChange,
    onError: (e) => {
      alert(`Lỗi sắp xếp: ${(e as Error).message}`);
      onChange();
    },
  });

  const del = async (name: string) => {
    if (!confirm(`Xoá ${name}?`)) return;
    try {
      await reelApi.deleteFile(slug, kind, name);
      onChange();
    } catch (e) {
      alert(`Lỗi xoá: ${(e as Error).message}`);
    }
  };

  const drop = (to: number) => {
    const from = dragFrom.current;
    dragFrom.current = null;
    setOverIdx(null);
    if (from == null || from === to) return;
    const next = [...items];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setItems(next);
    mut.mutate(next);
  };

  if (!items.length) return null;
  return (
    <div className="mt-3">
      <div className="mb-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <GripVertical className="size-3" /> {hint}
      </div>
      <ul className="divide-y border-t">
        {items.map((n, i) => (
          <li
            key={n}
            draggable
            onDragStart={() => (dragFrom.current = i)}
            onDragOver={(e) => {
              e.preventDefault();
              if (overIdx !== i) setOverIdx(i);
            }}
            onDrop={() => drop(i)}
            onDragEnd={() => {
              dragFrom.current = null;
              setOverIdx(null);
            }}
            className={cn("group py-1.5 text-xs", overIdx === i && "bg-primary/5")}
          >
            <div className="flex cursor-grab items-center gap-2 active:cursor-grabbing">
              <GripVertical className="size-3.5 shrink-0 text-muted-foreground/50" />
              <SeqBadge n={i + 1} />
              {preview === "video" ? (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpen((p) => (p === n ? null : n));
                  }}
                  title="Xem trước"
                  className="relative shrink-0 overflow-hidden rounded border bg-black/40"
                >
                  <img
                    src={reelApi.thumbUrl(slug, n)}
                    alt=""
                    loading="lazy"
                    draggable={false}
                    className="h-14 w-10 object-cover"
                    onError={(e) => (e.currentTarget.style.opacity = "0")}
                  />
                  <span className="absolute inset-0 grid place-items-center text-white/0 transition-colors hover:bg-black/30 hover:text-white/90">
                    <Play className="size-4" />
                  </span>
                </button>
              ) : (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpen((p) => (p === n ? null : n));
                  }}
                  title="Nghe thử"
                  className="grid size-7 shrink-0 place-items-center rounded border text-muted-foreground hover:bg-secondary hover:text-foreground"
                >
                  <Play className="size-3.5" />
                </button>
              )}
              <span className="min-w-0 flex-1 truncate font-mono text-muted-foreground">
                {n}
              </span>
              <DurTag ms={durations?.[n]} />
              <span className="flex shrink-0 items-center gap-1">
                <a
                  href={reelApi.fileUrl(slug, bucket, n)}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
                  onClick={(e) => e.stopPropagation()}
                >
                  <ExternalLink className="size-3.5" />
                </a>
                <button
                  onClick={() => del(n)}
                  className="rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </span>
            </div>
            {open === n && preview === "video" && (
              <video
                controls
                autoPlay
                muted
                className="mt-2 max-h-72 rounded bg-black"
                src={reelApi.fileUrl(slug, bucket, n)}
              />
            )}
            {open === n && preview === "audio" && (
              <audio
                controls
                autoPlay
                className="mt-2 h-8 w-full"
                src={reelApi.fileUrl(slug, bucket, n)}
              />
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function SeqBadge({ n }: { n: number }) {
  return (
    <span className="grid size-5 shrink-0 place-items-center rounded bg-secondary text-[10px] font-semibold tabular-nums text-muted-foreground">
      {String(n).padStart(2, "0")}
    </span>
  );
}

function DurTag({ ms }: { ms?: number }) {
  if (ms == null) return null;
  return (
    <span className="shrink-0 tabular-nums text-[11px] text-muted-foreground/80">
      {ms ? fmtDur(ms) : "—"}
    </span>
  );
}

// ─── Nhạc nền (asset dùng chung) ────────────────────────────────────────

function MusicCard({
  data,
  onChange,
}: {
  data: ReelEpisodeDetail;
  onChange: () => void;
}) {
  return (
    <StepCard
      icon={<Music className="size-3.5" />}
      title="Nhạc nền"
      subtitle="Tuỳ chọn · dùng chung mọi tập reel (reel/assets/music)"
    >
      <div className="p-4">
        <Dropzone
          slug={data.slug}
          kind="music"
          label="Kéo-thả / bấm chọn nhạc nền"
          hint=".mp3 .wav — hoặc dán URL bên dưới"
          onChange={onChange}
        />
        <div className="mt-3">
          <UrlDownload slug={data.slug} kind="music" onChange={onChange} />
        </div>
        <MusicList slug={data.slug} names={data.music} onChange={onChange} />
      </div>
    </StepCard>
  );
}

function MusicList({
  slug,
  names,
  onChange,
}: {
  slug: string;
  names: string[];
  onChange: () => void;
}) {
  const del = async (name: string) => {
    if (!confirm(`Xoá ${name}? (nhạc dùng chung — mọi tập sẽ mất file này)`)) return;
    try {
      await reelApi.deleteFile(slug, "music", name);
      onChange();
    } catch (e) {
      alert(`Lỗi xoá: ${(e as Error).message}`);
    }
  };
  if (!names.length) return null;
  return (
    <ul className="mt-3 divide-y border-t">
      {names.map((n) => (
        <li key={n} className="group py-2 text-xs">
          <div className="flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate font-mono text-muted-foreground">
              {n}
            </span>
            <button
              onClick={() => del(n)}
              className="rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
            >
              <Trash2 className="size-3.5" />
            </button>
          </div>
          <audio
            controls
            preload="none"
            className="mt-1 h-8 w-full"
            src={reelApi.fileUrl(slug, "music", n)}
          />
        </li>
      ))}
    </ul>
  );
}

// ─── 4. Chạy pipeline (SSE) ─────────────────────────────────────────────

function RunSection({ slug, onDone }: { slug: string; onDone: () => void }) {
  const [lines, setLines] = useState<Array<{ text: string; cls?: string }>>([]);
  const [running, setRunning] = useState<null | "align" | "assemble">(null);
  const esRef = useRef<EventSource | null>(null);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => () => esRef.current?.close(), []);
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [lines]);

  const run = (task: "align" | "assemble") => {
    esRef.current?.close();
    setLines([]);
    setRunning(task);
    const es = new EventSource(reelApi.runUrl(slug, task));
    esRef.current = es;
    const push = (text: string, cls?: string) =>
      setLines((prev) => [...prev, { text, cls }]);
    es.addEventListener("log", (e) => push(JSON.parse((e as MessageEvent).data).line));
    es.addEventListener("error", (e) => {
      try {
        push("⚠ " + JSON.parse((e as MessageEvent).data).message, "text-destructive");
      } catch {
        /* connection error, ignore */
      }
    });
    es.addEventListener("done", (e) => {
      const code = JSON.parse((e as MessageEvent).data).code;
      push(
        code === 0 ? "✓ Hoàn tất" : `✗ Thoát mã ${code}`,
        code === 0 ? "text-accent" : "text-destructive",
      );
      es.close();
      setRunning(null);
      onDone();
    });
    es.onerror = () => {
      es.close();
      setRunning(null);
    };
  };

  return (
    <StepCard n={4} title="Chạy pipeline" subtitle="Whisper align + ráp video">
      <div className="p-4">
        <div className="flex flex-wrap gap-2">
          <Button disabled={!!running} onClick={() => run("align")} className="gap-1.5">
            {running === "align" ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Play className="size-4" />
            )}
            Align (whisper + caption)
          </Button>
          <Button
            variant="outline"
            disabled={!!running}
            onClick={() => run("assemble")}
            className="gap-1.5"
          >
            {running === "assemble" ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Play className="size-4" />
            )}
            Assemble (ráp mp4)
          </Button>
        </div>
        {lines.length > 0 && (
          <div className="mt-3">
            <div className="mb-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
              <Terminal className="size-3.5" /> Log
            </div>
            <div
              ref={logRef}
              className="h-56 overflow-auto whitespace-pre-wrap rounded-md bg-foreground/5 p-3 font-mono text-xs leading-relaxed"
            >
              {lines.map((l, i) => (
                <div key={i} className={cn("text-muted-foreground", l.cls)}>
                  {l.text}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </StepCard>
  );
}

// ─── 5. Kết quả ─────────────────────────────────────────────────────────

function ResultsSection({ data }: { data: ReelEpisodeDetail }) {
  const hasAlign = data.finalAudio.length > 0 || data.hasCaption || !!data.beats;
  if (!hasAlign && data.output.length === 0) return null;
  return (
    <>
      {hasAlign && (
        <StepCard n={5} title="Kết quả align">
          <div className="space-y-3 p-4">
            {data.finalAudio.length > 0 && (
              <div>
                <div className="mb-1.5 text-xs font-medium text-muted-foreground">
                  Audio master (loudnorm)
                </div>
                <audio
                  controls
                  className="w-full"
                  src={reelApi.fileUrl(data.slug, "work", data.finalAudio[0])}
                />
              </div>
            )}
            {data.hasCaption && (
              <div className="flex flex-wrap gap-2 text-xs">
                <a
                  className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-primary hover:bg-secondary"
                  href={reelApi.fileUrl(data.slug, "work", "caption.srt")}
                  target="_blank"
                  rel="noreferrer"
                >
                  <ExternalLink className="size-3" /> caption.srt
                </a>
                <a
                  className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-primary hover:bg-secondary"
                  href={reelApi.fileUrl(data.slug, "work", "beats.json")}
                  target="_blank"
                  rel="noreferrer"
                >
                  <ExternalLink className="size-3" /> beats.json
                </a>
              </div>
            )}
            {data.beats && <BeatsTable slug={data.slug} />}
          </div>
        </StepCard>
      )}
      {data.output.length > 0 && (
        <StepCard n={6} title="Video kết quả">
          <div className="p-4">
            <video
              controls
              className="mx-auto max-h-[70vh] rounded-md bg-black"
              src={reelApi.fileUrl(data.slug, "out", data.output[0])}
            />
          </div>
        </StepCard>
      )}
    </>
  );
}

type Beat = { index: number; text: string; startMs: number; endMs: number };

function BeatsTable({ slug }: { slug: string }) {
  const { data } = useQuery({
    queryKey: ["reel", slug, "beats"],
    queryFn: async () => {
      const res = await fetch(reelApi.fileUrl(slug, "work", "beats.json"));
      return (await res.json()) as { beats: Beat[] };
    },
  });
  if (!data?.beats?.length) return null;
  return (
    <div>
      <div className="mb-1.5 text-xs font-medium text-muted-foreground">
        Beats ({data.beats.length})
      </div>
      <div className="max-h-80 overflow-auto border-t">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-secondary/60 text-left text-muted-foreground">
            <tr>
              <th className="px-3 py-1.5 font-medium">#</th>
              <th className="px-3 py-1.5 font-medium tabular-nums">bắt đầu</th>
              <th className="px-3 py-1.5 font-medium tabular-nums">kết thúc</th>
              <th className="px-3 py-1.5 font-medium">câu</th>
            </tr>
          </thead>
          <tbody>
            {data.beats.slice(0, 100).map((b) => (
              <tr key={b.index} className="border-t">
                <td className="px-3 py-1.5 tabular-nums text-muted-foreground">
                  {b.index + 1}
                </td>
                <td className="px-3 py-1.5 tabular-nums">{fmtSec(b.startMs)}</td>
                <td className="px-3 py-1.5 tabular-nums">{fmtSec(b.endMs)}</td>
                <td className="px-3 py-1.5">{b.text}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Đăng bài fanpage (caption + hashtag) ───────────────────────────────

const MAX_HASHTAGS = 5;
const DEFAULT_HASHTAGS = ["donghoviet", "giapha", "giadinh", "nguoncoi", "totien"];
const SUGGESTED_HASHTAGS = [
  "donghoviet", "giapha", "giadinh", "nguoncoi", "totien",
  "kyuc", "ongba", "giatrigiadinh", "vietnam", "truyenthong",
];

function PostCard({ data }: { data: ReelEpisodeDetail }) {
  const [caption, setCaption] = useState(data.post.caption ?? "");
  const [hashtags, setHashtags] = useState<string[]>(
    data.post.hashtags.length ? data.post.hashtags.slice(0, MAX_HASHTAGS) : DEFAULT_HASHTAGS,
  );
  const [tagInput, setTagInput] = useState("");
  const [copied, setCopied] = useState(false);

  const seen = useRef(data.slug);
  useEffect(() => {
    if (seen.current !== data.slug) {
      seen.current = data.slug;
      setCaption(data.post.caption ?? "");
      setHashtags(data.post.hashtags.length ? data.post.hashtags : DEFAULT_HASHTAGS);
    }
  }, [data.slug, data.post]);

  const save = useMutation({
    mutationFn: (p: { caption: string; hashtags: string[] }) => reelApi.savePost(data.slug, p),
  });
  const t = useRef<number | null>(null);
  useEffect(() => {
    if (
      caption === (data.post.caption ?? "") &&
      JSON.stringify(hashtags) === JSON.stringify(data.post.hashtags)
    )
      return;
    if (t.current) window.clearTimeout(t.current);
    t.current = window.setTimeout(() => save.mutate({ caption, hashtags }), 700);
    return () => {
      if (t.current) window.clearTimeout(t.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caption, hashtags]);

  const modelsQ = useQuery({
    queryKey: ["llm-models"],
    queryFn: () => api.listLLMModels(),
    staleTime: 60_000,
  });
  const [provider, setProvider] = useState<LLMProvider>("openai");
  const [model, setModel] = useState("gpt-4o-mini");

  const aiGen = useMutation({
    mutationFn: () => reelApi.genPost(data.slug, { provider, model }),
    onSuccess: (r) => {
      setCaption(r.caption);
      if (r.hashtags.length) setHashtags(r.hashtags.slice(0, MAX_HASHTAGS));
    },
  });

  const addTag = (raw: string) => {
    const clean = raw.replace(/^#/, "").trim().replace(/\s+/g, "").toLowerCase();
    if (!clean || hashtags.includes(clean) || hashtags.length >= MAX_HASHTAGS) return;
    setHashtags([...hashtags, clean]);
  };
  const fullCaption = caption
    ? `${caption}\n\n${hashtags.map((h) => `#${h}`).join(" ")}`.trim()
    : hashtags.map((h) => `#${h}`).join(" ");

  const copyAll = () => {
    navigator.clipboard.writeText(fullCaption).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <StepCard
      icon={<Send className="size-3.5" />}
      title="Đăng bài fanpage"
      subtitle="Caption + hashtag để dán lên fanpage app"
      right={
        <Button variant="outline" size="sm" className="gap-1" onClick={copyAll} disabled={!fullCaption}>
          {copied ? <Check className="size-3.5 text-accent" /> : <Copy className="size-3.5" />}
          {copied ? "Đã copy" : "Copy tất cả"}
        </Button>
      }
    >
      <div className="space-y-4 p-4">
        <div>
          <div className="mb-1 flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Caption</span>
            <span className="text-xs tabular-nums text-muted-foreground">{caption.length} ký tự</span>
          </div>
          <Textarea
            rows={5}
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            placeholder="Dòng 1 = tiêu đề, dòng 2 = hook… hoặc bấm 'AI gen' bên dưới."
            className="text-sm leading-relaxed"
          />
          {aiGen.isError && (
            <p className="mt-1 text-xs text-destructive">AI gen lỗi: {String(aiGen.error)}</p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <select
              value={provider}
              onChange={(e) => setProvider(e.target.value as LLMProvider)}
              className="h-8 rounded-md border border-input bg-background px-2 text-xs"
            >
              <option value="openai" disabled={!modelsQ.data?.openai.length}>OpenAI</option>
              <option value="ollama" disabled={!modelsQ.data?.ollama.length}>Ollama</option>
            </select>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="h-8 max-w-[180px] rounded-md border border-input bg-background px-2 text-xs"
            >
              {(modelsQ.data?.[provider] ?? []).map((m) => (
                <option key={m.id} value={m.id}>{m.label}</option>
              ))}
            </select>
            <Button
              variant="outline"
              size="sm"
              className="gap-1"
              disabled={aiGen.isPending || !data.title}
              onClick={() => aiGen.mutate()}
            >
              {aiGen.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
              AI gen
            </Button>
          </div>
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between">
            <span className="flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <Hash className="size-3" /> Hashtags
            </span>
            <span className="text-xs tabular-nums text-muted-foreground">{hashtags.length}/{MAX_HASHTAGS}</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {hashtags.map((h) => (
              <Badge key={h} variant="secondary" className="gap-1 py-1 pl-2 pr-1 text-sm">
                #{h}
                <button
                  onClick={() => setHashtags(hashtags.filter((x) => x !== h))}
                  className="rounded p-0.5 hover:text-destructive"
                >
                  <XIcon className="size-3" />
                </button>
              </Badge>
            ))}
          </div>
          <div className="mt-2 flex gap-2">
            <Input
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === ",") {
                  e.preventDefault();
                  addTag(tagInput);
                  setTagInput("");
                }
              }}
              placeholder={
                hashtags.length >= MAX_HASHTAGS ? `Đủ ${MAX_HASHTAGS} — xoá bớt để thêm` : "Thêm hashtag (Enter)…"
              }
              disabled={hashtags.length >= MAX_HASHTAGS}
              className="h-9 text-sm"
            />
            <Button
              variant="outline"
              size="sm"
              className="shrink-0"
              disabled={!tagInput.trim() || hashtags.length >= MAX_HASHTAGS}
              onClick={() => { addTag(tagInput); setTagInput(""); }}
            >
              <Plus className="size-3.5" />
            </Button>
          </div>
          {hashtags.length < MAX_HASHTAGS && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {SUGGESTED_HASHTAGS.filter((h) => !hashtags.includes(h)).map((h) => (
                <button
                  key={h}
                  onClick={() => addTag(h)}
                  className="rounded border border-dashed px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                >
                  + #{h}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </StepCard>
  );
}
