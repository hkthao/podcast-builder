/**
 * Kế hoạch đăng — lịch 2 tuần theo kênh (input/_plan.json).
 * Route: /plan
 *
 * User chỉ rảnh chủ nhật: chủ nhật Claude Code (skill plan-week) làm hàng loạt các
 * tập trong lịch; trang này hiện tiến độ từng ô (suy ra từ file tập) + hẹn giờ đăng
 * qua hàng đợi đăng của server (POST /api/publish/jobs — tải nền, xem ở /publish-queue).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarDays,
  Clapperboard,
  ChevronLeft,
  ChevronRight,
  CalendarPlus,
  Clock,
  ExternalLink,
  Loader2,
  Pencil,
  Plus,
  Send,
  Trash2,
  X as XIcon,
  FilePlus2,
  UploadCloud,
} from "lucide-react";
import { api, planApi, publishApi, type PlanSlot, type PublishJob } from "@/lib/api";
import { SERIES_OPTIONS, seriesInfo, type SeriesId } from "@/lib/series";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { isActiveJob } from "@/pages/RenderQueue";
import type { RenderJob } from "@/lib/api";

const DAYS = 14;
const WEEKDAY = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
const STEPS: Array<{ key: keyof PlanSlot["progress"]; label: string }> = [
  { key: "script", label: "Kịch bản" },
  { key: "audio", label: "Audio" },
  { key: "footage", label: "Footage" },
  { key: "cover", label: "Cover" },
  { key: "rendered", label: "Render" },
  { key: "scheduled", label: "Hẹn giờ" },
  { key: "published", label: "Đã đăng" },
];

/** YYYY-MM-DD theo giờ máy (VN). */
const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const addDays = (date: string, n: number) => {
  const d = new Date(`${date}T00:00:00`);
  d.setDate(d.getDate() + n);
  return ymd(d);
};

export function PlanPage() {
  const qc = useQueryClient();
  const today = ymd(new Date());
  // Mặc định từ hôm nay → chủ nhật mở ra thấy ngay 2 tuần sắp tới.
  const [from, setFrom] = useState(today);
  const q = useQuery({ queryKey: ["plan", from], queryFn: () => planApi.get(from, DAYS) });
  const refresh = () => qc.invalidateQueries({ queryKey: ["plan"] });

  const fillMut = useMutation({ mutationFn: () => planApi.fill(from, DAYS), onSuccess: refresh });

  // Job render chưa kết thúc (status = pha đang chạy) → ô hiện "Đang render…", không xếp lại.
  const jobsQ = useQuery({
    queryKey: ["render-jobs"],
    queryFn: () => api.listRenderJobs(),
    refetchInterval: (query) => (query.state.data?.jobs.some((j) => isActiveJob(j.status)) ? 5000 : false),
  });
  // Tập → job render đang chạy/chờ (bản dọc, không preview) để ô hiện % tiến độ.
  const renderingEps = useMemo(() => {
    const m = new Map<string, RenderJob>();
    for (const j of jobsQ.data?.jobs ?? []) {
      if (isActiveJob(j.status) && j.jobType === "render" && !j.preview) m.set(j.episodeName, j);
    }
    return m;
  }, [jobsQ.data]);
  // Có job vừa xong → làm mới tiến độ ô (chấm Render bật xanh, nút Hẹn giờ sáng).
  const activeCount = renderingEps.size;
  const prevActive = useRef(activeCount);
  useEffect(() => {
    if (activeCount < prevActive.current) refresh();
    prevActive.current = activeCount;
  }, [activeCount]);

  // Tập → job đăng FB đang chờ/đang tải (hàng đợi server) để ô hiện % tải.
  const publishQ = useQuery({
    queryKey: ["publish-jobs"],
    queryFn: () => publishApi.list(),
    refetchInterval: (query) =>
      query.state.data?.jobs.some((j) => j.status === "queued" || j.status === "uploading") ? 3000 : 30_000,
  });
  const publishingEps = useMemo(() => {
    const m = new Map<string, PublishJob>();
    for (const j of publishQ.data?.jobs ?? []) {
      if (j.status === "queued" || j.status === "uploading") m.set(j.episodeName, j);
    }
    return m;
  }, [publishQ.data]);
  // Có tập vừa đăng/hẹn xong → làm mới tiến độ ô.
  const pubCount = publishingEps.size;
  const prevPub = useRef(pubCount);
  useEffect(() => {
    if (pubCount < prevPub.current) refresh();
    prevPub.current = pubCount;
  }, [pubCount]);

  // Render hàng loạt: đủ kịch bản + audio + footage + cover, chưa render (hoặc render cũ), chưa hẹn/đăng.
  const renderable = (q.data?.slots ?? []).filter(
    (s) =>
      s.episode &&
      !renderingEps.has(s.episode) &&
      s.progress.script &&
      s.progress.audio &&
      s.progress.footage &&
      s.progress.cover &&
      !s.progress.rendered &&
      !s.progress.scheduled &&
      !s.progress.published,
  );
  const renderMut = useMutation({
    mutationFn: async () => {
      for (const s of renderable) {
        await api.startRender(s.episode!, false, { regenTranscribe: false, regenPlan: true });
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["render-jobs"] }),
  });

  // Tạo tập hàng loạt: ô đã có chủ đề nhưng chưa gắn tập (mặc định theo series do server điền).
  const creatable = (q.data?.slots ?? []).filter((s) => s.title && !s.episode);
  const createAllMut = useMutation({
    mutationFn: async () => {
      const errors: string[] = [];
      for (const s of creatable) {
        try {
          await planApi.createEpisode(s.id);
        } catch (e) {
          errors.push(`${s.date} ${s.title}: ${(e as Error).message}`);
        }
      }
      if (errors.length) throw new Error(errors.join(" · "));
    },
    onSettled: refresh,
  });

  // Hẹn giờ hàng loạt: ô đã render, chưa hẹn/đăng, giờ đăng còn ≥ 15 phút.
  const postTime = q.data?.settings.postTime;
  const slotAt = (s: PlanSlot) => new Date(`${s.date}T${postTime?.[s.series] ?? "20:00"}:00`);
  const schedulable = (q.data?.slots ?? []).filter(
    (s) =>
      s.episode &&
      s.progress.rendered &&
      !s.progress.scheduled &&
      !s.progress.published &&
      !publishingEps.has(s.episode) &&
      slotAt(s).getTime() > Date.now() + 15 * 60_000,
  );
  const scheduleMut = useMutation({
    mutationFn: async () => {
      const r = await publishApi.enqueue(schedulable.map((s) => ({ episodeName: s.episode!, scheduledAt: slotAt(s).toISOString() })));
      if (r.errors.length) throw new Error(r.errors.map((e) => `${e.episodeName}: ${e.error}`).join(" · "));
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["publish-jobs"] }),
  });

  const days = useMemo(() => Array.from({ length: DAYS }, (_, i) => addDays(from, i)), [from]);
  const slotsBy = useMemo(() => {
    const m = new Map<string, PlanSlot[]>();
    for (const s of q.data?.slots ?? []) {
      const k = `${s.date}|${s.series}`;
      m.set(k, [...(m.get(k) ?? []), s]);
    }
    return m;
  }, [q.data]);

  const counts = useMemo(() => {
    const c = new Map<string, number>();
    for (const s of q.data?.slots ?? []) c.set(s.progress.next, (c.get(s.progress.next) ?? 0) + 1);
    return [...c.entries()];
  }, [q.data]);

  return (
    <div className="container max-w-6xl py-5 pb-24 md:py-10">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 font-serif text-2xl md:text-3xl tracking-tight">
            <CalendarDays className="size-7 text-accent" /> Kế hoạch đăng
          </h1>
          <p className="mt-1 text-sm text-muted-foreground line-clamp-2 md:line-clamp-none">
            Mỗi kênh {q.data ? Object.values(q.data.settings.cadenceDays)[0] : 2} ngày 1 tập · chủ nhật Claude làm
            hàng loạt (nói "làm kế hoạch tuần tới") · hẹn giờ đăng qua Facebook.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setFrom(addDays(from, -7))} title="Lùi 1 tuần">
            <ChevronLeft className="size-4" />
          </Button>
          <span className="min-w-36 text-center text-sm tabular-nums">
            {from.slice(8)}/{from.slice(5, 7)} – {addDays(from, DAYS - 1).slice(8)}/{addDays(from, DAYS - 1).slice(5, 7)}
          </span>
          <Button variant="outline" size="sm" onClick={() => setFrom(addDays(from, 7))} title="Tới 1 tuần">
            <ChevronRight className="size-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => fillMut.mutate()} disabled={fillMut.isPending}>
            <CalendarPlus className="size-4" /> Điền lịch
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => createAllMut.mutate()}
            disabled={!creatable.length || createAllMut.isPending}
            title="Tạo tập (config) cho mọi ô đã có chủ đề nhưng chưa gắn tập"
          >
            {createAllMut.isPending ? <Loader2 className="size-4 animate-spin" /> : <FilePlus2 className="size-4" />} Tạo{" "}
            {creatable.length}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => renderMut.mutate()}
            disabled={!renderable.length || renderMut.isPending}
            title="Xếp hàng render các tập đã đủ kịch bản + audio + footage + cover (server chạy tối đa 2 job song song)"
          >
            {renderMut.isPending ? <Loader2 className="size-4 animate-spin" /> : <Clapperboard className="size-4" />} Render{" "}
            {renderable.length}
          </Button>
          <Button
            size="sm"
            onClick={() => scheduleMut.mutate()}
            disabled={!schedulable.length || scheduleMut.isPending}
            title="Xếp các tập đã render vào hàng đợi đăng (server tải nền tuần tự, hẹn đúng giờ đăng của ô)"
          >
            {scheduleMut.isPending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />} Hẹn giờ{" "}
            {schedulable.length}
          </Button>
        </div>
      </header>

      {(activeCount > 0 || pubCount > 0 || renderMut.error || createAllMut.error || scheduleMut.error) && (
        <Card className="mb-4 space-y-1 p-3 text-sm">
          {activeCount > 0 && (
            <span className="inline-flex items-center gap-2">
              <Loader2 className="size-4 animate-spin" /> Đang render {activeCount} tập —{" "}
              <Link to="/render-queue" className="text-accent hover:underline">
                xem hàng đợi
              </Link>
            </span>
          )}
          {pubCount > 0 && (
            <div className="flex items-center gap-2">
              <UploadCloud className="size-4 text-accent" /> Đang tải {pubCount} tập lên Facebook
              {[...publishingEps.values()].find((j) => j.status === "uploading") &&
                ` (${[...publishingEps.values()].find((j) => j.status === "uploading")!.title} ${Math.floor(
                  [...publishingEps.values()].find((j) => j.status === "uploading")!.percent,
                )}%)`}{" "}
              —{" "}
              <Link to="/publish-queue" className="text-accent hover:underline">
                xem hàng đợi đăng
              </Link>
            </div>
          )}
          {scheduleMut.error && <div className="text-xs text-destructive">{String(scheduleMut.error)}</div>}
          {renderMut.error && <div className="text-xs text-destructive">{String(renderMut.error)}</div>}
          {createAllMut.error && <div className="text-xs text-destructive">{String(createAllMut.error)}</div>}
        </Card>
      )}

      {counts.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {counts.map(([label, n]) => (
            <Badge key={label} variant="outline" className="text-xs">
              {label}: {n}
            </Badge>
          ))}
        </div>
      )}

      {q.isLoading ? (
        <Card className="h-96 animate-pulse bg-muted/30" />
      ) : q.error ? (
        <Card className="p-4 md:p-6 text-sm text-destructive">{String(q.error)}</Card>
      ) : (
        <>
        {/* Điện thoại: mỗi ngày 1 khối, ô xếp dọc kèm nhãn kênh (lưới 4 kênh quá chật < md). */}
        <Card className="overflow-hidden p-0 md:hidden">
          {days.map((date) => {
            const dow = new Date(`${date}T00:00:00`).getDay();
            const cells = SERIES_OPTIONS.flatMap((s) => (slotsBy.get(`${date}|${s.id}`) ?? []).map((slot) => ({ s, slot })));
            return (
              <div key={date} className={cn("border-b px-3 py-3 last:border-b-0", date === today && "bg-accent/5")}>
                <div className={cn("mb-2 text-sm font-medium", date === today && "text-accent")}>
                  {WEEKDAY[dow]} {date.slice(8)}/{date.slice(5, 7)}
                  {dow === 0 && <span className="ml-2 text-xs font-normal text-muted-foreground">ngày làm</span>}
                </div>
                {cells.length ? (
                  <div className="space-y-2">
                    {cells.map(({ s, slot }) => (
                      <div key={slot.id}>
                        <span className={cn("mb-1 inline-block rounded px-1.5 py-0.5 text-[11px]", s.tone)}>
                          {s.channelName} · {postTime?.[s.id]}
                        </span>
                        <SlotCard
                          slot={slot}
                          at={slotAt(slot)}
                          renderJob={slot.episode ? renderingEps.get(slot.episode) ?? null : null}
                          publishJob={slot.episode ? publishingEps.get(slot.episode) ?? null : null}
                          onChange={refresh}
                        />
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">Không có ô nào.</p>
                )}
              </div>
            );
          })}
        </Card>
        <Card className="hidden overflow-hidden p-0 md:block">
          <div className="grid border-b bg-muted/30 text-xs font-medium uppercase tracking-wider text-muted-foreground" style={gridCols}>
            <div className="px-3 py-2 text-center">Ngày</div>
            {SERIES_OPTIONS.map((s) => (
              <div key={s.id} className="px-3 py-2">
                <span className={cn("rounded px-1.5 py-0.5 normal-case tracking-normal", s.tone)}>{s.channelName}</span>
                <span className="ml-1.5 normal-case tracking-normal">{postTime?.[s.id]}</span>
              </div>
            ))}
          </div>
          {days.map((date) => {
            const dow = new Date(`${date}T00:00:00`).getDay();
            return (
              <div
                key={date}
                style={gridCols}
                className={cn(
                  "grid border-b last:border-b-0",
                  date === today && "bg-accent/5",
                  dow === 0 && "bg-muted/20",
                )}
              >
                <div className="flex flex-col items-center justify-center px-2 py-3 text-center text-sm">
                  <div className={cn("font-medium", date === today && "text-accent")}>{WEEKDAY[dow]}</div>
                  <div className={cn("tabular-nums", date === today ? "text-accent" : "text-muted-foreground")}>
                    {date.slice(8)}/{date.slice(5, 7)}
                  </div>
                  {dow === 0 && <div className="text-[10px] text-muted-foreground">ngày làm</div>}
                </div>
                {SERIES_OPTIONS.map((s) => (
                  <div key={s.id} className="space-y-2 border-l px-2 py-2">
                    {(slotsBy.get(`${date}|${s.id}`) ?? []).map((slot) => (
                      <SlotCard
                        key={slot.id}
                        slot={slot}
                        at={slotAt(slot)}
                        renderJob={slot.episode ? renderingEps.get(slot.episode) ?? null : null}
                        publishJob={slot.episode ? publishingEps.get(slot.episode) ?? null : null}
                        onChange={refresh}
                      />
                    ))}
                  </div>
                ))}
              </div>
            );
          })}
        </Card>
        </>
      )}

    </div>
  );
}

function SlotCard({
  slot,
  at,
  renderJob,
  publishJob,
  onChange,
}: {
  slot: PlanSlot;
  at: Date;
  renderJob: RenderJob | null;
  publishJob: PublishJob | null;
  onChange: () => void;
}) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [scheduling, setScheduling] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const createMut = useMutation({ mutationFn: () => planApi.createEpisode(slot.id), onSuccess: onChange });
  const p = slot.progress;
  const canSchedule =
    !!slot.episode && p.rendered && !p.scheduled && !p.published && !publishJob && at.getTime() > Date.now() + 15 * 60_000;

  const schedule = async () => {
    setScheduling(true);
    setErr(null);
    try {
      const r = await publishApi.enqueue([{ episodeName: slot.episode!, scheduledAt: at.toISOString() }]);
      if (r.errors.length) setErr(r.errors[0].error);
      qc.invalidateQueries({ queryKey: ["publish-jobs"] });
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setScheduling(false);
    }
  };

  const dialog = editing && !slot.episode && (
    <SlotEditDialog slot={slot} at={at} onClose={() => setEditing(false)} onChange={onChange} />
  );

  if (!slot.title && !slot.episode) {
    return (
      <>
        <button
          onClick={() => setEditing(true)}
          className="flex w-full items-center gap-1.5 rounded-md border border-dashed px-2 py-2 text-xs text-muted-foreground hover:border-solid hover:text-foreground"
        >
          <Plus className="size-3.5" /> Thêm chủ đề
        </button>
        {dialog}
      </>
    );
  }

  return (
    <div className="rounded-md border bg-background/60 p-2">
      <div className="flex items-start gap-1">
        <div className="min-w-0 flex-1">
          <div className="line-clamp-2 text-sm font-medium leading-snug">{p.episodeTitle ?? slot.title}</div>
          {slot.hook && <div className="mt-0.5 line-clamp-1 text-xs italic text-muted-foreground">{slot.hook}</div>}
        </div>
        {!slot.episode && (
          <button onClick={() => setEditing(true)} className="text-muted-foreground hover:text-foreground" title="Sửa">
            <Pencil className="size-3.5" />
          </button>
        )}
      </div>
      {publishJob?.status === "uploading" && (
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-muted" title={publishJob.message}>
          <div className="h-full rounded-full bg-sky-500 transition-all" style={{ width: `${publishJob.percent.toFixed(1)}%` }} />
        </div>
      )}
      {renderJob && renderJob.status !== "queued" && (
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-muted" title={renderJob.message}>
          <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${Math.round(renderJob.percent)}%` }} />
        </div>
      )}
      <div className="mt-2 flex items-center gap-1" title={STEPS.map((s) => `${s.label}: ${p[s.key] ? "✓" : "—"}`).join(" · ")}>
        {STEPS.map((s) => (
          <span key={s.key} className={cn("h-1.5 flex-1 rounded-full", p[s.key] ? "bg-emerald-500" : "bg-muted")} />
        ))}
      </div>
      <div className="mt-1.5 flex items-center justify-between gap-1">
        <span className={cn("text-[11px]", p.published ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground")}>
          {p.scheduled && p.scheduledAt ? (
            <span className="inline-flex items-center gap-1">
              <Clock className="size-3" />
              {new Date(p.scheduledAt).toLocaleString("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" })}
            </span>
          ) : publishJob ? (
            <Link to="/publish-queue" className="inline-flex items-center gap-1 text-sky-600 hover:underline dark:text-sky-400">
              <UploadCloud className="size-3" />
              {publishJob.status === "queued" ? "Chờ tải FB" : `Tải FB ${Math.floor(publishJob.percent)}%`}
            </Link>
          ) : renderJob ? (
            <span className="inline-flex items-center gap-1 text-accent">
              <Loader2 className="size-3 animate-spin" />
              {renderJob.status === "queued" ? "Chờ render" : `Render ${Math.round(renderJob.percent)}%`}
            </span>
          ) : (
            p.next
          )}
        </span>
        <div className="flex items-center gap-1">
          {!slot.episode && slot.title && (
            <Button size="sm" variant="outline" className="h-6 px-2 text-[11px]" onClick={() => createMut.mutate()} disabled={createMut.isPending}>
              Tạo tập
            </Button>
          )}
          {canSchedule && (
            <Button size="sm" className="h-6 px-2 text-[11px]" onClick={schedule} disabled={scheduling}>
              {scheduling ? <Loader2 className="size-3 animate-spin" /> : <Send className="size-3" />} Hẹn giờ
            </Button>
          )}
          {slot.episode && (
            <Link to={`/episodes/${encodeURIComponent(slot.episode)}`} className="text-muted-foreground hover:text-foreground" title="Mở tập">
              <ExternalLink className="size-3.5" />
            </Link>
          )}
        </div>
      </div>
      {(err || createMut.error) && (
        <div className="mt-1 text-[11px] text-destructive">{err ?? String(createMut.error)}</div>
      )}
      {dialog}
    </div>
  );
}

/** Cột ngày + 1 cột mỗi kênh (số kênh lấy từ SERIES_OPTIONS, không hardcode). */
const gridCols = { gridTemplateColumns: `88px repeat(${SERIES_OPTIONS.length}, minmax(0, 1fr))` };

const NOTES_HINT: Record<SeriesId, string> = {
  bytecast: "Góc nhìn chính, câu hỏi lớn của tập, nguồn/nhà tư tưởng muốn dùng (tránh nguồn đã bão hoà)…",
  "chuyen-xua": "Tên truyện trong Cổ học tinh hoa, nguyên văn (nếu có) + giải nghĩa + lời bàn, bài học hiện đại muốn nhấn…",
  "dong-ho-viet": "Vật thể làm trục (cuốn sổ, tấm ảnh, bát hương…), kỷ niệm/câu nói của ông bà, góc kể chưa dùng ở tập trước…",
  "tien-tam-ly": "Case study/cơ chế làm cú sốc, số liệu VN cần lấy (nguồn GSO/NHNN/…), hiệu ứng tâm lý muốn mổ xẻ, quy tắc rút ra…",
};

/** Modal sửa ô kế hoạch: chủ đề + hook + ghi chú cho Claude. Esc đóng, ⌘/Ctrl+Enter lưu. */
function SlotEditDialog({
  slot,
  at,
  onClose,
  onChange,
}: {
  slot: PlanSlot;
  at: Date;
  onClose: () => void;
  onChange: () => void;
}) {
  const [title, setTitle] = useState(slot.title);
  const [hook, setHook] = useState(slot.hook ?? "");
  const [notes, setNotes] = useState(slot.notes ?? "");
  const saveMut = useMutation({
    mutationFn: () => planApi.updateSlot(slot.id, { title, hook, notes }),
    onSuccess: () => {
      onChange();
      onClose();
    },
  });
  const delMut = useMutation({
    mutationFn: () => planApi.deleteSlot(slot.id),
    onSuccess: () => {
      onChange();
      onClose();
    },
  });
  const pending = saveMut.isPending || delMut.isPending;
  const info = seriesInfo(slot.series);
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") onClose();
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && title.trim()) saveMut.mutate();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center bg-background/80 p-0 sm:p-4 backdrop-blur-sm"
      onKeyDown={onKey}
      onMouseDown={(e) => e.target === e.currentTarget && !pending && onClose()}
    >
      <Card className="max-h-[92dvh] w-full max-w-2xl overflow-y-auto rounded-b-none p-0 sm:rounded-b-lg">
        <div className="flex items-center gap-2 border-b bg-secondary/30 px-5 py-3">
          <span className={cn("rounded px-1.5 py-0.5 text-xs", info.tone)}>{info.channelName}</span>
          <span className="text-sm font-medium">
            {WEEKDAY[at.getDay()]} {slot.date.slice(8)}/{slot.date.slice(5, 7)} ·{" "}
            {at.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}
          </span>
          <button onClick={onClose} disabled={pending} className="ml-auto rounded p-1 hover:bg-secondary disabled:opacity-50" title="Đóng (Esc)">
            <XIcon className="size-4" />
          </button>
        </div>
        <div className="space-y-4 px-5 py-5">
          <div>
            <label className="mb-1.5 block text-sm font-medium">
              Chủ đề / tiêu đề tập <span className="text-destructive">*</span>
            </label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus disabled={pending} placeholder="VD: Không quên được cái cũ" />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium">Hook</label>
            <Input
              value={hook}
              onChange={(e) => setHook(e.target.value)}
              disabled={pending}
              placeholder="Câu mở gây tò mò (tuỳ chọn)"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium">Ghi chú cho Claude</label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={pending}
              rows={8}
              placeholder={NOTES_HINT[slot.series]}
              className="text-sm leading-relaxed"
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              Claude đọc ghi chú này khi làm tập vào chủ nhật (skill plan-week).
            </p>
          </div>
          {(saveMut.error || delMut.error) && (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive">
              {String(saveMut.error ?? delMut.error)}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 border-t px-5 py-3">
          <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive" onClick={() => delMut.mutate()} disabled={pending}>
            <Trash2 className="size-4" /> Xoá ô
          </Button>
          <span className="ml-auto hidden text-[11px] text-muted-foreground sm:inline">⌘/Ctrl + Enter để lưu</span>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={pending}>
            Huỷ
          </Button>
          <Button size="sm" onClick={() => saveMut.mutate()} disabled={pending || !title.trim()}>
            {saveMut.isPending && <Loader2 className="size-4 animate-spin" />}
            Lưu
          </Button>
        </div>
      </Card>
    </div>
  );
}
