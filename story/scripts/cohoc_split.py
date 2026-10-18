"""Tách sách "Cổ học tinh hoa" (PDF) thành từng truyện + mục lục cho series Chuyện Xưa.

Chạy (PyMuPDF trích chữ tiếng Việt sạch; pypdf chèn khoảng trắng giữa âm tiết):
  uv run --no-project --with pymupdf python -I story/scripts/cohoc_split.py \
      references/co-hoc-tinh-hoa/CoHocTinhHoa.pdf references/co-hoc-tinh-hoa

Ra: <out>/CoHocTinhHoa.txt (toàn văn), <out>/truyen/NN-<slug>.txt (mỗi truyện: tiêu đề,
nguyên văn, Lời bàn, giải nghĩa), <out>/index.md (bảng mục lục: số, tên, trang, có lời bàn).
Bản đầy đủ (~250 truyện, thuviensach.vn): "N. TÊN IN HOA" → truyện → (sách nguồn) →
GIẢI NGHĨA → LỜI BÀN. Bản rút gọn 42 trang: tiêu đề (dòng ngắn đứng riêng) → truyện → "Lời bàn:" → giải nghĩa / "-----".
Nửa sau sách: Tiêu đề → câu dẫn → truyện → <tên sách nguồn> → "Lời bàn:".
"""
import re
import sys
import unicodedata
from pathlib import Path

import pymupdf


def slugify(s: str) -> str:
    s = unicodedata.normalize("NFD", s.lower()).replace("đ", "d")
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")[:60]


def is_title(lines: list[str], i: int) -> bool:
    """Dòng ngắn đứng riêng (trước là dòng trống/phân cách, sau là dòng trống), không phải câu."""
    t = lines[i].strip()
    if not t or len(t.split()) > 10 or len(t) > 70:
        return False
    if t.endswith((".", ",", ":", ";", "!", "?", '"', "”")) or t.startswith(("-", '"', "“", "<<")):
        return False
    if ":" in t or t.lower().startswith(("lời bàn", "lời tựa")):
        return False
    if not t[:1].isupper():
        return False
    prev = next((lines[j].strip() for j in range(i - 1, -1, -1) if lines[j].strip()), "")
    nxt = next((lines[j].strip() for j in range(i + 1, len(lines)) if lines[j].strip() and not lines[j].startswith("<<TRANG")), "")
    nxt_blank = i + 1 < len(lines) and not lines[i + 1].strip()
    prev_blank = i > 0 and not lines[i - 1].strip()
    after_sep = prev.startswith("---") or prev.startswith("<<TRANG")
    # Nửa sau sách: "<tên sách nguồn>" đứng riêng ngay trước "Lời bàn:" → KHÔNG phải tiêu đề.
    if nxt.lower().startswith("lời bàn"):
        return False
    return nxt_blank and (prev_blank or after_sep)


HEADER_NOISE = re.compile(r"^https?://\S+$")
NUMBERED = re.compile(r"^(\d{1,3})\.\s*(\S.*)$")


def numbered_stories(lines: list[str], page_of: list[int]):
    """Bản đầy đủ (thuviensach.vn, ~250 truyện): tiêu đề "N. TÊN IN HOA". Mục lục đầu sách
    cũng dạng này → mỗi số lấy lần xuất hiện CUỐI (thân truyện)."""
    heads: dict[int, int] = {}
    for i, ln in enumerate(lines):
        m = NUMBERED.match(ln.strip())
        if m and m.group(2) == m.group(2).upper() and len(m.group(2)) <= 80:
            heads[int(m.group(1))] = i
    order = sorted(heads.items(), key=lambda kv: kv[1])
    out = []
    for k, (num, s) in enumerate(order):
        e = order[k + 1][1] if k + 1 < len(order) else len(lines)
        body = "\n".join(
            l for l in lines[s + 1 : e] if not l.startswith("<<TRANG") and not HEADER_NOISE.match(l.strip())
        ).strip()
        title = NUMBERED.match(lines[s].strip()).group(2).strip()
        out.append((num, title.capitalize(), page_of[s], body))
    return out


def main():
    pdf, out = Path(sys.argv[1]), Path(sys.argv[2])
    doc = pymupdf.open(pdf)
    pages = [p.get_text() for p in doc]
    full = "".join(t + f"\n<<TRANG {i + 1}>>\n" for i, t in enumerate(pages))
    (out / "CoHocTinhHoa.txt").write_text(full)

    lines = full.split("\n")
    page_of, page = [], 1
    for ln in lines:
        m = re.match(r"<<TRANG (\d+)>>", ln)
        if m:
            page = int(m.group(1)) + 1
        page_of.append(page)

    numbered = numbered_stories(lines, page_of)
    if len(numbered) >= 50:
        stories = [(f"{t}", pg, body, num) for num, t, pg, body in numbered]
    else:  # bản rút gọn 42 trang: tiêu đề không đánh số
        starts = [i for i in range(len(lines)) if is_title(lines, i)]
        stories = []
        for k, s in enumerate(starts):
            e = starts[k + 1] if k + 1 < len(starts) else len(lines)
            body = "\n".join(l for l in lines[s + 1 : e] if not l.startswith("<<TRANG")).strip()
            if not re.search(r"Lời bàn\s*:", body, re.I):
                continue  # không phải truyện (lời tựa, mục lục…)
            stories.append((lines[s].strip(), page_of[s], body, len(stories) + 1))

    tdir = out / "truyen"
    tdir.mkdir(exist_ok=True)
    for f in tdir.glob("*.txt"):
        f.unlink()
    rows = [
        f"# Cổ học tinh hoa — mục lục ({len(stories)} truyện)",
        "",
        "Đánh dấu tập đã làm bằng cách thêm cột/ghi chú ở đây hoặc kiểm `input/*.story.json` (source.title).",
        "",
        "| # | Truyện | Trang | Lời bàn | File |",
        "|---|---|---|---|---|",
    ]
    for title, pg, body, n in stories:
        fname = f"{n:03d}-{slugify(title)}.txt"
        (tdir / fname).write_text(f"{title}\n\n{body}\n")
        has_ban = "✓" if re.search(r"lời bàn", body, re.I) else "—"
        rows.append(f"| {n} | {title} | {pg} | {has_ban} | truyen/{fname} |")
    (out / "index.md").write_text("\n".join(rows) + "\n")
    print(f"{len(stories)} truyện → {tdir}")


if __name__ == "__main__":
    main()
