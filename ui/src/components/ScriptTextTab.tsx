import { useQuery } from "@tanstack/react-query";
import { BookOpen, FileText } from "lucide-react";
import { api, type EpisodeSummary } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

const wordCount = (s: string) => s.split(/\s+/).filter(Boolean).length;

/**
 * Tab "Kịch bản": nội dung bài đọc của tập — kịch bản kể chuyện (story.json, từng
 * phần + chương) hoặc bài luận gốc (essay.txt) của tập podcast. Chỉ xem.
 */
export function ScriptTextTab({ ep }: { ep: EpisodeSummary }) {
  const q = useQuery({
    queryKey: ["script-text", ep.name],
    queryFn: () => api.getScriptText(ep.name),
  });

  if (q.isLoading) return <Card className="h-64 animate-pulse bg-muted/30" />;
  if (q.error) {
    return (
      <Card className="border-destructive/40 bg-destructive/5 p-4 md:p-6 text-sm text-destructive">
        {String(q.error)}
      </Card>
    );
  }
  const data = q.data;

  if (!data || data.kind === "none") {
    return (
      <Card className="p-4 md:p-6 text-sm text-muted-foreground">
        Tập này chưa có kịch bản (<code className="font-mono">input/{ep.name}.story.json</code>) hay bài
        luận gốc (<code className="font-mono">input/{ep.name}.essay.txt</code>).
      </Card>
    );
  }

  if (data.kind === "essay") {
    return (
      <Card className="p-4 md:p-6">
        <div className="mb-4 flex items-center gap-2">
          <FileText className="size-4 text-accent" />
          <h3 className="font-medium">Bài luận gốc</h3>
          <Badge variant="outline" className="ml-auto text-[10px]">
            {wordCount(data.text).toLocaleString("vi-VN")} chữ
          </Badge>
        </div>
        <div className="whitespace-pre-wrap font-serif text-[15px] leading-relaxed">{data.text}</div>
      </Card>
    );
  }

  const { story } = data;
  const total = story.sections.reduce((n, s) => n + wordCount(s.text), 0);
  return (
    <Card className="p-4 md:p-6">
      <div className="mb-1 flex items-center gap-2">
        <BookOpen className="size-4 text-accent" />
        <h3 className="font-serif text-xl">{story.title}</h3>
        <Badge variant="outline" className="ml-auto text-[10px]">
          {story.sections.length} phần · {total.toLocaleString("vi-VN")} chữ
        </Badge>
      </div>
      <p className="mb-6 text-xs text-muted-foreground">
        {story.source ? `Nguồn: ${story.source.name} — ${story.source.title}` : null}
        {story.geminiVoice ? ` · Giọng Gemini: ${story.geminiVoice}` : null}
        {" · "}
        <code className="font-mono">input/{ep.name}.story.json</code>
      </p>
      <div className="space-y-6">
        {story.sections.map((sec, i) => (
          <section key={sec.id}>
            <div className="mb-1.5 flex items-baseline gap-2">
              <span className="font-mono text-xs text-muted-foreground">{String(i + 1).padStart(2, "0")}</span>
              {sec.chapter ? (
                <h4 className="font-medium">{sec.chapter}</h4>
              ) : (
                <h4 className="text-sm italic text-muted-foreground">không hiện tiêu đề chương</h4>
              )}
              {sec.cite && (
                <Badge variant="outline" className="text-[10px]">
                  trích nguồn
                </Badge>
              )}
              <span className="ml-auto text-xs text-muted-foreground tabular-nums">
                {wordCount(sec.text)} chữ
              </span>
            </div>
            <p className="font-serif text-[15px] leading-relaxed">{sec.text}</p>
          </section>
        ))}
      </div>
    </Card>
  );
}
