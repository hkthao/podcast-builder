---
name: footage-shotlist
description: Chọn footage b-roll (Pexels, không người) BÁM NỘI DUNG TỪNG ĐOẠN cho video podcast — Claude Code tự viết shot-list (miễn phí, không gọi OpenAI) theo beat ~45s có mốc thời gian, đúng nguyên tắc bố cục khung dọc 9:16 / ngang 16:9, rồi footage-plan tải + cắt shot xếp đúng thời gian. Dùng khi user muốn tạo/làm lại footage cho 1 tập, footage "lạc tông/lạc nội dung", hoặc chuẩn bị bản YouTube 16:9.
---

# Footage bám nội dung (shot-list do Claude viết)

Dùng cho MỌI tập. Nguồn dùng chung, sửa 1 chỗ áp cho tất cả:
- **Luật shot-list:** prompt `podcast.footage-shotlist` (sửa ở trang /prompts; mặc định ở `podcast/server/lib/footage-shotlist-prompt.ts`).
- **Nguyên tắc bố cục khung:** `FOOTAGE_FORMAT_GUIDE` cùng file (dọc: giữa khung, đường thẳng đứng, cận/macro · ngang: 1/3 + không gian âm, đường chân trời, cảnh toàn/viễn, máy tĩnh/lia chậm).
- **Thư viện mô-típ:** `podcast/data/footage-motifs.json` (ý → query gợi ý theo khung + mục `avoid`). Có trong git — LUÔN cập nhật sau mỗi tập (Bước 5).

Điều kiện: tập đã có transcript (`tmp/<slug>.corrected.json`, nên sửa chính tả xong trước) + `input/<slug>.json` (hook/showIntro quyết định đoạn mở đầu chỉ-nhạc, beat 0 phủ cả đoạn đó).

## Bước 1 — Brief
```bash
npx tsx podcast/scripts/footage-plan.ts <slug> --all-pexels --brief   # bản Facebook 9:16
npx tsx podcast/scripts/footage-plan.ts <slug> --landscape --brief    # bản YouTube 16:9
```
→ `tmp/<slug>[.yt].footage-brief.json` gồm `system` (luật), `user` (tiêu đề, màu phụ, bố cục khung, thư viện mô-típ, danh sách beat `#i [mm:ss–mm:ss] lời thoại`), `beats`, `output` (đường dẫn file cần viết).

## Bước 2 — Claude viết shot-list
Đọc TOÀN BỘ `system` + `user` (đọc hết lời thoại từng beat, đừng đoán theo tiêu đề). Ghi `output` = `tmp/<slug>[.yt].footage-shotlist.json`:
```json
{"beats":[{"i":0,"label":"≤6 từ","idea":"hình gì, vì sao hợp ý đoạn","queries":["en 2-5 từ","...","..."]}]}
```
Checklist trước khi lưu:
- ĐỦ mọi `i` của brief, mỗi beat 3 query, 3 góc khác nhau của cùng ý.
- Beat nhắc vật/cảnh CỤ THỂ (cây cầu, cơn mưa, bữa cơm, Trái Đất từ vũ trụ…) → dùng đúng hình đó. Beat trừu tượng → ẩn dụ (ưu tiên thư viện mô-típ, hoặc ẩn dụ mới cùng tinh thần).
- KHÔNG người (query không có person/face/hands/crowd/office/busy street…); gợi người bằng vật/nơi chốn vắng.
- NỘI DUNG > MÀU; không lặp 1 cảnh cho nhiều beat; tránh mục `avoid`.
- Từ khoá cỡ cảnh hợp khung: dọc "close up"/"macro"; ngang "wide shot"/"aerial"/"static".
- Query Pexels ngắn, danh từ cụ thể (Pexels tìm theo từ khoá, không hiểu câu dài/ẩn ý).

Báo user vài beat tiêu biểu (beat → hình) để duyệt nếu họ muốn xem trước.

## Bước 3 — Tải + cắt shot
```bash
npx tsx podcast/scripts/footage-plan.ts <slug> --all-pexels --shotlist=tmp/<slug>.footage-shotlist.json --apply
npx tsx podcast/scripts/footage-plan.ts <slug> --landscape --shotlist=tmp/<slug>.yt.footage-shotlist.json --apply
```
- Mỗi beat lấp bằng shot cắt đúng độ dài (dọc ~6s, ngang ~7s; `FOOTAGE_SHOT_SEC`), xếp theo thời gian; tải song song 3 beat (`FOOTAGE_CONCURRENCY`); ~15' ≈ 130-150 shot, 15-30'. Chạy nền + theo dõi log, ĐỪNG pipe `| tail`.
- Vision people-check (gpt-4o) loại clip dính người; sổ `input/_footage-used.json` loại clip tập cũ; blocklist bản quyền `input/_footage-blocklist.json`.
- Ghi `footage`+`footageCredit` (dọc) hoặc `footageLandscape`+`footageCreditLandscape` (ngang). Clip cũ của tập chỉ bị dọn SAU khi --apply thành công. Không có `--shotlist` → gọi OpenAI (tốn phí, chỉ khi user yêu cầu).

## Bước 4 — Kiểm tra
- Báo cáo `tmp/<slug>[.yt].footage-plan.json`: mỗi beat `match` = `got/need shot`. Beat thiếu shot (vd `2/7`) = query quá hẹp → sửa query beat đó trong shotlist, chạy lại Bước 3.
- User xem ở tab **Footage** (đúng tab khung) trước khi render. Render lại sau khi đổi footage.

## Bước 5 — Cập nhật thư viện mô-típ (để tập sau tốt hơn)
Sau khi user hài lòng, sửa `podcast/data/footage-motifs.json`:
- Thêm motif mới (ý mới gặp ở tập này) + query đã ra clip tốt, đúng khung (`portrait`/`landscape`).
- Query ra người/lạc ý/clip xấu → chuyển vào `avoid`.
- Giữ ngắn gọn (mỗi motif 2-4 query/khung). Commit file này cùng code khi user yêu cầu commit.
