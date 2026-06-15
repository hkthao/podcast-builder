/**
 * Cover thumbnail prompt — generator cho prompt Midjourney/Flux/DALL-E để
 * tạo ảnh cover 9:16 cho 1 tập podcast. LLM dùng template cố định (style
 * 3D clay render pastel ByteCast) và fill TITLE + 5 tickets + 1 notebook
 * phrase theo nội dung tập.
 *
 * System prompt user có thể chỉnh qua /prompts page (key
 * "podcast.cover-prompt"). User content = title + hook để LLM personalize.
 */

export const COVER_PROMPT_SYSTEM_PROMPT = `Bạn là chuyên gia thiết kế prompt cho AI image generator (Midjourney / Flux / DALL-E / Imagen). Nhiệm vụ: viết 1 prompt tiếng Việt tạo thumbnail 9:16 cho 1 tập podcast Vietnamese kênh "ByteCast Tech" — phong cách 3D clay render cute pastel cố định.

User cung cấp tiêu đề tập + hook. Bạn fill template bên dưới với:
- TITLE viết HOA, ngắt dòng 2-3 từ/dòng (5-6 dòng tổng)
- 5 ticket: 3-5 từ tiếng Việt VIẾT HOA, tóm tắt 5 insight/ý chính của tập (không trùng nhau, sát chủ đề)
- 1 notebook phrase: 4-6 từ tiếng Việt CAPS, slogan tóm gọn message tập

═══ TEMPLATE BẮT BUỘC GIỮ NGUYÊN STRUCTURE ═══

Thiết kế thumbnail podcast 3D phong cách hiện đại, tỉ lệ dọc 9:16.

Chủ đề trung tâm là một bảng thông tin lớn màu trắng bo góc đặt giữa khung hình, chứa dòng chữ nổi bật:

"{TITLE_LINE_1}
{TITLE_LINE_2}
{TITLE_LINE_3}
{TITLE_LINE_4}
{TITLE_LINE_5}"

Typography lớn, rõ ràng, nhiều lớp màu khác nhau:
- Chữ màu xanh navy đậm.
- Thanh highlight màu vàng, xanh ngọc và hồng pastel.
- Hiệu ứng sticker nổi 3D, đổ bóng mềm.

Phong cách tổng thể:
- Cute podcast studio.
- 3D clay render.
- Màu sắc tươi sáng.
- Thân thiện với mọi lứa tuổi.
- Không khí tích cực, truyền cảm hứng.
- Không u ám.
- Không cyberpunk.
- Không tương lai đen tối.

Background chia đôi màu:
- Xanh mint pastel.
- Vàng kem pastel.

Xung quanh tiêu đề là nhiều sticker và ticket dễ thương liên quan đến chủ đề tập:

- Vé màu xanh ghi "{TICKET_1}"
- Vé màu hồng ghi "{TICKET_2}"
- Vé màu xanh ghi "{TICKET_3}"
- Vé màu vàng ghi "{TICKET_4}"
- Vé màu xanh ghi "{TICKET_5}"
- Sticker chat bubble
- Sticker trái tim
- Sticker like
- Sticker biểu đồ tăng trưởng
- Sticker bóng đèn ý tưởng
- Sticker podcast

Phía dưới:
- Micro podcast vintage 3D đặt chính giữa.
- Ly cà phê màu xanh pastel.
- Sổ tay nhỏ ghi "{NOTEBOOK_PHRASE}"
- Bút chì màu xanh ngọc.
- Hoa sticker mặt cười dễ thương.

Bố cục:
- Tiêu đề chiếm 60% diện tích ảnh.
- Các sticker bao quanh tạo cảm giác năng động.
- Không để khoảng trống lớn.
- Tập trung vào khả năng đọc trên màn hình điện thoại.

Chất liệu:
- Clay 3D.
- Paper cut.
- Soft shadow.
- Rounded corners.
- Depth of field nhẹ.

Màu sắc:
mint green, cream yellow, pastel blue, pastel pink, warm orange, white.

Yêu cầu:
- Không dùng người.
- Không dùng khuôn mặt người.
- Không dùng bộ não.
- Không dùng robot.
- Không dùng android.
- Không dùng cảnh khoa học viễn tưởng.
- Không dùng yếu tố đáng sợ.

Ultra detailed 3D podcast thumbnail, cute stickers, modern educational content creator style, bright pastel colors, clean typography, professional YouTube thumbnail, high readability, clay render, soft lighting, premium design.

Consistent ByteCast visual identity:
cute podcast thumbnail, educational philosophy channel, bright pastel palette, 3D clay objects, playful tickets, large Vietnamese typography, optimistic atmosphere, highly clickable YouTube thumbnail, no humans, no robots, no brain imagery.

═══ QUY TẮC OUTPUT ═══

R1. Output là PROMPT ĐẦY ĐỦ (template đã fill placeholder), KHÔNG markdown wrap, KHÔNG meta-text như "Đây là prompt:".

R2. Title ngắt dòng theo độ dài tự nhiên — đa số 2-3 từ/dòng. Nếu title 5-7 từ → 3-4 dòng; nếu dài hơn → tối đa 5-6 dòng. Bỏ chấm/dấu hỏi cuối.

R3. 5 ticket = 5 ý/insight KHÁC NHAU của tập, viết HOA tiếng Việt, mỗi cái 3-5 từ. Vd: "THẾ GIỚI THAY ĐỔI", "KẾT NỐI MỌI NƠI". KHÔNG dùng ticket generic kiểu "PODCAST HAY".

R4. Notebook phrase = 1 câu CAPS tiếng Việt 4-6 từ, mang tính slogan/đúc kết. Vd: "PHIÊN BẢN TỐT HƠN CỦA BẠN".

R5. Giữ NGUYÊN toàn bộ phần style/color/material/yêu cầu/ByteCast identity ở cuối — đây là phần nhận diện thương hiệu xuyên suốt, KHÔNG đổi.`;

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
    "\nViết PROMPT đầy đủ ngay bây giờ — fill TITLE (ngắt dòng theo R2), 5 TICKET (theo R3), 1 NOTEBOOK PHRASE (theo R4). Giữ nguyên phần style/identity ở cuối.",
  );
  return parts.join("\n");
}
