# Series "Dòng Họ Việt" (`dong-ho-viet`)

Gia đình · gia phả · ký ức · nguồn cội — nhắm khán giả trung niên; nội dung là phễu dẫn tới nhu cầu **lưu giữ ký ức / gia phả** (app gia phả: donghoviet.thaohk.com). Trang FB "Cộng đồng Dòng Họ Việt" (env `FB_PAGE_ID_DONG_HO_VIET`). Làm lại từ tập 1 trong studio (2026-10-18) — 8 tập reel cũ đã bỏ.

## ⭐ AUDIO = NOTEBOOKLM VIDEO OVERVIEW, 1 NGƯỜI KỂ, 5–8' (user chốt 2026-10-21) — KHÔNG Gemini TTS nữa
Cùng luồng Chuyện Xưa (xem chuyen-xua.md): Video Overview "explainer" (1 người thuyết minh, giọng Bắc) → tải video → CHỈ LẤY TIẾNG. `nlm-batch` tự đi luồng video cho series này (SERIES_GATE: explainer, style heritage, 1 bản, cổng 5–12', ưu tiên ~7').

1. Tạo tập: `POST /api/episodes {"title","series":"dong-ho-viet"}`; `config.hook` = câu hook của ô kế hoạch (≤20 chữ) — series bật `hookCard` (thẻ chữ ~3.5s trước lời kể, vì audio NotebookLM mở chậm).
2. Claude viết `input/<slug>.essay.txt` (~700–900 chữ, văn xuôi liền, KHÔNG tiêu đề/nhãn phần) theo khung nội dung dưới; `input/<slug>.focus.txt` (**ASCII thuần**) theo mẫu. Không cần sources.txt (chuyện đời, không trích tài liệu) — nếu có dẫn chứng thật (phong tục, số liệu) thì thêm 1–3 URL.
3. `npx tsx podcast/scripts/nlm-batch.ts <slug>` → `input/<slug>.m4a`.
4. QC như Chuyện Xưa: `story/scripts/audio-qc.ts <slug>` → `npm run make -- input/<slug>.m4a --plan-only` → spell-fix-manual dump/sửa/apply (bỏ câu cuối whisper bịa "đăng ký kênh…") → `rm tmp/<slug>.plan.json`. Đọc transcript: người kể có đọc nhãn phần / gọi bài là "tư liệu", "câu chuyện được cung cấp" không → gen lại.
5. Editorial (chương theo 4 nhịp) → footage-shotlist → cover → render → đăng (Business Suite, plan-week bước 13).

### Khung nội dung bài luận (nguồn cho NotebookLM)
- **Ngôi kể:** "Tôi" kể về ông/bà/cha mẹ/dòng họ mình. Ấm, chân thành, KHÔNG hàn lâm, KHÔNG lên gân, KHÔNG sến.
- **Một vật thể cụ thể làm trục** (cuốn sổ da sờn, tấm ảnh cũ, bát hương, chiếc áo…) — chi tiết giác quan (mùi, tiếng, chất liệu), tên người/địa danh/năm cụ thể để NotebookLM có "thịt".
- **4 nhịp (ẩn trong văn xuôi, không đánh nhãn):** (1) vật thể + nghịch lý mở đầu; (2) đảo hướng "ta thường nghĩ… nhưng thật ra…"; (3) một câu nói / di sản của ông bà + khoảnh khắc thế hệ sau (có lời thoại ngắn); (4) chốt + lời nhắn nhẹ "hãy hỏi, hãy ghi lại khi còn kịp" (lưu giữ ký ức / gia phả — không quảng cáo lộ).
- Thêm 1–2 đoạn phong tục/bối cảnh Việt liên quan (ý nghĩa ngày giỗ, cách người xưa giữ gia phả…) để NotebookLM có chỗ diễn giải → đủ 5–8'.
- **Không lặp** vật thể / câu chốt các tập trước: đọc `input/*.essay.txt` + `input/*.story.json` của series trước khi viết. Đã dùng: áo dài cưới của bà, mâm cơm giỗ ông, tấm ảnh cả họ, lá thư bố không gửi.

### Mẫu focus (ASCII; thay chi tiết từng tập)
```
One single narrator only, no second host, no dialogue between hosts. This is a personal family memoir told in the first person: the narrator speaks as "toi", remembering his own grandparents and parents, as if the memories in the source are his own. Never call it a source, a document, an essay or a story that was provided; never announce parts or numbers. The narrator is a warm, sincere Vietnamese man with a Northern Vietnamese (Hanoi) accent, clear documentary narration pace, not slow, not whispering, not sentimental. Open within the first ten seconds with the paradox of the object at the center of the memory, then go straight into the memory; no greeting, no warm-up. Follow the source in order: the object and the memory around it in vivid sensory detail; then the turn (what we usually think versus what it really meant); then the words or legacy of the grandparent and a moment with the younger generation; then a short note on the Vietnamese custom behind it; end with one gentle line inviting the viewer to ask their elders and write their family memories down while there is still time. Do not invent new people or facts. Target length: 6 to 7 minutes.
```

## Giọng (lưu trữ — tập Gemini TTS cũ, trước 2026-10-21)
Nam dẫn phim tài liệu Alnilam tempo 1.0 (`series.ts → dong-ho-viet.tts`), viết `story.json` ~500–650 chữ. Chỉ dùng lại khi NotebookLM hết quota và user đồng ý.

## Hình
- **Footage:** đồ vật gia đình Việt, nhà cũ, bàn thờ/nén nhang, ảnh cũ, sổ chép tay, mâm cơm, sân gạch, ngõ quê, cây cau, giếng, mái ngói — KHÔNG người (gợi người bằng vật/nơi chốn vắng). Ưu tiên query có "vietnamese" khi hợp.
- **Cover:** ấm, hoài niệm; tông rượu vang #7A2230 + vàng đồng #C19A5B trên nền kem; vật thể trục của tập ở trung tâm; tiêu đề chữ rõ (serif) + dòng nhỏ "DÒNG HỌ VIỆT".

## Đăng
Caption: hook/vật thể → 2–4 câu khơi gợi ký ức → 1 câu hỏi mời bình luận ("Nếu được hỏi ông bà một điều, bạn sẽ hỏi gì?"). Hashtag: `donghoviet`, `giapha`, `giadinh`, `nguoncoi`, `kyuc`. Playlist: `input/_fb-playlists.dong-ho-viet.json` (chưa có — tạo khi user chốt danh sách).
