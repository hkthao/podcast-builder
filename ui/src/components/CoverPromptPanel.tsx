import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, Check, Copy, Image as ImageIcon, Loader2, Sparkles, Wand2 } from "lucide-react";
import { api, type EpisodeSummary, type VideoFormat } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

/**
 * Gen prompt Midjourney/Flux/DALL-E tạo ảnh cover theo khung — nằm trong tab
 * tương ứng của RenderTab: "vertical" = cover Reels 9:16, "landscape" =
 * thumbnail YouTube 16:9 (system prompt riêng "podcast.cover-prompt-yt").
 */
export function CoverPromptPanel({
  ep,
  variant,
}: {
  ep: EpisodeSummary;
  /** "landscape" = thumbnail YouTube 16:9 (prompt riêng, giữ màu chủ đề của tập). */
  variant: VideoFormat;
}) {
  const modelsQ = useQuery({
    queryKey: ["llm-models"],
    queryFn: () => api.listLLMModels(),
    staleTime: 60_000,
  });
  const [provider, setProvider] = useState<"openai" | "ollama">("openai");
  const [model, setModel] = useState<string>("gpt-4o");
  // Prompt đã lưu trong config (Claude Code viết qua cover-prompt.ts — miễn phí).
  const field = variant === "landscape" ? "coverPromptLandscape" : "coverPrompt";
  const saved = ep.config[field] ?? "";
  const [generated, setGenerated] = useState<string>(saved);
  const [themeColor, setThemeColor] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showOpenAI, setShowOpenAI] = useState(false);
  const qc = useQueryClient();
  // Claude ghi prompt mới vào config (fs watcher → ep đổi) → hiện ngay.
  useEffect(() => {
    setGenerated(saved);
  }, [saved]);
  const savePromptMut = useMutation({
    mutationFn: (text: string) =>
      api.saveEpisodeConfig(ep.name, { ...ep.config, [field]: text.trim() || null }),
    onSuccess: (updated) => {
      qc.setQueryData(["episode", ep.name], updated);
    },
  });
  const cliFlag = variant === "landscape" ? " --landscape" : "";
  const applyAccentMut = useMutation({
    mutationFn: (hex: string) =>
      api.saveEpisodeConfig(ep.name, { ...ep.config, accentColor: hex }),
    onSuccess: (updated) => {
      qc.setQueryData(["episode", ep.name], updated);
      qc.invalidateQueries({ queryKey: ["episodes"] });
    },
  });

  useEffect(() => {
    const list = modelsQ.data?.[provider] ?? [];
    if (list.length > 0 && !list.some((m) => m.id === model)) {
      setModel(list[0].id);
    }
  }, [provider, modelsQ.data, model]);

  const genMut = useMutation({
    mutationFn: () =>
      api.genEpisodeCoverPrompt(ep.name, { provider, model, variant }),
    onSuccess: (res) => {
      setGenerated(res.prompt);
      setThemeColor(res.themeColor);
      savePromptMut.mutate(res.prompt);
    },
  });

  // Tạo ảnh (tốn phí, model rẻ nhất): lưu prompt đang sửa trước, rồi server gen + gắn cover.
  const [imageProvider, setImageProvider] = useState<"gemini" | "openai">("gemini");
  const imageMut = useMutation({
    mutationFn: async () => {
      if (generated.trim() !== saved.trim()) await savePromptMut.mutateAsync(generated);
      return api.genCoverImage(ep.name, variant, imageProvider);
    },
    onSuccess: (updated) => {
      qc.setQueryData(["episode", ep.name], updated);
      qc.invalidateQueries({ queryKey: ["episodes"] });
    },
  });

  const copyPrompt = async () => {
    if (!generated) return;
    try {
      await navigator.clipboard.writeText(generated);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      alert("Clipboard không khả dụng — copy thủ công.");
    }
  };

  return (
    <div className="rounded-md border p-4">
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <ImageIcon className="size-4 text-accent" />
        <h3 className="font-medium">
          {variant === "landscape"
            ? "Prompt tạo thumbnail YouTube (16:9)"
            : "Prompt tạo ảnh cover (9:16)"}
        </h3>
        {generated && (
          <Badge variant="outline" className="text-[10px] ml-auto">
            {generated.length.toLocaleString("vi-VN")} ký tự
          </Badge>
        )}
      </div>

      {generated ? (
        <Textarea
          value={generated}
          onChange={(e) => setGenerated(e.target.value)}
          onBlur={() => {
            if (generated !== saved) savePromptMut.mutate(generated);
          }}
          rows={Math.min(20, Math.max(8, generated.split("\n").length + 1))}
          className="font-mono text-xs leading-relaxed"
        />
      ) : (
        <p className="text-xs text-muted-foreground leading-relaxed">
          {variant === "landscape" ? (
            <>
              Thumbnail YouTube ngang: tiêu đề tập (đúng nguyên văn, viết hoa)
              + 1 vật kể chuyện, bố cục trái-phải, đọc được ở cỡ nhỏ. Giữ màu chủ đề của tập nếu đã có. Ảnh xong → tải lên ở mục{" "}
              <strong>Ảnh cover YouTube (16:9)</strong>.
            </>
          ) : (
            <>
              Sinh prompt cho Midjourney / Flux / DALL-E để tạo thumbnail style
              3D clay render pastel ByteCast. LLM fill title + 5 tickets + 1
              notebook phrase theo nội dung tập. Style/material/color giữ
              nguyên xuyên suốt
            </>
          )}{" "}
          — bạn có thể sửa system prompt qua{" "}
          <strong>Settings → System prompts</strong>.
        </p>
      )}

      {/* Claude Code tự viết prompt (miễn phí) — hướng dẫn lệnh */}
      <div className="mt-3 rounded-md bg-secondary/30 p-2.5 text-[11px] text-muted-foreground space-y-1">
        <p>
          <strong className="text-foreground">Claude Code tự viết (miễn phí):</strong>{" "}
          bảo Claude "viết prompt {variant === "landscape" ? "thumbnail YouTube" : "cover"} cho tập này" —
          Claude chạy:
        </p>
        <code className="block font-mono break-all">
          npx tsx podcast/scripts/cover-prompt.ts brief {ep.name}
          {cliFlag}
        </code>
        <code className="block font-mono break-all">
          npx tsx podcast/scripts/cover-prompt.ts apply {ep.name} &lt;file&gt;
          {cliFlag}
        </code>
        <p>Prompt lưu vào tập và hiện ở đây để copy.</p>
      </div>

      {themeColor && (
        <div className="mt-3 flex items-center gap-2 flex-wrap text-xs">
          <span className="text-muted-foreground">Màu chủ đề:</span>
          <span
            className="inline-block size-5 rounded border"
            style={{ backgroundColor: themeColor }}
          />
          <code className="font-mono">{themeColor}</code>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-[11px]"
            disabled={
              applyAccentMut.isPending || ep.config.accentColor === themeColor
            }
            onClick={() => applyAccentMut.mutate(themeColor)}
            title="Dùng màu này làm màu sóng (visualizer) cho đồng bộ cover"
          >
            {ep.config.accentColor === themeColor
              ? "Đã áp dụng cho sóng"
              : "Dùng cho sóng"}
          </Button>
        </div>
      )}

      {imageMut.isError && (
        <div className="mt-3 rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive flex items-start gap-2">
          <AlertCircle className="size-3.5 mt-0.5 shrink-0" />
          <span>Tạo ảnh lỗi: {String(imageMut.error)}</span>
        </div>
      )}
      {imageMut.isSuccess && (
        <div className="mt-3 rounded-md border border-accent/40 bg-accent/5 p-2 text-xs flex items-start gap-2">
          <Check className="size-3.5 mt-0.5 shrink-0 text-accent" />
          <span>
            Đã tạo và gắn {variant === "landscape" ? "thumbnail" : "ảnh cover"} — kiểm tra chữ tiếng Việt
            trên ảnh (model hay sai dấu); chưa ưng thì bấm tạo lại.
          </span>
        </div>
      )}

      {genMut.isError && (
        <div className="mt-3 rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive flex items-start gap-2">
          <AlertCircle className="size-3.5 mt-0.5 shrink-0" />
          <span>{String(genMut.error)}</span>
        </div>
      )}

      {/* Footer theo thứ tự bước: viết prompt bằng AI (ẩn sau nút, tốn phí) → copy → tạo ảnh OpenAI (nút chính) */}
      <div className="mt-4 pt-3 border-t flex items-center justify-end gap-2 flex-wrap">
        {showOpenAI && (
          <>
            <select
              value={provider}
              onChange={(e) => setProvider(e.target.value as "openai" | "ollama")}
              className="h-9 rounded-md border border-input bg-background px-2 text-xs"
              title="LLM provider"
            >
              <option
                value="openai"
                disabled={!!modelsQ.data && modelsQ.data.openai.length === 0}
              >
                OpenAI
              </option>
              <option
                value="ollama"
                disabled={!!modelsQ.data && modelsQ.data.ollama.length === 0}
              >
                Ollama
              </option>
            </select>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-2 text-xs max-w-[200px]"
              title="LLM model"
            >
              {(modelsQ.data?.[provider] ?? []).map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
            <Button
              size="sm"
              variant="outline"
              onClick={() => genMut.mutate()}
              disabled={genMut.isPending || !model}
              title="Gọi API LLM — OpenAI tốn phí"
            >
              {genMut.isPending ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Sparkles className="size-3.5" />
              )}
              {genMut.isPending ? "Đang viết…" : "Viết prompt"}
            </Button>
          </>
        )}
        <Button
          size="sm"
          variant="outline"
          onClick={() => setShowOpenAI((v) => !v)}
          title="Dùng LLM (OpenAI/Ollama) viết lại prompt — OpenAI tốn phí"
        >
          <Sparkles className="size-3.5" />
          {showOpenAI ? "Ẩn AI" : "AI viết…"}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={copyPrompt}
          disabled={!generated}
          title="Copy prompt vào clipboard"
        >
          {copied ? (
            <Check className="size-3.5 text-accent" />
          ) : (
            <Copy className="size-3.5" />
          )}
          {copied ? "Đã copy" : "Copy prompt"}
        </Button>
        <select
          value={imageProvider}
          onChange={(e) => setImageProvider(e.target.value as "gemini" | "openai")}
          className="h-9 rounded-md border border-input bg-background px-2 text-xs"
          title="Dịch vụ tạo ảnh (model rẻ nhất)"
          disabled={imageMut.isPending}
        >
          <option value="gemini">Gemini</option>
          <option value="openai">OpenAI</option>
        </select>
        <Button
          size="sm"
          onClick={() => imageMut.mutate()}
          disabled={!generated.trim() || imageMut.isPending}
          title="Tạo ảnh từ prompt này rồi gắn làm cover — TỐN PHÍ"
        >
          {imageMut.isPending ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Wand2 className="size-3.5" />
          )}
          {imageMut.isPending ? "Đang tạo ảnh…" : "Tạo ảnh"}
        </Button>
      </div>
    </div>
  );
}
