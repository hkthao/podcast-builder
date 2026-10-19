/**
 * Cảnh phân tích vẽ tay (series Tiền & Tâm Lý). Claude ghi trong story.json:
 * mỗi section có `viz: VizBeatInput[]`, mỗi cảnh neo vào câu thứ `at` (0-based) của section.
 * story-align quy ra mốc ms → tmp/<slug>.viz.json (VizFile) → VizLayer vẽ theo giọng đọc.
 * Một cảnh kéo dài tới khi cảnh kế tiếp bắt đầu (cảnh cuối: tới hết giọng).
 *
 * File này KHÔNG import remotion → dùng được ở script node.
 */
export type VizColor = "green" | "red" | "blue" | "ink";

export type VizScene =
  /** Chuỗi bước nối mũi tên (vd nạp 27tr → rút 33tr → nạp 400tr → khoá). */
  | {
      type: "steps";
      title?: string;
      steps: Array<{ label: string; value?: string; mark?: "ok" | "bad" }>;
    }
  /** Biểu đồ đường vẽ dần, từng đường nối tiếp nhau. Điểm cách đều trên trục x. */
  | {
      type: "lineChart";
      title?: string;
      /** Nhãn mốc trục x, rải đều từ đầu tới cuối trục (vd ["0","6","12 tháng"]). */
      xTicks: string[];
      yMax: number;
      series: Array<{
        points: number[];
        color: VizColor;
        label?: string;
        smooth?: boolean;
        /** Mờ đi khi đường kế tiếp bắt đầu vẽ ("trên giấy" vs thực tế). */
        fadeLater?: boolean;
        /** Số chạy ở đầu bút: "trieu" = định dạng triệu/tỷ (giá trị tính bằng triệu). */
        tip?: "trieu" | "percent";
      }>;
      /** Con dấu đỏ đóng cuối cảnh (vd "−100%"). */
      stamp?: string;
    }
  /** Cột so sánh; cột vượt yMax bị "gãy" vượt khung kèm mũi tên. */
  | {
      type: "bars";
      title?: string;
      yMax: number;
      bars: Array<{ label: string; value: number; display: string; color: VizColor }>;
      note?: string;
    }
  /** Sơ đồ khối + mũi tên. x, y là tỉ lệ 0..1 trong vùng vẽ. */
  | {
      type: "flow";
      title?: string;
      nodes: Array<{ id: string; label: string; x: number; y: number; color?: VizColor }>;
      edges: Array<{ from: string; to: string; label?: string; color?: VizColor }>;
    }
  /** 1–2 con số lớn đếm chạy + chú thích. */
  | {
      type: "bigNumber";
      items: Array<{
        value: number;
        decimals?: number;
        prefix?: string;
        suffix?: string;
        label: string;
        color?: VizColor;
      }>;
      sub?: string;
      circle?: boolean;
    }
  /** Câu đúc kết / khái niệm viết tay trong khung. */
  | { type: "rule"; title?: string; text: string; sub?: string; color?: VizColor }
  /** Danh sách đánh dấu lần lượt. */
  | { type: "checklist"; title: string; items: string[]; mark: "check" | "flag" };

/** `at`: số thứ tự câu (0-based) trong section, HOẶC 1 đoạn chữ nằm trong câu cần neo. */
export type VizBeatInput = VizScene & { at?: number | string };

export type VizBeat = { startMs: number; endMs: number; scene: VizScene };

export type VizFile = { version: 1; beats: VizBeat[] };
