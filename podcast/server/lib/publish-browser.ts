/**
 * Đăng bán tự động qua Meta Business Suite: chạy scripts/fb-browser.ts fill trong
 * tiến trình TÁCH RỜI (server tsx-watch restart không giết nó), log ra
 * tmp/fb-browser/<slug>.log. Script tự bấm Schedule (user cho phép 2026-10-21).
 * Mỗi lần 1 tập — Chrome chỉ 1 cửa sổ composer.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { PATHS } from "../../../shared/studio-core/paths";

const LOG_DIR = path.join(PATHS.TMP_DIR, "fb-browser");
const LOCK = path.join(LOG_DIR, "_running.json");

const alive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

export function startBrowserFill(item: {
  episodeName: string;
  scheduledAt: string;
  playlistName?: string | null;
}): { log: string } {
  fs.mkdirSync(LOG_DIR, { recursive: true });
  try {
    const cur = JSON.parse(fs.readFileSync(LOCK, "utf8")) as { pid: number; episodeName: string };
    if (cur.pid && alive(cur.pid)) {
      throw new Error(`Đang đăng tập "${cur.episodeName}" qua Business Suite — đợi xong rồi bấm tiếp.`);
    }
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT" && !(e instanceof SyntaxError)) throw e;
  }
  const args = ["tsx", "podcast/scripts/fb-browser.ts", "fill", item.episodeName, "--at", item.scheduledAt, "--submit"];
  if (item.playlistName) args.push("--playlist", item.playlistName);
  const log = path.join(LOG_DIR, `${item.episodeName}.log`);
  const fd = fs.openSync(log, "w");
  const child = spawn("npx", args, { cwd: path.dirname(PATHS.TMP_DIR), detached: true, stdio: ["ignore", fd, fd] });
  child.unref();
  fs.closeSync(fd);
  fs.writeFileSync(LOCK, JSON.stringify({ pid: child.pid, episodeName: item.episodeName, startedAt: Date.now() }));
  return { log };
}
