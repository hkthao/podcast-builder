/**
 * Mô tả bài đăng FB + Trang theo series — dùng chung cho hàng đợi đăng API
 * (publish-queue) và đăng bán tự động qua Business Suite (scripts/fb-browser.ts).
 * Không có side effect khi import (publish-queue thì có: nạp + chạy tiếp job dở).
 */
import type { EpisodeConfig } from "../../src/episode";
import { getSeries } from "../../src/series";

/** ID Trang FB của series (env theo series.fbPageIdEnv; trống → token tự chọn Trang). */
export const fbPageIdFor = (series: string | null | undefined): string | undefined =>
  process.env[getSeries(series).fbPageIdEnv]?.trim() || undefined;

/** Dòng đầu caption = tiêu đề tập (khớp withTitleLead ở publish-ui); đã mở bằng tiêu đề thì giữ. */
const withTitleLead = (title: string | null | undefined, caption: string): string => {
  const t = (title ?? "").trim();
  const c = caption.trim();
  if (!t) return c;
  const norm = (x: string) => x.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  if (norm(c).startsWith(norm(t))) return c;
  return c ? `${t}\n\n${c}` : t;
};

/**
 * Dựng mô tả đầy đủ để đăng (khớp logic fullCaption + buildDisclosure ở
 * PublishTab): caption + hashtags + khối công bố AI/ghi công. Server tự dựng
 * từ config đã lưu (UI auto-save trước khi đăng).
 */
export const buildEpisodeDescription = (config: EpisodeConfig): string => {
  const caption = withTitleLead(config.title, config.publishCaption ?? "");
  const hashtagLine = (config.publishHashtags ?? []).map((h) => `#${h}`).join(" ");
  // Tên kênh theo series (khớp PublishTab UI) — dùng khi scriptCredit trống.
  const brandName = getSeries(config.series).channelName;
  const editor = config.scriptCredit?.trim() || brandName;
  const lines: string[] = [];
  if (config.aiAssisted) {
    lines.push(
      `Kịch bản gốc do ${editor} biên soạn và biên tập từ nhiều nguồn tham khảo; phần lời dẫn được tạo bằng công cụ giọng nói AI, do ${brandName} định hướng và biên tập.`,
    );
  } else {
    lines.push(`Kịch bản gốc do ${editor} biên soạn và biên tập.`);
  }
  // Ghi công cũ có sẵn tiền tố "Nhạc:" → bỏ để không thành "Nhạc nền: Nhạc: …" (khớp publish-ui).
  const music = config.musicCredit?.trim().replace(/^Nhạc( nền)?:\s*/i, "").replace(/\.$/, "");
  if (music) lines.push(`Nhạc nền: ${music}.`);
  if (config.footageCredit?.trim()) lines.push(`${config.footageCredit.trim()}.`);
  const sources = (config.sources ?? []).map((s) => s.trim()).filter(Boolean);
  if (sources.length) lines.push(`Nguồn tham khảo: ${sources.join("; ")}.`);
  const disclosure = lines.join("\n");
  return [caption, hashtagLine, disclosure]
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .join("\n\n");
};
