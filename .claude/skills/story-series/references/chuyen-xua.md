# Series "Chuyện Xưa - Ngẫm Nay" (`chuyen-xua`)

Truyện trong sách cổ (*Cổ học tinh hoa*…) + lời bàn của sách + bài học cho hôm nay. Trang FB riêng, không liên quan ByteCast. Tập mẫu: `mat-tram-co-thi` ("Không quên được cái cũ").

## Nguồn truyện — sách trong máy
**`references/co-hoc-tinh-hoa/`** (không theo git): bản đầy đủ 243 truyện (`CoHocTinhHoa.pdf`, thuviensach.vn) đã tách bằng `story/scripts/cohoc_split.py` → `index.md` (số · tên · trang · có Lời bàn) + `truyen/NNN-<slug>.txt` (nguyên văn + GIẢI NGHĨA + LỜI BÀN). Đọc file truyện, kể SÁT nguyên văn, dùng đúng Lời bàn của sách. Tách lại (nếu đổi bản PDF):
```bash
uv run --no-project --with pymupdf python -I story/scripts/cohoc_split.py references/co-hoc-tinh-hoa/CoHocTinhHoa.pdf references/co-hoc-tinh-hoa
```
(PyMuPDF trích chữ Việt sạch; pypdf chèn khoảng trắng giữa âm tiết.) Tên trong sách có thể khác tên quen: Tăng Tử giết lợn = #92 "Thành thực", Mạnh mẫu = #93 "Mẹ hiền dạy con", Tái ông mất ngựa = #77 "Họa phúc khôn lường". User dán truyện từ nguồn khác → sửa lỗi OCR và liệt kê chỗ đã sửa.

## Cấu trúc (hook: TỪ TẬP 7 BẬT LẠI — 2026-10-21, xem mục Hook bên dưới)
| section | chapter | Nội dung |
|---|---|---|
| `truyen` (`cite: true`) | tên truyện | Câu đầu = tiêu đề ("Không quên được cái cũ."), rồi truyện SÁT NGUYÊN VĂN (giữ chất cổ: "độ trước", "sở dĩ", "vì cớ gì"); lời thoại giữ nguyên. |
| `giai-nghia` | vd "Cỏ thi là gì" | Từ phần giải nghĩa của sách: từ khó, xuất xứ (sách gốc, nhân vật). |
| `loi-ban` | "Lời bàn người xưa" | "Sách Cổ học tinh hoa bàn rằng: …" — sát Lời bàn gốc. Câu Hán Việt khó → đọc phần dịch nghĩa. |
| `binh` | "Thứ ta thật sự tiếc"… | Góc nhìn riêng (originality); suy đoán rào "có lẽ". |
| `bai-hoc` | "Bài học hôm nay" | 2–3 tình huống hiện đại cụ thể (công sở, mạng xã hội, cha mẹ già, xa quê). |
| `ket` | — | 1–2 câu hỏi mở cho người xem. |

Độ dài audio ≥5' (NotebookLM tự diễn giải, thường 6–9').

## ⭐ AUDIO = NOTEBOOKLM VIDEO OVERVIEW, 1 NGƯỜI KỂ (user chốt 2026-10-20) — KHÔNG Gemini TTS
User muốn 1 người kể, ≥5', dùng NotebookLM. Audio Overview không làm được (deep_dive luôn 2 host, brief ~1.5').
→ **Video Overview "explainer"** = 1 người thuyết minh, tiếng Việt OK; tải video rồi CHỈ LẤY TIẾNG.
Thử "Tái ông mất ngựa" (2026-10-20): 9.2', giọng Bắc suốt, đúng khung truyện → bối cảnh → lời bàn → ngẫm nay → câu hỏi.
Bảng cấu trúc ở trên giờ là KHUNG NỘI DUNG cho nguồn + focus (không còn là story.json đọc nguyên văn).

1. Tạo tập: `POST /api/episodes {"title","series":"chuyen-xua"}`.
2. Claude viết `input/<slug>.essay.txt` = truyện SÁT NGUYÊN VĂN + giải nghĩa + Lời bàn gốc của sách + góc bình riêng + 2–3 gợi ý bài học hôm nay (văn xuôi, không tiêu đề; ~600–900 chữ),
   `input/<slug>.focus.txt` (**ASCII thuần**) theo mẫu dưới. Không cần sources.txt (nguồn là sách).
3. `npx tsx podcast/scripts/nlm-batch.ts <slug>` — series này tự đi luồng VIDEO (SERIES_GATE: explainer, style heritage, 1 bản, cổng 5–15', ưu tiên ~8'), tách tiếng → `input/<slug>.m4a`.
4. QC: `npx tsx story/scripts/audio-qc.ts <slug>` (giọng Bắc) → `npm run make -- input/<slug>.m4a --plan-only` → spell-fix-manual dump → Claude sửa → apply → `rm tmp/<slug>.plan.json`.
   ⚠️ Whisper hay BỊA câu cuối kiểu "Hãy subscribe/đăng ký kênh …" (Ghiền Mì Gõ, lalaschool…) ở khoảng lặng cuối → để text rỗng khi sửa rồi lọc câu rỗng khỏi corrected.json.
   ⚠️ Nghe/đọc transcript xem người kể có ĐỌC TO nhãn "Phần 1… Phần 5" hay gọi là "bài phân tích tư liệu" không (Mạnh Tử 2026-10-20 bị) → lỗi trong tiếng, phải gen lại (focus mẫu đã cấm).
5. Editorial: Claude viết chương (tên truyện / Lời bàn người xưa / góc bình / Bài học hôm nay) + trích dẫn "Cổ học tinh hoa — <tên truyện>" → `editorial-manual.ts apply`.
6. Footage-shotlist + cover + render + đăng như cũ.

**⭐ HOOK (từ tập 7, user 2026-10-21):** audio NotebookLM mở chậm ("Này, đêm nay…") → mất người xem vài giây đầu.
- `series.ts → chuyen-xua.hookCard: true`. Mỗi tập Claude viết `config.hook` = 1 câu ≤20 chữ nhắm thẳng người xem hôm nay (vd tập 6 dự kiến: "Bạn đang học người khác, hay đang biến mình thành Đông Thi?") — thẻ chữ ~3.5s trên nền nhạc trước lời kể.
- Focus thêm câu mở đầu gây tò mò (xem mẫu) — người kể vào thẳng nghịch lý của truyện, không chào hỏi dài.
- **⭐ CÂU ĐẦU TIÊN PHẢI LÀ CÂU MÓC (user 2026-10-22):** số liệu FB tập Mạnh Tử: xem TB 7s/9.8' — người xem lướt đi ngay khi lời đầu là "Đêm nay tĩnh lặng…", "Chào mọi người…", "Này, đêm nay chúng ta ngồi lại…". Câu đầu tiên người kể nói ra phải là nghịch lý/cú bất ngờ của truyện, đọc lên thấy tò mò ngay (mẫu tốt: Ôm cây đợi thỏ "Người nông dân ấy chẳng mất gì vì rủi ro… anh ta mất trắng chỉ vì một buổi sáng quá may mắn"; Mất búa "Đứa trẻ hàng xóm không hề thay đổi. Thứ duy nhất thay đổi là ánh mắt của người mất búa."). Chào hỏi (nếu có) đặt SAU câu móc, 1 câu ngắn.
  - Bài luận nguồn (`essay.txt`) cũng mở bằng chính câu móc đó (NotebookLM hay bám câu đầu nguồn).
  - Focus: dùng mẫu bên dưới (đã cấm mở bằng "dem nay"/"chao moi nguoi"); viết sẵn câu móc tiếng Việt (ASCII không dấu) trong focus nếu cần.
  - QC sau khi tách tiếng: đọc câu đầu `tmp/<slug>.corrected.json` — mở bằng chào hỏi/"đêm nay"/dựng không khí → gen lại (còn quota) hoặc ghi vào báo cáo.
- Tập 1–6 đã đăng/lên lịch không hook — giữ nguyên, không làm lại.

Mẫu focus (thay tên truyện; giữ ASCII):
```
One single narrator only, no second host, no dialogue. This is storytelling, not a lecture: never announce parts, sections or numbers (do not say part one, part two, phan 1, phan 2), never call it an analysis, a document or source material; move between parts with natural storyteller transitions. The narrator is a warm, wise Vietnamese storyteller with a Northern Vietnamese (Hanoi) accent, speaking slowly like a grandparent telling an old tale at night. The very first sentence must be the hook: one striking, curiosity-provoking line about the paradox or surprising twist of the story. Do NOT open with a greeting or with scene-setting about the night or sitting together (never start with dem nay, chao moi nguoi, hay cung ngoi lai, trong cai tinh lang). Only after the hook, greet in one short sentence at most; no long warm-up. Follow the source exactly and in this order: first tell the old story in full, vivid detail, faithful to the source, with natural pauses; then briefly explain the historical background; then present the commentary of the old scholars (loi ban) as written in the source; then reflect on what the story means for life today with two or three everyday Vietnamese examples; end with one gentle question for the viewer. Do not summarize or rush; take your time on each part. Target length: 6 to 8 minutes. Do not invent new facts.
```

## Hình
- **Footage:** render TỰ áp tông phim xưa (`series.ts → footageLook: "vintage"`: gần đen trắng, sepia nhẹ, tối, viền + hạt phim — user 2026-10-18 muốn "cổ trang trắng đen tối như ngày xưa" khớp cover) → query ưu tiên cảnh/đồ vật CỔ (gỗ, giấy, tre, mái ngói, sương), màu clip không quan trọng. Tránh đồ tôn giáo khác (thánh giá, kinh Ả Rập/Do Thái), đồ Tây (hải đăng, dầu ô liu). Phần truyện → cảnh Á Đông xưa, KHÔNG người (bờ đầm, lau sậy, đèn dầu, mái ngói, sách cổ, ấm trà, sương núi); phần bài học → đồ vật/đô thị hiện đại tạo tương phản.
- **Cover:** tranh thuỷ mặc trên giấy dó (nâu mực, sepia, 1 điểm đỏ son #B03A2E), cảnh chính của truyện; tiêu đề thư pháp đậm rõ + dòng nhỏ "CHUYỆN XƯA - NGẪM NAY" + con dấu son. Mẫu prompt: xem `coverPrompt` trong `input/mat-tram-co-thi.json`.

## Đăng
Caption: kể lại nghịch lý của truyện trong 3–4 dòng ngắn → trích 1 câu thoại đắt → bài học 1–2 câu → câu hỏi mời bình luận. Hashtag: `chuyenxuangamnay`, `cohoctinhhoa`, `truyenxua`, `baihoccuocsong`, `suyngam`. `sources`: "Cổ học tinh hoa — Ôn Như Nguyễn Văn Ngọc & Tử An Trần Lê Nhân, truyện "<tên>" (trích <sách gốc>)". Playlist: `input/_fb-playlists.chuyen-xua.json` (P01 Tình cũ, nghĩa xưa · P02 Hiếu đạo & gia đình · P03 Tu thân, sửa mình · P04 Học và dạy · P05 Đối nhân xử thế · P06 Trí khôn người xưa · P07 Dùng người, trị nước).
