import crypto from "node:crypto";
import { getDb } from "./db";

export type ReferenceType =
  | "pdf"
  | "article"
  | "video"
  | "book"
  | "podcast"
  | "other";

export type Reference = {
  id: string;
  url: string;
  /** Link PDF direct (tách khỏi url trang). Optional. */
  pdfUrl: string | null;
  title: string;
  author: string | null;
  type: ReferenceType;
  source: string;
  tags: string[];
  notes: string;
  addedAt: string;
  lastAccessedAt: string | null;
  usedInEpisodes: string[];
};

type DbRow = {
  id: string;
  url: string;
  pdf_url: string | null;
  title: string;
  author: string | null;
  type: string;
  source: string;
  tags_json: string;
  notes: string;
  added_at: string;
  last_accessed_at: string | null;
  used_in_episodes_json: string;
};

const rowToRef = (r: DbRow): Reference => ({
  id: r.id,
  url: r.url,
  pdfUrl: r.pdf_url,
  title: r.title,
  author: r.author,
  type: r.type as ReferenceType,
  source: r.source,
  tags: JSON.parse(r.tags_json) as string[],
  notes: r.notes,
  addedAt: r.added_at,
  lastAccessedAt: r.last_accessed_at,
  usedInEpisodes: JSON.parse(r.used_in_episodes_json) as string[],
});

export type SuggestedRef = {
  title: string;
  author: string | null;
  type: ReferenceType;
  /** Lý do tại sao essay này nên đọc reference đó */
  reason: string;
  /** Cụm từ user paste vào Google để tìm URL thật (LLM hay bịa URL nên không trả). */
  searchHint: string;
  /**
   * Research Priority Tier (Step K v2):
   *   1 = Meta-analysis (tổng hợp 100+ nghiên cứu)
   *   2 = Review paper / Systematic review (20-50 nghiên cứu)
   *   3 = Classic book (Being and Time, Meditations…)
   *   4 = Single research paper / academic
   *   5 = Blog / Youtube / popular media (bổ sung)
   */
  tier: 1 | 2 | 3 | 4 | 5;
  /** Lĩnh vực: Tâm lý học / Triết học / Khoa học thần kinh / Xã hội học / AI… */
  field: string;
};

const VALID_TYPES: ReferenceType[] = [
  "pdf",
  "article",
  "video",
  "book",
  "podcast",
  "other",
];

const newId = (): string =>
  `ref_${crypto.randomBytes(4).toString("hex")}`;

const today = (): string => new Date().toISOString().slice(0, 10);

const validateInput = (
  ref: Partial<Reference>,
  partial = false,
): { ok: true; data: Partial<Reference> } | { ok: false; error: string } => {
  if (!partial) {
    if (typeof ref.url !== "string" || !ref.url.trim()) {
      return { ok: false, error: "url là bắt buộc" };
    }
    try {
      new URL(ref.url);
    } catch {
      return { ok: false, error: `url không hợp lệ: ${ref.url}` };
    }
    if (typeof ref.title !== "string" || !ref.title.trim()) {
      return { ok: false, error: "title là bắt buộc" };
    }
  }
  if (ref.pdfUrl != null && ref.pdfUrl !== "") {
    try {
      new URL(ref.pdfUrl);
    } catch {
      return { ok: false, error: `pdfUrl không hợp lệ: ${ref.pdfUrl}` };
    }
  }
  if (ref.type && !VALID_TYPES.includes(ref.type)) {
    return {
      ok: false,
      error: `type không hợp lệ: ${ref.type}. Hợp lệ: ${VALID_TYPES.join(", ")}`,
    };
  }
  if (ref.tags && !Array.isArray(ref.tags)) {
    return { ok: false, error: "tags phải là array" };
  }
  if (
    ref.usedInEpisodes &&
    !Array.isArray(ref.usedInEpisodes)
  ) {
    return { ok: false, error: "usedInEpisodes phải là array" };
  }
  return { ok: true, data: ref };
};

export async function listReferences(filters: {
  tag?: string;
  episode?: string;
  q?: string;
  type?: string;
}): Promise<Reference[]> {
  const db = getDb();
  const rows = db
    .prepare("SELECT * FROM reference_items ORDER BY added_at DESC")
    .all() as DbRow[];
  let result = rows.map(rowToRef);
  if (filters.tag) {
    result = result.filter((r) => r.tags.includes(filters.tag!));
  }
  if (filters.episode) {
    result = result.filter((r) =>
      r.usedInEpisodes.includes(filters.episode!),
    );
  }
  if (filters.type) {
    result = result.filter((r) => r.type === filters.type);
  }
  if (filters.q) {
    const q = filters.q.toLowerCase();
    result = result.filter(
      (r) =>
        r.title.toLowerCase().includes(q) ||
        (r.author?.toLowerCase().includes(q) ?? false) ||
        r.url.toLowerCase().includes(q) ||
        r.notes.toLowerCase().includes(q),
    );
  }
  return result;
}

export async function getReference(id: string): Promise<Reference | null> {
  const db = getDb();
  const row = db
    .prepare("SELECT * FROM reference_items WHERE id = ?")
    .get(id) as DbRow | undefined;
  return row ? rowToRef(row) : null;
}

export async function addReference(
  input: Omit<
    Reference,
    "id" | "addedAt" | "lastAccessedAt" | "usedInEpisodes"
  > &
    Partial<Pick<Reference, "usedInEpisodes">>,
): Promise<Reference> {
  const v = validateInput(input);
  if (!v.ok) {
    const err = new Error(v.error);
    (err as Error & { code: string }).code = "VALIDATION";
    throw err;
  }
  const db = getDb();
  const existingRow = db
    .prepare("SELECT id FROM reference_items WHERE url = ?")
    .get(input.url) as { id: string } | undefined;
  if (existingRow) {
    const err = new Error(`URL đã có trong library: ${existingRow.id}`);
    (err as Error & { code: string; refId: string }).code = "DUPLICATE";
    (err as Error & { code: string; refId: string }).refId = existingRow.id;
    throw err;
  }
  const ref: Reference = {
    id: newId(),
    url: input.url,
    pdfUrl: input.pdfUrl ? String(input.pdfUrl).trim() || null : null,
    title: input.title,
    author: input.author ?? null,
    type: input.type ?? "other",
    source: input.source ?? guessSource(input.url),
    tags: input.tags ?? [],
    notes: input.notes ?? "",
    addedAt: today(),
    lastAccessedAt: null,
    usedInEpisodes: input.usedInEpisodes ?? [],
  };
  db.prepare(
    `INSERT INTO reference_items
       (id, url, pdf_url, title, author, type, source, tags_json, notes, added_at, last_accessed_at, used_in_episodes_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    ref.id,
    ref.url,
    ref.pdfUrl,
    ref.title,
    ref.author,
    ref.type,
    ref.source,
    JSON.stringify(ref.tags),
    ref.notes,
    ref.addedAt,
    ref.lastAccessedAt,
    JSON.stringify(ref.usedInEpisodes),
  );
  return ref;
}

export async function updateReference(
  id: string,
  patch: Partial<Reference>,
): Promise<Reference> {
  const v = validateInput(patch, true);
  if (!v.ok) {
    const err = new Error(v.error);
    (err as Error & { code: string }).code = "VALIDATION";
    throw err;
  }
  const existing = await getReference(id);
  if (!existing) {
    const err = new Error(`Reference không tồn tại: ${id}`);
    (err as Error & { code: string }).code = "NOT_FOUND";
    throw err;
  }
  const allowed: (keyof Reference)[] = [
    "url",
    "pdfUrl",
    "title",
    "author",
    "type",
    "source",
    "tags",
    "notes",
    "lastAccessedAt",
  ];
  const next: Reference = { ...existing };
  for (const k of allowed) {
    if (k in patch) (next[k] as unknown) = patch[k];
  }
  getDb()
    .prepare(
      `UPDATE reference_items SET
         url = ?, pdf_url = ?, title = ?, author = ?, type = ?, source = ?,
         tags_json = ?, notes = ?, last_accessed_at = ?
       WHERE id = ?`,
    )
    .run(
      next.url,
      next.pdfUrl,
      next.title,
      next.author,
      next.type,
      next.source,
      JSON.stringify(next.tags),
      next.notes,
      next.lastAccessedAt,
      id,
    );
  return next;
}

export async function deleteReference(id: string): Promise<boolean> {
  const result = getDb()
    .prepare("DELETE FROM reference_items WHERE id = ?")
    .run(id);
  return result.changes > 0;
}

export async function linkReference(
  id: string,
  episodeName: string,
): Promise<Reference> {
  const ref = await getReference(id);
  if (!ref) {
    const err = new Error(`Reference không tồn tại: ${id}`);
    (err as Error & { code: string }).code = "NOT_FOUND";
    throw err;
  }
  if (!ref.usedInEpisodes.includes(episodeName)) {
    ref.usedInEpisodes.push(episodeName);
    getDb()
      .prepare(
        "UPDATE reference_items SET used_in_episodes_json = ? WHERE id = ?",
      )
      .run(JSON.stringify(ref.usedInEpisodes), id);
  }
  return ref;
}

export async function unlinkReference(
  id: string,
  episodeName: string,
): Promise<Reference> {
  const ref = await getReference(id);
  if (!ref) {
    const err = new Error(`Reference không tồn tại: ${id}`);
    (err as Error & { code: string }).code = "NOT_FOUND";
    throw err;
  }
  ref.usedInEpisodes = ref.usedInEpisodes.filter((n) => n !== episodeName);
  getDb()
    .prepare(
      "UPDATE reference_items SET used_in_episodes_json = ? WHERE id = ?",
    )
    .run(JSON.stringify(ref.usedInEpisodes), id);
  return ref;
}

export async function listAllTags(): Promise<Array<{ tag: string; count: number }>> {
  const items = await listReferences({});
  const counts = new Map<string, number>();
  for (const r of items) {
    for (const t of r.tags) {
      counts.set(t, (counts.get(t) ?? 0) + 1);
    }
  }
  return Array.from(counts.entries())
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

const guessSource = (url: string): string => {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    if (host.includes("arxiv.org")) return "arxiv";
    if (host.includes("scholar.google")) return "scholar";
    if (host.includes("youtube.com") || host.includes("youtu.be")) return "youtube";
    if (host.includes("medium.com")) return "medium";
    if (host.includes("substack.com")) return "substack";
    if (host.includes("nytimes.com")) return "nytimes";
    if (host.includes("github.com")) return "github";
    return host.split(".").slice(-2, -1)[0] ?? "web";
  } catch {
    return "web";
  }
};

/**
 * Scrape URL → fetch HTML → parse <meta property="og:title"> hoặc <title>.
 * arxiv.org/abs/XXXX → dùng arXiv API trực tiếp (chính xác hơn HTML scrape).
 */
export async function scrapeTitle(url: string): Promise<{
  title: string;
  author: string | null;
  source: string;
  pdfUrl: string | null;
}> {
  const u = new URL(url); // validate trước
  const source = guessSource(url);

  // arXiv: auto-derive pdfUrl từ /abs/XXXX → /pdf/XXXX.pdf
  const arxivMatch = u.pathname.match(/\/abs\/([\d.]+)/);
  if (source === "arxiv" && arxivMatch) {
    const id = arxivMatch[1];
    const pdfUrl = `https://arxiv.org/pdf/${id}.pdf`;
    const apiUrl = `http://export.arxiv.org/api/query?id_list=${id}`;
    try {
      const res = await fetch(apiUrl, {
        signal: AbortSignal.timeout(8000),
      });
      const xml = await res.text();
      const title =
        xml.match(/<entry[\s\S]*?<title>([\s\S]+?)<\/title>/)?.[1]?.trim() ??
        null;
      const author =
        xml.match(/<author>\s*<name>([\s\S]+?)<\/name>/)?.[1]?.trim() ?? null;
      if (title) {
        return {
          title: title.replace(/\s+/g, " "),
          author,
          source: "arxiv",
          pdfUrl,
        };
      }
    } catch {
      /* fallback to generic */
    }
  }

  // Nếu URL đã là direct PDF → dùng nó làm pdfUrl luôn
  const isPdfUrl = u.pathname.toLowerCase().endsWith(".pdf");

  // Generic: fetch + parse meta tags
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(8000),
      headers: { "User-Agent": "podcast-builder-studio/0.1" },
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const html = await res.text();
    const ogTitle = html.match(
      /<meta\s+property=["']og:title["']\s+content=["']([^"']+)["']/i,
    )?.[1];
    const title = (
      ogTitle ?? html.match(/<title[^>]*>([\s\S]+?)<\/title>/i)?.[1] ?? ""
    )
      .replace(/\s+/g, " ")
      .trim();
    const ogAuthor =
      html.match(
        /<meta\s+(?:name|property)=["']article:author["']\s+content=["']([^"']+)["']/i,
      )?.[1] ??
      html.match(
        /<meta\s+name=["']author["']\s+content=["']([^"']+)["']/i,
      )?.[1] ??
      null;
    // Tìm link PDF trong meta citation_pdf_url (Google Scholar convention)
    const citationPdf = html.match(
      /<meta\s+name=["']citation_pdf_url["']\s+content=["']([^"']+)["']/i,
    )?.[1];
    return {
      title: title || url,
      author: ogAuthor,
      source,
      pdfUrl: isPdfUrl ? url : (citationPdf ?? null),
    };
  } catch {
    return {
      title: url,
      author: null,
      source,
      pdfUrl: isPdfUrl ? url : null,
    };
  }
}

export const REFS_SUGGEST_SYSTEM = `Bạn là trợ lý nghiên cứu cho kênh podcast tiếng Việt "ByteCast Tech" về triết học/công nghệ/xã hội.

Cho 1 essay (tiêu đề + đoạn nội dung), hãy đề xuất 6-9 reference theo "ByteCast Source Strategy v2".

QUY TRÌNH (thực hiện INTERNAL):

Step I — Knowledge Map: xác định 3-6 LĨNH VỰC chủ đề thuộc về (Tâm lý học / Triết học hiện sinh / Khoa học thần kinh / Xã hội học / Khoa học nhận thức / AI–Học máy / Kinh tế hành vi…).

Step J — Source Categories: với MỖI lĩnh vực, đề xuất theo loại chuẩn:
  - Psychology: Meta Analysis / Systematic Review / Longitudinal Study (Hedonic Adaptation, Loss Aversion, Self Determination Theory…)
  - Neuroscience: Attention / Memory / Reward / Prediction (Dopamine, Default Mode Network, Predictive Brain…)
  - Philosophy: 1-3 triết gia đủ (Heidegger, Nietzsche, Camus, Schopenhauer…)
  - Sociology: KHÔNG bỏ qua — Consumerism, Social Comparison, Attention Economy, Hyperreality…
  - AI: LLM, Recommendation Systems, AI Alignment, Digital Immortality, Predictive AI…

Step K — Research Priority Tier (BẮT BUỘC trong field "tier"):
  1 = Meta-analysis (~100+ nghiên cứu tổng hợp) ← ưu tiên cao nhất
  2 = Review / Systematic Review (~20-50 nghiên cứu)
  3 = Classic book ("Being and Time", "The Myth of Sisyphus", "Meditations", "Alone Together"…)
  4 = Single research paper / academic
  5 = Blog / Youtube / popular media — chỉ bổ sung, KHÔNG quá 1-2 cái

QUY TẮC OUTPUT:
- KHÔNG bịa URL (LLM hay hallucinate URL chết). KHÔNG trả field "url".
- "title" + "author" phải là TÁC PHẨM CÓ THẬT. Nếu không chắc → KHÔNG bịa, bỏ qua.
- "type": "book" | "article" | "video" | "podcast" | "pdf" | "other"
- "reason": 1-2 câu, vì sao essay này nên đọc reference đó (link cụ thể với luận điểm essay).
- "searchHint": cụm Google search ngắn 3-8 chữ. VD: 'burnout society byung-chul han pdf', 'predictive brain karl friston review'.
- "tier": integer 1-5 theo Step K.
- "field": 1 trong các lĩnh vực ở Step I (Psychology / Neuroscience / Philosophy / Sociology / AI…).

Đa dạng nguồn 6-9 suggestion:
- ÍT NHẤT 2 ở Tier 1-2 (meta/review)
- ÍT NHẤT 1 ở Tier 3 (classic book)
- ÍT NHẤT 4/5 lĩnh vực Knowledge Map được cover
- ÍT NHẤT 1 suggestion field "AI" (signature kênh)

Output JSON CHẶT: {"suggestions": [{"title":"...","author":"...","type":"book","reason":"...","searchHint":"...","tier":2,"field":"Psychology"}, ...]}
Không thêm field, không markdown, không lời mở đầu.`;

export function buildRefsSuggestUserContent(
  title: string,
  essayContent: string,
): string {
  const snippet = essayContent.slice(0, 1500);
  return [
    `Tiêu đề essay: ${title}`,
    `\nTrích essay (1500 chars để bắt chủ đề):\n${snippet}`,
    `\nĐề xuất 5-7 reference ngay bây giờ.`,
  ].join("");
}
