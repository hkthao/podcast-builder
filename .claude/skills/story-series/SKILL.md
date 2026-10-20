---
name: story-series
description: Làm 1 tập video KỂ CHUYỆN cho các series kể chuyện của studio — "Chuyện Xưa - Ngẫm Nay" (truyện Cổ học tinh hoa + lời bàn + bài học hôm nay) và "Dòng Họ Việt" (gia đình · gia phả · ký ức · nguồn cội, ngôi "Tôi"). Claude viết input/<slug>.story.json theo hướng dẫn nội dung của series → Gemini TTS (giọng/chỉ đạo/tempo theo series) → story-align căn chữ kịch bản vào timing whisper → cover Gemini + footage-shotlist + render Remotion → đăng Trang FB của series. Dùng khi user đưa truyện cổ / chủ đề gia đình-gia phả để làm tập mới, hoặc nhắc "Cổ học tinh hoa", "kể chuyện", "Dòng Họ Việt", "gia phả".
---

# Video kể chuyện theo series (Gemini TTS → Remotion)

Một pipeline chung cho mọi series kể chuyện; khác nhau ở **nội dung** + **cấu hình series**.

| Series (`config.series`) | Hướng dẫn nội dung | Giọng (series.ts → `tts`) |
|---|---|---|
| `chuyen-xua` — Chuyện Xưa - Ngẫm Nay | [references/chuyen-xua.md](references/chuyen-xua.md) | **NotebookLM Video Overview, 1 người kể** (từ 2026-10-20 — xem file hướng dẫn); Gemini Autonoe chỉ còn ở tập cũ |
| `dong-ho-viet` — Dòng Họ Việt | [references/dong-ho-viet.md](references/dong-ho-viet.md) | Nam Alnilam dẫn tài liệu, tempo 1.0 (đổi từ Charon 2026-10-19) |
| `tien-tam-ly` — Tiền & Tâm Lý (kinh tế × tâm lý, ≥3') | [references/tien-tam-ly.md](references/tien-tam-ly.md) | **Audio NotebookLM** (podcast ngắn, từ tập 2 — 2026-10-20) + cảnh vẽ tay `viz-anchor.ts`; Gemini đối thoại chỉ còn ở tập 1 |

**Đọc file hướng dẫn của series TRƯỚC khi viết.** Cấu hình series (thương hiệu, bảng màu, logo, giọng, Trang FB, playlist) ở `podcast/src/series.ts` (bản sao gọn cho UI: `ui/src/lib/series.ts` — sửa cả hai).

Luồng: **nội dung → story.json → Gemini TTS → user nghe QC → story-align → config + cover + footage → render → đăng.**
Transcript = chữ kịch bản căn vào timing whisper + chương từ kịch bản → render BỎ QUA whisper sửa chữ, spell-fix, LLM editorial (không tốn OpenAI).

## Bước 1 — Tạo tập
Tạo qua UI (trang danh sách của series → "Tạo tập mới"; ô kế hoạch → "Tạo tập") hoặc API `POST /api/episodes {"title","series"}` → `input/<slug>.json` có `series` + **số tập tự đếm riêng theo series**. Server tự điền mặc định series (`editorialLocked: true`; `hook: null` nếu series `hookCard: false` (Chuyện Xưa, Dòng Họ Việt — hook nằm trong kịch bản); nhạc nền gần nhất của series) — không cần sửa config.

## Bước 2 — Viết `input/<slug>.story.json`
```json
{
  "title": "tiêu đề video",
  "source": { "name": "…", "title": "…" },   // tuỳ chọn — trích dẫn nguồn trên video
  "sections": [
    { "id": "…", "chapter": "Tên chương ≤6 từ", "cite": true, "text": "…" },
    { "id": "ket", "text": "…" }
  ]
  // tuỳ chọn ghi đè series: "geminiVoice", "geminiDirectorNote", "tempo"
}
```
- `chapter` → tiêu đề chương trên video (EditorialOverlay); bỏ trống = không mở chương. `cite: true` → hiện trích dẫn `source` ở đầu phần đó.
- **Văn phong viết để ĐỌC:** câu ngắn–vừa, dấu phẩy = chỗ thở; số viết thành chữ; không viết tắt/ký hiệu/gạch đầu dòng/ngoặc kép (lời thoại dẫn bằng dấu hai chấm); "…" chỉ 1–2 chỗ đắt (nhiều → dừng lâu).
- Gemini PHẢI đọc đúng kịch bản để căn caption — phần nào đọc thêm/bớt câu → gen lại.

## Bước 3 — Gen audio Gemini
**Mặc định 1 lệnh** (gồm cả Bước 3b + QC, tự gen lại khi trượt):
```bash
npx tsx story/scripts/story-audio.ts <slug> [--fresh]   # exit 0 = đạt (neo chữ ≥70% + giọng Bắc), 2 = trượt 3 lần
```
Các lệnh lẻ bên dưới để thử giọng / gen lại 1 phần / gỡ lỗi:
```bash
npx tsx story/scripts/story-tts-gemini.ts <slug>                          # gen (≤900 chữ/lần → tập ~4' = 1 lần, giọng đều)
npx tsx story/scripts/story-tts-gemini.ts <slug> --part=2                 # gen lại riêng 1 phần
npx tsx story/scripts/story-tts-gemini.ts <slug> --voice=Iapetus --tag=iapetus   # thử giọng khác → input/<slug>.parts-iapetus/ (không đè)
```
Key Gemini lấy từ trang Settings. Giọng/chỉ đạo/tempo lấy theo series của tập. Bản tay (AI Studio, ≤200 chữ/phần): `story-tts-brief.ts <slug>` → `input/<slug>.tts.md`.
→ **QC giọng tự động:** `npx tsx story/scripts/audio-qc.ts <slug>` (Gemini nghe audio, chấm Bắc/Nam từng đoạn; exit 0 = đạt, 2 = trượt → gen lại). Đã kiểm: tập tốt pass, bản lẫn giọng Nam fail. Chạy tay thì user nghe thêm cũng được.

## Bước 3b — Ghép + căn chữ
```bash
npx tsx story/scripts/story-align.ts <slug>
```
Ghép phần (+ `atempo` theo tempo series) → `input/<slug>.m4a`; whisper chỉ lấy timing; transcript `tmp/<slug>.json` + `.corrected.json` = CHỮ KỊCH BẢN theo câu; `tmp/<slug>.editorial.json`; xoá plan.json cũ. Log "neo X/Y từ": ≥85% tốt; <70% → audio không khớp story.json.
QC đủ chữ bằng whisper.cpp: dùng bản CÓ timestamp (bỏ `-nt`) — bản `-nt` hay bỏ sót cả đoạn → báo thiếu oan.

## Bước 4 — Footage (TRƯỚC cover — footage-plan --apply ghi đè config)
Skill **footage-shotlist** (`--all-pexels --brief` → Claude viết shot-list theo gợi ý hình của series → `--apply`). Xem contact sheet khung giữa từng shot: loại shot lộ người/lạc ý (thay riêng 1 shot: tải clip Pexels khác, prep cùng thông số, cập nhật ghi công + `input/_footage-used.json`).

## Bước 5 — Cover (Gemini, rẻ nhất)
Claude viết prompt theo phong cách cover của series (xem file hướng dẫn) → ghi `config.coverPrompt` → nút "Tạo ảnh" (Gemini) ở tab Render hoặc `POST /api/episodes/<slug>/cover-image?provider=gemini` → **kiểm chữ tiếng Việt trên ảnh** (model hay sai dấu; chữ thư pháp bay dễ đọc sai → yêu cầu "clean legible serif").

## Bước 6 — Render + đăng
- `POST /api/render {"episodeName":"<slug>","preview":false,"regenTranscribe":false,"regenPlan":true}` — KHÔNG regenTranscribe (ghi đè transcript chuẩn).
- Caption/hashtag/nguồn/nhạc ghi vào config (`publishCaption`, `publishHashtags`, `sources`, `musicCredit`, `aiAssisted: true`, `publishStatus: "ready"`, `fbPlaylistId/Name`). Tab Đăng tự dựng khối công bố với tên kênh của series, đăng lên Trang theo env `fbPageIdEnv` của series.
- **Nhạc:** ưu tiên CC0/Public Domain (`input/_music/90_satie…`, `91_chopin…`, `92_satie…`) — Scott Buckley (CC BY) ĐÃ bị Content ID đánh trên tập thật (2026-09).

## Bẫy đã gặp
- Thiếu dòng Accent trong director's note → Gemini tự chọn giọng mỗi lần gen → lẫn Nam/Bắc giữa các phần. Note của series đã khoá giọng Bắc.
- Chỉ đạo "đọc nhanh" KHÔNG có tác dụng → chỉnh `tempo` (atempo giữ cao độ). Đổi tempo SAU khi làm footage → tăng tốc cả clip footage cùng tỉ lệ (FootageLayer xếp clip nối tiếp theo độ dài) hoặc làm lại footage.
- TTS local (OmniVoice, F5) đã thử, không tự nhiên → dùng Gemini.
- Whisper cắt âm tiết thành nhiều token → forced-align ghép token không có khoảng trắng đầu (`shared/lib/forced-align.ts`).
