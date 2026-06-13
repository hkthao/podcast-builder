import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  Search,
  X as XIcon,
  ExternalLink,
  Trash2,
  Loader2,
  Library as LibraryIcon,
  Sparkles,
  AlertCircle,
  FileDown,
} from "lucide-react";
import {
  api,
  type Reference,
  type ReferenceType,
} from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const TYPES: ReferenceType[] = [
  "pdf",
  "article",
  "video",
  "book",
  "podcast",
  "other",
];

export function ReferenceList() {
  const [q, setQ] = useState("");
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [activeType, setActiveType] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);

  const filtersQ = useQuery({
    queryKey: ["references", { q, tag: activeTag, type: activeType }],
    queryFn: () =>
      api.listReferences({
        q: q || undefined,
        tag: activeTag ?? undefined,
        type: activeType ?? undefined,
      }),
  });

  const tagsQ = useQuery({
    queryKey: ["reference-tags"],
    queryFn: () => api.listTags(),
  });

  return (
    <div className="container max-w-6xl py-10">
      <header className="mb-6 flex items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-serif tracking-tight">References</h1>
          <p className="mt-1 text-muted-foreground text-sm">
            {filtersQ.data?.items.length ?? 0} tài liệu —
            chỉ lưu metadata, KHÔNG download. Click "Open" để mở browser.
          </p>
        </div>
        <Button onClick={() => setShowAddForm((v) => !v)}>
          {showAddForm ? <XIcon className="size-4" /> : <Plus className="size-4" />}
          {showAddForm ? "Đóng form" : "Thêm reference"}
        </Button>
      </header>

      {showAddForm && (
        <AddReferenceForm onSuccess={() => setShowAddForm(false)} />
      )}

      <div className="mb-4 flex items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            placeholder="Tìm theo title, author, URL, notes…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="pl-10"
          />
        </div>
        <select
          value={activeType ?? ""}
          onChange={(e) => setActiveType(e.target.value || null)}
          className="h-12 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <option value="">Tất cả loại</option>
          {TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>

      {tagsQ.data && tagsQ.data.tags.length > 0 && (
        <div className="mb-6 flex items-center gap-2 flex-wrap">
          <span className="text-xs text-muted-foreground uppercase tracking-wider">
            Tags:
          </span>
          <button
            onClick={() => setActiveTag(null)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs transition-colors",
              !activeTag
                ? "bg-primary text-primary-foreground border-primary"
                : "hover:bg-secondary",
            )}
          >
            Tất cả
          </button>
          {tagsQ.data.tags.map((t) => (
            <button
              key={t.tag}
              onClick={() =>
                setActiveTag(t.tag === activeTag ? null : t.tag)
              }
              className={cn(
                "rounded-full border px-3 py-1 text-xs transition-colors",
                activeTag === t.tag
                  ? "bg-primary text-primary-foreground border-primary"
                  : "hover:bg-secondary",
              )}
            >
              {t.tag} <span className="opacity-70">({t.count})</span>
            </button>
          ))}
        </div>
      )}

      {filtersQ.isLoading && (
        <Card className="h-64 animate-pulse bg-muted/30" />
      )}

      {filtersQ.data && filtersQ.data.items.length === 0 && (
        <Card className="p-12 text-center border-dashed">
          <LibraryIcon className="mx-auto mb-3 size-10 text-muted-foreground" />
          <p className="font-medium">Chưa có reference</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Click "Thêm reference" để add. Hoặc xoá filter để xem tất cả.
          </p>
        </Card>
      )}

      {filtersQ.data && filtersQ.data.items.length > 0 && (
        <div className="space-y-2">
          {filtersQ.data.items.map((r) => (
            <ReferenceRow key={r.id} ref={r} />
          ))}
        </div>
      )}
    </div>
  );
}

function AddReferenceForm({ onSuccess }: { onSuccess: () => void }) {
  const qc = useQueryClient();
  const [url, setUrl] = useState("");
  const [pdfUrl, setPdfUrl] = useState("");
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [type, setType] = useState<ReferenceType>("article");
  const [tagsInput, setTagsInput] = useState("");
  const [notes, setNotes] = useState("");
  const [scrapeStatus, setScrapeStatus] = useState<
    "idle" | "scraping" | "done" | "error"
  >("idle");
  const [error, setError] = useState<string | null>(null);

  const scrapeMutation = useMutation({
    mutationFn: (u: string) => api.scrapeReference(u),
  });

  const addMutation = useMutation({
    mutationFn: () =>
      api.addReference({
        url: url.trim(),
        pdfUrl: pdfUrl.trim() || null,
        title: title.trim(),
        author: author.trim() || null,
        type,
        source: "",
        tags: tagsInput
          .split(/[,\s]+/)
          .map((t) => t.trim())
          .filter(Boolean),
        notes: notes.trim(),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["references"] });
      qc.invalidateQueries({ queryKey: ["reference-tags"] });
      setError(null);
      onSuccess();
    },
    onError: (e) => setError(String(e)),
  });

  const onScrape = async () => {
    if (!url.trim()) return;
    setScrapeStatus("scraping");
    try {
      const meta = await scrapeMutation.mutateAsync(url.trim());
      setTitle(meta.title);
      if (meta.author) setAuthor(meta.author);
      if (meta.pdfUrl) setPdfUrl(meta.pdfUrl);
      // Auto-set type=pdf nếu có pdfUrl
      if (meta.pdfUrl) setType("pdf");
      setScrapeStatus("done");
      setTimeout(() => setScrapeStatus("idle"), 2000);
    } catch (e) {
      setScrapeStatus("error");
      setError(`Scrape fail: ${e}`);
    }
  };

  return (
    <Card className="p-6 mb-6 border-primary/40">
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label>URL</Label>
          <div className="flex gap-2">
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://arxiv.org/abs/... hoặc https://..."
              autoFocus
            />
            <Button
              variant="outline"
              onClick={onScrape}
              disabled={!url.trim() || scrapeStatus === "scraping"}
            >
              {scrapeStatus === "scraping" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Sparkles className="size-4" />
              )}
              Auto-fetch
            </Button>
          </div>
          {scrapeStatus === "done" && (
            <p className="text-xs text-accent">
              ✓ Đã fetch title từ trang
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label>
            PDF URL <span className="text-muted-foreground font-normal">(optional)</span>
          </Label>
          <Input
            value={pdfUrl}
            onChange={(e) => setPdfUrl(e.target.value)}
            placeholder="https://...pdf (link direct, tách khỏi URL trang chính)"
          />
          <p className="text-xs text-muted-foreground">
            Vd: arxiv URL = https://arxiv.org/abs/2401.12345, PDF URL =
            https://arxiv.org/pdf/2401.12345.pdf. "Auto-fetch" sẽ tự suy đoán
            cho arXiv.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Title</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Tên tài liệu"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Author</Label>
            <Input
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              placeholder="Tác giả (optional)"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Type</Label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as ReferenceType)}
              className="flex h-12 w-full rounded-md border border-input bg-background px-3 text-base"
            >
              {TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Tags (phân cách bằng space hoặc dấu phẩy)</Label>
          <Input
            value={tagsInput}
            onChange={(e) => setTagsInput(e.target.value)}
            placeholder="triet-hoc, xa-hoi, burnout"
          />
        </div>

        <div className="space-y-1.5">
          <Label>Notes</Label>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Ghi chú riêng — vd: 'Chapter 3 nói về self-exploitation'"
            rows={2}
          />
        </div>

        {error && (
          <div className="rounded-md bg-destructive/10 border border-destructive/40 p-3 text-sm text-destructive">
            <AlertCircle className="inline size-4 mr-1" />
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onSuccess}>
            Hủy
          </Button>
          <Button
            onClick={() => addMutation.mutate()}
            disabled={
              !url.trim() || !title.trim() || addMutation.isPending
            }
          >
            {addMutation.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Plus className="size-4" />
            )}
            Thêm vào library
          </Button>
        </div>
      </div>
    </Card>
  );
}

function ReferenceRow({ ref }: { ref: Reference }) {
  const qc = useQueryClient();
  const deleteMutation = useMutation({
    mutationFn: () => api.deleteReference(ref.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["references"] });
      qc.invalidateQueries({ queryKey: ["reference-tags"] });
    },
  });

  return (
    <Card className="p-4 flex items-start gap-4 hover:bg-secondary/20 transition-colors">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          <Badge variant="outline" className="font-mono uppercase">
            {ref.type}
          </Badge>
          {ref.source !== "web" && (
            <Badge variant="secondary">{ref.source}</Badge>
          )}
          {ref.tags.map((t) => (
            <Badge key={t} variant="default" className="text-xs">
              {t}
            </Badge>
          ))}
        </div>
        <h3 className="font-serif text-lg leading-tight mb-1">
          {ref.title}
        </h3>
        {ref.author && (
          <p className="text-sm text-muted-foreground">{ref.author}</p>
        )}
        <p className="text-xs text-muted-foreground font-mono truncate mt-1">
          {ref.url}
        </p>
        {ref.pdfUrl && ref.pdfUrl !== ref.url && (
          <p className="text-xs text-accent font-mono truncate mt-0.5">
            PDF: {ref.pdfUrl}
          </p>
        )}
        {ref.notes && (
          <p className="text-sm mt-2 italic text-muted-foreground">
            {ref.notes}
          </p>
        )}
        {ref.usedInEpisodes.length > 0 && (
          <div className="mt-2 flex items-center gap-1 text-xs text-muted-foreground flex-wrap">
            Dùng trong:
            {ref.usedInEpisodes.map((ep) => (
              <Badge key={ep} variant="outline" className="text-xs">
                {ep}
              </Badge>
            ))}
          </div>
        )}
      </div>
      <div className="flex flex-col gap-1 shrink-0">
        <Button variant="outline" size="sm" asChild>
          <a href={ref.url} target="_blank" rel="noreferrer noopener">
            <ExternalLink className="size-3.5" />
            Open page
          </a>
        </Button>
        {ref.pdfUrl && (
          <Button variant="outline" size="sm" asChild>
            <a
              href={ref.pdfUrl}
              target="_blank"
              rel="noreferrer noopener"
              download
            >
              <FileDown className="size-3.5" />
              Open PDF
            </a>
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            if (
              confirm(
                `Xoá "${ref.title}" khỏi library?\n(URL vẫn copy được trước khi xoá)`,
              )
            ) {
              deleteMutation.mutate();
            }
          }}
          disabled={deleteMutation.isPending}
          className="text-destructive hover:bg-destructive/10"
        >
          <Trash2 className="size-3.5" />
        </Button>
      </div>
    </Card>
  );
}
