# Podcast Studio — Kế hoạch nâng cấp TÍNH NGUYÊN BẢN (Meta Content Monetization)

> Mục tiêu: đưa video ByteCast vượt yêu cầu "originality" của Meta Content Monetization
> (đợt "Quality Reset" 2026 nhắm thẳng vào video **giọng AI + hình slideshow lặp khuôn**).
> Kênh đã >6k follower, tăng đều → KHÔNG phải vấn đề ngưỡng. Thuần túy là tính nguyên bản.

Trạng thái: DRAFT để duyệt. Chưa code gì. Ngày lập: 2026-09-02.

---

## 0. Nguyên tắc chấm điểm của Meta (bám câu chữ chính sách)

"Nguyên bản" = nội dung **do chính người/Page đăng dựng nên** và thêm được thứ feed chưa có:
**chỉ đạo, biên tập, bình luận, câu chuyện, dẫn chứng, giá trị sản xuất thật.**
Bị coi là KHÔNG nguyên bản: tái chế/ghép nối ít giá trị gia tăng, **text-to-speech đọc trên hình tĩnh/lặp**, catalog lặp khuôn.

→ Hệ quả cho ByteCast: 3 trục phải cải thiện, xếp theo sức nặng:
1. **Lớp người thật / biên tập** (đòn mạnh nhất — Meta thưởng "commentary/direction/editing").
2. **Đa dạng & độc nhất mỗi tập** (phá tín hiệu "một khuôn máy tạo").
3. **Giá trị sản xuất** (audio mix, footage, đồ hoạ động).

**Sự thật thẳng thắn cần ghi nhớ:** nếu lõi vĩnh viễn là "AI đọc bài luận", app có thể nâng ĐÁNG KỂ xác suất qua review nhưng KHÔNG đảm bảo 100%. Đòn quyết định (giọng/bình luận người thật) nằm một phần ở quyết định nội dung, không chỉ ở code. Plan này tối đa hoá phần app lo được và chỉ rõ phần bạn phải làm.

---

## 0b. Đối chiếu CHÍNH SÁCH CHÍNH THỨC (Partner + Content Monetization + AI rules 2026)

Nguồn: Meta Business Help "Partner Monetization Policies" (169845596919485) + "Content Monetization Policies" (1348682518563619) + giải thích quy tắc AI 2026.

| Meta yêu cầu | Trạng thái ByteCast | Việc trong plan |
|---|---|---|
| Hiện diện thật, ≥30 ngày, Page thật | ✅ Có (6k follower đều) | — |
| Không spam/disinfo/**reused content**; phải **nguyên bản HOẶC nâng cấp có ý nghĩa** | ⚠️ Rủi ro chính | Toàn bộ Tier 1/2 |
| ❌ "Đóng góp YẾU": repost, **chỉ thêm phụ đề/viền/logo**, đổi tốc độ, **đăng hàng loạt bản gen gần-giống-nhau** | ⚠️ Ta đang dính "chỉ phụ đề" + "gần giống nhau" | 3.3, 3.4, 4.1 |
| ✅ "Đóng góp MẠNH": kịch bản/ý tưởng gốc, **định hướng sáng tạo có chủ đích**, chọn lọc & biên tập có ý nghĩa, **lời dẫn/trình diễn người thật** | ✅ Essay là bài viết gốc + curate nguồn + QC nặng (nhưng chưa THỂ HIỆN ra) | 3.1, 3.4, §5 (ghi công) |
| AI không bị cấm nhưng cần **công bố (disclosure)** + "ghi lại quyết định khiến tác phẩm là của bạn" | ❌ Chưa có disclosure | §5 mục mới |
| "allowed ≠ recommended ≠ monetizable" | — | Ghi nhớ: app tăng xác suất, không đảm bảo |

**2 hệ quả bắt buộc (điều chỉnh plan):**
- **Phụ đề đọc nguyên văn bị Meta xếp là "đóng góp yếu"** → lớp biên tập gốc (3.4) là BẮT BUỘC, không phải tùy chọn.
- **Phải thêm Công bố AI + ghi công người biên soạn/biên tập** (mới, §5).

---

## 0c. ĐIỀU CHỈNH: kịch bản KHÔNG có giọng thật (chốt 2026-09-02)

Creator xác nhận **không thu được giọng thật**. Mất đòn "original narration/performance" — đòn mạnh nhất. Xác suất qua review THẤP HƠN, nhưng còn đường đi bằng cách dồn sức vào các tín hiệu nguyên bản KHÁC (không cần giọng):

**Trục bù đắp (ưu tiên lại):**
1. **Làm HIỆN RÕ đóng góp người thật đang có** — kịch bản gốc do người viết, curate ~10 nguồn, biên tập/QC. → §5.1 (công bố + ghi công) + 3.4 (biên tập trên màn hình) trở thành **cột sống**, không còn là phụ.
2. **Bình luận/phân tích của người dưới dạng CHỮ** thay cho lời nói: chèn nhận định gốc, câu hỏi phản biện, ghi chú của biên tập viên lên màn hình (3.4 mở rộng).
3. **Footage bạn TỰ QUAY** = tín hiệu "filmed by you" KHÔNG cần giọng → nếu quay được b-roll bằng điện thoại thì đây là đòn thay thế tốt nhất (3.2). *Cần hỏi: có quay được không?*
4. **Mỗi tập trông thật khác nhau** để tránh "đăng hàng loạt bản gần-giống-nhau" (3.3).

**Bỏ khỏi phạm vi:** 3.1 phần lồng giọng người → chỉ còn nhạc nền. Nếu sau này thu được giọng thì bật lại 3.1.

---

## 1. Hiện trạng pipeline (từ audit code)

- Composition: `podcast/src/Video.tsx` → layer: Background (nền vàng caro cố định) + Audio(voice) + [BGM] + SceneLayer (42 template SVG dùng chung) + Visualizer (128 thanh) + Captions (đọc nguyên văn) + Watermark + Intro(cover 3s) + Hook(3.5s) + Outro(4s).
- Toàn bộ 49 tập: `bgm=null`, nền + visualizer + caption + sticker GIỐNG HỆT nhau giữa các tập → chỉ khác chữ. Cover riêng mỗi tập nhưng chỉ hiện ~3s.
- Palette/nền/font hardcode trong `podcast/src/theme.ts` (COLORS, MOOD_BG, MOOD_ACCENTS) → không đổi theo tập.
- Audio 100% giọng AI, không nhạc, không lời người thật.

---

## 2. [P0] BUG NHẠC NỀN "nuốt tiếng nói" — chẩn đoán & sửa

### Nguyên nhân gốc
Hệ ducking (giảm nhạc khi có tiếng) THỰC RA đã tồn tại ở `podcast/src/components/BGMTrack.tsx`
(`DUCK_FACTOR=0.35`, `dbToGain`, dựng `speechRanges` từ transcript, fade outro). Về lý thuyết:
- Voice `<Audio src={audioSrc}>` (Video.tsx:60) = full volume (1.0).
- BGM base mặc định `bgmVolumeDb=-28` → gain ≈ 0.04; khi có tiếng ×0.35 → ≈ 0.014.
→ Với code hiện tại, tiếng nói PHẢI nghe rõ. Vậy trải nghiệm hỏng của bạn đến từ 1 trong các lỗ hổng sau (đều sửa được):

1. **Ducking bị TẮT ngầm khi thiếu transcript.** Nếu `transcriptSrc=null` hoặc fetch transcript lỗi → `speechRanges=[]` → nhạc phát ở base volume KHÔNG ducking suốt cả video. Nếu khi đó ai đó đặt `bgmVolumeDb` cao → nhạc đè tiếng. Đây là kịch bản "gắn vào là mất tiếng" khả dĩ nhất (render lúc chưa có corrected transcript, hoặc bản cũ chưa có ducking).
2. **`bgmVolumeDb` không được kẹp trần.** Người dùng chỉnh -6 hoặc 0 dB (tưởng "cho nhạc to lên") → gain 0.5–1.0, ducking ×0.35 vẫn ≈ 0.35, cạnh tranh tiếng nói.
3. **Lệch mốc thời gian** nếu sau này thêm `from=` cho voice Audio mà quên sửa `speechOffsetMs` (hiện `=0`, đúng vì voice bắt đầu ở frame 0 — nhưng dễ vỡ).

### Cách sửa (an toàn, có kiểm chứng)
File: `podcast/src/components/BGMTrack.tsx`, `podcast/src/Video.tsx`, `podcast/src/episode.ts`, `podcast/scripts/make.ts`.

- **Fallback không transcript = im nhạc, không nuốt tiếng:** nếu `speechRanges` rỗng → coi như "toàn bộ là speech" (áp dụng DUCK_FACTOR liên tục) thay vì gain=1. Một dòng đổi ở nhánh `speechRanges.length===0`.
- **Kẹp trần âm lượng:** clamp `bgmVolumeDb` ≤ -20 dB trong schema (`episode.ts`) + cảnh báo ở make.ts nếu vượt.
- **Duck sâu hơn + mượt hơn:** `DUCK_FACTOR` 0.35 → 0.22 (nhạc lùi hẳn khi có tiếng); giữ ramp 150ms.
- **Chặn render nếu bật bgm mà thiếu transcript:** make.ts throw lỗi rõ ràng thay vì render câm tiếng.
- **Sidechain thật ở tầng mux (tùy chọn nâng cao):** thay vì chỉ ducking trong Remotion, dùng `ffmpeg sidechaincompress` (voice làm sidechain nén nhạc) ở bước process-audio → ducking "đài phát thanh" chuẩn hơn. Ghi nhận nhưng để Phase sau; Remotion ducking đủ tốt cho v1.
- **Kiểm chứng bắt buộc:** render preview 30s có bgm, đo `ffmpeg volumedetect` trên dải chỉ-nhạc vs dải có-tiếng; xác nhận voice mean cao hơn nhạc ≥ 12 dB. (Trước đây bgm null nên CHƯA BAO GIỜ được test — lần này phải test.)

### Nhạc dùng gì (license an toàn Content ID)
Scott Buckley (CC-BY) — đã có ghi chú trong repo memory. Tránh nhạc dính Content ID (mất doanh thu/khiếu nại). Ghi công tác giả trong mô tả video. Chuẩn bị 3–5 track ambient/piano hợp tông suy ngẫm, để `input/bgm/`.

**Effort:** ~0.5 ngày (sửa + test). **Risk:** thấp. **Ưu tiên: LÀM ĐẦU TIÊN** (mở khoá cả lớp audio gốc).

---

## 3. [P1] TIER 1 — Các đòn nguyên bản mạnh (app lo chính)

### 3.1 ~~Khung intro/outro GIỌNG THẬT~~ → CHỈ nhạc nền (đã bỏ phần giọng thật)
> Creator không thu được giọng thật (chốt 2026-09-02) → phần lồng giọng người bị GỠ. Chỉ giữ nhạc nền (đã gộp vào P0 mục 2). Nếu tương lai thu được giọng, khôi phục thiết kế cũ: config `humanIntroAudio`/`humanOutroAudio` + phát ở Intro/Outro sequence (voice AI tạm nghỉ) — đây là đòn nguyên bản mạnh nhất, để dành.

### 3.2 VIDEO FOOTAGE — (trả lời câu hỏi của bạn)
**Có nên dùng footage?** CÓ — footage là một trong các tín hiệu nguyên bản mạnh, NHƯNG có bẫy:

- ✅ **Tốt nhất:** footage **bạn tự quay** (b-roll đời thường: phố xá, quán cà phê, bàn làm việc, thiên nhiên) → đúng nghĩa "filmed by you". Không cần liên quan sát chủ đề; dùng làm nền khí quyển.
- ⚠️ **Stock footage (Pexels/Pixabay) full-frame, thô:** RỦI RO — nhiều kênh dùng chung đúng các clip đó → Meta có thể coi là **tái sử dụng/không độc nhất**, thậm chí phản tác dụng. Chỉ dùng nếu **composite + biên tập nặng** (overlay đồ hoạ/chữ/màu thương hiệu, cắt ghép, đổi tốc độ) — chính phần biên tập đó mới là "meaningful enhancement".
- ⚠️ **AI-generated video (Sora/Runway…):** rủi ro cao — có thể kích hoạt chính bộ lọc "AI spam". Nếu dùng thì rất tiết chế, làm texture, không làm nội dung chính.
- ✅ **Ken Burns trên ẢNH gốc/mua bản quyền + biên tập** (kiểu gallery cũ đã gỡ ở commit f4916b8): công sức thấp, nguyên bản trung bình nếu ảnh là của bạn hoặc chỉnh sửa rõ.

**Đề xuất kiến trúc (không phá layout hiện tại):** thêm `FootageLayer` như một **lớp nền video tùy chọn** thay cho nền vàng caro ở một số scene (không full-frame che hết — vẫn giữ caption/visualizer/branding overlay để có "editing signal").
- File mới: `podcast/src/components/FootageLayer.tsx` (mount `<OffthreadVideo>` với overlay gradient + grain + màu thương hiệu).
- Config: `episode.ts` thêm `footage: { src, mode: "fullbleed"|"band"|"kenburns", opacity, tint }[]` gắn theo scene/timestamp (giống `sceneOverrides`).
- Public assets: copy footage vào `public/footage/` qua make.ts (như bgm).
- Chọn footage: v1 để creator gán tay trong Studio; v2 auto-gợi ý theo keyword scene.
**Effort:** ~2–3 ngày (component + config + UI + xử lý performance/temp — video nặng, chú ý render dài dễ crash, xem memory render-long-video-crash). **Risk:** trung bình (dung lượng, thời gian render, license).
**Khuyến nghị:** làm **b-roll bạn tự quay + composite** trước; hoãn stock full-frame.

> **CHỐT 2026-09-02:** creator KHÔNG tự quay được (hiện tại) → dùng **stock (Pexels...)** nhưng BẮT BUỘC theo cách an toàn: chỉ làm **lớp nền texture DƯỚI overlay biên tập gốc**, xử lý nặng (grade/tint/grain/blur/crop/speed), đa dạng mỗi tập, tránh clip viral phổ biến. KHÔNG để stock full-frame + chỉ đắp phụ đề. `FootageLayer` thiết kế hỗ trợ CẢ hai nguồn (stock composited giờ + own-footage sau) — giữ mở đường để creator TỰ QUAY trong tương lai. Vì stock không phải "filmed by you", đòn nguyên bản CHÍNH vẫn là §5.1 + 3.4, footage chỉ tăng giá trị sản xuất.

### 3.3 Bản sắc HÌNH riêng mỗi tập (phá "một khuôn")
**Vì sao:** hiện mọi tập cùng nền vàng + cùng visualizer + cùng thẻ caption → duplicate signal.
**Thiết kế:**
- Mở `theme.ts` từ hằng số cứng → **theme phái sinh theo tập**: từ `slug`/chủ đề/mood suy ra 1 trong N bảng màu + kiểu nền + accent + biến thể typography. Deterministic theo slug để mỗi tập ổn định nhưng khác nhau.
- Thêm 3–4 **kiểu nền** khác nhau (không chỉ grid vàng): ví dụ "risograph", "paper-dark", "gradient mesh", "blueprint" — chọn theo tập.
- Visualizer: thêm 2–3 biến thể hình (không chỉ 128 thanh) chọn theo tập.
- Config: `episode.ts` thêm `visualTheme?: string` (override thủ công); mặc định auto theo slug.
**Effort:** ~2 ngày. **Risk:** thấp–trung bình (đảm bảo tương phản/an toàn caption ở mọi theme).

### 3.4 Lớp BIÊN TẬP GỐC trên màn hình (BẮT BUỘC — không chỉ caption đọc nguyên văn)
**Vì sao:** Meta xếp "chỉ thêm phụ đề" vào **đóng góp YẾU**. Caption đọc nguyên văn TTS hiện tại KHÔNG tính là nâng cấp. Lớp biên tập gốc biến TTS thành sản phẩm có "editing/story/analysis" → nâng lên "đóng góp mạnh".
**Thiết kế:**
- **Chapter cards:** tiêu đề chương ngắn xuất hiện ở đầu mỗi Part (lấy từ plan/scenes).
- **Key-takeaway callout:** 1 câu chốt/Part hiện to (khác caption).
- **Trích dẫn có GHI NGUỒN:** khi nhắc Epicurus/Lifton/James… hiện thẻ "— Epicurus" + 1 dòng nguồn → vừa nguyên bản vừa tăng uy tín.
- **Số liệu callout** khi có.
- File: `podcast/src/components/EditorialOverlay.tsx`; dữ liệu từ plan.json (bổ sung field `chapterTitle`, `pullQuote`, `citation` khi gen plan).
**Effort:** ~2 ngày (component + bổ sung khâu gen plan). **Risk:** thấp.

---

## 4. [P2] TIER 2 — Chống trùng & đa dạng catalog

### 4.1 Kiểm tra trùng tập (catalog dedup)
**Vì sao:** Meta phạt catalog lặp; ta vừa gặp ep101 gần trùng tập cũ `dieu-gi-con-lai-sau-khi-qua-doi`.
**Thiết kế:** script/route so khớp tập mới với các tập cũ (embed tiêu đề+essay, cảnh báo nếu tương đồng cao + trùng roster nhà tư tưởng). Chặn/nhắc trước khi render.
**Effort:** ~1 ngày. **Risk:** thấp.

### 4.2 Đa dạng thumbnail/cover
**Vì sao:** cover hiện dùng chung template clay-3D (board+object+notification+mic+cup) → nhận diện tốt nhưng lặp.
**Thiết kế:** 2–3 biến thể bố cục cover trong `cover-prompt-store.ts`; xoay vòng theo tập. (Cân bằng: giữ nhận diện thương hiệu nhưng đừng y hệt.)
**Effort:** ~0.5 ngày. **Risk:** thấp.

### 4.3 Đa dạng caption/hashtag mạng xã hội
Biến thể template ở `shared/studio-core/routes/llm.ts` (hiện "staircase 8-12 dòng" cố định).
**Effort:** ~0.5 ngày.

---

## 5. Ngoài phạm vi app (bạn làm SONG SONG — quyết định thành/bại)
- Thu **giọng thật** cho intro/outro (và cân nhắc vài tập có bình luận người thật xuyên suốt).
- **Chất lượng > số lượng:** Meta nêu đích danh "**đăng hàng loạt bản gen gần-giống-nhau**" là rủi ro → giảm nhịp đăng, mỗi tập đầu tư hơn.
- Đăng vài tập nguyên bản hơn rồi **nộp lại challenge** (có thể re-qualify).
- Tránh đăng lại nội dung gần trùng tập cũ (xem 4.1).

### 5.1 [MỚI — theo chính sách] Công bố AI + ghi công người biên soạn
Meta: AI không bị cấm nhưng phải **công bố** và "**ghi lại những quyết định khiến tác phẩm là của bạn, không chỉ công cụ**". ByteCast THỰC SỰ có đóng góp người thật (viết/ mở rộng essay gốc, curate ~10 nguồn, QC/biên tập nặng) — nhưng chưa thể hiện ra. Cần:
- **Bật nhãn AI của Meta** khi đăng (đừng giấu — giấu bị phạt nặng hơn).
- **Dòng ghi công trong mô tả video** (auto chèn vào `publishCaption`): ví dụ *"Kịch bản gốc do [tên] biên soạn & biên tập từ [N] nguồn học thuật; lời dẫn tổng hợp bằng công cụ AI, định hướng và biên tập bởi ByteCast."* + ghi công nhạc (Scott Buckley, CC-BY).
- **App hoá:** thêm field `aiDisclosure`/`scriptCredit`/`sources[]` trong `episode.ts`; template caption ở `shared/studio-core/routes/llm.ts` tự chèn khối ghi công + ghi công nhạc.
- (Tùy chọn mạnh) hiện 1 thẻ nguồn cuối video: "Nguồn tham khảo: …" — vừa minh bạch vừa là tín hiệu biên tập.
**Effort:** ~0.5 ngày. **Risk:** thấp. **Ưu tiên cao** (rẻ, đúng câu chữ chính sách).

---

## 6. Lộ trình đề xuất (thứ tự làm — bản KHÔNG giọng thật)
1. ✅ **P0 — Sửa & kiểm chứng nhạc nền** (XONG) → clamp −18dB + duck 0.22 + fallback; render-verified voice > nhạc (đo mean −18.7 dB kể cả khi vặn bgmVolumeDb=0).
2. ✅ **§5.1 — Công bố AI + ghi công** (XONG) → field config + card PublishTab tự chèn khối công bố vào caption.
3. ✅ **P1.4 — Lớp biên tập gốc trên màn hình** (XONG) → `EditorialOverlay` (chapter title + citation chip có nguồn), sinh bằng LLM `gen-editorial.ts` (mặc định gpt-4o), wired cả make.ts lẫn render-runner; still-verified layout sạch. `tmp/<slug>.editorial.json` sửa tay được. Toggle `showEditorial`. TODO tương lai: pull-quote/takeaway lớn giữa màn hình.
4. ✅ **P1.2 — Video footage layer** (XONG) → `FootageLayer` dùng clip TỰ QUAY (đã prep: bỏ tiếng+chậm 0.7×+1080×1920 ở `input/footage/`) làm NỀN động luân phiên (blur+tối+phủ ink), ẩn sticker, giữ caption/biên tập/visualizer/watermark. Bật bằng `episode.footage: string[]` (tên file trong input/footage/). Wired make.ts+render-runner; still + preview-verified, không crash. TODO: UI chọn clip trong tab Cấu hình; auto-gợi ý clip theo chủ đề.
5. **P1.3 — Bản sắc hình riêng mỗi tập** (2 ngày) → cho tập KHÔNG dùng footage (đổi palette/nền theo slug).
6. **P2 — Dedup + đa dạng cover/caption** (1.5 ngày).
7. *(Để dành)* P1.1 intro/outro giọng thật — khi nào thu được giọng.

> Lưu ý: footage tự quay (kể cả gia đình) = originality mạnh ("filmed by you"). Bài học: ĐỪNG loại footage tự quay vì "lệch tông" — gán clip hợp từng tập. Xem memory footage-pool-and-prep.

Ước tính tổng phần app: ~8.5–10.5 ngày công, làm cuốn chiếu, test từng phần.

## 7. Đo "đã đủ nguyên bản chưa" (định nghĩa Done)
- Nhạc nền: bật được, voice > nhạc ≥ 12 dB, không nuốt tiếng (đo bằng volumedetect).
- Có ≥1 lớp người thật (giọng intro/outro).
- 2 tập bất kỳ đặt cạnh nhau: nền/màu/nhịp/thumbnail KHÁC nhau rõ (không "một khuôn").
- Trên màn hình có yếu tố biên tập ngoài caption (chapter/quote/nguồn).
- Không có tập gần trùng tập cũ (qua dedup check).
- (Ngoài app) có nội dung mang góc nhìn/giọng người thật.
```
```
