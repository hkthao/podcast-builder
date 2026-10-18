/**
 * Kế hoạch nội dung 1–2 tuần (input/_plan.json) — user chỉ rảnh chủ nhật: chủ nhật
 * Claude Code làm hàng loạt các tập trong lịch (skill plan-week), rồi hẹn giờ đăng
 * qua API; tới ngày Facebook tự đăng.
 *
 * File JSON (không phải DB) để Claude đọc/sửa trực tiếp khi chạy hàng loạt.
 * Tiến độ mỗi ô KHÔNG lưu tay — suy ra từ file của tập gắn với ô.
 */
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { PATHS } from "../../../shared/studio-core/paths";
import { SERIES_IDS, type SeriesId } from "../../src/series";
import { getEpisode, type EpisodeSummary } from "./episode-store";

const PLAN_FILE = path.join(PATHS.INPUT_DIR, "_plan.json");

export type PlanSlot = {
  id: string;
  /** Ngày đăng YYYY-MM-DD (giờ VN). */
  date: string;
  series: SeriesId;
  title: string;
  hook: string | null;
  /** Ghi chú cho Claude khi làm tập: nguồn, truyện gốc, vật thể trục, góc nhìn… */
  notes: string | null;
  /** Slug tập đã tạo cho ô (input/<slug>.json). null = chưa tạo. */
  episode: string | null;
};

export type PlanIdea = {
  id: string;
  series: SeriesId;
  title: string;
  hook: string | null;
  notes: string | null;
  createdAt: string;
};

export type PlanSettings = {
  /** Mỗi kênh N ngày 1 tập (user chốt 2026-10-18: 2). */
  cadenceDays: Record<SeriesId, number>;
  /** Lệch ngày để các kênh không dồn cùng ngày (0..cadence-1). */
  offsetDays: Record<SeriesId, number>;
  /** Giờ đăng HH:MM theo giờ VN. */
  postTime: Record<SeriesId, string>;
};

export type Plan = { version: 1; settings: PlanSettings; slots: PlanSlot[]; ideas: PlanIdea[] };

const DEFAULT_SETTINGS: PlanSettings = {
  cadenceDays: { bytecast: 2, "chuyen-xua": 2, "dong-ho-viet": 2 },
  offsetDays: { bytecast: 0, "chuyen-xua": 1, "dong-ho-viet": 1 },
  postTime: { bytecast: "19:00", "chuyen-xua": "19:00", "dong-ho-viet": "19:00" },
};

const newId = () => crypto.randomBytes(5).toString("hex");

export async function readPlan(): Promise<Plan> {
  try {
    const raw = JSON.parse(await fs.readFile(PLAN_FILE, "utf-8")) as Partial<Plan>;
    return {
      version: 1,
      settings: {
        cadenceDays: { ...DEFAULT_SETTINGS.cadenceDays, ...raw.settings?.cadenceDays },
        offsetDays: { ...DEFAULT_SETTINGS.offsetDays, ...raw.settings?.offsetDays },
        postTime: { ...DEFAULT_SETTINGS.postTime, ...raw.settings?.postTime },
      },
      slots: raw.slots ?? [],
      ideas: raw.ideas ?? [],
    };
  } catch {
    return { version: 1, settings: DEFAULT_SETTINGS, slots: [], ideas: [] };
  }
}

export async function writePlan(plan: Plan): Promise<void> {
  plan.slots.sort((a, b) => a.date.localeCompare(b.date) || a.series.localeCompare(b.series));
  await fs.writeFile(PLAN_FILE, JSON.stringify(plan, null, 2));
}

/** YYYY-MM-DD → số ngày kể từ 1970-01-01 (mốc cố định để nhịp "N ngày 1 tập" ổn định qua các tuần). */
const dayNumber = (date: string) => Math.round(Date.parse(`${date}T00:00:00Z`) / 86_400_000);
export const addDays = (date: string, n: number) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** Tạo ô trống theo nhịp từng kênh cho [from, from+days); ô đã có giữ nguyên. Trả số ô thêm. */
export async function fillSlots(from: string, days: number): Promise<number> {
  const plan = await readPlan();
  let added = 0;
  for (let i = 0; i < days; i++) {
    const date = addDays(from, i);
    for (const series of SERIES_IDS) {
      const every = plan.settings.cadenceDays[series];
      if (!every || every < 1) continue;
      const due = (((dayNumber(date) - plan.settings.offsetDays[series]) % every) + every) % every === 0;
      if (!due || plan.slots.some((s) => s.date === date && s.series === series)) continue;
      plan.slots.push({ id: newId(), date, series, title: "", hook: null, notes: null, episode: null });
      added++;
    }
  }
  await writePlan(plan);
  return added;
}

/** Tiến độ của ô — suy ra từ file tập (không lưu tay). */
export type SlotProgress = {
  episodeTitle: string | null;
  script: boolean;
  audio: boolean;
  footage: boolean;
  cover: boolean;
  rendered: boolean;
  scheduled: boolean;
  published: boolean;
  scheduledAt: string | null;
  /** Việc tiếp theo cần làm (hiển thị trên ô). */
  next: string;
};

const fileExists = (p: string) =>
  fs.access(p).then(
    () => true,
    () => false,
  );

export async function slotProgress(slot: PlanSlot): Promise<SlotProgress> {
  const ep: EpisodeSummary | null = slot.episode ? await getEpisode(slot.episode) : null;
  if (!ep) {
    return {
      episodeTitle: null,
      script: false,
      audio: false,
      footage: false,
      cover: false,
      rendered: false,
      scheduled: false,
      published: false,
      scheduledAt: null,
      next: slot.title ? "Tạo tập" : "Chọn chủ đề",
    };
  }
  const input = PATHS.INPUT_DIR;
  const script =
    (await fileExists(path.join(input, `${ep.name}.story.json`))) ||
    (await fileExists(path.join(input, `${ep.name}.essay.txt`)));
  const p = {
    episodeTitle: ep.config.title,
    script,
    audio: !!ep.audioPath,
    footage: ep.config.footage.length > 0,
    cover: !!ep.config.coverImage,
    rendered: ep.hasOutput && ep.status !== "outdated",
    scheduled: ep.config.publishStatus === "scheduled",
    published: ep.config.publishStatus === "published",
    scheduledAt: ep.config.scheduledPublishTime ?? null,
  };
  const next = p.published
    ? "Đã đăng"
    : p.scheduled
      ? "Chờ tới giờ đăng"
      : !p.script
        ? "Viết kịch bản"
        : !p.audio
          ? "Gen audio"
          : !p.footage
            ? "Làm footage"
            : !p.cover
              ? "Tạo cover"
              : !p.rendered
                ? ep.status === "outdated"
                  ? "Render lại"
                  : "Render"
                : "Hẹn giờ đăng";
  return { ...p, next };
}

export { newId };
