import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  Workflow as WorkflowIcon,
  Lightbulb,
  FileText,
  Headphones,
  Library,
  Mic2,
  Film,
  Check,
  ChevronRight,
  Sparkles,
} from "lucide-react";
import { api, type WorkflowChain } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function WorkflowPage() {
  const q = useQuery({
    queryKey: ["workflow"],
    queryFn: () => api.listWorkflow(),
    refetchInterval: 5000,
  });

  const chains = q.data?.chains ?? [];

  return (
    <div className="container max-w-6xl py-10">
      <header className="mb-6 flex items-start justify-between gap-6">
        <div>
          <h1 className="text-3xl font-serif tracking-tight flex items-center gap-3">
            <WorkflowIcon className="size-7 text-accent" />
            Workflow
          </h1>
          <p className="mt-1 text-muted-foreground text-sm">
            {chains.length} chain — tóm progress brainstorm → essay → NLM → audio → render
            cho từng chủ đề.
          </p>
        </div>
        <Button asChild>
          <Link to="/brainstorm">
            <Sparkles className="size-4" />
            Brainstorm mới
          </Link>
        </Button>
      </header>

      {chains.length === 0 ? (
        <Card className="p-12 text-center border-dashed">
          <WorkflowIcon className="mx-auto mb-3 size-10 text-muted-foreground" />
          <p className="font-medium">Chưa có chain nào</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Vào{" "}
            <Link to="/brainstorm" className="text-accent hover:underline">
              Brainstorm
            </Link>{" "}
            để bắt đầu workflow đầu tiên.
          </p>
        </Card>
      ) : (
        <div className="space-y-4">
          {chains.map((c) => (
            <ChainCard key={`${c.source}-${c.id}`} chain={c} />
          ))}
        </div>
      )}
    </div>
  );
}

function ChainCard({ chain }: { chain: WorkflowChain }) {
  const steps: StepProps[] = [
    {
      key: "brainstorm",
      label: "Brainstorm",
      icon: <Lightbulb className="size-3.5" />,
      state: chain.brainstorm ? "done" : "todo",
      hint: chain.brainstorm
        ? `${chain.brainstorm.ideaCount} ý${chain.brainstorm.pickedIdx !== null ? " · picked" : ""}`
        : null,
      to: "/brainstorm",
    },
    {
      key: "essay",
      label: "Essay",
      icon: <FileText className="size-3.5" />,
      state: chain.essay
        ? chain.essay.wordCount > 100
          ? "done"
          : "partial"
        : "todo",
      hint: chain.essay ? `${chain.essay.wordCount} từ` : null,
      to: "/essay",
    },
    {
      key: "nlm",
      label: "NLM prompt",
      icon: <Headphones className="size-3.5" />,
      state: chain.essay?.hasNlmPrompt ? "done" : "todo",
      hint: null,
      to: "/essay",
    },
    {
      key: "refs",
      label: chain.refsCount > 0 ? `Refs (${chain.refsCount})` : "Refs",
      icon: <Library className="size-3.5" />,
      state:
        chain.refsCount > 0
          ? "done"
          : chain.essay
            ? "partial"
            : "todo",
      hint: null,
      to: "/references",
    },
    {
      key: "audio",
      label: "Audio",
      icon: <Mic2 className="size-3.5" />,
      state: chain.episode?.hasAudio ? "done" : "todo",
      hint: null,
      to: chain.episode
        ? `/episodes/${encodeURIComponent(chain.episode.name)}`
        : "/",
    },
    {
      key: "render",
      label: "Render",
      icon: <Film className="size-3.5" />,
      state: chain.episode?.hasOutput
        ? chain.episode.status === "outdated"
          ? "partial"
          : "done"
        : "todo",
      hint: chain.episode
        ? labelFor(chain.episode.status)
        : null,
      to: chain.episode
        ? `/episodes/${encodeURIComponent(chain.episode.name)}`
        : "/",
    },
  ];

  return (
    <Card className="p-0 overflow-hidden">
      <div className="px-6 py-4 border-b bg-secondary/30 flex items-start gap-3">
        <Badge variant="outline" className="font-mono text-xs uppercase shrink-0 mt-1">
          {chain.source}
        </Badge>
        <div className="flex-1 min-w-0">
          <h3 className="font-serif text-lg leading-tight">{chain.topic}</h3>
          <p className="text-xs text-muted-foreground mt-1 font-mono">
            {chain.id} · cập nhật {timeAgo(chain.updatedAt)}
          </p>
        </div>
      </div>
      <div className="px-6 py-4">
        <div className="flex flex-wrap gap-2">
          {steps.map((s, i) => (
            <div key={s.key} className="flex items-center gap-2">
              <StepPill {...s} />
              {i < steps.length - 1 && (
                <ChevronRight className="size-3 text-muted-foreground/50" />
              )}
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

type StepProps = {
  key: string;
  label: string;
  icon: React.ReactNode;
  state: "done" | "partial" | "todo";
  hint: string | null;
  to: string;
};

function StepPill({ label, icon, state, hint, to }: StepProps) {
  return (
    <Link
      to={to}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
        state === "done" &&
          "border-accent bg-accent/15 text-foreground hover:bg-accent/25",
        state === "partial" &&
          "border-primary/40 bg-primary/10 text-foreground hover:bg-primary/20",
        state === "todo" &&
          "border-muted-foreground/30 text-muted-foreground hover:bg-secondary/50",
      )}
      title={hint ?? label}
    >
      {state === "done" ? <Check className="size-3" /> : icon}
      {label}
      {hint && state !== "todo" && (
        <span className="text-muted-foreground font-normal">· {hint}</span>
      )}
    </Link>
  );
}

function labelFor(status: WorkflowChain["episode"] extends infer T
  ? T extends { status: infer S }
    ? S
    : never
  : never): string {
  if (status === "rendered") return "rendered";
  if (status === "rendering") return "rendering";
  if (status === "outdated") return "outdated";
  if (status === "draft") return "draft";
  if (status === "no-audio") return "no-audio";
  return String(status);
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return "vừa xong";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}p trước`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h trước`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} ngày trước`;
  return new Date(iso).toLocaleDateString("vi-VN");
}
