/**
 * /api/plan — trang "Kế hoạch": lịch 1–2 tuần theo kênh + kho ý tưởng (input/_plan.json).
 * Hẹn giờ đăng dùng lại SSE /api/episodes/:name/publish?scheduledAt=… ở UI.
 */
import { Hono } from "hono";
import { SERIES_IDS, type SeriesId } from "../../src/series";
import { createEmptyEpisode, getEpisode } from "../lib/episode-store";
import {
  addDays,
  fillSlots,
  newId,
  readPlan,
  slotProgress,
  writePlan,
  type PlanSettings,
  type PlanSlot,
} from "../lib/plan-store";

export const planRoutes = new Hono();

const isSeries = (v: unknown): v is SeriesId =>
  typeof v === "string" && (SERIES_IDS as readonly string[]).includes(v);
const isDate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

/** Lịch [from, from+days) kèm tiến độ từng ô + kho ý tưởng. */
planRoutes.get("/", async (c) => {
  const from = c.req.query("from");
  const days = Math.min(Math.max(Number(c.req.query("days") ?? 14), 1), 60);
  if (!isDate(from)) return c.json({ error: "from phải là YYYY-MM-DD" }, 400);
  const to = addDays(from, days);
  const plan = await readPlan();
  const slots = await Promise.all(
    plan.slots
      .filter((s) => s.date >= from && s.date < to)
      .map(async (s) => ({ ...s, progress: await slotProgress(s) })),
  );
  return c.json({ settings: plan.settings, slots, ideas: plan.ideas });
});

planRoutes.put("/settings", async (c) => {
  const body = (await c.req.json()) as Partial<PlanSettings>;
  const plan = await readPlan();
  plan.settings = {
    cadenceDays: { ...plan.settings.cadenceDays, ...body.cadenceDays },
    offsetDays: { ...plan.settings.offsetDays, ...body.offsetDays },
    postTime: { ...plan.settings.postTime, ...body.postTime },
  };
  await writePlan(plan);
  return c.json(plan.settings);
});

/** Điền ô trống theo nhịp từng kênh. Body: { from, days }. */
planRoutes.post("/fill", async (c) => {
  const { from, days } = (await c.req.json()) as { from?: string; days?: number };
  if (!isDate(from)) return c.json({ error: "from phải là YYYY-MM-DD" }, 400);
  return c.json({ added: await fillSlots(from, Math.min(Math.max(days ?? 14, 1), 60)) });
});

planRoutes.post("/slots", async (c) => {
  const b = (await c.req.json()) as Partial<PlanSlot>;
  if (!isDate(b.date) || !isSeries(b.series)) return c.json({ error: "Cần date + series" }, 400);
  const plan = await readPlan();
  const slot: PlanSlot = {
    id: newId(),
    date: b.date,
    series: b.series,
    title: str(b.title) ?? "",
    hook: str(b.hook),
    notes: str(b.notes),
    episode: str(b.episode),
  };
  plan.slots.push(slot);
  await writePlan(plan);
  return c.json(slot, 201);
});

planRoutes.patch("/slots/:id", async (c) => {
  const b = (await c.req.json()) as Partial<PlanSlot>;
  const plan = await readPlan();
  const slot = plan.slots.find((s) => s.id === c.req.param("id"));
  if (!slot) return c.json({ error: "Không thấy ô" }, 404);
  if (b.date !== undefined) {
    if (!isDate(b.date)) return c.json({ error: "date sai" }, 400);
    slot.date = b.date;
  }
  if (b.title !== undefined) slot.title = str(b.title) ?? "";
  if (b.hook !== undefined) slot.hook = str(b.hook);
  if (b.notes !== undefined) slot.notes = str(b.notes);
  if (b.episode !== undefined) slot.episode = str(b.episode);
  await writePlan(plan);
  return c.json(slot);
});

planRoutes.delete("/slots/:id", async (c) => {
  const plan = await readPlan();
  plan.slots = plan.slots.filter((s) => s.id !== c.req.param("id"));
  await writePlan(plan);
  return c.json({ ok: true });
});

/** Tạo tập từ ô (title/hook/series của ô, số tập tự đếm theo series) rồi gắn vào ô. */
planRoutes.post("/slots/:id/create-episode", async (c) => {
  const plan = await readPlan();
  const slot = plan.slots.find((s) => s.id === c.req.param("id"));
  if (!slot) return c.json({ error: "Không thấy ô" }, 404);
  if (slot.episode) return c.json({ error: `Ô đã gắn tập ${slot.episode}` }, 400);
  if (!slot.title) return c.json({ error: "Ô chưa có chủ đề" }, 400);
  try {
    // Mặc định theo series (hook, editorialLocked, nhạc) do createEmptyEpisode điền.
    const ep = await createEmptyEpisode({ title: slot.title, hook: slot.hook, series: slot.series });
    slot.episode = ep.name;
    await writePlan(plan);
    return c.json(slot);
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 400);
  }
});

planRoutes.post("/ideas", async (c) => {
  const b = (await c.req.json()) as { series?: string; title?: string; hook?: string; notes?: string };
  if (!isSeries(b.series) || !str(b.title)) return c.json({ error: "Cần series + title" }, 400);
  const plan = await readPlan();
  const idea = {
    id: newId(),
    series: b.series,
    title: str(b.title)!,
    hook: str(b.hook),
    notes: str(b.notes),
    createdAt: new Date().toISOString(),
  };
  plan.ideas.push(idea);
  await writePlan(plan);
  return c.json(idea, 201);
});

planRoutes.delete("/ideas/:id", async (c) => {
  const plan = await readPlan();
  plan.ideas = plan.ideas.filter((i) => i.id !== c.req.param("id"));
  await writePlan(plan);
  return c.json({ ok: true });
});

/** Đưa ý tưởng vào 1 ô trống cùng kênh (chép title/hook/notes, xoá khỏi kho). */
planRoutes.post("/ideas/:id/assign", async (c) => {
  const { slotId } = (await c.req.json()) as { slotId?: string };
  const plan = await readPlan();
  const idea = plan.ideas.find((i) => i.id === c.req.param("id"));
  const slot = plan.slots.find((s) => s.id === slotId);
  if (!idea || !slot) return c.json({ error: "Không thấy ý tưởng / ô" }, 404);
  if (slot.series !== idea.series) return c.json({ error: "Khác kênh" }, 400);
  if (slot.episode) return c.json({ error: "Ô đã gắn tập" }, 400);
  slot.title = idea.title;
  slot.hook = idea.hook;
  slot.notes = idea.notes;
  plan.ideas = plan.ideas.filter((i) => i.id !== idea.id);
  await writePlan(plan);
  return c.json(slot);
});

/** Kiểm tập có tồn tại (UI gắn tay slug có sẵn). */
planRoutes.get("/episode-exists/:name", async (c) => c.json({ exists: !!(await getEpisode(c.req.param("name"))) }));
