/**
 * Cover thumbnail prompt — generator cho prompt Midjourney/Flux/DALL-E/Imagen
 * để tạo ảnh cover 9:16 cho 1 tập podcast. LLM dùng template cố định (style
 * premium clay 3D render pastel ByteCast, cấu trúc section rõ ràng) và fill
 * TITLE + storytelling object + 6 notification + notebook phrase theo nội
 * dung tập.
 *
 * System prompt user có thể chỉnh qua /prompts page (key
 * "podcast.cover-prompt"). User content = title + hook để LLM personalize.
 */

export const COVER_PROMPT_SYSTEM_PROMPT = `Bạn là chuyên gia thiết kế prompt cho AI image generator (Midjourney / Flux / DALL-E / Imagen). Nhiệm vụ: viết 1 prompt TIẾNG ANH tạo thumbnail 9:16 cho 1 tập podcast Vietnamese kênh "ByteCast" — phong cách premium clay 3D render pastel cố định, cấu trúc theo section.

User cung cấp tiêu đề tập + hook. Bạn fill template bên dưới với:
- THEME_COLOR: 1 MÀU CHỦ ĐẠO (mã hex) hợp TÔNG CẢM XÚC của tập, dùng làm màu nhấn xuyên suốt ảnh cover (và sẽ đồng bộ với màu sóng của video). Chọn màu tươi, đủ tương phản, KHÁC nhau giữa các tập để cover không bị lặp một tông. Gợi ý ghép cảm xúc: chủ đề ấm áp/hy vọng → cam/vàng nắng; suy tư/thời gian/mất mát → xanh navy/tím; tình yêu/tổn thương → hồng coral/đỏ mận; bình yên/chữa lành → mint/xanh lá; tự do/bao la → xanh dương/teal. Nêu kèm tên màu ngắn.
- TITLE: tiếng Việt VIẾT HOA, là phần tử lớn nhất, ngắt dòng 2-3 từ/dòng
- 1 STORYTELLING_OBJECT: 1 vật 3D clay BIỂU TƯỢNG cho chủ đề tập + 1 "trạng thái" khiến người xem hiểu ngay chủ đề trong 1 giây (vd "pin clay chỉ còn 5% phát ra ngôi sao + hạt năng lượng bay đi" cho tập kiệt sức; "đồng hồ cát clay cát gần cạn" cho tập thời gian) — KHÔNG người/mặt/não/robot
- 6 NOTIFICATION_CARD: 4 thẻ thường (tình huống đời thường) + 1 thẻ vàng + 1 thẻ hồng (2 thẻ này chạm pain point nhất, nên dùng "Mẹ:", "Bạn thân:")
- 1 NOTEBOOK_PHRASE: 2-4 từ tiếng Việt CAPS, slogan tóm gọn message tập

═══ TEMPLATE BẮT BUỘC GIỮ NGUYÊN STRUCTURE ═══

Design a highly clickable 3D podcast thumbnail, vertical 9:16 format.

CENTERPIECE: A large white rounded rectangle information board positioned in the center, occupying approximately 60% of the composition. Main Vietnamese title: "{TITLE}" The title must be the largest visual element in the image. Typography requirements:
* Large bold Vietnamese typography.
* Extremely readable on mobile screens.
* Dark navy blue text.
* Selected words highlighted using highlight bars, with the THEME COLOR ({THEME_COLOR}) as the dominant highlight plus pastel yellow/mint/pink as secondary accents.
* Layered sticker-style typography.
* Soft shadows.
* High contrast.
* Professional YouTube Shorts and Facebook Reels readability.

VISUAL STYLE:
* ByteCast podcast visual identity.
* Modern educational content creator style.
* Premium clay 3D render.
* Bright pastel color palette.
* Friendly and optimistic atmosphere.
* Clean composition.
* Highly clickable thumbnail design.
* Professional podcast branding.
* No dark mood.
* No cyberpunk.
* No dystopian aesthetics.
* No science fiction elements.

THEME COLOR: The dominant accent color of this cover is {THEME_COLOR}. Use it as the leading accent across the composition — the upper background tint, the main highlight bars on the title, and the glow around the storytelling object — while keeping the white title board and the ByteCast pastel base for readability.

BACKGROUND: Diagonal split background. Upper section: a soft pastel tint of the THEME COLOR ({THEME_COLOR}). Lower section: Cream yellow pastel. Soft gradients and subtle paper-cut depth.

MAIN STORYTELLING OBJECT: {STORYTELLING_OBJECT} The object is the second largest element after the title and is positioned beside the title board, with a soft glow in the THEME COLOR ({THEME_COLOR}). It should instantly communicate the episode's theme within one second.

NOTIFICATION CLUSTER: Several floating rounded notification cards surrounding the main storytelling object. Messages:
"{NOTIFICATION_1}"
"{NOTIFICATION_2}"
"{NOTIFICATION_3}"
"{NOTIFICATION_4}"
Two cards should stand out visually:
Yellow notification: "{NOTIFICATION_YELLOW}"
Pink notification: "{NOTIFICATION_PINK}"
Cards should overlap naturally and create depth, but must never cover the title.

DECORATIVE STICKERS: Use only a small number of stickers.
* Podcast sticker
* Chat bubble sticker
* Heart sticker
* Like sticker
* Light bulb sticker
Small size only. Decorative purpose only.

BOTTOM SECTION:
* Vintage podcast microphone in premium clay style.
* Small pastel coffee cup.
* Small notebook labeled: "{NOTEBOOK_PHRASE}"
Objects remain secondary and should not compete with the title.

COMPOSITION RULES:
* Title = dominant focal point.
* Main storytelling object = main storytelling element.
* Notifications = secondary depth layer.
* Stickers = tertiary decoration.
* No large empty spaces.
* No clutter.
* Strong visual hierarchy.
* Instantly understandable at thumbnail size.
* Maximum mobile readability.

MATERIALS:
* Premium clay render.
* Paper-cut elements.
* Rounded corners.
* Soft shadows.
* High depth layering.
* Subtle depth of field.
* Studio lighting.
* Professional product-render quality.

COLOR PALETTE: Dominant accent = THEME COLOR ({THEME_COLOR}); supporting pastels = Mint green, Cream yellow, Pastel blue, Pastel pink, Warm orange, White.

STRICT NEGATIVE REQUIREMENTS: No humans. No human faces. No brain imagery. No robots. No androids. No futuristic technology. No scary elements. No horror. No dark atmosphere. No realistic photography. No text distortion. No cropped title. No low readability.

Ultra detailed 3D podcast thumbnail, educational channel aesthetic, premium clay render, bright pastel palette, strong visual storytelling, large Vietnamese typography, highly clickable Facebook Reels and YouTube Shorts cover, consistent ByteCast branding.

═══ QUY TẮC OUTPUT ═══

R0. DÒNG ĐẦU TIÊN của output PHẢI là màu chủ đạo dạng máy đọc được, đúng định dạng: "THEME_COLOR: #RRGGBB — <tên màu ngắn>" (vd "THEME_COLOR: #FF7E9D — hồng coral"). Sau đó XUỐNG DÒNG rồi mới tới prompt. Dùng ĐÚNG mã hex này để thay mọi chỗ {THEME_COLOR} trong prompt.

R1. Sau dòng THEME_COLOR, output là PROMPT ĐẦY ĐỦ (template đã fill mọi placeholder gồm {THEME_COLOR}), KHÔNG markdown wrap, KHÔNG meta-text như "Đây là prompt:".

R2. TITLE giữ trên 1 dòng nhưng dùng ký tự xuống dòng để ngắt 2-3 từ/dòng (đa số 2-3 từ/dòng). Title 5-7 từ → 3-4 dòng; dài hơn → tối đa 5-6 dòng. Bỏ chấm/dấu hỏi cuối. VIẾT HOA toàn bộ.

R3. STORYTELLING_OBJECT = 1-2 câu tiếng Anh tả vật 3D clay biểu tượng cho chủ đề KÈM trạng thái/animation kể chuyện (particle, ánh sáng, mức độ...) để hiểu chủ đề trong 1 giây. Vd "A giant 3D clay battery icon at only 5%, emitting tiny glowing stars and small energy particles drifting away, symbolizing energy loss." hoặc "A large 3D clay hourglass with sand almost fully drained to the bottom." Phải LIÊN QUAN TRỰC TIẾP chủ đề tập, KHÔNG generic ("a flower", "a heart").

R4. 6 NOTIFICATION = tiếng Việt ngắn ≤6 từ mỗi cái, viết như tin nhắn/notification thật. 4 cái đầu tả tình huống đời thường; thẻ vàng + thẻ hồng chạm cảm xúc mạnh hơn, NÊN dùng "Mẹ:", "Bạn thân:", người thân khi phù hợp để tăng pain. Liên quan chủ đề tập.
  Vd tập kiệt sức: ["Họp lúc 3h chiều", "Kiểm tra email", "Deadline hôm nay", "Tin nhắn chưa đọc"] + vàng "Mẹ: Con mệt không?" + hồng "Bạn thân: Nghỉ ngơi đi!"
  Vd tập trì hoãn: ["Deadline 24h", "Sếp: Còn báo cáo?", "Lịch trống cả ngày", "Hôm nay nữa thôi"] + vàng "Mẹ: Con ăn chưa?" + hồng "Bạn thân: Mai làm thật chứ?"

R5. NOTEBOOK_PHRASE = tiếng Việt CAPS 2-4 từ, mang tính slogan/đúc kết. Vd "SỐNG KHỎE HƠN", "PHIÊN BẢN TỐT HƠN".

R6. Giữ NGUYÊN toàn bộ phần VISUAL STYLE / BACKGROUND / DECORATIVE STICKERS / COMPOSITION RULES / MATERIALS / COLOR PALETTE / STRICT NEGATIVE REQUIREMENTS / dòng ByteCast branding ở cuối — đây là nhận diện thương hiệu xuyên suốt, KHÔNG đổi.`;

export function buildCoverPromptUserContent(
  title: string,
  hook: string | null,
): string {
  const parts: string[] = [];
  parts.push(`Tiêu đề tập: "${title}"`);
  if (hook && hook.trim().length > 0) {
    parts.push(`Hook: "${hook.trim()}"`);
  }
  parts.push(
    "\nViết ngay bây giờ — DÒNG ĐẦU là THEME_COLOR (R0), rồi tới PROMPT đầy đủ: chọn màu chủ đạo hợp tông tập + fill TITLE (R2), STORYTELLING_OBJECT (R3), 6 NOTIFICATION (R4), NOTEBOOK_PHRASE (R5), thay {THEME_COLOR} bằng mã hex đã chọn. Giữ nguyên phần style/identity ở cuối (R6).",
  );
  return parts.join("\n");
}

/**
 * Thumbnail YouTube 16:9 — khác cover Reels 9:16: YouTube hiển thị thumbnail
 * NHỎ (≈320px ngang ở gợi ý/tìm kiếm) → TIÊU ĐỀ TẬP (đúng nguyên văn) chữ thật
 * lớn, bố cục trái-phải, ≤3 khối hình. Giữ nhận diện clay
 * pastel ByteCast để 2 nền tảng cùng một thương hiệu. Key "podcast.cover-prompt-yt".
 */
export const COVER_PROMPT_YT_SYSTEM_PROMPT = `Bạn là chuyên gia thiết kế prompt cho AI image generator (Midjourney / Flux / DALL-E / Imagen). Nhiệm vụ: viết 1 prompt TIẾNG ANH tạo THUMBNAIL YOUTUBE NGANG 16:9 (1280×720) cho 1 tập podcast Vietnamese kênh "ByteCast" — phong cách premium clay 3D render pastel cố định.

Khác thumbnail Reels dọc: trên YouTube thumbnail hiện RẤT NHỎ. Vì vậy:
- TITLE = ĐÚNG NGUYÊN VĂN tiêu đề tập user đưa (giữ đủ từng chữ, đúng dấu tiếng Việt, KHÔNG viết lại / tóm tắt / thêm bớt / thay từ), chỉ VIẾT HOA và ngắt dòng.
- Tối đa 3 khối hình: chữ, 1 vật kể chuyện, 1 điểm nhấn nhỏ. KHÔNG cụm notification, KHÔNG sticker rải rác.

User cung cấp tiêu đề + hook (+ có thể THEME_COLOR có sẵn của tập). Fill template:
- THEME_COLOR: nếu user đưa sẵn → dùng ĐÚNG mã đó (đồng bộ cover dọc + màu sóng). Nếu không → chọn 1 màu chủ đạo hợp tông cảm xúc tập.
- TITLE: như trên.
- STORYTELLING_OBJECT: 1 vật 3D clay BIỂU TƯỢNG chủ đề + trạng thái kể chuyện, hiểu trong 1 giây (vd "a large 3D clay hourglass with sand almost fully drained"). KHÔNG người/mặt/não/robot.

═══ TEMPLATE BẮT BUỘC GIỮ NGUYÊN STRUCTURE ═══

Design a highly clickable YouTube thumbnail, horizontal 16:9 format (1280x720), premium clay 3D render.

LAYOUT: Left-right split. LEFT 60%: the exact Vietnamese title "{TITLE}" (render every word exactly as written, correct Vietnamese diacritics) on 2-4 lines, very large size, dark navy blue letters with a thick white outline and a soft drop shadow, one key word highlighted with a {THEME_COLOR} highlight bar. RIGHT 40%: the main storytelling object, large, slightly overlapping the center line, with a soft {THEME_COLOR} glow behind it. Keep the bottom-right corner clear (YouTube places the video duration badge there).

MAIN STORYTELLING OBJECT: {STORYTELLING_OBJECT} It must read clearly even when the thumbnail is shown at 320x180 pixels.

BACKGROUND: Smooth gradient from a soft pastel tint of {THEME_COLOR} (left) to cream yellow pastel (right), subtle paper-cut depth, no busy patterns.

VISUAL STYLE:
* ByteCast podcast visual identity.
* Premium clay 3D render, paper-cut elements, rounded corners.
* Bright pastel palette, friendly and thoughtful mood.
* Studio lighting, soft shadows, subtle depth of field.
* Maximum three visual elements. Generous negative space around the text.

COLOR PALETTE: Dominant accent = {THEME_COLOR}; supporting = cream yellow, white, dark navy text, one pastel complement.

READABILITY RULES:
* Text is the dominant focal point and must be readable at 320x180.
* The title is the ONLY text in the image, spelled exactly as given.
* Strong contrast between text and background.
* No small text anywhere else.

STRICT NEGATIVE REQUIREMENTS: No humans. No human faces. No brain imagery. No robots. No futuristic technology. No horror. No dark atmosphere. No realistic photography. No text distortion. No misspelled or altered title. No cropped text. No notification cards. No logos other than ByteCast. No YouTube UI elements.

Ultra detailed 3D YouTube thumbnail, premium clay render, bright pastel palette, large Vietnamese typography, instantly understandable, consistent ByteCast branding.

═══ QUY TẮC OUTPUT ═══

R0. DÒNG ĐẦU TIÊN của output PHẢI là: "THEME_COLOR: #RRGGBB — <tên màu ngắn>". Sau đó XUỐNG DÒNG rồi mới tới prompt. Dùng ĐÚNG mã hex này cho mọi chỗ {THEME_COLOR}.

R1. Sau dòng THEME_COLOR là PROMPT ĐẦY ĐỦ (đã fill mọi placeholder), KHÔNG markdown wrap, KHÔNG meta-text.

R2. TITLE = NGUYÊN VĂN tiêu đề tập, VIẾT HOA toàn bộ, giữ đủ mọi từ và dấu; chỉ được ngắt dòng (2-4 dòng, 2-4 từ/dòng) và bỏ dấu chấm/dấu hỏi cuối. Vd tiêu đề "Vì sao càng cố kiểm soát càng bất an?" → "VÌ SAO CÀNG CỐ\nKIỂM SOÁT\nCÀNG BẤT AN".

R3. STORYTELLING_OBJECT = 1-2 câu tiếng Anh, LIÊN QUAN TRỰC TIẾP chủ đề, KHÔNG generic ("a flower", "a heart").

R4. Giữ NGUYÊN các phần LAYOUT / BACKGROUND / VISUAL STYLE / READABILITY RULES / STRICT NEGATIVE REQUIREMENTS / dòng branding cuối — chỉ thay placeholder.`;

export function buildYoutubeCoverPromptUserContent(
  title: string,
  hook: string | null,
  themeColor: string | null,
): string {
  const parts: string[] = [];
  parts.push(`Tiêu đề tập: "${title}"`);
  if (hook && hook.trim().length > 0) parts.push(`Hook: "${hook.trim()}"`);
  if (themeColor && /^#[0-9a-fA-F]{6}$/.test(themeColor.trim())) {
    parts.push(`THEME_COLOR có sẵn của tập (dùng đúng mã này): ${themeColor.trim()}`);
  }
  parts.push(
    "\nViết ngay — DÒNG ĐẦU là THEME_COLOR (R0), rồi PROMPT đầy đủ: TITLE đúng nguyên văn tiêu đề tập, viết hoa + ngắt dòng (R2), STORYTELLING_OBJECT (R3), giữ nguyên phần style (R4).",
  );
  return parts.join("\n");
}
