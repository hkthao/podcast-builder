/**
 * Kho nhạc nền xoay vòng — bài Musopen CC0/Public Domain (an toàn Content ID). Tập mới tự bốc
 * ngẫu nhiên theo series, tránh bài tập khác chưa đăng đang dùng. Nghe thử, xem bài nào đang
 * nằm trong tập nào, chặn bài bị claim.
 * Route: /music
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, Ban, ExternalLink, Music2, Undo2 } from "lucide-react";
import { musicApi, type MusicTrack } from "@/lib/api";
import { SERIES_OPTIONS, seriesInfo } from "@/lib/series";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const fmtLen = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;

export function MusicPage() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["music-library"], queryFn: () => musicApi.library() });
  const set = (r: { tracks: MusicTrack[] }) => qc.setQueryData(["music-library"], r);
  const blockMut = useMutation({ mutationFn: (v: { id: string; reason: string }) => musicApi.block(v.id, v.reason), onSuccess: set });
  const unblockMut = useMutation({ mutationFn: (id: string) => musicApi.unblock(id), onSuccess: set });
  const [series, setSeries] = useState<string | "all">("all");

  const tracks = q.data?.tracks ?? [];
  const shown = tracks.filter((t) => series === "all" || t.series.includes(series));
  const usableBy = (id: string) => tracks.filter((t) => t.usable && t.series.includes(id)).length;
  const missing = tracks.filter((t) => !t.downloaded).length;

  return (
    <div className="container max-w-5xl py-5 pb-24 md:py-10">
      <header className="mb-6">
        <h1 className="flex items-center gap-2 font-serif text-2xl md:text-3xl tracking-tight">
          <Music2 className="size-7 text-accent" /> Kho nhạc nền
        </h1>
        <p className="mt-1 text-sm text-muted-foreground line-clamp-2 md:line-clamp-none">
          Bản thu Musopen phát hành CC0 / Public Domain (Wikimedia Commons) — không thuộc hãng đĩa nên không bị đăng ký
          Content ID. Tập mới tự bốc ngẫu nhiên theo kênh, mỗi tập chưa đăng 1 bài khác nhau → lỡ 1 bài bị claim chỉ ảnh
          hưởng 1 tập. Bài bị claim → bấm "Chặn".
        </p>
      </header>

      <div className="mb-4 flex flex-wrap gap-2">
        {SERIES_OPTIONS.map((s) => (
          <Badge key={s.id} variant={usableBy(s.id) >= 7 ? "outline" : "destructive"} className="text-xs">
            {s.channelName}: {usableBy(s.id)} bài dùng được
          </Badge>
        ))}
        {missing > 0 && (
          <Badge variant="destructive" className="text-xs">
            {missing} bài chưa tải — chạy npx tsx podcast/scripts/music-fetch.ts
          </Badge>
        )}
      </div>

      <div className="mb-3 flex flex-wrap gap-1">
        {[{ id: "all", channelName: "Tất cả" }, ...SERIES_OPTIONS].map((s) => (
          <Button
            key={s.id}
            size="sm"
            variant={series === s.id ? "secondary" : "ghost"}
            className="h-7 text-xs"
            onClick={() => setSeries(s.id)}
          >
            {s.channelName}
          </Button>
        ))}
      </div>

      {q.isLoading && <Card className="h-24 animate-pulse bg-muted/30" />}
      {q.error && <Card className="p-4 text-sm text-destructive">{String(q.error)}</Card>}
      {q.data && (
        <Card className="divide-y overflow-hidden p-0">
          {shown.map((t) => (
            <div key={t.id} className={cn("px-4 py-3", !t.usable && "opacity-60")}>
              <div className="flex flex-wrap items-center gap-2">
                <div className="w-full min-w-0 sm:w-auto sm:flex-1">
                  <div className="truncate text-sm font-medium">
                    {t.composer} — {t.work}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {t.performer} · {t.license} · {t.mood}
                    {t.qc?.durationSec ? ` · ${fmtLen(t.qc.durationSec)}` : ""}
                    {t.qc && !Number.isNaN(t.qc.lra) ? ` · LRA ${t.qc.lra}` : ""}
                    {` · đã dùng ${t.useCount} lần`}
                  </div>
                </div>
                <div className="flex shrink-0 flex-wrap gap-1">
                  {t.series.map((s) => (
                    <Badge key={s} variant="outline" className="text-[10px]">
                      {seriesInfo(s).channelName}
                    </Badge>
                  ))}
                </div>
                {t.qc?.sourceUrl && (
                  <a href={t.qc.sourceUrl} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-foreground" title="Trang nguồn + license trên Wikimedia Commons">
                    <ExternalLink className="size-4" />
                  </a>
                )}
                {t.blocked ? (
                  <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => unblockMut.mutate(t.id)} title="Bỏ chặn">
                    <Undo2 className="size-3.5" /> Bỏ chặn
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-xs text-muted-foreground hover:text-destructive"
                    onClick={() => {
                      const reason = window.prompt("Lý do chặn (vd: Content ID FB tập …, nghe không hợp):", "Content ID");
                      if (reason !== null) blockMut.mutate({ id: t.id, reason });
                    }}
                    title="Chặn — không bốc bài này nữa"
                  >
                    <Ban className="size-3.5" /> Chặn
                  </Button>
                )}
              </div>
              {t.downloaded && <audio controls preload="none" src={`/input/${t.bgm}`} className="mt-2 h-8 w-full" />}
              {(t.blocked || (t.qc && !t.qc.ok) || !t.downloaded) && (
                <div className="mt-1 flex items-center gap-1 text-xs text-destructive">
                  <AlertCircle className="size-3" />
                  {t.blocked ? `Đã chặn: ${t.blocked.reason}` : !t.downloaded ? "Chưa tải" : `QC trượt: ${t.qc?.reason}`}
                </div>
              )}
              {t.upcoming.length > 0 && (
                <div className="mt-1 text-xs text-muted-foreground">
                  Đang dùng ở:{" "}
                  {t.upcoming.map((e, i) => (
                    <span key={e}>
                      {i > 0 && ", "}
                      <Link to={`/episodes/${encodeURIComponent(e)}`} className="hover:underline">
                        {e}
                      </Link>
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
