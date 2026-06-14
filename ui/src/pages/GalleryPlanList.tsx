/**
 * GalleryPlanList — landing page Gallery workspace.
 * Route: "/" khi workspace=gallery (branched qua HomeRoute trong App.tsx).
 *
 * 1 plan = 1 tập tài liệu nghệ thuật (idea picked + scaffold chapters +
 * audio + video render + export). List ở đây cho user thấy:
 *  - Title, hook, era/region từ ideaSnapshot
 *  - Status badge: N chapters · X rendered · exported
 *  - Click card → /gallery/plans/:id để continue work
 */
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Frame,
  Lightbulb,
  CheckCircle2,
  Clock,
  Mic2,
  Music,
  Loader2,
  FileText,
} from "lucide-react";
import { api, type GalleryChapterPlan } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const ARCHETYPE_LABEL: Record<string, string> = {
  monograph: "Chân dung họa sĩ",
  masterpiece: "Đào sâu 1 tác phẩm",
  movement: "Trào lưu / thời kỳ",
  theme: "Chủ đề xuyên thời",
};

export function GalleryPlanList() {
  const navigate = useNavigate();
  const q = useQuery({
    queryKey: ["gallery-plans"],
    queryFn: () => api.listGalleryPlans(),
    refetchOnWindowFocus: true,
  });

  const plans = q.data?.plans ?? [];
  // Pinned chưa support cho gallery — sort by updatedAt desc
  const sorted = [...plans].sort((a, b) =>
    b.updatedAt.localeCompare(a.updatedAt),
  );

  return (
    <div className="container max-w-6xl py-10">
      <header className="mb-6 flex items-start justify-between gap-6">
        <div>
          <h1 className="text-3xl font-serif tracking-tight flex items-center gap-3">
            <Frame className="size-7 text-accent" />
            Tập Gallery
          </h1>
          <p className="mt-1 text-muted-foreground text-sm">
            Mỗi tập = 1 video tài liệu nghệ thuật. Bắt đầu từ Brainstorm → pick
            ý → "Lập kế hoạch chương" → render từng chương → export final.
          </p>
        </div>
        <Button variant="outline" onClick={() => navigate("/brainstorm")}>
          <Lightbulb className="size-4" />
          Brainstorm tập mới
        </Button>
      </header>

      {q.isLoading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Đang tải…
        </div>
      )}
      {q.isError && (
        <p className="text-sm text-destructive">
          Lỗi tải plans: {String(q.error)}
        </p>
      )}

      {q.data && sorted.length === 0 && (
        <Card className="p-12 text-center border-dashed">
          <Frame className="mx-auto mb-3 size-10 text-muted-foreground" />
          <p className="font-medium">Chưa có tập nào</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Vào Brainstorm → pick 1 ý tưởng → click "Lập kế hoạch chương" để
            tạo tập đầu tiên.
          </p>
          <Button
            variant="outline"
            className="mt-4"
            onClick={() => navigate("/brainstorm")}
          >
            <Lightbulb className="size-4" />
            Đi tới Brainstorm
          </Button>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {sorted.map((plan) => (
          <PlanCard key={plan.id} plan={plan} />
        ))}
      </div>
    </div>
  );
}

function PlanCard({ plan }: { plan: GalleryChapterPlan }) {
  const idea = plan.ideaSnapshot;
  const totalCh = plan.chapters.length;
  const narrationCh = plan.chapters.filter((c) => c.kind === "narration").length;
  const musicCh = plan.chapters.filter((c) => c.kind === "music").length;
  const renderedCh = plan.chapters.filter((c) => c.videoFilename !== null).length;
  const exported = plan.outputFilename !== null;

  // Status: exported > all rendered > partial > draft
  const status: "exported" | "all-rendered" | "partial" | "draft" =
    exported
      ? "exported"
      : renderedCh === totalCh && totalCh > 0
        ? "all-rendered"
        : renderedCh > 0
          ? "partial"
          : "draft";

  return (
    <Link
      to={`/gallery/plans/${encodeURIComponent(plan.id)}`}
      className="block"
    >
      <Card className="p-5 h-full transition-colors hover:border-accent hover:bg-secondary/30">
        <div className="flex items-start justify-between gap-3 mb-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <Badge variant="secondary" className="text-xs">
                {ARCHETYPE_LABEL[idea.archetype] ?? idea.archetype}
              </Badge>
              <StatusBadge status={status} renderedCh={renderedCh} totalCh={totalCh} />
            </div>
            <h3 className="font-serif text-lg leading-tight">{idea.title}</h3>
            <p className="text-sm text-muted-foreground italic mt-1 line-clamp-2">
              "{idea.hook}"
            </p>
          </div>
        </div>

        <p className="text-xs text-muted-foreground mt-2">
          {idea.era} · {idea.region} · ~{idea.estimatedMinutes}p
          {idea.structureMode === "doubled" && " · Doubled"}
        </p>

        <div className="mt-3 pt-3 border-t flex items-center justify-between text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-2.5">
            <span className="inline-flex items-center gap-1">
              <Mic2 className="size-3" />
              {narrationCh}
            </span>
            {musicCh > 0 && (
              <span className="inline-flex items-center gap-1">
                <Music className="size-3" />
                {musicCh}
              </span>
            )}
            <span className="inline-flex items-center gap-1">
              <FileText className="size-3" />
              {totalCh} chương
            </span>
          </span>
          <span>{new Date(plan.updatedAt).toLocaleDateString("vi-VN")}</span>
        </div>
      </Card>
    </Link>
  );
}

function StatusBadge({
  status,
  renderedCh,
  totalCh,
}: {
  status: "exported" | "all-rendered" | "partial" | "draft";
  renderedCh: number;
  totalCh: number;
}) {
  const map = {
    exported: {
      label: "Đã export",
      cls: "border-emerald-500/40 text-emerald-700 dark:text-emerald-400 bg-emerald-500/5",
      icon: CheckCircle2,
    },
    "all-rendered": {
      label: `${renderedCh}/${totalCh} rendered`,
      cls: "border-blue-500/40 text-blue-700 dark:text-blue-400 bg-blue-500/5",
      icon: CheckCircle2,
    },
    partial: {
      label: `${renderedCh}/${totalCh} rendered`,
      cls: "border-amber-500/40 text-amber-700 dark:text-amber-400 bg-amber-500/5",
      icon: Clock,
    },
    draft: {
      label: "Draft",
      cls: "",
      icon: Clock,
    },
  } as const;
  const m = map[status];
  const Icon = m.icon;
  return (
    <Badge variant="outline" className={cn("text-xs gap-1", m.cls)}>
      <Icon className="size-3" />
      {m.label}
    </Badge>
  );
}
