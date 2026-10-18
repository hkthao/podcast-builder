---
name: notebooklm-podcast
description: Tạo video podcast từ NotebookLM Audio Overview. Dùng khi user muốn biến một bài luận/chủ đề thành podcast tiếng Việt qua NotebookLM rồi render thành video bằng pipeline repo này. Quy trình: tìm nguồn → upload notebook → gen audio (giọng Bắc) → QC → render bản Facebook 9:16 (+ tuỳ chọn bản YouTube 16:9) → đăng thẳng lên Facebook Reel (có lên lịch) / soạn sẵn data đăng YouTube (upload tay). Bao gồm cú pháp `nlm` CLI và các bẫy đã biết.
---

# NotebookLM → Video Podcast

Biến 1 bài luận/chủ đề thành video podcast: research nguồn → nạp NotebookLM → gen Audio Overview tiếng Việt → QC → render qua `make.ts`.

**2 khung từ CÙNG 1 audio:** bản **Facebook 9:16** (`output/<slug>.mp4`, mặc định) và bản **YouTube 16:9** (`output/<slug>.yt.mp4`, tuỳ chọn — Bước 8.5/9/11). Mỗi khung có cover, footage, data đăng RIÊNG; transcript/plan/editorial dùng chung. Upload YouTube làm TAY (không có API) — app chỉ soạn data + lưu link. [[youtube-landscape-16x9]]

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
- **⭐ QUOTA GEN AUDIO (user xác nhận 2026-10-18):** tài khoản **Plus: 6 audio / 5 giờ**; các tài khoản khác: **3 audio**. Chạy hàng loạt (skill plan-week) → gen audio ByteCast ĐẦU TIÊN trong phiên, dàn roll A/B qua các profile; hết cả → đợi cửa sổ 5 giờ hoặc báo tập đó dở.
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

### ⭐ KHUÔN BÀI LUẬN THEO CHỦ ĐỀ — đọc [references/essay-pattern.md](references/essay-pattern.md) TRƯỚC KHI VIẾT
Rút từ các tập 117–122 (đều ra audio 14–17'): tiêu đề là câu hỏi; mở bài 1 trong 4 kiểu (nhân vật có tên / "bạn" trong khoảnh khắc / hai người đối chiếu / quan sát lạ); mạch niềm tin cũ → thực tế → lăng kính Đông–Tây–khoa học (1 tên/đoạn + câu đệm) → ngụ ngôn → phân biệt 2 khái niệm; kết "không phải là… Mà là…". 1.500–3.600 chữ đều được.

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
- **Chỉ thị nhịp trong focus để giảm nuốt chữ:** thêm câu ép AI nói chậm + ngắt nghỉ giữa các ý, vd `"Speak slowly and clearly; take a short pause between concepts so the listener can follow."` (đã có trong mẫu). Nuốt chữ hay xảy ra khi AI nhồi quá nhiều ý vào một hơi → mỗi Part chỉ 1 luận điểm + 1 ví dụ, đừng dồn 3–4 ý vào một đoạn. (Cân bằng với cổng 14–18': đủ phần để dài nhưng mỗi phần thong thả, KHÔNG nhồi.)
- **⚠️ NGÔN NGỮ — LƯU Ý PHÂN KỲ với hướng dẫn NotebookLM phổ thông:** tài liệu chung khuyên "dịch source sang tiếng Anh / cho host thảo luận bằng tiếng Anh để mượt". **KHÔNG áp dụng ở đây** — sản phẩm của ta BẮT BUỘC là audio TIẾNG VIỆT giọng Bắc, nên source cứ viết tiếng Việt và gen `--language vi`. Ta chỉ mượn insight đó ở đúng một chỗ: **prompt `--focus` viết bằng tiếng Anh** (NotebookLM hiểu chỉ thị Anh tốt hơn) — còn nội dung đọc vẫn thuần Việt. Nuốt chữ tiếng Việt xử lý bằng: source sạch (Bước 4) + roll bản khác + sửa transcript ở Bước 7, KHÔNG bằng cách chuyển sang tiếng Anh.
- **⭐ TÊN NƯỚC NGOÀI: KHÔNG PHIÊN ÂM TRONG FOCUS (mặc định).** NotebookLM đọc tên tiếng Anh rất tốt sẵn — chỉ cần **bài luận source ghi đúng tên tiếng Anh** là host đọc chuẩn. KHÔNG khai bảng phiên âm ở directive 2, KHÔNG "Cite <Phiên-âm> (<Tên gốc>)" trong từng Part. Việc whisper chép sai tên là chuyện của Bước 7 → vá bằng `input/<slug>.terms.txt` (map `sai => đúng`), KHÔNG phải việc của focus. ([[foreign-names-keep-english-default]])
  - **Ngoại lệ HIẾM:** chỉ khi nghe QC thấy một tên cụ thể bị host đọc chệch hẳn thì mới thêm một gợi ý phiên âm cho RIÊNG tên đó ở lần gen sau. Khi buộc phải phiên âm, **bám sát âm tên GỐC** — bài học kinh điển: `Marcus Aurelius -> "Mác-cô Au-rê-li-ô"` đọc lên thành **"Marco Aurelio"** (biến thể tiếng Ý); phải là "Mác-cút Au-rê-li-út" (giữ đủ "-cus/-us"). Đọc to chuỗi phiên âm lên, nếu ra một cái tên KHÁC thì sai. Nhưng đây là ngoại lệ — mặc định vẫn là để nguyên tên tiếng Anh, không phiên âm.
- **⚠️ GIỌNG NAM/BẮC KHÔNG ĐIỀU KHIỂN ĐƯỢC BẰNG PROMPT.** Đã thử nghiệm: focus ép giọng Bắc cực mạnh bằng tiếng Anh (`[TAG]` + "FORBIDDEN Southern" + linguistic anchors) VẪN ra audio giọng Nam 100%. NotebookLM **tự gán voice** cho mỗi lần gen — prompt chỉ chi phối nội dung/nhịp/phiên âm, KHÔNG chi phối vùng giọng. Lever thật sự để được giọng Bắc: **ACCOUNT + roll lại** — có account hay ra giọng Bắc (account chính thường cho giọng Bắc), có account hay ra giọng Nam (profile phụ/plus có hôm toàn Nam). Khi 1 account ra giọng Nam → **đổi account khác + tạo notebook mới + gen lại**, lặp tới khi được giọng Bắc. Nuốt chữ cũng là roll ngẫu nhiên. → BẮT BUỘC user nghe xác nhận giọng (Bước 7), đừng render mù.
- **⭐ THỜI LƯỢNG BẮT BUỘC 14–18 PHÚT — cổng chặn cứng (user chốt 2026-10-18: chất lượng audio NotebookLM giờ đã tốt, chỉ cần chọn bản đúng thời lượng).** Audio dưới 14' hoặc trên 18' đều KHÔNG đạt, phải roll lại. `--length` KHÔNG đáng tin để canh: tiếng Việt chỉ có `default`, cùng `default` từng ra 9.8 / 12.6 / 13.6 / 16.1 / 21 phút (random mỗi lần gen). Cách làm: ghi `target 15-18 minute` trong focus + source đủ dày (bài luận ~1800–2200 chữ), rồi gen nhiều bản A/B trên CÙNG notebook (`nlm audio create` lặp lại → nhiều artifact, tải từng bản bằng `--id`), **chọn bản rơi vào 14–18'**. Bản <12' thường do nuốt phần → bỏ. KHÔNG dùng `long` (xem cảnh báo Bước 5 — `long` không tồn tại cho tiếng Việt, gây lỗi giả "rate limited").

## Bước 6 — Chờ + tải + chọn bản (1 lệnh, KHÔNG poll tay)
```bash
npx tsx podcast/scripts/nlm-batch.ts <slug> [--takes=2] [--notebook=<id>] [--profile=<name>]
```
Claude chỉ viết `input/<slug>.essay.txt`, `input/<slug>.focus.txt`, `input/<slug>.sources.txt` (URL mỗi dòng). Script tự: tạo notebook (hoặc `--notebook=` có sẵn) → nạp bài luận + URL → gen N bản (đếm bản mới qua `studio status --json`, không create lại khi lỗi → tránh bản ma) → poll → tải `input/<slug>.takeN.m4a` → cắt đuôi im lặng → chọn bản 14–18' gần 16' nhất → `input/<slug>.m4a`. Trạng thái `tmp/<slug>.nlm.json` → chạy lại = tiếp tục (`--takes=1` gen thêm 1 bản). Exit 0 = có bản đạt · 2 = chưa có (roll thêm / đổi profile) · 1 = lỗi. Chạy nền (Bash `run_in_background`), đợi thông báo xong — ĐỪNG poll.

Lệnh `nlm` tay ở Bước 4–5 chỉ để gỡ lỗi / làm từng bước.

## Bước 7 — QC audio TRƯỚC khi render (BẮT BUỘC)
NotebookLM audio tiếng Việt KHÔNG ổn định: **hay lẫn giọng Nam/Bắc** giữa chừng + **nuốt/mất câu**. Đừng render mù.
1. **Thời lượng (CỔNG CHẶN CỨNG 14–18 phút — cổng DUY NHẤT khi chạy tự động):** `ffprobe -v error -show_entries format=duration -of csv=p=0 input/<slug>.m4a` → chia 60. **<14' hoặc >18' = KHÔNG ĐẠT → roll lại (Bước 5), KHÔNG render.** Quá ngắn thường do nuốt phần/chương. Kiểm thêm đuôi im lặng (`silencedetect`, outro cụt) rồi cắt.
2. Transcribe + đối chiếu nội dung (dừng trước render):
   ```bash
   npm run make -- input/<slug>.m4a --plan-only
   ```
   Chạy local hoàn toàn (normalize + whisper + gom câu + plan — KHÔNG gọi OpenAI). Đọc `tmp/<slug>.corrected.json` / `tmp/<slug>.plan.json`, kiểm đủ các beat/chương chính của kịch bản. Thiếu chương → flag.
3. **Sửa transcript — CLAUDE CODE TỰ SỬA, KHÔNG GỌI OPENAI (bắt buộc, miễn phí).** Whisper tiếng Việt hỏng nặng (ký tự `�`, nghe nhầm tên riêng, sai dấu). Pipeline (`spellFix` trong make.ts / render-runner) **mặc định KHÔNG gọi OpenAI** — chỉ gom token → câu, ghi `corrected.json` CHƯA sửa (log: `KHÔNG gọi OpenAI. Sửa chính tả bằng Claude`). Việc sửa do Claude làm:
   ```bash
   npx tsx podcast/scripts/spell-fix-manual.ts dump <slug>     # → tmp/<slug>.sentences.json [{id,text}]
   # Claude ĐỌC tmp/<slug>.sentences.json + input/<slug>.essay.txt (nguồn chuẩn) + input/_common-terms.txt
   #   → sửa chính tả/dấu/tên riêng, GIỮ NGUYÊN id + số câu + ý nghĩa (KHÔNG viết lại câu),
   #   ghi tmp/<slug>.sentences.corrected.json (cùng dạng [{id,text}]).
   npx tsx podcast/scripts/spell-fix-manual.ts apply <slug>    # → tmp/<slug>.corrected.json (mtime mới → make cache-skip)
   rm -f tmp/<slug>.plan.json                                   # caption/plan phải đọc lại bản đã sửa
   ```
   - Dump đọc transcript RAW (`tmp/<slug>.json`), nên chạy được cả khi `corrected.json` (chưa sửa) đã có từ `--plan-only`.
   - Transcript dài (~400-600 câu) → đọc + sửa theo từng khúc, nhưng ghi ĐỦ mọi id vào file corrected (câu không đổi vẫn ghi lại nguyên văn).
   - Ưu tiên: hết `�` → tên riêng/thuật ngữ đúng theo bài luận (tên nước ngoài giữ gốc tiếng Anh) → dấu thanh/từ nghe nhầm. KHÔNG sửa văn phong nói của host (vẫn là lời nói, không phải văn viết).
   - **Glossary CHUNG** `input/_common-terms.txt` (lỗi Whisper hay gặp: Chuẩn/chuyển/chuyện, con→còn, tên Semir Zeki/Schopenhauer/Tanha/Upeksha...) — Claude đọc làm tham chiếu; **gặp lỗi mới → THÊM vào file này**. Glossary riêng tập: `input/<slug>.terms.txt` (`sai => đúng`).
   - Xem [[spell-fix-bang-claude-khong-openai]].

   **⭐ USER ĐÁNH DẤU LỖI trên UI (tab Transcript) → Claude sửa đúng câu đó:** user bấm **cờ** ở câu sai (lưu `tmp/<slug>.flags.json`). Claude xem rồi sửa trong `tmp/<slug>.corrected.json` (hoặc trong sentences.corrected.json rồi apply lại):
   ```bash
   npx tsx podcast/scripts/spell-fix-manual.ts flags <slug>   # in các câu user đánh dấu (kèm ngữ cảnh)
   ```
   Sửa xong → bảo user bỏ cờ trên UI. Đây là kênh nhanh nhất bắt lỗi user nghe thấy mà scan tự động bỏ sót.

   Sau khi apply: quét lỗi còn sót (`node -e` đếm `�`, câu lặp, tên riêng sai) + vá tay lỗi confident trong `corrected.json`. Đã render/plan trước đó → render lại với `regenPlan=true, regenTranscribe=false` ([[plan-json-cache-after-correct]]). **ĐỪNG tick "Tạo lại transcript" trên UI** sau khi đã sửa — nó chạy lại whisper + ghi đè `corrected.json` bằng bản chưa sửa.

   > ⛔ **KHÔNG dùng** `transcript-correct.ts` (gọi GPT-4o, tốn phí) hay `SPELL_FIX_OPENAI=1` — chỉ khi user yêu cầu rõ.
4. **(Tham khảo, không chặn khi chạy tự động)** `npx tsx story/scripts/audio-qc.ts <slug> --podcast` — Gemini nghe audio, chấm giọng Bắc/Nam + xưng hô 2 host + lỗi lặp/vấp. Chạy tay thì user có thể nghe xác nhận: (a) giọng Bắc nhất quán; (b) **xưng hô đúng giới tính** — host nam xưng "Tôi"/gọi nữ là "Chị", host nữ xưng "Tôi"/gọi nam là "Anh"; audio hay bị ĐẢO (nam gọi nữ là "anh", nữ gọi nam là "chị"). Cả 2 lỗi này nằm trong tiếng nói nên KHÔNG sửa được ở transcript/caption cho khớp.
5. Đạt → Bước 8. Lỗi giọng HOẶC đảo xưng hô → quay lại Bước 5 regenerate (`nlm audio create` lại / roll bản khác), KHÔNG render.

## Bước 8 — Episode config
**Tạo tập qua app** (số tập đếm riêng theo series): từ ô kế hoạch `POST /api/plan/slots/<id>/create-episode`, hoặc `POST /api/episodes {"title","hook","series":"bytecast"}`. Rồi điền các trường dưới vào `input/<slug>.json`. (Cách cũ — tạo file tay, `episodeNumber` = max+1 — vẫn chạy nhưng phải tự lọc đúng series.)
```json
{ "style": "podcast", "title": "...", "hook": "...", "episodeNumber": <max+1>,
  "bgm": null, "coverImage": null, "showIntro": true, "showOutro": true,
  "publishStatus": "draft", "publishCaption": "...", "publishHashtags": ["bytecast"],
  "fbPlaylistId": "P0X", "fbPlaylistName": "<tên playlist khớp>" }
```
`episodeNumber`: `grep -h '"episodeNumber"' input/*.json | grep -oE '[0-9]+' | sort -n | tail -1` rồi +1.

**⭐ CHỌN PLAYLIST — CLAUDE TỰ CHỌN, KHÔNG GỌI OPENAI (miễn phí):** khi chạy qua skill này, ĐỪNG dùng nút "Gợi ý AI" trên UI (nút đó gọi OpenAI, tốn phí). Thay vào đó **Claude tự đọc `input/_fb-playlists.json`** (mỗi playlist có `id`/`title`/`desc`) + tiêu đề/hook/bài luận của tập, rồi tự chọn playlist KHỚP chủ đề nhất và **điền `fbPlaylistId` + `fbPlaylistName`** vào config trên. Nếu không playlist nào khớp → để trống 2 field đó và **báo user nên tạo playlist mới** (đề xuất tên), rồi thêm vào `input/_fb-playlists.json`. Đã điền sẵn trong config thì tab Đăng tự chọn đúng playlist — user chỉ việc đăng. (⚠️ Nhắc lại: Graph API không tự thêm Reel vào playlist → vẫn phải thêm tay sau khi đăng.)
> **UI (EpisodeEdit) — tab:** Âm thanh (Audio + Nhạc nền) · Nội dung · **Footage** · **Render** · **Đăng**. Footage / Render / Đăng đều chia 2 tab con **Facebook 9:16 | YouTube 16:9**. **Ảnh cover + "Prompt tạo ảnh cover" nằm trong tab Render, đúng tab khung** (không còn ở tab Âm thanh / Cấu hình). Tab "Ghép take" đã gỡ.
**Cover 9:16:** set `"coverImage": "<slug>.cover.png"` (ảnh trong `input/`, ~9:16). Thiếu cover → video không có ảnh bìa/intro. Kiểm `ls input/*.cover.png`.
**Cover 16:9 (bản YouTube, tuỳ chọn):** `"coverImageLandscape": "<slug>.cover-yt.png"` (upload ở Render → YouTube 16:9 → "Ảnh cover YouTube (16:9)"). Dùng làm intro bản ngang + **thumbnail YouTube** (tự xuất `output/<slug>.yt.thumb.jpg` 1280×720). Thiếu → bản 16:9 dùng cover dọc (contain + nền mờ), thumbnail lấy frame hook. Prompt thumbnail YouTube (key `podcast.cover-prompt-yt`) dùng **ĐÚNG NGUYÊN VĂN tiêu đề tập** (viết hoa, ngắt dòng) + 1 vật kể chuyện, bố cục trái-phải, giữ `accentColor` của tập. ⚠️ Model ảnh hay sai dấu tiếng Việt khi chữ dài → soát chính tả trên ảnh trước khi upload.
**⭐ PROMPT TẠO ẢNH COVER — CLAUDE CODE TỰ VIẾT, KHÔNG GỌI OPENAI (miễn phí):** đừng bấm gen qua API trên UI (ẩn sau nút "Gen qua API (tốn phí)"). Claude tự làm cho mỗi khung cần:
```bash
npx tsx podcast/scripts/cover-prompt.ts brief <slug>              # cover Reels 9:16 — in system prompt hiệu lực (có override /prompts) + tiêu đề/hook
npx tsx podcast/scripts/cover-prompt.ts brief <slug> --landscape  # thumbnail YouTube 16:9
# Claude đọc brief (+ input/<slug>.essay.txt để hiểu chủ đề), viết output ĐÚNG quy tắc R0-R6 của system prompt:
#   dòng 1 "THEME_COLOR: #RRGGBB — <tên màu>", rồi prompt tiếng Anh đầy đủ (giữ nguyên các section style/negative),
#   ghi vào tmp/<slug>.cover-prompt.txt (hoặc .cover-prompt.yt.txt)
npx tsx podcast/scripts/cover-prompt.ts apply <slug> tmp/<slug>.cover-prompt.txt
npx tsx podcast/scripts/cover-prompt.ts apply <slug> tmp/<slug>.cover-prompt.yt.txt --landscape
```
`apply` lưu vào `coverPrompt` / `coverPromptLandscape` (bản 9:16: tập chưa có `accentColor` → set luôn THEME_COLOR làm màu sóng).
**Tạo ảnh (tự động):** `curl -s -X POST "http://localhost:3000/api/episodes/<slug>/cover-image?provider=gemini"` (thêm `&variant=landscape` cho 16:9) → model rẻ nhất (`gemini-3.1-flash-lite-image`), gắn thẳng làm cover. **Claude XEM ẢNH kiểm chữ tiếng Việt từng dấu** — sai/chữ bay khó đọc thì tạo lại (tối đa 3 lần), vẫn sai thì báo. Trên UI: Render → "Prompt tạo ảnh cover" → [Gemini ▾] Tạo ảnh. Bản 16:9: dùng ĐÚNG `accentColor` đã có (brief truyền sẵn) + TITLE đúng nguyên văn tiêu đề tập.
**⭐ NHẠC NỀN — KẾ THỪA BẢN CHỌN GẦN NHẤT:** không phải chọn lại mỗi tập. Nhạc mặc định lưu ở `input/_music-default.json` (+ file dùng chung `input/_default.bgm.<ext>`); tập mới tự điền `bgm`/`bgmVolumeDb`/`bgmMode`/`musicCredit` từ đó (createEmptyEpisode gọi `applyMusicDefaults`). Khi user upload bgm mới cho 1 tập (UI) → tự cập nhật làm default cho các tập sau. Khi tạo config tay cho tập mới, đọc `input/_music-default.json` và điền theo (nếu có). Đổi nhạc mặc định = upload bgm mới, hoặc sửa `input/_music-default.json`.

## Bước 8.5 — Hình ảnh nâng cấp originality (footage · màu chủ đề · biên tập · công bố AI)

Các tính năng làm video ĐỘC NHẤT để qua kiểm duyệt kiếm tiền Meta (xem `docs/originality-upgrade-plan.md`, memory [[fb-monetization-originality-project]]). Tất cả thiết kế cho AI agent chạy tự động.

### ⭐ FOOTAGE BÁM NỘI DUNG TỪNG ĐOẠN + TUYỆT ĐỐI KHÔNG NGƯỜI (quan trọng)
Chế độ 100% Pexels **bám thời gian**: lời thoại chia thành beat ~45s theo mốc video thật (đã cộng intro+hook chỉ-nhạc) → mỗi beat 3 query là **ẨN DỤ HÌNH ẢNH cho Ý của đúng khúc đó** → lấp bằng các shot cắt đúng độ dài (dọc ~6s, ngang ~7s; env `FOOTAGE_SHOT_SEC`) xếp theo thời gian → nền footage khớp nội dung đang nói. **NỘI DUNG > MÀU** (màu chủ đề chỉ là gợi ý phụ — bài học: chọn theo màu thì đúng tông nhưng lạc nội dung).

**Làm theo skill `footage-shotlist`** (dùng chung mọi tập): `--brief` → Claude viết `tmp/<slug>[.yt].footage-shotlist.json` → `--shotlist=<file> --apply` → cập nhật thư viện mô-típ `podcast/data/footage-motifs.json`. Luật shot-list = prompt `podcast.footage-shotlist` (sửa ở /prompts). KHÔNG gọi OpenAI cho shot-list.
- ~15' → ~130-150 shot, tải song song 3 beat (`FOOTAGE_CONCURRENCY`), mất ~15-30'. Clip cũ của tập chỉ bị dọn SAU khi `--apply` thành công (chạy thử không --apply không làm hỏng footage đang dùng).
- Tự ghi `episode.footage` + `footageCredit` (ghi công tác giả Pexels). Xem báo cáo `tmp/<slug>.footage-plan.json` trước khi render; tab **Footage** trong UI để user xem trước.
- Pexels API: `docs/pexels-api.md` (200 req/giờ; client `podcast/scripts/pexels.ts`). Clip tự quay (nếu có): `prep-footage.ts` (bỏ tiếng + chuẩn hoá 1080×1920). Bài học: [[footage-plan-pexels]] [[footage-pool-and-prep]].
- **Sổ clip đã dùng** `input/_footage-used.json`: tập mới KHÔNG lấy lại clip Pexels của tập cũ (tự loại). **Blocklist bản quyền** `input/_footage-blocklist.json` (tác giả/clip bị Meta chặn) tự loại khỏi search. [[footage-copyright-blocklist]]

### ⭐ FOOTAGE NGANG cho bản YouTube 16:9 (chỉ khi làm bản YouTube)
```bash
npx tsx podcast/scripts/footage-plan.ts <slug> --landscape --apply
```
- Luôn 100% Pexels NGANG (pool tự quay đang là dọc → không dùng được), lấp đủ thời lượng, cùng luật KHÔNG người + không lặp. Clip lưu `input/footage/pexels-yt/`, ghi `episode.footageLandscape` + **`footageCreditLandscape`** (credit riêng — `footageCredit` giữ cho bản FB). Sổ clip khoá `<slug>#yt` nên chạy lại không xoá dòng bản dọc. Báo cáo `tmp/<slug>.yt.footage-plan.json`.
- ~15-20' footage → tải ~30-35 clip, mất vài phút (gpt-4o shot-list + vision people-check mỗi clip → tốn chút OpenAI).
- Clip tự quay ngang (nếu có): `npx tsx podcast/scripts/prep-footage.ts --landscape <file...>` → `input/footage/yt/` rồi thêm tay `"yt/<tên>.mp4"` vào `footageLandscape`.
- **Bản 16:9 CHỈ chạy nền footage** (scene sticker vẽ cố định cho khung dọc) — thiếu `footageLandscape` thì nút render YouTube bị khoá.
- **Treatment mặc định TẮT** (giữ chất lượng/màu gốc). Chỉnh qua env `FOOTAGE_BLUR/BRIGHTNESS/SATURATION/INK` nếu muốn tối/blur.

### ⭐ MÀU CHỦ ĐỀ (cover + sóng đồng bộ)
- Prompt cover (`cover-prompt-store.ts`) tự chọn 1 màu chủ đạo hợp cảm xúc tập → dùng cho cover.
- `npx tsx podcast/scripts/derive-accent.ts <slug>` đọc ảnh cover → suy màu → ghi `episode.accentColor` → **màu sóng (visualizer)** khớp cover. (Hoặc nút "Áp dụng cho màu sóng" ở UI.) Xem [[cover-theme-color-and-wave]].

### ⭐ LỚP BIÊN TẬP GỐC (chapter + trích dẫn có nguồn)
Tiêu đề chương + thẻ trích dẫn "tên nhà tư tưởng — khái niệm" hiện trên video (Meta xếp "chỉ phụ đề" là đóng góp yếu → lớp này là tín hiệu biên tập gốc). [[editorial-overlay-feature]].
**⭐ CLAUDE TỰ VIẾT, KHÔNG gpt-4o (user chốt 2026-10-18):** SAU khi sửa transcript (Bước 7):
```bash
npx tsx podcast/scripts/editorial-manual.ts brief <slug>    # → tmp/<slug>.editorial-brief.txt (luật + "[ms] câu")
# Claude đọc, viết {"chapters":[{atMs,title}],"citations":[{atMs,name,source}]} → tmp/<slug>.editorial.claude.json
npx tsx podcast/scripts/editorial-manual.ts apply <slug>    # snap atMs → tmp/<slug>.editorial.json + editorialLocked=true
```
5–8 chương ≤6 từ (không "Phần 1"), ≤7 trích dẫn đặt ở chỗ được BÀN SÂU. `editorialLocked` → render không gọi gpt-4o ghi đè. (gen-editorial.ts gpt-4o chỉ còn là fallback khi tập chưa khoá.)

### ⭐ CÔNG BỐ AI + GHI CÔNG
Tab **Đăng** tự dựng khối công bố (kịch bản gốc do người biên soạn + lời dẫn AI + ghi công nhạc/footage/nguồn) từ config — nối vào cuối mô tả cả khi Copy caption LẪN khi đăng thẳng qua API (server dựng lại từ config, xem Bước 10). Khi đăng nhớ **bật nhãn AI** (chỉ bật được khi upload tay qua FB Reels Creator — xem cảnh báo Bước 10). [[fb-monetization-originality-project]].

## Bước 9 — Render

### ⭐ RENDER QUA UI API để HIỆN TIẾN TRÌNH (mặc định — user cần nhìn được)
User muốn thấy tiến trình render trên UI → PHẢI render qua **server API**, KHÔNG dùng `npm run make` CLI (CLI không báo lên UI). Cần server chạy (`:3000`):
```bash
curl -s -X POST http://localhost:3000/api/render \
  -H "Content-Type: application/json" \
  -d '{"episodeName":"<slug>","preview":false,"regenTranscribe":false,"regenPlan":true}'
# poll tiến trình:  curl -s http://localhost:3000/api/render/jobs/<job-id>
```
**Bản YouTube 16:9:** thêm `"format":"landscape"` vào body (mặc định `"vertical"`) → `output/<slug>.yt.mp4` + `.yt.thumb.jpg` (mọi file tmp/public cũng tiền tố `<slug>.yt` → không đè bản dọc). CLI: `npm run make -- input/<slug>.m4a --landscape`. Trên UI: tab **Render → YouTube 16:9**.
- **2 khung render SONG SONG được** (mỗi tab có job/tiến trình riêng; server chạy tối đa `STUDIO_RENDER_PARALLEL`=2). Job sau của cùng tập tự CHỜ job trước chuẩn bị xong (khoá theo tập cho audio/transcript/plan/editorial dùng chung) rồi mới render song song. ⚠️ Tập dài 15-20' chạy 2 Chrome Remotion cùng lúc dễ thiếu RAM → nếu crash thì render lần lượt.

Hoặc bảo user bấm nút Render trong tab **Render** của UI. Server (`render-runner.ts`) đã hỗ trợ **footage 2-pass ProRes có báo % theo từng đoạn** lên UI (`setPhase` "footage đoạn i/N"). Sau khi sửa `corrected.json` → `regenPlan=true`, `regenTranscribe=false` ([[render-qua-api-regen-plan]]).

CLI (chỉ khi KHÔNG cần UI progress, hoặc debug) — ghi log ra file để theo dõi, ĐỪNG pipe `| tail`:
```bash
npm run make -- input/<slug>.m4a > /tmp/render.log 2>&1   # rồi tail -f /tmp/render.log
npm run make -- input/<slug>.m4a --preview
```
- **Có footage (`episode.footage` != [])** → CẢ make.ts LẪN render-runner (UI) tự dùng **2-pass ProRes per-chunk** (ffmpeg dựng nền footage + Remotion render đồ hoạ trong suốt ProRes alpha từng đoạn 1500 frame + ghép + xoá ProRes ngay). ~30', ổn định. KHÔNG render footage 1 lượt (crash browser Remotion). Chi tiết [[footage-full-render-not-viable]].
- **Đĩa:** cần THOÁNG (>10Gi lý tưởng). Đĩa <9Gi → macOS thrash (StorageManagement/CacheDelete) làm render chậm/erratic/ENOSPC — KHÔNG phải lỗi code; dọn đĩa hoặc đợi OS purge rồi chạy lại; đặt `RENDER_TIMEOUT_MS=600000` cho chắc.
- **Bẫy theo dõi:** đừng `npm run make ... | tail -N` (buffer hết output tới khi xong) — ghi log ra file rồi `tail -f`.
- **⚠️ KHÔNG `git checkout`/đổi branch/merge khi đang render qua UI:** server chạy `tsx watch` → file đổi (dù tích tắc) là restart → mất job ("Server lost track of this job") + Chrome Remotion mồ côi. Đợi render xong; lỡ rồi thì kill `chrome-headless-shell` PPID 1, xoá `tmp/<slug>[.yt].fchunks` + `footagebg.mp4` + `public/<slug>[.yt].*`, render lại. [[git-checkout-kills-render]]
Yêu cầu: ffmpeg, whisper `whisper.cpp/ggml-medium.bin`, `PEXELS_API_KEY` trong `.env` (`OPENAI_API_KEY` chỉ còn cho people-check footage gpt-4o vision + fallback editorial). Render hàng loạt: trang **/plan → "Render N tập sẵn sàng"**; theo dõi ở **/render-queue**. Ổ đầy → **/cleanup** (bundle Remotion, WAV chuẩn hoá… tạo lại được).

## Bước 10 — Đăng lên Facebook Reel (tab Đăng → Facebook 9:16)

Video render (9:16) đăng THẲNG lên Trang FB ngay trong app. **Tập >90s (mọi tập ByteCast) đi `/{page}/videos` kèm tiêu đề + cover**, ≤90s mới dùng Reels API. Trang theo series (`FB_PAGE_ID`). **Hẹn giờ hàng loạt:** trang **/plan → "Hẹn giờ N tập đã render"** (giờ mặc định 19:00). [[fb-reel-publish-feature]].

**Chuẩn bị token (1 lần):** Settings (`/settings`) → **Facebook (Page Access Token)** → dán **Page Access Token DÀI HẠN** (cần quyền `pages_manage_posts` + `pages_read_engagement`). Token lưu DB (hoặc `.env` `FACEBOOK_PAGE_ACCESS_TOKEN`). Token gắn với 1 TRANG; nếu là user-token quản nhiều trang thì đặt thêm `FB_PAGE_ID` trong `.env`.

**Đăng:** tab **Đăng** của tập → card **"Đăng thẳng lên Facebook Reel"**:
- Soạn / AI-gen caption + hashtag ở card **"Caption & Hashtags"** (app tự lưu vào config). Mô tả đăng = caption + hashtag + **khối công bố AI** do server tự dựng lại từ config → không cần truyền tay.
- **Playlist (tuỳ chọn):** danh sách lấy từ file chuẩn `input/_fb-playlists.json` (nguồn của kênh, có `title` + `desc` mỗi playlist; sửa file này khi thêm/đổi playlist). Route ưu tiên file, fallback Graph API (`video_lists`).
  - **Chạy qua skill → Claude đã tự chọn ở Bước 8 (miễn phí)**, `fbPlaylistId`/`fbPlaylistName` điền sẵn trong config → dropdown tự chọn đúng, khỏi bấm gì.
  - Nút **"Gợi ý AI"** cạnh dropdown chỉ dành cho thao tác TAY trên UI — nút này **gọi OpenAI (tốn phí)**; khi đã dùng skill thì KHÔNG cần bấm.
  - ⚠️ **Graph API KHÔNG cho tự thêm Reel vào playlist** → app chỉ **nhắc thêm tay** sau khi đăng (mở Reel → ⋯ → Thêm vào playlist); playlist mới phải tự tạo trên FB + thêm vào `input/_fb-playlists.json`.
- **Lên lịch (scheduler FB):** bật toggle **"Lịch đăng"** + chọn thời điểm (**10 phút – 75 ngày** kể từ hiện tại) → đăng dạng `SCHEDULED`, FB tự đăng đúng giờ. Trạng thái tập thành **"Đã lên lịch"** (`publishStatus=scheduled`, lưu `scheduledPublishTime`). Bỏ trống toggle = đăng ngay.
- Bấm **Đăng lên Facebook Reel** / **Lên lịch đăng** → stream tiến trình (xác định Trang → tải video → chốt → xử lý) + **badge trạng thái live** (Đang đăng…/Đã lên lịch/Đã đăng/Lỗi). Xong: hiện link "Xem Reel" + lưu `fbReelId`/`fbPermalink`/`publishStatus` vào config. Trạng thái do luồng đăng TỰ set — không còn nút mark-published thủ công.

**Metadata gửi kèm (đã đối chiếu docs Graph 2026-10-18):** `title`, `description` (caption + hashtag + công bố AI), `thumb` (cover), `content_category` theo series (`series.ts → fbContentCategory`; enum KHÔNG có EDUCATION), `custom_labels` = [series, "studio-api"] (riêng tư — lọc thống kê đo reach). **Không làm được qua API:** thêm video vào playlist (VideoList chỉ đọc) · `tags` chuỗi tự do (chỉ có `content_tags` = ID chủ đề số). **Phụ đề SRT** (`POST /{video}/captions`, `*.vi_VN.srt` ≤200KB) có sẵn nhưng TẮT (`fbUploadSrt`) — video đã có caption in cứng, CC có thể hiện chồng 2 lớp chữ.

**⚠️ Nhãn "AI" của Meta:** đăng qua API **KHÔNG bật được công tắc "AI label"** trong trình đăng FB (không có param). Khối công bố AI vẫn nằm trong mô tả (text). Muốn bật đúng công tắc AI-label của Meta → dùng nút **"Mở FB Reels Creator (thủ công)"** trong card rồi tải video + upload tay.

**Điều kiện:** phải có video render (`output/<slug>.mp4`) — chưa render thì nút bị khoá, sang Bước 9 trước. Backend: `GET /api/episodes/:name/publish` (SSE) + `GET /api/episodes/_/facebook-playlists`; lib `shared/studio-core/facebook.ts` (resumable start → upload → finish, poll ready trừ khi lên lịch).

## Bước 11 — Đăng YouTube (tab Đăng → YouTube 16:9, upload TAY)

Chỉ khi đã render bản 16:9 (`output/<slug>.yt.mp4`). Không có API upload (Google chưa audit project → video API bị khoá private) → **user tự upload trong YouTube Studio**; app soạn sẵn data để copy + lưu kết quả. Data YouTube TÁCH khỏi data FB (caption/hashtag/trạng thái riêng).

**⭐ CLAUDE TỰ SOẠN DATA YOUTUBE — KHÔNG GỌI OPENAI (miễn phí), giống chọn playlist ở Bước 8:** điền thẳng vào `input/<slug>.json`:
- `ytTitle` (≤100 ký tự; để null = dùng `title`; từ khoá chính lên đầu vì YouTube cắt ~60-70 ký tự)
- `ytDescription`: 2-3 câu đầu (hiện trước "Xem thêm") nêu câu hỏi của tập + lý do nên xem; KHÔNG tự viết mục lục/công bố/hashtag (app tự ghép)
- `ytTags`: 10-15 thẻ (≤500 ký tự tổng) — có cả biến thể KHÔNG DẤU của từ khoá chính
- `ytHashtags`: 3-5 cái, 3 cái đầu quan trọng nhất (hiện trên tiêu đề video)

App tự ghép **mô tả đầy đủ** = mô tả + **Mục lục** (chapter tự sinh từ `tmp/<slug>.editorial.json`, đúng mốc chương hiện trên video: 00:00 đầu, ≥10s/chương, cần ≥3 chương) + **khối công bố AI** (dùng `footageCreditLandscape`; người biên soạn/nhạc/nguồn dùng chung với FB) + hashtag. User bấm Copy tiêu đề / mô tả / thẻ, tải video + thumbnail ở card "Asset cần upload".

**Checklist trong Studio** (có sẵn trên UI): không dành cho trẻ em · "Altered/synthetic content" = **Có** (giọng AI) · playlist theo series · end screen · ngôn ngữ Tiếng Việt · công khai/lên lịch. Upload xong → dán link vào ô cuối → **"Đánh dấu đã đăng"** (`ytPublishStatus=published`, `ytUrl`, `ytPublishedAt` — không đụng `publishStatus` của FB).

## Tóm tắt 1 dòng mỗi bước
research → viết/mở rộng essay → **review essay (bỏ tiêu đề cứng + giảm mật độ triết gia ≤6 tên + câu đệm)** → `nlm source add` (essay + 10 URL) → `nlm audio create --language vi --length default --focus "<giọng Bắc + khung>"` → poll + `nlm download audio` vào `input/` → QC (thời lượng + `--plan-only` + **Claude sửa chính tả bằng spell-fix-manual dump/apply — KHÔNG OpenAI** + user nghe) → viết `input/<slug>.json` → **Claude tự viết prompt cover (cover-prompt.ts brief/apply — KHÔNG OpenAI)** → **footage-plan --brief → Claude viết shot-list bám ý từng đoạn → --shotlist --apply (KHÔNG người, không lặp) + derive-accent + (editorial tự chạy)** → **render qua UI API** `POST /api/render` (hiện tiến trình trên UI; footage → 2-pass ProRes tự động) → **đăng FB Reel** ở tab Đăng (token ở Settings; caption+công bố tự dựng; **Claude tự chọn playlist** từ `_fb-playlists.json` điền sẵn config — KHÔNG gọi OpenAI; đăng ngay hoặc **lên lịch**). **Bản YouTube (tuỳ chọn):** cover 16:9 + `footage-plan --landscape --apply` → render `format:"landscape"` (song song được, ĐỪNG git checkout lúc render) → Claude điền `ytTitle/ytDescription/ytTags/ytHashtags` → user upload tay theo tab Đăng → YouTube 16:9 rồi đánh dấu đã đăng.
