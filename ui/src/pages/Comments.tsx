/**
 * Comments page — quản lý & trả lời comment Facebook Page.
 * Route: /comments
 *
 * Thu thập comment cần trả lời → AI gợi ý câu trả lời theo ngữ cảnh bài post →
 * user sửa/duyệt → Approve đăng rep lên FB. Không tự động đăng.
 */
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  MessageSquare,
  RefreshCw,
  Sparkles,
  Send,
  X as XIcon,
  Loader2,
  ExternalLink,
  CheckCircle2,
  ThumbsUp,
  ChevronLeft,
  ChevronRight,
  Trash2,
  RotateCcw,
} from "lucide-react";
import {
  api,
  commentsApi,
  type FbCommentRow,
  type LLMProvider,
} from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const STATUS_TABS: Array<{ value: string; label: string }> = [
  { value: "pending", label: "Chờ trả lời" },
  { value: "replied", label: "Đã trả lời" },
  { value: "liked", label: "Đã like 👍" },
  { value: "skipped", label: "Bỏ qua" },
  { value: "all", label: "Tất cả" },
];

const PAGE_SIZE = 20;

const fmtTime = (t: string | null) => {
  if (!t) return "";
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString("vi-VN");
};

export function CommentsPage() {
  const qc = useQueryClient();
  const [status, setStatus] = useState("pending");
  const [typeFilter, setTypeFilter] = useState(""); // "" | text | sticker
  const [page, setPage] = useState(0);

  const modelsQ = useQuery({
    queryKey: ["llm-models"],
    queryFn: () => api.listLLMModels(),
    staleTime: 60_000,
  });
  const [provider, setProvider] = useState<LLMProvider>("openai");
  const [model, setModel] = useState("gpt-4o-mini");

  const listQ = useQuery({
    queryKey: ["fb-comments", status, typeFilter, page],
    queryFn: () =>
      commentsApi.list(
        status === "all" ? undefined : status,
        typeFilter || undefined,
        PAGE_SIZE,
        page * PAGE_SIZE,
      ),
  });

  const collectMut = useMutation({
    mutationFn: () => commentsApi.collect(25),
    onSuccess: () => {
      setPage(0);
      qc.invalidateQueries({ queryKey: ["fb-comments"] });
    },
  });

  const comments = listQ.data?.comments ?? [];
  const total = listQ.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const changeStatus = (v: string) => {
    setStatus(v);
    setPage(0);
  };

  // Batch: gom các comment "chờ trả lời" đang hiển thị → 1 request LLM.
  const pendingIds = comments
    .filter((c) => c.status === "pending")
    .map((c) => c.comment_id);
  const batchMut = useMutation({
    mutationFn: () => commentsApi.generateBatch({ provider, model, commentIds: pendingIds }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["fb-comments"] }),
  });
  const cleanupMut = useMutation({
    mutationFn: () => commentsApi.cleanupMedia(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["fb-comments"] }),
  });
  const likeStickersMut = useMutation({
    mutationFn: () => commentsApi.likeStickers(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["fb-comments"] }),
  });
  const skipStickersMut = useMutation({
    mutationFn: () => commentsApi.skipLikedStickers(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["fb-comments"] }),
  });

  return (
    <div className="container max-w-3xl py-10">
      <header className="mb-6">
        <h1 className="text-3xl font-serif tracking-tight flex items-center gap-3">
          <MessageSquare className="size-7 text-accent" />
          Trả lời comment
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Thu thập comment trên Page → AI gợi ý câu trả lời theo ngữ cảnh bài →
          bạn sửa &amp; bấm Approve để đăng. Chỉ đăng khi bạn duyệt.
        </p>
      </header>

      {/* Toolbar — hàng 1: hành động chính + AI */}
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <Button
          onClick={() => collectMut.mutate()}
          disabled={collectMut.isPending}
          className="gap-1.5"
        >
          {collectMut.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <RefreshCw className="size-4" />
          )}
          Thu thập
        </Button>
        <Button
          variant="outline"
          onClick={() => batchMut.mutate()}
          disabled={batchMut.isPending || pendingIds.length === 0}
          className="gap-1.5"
          title="Gom tất cả comment chờ trả lời trên trang này → 1 request AI (tiết kiệm chi phí)"
        >
          {batchMut.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Sparkles className="size-4" />
          )}
          AI gợi ý tất cả ({pendingIds.length})
        </Button>
        <div className="ml-auto flex items-center gap-1.5 text-xs">
          <span className="text-muted-foreground">AI:</span>
          <select
            value={provider}
            onChange={(e) => setProvider(e.target.value as LLMProvider)}
            className="h-8 rounded-md border border-input bg-background px-2"
          >
            <option value="openai" disabled={!modelsQ.data?.openai.length}>OpenAI</option>
            <option value="ollama" disabled={!modelsQ.data?.ollama.length}>Ollama</option>
          </select>
          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="h-8 max-w-[160px] rounded-md border border-input bg-background px-2"
          >
            {(modelsQ.data?.[provider] ?? []).map((m) => (
              <option key={m.id} value={m.id}>{m.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Toolbar — hàng 2: thao tác hàng loạt nhãn dán + dọn ảnh */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">Nhãn dán/GIF/emoji:</span>
        <Button
          variant="outline"
          size="sm"
          onClick={() => likeStickersMut.mutate()}
          disabled={likeStickersMut.isPending}
          className="gap-1.5"
          title="Thả like 👍 cho tất cả comment nhãn dán/GIF/emoji chưa like"
        >
          {likeStickersMut.isPending ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <ThumbsUp className="size-3.5" />
          )}
          Like tất cả
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => skipStickersMut.mutate()}
          disabled={skipStickersMut.isPending}
          className="gap-1.5 text-muted-foreground"
          title="Bỏ qua (đóng) tất cả comment nhãn dán/GIF/emoji đã like"
        >
          {skipStickersMut.isPending ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <XIcon className="size-3.5" />
          )}
          Bỏ qua đã like
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            if (window.confirm("Xoá toàn bộ ảnh/sticker đã tải về (input/fb-comment-media)?"))
              cleanupMut.mutate();
          }}
          disabled={cleanupMut.isPending}
          className="ml-auto gap-1.5 text-destructive hover:bg-destructive/10 hover:text-destructive"
          title="Xoá ảnh/sticker đã tải để dọn ổ đĩa"
        >
          {cleanupMut.isPending ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Trash2 className="size-3.5" />
          )}
          Dọn ảnh
        </Button>
      </div>

      {collectMut.isError && (
        <p className="mb-3 text-sm text-destructive">
          Thu thập lỗi: {String(collectMut.error)}
        </p>
      )}
      {collectMut.isSuccess && !collectMut.isPending && (
        <p className="mb-3 text-sm text-muted-foreground">
          Trang <strong>{collectMut.data.pageName}</strong>: lấy{" "}
          {collectMut.data.fetched} comment cần trả lời ({collectMut.data.added} mới).
        </p>
      )}
      {batchMut.isError && (
        <p className="mb-3 text-sm text-destructive">AI gợi ý lỗi: {String(batchMut.error)}</p>
      )}
      {batchMut.isSuccess && !batchMut.isPending && (
        <p className="mb-3 text-sm text-muted-foreground">
          Đã gợi ý {batchMut.data.saved}/{batchMut.data.requested} comment trong 1 request.
        </p>
      )}
      {likeStickersMut.isError && (
        <p className="mb-3 text-sm text-destructive">Like nhãn dán lỗi: {String(likeStickersMut.error)}</p>
      )}
      {likeStickersMut.isSuccess && !likeStickersMut.isPending && (
        <p className="mb-3 text-sm text-muted-foreground">
          Đã like {likeStickersMut.data.liked} comment nhãn dán/GIF/emoji
          {likeStickersMut.data.failed ? ` (${likeStickersMut.data.failed} lỗi)` : ""}.
        </p>
      )}
      {skipStickersMut.isSuccess && !skipStickersMut.isPending && (
        <p className="mb-3 text-sm text-muted-foreground">
          Đã bỏ qua {skipStickersMut.data.skipped} comment nhãn dán/GIF/emoji đã like.
        </p>
      )}

      {/* Status tabs + lọc loại */}
      <div className="mb-4 flex flex-wrap items-center gap-2 border-b">
        <div className="flex flex-wrap gap-1">
          {STATUS_TABS.map((t) => (
            <button
              key={t.value}
              onClick={() => changeStatus(t.value)}
              className={cn(
                "px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
                status === t.value
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
        <select
          value={typeFilter}
          onChange={(e) => {
            setTypeFilter(e.target.value);
            setPage(0);
          }}
          className="ml-auto mb-1 h-8 rounded-md border border-input bg-background px-2 text-xs"
          title="Lọc theo loại comment"
        >
          <option value="">Mọi loại</option>
          <option value="text">Text</option>
          <option value="emoji">Emoji</option>
          <option value="sticker">Nhãn dán</option>
          <option value="gif">GIF/ảnh động</option>
          <option value="photo">Ảnh</option>
          <option value="video">Video</option>
        </select>
      </div>

      {listQ.isLoading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Đang tải…
        </div>
      )}
      {!listQ.isLoading && comments.length === 0 && (
        <Card className="p-6 text-sm text-muted-foreground text-center">
          Chưa có comment. Bấm <strong>Thu thập comment</strong> để lấy từ Page.
        </Card>
      )}

      <div className="space-y-3">
        {comments.map((c) => (
          <CommentCard key={c.comment_id} c={c} provider={provider} model={model} />
        ))}
      </div>

      {/* Phân trang */}
      {total > PAGE_SIZE && (
        <div className="mt-4 flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} / {total}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-1"
              disabled={page <= 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              <ChevronLeft className="size-4" /> Trước
            </Button>
            <span className="tabular-nums text-muted-foreground">
              {page + 1}/{totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              className="gap-1"
              disabled={page + 1 >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Sau <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function CommentCard({
  c,
  provider,
  model,
}: {
  c: FbCommentRow;
  provider: LLMProvider;
  model: string;
}) {
  const qc = useQueryClient();
  const [reply, setReply] = useState(c.suggested_reply ?? "");
  const seen = useRef(c.comment_id);
  const lastServer = useRef(c.suggested_reply ?? "");
  useEffect(() => {
    if (seen.current !== c.comment_id) {
      seen.current = c.comment_id;
      lastServer.current = c.suggested_reply ?? "";
      setReply(c.suggested_reply ?? "");
      return;
    }
    // Cùng comment nhưng server có gợi ý mới (vd batch gen) → nhận nếu user chưa sửa.
    const incoming = c.suggested_reply ?? "";
    if (incoming !== lastServer.current) {
      setReply((cur) => (cur === lastServer.current ? incoming : cur));
      lastServer.current = incoming;
    }
  }, [c.comment_id, c.suggested_reply]);

  const genMut = useMutation({
    mutationFn: () => commentsApi.generate(c.comment_id, { provider, model }),
    onSuccess: (r) => setReply(r.reply),
  });
  const replyMut = useMutation({
    mutationFn: () => commentsApi.reply(c.comment_id, reply),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["fb-comments"] }),
  });
  const skipMut = useMutation({
    mutationFn: () => commentsApi.skip(c.comment_id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["fb-comments"] }),
  });
  const likeMut = useMutation({
    mutationFn: () => (c.reacted_at ? commentsApi.unlike(c.comment_id) : commentsApi.like(c.comment_id)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["fb-comments"] }),
  });
  const reopenMut = useMutation({
    mutationFn: () => commentsApi.reopen(c.comment_id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["fb-comments"] }),
  });

  const saveDraft = () => {
    if (reply !== (c.suggested_reply ?? "")) {
      commentsApi.saveDraft(c.comment_id, reply).catch(() => {});
    }
  };

  const done = c.status === "replied";
  const skipped = c.status === "skipped";
  const reacted = !!c.reacted_at; // đã thả like (độc lập trạng thái)
  const closed = done || skipped; // like KHÔNG đóng comment → vẫn reply được
  const media = c.media_local ? commentsApi.mediaUrl(c.media_local) : c.media_url || "";

  return (
    <Card className={cn("p-0 overflow-hidden", closed && "opacity-80")}>
      {/* Post context */}
      <div className="px-4 py-2 border-b bg-secondary/30 flex items-start gap-2 text-xs text-muted-foreground">
        <span className="line-clamp-2 flex-1" title={c.post_excerpt ?? ""}>
          Bài: {c.post_excerpt || "(không rõ)"}
        </span>
        {c.post_permalink && (
          <a
            href={c.post_permalink}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-0.5 text-accent hover:underline shrink-0"
          >
            Mở bài <ExternalLink className="size-3" />
          </a>
        )}
      </div>

      <div className="p-4 space-y-3">
        {/* Comment */}
        <div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
            <span className="font-medium text-foreground">{c.from_name}</span>
            <span>{fmtTime(c.created_time)}</span>
            <div className="ml-auto flex items-center gap-1.5">
              {reacted && (
                <Badge variant="outline" className="gap-1 border-blue-500/40 text-blue-700 dark:text-blue-400 bg-blue-500/5">
                  <ThumbsUp className="size-3" /> Đã thích
                </Badge>
              )}
              {done && (
                <Badge variant="outline" className="gap-1 border-emerald-500/40 text-emerald-700 dark:text-emerald-400 bg-emerald-500/5">
                  <CheckCircle2 className="size-3" /> Đã trả lời
                </Badge>
              )}
              {skipped && <Badge variant="outline">Đã bỏ qua</Badge>}
            </div>
          </div>
          <div className="rounded-md bg-foreground/5 p-3 space-y-2">
            <p className="text-sm leading-relaxed whitespace-pre-wrap">
              {c.message || "(không có nội dung)"}
            </p>
            {media &&
              (c.attachment_type?.includes("video") ? (
                <video src={media} controls className="max-h-40 rounded" />
              ) : (
                <img
                  src={media}
                  alt={c.attachment_type ?? "ảnh"}
                  className="max-h-32 rounded object-contain"
                  loading="lazy"
                />
              ))}
          </div>
        </div>

        {/* Reply */}
        {!closed && (
          <div>
            <Textarea
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              onBlur={saveDraft}
              rows={3}
              placeholder="Câu trả lời… bấm 'AI gợi ý' hoặc tự viết."
              className="text-sm leading-relaxed"
            />
            {genMut.isError && (
              <p className="mt-1 text-xs text-destructive">AI lỗi: {String(genMut.error)}</p>
            )}
            {replyMut.isError && (
              <p className="mt-1 text-xs text-destructive">Đăng lỗi: {String(replyMut.error)}</p>
            )}
            {likeMut.isError && (
              <p className="mt-1 text-xs text-destructive">Like lỗi: {String(likeMut.error)}</p>
            )}
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="gap-1"
                disabled={genMut.isPending}
                onClick={() => genMut.mutate()}
              >
                {genMut.isPending ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Sparkles className="size-3.5" />
                )}
                AI gợi ý
              </Button>
              <div className="ml-auto flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className={cn("gap-1", reacted && "border-blue-500/40 text-blue-600 dark:text-blue-400")}
                  disabled={likeMut.isPending}
                  onClick={() => likeMut.mutate()}
                  title={reacted ? "Bỏ like" : "Thả like 👍 (API FB không set được tim/love)"}
                >
                  {likeMut.isPending ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <ThumbsUp className={cn("size-3.5", reacted && "fill-current")} />
                  )}
                  {reacted ? "Đã thích" : "Thả like"}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1 text-muted-foreground"
                  disabled={skipMut.isPending}
                  onClick={() => skipMut.mutate()}
                >
                  <XIcon className="size-3.5" /> Bỏ qua
                </Button>
                <Button
                  size="sm"
                  className="gap-1.5"
                  disabled={replyMut.isPending || !reply.trim()}
                  onClick={() => replyMut.mutate()}
                >
                  {replyMut.isPending ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Send className="size-3.5" />
                  )}
                  Approve &amp; trả lời
                </Button>
              </div>
            </div>
          </div>
        )}

        {done && c.suggested_reply && (
          <div className="text-sm">
            <div className="text-xs text-muted-foreground mb-1">Đã trả lời:</div>
            <p className="whitespace-pre-wrap rounded-md border border-accent/30 bg-accent/5 p-3">
              {c.suggested_reply}
            </p>
          </div>
        )}

        {/* Đưa về chờ trả lời (khi lỡ bỏ qua) */}
        {skipped && (
          <div className="flex justify-end">
            <Button
              variant="outline"
              size="sm"
              className="gap-1"
              disabled={reopenMut.isPending}
              onClick={() => reopenMut.mutate()}
              title="Chuyển lại về 'Chờ trả lời'"
            >
              {reopenMut.isPending ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <RotateCcw className="size-3.5" />
              )}
              Đưa về chờ trả lời
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}
