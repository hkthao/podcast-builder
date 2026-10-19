# Series "Tiền & Tâm Lý" (`tien-tam-ly`)

Kênh kinh tế × tâm lý học hành vi, **độc lập với ByteCast** (không dẫn chéo, không dùng lại nhà tư tưởng/khung của ByteCast). Mỗi tập mổ xẻ một câu chuyện tiền bạc có thật bằng **số liệu Việt Nam có nguồn** + một cơ chế tâm lý, rồi rút ra một quy tắc giữ tiền.

**Vì sao kênh này phải "gốc":** không có giọng thật → độ gốc dựa vào (1) **phân tích + số liệu tự tổng hợp** (thông tin feed chưa có, không phải tóm tắt sách), (2) hình tự dựng mỗi tập khác nhau, (3) công bố AI + ghi nguồn. Kể lại sách/TED/bài báo = đóng góp yếu.

## ĐỊNH DẠNG: ĐỐI THOẠI 2 NGƯỜI DẪN (user chốt 2026-10-19)
Độc thoại phân tích bị user chê "đều đều, nghe là biết máy" + "quá kinh tế học, chung chung". → Kịch bản là **cuộc trò chuyện đời thường** kiểu podcast NotebookLM, Gemini multi-speaker đọc (series.ts `tts.speakers`).
- **Minh** (nam, Alnilam): kể chuyện, giải thích cơ chế. **Lan** (nữ, Aoede): hỏi như người nghe bình thường, đoán sai, ngạc nhiên, tóm lại ý.
- Xưng hô: Minh xưng "tôi" gọi "chị"; Lan xưng "tôi" gọi "anh". Nói với khán giả: "các bạn".
- Mỗi dòng trong `text` = 1 lượt nói, bắt đầu `Minh: ` / `Lan: `, cách nhau `\n`. **Mọi lượt kết thúc bằng dấu câu** (tách câu theo dấu). Lượt ngắn xen kẽ ("Hả? Hai tỷ ba?", "Mỗi năm.") làm nhịp tự nhiên.
- **Câu chuyện trước, kiến thức sau:** mở bằng tình huống ai cũng gặp (tin nhắn của bạn cũ, phim dở vẫn xem hết vì đã mua vé), số liệu xuất hiện như câu trả lời cho thắc mắc của Lan. Ví von đời thường kiểu Việt (vỡ hụi, chơi họ…) thay thuật ngữ.
- Không bịa chuyện người thật: giai thoại của host phải là giả định ("nhỡ có người…") hoặc có nguồn.
- Neo cảnh viz bằng `"at": "<đoạn chữ trong câu>"` (bền hơn số thứ tự câu khi sửa kịch bản).
- Dài ~900–1.050 chữ ≈ 4–5 phút (đối thoại đọc nhanh ~200 chữ/phút).
- Âm thanh: series có `eq: VOICE_CLARITY_EQ` (bớt ồm dải trầm của Gemini 24kHz) áp lúc ghép.

## Độ dài
**≥3 phút** (user chốt 2026-10-19), dài hơn khi chủ đề cần (xem số chữ ở mục đối thoại). Không độn — mỗi đoạn phải thêm dữ kiện hoặc lập luận mới.

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
