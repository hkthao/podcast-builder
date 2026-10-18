---
name: plan-week
description: Chủ nhật làm hàng loạt các tập trong "Kế hoạch đăng" (input/_plan.json, trang /plan) cho 1–2 tuần tới — điền lịch theo nhịp, Claude đề xuất chủ đề không lặp cho từng ô, tạo tập, chạy pipeline từng kênh (story-series cho Chuyện Xưa / Dòng Họ Việt, notebooklm-podcast cho ByteCast), CHẠY TỰ ĐỘNG HOÀN TOÀN: user CHỈ duyệt danh sách chủ đề + bấm "Hẹn giờ" đăng — Claude tự QC audio (Gemini audio-qc / thời lượng), tự kiểm footage + chữ trên cover, tự render và chờ, tự điền caption. Dùng khi user nói "làm kế hoạch tuần tới", "chuẩn bị tuần sau", "lên lịch đăng", "làm hết các tập trong kế hoạch".
---

# Làm kế hoạch tuần (chủ nhật, TỰ ĐỘNG HOÀN TOÀN)

User chỉ rảnh **chủ nhật** và muốn **Claude chạy tự động cả tuần** (chốt 2026-10-18). User chỉ làm **2 việc**: (1) duyệt danh sách chủ đề, (2) bấm **/plan → "Hẹn giờ N tập đã render"**. Mọi QC khác Claude tự làm theo các cổng bên dưới — KHÔNG dừng hỏi user giữa chừng; lỗi không tự xử được thì ghi vào báo cáo cuối, làm tiếp tập khác.

Nhịp mặc định: **mỗi kênh 2 ngày 1 tập** (~10 tập/tuần), giờ đăng **19:00** (`settings.postTime`).

Dữ liệu: `input/_plan.json` (ưu tiên API để UI đồng bộ). Tiến độ ô tự suy ra từ file tập; trang /plan hiện % render của từng ô, /render-queue hiện hàng đợi.

```bash
B=http://localhost:3000/api/plan
curl -s "$B?from=<YYYY-MM-DD>&days=7"                       # lịch + tiến độ + kho ý tưởng
curl -s -X POST $B/fill -H 'Content-Type: application/json' -d '{"from":"…","days":14}'
curl -s -X PATCH $B/slots/<id> -H 'Content-Type: application/json' -d '{"title":"…","hook":"…","notes":"…"}'
curl -s -X POST $B/slots/<id>/create-episode              # tạo tập (series + số tập đúng, editorialLocked cho kể chuyện)
curl -s -X POST $B/ideas -d '{"series":"…","title":"…","hook":"…","notes":"…"}' -H 'Content-Type: application/json'
curl -s http://localhost:3000/api/cleanup                  # dung lượng ổ + các mục dọn được
```

## Cổng tự QC (thay các lần user duyệt trước đây)
| Bước | Cổng tự động | Không đạt |
|---|---|---|
| Audio ByteCast (NotebookLM) | **Thời lượng 14–18'** (user chốt: chất lượng đã tốt, chỉ cần đúng thời lượng) + cắt đuôi im lặng | Roll bản khác (quota: Plus 6/5h, tài khoản khác 3) |
| Audio kể chuyện (Gemini TTS) | `npx tsx story/scripts/audio-qc.ts <slug>` (exit 0 = giọng Bắc đều) + whisper.cpp **có timestamp** đối chiếu đủ chữ + % neo ≥85 | Gen lại tối đa 2 lần, vẫn lỗi → báo cáo |
| Footage | Contact sheet khung giữa từng shot → Claude XEM: không người, không lạc ý, không lặp | Sửa query / thay riêng shot |
| Cover | Claude XEM ảnh: chữ tiếng Việt đúng từng dấu, đọc rõ, đúng phong cách kênh | Tạo lại tối đa 3 lần (yêu cầu chữ serif rõ) |
| Render | Job `done`, file `output/<slug>.mp4` tồn tại, thời lượng ≈ audio + intro/outro | Render lại 1 lần, vẫn lỗi → báo cáo |

## Trình tự — chỉ dừng hỏi user DUY NHẤT ở bước 2 (duyệt chủ đề)

1. **Đọc lịch** tuần tới (từ thứ Hai, hoặc khoảng user nói); thiếu ô → `fill`.
2. **Đợt duyệt 1 — chủ đề** (cách làm đã dùng tuần 19–25/10, user duyệt OK):
   - **Chống lặp:** liệt kê tiêu đề các tập cùng kênh (`input/*.json` theo `series`; ByteCast có >120 tập) + memory chủ đề bão hoà (cái chết/di sản, ý nghĩa sống, Plato hang động, Kahneman…) + chủ đề đã có trong `_plan.json`.
   - **Bảng đề xuất** gửi user: mỗi kênh 1 bảng `Ngày | Chủ đề | Hook` (Chuyện Xưa thêm cột *Bài học hôm nay*; Dòng Họ Việt thêm cột *Vật thể trục*). Tất cả đăng 19:00 (`settings.postTime` mặc định).
   - **Chuyện Xưa:** CHỌN TRUYỆN TỪ SÁCH — `references/co-hoc-tinh-hoa/index.md` (243 truyện, bản đầy đủ thuviensach.vn; mỗi truyện 1 file `truyen/NNN-<slug>.txt` gồm nguyên văn + giải nghĩa + LỜI BÀN). Ưu tiên truyện có Lời bàn (✓) và bài học sát đời sống hôm nay; KHÔNG trùng truyện đã làm (kiểm `source.title` trong `input/*.story.json`). Tên tập có thể đặt dễ hiểu hơn tên sách (vd #92 "Thành thực" → "Tăng Tử giết lợn"). Notes ghi đường dẫn file + `source.title` = tên trong sách → khi làm tập Claude đọc file, kể SÁT nguyên văn, dùng đúng Lời bàn (không bịa).
   - **Dòng Họ Việt:** mỗi tập 1 vật thể khác nhau (áo dài cưới, mâm cơm giỗ, ảnh cả họ, lá thư…); notes = mẫu `Ngôi 'Tôi', 4 nhịp: vật thể + hook → 'ta thường nghĩ… nhưng' → câu nói/di sản ông bà + khoảnh khắc thế hệ sau → CTA nhẹ ghi lại ký ức/gia phả. ~550 chữ.` + vật thể trục + góc kể.
   - **ByteCast:** câu hỏi đời thường có tranh luận (tâm lý học/xã hội/triết), notes ghi khái niệm + tác giả/nghiên cứu nền + ví dụ đời thường + "Pipeline NotebookLM, ≥7/10 nguồn mới".
   - User duyệt ("ok điền vào lịch") → PATCH từng ô `{title, hook, notes}` (lấy id ô bằng GET `?from=…&days=7`). Ý tưởng dư → kho ý tưởng (`POST /ideas`).
3. **Tạo tập** cho mọi ô đã duyệt: nút "Tạo N tập" trên /plan (hoặc `create-episode` từng ô). Server tự điền mặc định theo series (Chuyện Xưa không hook, kể chuyện `editorialLocked`, nhạc nền bản chọn gần nhất CỦA SERIES) — không sửa config tay.
4. **Dọn ổ:** server TỰ dọn các mục an toàn khi trống < 25 GB lúc hàng đợi render bắt đầu chạy. Chỉ cần làm tay mục nặng (footage/video tập cũ, `POST /api/cleanup`) khi vẫn thiếu — ghi vào báo cáo.
5. **Audio ByteCast TRƯỚC** (NotebookLM chậm + có quota): research → bài luận theo `notebooklm-podcast/references/essay-pattern.md` + focus + danh sách URL → **`nlm-batch.ts <slug>` chạy nền** (tự tạo notebook, nạp nguồn, gen 2 bản, tải, chọn bản 14–18'). Exit 2 → `--takes=1` roll thêm (để ý quota). Trong lúc chờ NotebookLM, làm song song các tập kể chuyện.
6. **Kể chuyện cả loạt:** Claude viết `story.json` (skill story-series Bước 2) → **`npx tsx story/scripts/story-audio.ts <slug>`** (TTS → căn chữ → audio-qc, trượt thì tự gen lại tối đa 3 lần; exit 0 = đạt). Chuyện Xưa thiếu nguyên văn truyện → bỏ qua ô đó, ghi báo cáo (KHÔNG tự bịa nguyên văn/lời bàn).
7. **Transcript + editorial ByteCast:** spell-fix bằng Claude (dump/apply) → `editorial-manual.ts brief|apply` (Claude viết chương/trích dẫn, không gpt-4o).
8. **Footage cả loạt** (skill footage-shotlist; TRƯỚC cover — footage-plan ghi đè config) → cổng footage.
9. **Cover cả loạt** (prompt theo phong cách kênh → `POST /api/episodes/<slug>/cover-image?provider=gemini`) → cổng cover.
10. **Render:** `POST /api/render {"episodeName","preview":false,"regenTranscribe":false,"regenPlan":true}` cho mọi tập đủ điều kiện (server chạy 2 job song song; KHÔNG `git checkout` khi đang render) → chờ bằng Bash nền (`until` poll `/api/render/jobs`), không ngồi poll tay → cổng render.
11. **Caption + playlist:** điền `publishCaption`, `publishHashtags`, `sources`, `musicCredit`, `aiAssisted:true`, `fbPlaylistId/Name`, `publishStatus:"ready"` theo hướng dẫn từng kênh.
12. **Báo cáo cuối** (bảng ngày × kênh): ✓ sẵn sàng hẹn giờ / ⚠ việc còn dở + lý do (quota, thiếu nguyên văn, QC trượt) + dung lượng ổ còn lại. Nhắc user: **mở /plan → bấm "Hẹn giờ N tập đã render"** (FB yêu cầu giờ hẹn cách hiện tại ≥10 phút, ≤75 ngày; tập >90s đăng qua `/{page}/videos` + tiêu đề + cover). Chỉ khi user nhờ mới tự hẹn giờ bằng CLI:
    ```bash
    curl -sN "http://localhost:3000/api/episodes/<slug>/publish?scheduledAt=<ISO>"
    ```

## Đo reach (đang thử nghiệm)
Từ 2026-10-18 hẹn giờ đăng qua API **1 tuần để đo lại reach** (trước đây đăng API qua Reels chỉ 100–200 view so với đăng tay 2k–4k; đã đổi sang `/videos` kèm tiêu đề + cover). Sau tuần thử, so view các tập đăng API với các tập đăng tay trước đó và báo user trước khi quyết định giữ hay quay lại đăng tay.
