---
name: story-cohoc
description: Làm video KỂ CHUYỆN từ một truyện trong sách "Cổ học tinh hoa" (hoặc truyện cổ tương tự) — user dán nguyên văn truyện, Claude viết kịch bản (truyện + lời bình + bài học thời hiện đại) thành input/<slug>.story.json, Gemini TTS (API hoặc dán tay AI Studio, giọng Autonoe) gen audio từng phần → story-align ghép + căn chữ kịch bản vào timing whisper ra input/<slug>.m4a + transcript đúng chữ + chương, rồi dùng lại footage-shotlist + render studio như tập podcast. Dùng khi user đưa một truyện cổ/ngụ ngôn và muốn làm video kể chuyện, hoặc nhắc "Cổ học tinh hoa", "kể chuyện".
---

# Video kể chuyện Cổ học tinh hoa (Gemini TTS)

Luồng: **truyện gốc → story.json (Claude viết) → Gemini TTS từng phần → user nghe QC → story-align → config + cover + footage-shotlist → render API → đăng.**
Transcript = chữ kịch bản căn vào timing whisper + chương từ kịch bản → render BỎ QUA whisper, spell-fix, LLM editorial (không tốn OpenAI).

## Bước 1 — Nhận truyện, sửa lỗi OCR
User dán nguyên văn (thường copy từ ebook, hay lỗi OCR: "Không Tử"→Khổng Tử, "cỏ thị"→cỏ thi, "sở đĩ"→sở dĩ, "nứa"→nữa). Sửa và **liệt kê chỗ đã sửa** cho user. Nếu sách có phần **Lời bàn** gốc mà user chưa dán → hỏi xin (đừng tự bịa lời bàn của soạn giả).

## Bước 2 — Viết `input/<slug>.story.json`
```json
{
  "title": "tiêu đề video",
  "source": { "name": "Cổ học tinh hoa", "title": "tên truyện" },
  "geminiVoice": "Autonoe",      // giọng đã chọn (nữ, sáng + êm)
  // "geminiDirectorNote": "Style: ... Pace: ..."   // tuỳ chọn, mặc định ở story-tts-gemini.ts
  "sections": [
    { "id": "hook", "text": "..." },
    { "id": "truyen", "chapter": "Tên chương ≤6 từ", "cite": true, "text": "..." },
    { "id": "loi-ban", "chapter": "Lời bàn người xưa", "text": "..." },
    { "id": "binh", "chapter": "...", "text": "..." },
    { "id": "bai-hoc", "chapter": "Bài học hôm nay", "text": "..." },
    { "id": "ket", "text": "..." }
  ]
}
```
- `chapter` → tiêu đề chương trên video (EditorialOverlay). `cite: true` → hiện trích dẫn "Cổ học tinh hoa · <tên truyện>" ở đầu phần đó.
- Mỗi phần gen ≤200 chữ (giới hạn ~1'30/lần). Section ≤200 chữ đi trọn 1 phần → viết mỗi section ≤200 chữ để không bị chia giữa chừng.

**Cấu trúc nội dung:**
| Phần | Nội dung |
|---|---|
| hook (~15s) | Tình huống/câu hỏi đời thường HÔM NAY dẫn vào truyện. Không bịa chi tiết truyện gốc không có. |
| truyen | Kể sát nguyên văn (giữ chất cổ: "độ trước", "sở dĩ", "vì cớ gì"), chỉ nối câu cho trôi. Lời thoại giữ nguyên. |
| loi-ban | Tóm Lời bàn gốc của sách (nếu user cung cấp). |
| binh | Góc nhìn riêng — đây là chỗ tạo originality. Có thể phản biện người xưa. Suy đoán phải rào "có lẽ". |
| bai-hoc | 2–3 tình huống cụ thể hiện đại (công sở, mạng xã hội, gia đình, cha mẹ già…). |
| ket | 1–2 câu hỏi mở cho người xem. |

**Văn phong viết để ĐỌC:**
- Câu ngắn–vừa; dấu phẩy = chỗ thở.
- Số viết thành chữ ("hai nghìn năm"), không viết tắt, không ký hiệu, không ngoặc kép/gạch đầu dòng (lời thoại dẫn bằng dấu hai chấm).
- Tên nước ngoài/Hán Việt khó: dùng dạng phổ biến.
- Độ dài: ~650 chữ ≈ 3–4' · 1300–1800 chữ ≈ 8–12'.
- ĐỌC ĐÚNG kịch bản là điều kiện để căn caption: phần nào Gemini đọc thêm/bớt câu → gen lại phần đó.

## Bước 3 — Gen audio Gemini
**Tự động (API — key Gemini lấy từ trang Settings của app, như các provider khác):**
```bash
npx tsx story/scripts/story-tts-gemini.ts <slug>            # gen các phần chưa có
npx tsx story/scripts/story-tts-gemini.ts <slug> --part=3   # gen lại riêng phần 3
```
Mặc định `gemini-2.5-pro-preview-tts`; `--model=gemini-2.5-flash-preview-tts` rẻ/nhanh hơn.

**Tay (AI Studio):** `npx tsx story/scripts/story-tts-brief.ts <slug>` → `input/<slug>.tts.md` (Speaker settings + Scene + Sample Context + từng phần) → user dán, gen, lưu `input/<slug>.parts/audio_01.wav`…

→ **User nghe QC từng phần** (đọc sai/vấp/lệch giọng Nam → gen lại phần đó).

## Bước 3b — Ghép + căn chữ
```bash
npx tsx story/scripts/story-align.ts <slug>
```
Ghép phần → `input/<slug>.m4a`; whisper (`tmp/<slug>.whisper.json`) chỉ để lấy timing; transcript `tmp/<slug>.json` + `.corrected.json` = CHỮ KỊCH BẢN theo câu; `tmp/<slug>.editorial.json`; xoá plan.json cũ.
- Log "neo X/Y từ (Z%)": ≥85% là tốt (test: 90%, lệch câu tb ~0.2s). <70% → audio không khớp story.json (thiếu/thừa phần, Gemini đọc lệch) → kiểm lại.

## Bước 4 — Config `input/<slug>.json`
Series RIÊNG **"Chuyện Xưa - Ngẫm Nay"** (Trang FB riêng, KHÔNG liên quan ByteCast):
- **`"series": "chuyen-xua"`** → watermark/outro/CTA/công bố đăng theo series (`podcast/src/series.ts`, bản sao UI `ui/src/lib/series.ts` — sửa cả hai). Chưa có logo → hiện tên kênh bằng chữ; có logo thì đặt `public/brand/chuyen-xua/…` + điền `logoFile`/`markFile`.
- **`episodeNumber`** đếm riêng series này (tập 1 = mat-tram-co-thi). Tạo tập qua UI/API với `series` → tự đánh số đúng.
- **`"editorialLocked": true`** (render giữ chương từ kịch bản, không gọi LLM tạo lại khi regenPlan).
- Nhạc theo `input/_music-default.json`; `hook` = câu đắt nhất; `accentColor` tông cổ (nâu trầm, đỏ son, xanh ngọc).
- Đăng FB: Trang lấy từ env `FB_PAGE_ID_CHUYEN_XUA` (token ở Settings phải quản Trang này); playlist ở `input/_fb-playlists.chuyen-xua.json`. Trang "comments" của studio vẫn chỉ đọc Trang ByteCast (`FB_PAGE_ID`).

## Bước 5 — Cover + footage + render (dùng lại pipeline podcast)
- Cover: cover-prompt.ts brief/apply như skill notebooklm-podcast (Claude viết prompt, KHÔNG OpenAI).
- Footage: skill **footage-shotlist**. Phần truyện → cảnh Á Đông xưa, KHÔNG người (bờ đầm, cỏ lau, đèn dầu, mái ngói, thư pháp, ấm trà, sương núi); phần bài học → đô thị/đồ vật hiện đại tạo tương phản.
- Render: `POST /api/render` `{"episodeName":"<slug>","preview":false,"regenTranscribe":false,"regenPlan":true}` (KHÔNG regenTranscribe — sẽ ghi đè transcript chuẩn bằng whisper).
- Đăng: tab Đăng như tập podcast; caption ghi nguồn "Cổ học tinh hoa" + công bố giọng AI.

## Bẫy đã gặp
- Thử OmniVoice local (2026-10-18): user chê "không tự nhiên" → bỏ, dùng Gemini.
- Whisper cắt âm tiết thành nhiều token ("gi"+"ữ") → forced-align phải ghép token không có khoảng trắng đầu (shared/lib/forced-align.ts đã làm; thiếu bước này chỉ neo ~54%).
- Mẫu giọng NotebookLM: nhịp podcast quá nhanh, không ngắt hơi — không hợp kể chuyện.
- User muốn tốc độ THƯỜNG, không kể chậm/trầm lắng.
