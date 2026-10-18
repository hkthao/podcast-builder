import { useState } from "react";
import { Check, ChevronDown, Copy } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Helper dùng chung cho tab Đăng (Facebook + YouTube): khối công bố AI, card
 * thu gọn được, nút copy.
 */

/**
 * Dựng khối "công bố AI + ghi công" chèn vào cuối phần mô tả khi đăng.
 * Đáp ứng yêu cầu originality (Meta/YouTube): công bố nội dung AI + ghi rõ
 * đóng góp người thật (kịch bản gốc, biên tập, nguồn). Xem
 * docs/originality-upgrade-plan.md §5.1.
 */
export function buildDisclosure(opts: {
  aiAssisted: boolean;
  /** Tên kênh theo series (seriesInfo(ep.config.series).channelName). */
  brandName: string;
  editor: string;
  musicCredit: string;
  footageCredit: string;
  sources: string[];
}): string {
  const lines: string[] = [];
  if (opts.aiAssisted) {
    lines.push(
      `Kịch bản gốc do ${opts.editor} biên soạn và biên tập từ nhiều nguồn tham khảo; phần lời dẫn được tạo bằng công cụ giọng nói AI, do ${opts.brandName} định hướng và biên tập.`,
    );
  } else {
    lines.push(`Kịch bản gốc do ${opts.editor} biên soạn và biên tập.`);
  }
  if (opts.musicCredit) lines.push(`Nhạc nền: ${opts.musicCredit}.`);
  if (opts.footageCredit) lines.push(`${opts.footageCredit}.`);
  if (opts.sources.length) {
    lines.push(`Nguồn tham khảo: ${opts.sources.join("; ")}.`);
  }
  return lines.join("\n");
}

/**
 * Card có nút thu gọn/mở rộng. Header: icon + title + phần phải, bấm header để
 * toggle. Nội dung + footer bọc trong children — ẩn khi thu gọn.
 */
export function CollapsibleCard({
  icon,
  title,
  headerRight,
  defaultOpen = true,
  cardClassName,
  children,
}: {
  icon?: React.ReactNode;
  title: React.ReactNode;
  headerRight?: React.ReactNode;
  defaultOpen?: boolean;
  cardClassName?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Card className={cn("p-0 overflow-hidden", cardClassName)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={cn(
          "w-full px-5 py-3 flex items-center gap-2 bg-secondary/30 text-left transition-colors hover:bg-secondary/50",
          open && "border-b",
        )}
      >
        {icon}
        <span className="font-medium text-sm">{title}</span>
        <span className="ml-auto flex items-center gap-2">
          {headerRight}
          <ChevronDown
            className={cn(
              "size-4 text-muted-foreground transition-transform",
              !open && "-rotate-90",
            )}
          />
        </span>
      </button>
      {open && children}
    </Card>
  );
}

export function CopyButton({
  text,
  label,
  disabled,
}: {
  text: string;
  label: string;
  disabled?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={disabled}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          alert("Clipboard không khả dụng — copy thủ công.");
        }
      }}
    >
      {copied ? (
        <Check className="size-3.5 text-accent" />
      ) : (
        <Copy className="size-3.5" />
      )}
      {copied ? "Đã copy" : label}
    </Button>
  );
}

export function CopyChip({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className={cn(
        "text-[10px] px-2 py-1 rounded border inline-flex items-center gap-1 transition-colors",
        copied
          ? "border-accent bg-accent/20 text-accent"
          : "border-input hover:bg-secondary text-muted-foreground",
      )}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          /* ignore */
        }
      }}
    >
      {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
      {copied ? "Đã copy" : label}
    </button>
  );
}
