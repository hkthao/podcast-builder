# Series "Chuyện Xưa - Ngẫm Nay" (`chuyen-xua`)

Truyện trong sách cổ (*Cổ học tinh hoa*…) + lời bàn của sách + bài học cho hôm nay. Trang FB riêng, không liên quan ByteCast. Tập mẫu: `mat-tram-co-thi` ("Không quên được cái cũ").

## Nguồn truyện — sách trong máy
**`references/co-hoc-tinh-hoa/`** (không theo git): bản đầy đủ 243 truyện (`CoHocTinhHoa.pdf`, thuviensach.vn) đã tách bằng `story/scripts/cohoc_split.py` → `index.md` (số · tên · trang · có Lời bàn) + `truyen/NNN-<slug>.txt` (nguyên văn + GIẢI NGHĨA + LỜI BÀN). Đọc file truyện, kể SÁT nguyên văn, dùng đúng Lời bàn của sách. Tách lại (nếu đổi bản PDF):
```bash
uv run --no-project --with pymupdf python -I story/scripts/cohoc_split.py references/co-hoc-tinh-hoa/CoHocTinhHoa.pdf references/co-hoc-tinh-hoa
```
(PyMuPDF trích chữ Việt sạch; pypdf chèn khoảng trắng giữa âm tiết.) Tên trong sách có thể khác tên quen: Tăng Tử giết lợn = #92 "Thành thực", Mạnh mẫu = #93 "Mẹ hiền dạy con", Tái ông mất ngựa = #77 "Họa phúc khôn lường". User dán truyện từ nguồn khác → sửa lỗi OCR và liệt kê chỗ đã sửa.

## Cấu trúc (user đã chốt: KHÔNG hook mở đầu — đọc tiêu đề rồi vào truyện luôn; config `hook: null`)
| section | chapter | Nội dung |
|---|---|---|
| `truyen` (`cite: true`) | tên truyện | Câu đầu = tiêu đề ("Không quên được cái cũ."), rồi truyện SÁT NGUYÊN VĂN (giữ chất cổ: "độ trước", "sở dĩ", "vì cớ gì"); lời thoại giữ nguyên. |
| `giai-nghia` | vd "Cỏ thi là gì" | Từ phần giải nghĩa của sách: từ khó, xuất xứ (sách gốc, nhân vật). |
| `loi-ban` | "Lời bàn người xưa" | "Sách Cổ học tinh hoa bàn rằng: …" — sát Lời bàn gốc. Câu Hán Việt khó → đọc phần dịch nghĩa. |
| `binh` | "Thứ ta thật sự tiếc"… | Góc nhìn riêng (originality); suy đoán rào "có lẽ". |
| `bai-hoc` | "Bài học hôm nay" | 2–3 tình huống hiện đại cụ thể (công sở, mạng xã hội, cha mẹ già, xa quê). |
| `ket` | — | 1–2 câu hỏi mở cho người xem. |

`source`: `{ "name": "Cổ học tinh hoa", "title": "<tên truyện>" }`. Độ dài ~700 chữ ≈ 4'.

## Hình
- **Footage:** phần truyện → cảnh Á Đông xưa, KHÔNG người (bờ đầm, lau sậy, đèn dầu, mái ngói, sách cổ, ấm trà, sương núi); phần bài học → đồ vật/đô thị hiện đại tạo tương phản.
- **Cover:** tranh thuỷ mặc trên giấy dó (nâu mực, sepia, 1 điểm đỏ son #B03A2E), cảnh chính của truyện; tiêu đề thư pháp đậm rõ + dòng nhỏ "CHUYỆN XƯA - NGẪM NAY" + con dấu son. Mẫu prompt: xem `coverPrompt` trong `input/mat-tram-co-thi.json`.

## Đăng
Caption: kể lại nghịch lý của truyện trong 3–4 dòng ngắn → trích 1 câu thoại đắt → bài học 1–2 câu → câu hỏi mời bình luận. Hashtag: `chuyenxuangamnay`, `cohoctinhhoa`, `truyenxua`, `baihoccuocsong`, `suyngam`. `sources`: "Cổ học tinh hoa — Ôn Như Nguyễn Văn Ngọc & Tử An Trần Lê Nhân, truyện "<tên>" (trích <sách gốc>)". Playlist: `input/_fb-playlists.chuyen-xua.json` (P01 Tình cũ, nghĩa xưa · P02 Hiếu đạo & gia đình · P03 Tu thân, sửa mình · P04 Học và dạy · P05 Đối nhân xử thế · P06 Trí khôn người xưa · P07 Dùng người, trị nước).
