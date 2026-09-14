---
name: notebooklm-podcast
description: Tạo video podcast từ NotebookLM Audio Overview. Dùng khi user muốn biến một bài luận/chủ đề thành podcast tiếng Việt qua NotebookLM rồi render thành video bằng pipeline repo này. Quy trình: tìm nguồn → upload notebook → gen audio (giọng Bắc) → QC → render. Bao gồm cú pháp `nlm` CLI và các bẫy đã biết.
---

# NotebookLM → Video Podcast

Biến 1 bài luận/chủ đề thành video podcast: research nguồn → nạp NotebookLM → gen Audio Overview tiếng Việt → QC → render qua `make.ts`.

## CÔNG CỤ: dùng `nlm` CLI (jacob-bd/notebooklm-mcp-cli), KHÔNG dùng MCP cũ

- ✅ **Đúng:** `notebooklm-mcp-cli` (lệnh `nlm`) — kết nối qua internal API, ổn định, có cả CLI + MCP server.
- ❌ **Tránh:** `PleasePrompto/notebooklm-mcp` — browser-automation, `add_source` + `download_audio` HỎNG với UI NotebookLM hiện tại (GitHub Issue #46). Đã đăng ký trong Claude Code thì gỡ: `claude mcp remove notebooklm -s local`.

Cài (nếu chưa có `nlm`):
```bash
brew install uv 2>/dev/null; export PATH="$HOME/.local/bin:/opt/homebrew/bin:$PATH"
uv tool install notebooklm-mcp-cli
nlm --version   # cần ≥ 0.7.x
```
Mọi lệnh `nlm` cần `export PATH="$HOME/.local/bin:/opt/homebrew/bin:$PATH"` ở đầu.

## Bước 1 — Đăng nhập (1 lần, cookie ~2-4 tuần)
```bash
nlm login          # mở trình duyệt → user chọn ĐÚNG tài khoản sở hữu notebook
nlm login --check  # kiểm tra còn hạn
```
- **Đa tài khoản / hết quota (free tier ~50 query/ngày + giới hạn gen audio):** dùng **named profile** — `nlm login --profile acct2 --clear` (mở browser, đăng nhập account khác). Lưu ý: `nlm login --clear` (không có profile mới) có thể KHÔNG mở browser nếu cookie cũ còn hạn → cứ tạo profile mới để chắc chắn đổi account.
- **BUG QUAN TRỌNG về `--profile`:** `source add`/`audio create`/`studio status`/`notebook` CÓ nhận `--profile`, NHƯNG `nlm download audio` **KHÔNG có** option `--profile` → sẽ lỗi "No such option". Cách đúng khi làm trên account phụ: chạy **`nlm login switch acct2`** để đặt acct2 làm **default profile**, sau đó mọi lệnh (kể cả `download audio`) tự dùng acct2 — khỏi cần truyền `--profile` nữa. Notebook thuộc account nào thì switch sang profile đó trước khi thao tác.
- **Bẫy `authuser`:** tham số `?authuser=N` trong URL notebook KHÔNG liên quan tới CLI — CLI dùng tài khoản theo cookie/profile. Chỉ cần notebook UUID + đúng profile là truy cập được. (MCP browser cũ thì authuser gây lệch context — bỏ qua.)

## Bước 2 — Notebook
User tự tạo notebook trống trên notebooklm.google rồi gửi link, HOẶC tạo qua CLI:
```bash
nlm notebook list                       # lấy notebook UUID
nlm notebook create --title "..."        # tạo mới nếu cần
```
Lấy UUID từ URL: `notebooklm.google.com/notebook/<UUID>`. Đặt `NB=<UUID>`.
> Notebook trống KHÔNG sao với CLI (internal API). Chỉ MCP browser cũ mới kẹt "empty-notebook bootstrap".

## Bước 3 — Research 10 nguồn liên quan
Dispatch 1 general-purpose agent tìm 10 URL crawl được.
- **⭐ ĐA NGÀNH + ĐÔNG/TÂY (bắt buộc) — để bài có NHIỀU GÓC NHÌN:** đừng gom 10 nguồn cùng một ngành. Yêu cầu agent rải đều qua các lăng kính, mỗi chủ đề chọn nguồn từ ÍT NHẤT 4–5 nhóm sau:
  - **Tâm lý học** (hành vi, nhận thức, tiến hóa, thần kinh — APA, simplypsychology, psychologytoday).
  - **Xã hội học / nhân học** (Durkheim, Weber, tước đoạt tương đối, văn hóa cá nhân vs tập thể...).
  - **Triết học PHƯƠNG TÂY** (Hy Lạp: Aristotle, Socrates; Khắc Kỷ: Seneca, Epictetus, Marcus Aurelius; hiện sinh: Heidegger, Sartre, Camus; Nietzsche, Pascal... — SEP/IEP).
  - **Triết học/minh triết PHƯƠNG ĐÔNG** (Khổng Tử/Nho giáo, Lão Tử/Đạo gia, Trang Tử, Phật giáo, Ấn Độ giáo — SEP/IEP/Wikipedia).
  - **Kinh tế học (hành vi)** khi liên quan (Kahneman, prospect theory, paradox of value...).
  - **Khoa học thần kinh / sinh học** (cơ chế não, tiến hóa) khi liên quan.
  - **Văn học / lịch sử / tôn giáo** làm dẫn chứng sống (Tolstoy, ngụ ngôn, sự kiện lịch sử...).
  Mục tiêu: mỗi tập có cả góc nhìn KHOA HỌC lẫn MINH TRIẾT, cả ĐÔNG lẫn TÂY, để 2 host soi chủ đề từ nhiều phía thay vì một chiều.
- **⭐ TÁI DÙNG NGUỒN CŨ CÓ CHỪNG MỰC — cân bằng thuyết phục vs trùng lặp:** KHÔNG cấm tuyệt đối các nhà tư tưởng/nguồn đã dùng ở tập trước. Nếu một dẫn chứng KINH ĐIỂN thật sự khớp và làm luận điểm thuyết phục hơn hẳn (vd Socrates cho chủ đề khiêm tốn trí tuệ), cứ dùng — nhưng **chỉ 1–2 cái/tập, nói ngắn gọn, và xoáy vào GÓC MỚI** của chủ đề đang bàn, đừng kể lại y hệt tập cũ. Nguyên tắc: phần LỚN nguồn (≥7–8/10) phải MỚI so với các tập gần đây để nghe không nhàm; chỉ chừa 1–2 chỗ cho "kép chính" cũ khi nó thực sự nâng sức nặng. Trước khi research, quét đồ thị lặp: `cat input/*.essay.txt | grep -oiE "<danh sách tên nghi ngờ>" | sort | uniq -c | sort -rn` → tên nào đã đếm ≥4–5 lần thì coi là "bão hoà", tránh làm trụ cột; tên xuất hiện 1–2 lần vẫn dùng lại được nếu đắt. Mục tiêu là ĐỦ THUYẾT PHỤC mà KHÔNG lặp nội dung — không phải né sạch mọi cái quen. (Xem memory `tranh-nguon-nha-tu-tuong-lap`.)
- **Bẫy nguồn bị chặn crawler:** TRÁNH `pmc.ncbi.nlm.nih.gov`, sciencedirect, jstor, springer, researchgate, academia.edu, medium member-only, nytimes (reCAPTCHA/paywall → NotebookLM chỉ lấy được trang "Checking your browser", vô dụng).
- **Ưu tiên:** Wikipedia, plato.stanford.edu (SEP), iep.utm.edu, simplypsychology.org, verywellmind, psychologytoday, britannica, apa.org, greatergood.berkeley.edu, positivepsychology.com, frontiersin.org (open-access), .edu/.gov mở.
- Yêu cầu agent WebFetch xác nhận mỗi URL trả về nội dung thật (không 404 / không captcha) trước khi trả về.
- Nguồn tiếng Anh OK — NotebookLM sinh audio tiếng Việt từ nguồn Anh được.

## Bước 4 — Upload nguồn

### ⭐ VIẾT/MỞ RỘNG BÀI LUẬN — THÂN THIỆN, KHÔNG HÀN LÂM (nguyên tắc cốt lõi)
Chủ đề thường là **triết học + xã hội học + tâm lý học**, nhưng đối tượng nghe RỘNG (học sinh, sinh viên, người đi làm trẻ, vợ chồng, cha mẹ, người già) — nên bài luận (và audio) phải **dễ tiếp cận, KHÔNG hàn lâm**:
- **Mỗi khái niệm học thuật / tên triết gia PHẢI đi kèm 1 ví dụ đời thường Việt Nam** ngay sau đó (nhóm Zalo công ty, họp lớp cấp 3, mẹ so sánh "con nhà người ta", vợ chồng giận nhau, về quê ăn giỗ, lúc ốm ai gọi hỏi thăm, tài xế tạt đầu xe, xếp hàng siêu thị...). Khái niệm là "xương", ví dụ đời thường là "thịt".
- **Ngôn ngữ bình dân**, câu vừa phải, tránh thuật ngữ khô; nếu buộc dùng thuật ngữ thì giải thích lại bằng lời thường + một hình ảnh ví von.
- **Trải nhiều lứa tuổi / hoàn cảnh** trong ví dụ để ai nghe cũng thấy mình trong đó.
- Khi user yêu cầu "mở rộng bài luận": giữ nguyên mạch + luận điểm, **đan thêm dẫn chứng từ các nhà tư tưởng** (mỗi người 1–2 câu, gắn ngay vào ví dụ đời thường) + thêm đoạn suy ngẫm kết chạm cảm xúc. Lưu file `input/<slug>.essay.txt`, rồi thay nguồn cũ: `nlm source delete <id> --confirm` + add bản mới.

#### ⭐ PHẦN MỞ RỘNG — MỤC TIÊU: DỄ HIỂU CHO MỌI ĐỐI TƯỢNG, DỄ TIẾP CẬN
Bản gốc user gửi thường ngắn, hơi trừu tượng. Khi mở rộng, **KHÔNG chỉ thêm dẫn chứng học thuật** — mà phải làm bài **thân thiện, gần gũi, giàu suy ngẫm** để bà nội trợ, bác xe ôm, em sinh viên nghe đều hiểu và thấy mình trong đó:
- **Bơm ví dụ đời thường Việt Nam DÀY hơn — mỗi luận điểm ÍT NHẤT 1 ví dụ cụ thể, sống động** (không phải ví dụ chung chung). Trải rộng bối cảnh: gia đình (mẹ so con cái, vợ chồng giận nhau, giỗ chạp, con thi cử), công sở (nhóm Zalo, họp hành, xét thưởng), đường phố (kẹt xe, tạt đầu xe), chợ búa, hàng xóm, lúc ốm đau, tuổi già... để **mọi lứa tuổi/nghề nghiệp đều bắt gặp chính mình**.
- **Mỗi khái niệm/tên nước ngoài → dịch ngay ra lời thường + 1 hình ảnh ví von quen thuộc** (vd "thang cuốn khoái lạc" = đứng trên thang cuốn ngược, bước hoài vẫn tại chỗ). Khái niệm là "xương", ví dụ đời thường là "thịt" — thịt phải NHIỀU hơn xương.
- **Tăng chất SUY NGẪM, chạm cảm xúc:** xen câu hỏi tự vấn nhẹ nhàng, hình ảnh gợi, đoạn lắng để người nghe dừng lại ngẫm; kết mỗi phần và kết bài nên để lại một dư vị ấm/day dứt chứ không "chốt hạ" khô khan. Tông như hai người bạn ngồi cà phê kể chuyện đời, KHÔNG giảng đạo, KHÔNG "tích cực độc hại".
- **Ngôn ngữ bình dân, câu ngắn–vừa, nhịp thở được;** tránh thuật ngữ dồn dập. Nếu một đoạn đọc lên thấy "sách vở" → viết lại bằng lời nói thường.
- **Độ dài mở rộng:** nhắm ~1800–2200 chữ (đủ nuôi audio 13–18 phút) — mỗi phần vừa có "cái để hiểu" (luận điểm + 1 nhà tư tưởng ngắn gọn) vừa có "cái để thấy mình" (ví dụ đời thường) vừa có "cái để ngẫm" (một câu lắng). Nhớ: source càng dồi dào ví dụ cụ thể thì NotebookLM càng ít bịa/bỏ phần (xem Bước 5).

#### ⭐ REVIEW BÀI LUẬN TRƯỚC KHI NẠP — 2 "TỬ HUYỆT" PHẢI SỬA (BẮT BUỘC)
Sau khi viết/mở rộng xong, **đọc lại bài luận một lượt và sửa 2 lỗi chí mạng** này trước khi `nlm source add`. Đây là 2 thứ làm audio nghe "kịch" / nuốt chữ / sai tên dù prompt có tốt đến mấy (feedback thực chiến của user):

1. **XÓA BỎ TIÊU ĐỀ CỨNG — kẻ thù của định dạng hội thoại.** Các cụm `PHẦN MỘT:`, `PHẦN HAI:`, `PHẦN 3:`, `CÂU KẾT`, `KẾT LUẬN`... là "kẻ thù" của audio hội thoại. NotebookLM thường **đọc to những cụm này một cách máy móc** ("Phần một chấm..."), làm **vỡ ảo giác về một cuộc trò chuyện tự nhiên** giữa 2 người bạn.
   - **Cách sửa:** xóa hẳn dòng tiêu đề, HOẶC biến nó thành **câu chuyển ý liền mạch**. Ví dụ: thay vì để `PHẦN HAI: VÙNG AN TOÀN...`, viết liền: *"Nói đến đây, chúng ta phải nhắc đến vùng an toàn, thứ đôi khi giống một chiếc quan tài bọc nhung..."*. Cả bài luận nên là **văn xuôi chảy liền**, ranh giới các phần ẩn trong câu dẫn, không lộ thành nhãn.

2. **GIẢM MẬT ĐỘ TRIẾT GIA — đừng để AI "ngộp".** Với một bài ĐỌC (văn bản), trích 6–8 nhà tư tưởng thì rất giàu. Nhưng với AUDIO, NotebookLM **bị "ngộp" khi tên dồn quá dày** và có xu hướng **lướt rất nhanh qua các cái tên để tóm ý chính → nuốt chữ hoặc phát âm sai tên riêng**.
   - **Cách sửa (a) — lược bớt:** giữ khoảng **5–6 tên thiết yếu nhất**; 1–2 tên không cốt lõi thì **gỡ tên, chuyển thành lời thường** ("Người xưa có câu...", "phương Đông có một hình ảnh rất đẹp...") thay vì nêu đích danh.
   - **Cách sửa (b) — thêm câu đệm cho AI "thở":** trước mỗi triết gia MỚI, chèn một câu dẫn để AI có nhịp nghỉ trước khi bước vào tên riêng, vd *"Bạn biết đấy, không chỉ tâm lý học hiện đại mới nói điều này, mà từ xa xưa..."*, *"Điều này thì không chỉ một mình ta nhìn ra..."*, *"Và có một người đã chứng minh điều đó bằng chính cuộc đời mình..."*. Câu đệm vừa giãn mật độ, vừa cho host thời gian phát âm tên chuẩn.
   - Nguyên tắc: **mỗi đoạn văn chỉ 1 tên riêng**, đừng nhồi 2–3 triết gia liền kề trong một đoạn.

> Checklist nhanh trước khi nạp: (1) không còn dòng `PHẦN .../CÂU KẾT`? (2) ≤6 tên riêng, mỗi tên cách nhau bằng câu đệm? (3) văn xuôi chảy liền, không gạch đầu dòng/bảng/URL (xem mục dưới)?

#### ⭐ GIỮ SOURCE "SẠCH" CHO TTS — CHỐNG NUỐT CHỮ/VẤP
Bộ đọc (TTS) của NotebookLM hay vấp/nuốt chữ khi gặp ký tự lạ hoặc cấu trúc phi văn xuôi. Bài luận source nên là **văn xuôi thuần, giống văn nói**:
- **KHÔNG bảng biểu:** diễn giải số liệu thành câu ("Quý 1 doanh thu đạt 500 nghìn, tăng 20%"), đừng để dạng bảng `| ... | ... |`.
- **Bỏ URL dài, footnote kiểu `[1] [2]`, ký tự đặc biệt (`@ # & *`, ngoặc lồng):** AI cố đọc mấy thứ này → vấp và nuốt luôn phần sau.
- **Hạn chế gạch đầu dòng nhiều tầng:** danh sách dài → chuyển thành đoạn văn có từ nối ("Đầu tiên là...", "Tiếp theo là...", "Cuối cùng...").
- **Viết rõ số & từ viết tắt:** số lớn/thập phân và viết tắt lạ nên viết bằng chữ để AI không lướt nhanh qua ("hai mươi phần trăm" thay vì "20%").
- (Bản luận mở rộng của ta vốn đã là văn xuôi — chỉ cần rà lại đừng để lọt bảng/URL/footnote khi trích từ nguồn ngoài.)

Bài luận (text) — thường user dán tay vào notebook, hoặc:
```bash
nlm source add $NB --text "$(cat essay.txt)" --title "Bài luận gốc" --wait
```
10 URL một lệnh:
```bash
nlm source add $NB --url "URL1" --url "URL2" ... --url "URL10" --wait
```
Kiểm tra + dọn nguồn lỗi:
```bash
nlm source list $NB     # xem title — nếu thấy "Checking your browser"/"Page Not Found" = nguồn hỏng
nlm source delete <source-id> --confirm   # xóa nguồn hỏng, thay nguồn khác
```

## Bước 5 — Gen Audio Overview (tiếng Việt, giọng Bắc)
```bash
nlm audio create $NB --language vi --format deep_dive --length default --confirm \
  --focus "<PROMPT chi tiết>"   # tiếng Việt: LUÔN dùng --length default, KHÔNG dùng long
```
`--focus` = ô **Customize** của NotebookLM = "linh hồn & quần áo" của tập (nguồn = "thịt xương"). Đây là kênh BẺ LÁI hành vi 2 AI host, làm 4 việc: (1) phong cách/giọng/vùng miền — viết bằng tiếng Việt để ép cấu trúc câu đúng văn hoá, tránh dịch thô sượng; (2) persona 2 host (vai, tính cách, xưng hô); (3) mạch nội dung (hook → tuần tự luận điểm → kết mở day dứt, không cho AI xáo trộn); (4) đan tư liệu/ví dụ ngoài vào nguồn gốc.
- **Nguyên tắc ngôn ngữ:** logic/cấu trúc/luận điểm để **tiếng Anh** (NotebookLM hiểu tốt nhất); định hướng **giọng, ngữ điệu, từ vựng hội thoại + câu đọc nguyên văn (hook/kết) để tiếng Việt Bắc**.
- **Customize (--focus) ≠ Add Note:** dùng `--focus` để RA LỆNH hành vi (KHÔNG bị đọc thành lời). `nlm note` thêm Note sẽ bị AI coi như NGUỒN → có thể bị đọc thành tiếng. Muốn chèn ví dụ/tư liệu ngoài vào lời thoại thì mô tả trong `--focus`, đừng nhét chỉ thị vào Note.
- Prompt nên gồm: giọng Bắc trầm ấm; 2 host trò chuyện thân tình; tông phù hợp đối tượng; **xưng hô Tôi/Anh/Chị** ([[podcast-xung-ho]]); hook; tuần tự chương; kết mạnh; cụm chuyển mạch Bắc ("Ngẫm lại thì...", "Điều ít người nhận ra là...").
- **Đối tượng RỘNG, thân thiện, KHÔNG hàn lâm:** dù chủ đề là triết học/xã hội học, focus phải ép 2 host **giải thích mọi khái niệm + tên triết gia bằng lời đời thường + ví dụ quen thuộc Việt Nam** ngay tại chỗ (nhóm Zalo, họp lớp, mẹ so sánh con cái, vợ chồng giận nhau, về quê ăn giỗ, lúc ốm ai gọi hỏi thăm...). Tông như hai người bạn ngồi cà phê kể chuyện đời, KHÔNG đọc như giáo trình. Trải nhiều lứa tuổi/hoàn cảnh để ai nghe cũng thấy mình. Gọi người nghe "các anh các chị". (Khớp với nguyên tắc viết bài luận ở Bước 4.)
- `--length`: ⚠️ **TIẾNG VIỆT CHỈ DÙNG `default`.** `--length long` KHÔNG tồn tại/không hỗ trợ cho audio tiếng Việt → API từ chối và báo lỗi mơ hồ kiểu `RESOURCE_EXHAUSTED` ("Rate limited"), DỄ TƯỞNG NHẦM là hết quota. Luôn gen `--length default` cho tiếng Việt. Muốn dài hơn thì roll lại hoặc nhồi nội dung trong focus + source, KHÔNG dùng `long`. Trả về `Artifact ID`, async 2-10 phút.
- **So sánh nhiều bản (A/B):** 1 notebook CHỨA ĐƯỢC NHIỀU audio. Chạy `nlm audio create` nhiều lần (prompt khác nhau) trên CÙNG notebook → nhiều artifact. Xem `nlm studio status <NB>` để lấy từng `artifact_id`, rồi tải riêng: `nlm download audio <NB> --id <artifact_id> --output input/<slug>.v2.m4a`. KHÔNG cần tạo notebook mới / upload nguồn lại.

### ⭐ FORMAT FOCUS TỐI ƯU — PROMPT VIẾT 100% TIẾNG ANH
**Nguyên tắc vàng:** TOÀN BỘ nội dung prompt (`--focus`) đưa vào NotebookLM phải **VIẾT BẰNG TIẾNG ANH** — mọi mệnh lệnh, mô tả, persona, cấu trúc đều tiếng Anh. NotebookLM hiểu chỉ thị tiếng Anh chính xác hơn hẳn; prompt tiếng Việt dài dễ bị bỏ sót, khiến host nói "kịch" / sặc mùi dịch.
**Chỉ chừa lại TIẾNG VIỆT ở 2 chỗ, luôn đặt trong dấu ngoặc kép hoặc ngoặc đơn:**
1. **Câu cần đọc NGUYÊN VĂN** (hook mở đầu, câu chốt outro, câu trích dẫn) — để trong "...".
2. **Từ khóa neo văn hóa / thuật ngữ** (vd nông dân, công nhân, "thiên kiến sống sót", Khổng Tử, "Tôi/Anh/Chị") — trong (...) hoặc "...".
**⭐ CẤU TRÚC PROMPT TỐI ƯU (đã kiểm chứng ở Tập 22 — kịch bản dày 11 phần, không loạn vai/sót luận điểm):** tách rõ 3 KHỐI — (A) Persona & Language, (B) Mandatory Conversation Flow đánh số THEO ĐÚNG THỨ TỰ, (C) Transitions. Mấu chốt giúp NotebookLM không "loạn" khi tri thức dày:
- **Gán giới tính + tính cách cho từng host** (Male calm/philosophical, Female gentle/analytical) → AI giữ vai ổn định, không lẫn.
- **⚠️ XƯNG HÔ — ĐỪNG ÉP CỨNG TRONG PROMPT (bài học đảo ngược 2026-07):** lỗi hay gặp là host nam gọi nữ "anh", nữ gọi nam "chị" (đảo). TRƯỚC đây tưởng fix bằng cách ghi TƯỜNG MINH mệnh lệnh gendered trong directive 1 → **SAI: chính cái block ép cứng đó GÂY đảo** (4–5 bản gen liên tục đều đảo). ĐÚNG: KHÔNG viết rule ép xưng hô theo giới tính; chỉ ghi nhẹ "let the two hosts address each other naturally as close Vietnamese friends; address the audience as các anh các chị" rồi để NotebookLM tự xử — tự nhiên hơn hẳn. Đây là lỗi audio (không sửa được ở caption) → nếu QC vẫn nghe đảo thì **roll lại bản khác**, đừng render. Xem [[podcast-xung-ho]].
- **⭐ KHÔNG cần block phiên âm trong focus.** NotebookLM mặc định đọc tên tiếng Anh RẤT TỐT — chỉ cần **bài luận (source) ghi ĐÚNG tên tiếng Anh** (Carol Tavris, Jonathan Haidt, Aleksandr Solzhenitsyn, hansei...) là host đọc chuẩn. ĐỪNG viết bảng phiên âm kiểu `Carol Tavris = "Ca-ron Ta-vrit"` vào focus — vừa thừa, vừa dễ ép host đọc méo thành một tên khác. Việc còn lại (whisper chép sai) xử lý ở Bước 7 bằng `input/<slug>.terms.txt`, KHÔNG phải bằng phiên âm trong prompt.
- **"Cover in this exact order"** + đánh số Hook → Part 1..N → Outro → ép AI đi tuần tự, không nhảy cóc/bỏ phần.

Mẫu chuẩn (phần `<...>` điền tiếng Anh; chuỗi "..." là tiếng Việt nguyên văn cần đọc; sao chép & thay nội dung từng tập):
```
You are two warm, deeply reflective Vietnamese podcast hosts conversing like two old friends over coffee. One is Male (calm, philosophical, warm), the other is Female (gentle, analytical, highly empathetic). Target audience: Vietnamese listeners (<keywords: nhân viên văn phòng, người mẹ, người chị trong nhà...>). Tone: gentle, sincere, contemplative. No academic jargon, no preaching, no toxic positivity. Target length: a rich, comprehensive <15-18> minute conversation. Speak slowly and clearly, and take a short pause between concepts so the listener can follow along. Do NOT read any section labels or headings aloud; keep it a seamless natural conversation.

CRITICAL DIRECTIVES:
1. Language & Persona: Speak naturally in a Northern Vietnamese accent (giọng Bắc) with realistic conversational fillers; avoid textbook or translated structures. Let the two hosts address each other naturally the way close Vietnamese friends would in a warm conversation — do NOT force a fixed gendered pronoun scheme. Both hosts address the audience as "các anh các chị". (⚠️ Bài học thực chiến 2026-07: ÉP xưng hô cứng theo giới tính trong prompt lại CHÍNH LÀ nguyên nhân gây đảo Anh/Chị — 4–5 bản gen liên tục đều sai; bỏ ép, để NotebookLM tự xử thì tự nhiên hơn. Xem memory podcast-xung-ho.)
2. Names & Jargon: Pronounce international names naturally as in English (the source essay already spells them correctly — no phonetic respelling needed). Always translate academic concepts into warm, simple Vietnamese immediately after. Required Vietnamese terms: "<thuật ngữ chuẩn 1>", "<thuật ngữ chuẩn 2>", ...
3. Core Thesis: Land the central thesis beautifully on this exact Vietnamese line: "<câu chốt luận đề tiếng Việt nguyên văn>".

MANDATORY CONVERSATION FLOW (Cover in this exact order):

- Hook (Opening): Open directly with this exact verbatim quote: "<câu hook tiếng Việt nguyên văn>". Immediately ground it in familiar Vietnamese scenes: <everyday example 1>, or <everyday example 2>.
- Part 1 (<title>): <English description — one idea + one everyday Vietnamese example>.
- Part 2 (<title>): <...>.
- ... (mỗi Part = 1 luận điểm + 1 ví dụ đời thường VN + (tùy chọn) 1 nhà tư tưởng, gọi tên tiếng Anh bình thường: "Cite <Tên gốc tiếng Anh>...")
- Part N (<title>): <...>.
- Outro (Conclusion): End on this exact reflection, spoken verbatim: "<câu kết tiếng Việt nguyên văn>". Followed by one final contemplative question to the listeners. Leave a lingering feeling of maturity, humility, and quiet strength.

TRANSITIONS: Seamlessly bridge segments using organic Vietnamese transitions: "Nhưng điều thú vị là...", "Điều ít người nhận ra là...", "Và đây mới là phần đáng suy ngẫm...". Present these deep life paradoxes with zero judgment.
```
- **Source là "vũ khí bí mật" — prompt chỉ là người gác cổng:** NotebookLM gen audio dựa trên TÀI LIỆU NGUỒN, không chỉ prompt. Với kịch bản đồ sộ đi qua nhiều nhà tư tưởng Đông–Tây, AI BẮT BUỘC cần một file thô dồi dào để "bấu víu" dữ liệu — nếu không sẽ bịa hoặc bỏ phần. → **Viết hẳn các ví dụ đời thường (văn phòng, gia đình Việt Nam) của TỪNG phần vào bài luận source** (Bước 4), mỗi luận điểm gắn 1 ví dụ cụ thể. Prompt tiếng Anh khi đó chỉ đóng vai "người gác cổng": ép AI phân bổ đúng thời lượng + đọc đúng chính tả/tên tiếng Việt. Thiếu trong source thì prompt có ghi mấy cũng dễ bị bỏ.
- **Tốc độ đọc & khoảng ngắt cảm xúc:** tốc độ KHÔNG chỉnh được bằng prompt. Tập dài (15–18 phút) tông sâu lắng mà nghe thấy 2 host trả lời hơi vội → nghe ở **Playback speed 0.9x** trên trình phát (không phải lỗi gen). Ở 0.9x, các đoạn chuyển giao cuối (vd phần áp chót → phần chốt → Outro) ngân và thấm hơn hẳn.
- **Chỉ thị nhịp trong focus để giảm nuốt chữ:** thêm câu ép AI nói chậm + ngắt nghỉ giữa các ý, vd `"Speak slowly and clearly; take a short pause between concepts so the listener can follow."` (đã có trong mẫu). Nuốt chữ hay xảy ra khi AI nhồi quá nhiều ý vào một hơi → mỗi Part chỉ 1 luận điểm + 1 ví dụ, đừng dồn 3–4 ý vào một đoạn. (Cân bằng với cổng 12–18': đủ phần để dài nhưng mỗi phần thong thả, KHÔNG nhồi.)
- **⚠️ NGÔN NGỮ — LƯU Ý PHÂN KỲ với hướng dẫn NotebookLM phổ thông:** tài liệu chung khuyên "dịch source sang tiếng Anh / cho host thảo luận bằng tiếng Anh để mượt". **KHÔNG áp dụng ở đây** — sản phẩm của ta BẮT BUỘC là audio TIẾNG VIỆT giọng Bắc, nên source cứ viết tiếng Việt và gen `--language vi`. Ta chỉ mượn insight đó ở đúng một chỗ: **prompt `--focus` viết bằng tiếng Anh** (NotebookLM hiểu chỉ thị Anh tốt hơn) — còn nội dung đọc vẫn thuần Việt. Nuốt chữ tiếng Việt xử lý bằng: source sạch (Bước 4) + roll bản khác + sửa transcript ở Bước 7, KHÔNG bằng cách chuyển sang tiếng Anh.
- **⭐ TÊN NƯỚC NGOÀI: KHÔNG PHIÊN ÂM TRONG FOCUS (mặc định).** NotebookLM đọc tên tiếng Anh rất tốt sẵn — chỉ cần **bài luận source ghi đúng tên tiếng Anh** là host đọc chuẩn. KHÔNG khai bảng phiên âm ở directive 2, KHÔNG "Cite <Phiên-âm> (<Tên gốc>)" trong từng Part. Việc whisper chép sai tên là chuyện của Bước 7 → vá bằng `input/<slug>.terms.txt` (map `sai => đúng`), KHÔNG phải việc của focus. ([[foreign-names-keep-english-default]])
  - **Ngoại lệ HIẾM:** chỉ khi nghe QC thấy một tên cụ thể bị host đọc chệch hẳn thì mới thêm một gợi ý phiên âm cho RIÊNG tên đó ở lần gen sau. Khi buộc phải phiên âm, **bám sát âm tên GỐC** — bài học kinh điển: `Marcus Aurelius -> "Mác-cô Au-rê-li-ô"` đọc lên thành **"Marco Aurelio"** (biến thể tiếng Ý); phải là "Mác-cút Au-rê-li-út" (giữ đủ "-cus/-us"). Đọc to chuỗi phiên âm lên, nếu ra một cái tên KHÁC thì sai. Nhưng đây là ngoại lệ — mặc định vẫn là để nguyên tên tiếng Anh, không phiên âm.
- **⚠️ GIỌNG NAM/BẮC KHÔNG ĐIỀU KHIỂN ĐƯỢC BẰNG PROMPT.** Đã thử nghiệm: focus ép giọng Bắc cực mạnh bằng tiếng Anh (`[TAG]` + "FORBIDDEN Southern" + linguistic anchors) VẪN ra audio giọng Nam 100%. NotebookLM **tự gán voice** cho mỗi lần gen — prompt chỉ chi phối nội dung/nhịp/phiên âm, KHÔNG chi phối vùng giọng. Lever thật sự để được giọng Bắc: **ACCOUNT + roll lại** — có account hay ra giọng Bắc (vd thao.hk90 từng cho giọng Bắc), có account hay ra giọng Nam (acct2/plus có hôm toàn Nam). Khi 1 account ra giọng Nam → **đổi account khác + tạo notebook mới + gen lại**, lặp tới khi được giọng Bắc. Nuốt chữ cũng là roll ngẫu nhiên. → BẮT BUỘC user nghe xác nhận giọng (Bước 7), đừng render mù.
- **⭐ THỜI LƯỢNG BẮT BUỘC 12–18 PHÚT — cổng chặn cứng.** Audio dưới 12' hoặc trên 18' đều KHÔNG đạt, phải roll lại. `--length` KHÔNG đáng tin để canh: tiếng Việt chỉ có `default`, cùng `default` từng ra 9.8 / 12.6 / 13.6 / 16.1 / 21 phút (random mỗi lần gen). Cách làm: ghi `target 15-18 minute` trong focus + source đủ dày (bài luận ~1800–2200 chữ), rồi gen nhiều bản A/B trên CÙNG notebook (`nlm audio create` lặp lại → nhiều artifact, tải từng bản bằng `--id`), **chọn bản rơi vào 12–18'**. Bản <12' thường do nuốt phần → bỏ. KHÔNG dùng `long` (xem cảnh báo Bước 5 — `long` không tồn tại cho tiếng Việt, gây lỗi giả "rate limited").

## Bước 6 — Chờ + tải audio
Poll rồi tải vào `input/` (chạy nền):
```bash
NB=<UUID>; OUT=/Users/kimthaohuynh/SourceCode/podcast-builder/input/<slug>.m4a
for i in $(seq 1 40); do
  st=$(nlm studio status $NB 2>/dev/null | grep -o '"status": "[^"]*"' | head -1)
  echo "[poll $i] $st"
  if echo "$st" | grep -qi "ready\|complete\|success"; then
    nlm download audio $NB --output "$OUT" --no-progress; break
  fi
  sleep 45
done
```
`<slug>` = tên file không dấu, gạch ngang (vd `neu-ban-bien-mat-30-ngay`).

## Bước 7 — QC audio TRƯỚC khi render (BẮT BUỘC)
NotebookLM audio tiếng Việt KHÔNG ổn định: **hay lẫn giọng Nam/Bắc** giữa chừng + **nuốt/mất câu**. Đừng render mù.
1. **Thời lượng (CỔNG CHẶN CỨNG 12–18 phút):** `ffprobe -v error -show_entries format=duration -of csv=p=0 input/<slug>.m4a` → chia 60. **<12' hoặc >18' = KHÔNG ĐẠT → roll lại (Bước 5), KHÔNG render.** Quá ngắn thường do nuốt phần/chương. Chỉ khi rơi vào 12–18' mới đi tiếp.
2. Transcribe + đối chiếu nội dung (dừng trước render):
   ```bash
   npm run make -- input/<slug>.m4a --plan-only
   ```
   Đọc `tmp/<slug>.corrected.json` / `tmp/<slug>.plan.json`, kiểm đủ các beat/chương chính của kịch bản. Thiếu chương → flag.
3. **Sửa transcript** (whisper tiếng Việt hỏng nặng: ký tự `�`, nghe nhầm tên riêng, dấu sai; `spell-fix` gốc bị BUG nhân đôi câu). Có 2 cách — **ưu tiên cách A (không tốn tiền + chính xác nhất)**:

   **A) KHÔNG gọi GPT — Claude Code tự sửa (dump/apply, dùng bài luận gốc làm chuẩn):**
   ```bash
   npx tsx podcast/scripts/spell-fix-manual.ts dump <slug>     # → tmp/<slug>.sentences.json [{id,text}]
   # Claude ĐỌC tmp/<slug>.sentences.json + input/<slug>.essay.txt (nguồn chuẩn) → sửa chính tả/tên riêng,
   #   GIỮ NGUYÊN id + số câu, ghi tmp/<slug>.sentences.corrected.json (cùng dạng [{id,text}]).
   npx tsx podcast/scripts/spell-fix-manual.ts apply <slug>    # → tmp/<slug>.corrected.json (make cache-skip OpenAI)
   ```
   Cách này chính xác nhất vì Claude đối chiếu trực tiếp bài luận (tên nước ngoài, thuật ngữ) + không tốn API. Xem memory [[spell-fix-bang-claude-khong-openai]].

   **B) Gọi GPT tự động (nhanh, nhiều câu):**
   ```bash
   npx tsx podcast/scripts/transcript-correct.ts <slug>
   ```
   ⚠️ Mặc định NAY là **gpt-4o** (KHÔNG phải gpt-4o-mini — mini sót rất nhiều tên riêng/dấu) và **tự nạp `input/<slug>.essay.txt` làm nguồn chuẩn** để sửa đúng tên (vd "Semizeki"→"Semir Zeki", "đọc lớt"→"đọc lướt", "chật trội"→"chật chội"). Glossary riêng tập: `input/<slug>.terms.txt` (mỗi dòng `sai => đúng`).

   **Glossary CHUNG tái dùng mọi tập:** `input/_common-terms.txt` (lỗi Whisper hay gặp: Chuẩn/chuyển/chuyện, con→còn, trở bàn tay, tước bỏ, tên riêng Semir Zeki/Schopenhauer/Tanha/Upeksha...) — transcript-correct tự nạp. **Gặp lỗi mới → THÊM vào file này** để lần sau tự sửa.

   **⭐ C) USER ĐÁNH DẤU LỖI trên UI (tab Transcript) → AI review đúng câu đó:** user bấm biểu tượng **cờ** ở đầu mỗi câu sai (lưu `tmp/<slug>.flags.json` = index câu; nút "chỉ hiện câu đánh dấu" + "copy cờ cho AI"). AI xem đúng các câu đó rồi sửa trong `tmp/<slug>.corrected.json`:
   ```bash
   npx tsx podcast/scripts/spell-fix-manual.ts flags <slug>   # in các câu user đánh dấu (kèm ngữ cảnh)
   ```
   Sửa xong → bảo user bỏ cờ trên UI. (Đây là kênh nhanh nhất để bắt lỗi user nghe thấy mà scan tự động bỏ sót.)

   Sau cả 2 cách: quét lỗi còn sót (`node -e` đếm `�`, câu lặp, tên riêng sai) + vá tay các lỗi confident bằng replace trong `corrected.json`. **QUAN TRỌNG:** `corrected.json` mới hơn raw → `make` full skip spell-fix và DÙNG bản đã sửa. Nếu đã render/plan trước đó → xoá `tmp/<slug>.plan.json` để regen caption ([[plan-json-cache-after-correct]]).
4. **User nghe** xác nhận: (a) giọng Bắc nhất quán (máy khó tự bắt accent); (b) **xưng hô đúng giới tính** — host nam xưng "Tôi"/gọi nữ là "Chị", host nữ xưng "Tôi"/gọi nam là "Anh"; audio hay bị ĐẢO (nam gọi nữ là "anh", nữ gọi nam là "chị"). Cả 2 lỗi này nằm trong tiếng nói nên KHÔNG sửa được ở transcript/caption cho khớp.
5. Đạt → Bước 8. Lỗi giọng HOẶC đảo xưng hô → quay lại Bước 5 regenerate (`nlm audio create` lại / roll bản khác), KHÔNG render.

## Bước 8 — Episode config
Tạo `input/<slug>.json` (chỉ `title` + `episodeNumber` bắt buộc; còn lại có default):
```json
{ "style": "podcast", "title": "...", "hook": "...", "episodeNumber": <max+1>,
  "bgm": null, "coverImage": null, "showIntro": true, "showOutro": true,
  "publishStatus": "draft", "publishCaption": "...", "publishHashtags": ["bytecast"] }
```
`episodeNumber`: `grep -h '"episodeNumber"' input/*.json | grep -oE '[0-9]+' | sort -n | tail -1` rồi +1.
**Cover:** set `"coverImage": "<tên-file>.cover.png"` (ảnh đặt trong `input/`, ~9:16). Nếu thiếu cover → video không có ảnh bìa/intro. Kiểm `ls input/*.cover.png` xem có sẵn ảnh đúng chủ đề chưa.
**⭐ NHẠC NỀN — KẾ THỪA BẢN CHỌN GẦN NHẤT:** không phải chọn lại mỗi tập. Nhạc mặc định lưu ở `input/_music-default.json` (+ file dùng chung `input/_default.bgm.<ext>`); tập mới tự điền `bgm`/`bgmVolumeDb`/`bgmMode`/`musicCredit` từ đó (createEmptyEpisode gọi `applyMusicDefaults`). Khi user upload bgm mới cho 1 tập (UI) → tự cập nhật làm default cho các tập sau. Khi tạo config tay cho tập mới, đọc `input/_music-default.json` và điền theo (nếu có). Đổi nhạc mặc định = upload bgm mới, hoặc sửa `input/_music-default.json`.

## Bước 8.5 — Hình ảnh nâng cấp originality (footage · màu chủ đề · biên tập · công bố AI)

Các tính năng làm video ĐỘC NHẤT để qua kiểm duyệt kiếm tiền Meta (xem `docs/originality-upgrade-plan.md`, memory [[fb-monetization-originality-project]]). Tất cả thiết kế cho AI agent chạy tự động.

### ⭐ FOOTAGE PHONG CẢNH — ĐÚNG CHỦ ĐỀ + TUYỆT ĐỐI KHÔNG NGƯỜI (quan trọng)
```bash
npx tsx podcast/scripts/footage-plan.ts <slug> --apply --all-pexels
```
- LLM đọc transcript → sinh shot-list 12-16 beat, mỗi beat 1 query **cảnh thiên nhiên hợp TÔNG CẢM XÚC** của đoạn (suy tư→nước/mây/trăng; mất mát→lá thu/sương/hoàng hôn; hy vọng→bình minh/rừng xuân/hoa sen; bao la→bầu trời sao/ngân hà; căng thẳng→biển động/rừng mưa). Bộ cảnh: sen, súng, thác, rừng mưa, rừng xuân, lá thu, núi sương, bình minh, hoàng hôn, sao, trăng, tre, hồ, sóng biển, mây...
- **BẮT BUỘC KHÔNG NGƯỜI:** query chỉ phong cảnh (no people/person/hands/crowd) + **vision people-check** (`clipHasPeople` gpt-4o) tự loại clip Pexels dính người, duyệt ứng viên tiếp. (Tắt bằng env `FOOTAGE_PEOPLE_CHECK=0` — KHÔNG khuyến khích.)
- **KHÔNG lặp clip:** tải đủ clip cảnh (mỗi clip 1 lần, không trùng id) tới khi tổng thời lượng ≥ audio → `--all-pexels` fill kín.
- Tự ghi `episode.footage` + `footageCredit` (ghi công tác giả Pexels). Xem báo cáo `tmp/<slug>.footage-plan.json` trước khi render; tab **Footage** trong UI để user xem trước.
- Pexels API: `docs/pexels-api.md` (200 req/giờ; client `podcast/scripts/pexels.ts`). Clip tự quay (nếu có): `prep-footage.ts` (bỏ tiếng + chuẩn hoá 1080×1920). Bài học: [[footage-plan-pexels]] [[footage-pool-and-prep]].
- **Treatment mặc định TẮT** (giữ chất lượng/màu gốc). Chỉnh qua env `FOOTAGE_BLUR/BRIGHTNESS/SATURATION/INK` nếu muốn tối/blur.

### ⭐ MÀU CHỦ ĐỀ (cover + sóng đồng bộ)
- Prompt cover (`cover-prompt-store.ts`) tự chọn 1 màu chủ đạo hợp cảm xúc tập → dùng cho cover.
- `npx tsx podcast/scripts/derive-accent.ts <slug>` đọc ảnh cover → suy màu → ghi `episode.accentColor` → **màu sóng (visualizer)** khớp cover. (Hoặc nút "Áp dụng cho màu sóng" ở UI.) Xem [[cover-theme-color-and-wave]].

### ⭐ LỚP BIÊN TẬP GỐC (chapter + trích dẫn có nguồn)
`gen-editorial.ts` (chạy tự động trong make.ts khi `showEditorial=true`, mặc định gpt-4o) → tiêu đề chương + thẻ trích dẫn "tên nhà tư tưởng — khái niệm" hiện trên video. Meta xếp "chỉ phụ đề" là đóng góp yếu → lớp này là tín hiệu biên tập gốc. [[editorial-overlay-feature]].

### ⭐ CÔNG BỐ AI + GHI CÔNG
Tab **Đăng** tự nối khối công bố (kịch bản gốc do người biên soạn + lời dẫn AI + ghi công nhạc/footage/nguồn) vào cuối caption khi copy. Khi đăng FB nhớ **bật nhãn AI**. [[fb-monetization-originality-project]].

## Bước 9 — Render

### ⭐ RENDER QUA UI API để HIỆN TIẾN TRÌNH (mặc định — user cần nhìn được)
User muốn thấy tiến trình render trên UI → PHẢI render qua **server API**, KHÔNG dùng `npm run make` CLI (CLI không báo lên UI). Cần server chạy (`:3000`):
```bash
curl -s -X POST http://localhost:3000/api/render \
  -H "Content-Type: application/json" \
  -d '{"episodeName":"<slug>","preview":false,"regenTranscribe":false,"regenPlan":true}'
# poll tiến trình:  curl -s http://localhost:3000/api/render/jobs/<job-id>
```
Hoặc bảo user bấm nút Render trong tab **Render** của UI. Server (`render-runner.ts`) đã hỗ trợ **footage 2-pass ProRes có báo % theo từng đoạn** lên UI (`setPhase` "footage đoạn i/N"). Sau khi sửa `corrected.json` → `regenPlan=true`, `regenTranscribe=false` ([[render-qua-api-regen-plan]]).

CLI (chỉ khi KHÔNG cần UI progress, hoặc debug) — ghi log ra file để theo dõi, ĐỪNG pipe `| tail`:
```bash
npm run make -- input/<slug>.m4a > /tmp/render.log 2>&1   # rồi tail -f /tmp/render.log
npm run make -- input/<slug>.m4a --preview
```
- **Có footage (`episode.footage` != [])** → CẢ make.ts LẪN render-runner (UI) tự dùng **2-pass ProRes per-chunk** (ffmpeg dựng nền footage + Remotion render đồ hoạ trong suốt ProRes alpha từng đoạn 1500 frame + ghép + xoá ProRes ngay). ~30', ổn định. KHÔNG render footage 1 lượt (crash browser Remotion). Chi tiết [[footage-full-render-not-viable]].
- **Đĩa:** cần THOÁNG (>10Gi lý tưởng). Đĩa <9Gi → macOS thrash (StorageManagement/CacheDelete) làm render chậm/erratic/ENOSPC — KHÔNG phải lỗi code; dọn đĩa hoặc đợi OS purge rồi chạy lại; đặt `RENDER_TIMEOUT_MS=600000` cho chắc.
- **Bẫy theo dõi:** đừng `npm run make ... | tail -N` (buffer hết output tới khi xong) — ghi log ra file rồi `tail -f`.
Yêu cầu: ffmpeg, whisper `whisper.cpp/ggml-medium.bin`, `OPENAI_API_KEY` + `PEXELS_API_KEY` trong `.env`.

## Tóm tắt 1 dòng mỗi bước
research → viết/mở rộng essay → **review essay (bỏ tiêu đề cứng + giảm mật độ triết gia ≤6 tên + câu đệm)** → `nlm source add` (essay + 10 URL) → `nlm audio create --language vi --length default --focus "<giọng Bắc + khung>"` → poll + `nlm download audio` vào `input/` → QC (thời lượng + `--plan-only` + user nghe) → viết `input/<slug>.json` → **footage-plan --all-pexels (cảnh hợp chủ đề, KHÔNG người, không lặp) + derive-accent + (editorial tự chạy)** → **render qua UI API** `POST /api/render` (hiện tiến trình trên UI; footage → 2-pass ProRes tự động).
