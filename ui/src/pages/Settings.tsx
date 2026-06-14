/**
 * Settings page — Phase 4b''.
 * Route: /settings
 *
 * Mỗi provider 1 row với:
 *  - Status badge (DB / .env / none)
 *  - Last 4 chars hint nếu source="db"
 *  - Input để set/update API key (mặc định ẩn, show/hide toggle)
 *  - Save button + Clear button (clear chỉ xoá DB, fallback env vẫn còn)
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Settings as SettingsIcon,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Loader2,
  Save,
  Trash2,
} from "lucide-react";
import {
  api,
  type ApiKeyProvider,
  type ApiKeyStatus,
} from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const PROVIDER_META: Record<
  ApiKeyProvider,
  {
    label: string;
    docsUrl: string;
    placeholder: string;
    description: string;
  }
> = {
  openai: {
    label: "OpenAI",
    docsUrl: "https://platform.openai.com/api-keys",
    placeholder: "sk-proj-...",
    description:
      "Dùng cho LLM brainstorm/essay/transcript (gpt-4o-mini, gpt-4o) + OpenAI TTS (legacy).",
  },
  gemini: {
    label: "Gemini (Cloud TTS)",
    docsUrl: "https://console.cloud.google.com/apis/library/texttospeech.googleapis.com",
    placeholder: "AIzaSy...",
    description:
      'Cloud TTS API key — TẠO trong GCP Console (KHÔNG dùng key từ AI Studio). Steps: GCP Console → enable "Cloud Text-to-Speech API" → APIs & Services → Credentials → Create API key. Cần billing-enabled project. Cho phép tách prompt/text → không noise như AI Studio endpoint.',
  },
  anthropic: {
    label: "Anthropic Claude",
    docsUrl: "https://console.anthropic.com/settings/keys",
    placeholder: "sk-ant-...",
    description: "Chưa active — reserved cho roadmap.",
  },
};

export function SettingsPage() {
  const q = useQuery({
    queryKey: ["api-keys"],
    queryFn: () => api.listApiKeys(),
  });

  return (
    <div className="container max-w-3xl py-10">
      <header className="mb-6">
        <h1 className="text-3xl font-serif tracking-tight flex items-center gap-3">
          <SettingsIcon className="size-7 text-accent" />
          Settings
        </h1>
        <p className="mt-1 text-muted-foreground text-sm">
          Quản lý API keys cho LLM + TTS providers. DB-first, fallback .env.
          Key value KHÔNG được hiện lại — type lại để update.
        </p>
      </header>

      {q.isLoading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Đang tải status…
        </div>
      )}
      {q.isError && (
        <p className="text-sm text-destructive">
          Lỗi tải status: {String(q.error)}
        </p>
      )}

      {q.data && (
        <div className="space-y-3">
          {q.data.keys.map((k) => (
            <ApiKeyRow key={k.provider} status={k} />
          ))}
        </div>
      )}

      <Card className="mt-6 p-4 bg-secondary/30 border-dashed">
        <p className="text-xs text-muted-foreground leading-relaxed">
          <strong>Security note:</strong> API keys lưu plaintext trong{" "}
          <code className="font-mono text-[11px]">data.db</code> (SQLite local).
          DB nằm trên máy bạn, không sync, không expose qua HTTP với CORS rộng.
          Match security model với <code className="font-mono text-[11px]">.env</code>.
          Để max security có thể giữ tiếp ở .env — Settings UI sẽ override khi cả 2 đều set.
        </p>
      </Card>
    </div>
  );
}

function ApiKeyRow({ status }: { status: ApiKeyStatus }) {
  const qc = useQueryClient();
  const meta = PROVIDER_META[status.provider];
  const [input, setInput] = useState("");
  const [show, setShow] = useState(false);

  const saveMut = useMutation({
    mutationFn: () => api.setApiKey(status.provider, input.trim()),
    onSuccess: () => {
      setInput("");
      setShow(false);
      qc.invalidateQueries({ queryKey: ["api-keys"] });
    },
  });

  const clearMut = useMutation({
    mutationFn: () => api.deleteApiKey(status.provider),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["api-keys"] });
    },
  });

  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="font-medium">{meta.label}</h3>
            {status.hasKey ? (
              <Badge
                variant="outline"
                className={cn(
                  "text-xs gap-1",
                  status.source === "db"
                    ? "border-emerald-500/40 text-emerald-700 dark:text-emerald-400 bg-emerald-500/5"
                    : "border-blue-500/40 text-blue-700 dark:text-blue-400 bg-blue-500/5",
                )}
              >
                <CheckCircle2 className="size-3" />
                {status.source === "db"
                  ? `DB · ...${status.keyHint}`
                  : ".env"}
              </Badge>
            ) : (
              <Badge variant="outline" className="text-xs gap-1">
                <AlertCircle className="size-3 text-muted-foreground" />
                Chưa set
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
            {meta.description}
          </p>
          <a
            href={meta.docsUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-1 inline-flex items-center gap-1 text-xs text-accent hover:underline"
          >
            Lấy API key
            <ExternalLink className="size-3" />
          </a>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor={`key-${status.provider}`} className="text-xs">
          {status.hasKey ? "Update key (type new)" : "API key"}
        </Label>
        <div className="relative">
          <Input
            id={`key-${status.provider}`}
            type={show ? "text" : "password"}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={meta.placeholder}
            className="pr-10 font-mono"
          />
          <button
            type="button"
            onClick={() => setShow((v) => !v)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            title={show ? "Hide" : "Show"}
          >
            {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
        {saveMut.isError && (
          <p className="text-xs text-destructive">{String(saveMut.error)}</p>
        )}
        {saveMut.isSuccess && !saveMut.isPending && (
          <p className="text-xs text-emerald-600 dark:text-emerald-400 inline-flex items-center gap-1">
            <CheckCircle2 className="size-3" /> Đã lưu
          </p>
        )}
      </div>

      {/* Footer actions — outline + căn phải */}
      <div className="mt-4 pt-4 border-t flex items-center justify-end gap-2">
        {status.source === "db" && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              if (
                window.confirm(
                  `Xoá ${meta.label} key khỏi DB? (Nếu .env có set, sẽ fallback về đó.)`,
                )
              ) {
                clearMut.mutate();
              }
            }}
            disabled={clearMut.isPending}
            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
          >
            {clearMut.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Trash2 className="size-4" />
            )}
            Xoá
          </Button>
        )}
        <Button
          size="sm"
          variant="outline"
          onClick={() => saveMut.mutate()}
          disabled={!input.trim() || saveMut.isPending}
        >
          {saveMut.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Save className="size-4" />
          )}
          Save
        </Button>
      </div>
    </Card>
  );
}
