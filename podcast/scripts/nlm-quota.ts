/**
 * nlm-quota.ts — sổ quota NotebookLM tự ghi (NotebookLM/`nlm` KHÔNG có API xem quota còn lại,
 * và hết quota thì `create` vẫn "thành công" nhưng bản gen nằm `in_progress` mãi — 2026-10-23).
 *
 * nlm-batch.ts ghi mỗi lần tạo bản gen (profile, kind, giờ) + đánh dấu "kẹt" khi bản gen quá
 * 45' chưa xong → coi tài khoản đó HẾT QUOTA tới khi cửa sổ 5h (tính từ lần gen đầu trong cửa
 * sổ) mở lại. Sổ: input/_nlm-quota.json (giữ qua các phiên, không ở tmp).
 *
 *   npx tsx podcast/scripts/nlm-quota.ts            # bảng còn bao nhiêu lượt / mở lại lúc nào
 *   npx tsx podcast/scripts/nlm-quota.ts pick       # in profile còn lượt nhiều nhất (exit 4 = hết cả)
 *   npx tsx podcast/scripts/nlm-quota.ts exhausted <profile> [--until=ISO]   # đánh dấu tay
 *   npx tsx podcast/scripts/nlm-quota.ts disable <profile> "<lý do>" | enable <profile>
 *
 * Hạn mức QUAN SÁT ĐƯỢC (chỉnh LIMITS khi biết thêm): Plus ~5–6 lượt gen (audio + video chung)
 * mỗi 5h — lượt thứ 6 trong cửa sổ 21:52 bị kẹt; tài khoản thường ~3 lượt/ngày.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const LEDGER = path.resolve("input", "_nlm-quota.json");
const H = 3600_000;

export const LIMITS: Record<string, { max: number; windowH: number }> = {
  plus: { max: 5, windowH: 5 },
  default: { max: 3, windowH: 24 },
};
const limitOf = (p: string) => LIMITS[p] ?? LIMITS.default;

type Entry = { profile: string; kind: string; slug: string; at: string; artifact?: string };
type Ledger = { entries: Entry[]; exhausted: Record<string, string>; disabled?: Record<string, string> }; // exhausted: profile → hết tới ISO; disabled: profile → lý do (hết phiên đăng nhập…)

const load = (): Ledger =>
  fs.existsSync(LEDGER) ? JSON.parse(fs.readFileSync(LEDGER, "utf-8")) : { entries: [], exhausted: {} };
const save = (l: Ledger) => fs.writeFileSync(LEDGER, JSON.stringify(l, null, 1));

/** Profile nlm đang dùng: NLM_PROFILE (theo tiến trình) hoặc default_profile trong config.toml. */
export function currentProfile(): string {
  if (process.env.NLM_PROFILE) return process.env.NLM_PROFILE;
  try {
    const t = fs.readFileSync(path.join(os.homedir(), ".notebooklm-mcp-cli", "config.toml"), "utf-8");
    return t.match(/default_profile\s*=\s*"([^"]+)"/)?.[1] ?? "default";
  } catch {
    return "default";
  }
}

/** Còn bao nhiêu lượt + mốc mở lại (cửa sổ trượt tính từ lần gen cũ nhất còn trong cửa sổ). */
export function status(profile: string, now = Date.now()) {
  const l = load();
  const { max, windowH } = limitOf(profile);
  const inWin = l.entries
    .filter((e) => e.profile === profile && now - Date.parse(e.at) < windowH * H)
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  let left = Math.max(0, max - inWin.length);
  let reopensAt = inWin.length ? new Date(Date.parse(inWin[0].at) + windowH * H) : null;
  const off = l.disabled?.[profile];
  if (off) return { profile, used: inWin.length, max, windowH, left: 0, reopensAt: null as Date | null, off };
  const ex = l.exhausted[profile];
  if (ex && Date.parse(ex) > now) {
    left = 0;
    reopensAt = new Date(ex);
  }
  return { profile, used: inWin.length, max, windowH, left, reopensAt, off: undefined as string | undefined };
}

export function record(e: Omit<Entry, "at" | "profile"> & { profile?: string }) {
  const l = load();
  l.entries.push({ ...e, profile: e.profile ?? currentProfile(), at: new Date().toISOString() });
  // giữ 14 ngày
  l.entries = l.entries.filter((x) => Date.now() - Date.parse(x.at) < 14 * 24 * H);
  save(l);
}

/** Đánh dấu hết quota (vd bản gen kẹt >45') tới khi cửa sổ mở lại. */
export function markExhausted(profile: string, until?: Date) {
  const l = load();
  const st = status(profile);
  const u = until ?? st.reopensAt ?? new Date(Date.now() + limitOf(profile).windowH * H);
  l.exhausted[profile] = u.toISOString();
  save(l);
  return u;
}

export function knownProfiles(): string[] {
  try {
    return fs.readdirSync(path.join(os.homedir(), ".notebooklm-mcp-cli", "profiles")).filter((p) => !p.startsWith("."));
  } catch {
    return ["plus"];
  }
}

const fmt = (d: Date | null) =>
  d ? d.toLocaleString("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" }) : "—";

if (import.meta.url === `file://${process.argv[1]}`) {
  const [cmd, arg] = process.argv.slice(2);
  if ((cmd === "disable" || cmd === "enable") && arg) {
    const l = load();
    l.disabled ??= {};
    if (cmd === "disable") l.disabled[arg] = process.argv[4] ?? "tắt";
    else delete l.disabled[arg];
    save(l);
    console.log(`${arg}: ${cmd === "disable" ? "tắt" : "bật lại"}`);
  } else if (cmd === "exhausted" && arg) {
    const until = process.argv.find((a) => a.startsWith("--until="))?.split("=")[1];
    console.log(`${arg}: hết quota tới ${fmt(markExhausted(arg, until ? new Date(until) : undefined))}`);
  } else if (cmd === "pick") {
    const best = knownProfiles()
      .map((p) => status(p))
      .filter((s) => s.left > 0)
      .sort((a, b) => b.left - a.left)[0];
    if (!best) process.exit(4);
    console.log(best.profile);
  } else {
    for (const p of knownProfiles()) {
      const s = status(p);
      console.log(
        s.off
          ? `${p.padEnd(10)} TẮT — ${s.off}`
          : `${p.padEnd(10)} còn ${s.left}/${s.max} (cửa sổ ${s.windowH}h)${s.left === 0 ? ` — mở lại ~${fmt(s.reopensAt)}` : ""}`,
      );
    }
  }
}
