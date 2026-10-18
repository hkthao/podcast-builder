---
name: plan-week
description: Chủ nhật làm hàng loạt các tập trong "Kế hoạch đăng" (input/_plan.json, trang /plan) cho 1–2 tuần tới — điền lịch theo nhịp, Claude đề xuất chủ đề không lặp cho từng ô, tạo tập, chạy pipeline từng kênh (story-series cho Chuyện Xưa / Dòng Họ Việt, notebooklm-podcast cho ByteCast), gom các điểm cần user duyệt (chủ đề → nghe audio → xem cover) thành từng đợt, render hàng đợi rồi hẹn giờ đăng Facebook qua API. Dùng khi user nói "làm kế hoạch tuần tới", "chuẩn bị tuần sau", "lên lịch đăng", "làm hết các tập trong kế hoạch".
---

# Làm kế hoạch tuần (chủ nhật, hàng loạt)

User chỉ rảnh **chủ nhật** → làm xong cả tuần trong 1 phiên, Facebook tự đăng theo giờ hẹn. Nhịp mặc định: **mỗi kênh 2 ngày 1 tập** (~10 tập/tuần cho 3 kênh). Giờ đăng theo kênh ở `settings.postTime` của plan.

Dữ liệu: `input/_plan.json` (Claude được sửa trực tiếp, nhưng ưu tiên API để UI đồng bộ). Tiến độ mỗi ô **tự suy ra từ file tập** — không cần đánh dấu tay.

```bash
B=http://localhost:3000/api/plan
curl -s "$B?from=<YYYY-MM-DD>&days=7"                       # lịch + tiến độ + kho ý tưởng
curl -s -X POST $B/fill -H 'Content-Type: application/json' -d '{"from":"…","days":14}'
curl -s -X PATCH $B/slots/<id> -H 'Content-Type: application/json' -d '{"title":"…","hook":"…","notes":"…"}'
curl -s -X POST $B/slots/<id>/create-episode              # tạo tập (series + số tập đúng, editorialLocked cho kể chuyện)
curl -s -X POST $B/ideas -d '{"series":"…","title":"…","hook":"…","notes":"…"}' -H 'Content-Type: application/json'
```

## Trình tự — gom việc cần user thành ĐỢT (user không phải ngồi chờ từng tập)

1. **Đọc lịch** tuần tới (từ thứ Hai, hoặc khoảng user nói); thiếu ô → `fill`.
2. **Đợt duyệt 1 — chủ đề** (cách làm đã dùng tuần 19–25/10, user duyệt OK):
   - **Chống lặp:** liệt kê tiêu đề các tập cùng kênh (`input/*.json` theo `series`; ByteCast có >120 tập) + memory chủ đề bão hoà (cái chết/di sản, ý nghĩa sống, Plato hang động, Kahneman…) + chủ đề đã có trong `_plan.json`.
   - **Bảng đề xuất** gửi user: mỗi kênh 1 bảng `Ngày | Chủ đề | Hook` (Chuyện Xưa thêm cột *Bài học hôm nay*; Dòng Họ Việt thêm cột *Vật thể trục*). Tất cả đăng 19:00 (`settings.postTime` mặc định).
   - **Chuyện Xưa:** CHƯA có mục lục *Cổ học tinh hoa* (~250 truyện; web không có ToC) → đề xuất truyện cổ quen thuộc nhưng GHI RÕ "chưa xác minh có trong sách"; notes bắt đầu bằng `CHƯA XÁC MINH … kiểm trong sách + dán NGUYÊN VĂN, giải nghĩa và Lời bàn gốc (không tự bịa lời bàn)`. User có sách giấy/ebook (trang ~11/529 là "Không quên được cái cũ") → nhờ user dán.
   - **Dòng Họ Việt:** mỗi tập 1 vật thể khác nhau (áo dài cưới, mâm cơm giỗ, ảnh cả họ, lá thư…); notes = mẫu `Ngôi 'Tôi', 4 nhịp: vật thể + hook → 'ta thường nghĩ… nhưng' → câu nói/di sản ông bà + khoảnh khắc thế hệ sau → CTA nhẹ ghi lại ký ức/gia phả. ~550 chữ.` + vật thể trục + góc kể.
   - **ByteCast:** câu hỏi đời thường có tranh luận (tâm lý học/xã hội/triết), notes ghi khái niệm + tác giả/nghiên cứu nền + ví dụ đời thường + "Pipeline NotebookLM, ≥7/10 nguồn mới".
   - User duyệt ("ok điền vào lịch") → PATCH từng ô `{title, hook, notes}` (lấy id ô bằng GET `?from=…&days=7`). Ý tưởng dư → kho ý tưởng (`POST /ideas`).
3. **Tạo tập** cho mọi ô đã duyệt (`create-episode`).
4. **Kịch bản + audio cả loạt:** kể chuyện → skill **story-series** Bước 2–3b (`story.json` → `story-tts-gemini` → `story-align`); ByteCast → skill **notebooklm-podcast** (gen NotebookLM chạy nền, poll; nhớ quota).
5. **Đợt duyệt 2 — nghe audio:** gom file cả loạt (`input/<slug>.m4a`) + báo thời lượng, % neo caption → user nghe một lượt, chỉ ra tập cần gen lại.
6. **Footage cả loạt** (skill footage-shotlist; TRƯỚC cover vì footage-plan ghi đè config) → contact sheet, thay shot lộ người.
7. **Cover cả loạt** (prompt theo phong cách kênh → Gemini rẻ nhất) → **Đợt duyệt 3 — xem cover** (kiểm chữ tiếng Việt).
8. **Render hàng đợi:** `POST /api/render {"episodeName","preview":false,"regenTranscribe":false,"regenPlan":true}` lần lượt (server chạy song song tối đa 2; tập 4' ~10 phút, podcast 15' lâu hơn). Không `git checkout` khi đang render.
9. **Caption + đăng:** điền `publishCaption`, `publishHashtags`, `sources`, `musicCredit`, `aiAssisted`, `fbPlaylistId/Name`, `publishStatus:"ready"` vào config từng tập → hẹn giờ: trang **/plan → "Hẹn giờ N tập đã render"** (giờ = ngày ô + `postTime` kênh), hoặc CLI:
   ```bash
   curl -sN "http://localhost:3000/api/episodes/<slug>/publish?scheduledAt=<ISO>"   # SSE; video >90s → /{page}/videos + title + cover
   ```
   FB yêu cầu giờ hẹn cách hiện tại ≥10 phút và ≤75 ngày.
10. **Báo cáo:** bảng ngày × kênh với tình trạng; tập nào còn dở + vì sao.

## Đo reach (đang thử nghiệm)
Từ 2026-10-18 hẹn giờ đăng qua API **1 tuần để đo lại reach** (trước đây đăng API qua Reels chỉ 100–200 view so với đăng tay 2k–4k; đã đổi sang `/videos` kèm tiêu đề + cover). Sau tuần thử, so view các tập đăng API với các tập đăng tay trước đó và báo user trước khi quyết định giữ hay quay lại đăng tay.
