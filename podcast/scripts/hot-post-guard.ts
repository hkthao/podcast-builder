/**
 * hot-post-guard.ts — phát hiện bài đang "cắn đề xuất" trên từng Trang và chỉ ra bài hẹn giờ kế
 * tiếp của Trang đó cần HOÃN 24 giờ (quy tắc user chốt 2026-10-24, xem skill plan-week mục
 * "Theo dõi sau đăng"). Chỉ ĐỌC Graph + ghi snapshot; KHÔNG tự đổi lịch.
 *
 *   npx tsx --env-file=.env podcast/scripts/hot-post-guard.ts [--json]
 *
 * Bài HOT khi (so với chính Trang đó):
 *   - đăng ≤72h và lượt phát (fb_reels_total_plays) ≥ 3× trung vị lượt phát 10 bài trước (và ≥300),
 *     HOẶC lượt chia sẻ ≥ 3× trung vị (và ≥5);
 *   - hoặc bài cũ "sống lại": lượt phát tăng trong ~24h (so snapshot trước) ≥ trung vị lượt phát
 *     cả đời của 10 bài trước (và ≥300).
 * Bài cần hoãn: config cùng series, publishStatus "scheduled", scheduledPublishTime trong 48h tới.
 * Graph KHÔNG trả giờ hẹn của bài tạo từ Business Suite → giờ lấy từ input/<slug>.json.
 * Exit 0 = không có gì · 3 = có bài cần hoãn (in danh sách).
 */
import fs from "node:fs";
import path from "node:path";
import { getApiKey } from "../../shared/studio-core/api-keys-store";
import { resolvePage } from "../../shared/studio-core/facebook";
import { fbPageIdFor } from "../server/lib/publish-description";
import { SERIES_IDS } from "../src/series";

const FACTOR = 3;
const MIN_PLAYS = 300;
const SNAP = path.resolve("tmp", "hot-post-guard.json");
const G = "https://graph.facebook.com/v21.0";

type Snap = Record<string, { at: string; plays: number }[]>;
type Post = { id: string; title: string; created: string; plays: number; shares: number };

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : 0;
};

async function posts(series: string): Promise<Post[]> {
  const page = await resolvePage(getApiKey("facebook")!, fbPageIdFor(series));
  const r = await (
    await fetch(`${G}/${page.id}/videos?fields=id,title,created_time,published&limit=25&access_token=${page.token}`)
  ).json();
  const out: Post[] = [];
  for (const v of (r.data ?? []).filter((v: { published: boolean }) => v.published).slice(0, 12)) {
    const ins = await (await fetch(`${G}/${v.id}/video_insights?access_token=${page.token}`)).json();
    const m: Record<string, unknown> = {};
    for (const i of ins.data ?? []) m[i.name] = i.values?.[0]?.value;
    out.push({
      id: v.id,
      title: v.title ?? "",
      created: v.created_time,
      plays: Number(m.fb_reels_total_plays ?? m.blue_reels_play_count ?? 0),
      shares: Number((m.post_video_social_actions as { SHARE?: number } | undefined)?.SHARE ?? 0),
    });
  }
  return out; // mới nhất trước
}

function nextScheduled(series: string, withinH: number) {
  const now = Date.now();
  return fs
    .readdirSync("input")
    .filter((f) => /^[^_][^.]*\.json$/.test(f))
    .map((f) => {
      try {
        return { slug: f.replace(/\.json$/, ""), c: JSON.parse(fs.readFileSync(path.join("input", f), "utf-8")) };
      } catch {
        return null;
      }
    })
    .filter(
      (x): x is { slug: string; c: { series?: string; publishStatus?: string; scheduledPublishTime?: string; title?: string } } =>
        !!x &&
        (x.c.series ?? "bytecast") === series &&
        x.c.publishStatus === "scheduled" &&
        !!x.c.scheduledPublishTime &&
        Date.parse(x.c.scheduledPublishTime) > now &&
        Date.parse(x.c.scheduledPublishTime) - now < withinH * 3600_000,
    )
    .sort((a, b) => Date.parse(a.c.scheduledPublishTime!) - Date.parse(b.c.scheduledPublishTime!))[0];
}

async function main() {
  const snap: Snap = fs.existsSync(SNAP) ? JSON.parse(fs.readFileSync(SNAP, "utf-8")) : {};
  const now = new Date();
  const actions: { series: string; hot: string; reason: string; postpone?: string; from?: string; to?: string }[] = [];

  for (const series of SERIES_IDS) {
    let ps: Post[];
    try {
      ps = await posts(series);
    } catch (e) {
      console.log(`[${series}] ⚠ không đọc được Graph: ${(e as Error).message}`);
      continue;
    }
    if (ps.length < 3) continue;
    for (const p of ps) {
      const hist = (snap[p.id] ??= []);
      hist.push({ at: now.toISOString(), plays: p.plays });
      if (hist.length > 14) hist.splice(0, hist.length - 14);
    }
    for (let i = 0; i < Math.min(ps.length, 5); i++) {
      const p = ps[i];
      const base = ps.slice(i + 1, i + 11);
      if (base.length < 3) break;
      const mPlays = median(base.map((b) => b.plays));
      const mShares = median(base.map((b) => b.shares));
      const ageH = (now.getTime() - Date.parse(p.created)) / 3600_000;
      // snapshot ~24h trước (20–30h) để đo tăng trong ngày
      const prev = (snap[p.id] ?? []).find((h) => {
        const d = (now.getTime() - Date.parse(h.at)) / 3600_000;
        return d >= 20 && d <= 30;
      });
      const day = prev ? p.plays - prev.plays : null;
      let reason = "";
      // Trang mới có trung vị rất thấp (vài lượt) → cần thêm sàn tuyệt đối để khỏi báo động giả.
      if (ageH <= 72 && mPlays > 0 && p.plays >= MIN_PLAYS && p.plays >= FACTOR * mPlays)
        reason = `${p.plays} lượt phát ≥ ${FACTOR}× trung vị ${Math.round(mPlays)}`;
      else if (ageH <= 72 && p.shares >= 5 && p.shares >= FACTOR * Math.max(mShares, 1))
        reason = `${p.shares} chia sẻ ≥ ${FACTOR}× trung vị ${mShares}`;
      else if (day !== null && mPlays > 0 && day >= MIN_PLAYS && day >= mPlays)
        reason = `+${day} lượt phát trong 24h (≥ trung vị cả đời ${Math.round(mPlays)})`;
      if (!reason) continue;
      const nxt = nextScheduled(series, 48);
      const a: (typeof actions)[number] = { series, hot: `${p.title || p.id} (${p.id})`, reason };
      if (nxt) {
        a.postpone = nxt.slug;
        a.from = nxt.c.scheduledPublishTime;
        a.to = new Date(Date.parse(nxt.c.scheduledPublishTime!) + 24 * 3600_000).toISOString();
      }
      actions.push(a);
      break; // 1 bài hot/Trang là đủ để quyết định
    }
  }
  fs.writeFileSync(SNAP, JSON.stringify(snap, null, 1));

  if (process.argv.includes("--json")) console.log(JSON.stringify(actions, null, 2));
  else if (!actions.length) console.log("Không có bài nào đang cắn đề xuất.");
  else
    for (const a of actions)
      console.log(
        `🔥 [${a.series}] ${a.hot} — ${a.reason}\n   ${
          a.postpone ? `→ HOÃN ${a.postpone}: ${a.from} → ${a.to}` : "→ không có bài hẹn giờ trong 48h tới"
        }`,
      );
  process.exit(actions.some((a) => a.postpone) ? 3 : 0);
}

main();
