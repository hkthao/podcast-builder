# Series "Tiền & Tâm Lý" (`tien-tam-ly`)

Kênh kinh tế × tâm lý học hành vi, **độc lập với ByteCast** (không dẫn chéo, không dùng lại nhà tư tưởng/khung của ByteCast). Mỗi tập mổ xẻ một câu chuyện tiền bạc có thật bằng **số liệu Việt Nam có nguồn** + một cơ chế tâm lý, rồi rút ra một quy tắc giữ tiền.

**Vì sao kênh này phải "gốc":** không có giọng thật → độ gốc dựa vào (1) **phân tích + số liệu tự tổng hợp** (thông tin feed chưa có, không phải tóm tắt sách), (2) hình tự dựng mỗi tập khác nhau, (3) công bố AI + ghi nguồn. Kể lại sách/TED/bài báo = đóng góp yếu.

## ⭐ ĐỜI THƯỜNG, DỄ TIẾP CẬN (user 2026-10-21) — ưu tiên hơn mọi mục bên dưới
"Phần NotebookLM nên đời thường hơn để dễ tiếp cận với nhiều đối tượng." → bài nguồn + focus:
- TỐI ĐA 1 nghiên cứu/tập, kể như chuyện vui bằng lời thường (không dồn tên học giả, không thuật ngữ); bỏ "phân tích", "tư liệu".
- Mở bằng NHÂN VẬT + TÌNH HUỐNG quen (chị Hoa canh sale nửa đêm, anh Hùng trước kệ điện thoại); ví von bằng cảnh Việt (đi chợ mặc cả, xếp hàng mua kem, livestream, gom đơn freeship).
- Ít số, số tròn, chỉ số thật sự cần + có nguồn.
- **Đan xen các cơn sốt/vụ việc THẬT của Việt Nam** (user 2026-10-21): thương lái mua lá điều khô (Đồng Nai 2012), lan đột biến 2021–22 (ôm nợ, mất nhà), cau tươi 2024 (>100k rồi rơi ~50k)… — mỗi vụ 2–4 câu có năm + nguồn báo, rút ra điểm chung với chủ đề tập. Kho ví dụ còn: sốt đất nền, tiền ảo, vàng, đa cấp, "thương lái Trung Quốc thu mua lạ".
- Focus ghi rõ "audience: everyone from students to housewives to retirees… very everyday and easy".
- Focus thêm: "Never mention documents, sources, materials, Wikipedia or analysing documents; talk as if from your own knowledge and life." (tập Sale 2026-10-21 host nói "phân tích tài liệu… Wikipedia" — nghe như báo cáo).

## ⭐ AUDIO = NOTEBOOKLM PODCAST NGẮN (user chốt 2026-10-20) — KHÔNG dùng Gemini TTS
Gemini TTS (độc thoại lẫn đối thoại 2 giọng) bị user chê "không tự nhiên". Từ tập 2: audio do **NotebookLM** gen
(skill `notebooklm-podcast`), hình vẫn là cảnh vẽ tay `viz`. Quy trình:
1. Tạo tập: `POST /api/episodes {"title","series":"tien-tam-ly"}`.
2. Claude viết `input/<slug>.essay.txt` (~1.000–1.200 chữ, văn xuôi kể chuyện: nhân vật có tên → câu hỏi → số liệu có nguồn → 1–2 cơ chế tâm lý → phản biện → 3 câu hỏi/quy tắc; KHÔNG tiêu đề, số viết chữ),
   `input/<slug>.focus.txt` (**ASCII thuần**, 2 host: nam giải thích, nữ hỏi/đoán sai; "short, focused 6 to 8 minute"; flow Hook→Part→Outro; "do not invent new statistics"),
   `input/<slug>.sources.txt` (5–8 URL crawl được, ưu tiên nguồn VN).
3. `npx tsx podcast/scripts/nlm-batch.ts <slug> --takes=2` — series này tự gen `--length short`, cổng **4–10'**, chọn bản gần 7' (SERIES_GATE trong nlm-batch). Tập 2 ra 5.3' / 4.7'.
4. QC: `npx tsx story/scripts/audio-qc.ts <slug> --podcast` + `npm run make -- input/<slug>.m4a --plan-only` → spell-fix-manual dump → Claude sửa → apply → `rm tmp/<slug>.plan.json`.
5. Cảnh: Claude đọc mốc câu trong `tmp/<slug>.corrected.json`, viết `input/<slug>.viz.json` = `{"beats":[{"at":"<đoạn chữ host nói>","type":…}]}` (~1 cảnh/15–25s) → `npx tsx story/scripts/viz-anchor.ts <slug>` → `tmp/<slug>.viz.json`. Xem trước: copy beats vào `public/_viz-preview.json` + still `VizPreview`.
6. Editorial: Claude viết `tmp/<slug>.editorial.claude.json` → `editorial-manual.ts apply` (tập series này đã editorialLocked).
7. Cover (prompt bảng trắng, kiểm dấu), config (caption/hashtag/sources/playlist), render `POST /api/render` (regenTranscribe=false, regenPlan=true), hẹn giờ qua Business Suite: `npx tsx podcast/scripts/fb-browser.ts fill <slug> --submit` (KHÔNG qua API — reach thấp; xem plan-week bước 13).
- Host NotebookLM tự xưng "tớ/cậu" kiểu bạn trẻ — chấp nhận được (audio-qc không báo đảo).
- Pipeline Gemini đối thoại (series.ts `tts.speakers`, story.json) vẫn còn trong code — tập 1 làm bằng nó.

## Độ dài
Podcast ngắn ~5–8 phút (user 2026-10-20, ghi đè mốc ≥3' cũ không đổi). Không độn — mỗi đoạn phải thêm dữ kiện hoặc lập luận mới.

## Khung kịch bản (sections trong story.json) — viết dưới dạng đối thoại
1. **Cú sốc** (15–20s, không `chapter`): case study đời thực hoặc nghịch lý bằng con số. Câu đầu tiên phải tự đứng được khi lướt feed. Nhân vật minh hoạ thì nói rõ là minh hoạ ("hình dung một kỹ sư…"), KHÔNG bịa người thật.
2. **Bối cảnh số liệu** (`chapter`, `cite: true`): 2–4 con số VN có nguồn đặt vấn đề vào thực tế.
3. **Giải phẫu cơ chế** (`chapter`): tiền chạy thế nào — lãi kép, lạm phát, đòn bẩy, thanh khoản, cấu trúc lừa đảo…
4. **Giải phẫu bộ não** (`chapter`): hiệu ứng tâm lý giải thích vì sao người ta vẫn làm (chi phí chìm, FOMO, neo giá, ảo tưởng kiểm soát, kế toán tâm lý…). Một hiệu ứng chính/tập, tối đa hai.
5. **Phản biện** (`chapter`): giới hạn của lập luận / khi nào điều ngược lại đúng — tránh giọng "dạy đời", tăng uy tín.
6. **Quy tắc sinh tồn** (`id: "ket"`): 1 quy tắc cụ thể, làm được ngay, + 1 câu hỏi mời bình luận.

## Kiểm chứng (BẮT BUỘC — kênh sống nhờ uy tín)
- Mọi con số có nguồn: GSO (Tổng cục Thống kê), NHNN, Bộ Tài chính, UBCKNN, World Bank, IMF, nghiên cứu có bình duyệt, báo lớn trích nguồn gốc. Ghi vào `config.sources` + `source` của section `cite`.
- Số liệu ghi **năm/kỳ** ("năm 2025", "quý hai"). Không chắc → không dùng.
- Tránh mô hình sách giáo khoa đã lỗi thời (vd "số nhân tiền tệ: ngân hàng biến 1 tỷ thành 10 tỷ" — thực tế cho vay tạo tiền gửi, BoE 2014).
- Không khuyên mua/bán mã, coin, BĐS cụ thể; không hứa lợi nhuận. Caption luôn có: "Nội dung mang tính giáo dục, không phải lời khuyên đầu tư."
- Không nêu tên cá nhân/doanh nghiệp tư nhân như kẻ lừa đảo trừ khi đã có bản án/kết luận cơ quan chức năng (trích nguồn).
- Không lấy Kahneman "tư duy nhanh/chậm" làm trụ cột (đã bão hoà); xoay vòng nguồn giữa các tập (Thaler, Shiller, Ariely có phản biện, Mullainathan–Shafir về sự khan hiếm, nghiên cứu VN…).

## Văn phong
Viết để ĐỌC (quy tắc chung ở SKILL.md). Thêm cho kênh này: số viết thành chữ nhưng làm tròn dễ nghe ("gần năm trăm triệu", "khoảng bốn phần trăm"); thuật ngữ nói kèm nghĩa ngay lần đầu; bình tĩnh, sắc, không giật gân kiểu "SỐC", không hô hào làm giàu.

## Hình
- Footage (footage-shotlist): ĐƯỢC có người nhưng không lộ mặt rõ (tay đếm tiền, bóng lưng ở quầy giao dịch, phố chợ, bảng giá, màn hình chứng khoán, hoá đơn, cây ATM). Tránh cảnh "tiền bay", vàng thỏi rơi, người cười giàu sang.
- Bộ hình phân tích (biểu đồ vẽ tay, dòng tiền, số chạy, nhân vật Open Peeps) — **đang xây** (rough.js + d3 + @remotion/paths). Khi có: mỗi section ghi loại hình trong story.json.
- Cover: minh hoạ biên tập kiểu bảng trắng/vẽ tay — 1 vật thể/biểu đồ biểu tượng + tiêu đề ngắn chữ đậm; bảng màu series (giấy ngà, mực chàm, xanh lá lãi, đỏ lỗ). Kiểm chữ tiếng Việt trên ảnh.

## Đăng
Hashtag: `tienvatamly`, `taichinhcanhan`, `kinhte`, `tamlyhoc`, + 1–2 theo chủ đề. Caption: câu cú sốc → 2–3 câu tóm cơ chế → quy tắc → câu hỏi bình luận → dòng không-lời-khuyên-đầu-tư → nguồn. Trang FB: env `FB_PAGE_ID_TIEN_TAM_LY` (**chưa tạo Trang** — 2026-10-19). Playlist: `input/_fb-playlists.tien-tam-ly.json` (tạo khi có Trang).
