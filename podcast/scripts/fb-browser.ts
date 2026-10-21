/**
 * Đăng FB BÁN TỰ ĐỘNG qua Meta Business Suite (thay API — bài API bị phân phối kém,
 * xem memory fb-api-upload-low-reach). Script mở Chrome THẬT, profile riêng (đăng nhập
 * 1 lần), điền sẵn video + caption + giờ hẹn; NGƯỜI bấm nút cuối "Lên lịch".
 *
 *   npx tsx podcast/scripts/fb-browser.ts open              # mở Chrome (lần đầu: đăng nhập FB)
 *   npx tsx podcast/scripts/fb-browser.ts probe [url]       # chụp màn + liệt kê nút/ô (dò selector)
 *   npx tsx podcast/scripts/fb-browser.ts fill <slug> [--at 2026-10-24T12:00:00Z] [--playlist "Tên"] [--no-wait] [--submit]
 *
 * fill: Create reel → chọn Trang theo series → tải output/<slug>.mp4 → mô tả (giống
 * buildEpisodeDescription của bản API) → Next ×2 → Schedule (giờ VN) → playlist.
 * DỪNG trước nút "Schedule" — người kiểm rồi bấm. Script đợi composer đóng (đã bấm) rồi
 * ghi publishStatus=scheduled vào input/<slug>.json (--no-wait: thoát ngay, không ghi).
 * --submit: script TỰ bấm Schedule (user đã cho phép) — dùng khi đăng hàng loạt.
 * Không chọn được ảnh bìa trong composer Reel → FB lấy frame đầu (= ảnh cover của video).
 *
 * Chrome chạy tách rời với cổng CDP 9333 → các lệnh nối vào cùng 1 cửa sổ, đóng script
 * không đóng trình duyệt.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium, type Browser, type Page } from "playwright-core";
import { getEpisode, saveEpisode } from "../server/lib/episode-store";
import {
  buildEpisodeDescription,
  fbPageIdFor,
} from "../server/lib/publish-description";
import { getSeries } from "../src/series";

const CDP_PORT = 9333;
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PROFILE_DIR = path.join(
  os.homedir(),
  ".config",
  "podcast-builder",
  "fb-chrome",
);
const BS_HOME = "https://business.facebook.com/latest/home";

async function cdpUp(): Promise<boolean> {
  try {
    const r = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`);
    return r.ok;
  } catch {
    return false;
  }
}

/** Nối vào Chrome đang chạy; chưa có thì khởi động (tách rời khỏi script). */
export async function connectChrome(): Promise<Browser> {
  if (!(await cdpUp())) {
    fs.mkdirSync(PROFILE_DIR, { recursive: true });
    const child = spawn(
      CHROME,
      [
        `--remote-debugging-port=${CDP_PORT}`,
        `--user-data-dir=${PROFILE_DIR}`,
        "--no-first-run",
        "--no-default-browser-check",
        BS_HOME,
      ],
      { detached: true, stdio: "ignore" },
    );
    child.unref();
    for (let i = 0; i < 40 && !(await cdpUp()); i++)
      await new Promise((r) => setTimeout(r, 250));
  }
  return chromium.connectOverCDP(`http://127.0.0.1:${CDP_PORT}`);
}

async function activePage(browser: Browser): Promise<Page> {
  const ctx = browser.contexts()[0];
  const pages = ctx.pages().filter((p) => !p.url().startsWith("devtools://"));
  return (
    pages.find((p) => p.url().includes("facebook.com")) ??
    pages[0] ??
    (await ctx.newPage())
  );
}

/** "2026-10-24T12:00:00Z" → giờ VN (composer hiện múi Asia/Saigon). */
function vnParts(iso: string) {
  const d = new Date(Date.parse(iso) + 7 * 3600_000);
  const p = (n: number) => String(n).padStart(2, "0");
  return {
    date: `${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`,
    hh: p(d.getUTCHours()),
    mm: p(d.getUTCMinutes()),
  };
}

/**
 * Playwright qua connectOverCDP không gửi được file >50MB → dùng CDP gốc: chặn hộp chọn
 * file rồi DOM.setFileInputFiles với ĐƯỜNG DẪN (Chrome cùng máy tự đọc file từ đĩa).
 */
async function setFileViaChooser(
  page: Page,
  trigger: () => Promise<unknown>,
  filePath: string,
) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Page.enable");
  await cdp.send("Page.setInterceptFileChooserDialog", { enabled: true });
  try {
    const opened = new Promise<{ backendNodeId: number }>((resolve, reject) => {
      const t = setTimeout(
        () => reject(new Error("Không mở được hộp chọn file.")),
        15_000,
      );
      cdp.once("Page.fileChooserOpened", (ev) => {
        clearTimeout(t);
        resolve(ev as { backendNodeId: number });
      });
    });
    await trigger();
    const { backendNodeId } = await opened;
    await cdp.send("DOM.setFileInputFiles", {
      files: [filePath],
      backendNodeId,
    });
  } finally {
    await cdp
      .send("Page.setInterceptFileChooserDialog", { enabled: false })
      .catch(() => {});
    await cdp.detach().catch(() => {});
  }
}

async function fill(
  page: Page,
  slug: string,
  atArg: string | undefined,
  wait: boolean,
  videoArg?: string,
  playlistArg?: string,
  submit = false,
) {
  const ep = await getEpisode(slug);
  if (!ep) throw new Error(`Không thấy tập ${slug}`);
  const config = ep.config;
  const videoPath = videoArg
    ? path.resolve(videoArg)
    : path.join(process.cwd(), "output", `${slug}.mp4`);
  if (!fs.existsSync(videoPath))
    throw new Error(`Chưa có ${videoPath} — render trước.`);
  const at = atArg ?? config.scheduledPublishTime ?? undefined;
  if (!at || Number.isNaN(Date.parse(at)))
    throw new Error(
      "Thiếu giờ đăng: --at <ISO> (hoặc scheduledPublishTime trong config).",
    );
  if (Date.parse(at) < Date.now() + 15 * 60_000)
    throw new Error(`Giờ đăng ${at} quá gần/đã qua (FB cần ≥ 10 phút).`);
  const pageId = fbPageIdFor(config.series);
  if (!pageId)
    throw new Error(`Thiếu env ${getSeries(config.series).fbPageIdEnv}`);
  const channel = getSeries(config.series).channelName;
  const description = buildEpisodeDescription(config);
  const playlist = playlistArg ?? config.fbPlaylistName ?? null;
  const log = (m: string) => console.log(`[fb-browser] ${m}`);

  await page.bringToFront();
  page.on("dialog", (d) => void d.accept().catch(() => {})); // "rời trang?" khi composer cũ còn dở
  await page.goto(
    `https://business.facebook.com/latest/reels_composer/?asset_id=${pageId}&context_ref=HOME`,
    {
      waitUntil: "domcontentloaded",
    },
  );
  const postTo = page.getByRole("combobox").filter({ hasText: /\S/ }).first();
  await postTo.waitFor({ timeout: 30_000 });
  const postToText = (await postTo.innerText()).replace(/[​\s]+/g, " ").trim();
  // Tên Trang trên FB có thể khác channelName (vd "ByteCast Tech") → chỉ cảnh báo.
  log(
    `Trang: "${postToText}" (series ${config.series} → ${channel}, id ${pageId})`,
  );

  log(
    `Tải ${path.basename(videoPath)} (${(fs.statSync(videoPath).size / 1e6).toFixed(0)} MB)…`,
  );
  await setFileViaChooser(
    page,
    () => page.getByRole("button", { name: "Add video", exact: true }).click(),
    videoPath,
  );

  const title = (config.title ?? "").trim();
  if (title) {
    const titleInput = page.getByPlaceholder("Add a title to your reel");
    await titleInput.fill(title);
    log(`Tiêu đề: ${await titleInput.inputValue()}`);
  }

  const box = page.getByRole("textbox", { name: /Write in the dialogue box/ });
  await box.click();
  await page.keyboard.insertText(description);
  await page.keyboard.press("Escape").catch(() => {}); // đóng gợi ý hashtag nếu có
  const filled = (await box.innerText()).trim();
  if (filled.length < description.length * 0.9)
    log(
      `⚠ mô tả chỉ vào ${filled.length}/${description.length} ký tự — kiểm tra lại.`,
    );
  log(`Đã điền mô tả (${filled.length} ký tự).`);

  // Đợi upload xong: thanh tiến độ 100% + FB quét bản quyền.
  const t0 = Date.now();
  await page
    .getByText("100%", { exact: true })
    .first()
    .waitFor({ timeout: 60 * 60_000 });
  log(`Upload xong sau ${Math.round((Date.now() - t0) / 1000)}s.`);
  // Tags (ô placeholder "Add relevant keywords…") = hashtag của tập. Click 1 lần rồi gõ
  // từ + Enter liên tục — sau chip đầu placeholder biến mất nên không tìm lại được ô.
  const tags = (config.publishHashtags ?? [])
    .map((h) => h.replace(/^#/, "").trim())
    .filter(Boolean);
  if (tags.length) {
    try {
      const tagInput = page.getByPlaceholder(/Add relevant keywords/);
      await tagInput.scrollIntoViewIfNeeded({ timeout: 10_000 });
      await tagInput.click({ timeout: 10_000 });
      for (const t of tags) {
        await page.keyboard.type(t, { delay: 20 });
        await page.waitForTimeout(800);
        await page.keyboard.press("Enter");
        await page.waitForTimeout(400);
      }
      await page.keyboard.press("Escape").catch(() => {});
      log(`Tags: ${tags.join(", ")}`);
    } catch (e) {
      log(
        `⚠ chưa điền được Tags (${(e as Error).message.split("\n")[0]}) — thêm tay nếu cần.`,
      );
    }
  }

  // Thumbnail: mục "Thumbnail → Upload image" chỉ hiện sau khi upload video xong → ảnh cover.
  const coverPath = config.coverImage
    ? path.join(process.cwd(), "input", config.coverImage)
    : null;
  if (coverPath && fs.existsSync(coverPath)) {
    try {
      const up = page
        .getByRole("button", { name: "Upload image", exact: true })
        .first();
      await up.scrollIntoViewIfNeeded({ timeout: 15_000 });
      await setFileViaChooser(page, () => up.click(), coverPath);
      await page.waitForTimeout(3000);
      log(`Thumbnail: ${config.coverImage}`);
    } catch (e) {
      log(
        `⚠ chưa đặt được thumbnail (${(e as Error).message.split("\n")[0]}) — FB dùng frame gợi ý.`,
      );
    }
  }
  // Quét bản quyền chạy sau upload ("Checking for copyrighted content…") → đợi ra kết quả.
  const checking = page
    .getByText(/Checking for copyrighted|wait for results/i)
    .first();
  await checking
    .waitFor({ state: "hidden", timeout: 10 * 60_000 })
    .catch(() => log("⚠ quét bản quyền chưa xong sau 10 phút."));
  const verdict = page.getByText(/safe to publish|copyright/i).first();
  if (await verdict.isVisible().catch(() => false)) {
    const v = (await verdict.innerText()).trim();
    log(`Bản quyền: ${v}`);
    if (!/safe to publish/i.test(v))
      log(
        "⚠ KHÔNG phải 'safe to publish' — xem kỹ khung bên phải trước khi đăng.",
      );
  }

  const next = () =>
    page.getByRole("button", { name: "Next", exact: true }).last().click();
  await next(); // → Edit
  await page
    .getByRole("button", { name: "Optimisations" })
    .waitFor({ timeout: 30_000 });
  await next(); // → Share
  await page
    .getByRole("button", { name: "Schedule", exact: true })
    .first()
    .waitFor({ timeout: 30_000 });

  await page
    .getByRole("button", { name: "Schedule", exact: true })
    .first()
    .click(); // tuỳ chọn hẹn giờ (KHÔNG phải nút cuối)
  const vn = vnParts(at);
  const dateInput = page.getByPlaceholder("dd/mm/yyyy");
  await dateInput.click();
  await page.keyboard.press("Meta+A");
  await page.keyboard.type(vn.date);
  await page.keyboard.press("Enter");
  await page.getByRole("spinbutton", { name: "hours" }).click();
  await page.keyboard.type(vn.hh);
  await page.getByRole("spinbutton", { name: "minutes" }).click();
  await page.keyboard.type(vn.mm);
  // Composer hiện giờ theo múi của tài khoản (đã thấy Asia/Saigon, Asia/Jakarta — đều UTC+7).
  const tz = (
    await page
      .getByText(/^(Asia|Etc|Europe|America|UTC|GMT)[\/+-]?\w*/)
      .first()
      .innerText()
      .catch(() => "")
  ).trim();
  const tzOk =
    /Saigon|Ho_Chi_Minh|Jakarta|Bangkok|Phnom_Penh|Vientiane|GMT\+7|UTC\+7/i.test(
      tz,
    );
  log(
    `Hẹn giờ ${vn.date} ${vn.hh}:${vn.mm} (giờ VN) — múi composer: ${tz || "?"}${tzOk ? "" : "  ⚠ KHÔNG phải UTC+7, sửa giờ tay!"}`,
  );

  if (playlist) {
    await page
      .getByRole("switch", { name: "Add to playlist" })
      .click({ force: true });
    await page.getByRole("combobox", { name: /Select playlists/ }).click();
    const opt = page.getByRole("option", { name: playlist, exact: true });
    if (await opt.isVisible({ timeout: 5000 }).catch(() => false)) {
      await opt.click();
      log(`Playlist: ${playlist}`);
      await page.keyboard.press("Escape");
    } else {
      log(
        `⚠ Trang chưa có playlist "${playlist}" — bỏ qua (tạo playlist trên FB rồi thêm tay).`,
      );
      await page.keyboard.press("Escape");
      await page
        .getByRole("switch", { name: "Add to playlist" })
        .click({ force: true });
    }
  }

  const shot = path.join(
    process.cwd(),
    "tmp",
    "fb-browser",
    `${slug}.ready.png`,
  );
  fs.mkdirSync(path.dirname(shot), { recursive: true });
  await page.screenshot({ path: shot });
  if (submit) {
    // User cho phép tự bấm (2026-10-21). FB hay treo spinner "Scheduling your post" dù lịch
    // đã tạo xong → thấy spinner/rời composer là coi như xong, đợi thêm 20s cho chắc.
    const btn = page
      .getByRole("button", { name: "Schedule", exact: true })
      .last();
    const box = await btn.boundingBox();
    if (!box || box.y < 500)
      throw new Error("Không thấy nút Schedule ở chân composer.");
    await btn.click();
    log("Đã bấm Schedule.");
    await page
      .getByText(/Scheduling your post|has been scheduled|scheduled/i)
      .first()
      .waitFor({ timeout: 60_000 })
      .catch(() =>
        log("⚠ không thấy phản hồi sau khi bấm — kiểm tra lịch trên FB."),
      );
    await page.waitForTimeout(20_000);
  } else {
    log(
      `✓ Đã điền xong (${shot}). KIỂM TRA rồi bấm nút "Schedule" xanh ở góc dưới.`,
    );
    if (!wait) return;
  }

  // Đợi người bấm: composer rời trang reels_composer (FB về Planner/Content) → ghi config.
  if (!submit) log("Đợi bạn bấm Schedule (tối đa 60 phút)…");
  if (!submit) {
    // Dấu hiệu đã bấm: rời trang composer, hoặc FB báo "scheduled". Ghi lại URL/ảnh để chỉnh nếu FB đổi.
    const deadline = Date.now() + 60 * 60_000;
    for (;;) {
      if (Date.now() > deadline)
        throw new Error(
          "Hết 60 phút chưa thấy bấm Schedule — chưa ghi config.",
        );
      await page.waitForTimeout(2000);
      if (page.isClosed())
        throw new Error("Tab Business Suite đã đóng — chưa ghi config.");
      const left = !new URL(page.url()).pathname.includes("reels_composer");
      const toast = await page
        .getByText(
          /has been scheduled|reel scheduled|scheduled successfully|đã lên lịch/i,
        )
        .first()
        .isVisible()
        .catch(() => false);
      if (left || toast) {
        log(
          `Đã bấm (${left ? `rời composer → ${page.url()}` : "thấy thông báo scheduled"}).`,
        );
        break;
      }
    }
  }
  await saveEpisode(slug, {
    ...config,
    publishStatus: "scheduled",
    scheduledPublishTime: new Date(Date.parse(at)).toISOString(),
    ...(playlist ? { fbPlaylistName: playlist } : {}),
  });
  log(`✓ Đã ghi ${slug}: scheduled ${at} (đăng qua Business Suite).`);
}

/** Liệt kê phần tử tương tác đang hiện (role + tên) + chụp màn — để dò selector. */
async function probe(page: Page, outDir: string) {
  fs.mkdirSync(outDir, { recursive: true });
  const shot = path.join(outDir, `probe-${Date.now()}.png`);
  await page.screenshot({ path: shot });
  const items = await page.evaluate(() => {
    const out: string[] = [];
    const els = document.querySelectorAll(
      "button,[role=button],[role=tab],[role=menuitem],[role=option],[role=combobox],[role=switch],[role=checkbox],[role=radio],input,textarea,[contenteditable=true],a[href]",
    );
    for (const el of Array.from(els)) {
      const r = (el as HTMLElement).getBoundingClientRect();
      if (r.width < 2 || r.height < 2 || r.bottom < 0 || r.top > innerHeight)
        continue;
      const tag = el.tagName.toLowerCase();
      const role = el.getAttribute("role") ?? "";
      const label =
        el.getAttribute("aria-label") ??
        el.getAttribute("placeholder") ??
        ((el as HTMLElement).innerText || "").trim().slice(0, 60);
      const type = el.getAttribute("type") ?? "";
      out.push(
        `${tag}${role ? `[role=${role}]` : ""}${type ? `[type=${type}]` : ""} "${label.replace(/\s+/g, " ")}" @${Math.round(r.x)},${Math.round(r.y)}`,
      );
    }
    return out;
  });
  console.log(`URL ${page.url()}\nSHOT ${shot}\n` + items.join("\n"));
}

async function main() {
  try {
    process.loadEnvFile(path.join(process.cwd(), ".env"));
  } catch {
    /* không có .env */
  }
  const [cmd, ...rest] = process.argv.slice(2);
  const browser = await connectChrome();
  const page = await activePage(browser);
  if (cmd === "open") {
    if (!page.url().includes("business.facebook.com")) await page.goto(BS_HOME);
    await page.bringToFront();
    console.log(
      `Chrome đang mở (${page.url()}). Lần đầu: đăng nhập FB trong cửa sổ này.`,
    );
  } else if (cmd === "probe") {
    if (rest[0]) await page.goto(rest[0], { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1500);
    await probe(page, path.join(process.cwd(), "tmp", "fb-browser"));
  } else if (cmd === "fill" && rest[0]) {
    const arg = (flag: string) =>
      rest.indexOf(flag) >= 0 ? rest[rest.indexOf(flag) + 1] : undefined;
    // --video: thử nghiệm bằng file khác (vd clip ngắn) thay output/<slug>.mp4
    await fill(
      page,
      rest[0],
      arg("--at"),
      !rest.includes("--no-wait"),
      arg("--video"),
      arg("--playlist"),
      rest.includes("--submit"),
    );
  } else {
    console.error("Lệnh: open | probe [url] | fill <slug> [--at ISO]");
    process.exitCode = 1;
  }
  // Thoát thẳng (không browser.close) để Chrome tách rời vẫn mở.
  process.exit(process.exitCode ?? 0);
}

if (process.argv[1]?.endsWith("fb-browser.ts")) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
