/**
 * /prompts — quản lý system prompts. List tất cả prompts trong app, cho
 * phép user expand từng cái để xem default + sửa override + reset về
 * default. Override lưu vào DB qua API.
 *
 * Resolution của LLM:
 *   1. Per-call override (vd brainstorm tab có textarea riêng) — wins
 *   2. DB override (saved here) — fallback
 *   3. Default constant trong code — final fallback
 */
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Settings2,
  ChevronDown,
  AlertCircle,
  Loader2,
  Check,
  RotateCcw,
  Save,
} from "lucide-react";
import { api, type PromptMeta } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export function PromptsPage() {
  const promptsQ = useQuery({
    queryKey: ["prompts"],
    queryFn: () => api.listPrompts(),
  });

  return (
    <div className="container max-w-5xl py-10">
      <header className="mb-6">
        <h1 className="text-3xl font-serif tracking-tight flex items-center gap-3">
          <Settings2 className="size-7 text-accent" />
          System prompts
        </h1>
        <p className="mt-1 text-muted-foreground text-sm">
          Quản lý system prompts của LLM. Sửa để A/B test phong cách output mà
          không phải đụng code. Empty hoặc identical default → tự reset về
          default.
        </p>
      </header>

      {promptsQ.isLoading && (
        <Card className="h-64 animate-pulse bg-muted/30" />
      )}
      {promptsQ.isError && (
        <Card className="border-destructive/40 bg-destructive/5 p-6">
          <div className="flex items-center gap-2 font-medium text-destructive">
            <AlertCircle className="size-5" />
            Không load được danh sách prompts
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            {String(promptsQ.error)}
          </p>
        </Card>
      )}

      {promptsQ.data && (
        <div className="space-y-3">
          {promptsQ.data.prompts.map((p) => (
            <PromptCard key={p.key} prompt={p} />
          ))}
        </div>
      )}
    </div>
  );
}

function PromptCard({ prompt }: { prompt: PromptMeta }) {
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  // Local editor state — initialize từ override (nếu có) hoặc default
  const [value, setValue] = useState(prompt.override ?? prompt.defaultValue);
  const [dirty, setDirty] = useState(false);

  // Sync khi prompt từ server thay đổi (sau save)
  useEffect(() => {
    if (!dirty) {
      setValue(prompt.override ?? prompt.defaultValue);
    }
  }, [prompt.override, prompt.defaultValue, dirty]);

  const saveMut = useMutation({
    mutationFn: () => api.savePromptOverride(prompt.key, value),
    onSuccess: (updated) => {
      qc.setQueryData<{ prompts: PromptMeta[] }>(["prompts"], (prev) =>
        prev
          ? {
              prompts: prev.prompts.map((p) =>
                p.key === updated.key ? updated : p,
              ),
            }
          : prev,
      );
      setDirty(false);
    },
  });

  const resetMut = useMutation({
    mutationFn: () => api.resetPromptOverride(prompt.key),
    onSuccess: (updated) => {
      qc.setQueryData<{ prompts: PromptMeta[] }>(["prompts"], (prev) =>
        prev
          ? {
              prompts: prev.prompts.map((p) =>
                p.key === updated.key ? updated : p,
              ),
            }
          : prev,
      );
      setDirty(false);
    },
  });

  const isOverriding = prompt.override !== null;
  const charCount = value.length;
  const lineCount = value.split("\n").length;

  return (
    <Card className="p-0 overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full px-5 py-3 border-b bg-secondary/30 hover:bg-secondary/50 transition-colors flex items-center gap-2 text-left"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium">{prompt.label}</span>
            <code className="text-[10px] font-mono text-muted-foreground bg-secondary px-1.5 py-0.5 rounded">
              {prompt.key}
            </code>
            {isOverriding && (
              <Badge
                variant="outline"
                className="text-[10px] bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30"
              >
                đã sửa
              </Badge>
            )}
          </div>
          <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
            {prompt.description}
          </p>
        </div>
        <ChevronDown
          className={cn(
            "size-4 text-muted-foreground shrink-0 transition-transform",
            expanded && "rotate-180",
          )}
        />
      </button>

      {expanded && (
        <div className="px-5 py-4 space-y-3">
          <Textarea
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setDirty(true);
            }}
            rows={Math.min(30, Math.max(10, lineCount + 1))}
            className="font-mono text-xs leading-relaxed"
            placeholder="System prompt sẽ inject vào LLM…"
          />
          <p className="text-[10px] text-muted-foreground">
            <span className="font-mono">{charCount.toLocaleString("vi-VN")}</span> ký tự,{" "}
            <span className="font-mono">{lineCount}</span> dòng · used by:{" "}
            <code className="font-mono">{prompt.usedBy}</code>
          </p>

          {saveMut.isError && (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive flex items-start gap-2">
              <AlertCircle className="size-3.5 mt-0.5 shrink-0" />
              <span>{String(saveMut.error)}</span>
            </div>
          )}
          {resetMut.isError && (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive flex items-start gap-2">
              <AlertCircle className="size-3.5 mt-0.5 shrink-0" />
              <span>{String(resetMut.error)}</span>
            </div>
          )}

          {/* Footer actions — căn phải */}
          <div className="pt-3 border-t flex items-center justify-end gap-2">
            {prompt.updatedAt && (
              <span className="text-[10px] text-muted-foreground mr-auto">
                Sửa lần cuối: {new Date(prompt.updatedAt).toLocaleString("vi-VN")}
              </span>
            )}
            {dirty && (
              <span className="text-xs text-amber-600 dark:text-amber-400 mr-2">
                Có thay đổi chưa lưu
              </span>
            )}
            {isOverriding && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  if (
                    window.confirm(
                      "Reset prompt này về default trong code? Sẽ xoá override hiện tại.",
                    )
                  ) {
                    resetMut.mutate();
                  }
                }}
                disabled={resetMut.isPending || saveMut.isPending}
                title="Xoá override → về default trong code"
              >
                {resetMut.isPending ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <RotateCcw className="size-3.5" />
                )}
                Reset default
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={() => saveMut.mutate()}
              disabled={!dirty || saveMut.isPending || resetMut.isPending}
            >
              {saveMut.isPending ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : saveMut.isSuccess && !dirty ? (
                <Check className="size-3.5 text-accent" />
              ) : (
                <Save className="size-3.5" />
              )}
              Lưu override
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
