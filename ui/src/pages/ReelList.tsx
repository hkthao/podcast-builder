import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Clapperboard, Mic2, Film, CheckCircle2, Loader2 } from "lucide-react";
import { reelApi, type ReelEpisodeStatus } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const fmtDur = (ms: number) =>
  ms ? `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, "0")}` : "—";

export function ReelList() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["reel", "list"],
    queryFn: () => reelApi.list(),
  });

  return (
    <div className="container max-w-4xl py-8">
      <header className="mb-6 flex items-center gap-3">
        <Clapperboard className="size-7 text-accent" />
        <div>
          <h1 className="font-serif text-3xl tracking-tight">Reel</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Video reel dọc 9:16 — audio TTS + footage + caption, ráp bằng ffmpeg.
          </p>
        </div>
      </header>

      {isLoading && (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Đang tải…
        </div>
      )}
      {error && (
        <div className="text-destructive">Lỗi tải danh sách tập reel.</div>
      )}

      {data && data.episodes.length === 0 && (
        <Card className="p-8 text-center text-muted-foreground">
          Chưa có tập reel nào trong <code>reel/episodes/</code>. Tạo thư mục tập
          mới với <code>script.md</code> + <code>shot-list.md</code>.
        </Card>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {data?.episodes.map((e) => (
          <ReelCard key={e.slug} ep={e} />
        ))}
      </div>
    </div>
  );
}

function ReelCard({ ep }: { ep: ReelEpisodeStatus }) {
  return (
    <Link to={`/reel/${encodeURIComponent(ep.slug)}`}>
      <Card className="p-4 transition-colors hover:bg-secondary/40">
        <div className="mb-2 font-medium">{ep.slug}</div>
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <Badge variant="secondary" className="gap-1">
            <Mic2 className="size-3" /> {ep.audioParts.length} audio
          </Badge>
          <Badge variant="secondary" className="gap-1">
            <Film className="size-3" /> {ep.footageCount} footage
          </Badge>
          {ep.beats && (
            <Badge variant="outline" className="gap-1">
              <CheckCircle2 className="size-3 text-accent" />
              {ep.beats.count} beat · {fmtDur(ep.beats.durationMs)}
            </Badge>
          )}
          {ep.output.length > 0 && (
            <Badge className="gap-1">
              <CheckCircle2 className="size-3" /> mp4
            </Badge>
          )}
          {!ep.hasScript && (
            <Badge variant="destructive">thiếu script</Badge>
          )}
        </div>
      </Card>
    </Link>
  );
}
