/**
 * Inline panel cho phép user paste dictionary lỗi chính tả + áp dụng.
 * Persist textarea content qua localStorage theo key user truyền vào.
 *
 * Layout: textarea full-width + hint format + footer 2 nút "Đóng" / "Áp dụng"
 * (căn phải). Report áp dụng (số lỗi + list rule khớp) hiển thị ngay dưới
 * textarea sau khi user click áp dụng.
 */
import { useState } from "react";
import { SpellCheck, X } from "lucide-react";
import { usePersistedState } from "@/lib/persist";
import { cn } from "@/lib/utils";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";
import {
  DEFAULT_SUGGESTED_RULES_TEXT,
  applySpellFix,
  parseRulesText,
  type SpellFixResult,
  type SpellFixRule,
} from "./spell-fix-rules";

export function SpellFixPanel({
  storageKey,
  onApply,
  onClose,
  pending = false,
}: {
  /** Key localStorage để persist textarea content. */
  storageKey: string;
  /**
   * Callback khi user click "Áp dụng" — nhận parsed rules. Caller dùng
   * applySpellFix() bên ngoài để run trên data của mình (transcript /
   * script turns), return report để panel hiển thị.
   */
  onApply: (rules: SpellFixRule[]) => SpellFixResult["applied"];
  onClose: () => void;
  pending?: boolean;
}) {
  const [rulesText, setRulesText] = usePersistedState<string>(
    storageKey,
    DEFAULT_SUGGESTED_RULES_TEXT,
  );
  const [report, setReport] = useState<SpellFixResult["applied"] | null>(null);

  const handleApply = () => {
    const rules = parseRulesText(rulesText);
    if (rules.length === 0) {
      setReport([]);
      return;
    }
    const result = onApply(rules);
    setReport(result);
  };

  const ruleCount = parseRulesText(rulesText).length;

  return (
    <div className="px-6 py-4 border-b bg-secondary/10 space-y-3">
      <div className="flex items-center gap-2">
        <SpellCheck className="size-4 text-accent" />
        <span className="font-medium text-sm">Sửa chính tả</span>
        <span className="text-xs text-muted-foreground">
          · {ruleCount} luật
        </span>
        <button
          type="button"
          onClick={onClose}
          className="ml-auto text-muted-foreground hover:text-foreground p-1"
          title="Đóng"
        >
          <X className="size-4" />
        </button>
      </div>

      <Textarea
        value={rulesText}
        onChange={(e) => setRulesText(e.target.value)}
        rows={10}
        className="font-mono text-xs leading-relaxed"
        placeholder={`Dán danh sách lỗi chính tả — 1 cặp / dòng:\nwrong → right\nchậm dãi → chậm rãi\ndanh giới → ranh giới\n…`}
      />
      <p className="text-[10px] text-muted-foreground leading-relaxed">
        Format: <code className="font-mono">wrong → right</code> hoặc{" "}
        <code className="font-mono">wrong -&gt; right</code> hoặc{" "}
        <code className="font-mono">wrong | right</code>. Comment bắt đầu bằng{" "}
        <code className="font-mono">#</code>. Optional note inline:{" "}
        <code className="font-mono">right // ghi chú</code>. Luật dài match
        trước luật ngắn. Lưu localStorage — paste 1 lần, dùng nhiều lần.
      </p>

      {report !== null && (
        <div
          className={cn(
            "rounded-md border p-3 text-xs",
            report.length > 0
              ? "border-accent/40 bg-accent/5"
              : "border-muted-foreground/30 bg-secondary/30",
          )}
        >
          <p className="font-medium mb-1">
            {report.length > 0
              ? `Đã sửa ${report.reduce((s, r) => s + r.count, 0)} lỗi (${report.length} luật khớp)`
              : "Không tìm thấy lỗi nào — dictionary có thể trống hoặc text đã sạch"}
          </p>
          {report.length > 0 && (
            <ul className="space-y-0.5 mt-2 max-h-40 overflow-y-auto">
              {report.map((r) => (
                <li key={r.wrong} className="flex items-start gap-2 flex-wrap">
                  <span className="font-mono text-muted-foreground shrink-0">
                    ×{r.count}
                  </span>
                  <span className="line-through text-muted-foreground">
                    {r.wrong}
                  </span>
                  <span className="text-muted-foreground">→</span>
                  <span className="text-foreground">{r.right}</span>
                  {r.note && (
                    <span className="text-amber-600 dark:text-amber-400 italic ml-1">
                      ({r.note})
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="flex items-center justify-end gap-2 pt-2 border-t">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setRulesText(DEFAULT_SUGGESTED_RULES_TEXT);
            setReport(null);
          }}
          disabled={pending}
          title="Khôi phục danh sách mặc định"
        >
          Reset default
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={handleApply}
          disabled={pending || ruleCount === 0}
        >
          <SpellCheck className="size-3.5" />
          {pending ? "Đang áp dụng…" : "Áp dụng"}
        </Button>
      </div>
    </div>
  );
}

/** Re-export helpers để caller dùng chung. */
export { applySpellFix, parseRulesText };
