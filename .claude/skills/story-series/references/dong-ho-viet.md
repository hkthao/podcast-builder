# Series "Dòng Họ Việt" (`dong-ho-viet`)

Gia đình · gia phả · ký ức · nguồn cội — nhắm khán giả trung niên; nội dung là phễu dẫn tới nhu cầu **lưu giữ ký ức / gia phả** (app gia phả: donghoviet.thaohk.com). Trang FB "Cộng đồng Dòng Họ Việt" (env `FB_PAGE_ID_DONG_HO_VIET`). Làm lại từ tập 1 trong studio (2026-10-18) — 8 tập reel cũ đã bỏ.

## Viết kịch bản
- **Ngôi kể:** người thật xưng **"Tôi"**, kể về ông/bà/cha mẹ/dòng họ mình. Ấm, chân thành, KHÔNG hàn lâm, KHÔNG lên gân, KHÔNG sến.
- **Hook (2 câu đầu):** câu 1 gợi tò mò/nghịch lý; câu 2 kéo người xem ở lại. Vd: *"Ông tôi mất đi, không để lại một chỉ vàng nào. Nhưng thứ ông để lại khiến cả dòng họ ngồi lặng đi suốt một buổi chiều."*
- **Một vật thể cụ thể làm trục** (cuốn sổ da sờn, tấm ảnh cũ, bát hương, tấm bia, chiếc áo…) — chi tiết giác quan, không trừu tượng.
- **Cấu tứ 4 nhịp = 4 section** (mỗi section có `chapter` ngắn):
  1. Vật thể + hook.
  2. Đảo hướng: "ta thường nghĩ… nhưng thật ra…".
  3. Một câu nói / di sản của ông bà + khoảnh khắc thế hệ sau.
  4. Chốt + CTA nhẹ "hãy hỏi, hãy ghi lại khi còn kịp" (lưu giữ ký ức / gia phả — không quảng cáo lộ).
- **Độ dài:** ~500–650 chữ (~3,5–4' sau tempo).
- **Không lặp** vật thể / câu chốt của các tập trước trong series — đọc lại `input/*.story.json` của series trước khi viết.
- Không có `source`/`cite` trừ khi trích tài liệu thật.

## Giọng
Nam **dẫn phim tài liệu**: rõ, chắc, chân thành, tốc độ tự nhiên — KHÔNG chậm, KHÔNG thủ thỉ, KHÔNG giọng truyện ma (tránh Algenib khàn, tránh "slow/unhurried/whisper/intimate"). Mặc định series: **Alnilam + tempo 1.0** (user chọn 2026-10-19, thay Charon 1.09), có thể thử thêm Orus/Sadaltager/Rasalgethi bằng `--voice=… --tag=…` (Iapetus từng nghe nhiều tạp âm).

## Hình
- **Footage:** đồ vật gia đình Việt, nhà cũ, bàn thờ/nén nhang, ảnh cũ, sổ chép tay, mâm cơm, sân gạch, ngõ quê, cây cau, giếng, mái ngói — KHÔNG người (gợi người bằng vật/nơi chốn vắng). Ưu tiên query có "vietnamese" khi hợp.
- **Cover:** ấm, hoài niệm; tông rượu vang #7A2230 + vàng đồng #C19A5B trên nền kem; vật thể trục của tập ở trung tâm; tiêu đề chữ rõ (serif) + dòng nhỏ "DÒNG HỌ VIỆT".

## Đăng
Caption: hook/vật thể → 2–4 câu khơi gợi ký ức → 1 câu hỏi mời bình luận ("Nếu được hỏi ông bà một điều, bạn sẽ hỏi gì?"). Hashtag: `donghoviet`, `giapha`, `giadinh`, `nguoncoi`, `kyuc`. Playlist: `input/_fb-playlists.dong-ho-viet.json` (chưa có — tạo khi user chốt danh sách).
