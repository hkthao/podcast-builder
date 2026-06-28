/**
 * Brainstorm — podcast workflow đã chuyển hướng sang ChatGPT/Claude web.
 *
 * Trước đây trang này có UI brainstorm tương tác (chỉ dùng cho workspace
 * gallery). Sau khi gỡ gallery, podcast giữ nguyên hành vi cũ: chỉ hiện
 * hướng dẫn — ra ý tưởng bằng ChatGPT web rồi paste vào tab Kịch bản /
 * Bài luận.
 */
import { useNavigate } from "react-router-dom";
import { Lightbulb } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export function Brainstorm() {
  const navigate = useNavigate();
  return (
    <div className="container max-w-2xl py-10">
      <Card className="p-6">
        <div className="flex items-start gap-3">
          <Lightbulb className="size-6 text-accent mt-1 shrink-0" />
          <div className="min-w-0">
            <h1 className="text-xl font-serif">
              Brainstorm cho podcast đã chuyển hướng
            </h1>
            <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
              Phần này đã được gỡ vì ChatGPT web ra ý tưởng tốt hơn. Dùng
              ChatGPT/Claude web để brainstorm idea, sau đó paste vào tab{" "}
              <strong>Kịch bản</strong> trong Episode (ô{" "}
              <em>"Tài liệu bổ sung"</em>) hoặc viết Bài luận trước.
            </p>
            <div className="mt-4 flex gap-2 flex-wrap">
              <Button onClick={() => navigate("/")} size="sm">
                Đi tới danh sách tập
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate("/essay")}
              >
                Đi tới Bài luận
              </Button>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
