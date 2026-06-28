import { COLORS } from "../../theme";
import { StickerBase, StickerShape, INK, WHITE, type StickerProps } from "./base";

/* ─────────────────────────  PodcastDesk family  ───────────────────────── */

export const Mic: React.FC<StickerProps> = (props) => (
  <StickerBase {...props}>
    <StickerShape rect={{ x: 35, y: 12, width: 30, height: 50, rx: 15 }} fill={props.accent ?? COLORS.accentRed} />
    <StickerShape d="M 22 42 Q 22 70 50 70 Q 78 70 78 42" fill="none" inkWidth={5} />
    <StickerShape line={{ x1: 50, y1: 70, x2: 50, y2: 86 }} />
    <StickerShape line={{ x1: 32, y1: 88, x2: 68, y2: 88 }} />
    <StickerShape circle={{ cx: 50, cy: 27, r: 4 }} fill={WHITE} halo={false} />
    <StickerShape circle={{ cx: 50, cy: 38, r: 4 }} fill={WHITE} halo={false} />
    <StickerShape circle={{ cx: 50, cy: 49, r: 4 }} fill={WHITE} halo={false} />
  </StickerBase>
);

export const Headphones: React.FC<StickerProps> = (props) => (
  <StickerBase {...props}>
    <StickerShape d="M 18 52 Q 18 18 50 18 Q 82 18 82 52" />
    <StickerShape rect={{ x: 10, y: 48, width: 22, height: 36, rx: 11 }} fill={props.accent ?? COLORS.accentBlue} />
    <StickerShape rect={{ x: 68, y: 48, width: 22, height: 36, rx: 11 }} fill={props.accent ?? COLORS.accentBlue} />
  </StickerBase>
);

export const CoffeeMug: React.FC<StickerProps & { face?: boolean }> = ({ face = true, ...props }) => (
  <StickerBase {...props}>
    <StickerShape rect={{ x: 20, y: 36, width: 50, height: 50, rx: 6 }} fill={props.accent ?? COLORS.accentRed} />
    <StickerShape d="M 70 48 Q 86 48 86 60 Q 86 72 70 72" />
    <StickerShape d="M 30 22 Q 35 14 32 6" fill="none" inkWidth={4} />
    <StickerShape d="M 44 24 Q 49 14 46 6" fill="none" inkWidth={4} />
    <StickerShape d="M 58 22 Q 63 14 60 6" fill="none" inkWidth={4} />
    {face ? (
      <>
        <StickerShape circle={{ cx: 34, cy: 56, r: 3 }} fill={INK} halo={false} />
        <StickerShape circle={{ cx: 56, cy: 56, r: 3 }} fill={INK} halo={false} />
        <StickerShape d="M 32 66 Q 45 76 58 66" inkWidth={3} halo={false} />
      </>
    ) : null}
  </StickerBase>
);

/** Mây cười — kiểu sticker scrapbook. */
export const SmileyCloud: React.FC<StickerProps> = (props) => (
  <StickerBase {...props}>
    <StickerShape
      d="M 18 64 Q 4 64 4 50 Q 4 36 20 36 Q 22 22 38 22 Q 50 14 62 24 Q 80 22 84 38 Q 96 40 96 54 Q 96 68 84 68 Z"
      fill={COLORS.white}
    />
    <StickerShape circle={{ cx: 40, cy: 46, r: 3.5 }} fill={INK} halo={false} />
    <StickerShape circle={{ cx: 60, cy: 46, r: 3.5 }} fill={INK} halo={false} />
    <StickerShape d="M 38 54 Q 50 64 62 54" inkWidth={4} halo={false} />
    <StickerShape circle={{ cx: 32, cy: 56, r: 3 }} fill={props.accent ?? COLORS.accentRed} halo={false} />
    <StickerShape circle={{ cx: 68, cy: 56, r: 3 }} fill={props.accent ?? COLORS.accentRed} halo={false} />
  </StickerBase>
);

/** Trang giấy notebook nhỏ — tăng vibe study vlog. */
export const NotebookPaper: React.FC<StickerProps & { lines?: number }> = ({ lines = 4, ...props }) => (
  <StickerBase {...props}>
    <StickerShape
      rect={{ x: 14, y: 10, width: 72, height: 80, rx: 4 }}
      fill={COLORS.white}
    />
    {Array.from({ length: lines }).map((_, i) => (
      <line
        key={i}
        x1={24}
        y1={28 + i * 16}
        x2={76}
        y2={28 + i * 16}
        stroke={COLORS.accentBlue}
        strokeWidth={1.5}
        strokeLinecap="round"
      />
    ))}
    <line x1={32} y1={14} x2={32} y2={90} stroke={COLORS.accentRed} strokeWidth={1.5} />
  </StickerBase>
);

export const Books: React.FC<StickerProps> = (props) => (
  <StickerBase {...props}>
    <StickerShape rect={{ x: 14, y: 60, width: 72, height: 22, rx: 3 }} fill={props.accent ?? COLORS.accentRed} />
    <StickerShape rect={{ x: 22, y: 38, width: 60, height: 22, rx: 3 }} fill={COLORS.accentTeal} />
    <StickerShape rect={{ x: 28, y: 16, width: 50, height: 22, rx: 3 }} fill={COLORS.accentBlue} />
    <StickerShape line={{ x1: 30, y1: 70, x2: 70, y2: 70 }} inkWidth={4} />
    <StickerShape line={{ x1: 36, y1: 48, x2: 68, y2: 48 }} inkWidth={4} />
  </StickerBase>
);

/* ─────────────────────────  Connection family  ───────────────────────── */

export const Phone: React.FC<StickerProps> = (props) => (
  <StickerBase {...props}>
    <StickerShape rect={{ x: 30, y: 10, width: 40, height: 80, rx: 9 }} fill={props.accent ?? COLORS.accentBlue} />
    <StickerShape rect={{ x: 36, y: 22, width: 28, height: 50, rx: 2 }} fill={WHITE} halo={false} />
    <StickerShape circle={{ cx: 50, cy: 81, r: 3 }} fill={WHITE} halo={false} />
  </StickerBase>
);

export const SpeechBubble: React.FC<StickerProps & { dot?: boolean }> = ({ dot, ...props }) => (
  <StickerBase {...props}>
    <StickerShape
      d="M 14 18 Q 14 8 26 8 L 74 8 Q 86 8 86 18 L 86 52 Q 86 62 74 62 L 40 62 L 28 78 L 30 62 L 26 62 Q 14 62 14 52 Z"
      fill={props.accent ?? WHITE}
    />
    {dot ? (
      <>
        <StickerShape circle={{ cx: 36, cy: 34, r: 4 }} fill={INK} halo={false} />
        <StickerShape circle={{ cx: 50, cy: 34, r: 4 }} fill={INK} halo={false} />
        <StickerShape circle={{ cx: 64, cy: 34, r: 4 }} fill={INK} halo={false} />
      </>
    ) : null}
  </StickerBase>
);

export const Heart: React.FC<StickerProps> = (props) => (
  <StickerBase {...props}>
    <StickerShape
      d="M 50 86 L 14 50 Q 4 38 14 26 Q 28 14 50 32 Q 72 14 86 26 Q 96 38 86 50 Z"
      fill={props.accent ?? COLORS.accentRed}
    />
  </StickerBase>
);

export const NetworkDots: React.FC<StickerProps> = (props) => (
  <StickerBase {...props}>
    <StickerShape line={{ x1: 22, y1: 22, x2: 52, y2: 50 }} inkWidth={4} />
    <StickerShape line={{ x1: 52, y1: 50, x2: 82, y2: 22 }} inkWidth={4} />
    <StickerShape line={{ x1: 52, y1: 50, x2: 30, y2: 82 }} inkWidth={4} />
    <StickerShape line={{ x1: 52, y1: 50, x2: 78, y2: 80 }} inkWidth={4} />
    <StickerShape circle={{ cx: 22, cy: 22, r: 8 }} fill={props.accent ?? COLORS.accentBlue} />
    <StickerShape circle={{ cx: 82, cy: 22, r: 8 }} fill={COLORS.accentTeal} />
    <StickerShape circle={{ cx: 30, cy: 82, r: 8 }} fill={COLORS.accentRed} />
    <StickerShape circle={{ cx: 78, cy: 80, r: 8 }} fill={props.accent ?? COLORS.accentBlue} />
    <StickerShape circle={{ cx: 52, cy: 50, r: 10 }} fill={WHITE} />
  </StickerBase>
);

/* ─────────────────────────  Crowd / Mind family  ───────────────────────── */

export const SmileyFace: React.FC<StickerProps & { sad?: boolean }> = ({ sad, ...props }) => (
  <StickerBase {...props}>
    <StickerShape circle={{ cx: 50, cy: 50, r: 38 }} fill={props.accent ?? COLORS.accentRed} />
    <StickerShape circle={{ cx: 38, cy: 42, r: 5 }} fill={INK} halo={false} />
    <StickerShape circle={{ cx: 62, cy: 42, r: 5 }} fill={INK} halo={false} />
    {sad ? (
      <StickerShape d="M 35 70 Q 50 60 65 70" inkWidth={5} />
    ) : (
      <StickerShape d="M 35 60 Q 50 76 65 60" inkWidth={5} />
    )}
  </StickerBase>
);

export const Brain: React.FC<StickerProps> = (props) => (
  <StickerBase {...props}>
    <StickerShape
      d="M 28 32 Q 18 32 18 44 Q 12 50 18 58 Q 18 72 32 74 Q 38 84 50 80 Q 62 84 68 74 Q 82 72 82 58 Q 88 50 82 44 Q 82 32 72 32 Q 62 22 50 28 Q 38 22 28 32 Z"
      fill={props.accent ?? COLORS.accentRed}
    />
    <StickerShape d="M 50 32 L 50 78" inkWidth={4} />
    <StickerShape d="M 32 44 Q 42 48 42 56 Q 42 64 34 66" inkWidth={3} />
    <StickerShape d="M 68 44 Q 58 48 58 56 Q 58 64 66 66" inkWidth={3} />
  </StickerBase>
);

export const Mask: React.FC<StickerProps> = (props) => (
  <StickerBase {...props}>
    <StickerShape
      d="M 18 28 Q 50 18 82 28 Q 88 50 78 70 Q 50 86 22 70 Q 12 50 18 28 Z"
      fill={props.accent ?? COLORS.accentBlue}
    />
    <StickerShape ellipse={{ cx: 36, cy: 48, rx: 8, ry: 5 }} fill={INK} halo={false} />
    <StickerShape ellipse={{ cx: 64, cy: 48, rx: 8, ry: 5 }} fill={INK} halo={false} />
    <StickerShape d="M 38 66 Q 50 70 62 66" inkWidth={4} />
  </StickerBase>
);

/* ─────────────────────────  Idea / Choice family  ───────────────────────── */

export const Lightbulb: React.FC<StickerProps> = (props) => (
  <StickerBase {...props}>
    <StickerShape
      d="M 50 8 Q 28 8 28 32 Q 28 46 38 56 L 38 66 Q 38 70 42 70 L 58 70 Q 62 70 62 66 L 62 56 Q 72 46 72 32 Q 72 8 50 8 Z"
      fill={props.accent ?? COLORS.accentRed}
    />
    <StickerShape line={{ x1: 40, y1: 74, x2: 60, y2: 74 }} inkWidth={4} />
    <StickerShape line={{ x1: 42, y1: 80, x2: 58, y2: 80 }} inkWidth={4} />
    <StickerShape line={{ x1: 46, y1: 86, x2: 54, y2: 86 }} inkWidth={4} />
    <StickerShape d="M 44 30 L 50 42 L 56 30" inkWidth={4} />
  </StickerBase>
);

export const QuestionMark: React.FC<StickerProps> = (props) => (
  <StickerBase {...props}>
    <StickerShape circle={{ cx: 50, cy: 50, r: 40 }} fill={props.accent ?? COLORS.accentBlue} />
    <StickerShape
      d="M 36 36 Q 36 24 50 24 Q 64 24 64 36 Q 64 44 56 48 Q 50 52 50 58 L 50 64"
      inkWidth={6}
    />
    <StickerShape circle={{ cx: 50, cy: 76, r: 4 }} fill={INK} halo={false} />
  </StickerBase>
);

export const Signpost: React.FC<StickerProps> = (props) => (
  <StickerBase {...props}>
    <StickerShape rect={{ x: 46, y: 30, width: 8, height: 60, rx: 2 }} fill={INK} />
    <StickerShape
      d="M 16 14 L 56 14 L 64 24 L 56 34 L 16 34 Z"
      fill={props.accent ?? COLORS.accentRed}
    />
    <StickerShape
      d="M 84 36 L 44 36 L 36 46 L 44 56 L 84 56 Z"
      fill={COLORS.accentTeal}
    />
  </StickerBase>
);

export const Star: React.FC<StickerProps> = (props) => (
  <StickerBase {...props}>
    <StickerShape
      d="M 50 8 L 60 38 L 92 40 L 66 60 L 76 90 L 50 72 L 24 90 L 34 60 L 8 40 L 40 38 Z"
      fill={props.accent ?? COLORS.accentRed}
    />
  </StickerBase>
);

/* ─────────────────────────  Knowledge family  ───────────────────────── */

export const Plant: React.FC<StickerProps> = (props) => (
  <StickerBase {...props}>
    <StickerShape
      d="M 38 86 L 30 56 Q 28 50 34 50 L 66 50 Q 72 50 70 56 L 62 86 Z"
      fill={props.accent ?? COLORS.accentRed}
    />
    <StickerShape d="M 50 50 L 50 22" inkWidth={5} />
    <StickerShape
      d="M 50 30 Q 32 22 22 32 Q 30 44 50 36 Z"
      fill={COLORS.accentTeal}
    />
    <StickerShape
      d="M 50 22 Q 68 14 78 24 Q 70 36 50 28 Z"
      fill={COLORS.accentTeal}
    />
  </StickerBase>
);

/* ─────────────────────────  Giving / Transform family (Phase 2)  ───────────────────────── */

/** Bridge — vòm cầu nối 2 bờ. Cho cảnh kết nối / chuyển tiếp. */
export const Bridge: React.FC<StickerProps> = (props) => (
  <StickerBase {...props}>
    {/* Banks left + right */}
    <StickerShape d="M 4 70 L 22 70 L 22 88 L 4 88 Z" fill={COLORS.accentTeal} />
    <StickerShape d="M 78 70 L 96 70 L 96 88 L 78 88 Z" fill={COLORS.accentTeal} />
    {/* Arch (vòm cầu) */}
    <StickerShape
      d="M 22 70 Q 50 22 78 70"
      fill={props.accent ?? COLORS.accentBlue}
    />
    {/* Deck (mặt cầu) */}
    <StickerShape d="M 18 70 L 82 70" inkWidth={5} halo={false} />
    {/* Cables / dây cầu */}
    <StickerShape d="M 32 60 L 32 70" inkWidth={3} halo={false} />
    <StickerShape d="M 50 36 L 50 70" inkWidth={3} halo={false} />
    <StickerShape d="M 68 60 L 68 70" inkWidth={3} halo={false} />
    {/* Water wave */}
    <StickerShape d="M 4 92 Q 16 96 28 92 Q 40 88 52 92 Q 64 96 76 92 Q 88 88 96 92" inkWidth={3} halo={false} />
  </StickerBase>
);

/** Mirror — gương oval có handle. Cho cảnh tự nhìn / phản chiếu / looking-glass self. */
export const Mirror: React.FC<StickerProps> = (props) => (
  <StickerBase {...props}>
    {/* Mirror oval frame */}
    <StickerShape
      ellipse={{ cx: 50, cy: 40, rx: 30, ry: 36 }}
      fill={props.accent ?? COLORS.accentBlue}
    />
    {/* Inner glass surface */}
    <StickerShape
      ellipse={{ cx: 50, cy: 40, rx: 22, ry: 28 }}
      fill={COLORS.white}
      halo={false}
      inkWidth={3}
    />
    {/* Highlight curve */}
    <StickerShape d="M 38 30 Q 42 22 52 24" inkWidth={3} halo={false} />
    {/* Handle */}
    <StickerShape d="M 50 76 L 50 92" inkWidth={6} />
    <StickerShape
      ellipse={{ cx: 50, cy: 92, rx: 6, ry: 4 }}
      fill={COLORS.ink}
      halo={false}
    />
  </StickerBase>
);

/** Door — cánh cửa hé mở có ánh sáng. Cho cảnh ngưỡng cửa / chuyển giao. */
export const Door: React.FC<StickerProps> = (props) => (
  <StickerBase {...props}>
    {/* Door frame */}
    <StickerShape
      rect={{ x: 24, y: 14, width: 52, height: 78, rx: 4 }}
      fill={COLORS.white}
    />
    {/* Door panel slightly ajar (door inset right) */}
    <StickerShape
      d="M 30 18 L 56 22 L 56 86 L 30 88 Z"
      fill={props.accent ?? COLORS.accentBlue}
    />
    {/* Handle on the open door */}
    <StickerShape
      circle={{ cx: 50, cy: 54, r: 3 }}
      fill={COLORS.accentRed}
      halo={false}
    />
    {/* Light rays escaping through gap */}
    <StickerShape d="M 60 40 L 78 32" inkWidth={4} halo={false} />
    <StickerShape d="M 60 54 L 82 54" inkWidth={4} halo={false} />
    <StickerShape d="M 60 68 L 78 76" inkWidth={4} halo={false} />
  </StickerBase>
);

/** Butterfly — 2 wings + body. Cho cảnh metamorphosis / biến thái / hóa bướm. */
export const Butterfly: React.FC<StickerProps> = (props) => (
  <StickerBase {...props}>
    {/* Body */}
    <StickerShape
      ellipse={{ cx: 50, cy: 50, rx: 3, ry: 22 }}
      fill={COLORS.ink}
    />
    {/* Antennae */}
    <StickerShape d="M 50 30 Q 44 22 38 18" inkWidth={3} halo={false} />
    <StickerShape d="M 50 30 Q 56 22 62 18" inkWidth={3} halo={false} />
    {/* Left top wing */}
    <StickerShape
      d="M 50 40 Q 18 26 12 44 Q 14 60 50 54 Z"
      fill={props.accent ?? COLORS.accentBlue}
    />
    {/* Right top wing */}
    <StickerShape
      d="M 50 40 Q 82 26 88 44 Q 86 60 50 54 Z"
      fill={props.accent ?? COLORS.accentBlue}
    />
    {/* Left bottom wing */}
    <StickerShape
      d="M 50 58 Q 26 64 24 80 Q 36 84 50 70 Z"
      fill={COLORS.accentRed}
    />
    {/* Right bottom wing */}
    <StickerShape
      d="M 50 58 Q 74 64 76 80 Q 64 84 50 70 Z"
      fill={COLORS.accentRed}
    />
    {/* Wing spots */}
    <StickerShape
      circle={{ cx: 28, cy: 44, r: 4 }}
      fill={COLORS.white}
      halo={false}
    />
    <StickerShape
      circle={{ cx: 72, cy: 44, r: 4 }}
      fill={COLORS.white}
      halo={false}
    />
  </StickerBase>
);

/** HandOpen — bàn tay mở (palm view). Cho cảnh trao đi / cho đi vật chất. */
export const HandOpen: React.FC<StickerProps> = (props) => (
  <StickerBase {...props}>
    {/* Palm */}
    <StickerShape
      d="M 30 50 Q 30 38 40 38 L 60 38 Q 70 38 70 50 L 70 78 Q 70 90 60 90 L 40 90 Q 30 90 30 78 Z"
      fill={props.accent ?? COLORS.bgAlt}
    />
    {/* Thumb */}
    <StickerShape
      d="M 30 56 Q 18 56 16 46 Q 20 38 30 42 Z"
      fill={props.accent ?? COLORS.bgAlt}
    />
    {/* 4 fingers (sticking up) */}
    <StickerShape
      rect={{ x: 36, y: 18, width: 7, height: 24, rx: 3 }}
      fill={props.accent ?? COLORS.bgAlt}
    />
    <StickerShape
      rect={{ x: 46, y: 12, width: 7, height: 30, rx: 3 }}
      fill={props.accent ?? COLORS.bgAlt}
    />
    <StickerShape
      rect={{ x: 56, y: 16, width: 7, height: 26, rx: 3 }}
      fill={props.accent ?? COLORS.bgAlt}
    />
    <StickerShape
      rect={{ x: 65, y: 22, width: 6, height: 20, rx: 3 }}
      fill={props.accent ?? COLORS.bgAlt}
    />
  </StickerBase>
);

/** Apple — táo có cuống + lá. Cho cảnh sacrifice / cho đi vật chất / "phép trừ". */
export const Apple: React.FC<StickerProps> = (props) => (
  <StickerBase {...props}>
    {/* Body — two-lobe heart-ish */}
    <StickerShape
      d="M 50 26 Q 38 26 30 36 Q 20 50 26 70 Q 32 86 50 86 Q 68 86 74 70 Q 80 50 70 36 Q 62 26 50 26 Z"
      fill={props.accent ?? COLORS.accentRed}
    />
    {/* Stem */}
    <StickerShape d="M 50 26 L 50 14" inkWidth={5} />
    {/* Leaf */}
    <StickerShape
      d="M 50 20 Q 62 12 66 22 Q 60 28 50 24 Z"
      fill={COLORS.accentTeal}
    />
    {/* Shine highlight */}
    <StickerShape d="M 38 44 Q 36 38 42 36" inkWidth={3} halo={false} />
  </StickerBase>
);

/** Cocoon — kén nằm trên cành. Pre-metamorphosis state. */
export const Cocoon: React.FC<StickerProps> = (props) => (
  <StickerBase {...props}>
    {/* Branch above */}
    <StickerShape d="M 14 24 L 86 24" inkWidth={5} />
    {/* Small leaf on branch */}
    <StickerShape
      d="M 70 24 Q 80 18 84 24 Q 80 30 72 26 Z"
      fill={COLORS.accentTeal}
    />
    {/* Cocoon hanging */}
    <StickerShape d="M 50 24 L 50 38" inkWidth={3} halo={false} />
    <StickerShape
      d="M 50 38 Q 30 44 30 60 Q 30 84 50 86 Q 70 84 70 60 Q 70 44 50 38 Z"
      fill={props.accent ?? COLORS.bgAlt}
    />
    {/* Cocoon stripes */}
    <StickerShape d="M 34 56 Q 50 60 66 56" inkWidth={3} halo={false} />
    <StickerShape d="M 34 68 Q 50 72 66 68" inkWidth={3} halo={false} />
    <StickerShape d="M 36 78 Q 50 82 64 78" inkWidth={3} halo={false} />
  </StickerBase>
);

/* ─────────────────────  Triết học (Phase philosophy)  ───────────────────── */

/** Hang động — vòm tối + lối sáng cuối hang (ẩn dụ hang Plato). */
export const CaveArch: React.FC<StickerProps> = (props) => (
  <StickerBase {...props}>
    <StickerShape
      d="M 10 90 L 10 55 Q 10 15 50 15 Q 90 15 90 55 L 90 90 Z"
      fill={INK}
    />
    {/* Lối sáng cuối hang — vàng tươi (ánh sáng), to hơn để đọc rõ. */}
    <StickerShape
      d="M 34 90 L 34 60 Q 34 42 50 42 Q 66 42 66 60 L 66 90 Z"
      fill={COLORS.bg}
      halo={false}
    />
  </StickerBase>
);

/** Tia sáng — chùm sáng đổ xuống (giác ngộ / sự thật rọi vào). */
export const LightBeam: React.FC<StickerProps> = (props) => (
  <StickerBase {...props}>
    <StickerShape d="M 50 8 L 24 92 L 76 92 Z" fill={props.accent ?? COLORS.accentRed} />
    <StickerShape line={{ x1: 50, y1: 20, x2: 42, y2: 88 }} inkWidth={3} halo={false} />
    <StickerShape line={{ x1: 50, y1: 20, x2: 58, y2: 88 }} inkWidth={3} halo={false} />
  </StickerBase>
);

/** Ngọn nến — thân nến + lửa (hữu hạn, memento mori). */
export const Candle: React.FC<StickerProps> = (props) => (
  <StickerBase {...props}>
    <StickerShape rect={{ x: 38, y: 46, width: 24, height: 44, rx: 4 }} fill={COLORS.white} />
    <StickerShape line={{ x1: 50, y1: 46, x2: 50, y2: 40 }} inkWidth={4} halo={false} />
    {/* Lửa LUÔN ấm (đỏ coral) — không theo accent để mood contemplative (navy) không làm tối lửa. */}
    <StickerShape d="M 50 12 Q 62 28 50 40 Q 38 28 50 12 Z" fill={COLORS.accentRed} />
    <StickerShape line={{ x1: 44, y1: 60, x2: 44, y2: 74 }} inkWidth={3} halo={false} />
  </StickerBase>
);

/** Chiếc lá rơi — vô thường, thời gian trôi. */
export const Leaf: React.FC<StickerProps> = (props) => (
  <StickerBase {...props}>
    <StickerShape d="M 50 12 Q 86 42 50 88 Q 14 42 50 12 Z" fill={props.accent ?? COLORS.accentTeal} />
    <StickerShape line={{ x1: 50, y1: 20, x2: 50, y2: 80 }} inkWidth={4} halo={false} />
    <StickerShape d="M 50 40 L 36 34" inkWidth={3} halo={false} />
    <StickerShape d="M 50 54 L 64 48" inkWidth={3} halo={false} />
  </StickerBase>
);

/** Ngọn núi — đỉnh cao, gian nan (Sisyphus / vượt khó). */
export const Mountain: React.FC<StickerProps> = (props) => (
  <StickerBase {...props}>
    <StickerShape d="M 8 88 L 40 26 L 58 54 L 72 34 L 92 88 Z" fill={props.accent ?? COLORS.accentBlue} />
    <StickerShape d="M 33 38 L 40 26 L 48 42 Q 44 38 40 41 Q 37 38 33 38 Z" fill={COLORS.white} halo={false} />
  </StickerBase>
);

/** Tảng đá — gánh nặng phi lý (hòn đá Sisyphus). */
export const Boulder: React.FC<StickerProps> = (props) => (
  <StickerBase {...props}>
    <StickerShape
      d="M 22 80 Q 10 56 28 40 Q 46 24 68 32 Q 90 40 84 64 Q 80 82 56 84 Q 34 86 22 80 Z"
      fill={props.accent ?? COLORS.inkMuted}
    />
    <StickerShape d="M 40 46 L 52 60 L 44 72" inkWidth={3} halo={false} />
    <StickerShape d="M 64 50 L 72 58" inkWidth={3} halo={false} />
  </StickerBase>
);

/** Cán cân — đạo đức, công bằng (thiện/ác, đúng/sai). */
export const BalanceScale: React.FC<StickerProps> = (props) => (
  <StickerBase {...props}>
    <StickerShape line={{ x1: 50, y1: 20, x2: 50, y2: 84 }} />
    <StickerShape line={{ x1: 34, y1: 84, x2: 66, y2: 84 }} />
    <StickerShape line={{ x1: 18, y1: 30, x2: 82, y2: 30 }} />
    <StickerShape circle={{ cx: 50, cy: 20, r: 6 }} fill={props.accent ?? COLORS.accentRed} />
    <StickerShape d="M 6 36 Q 18 56 30 36 Z" fill={COLORS.accentTeal} />
    <StickerShape line={{ x1: 18, y1: 30, x2: 6, y2: 36 }} inkWidth={3} halo={false} />
    <StickerShape line={{ x1: 18, y1: 30, x2: 30, y2: 36 }} inkWidth={3} halo={false} />
    <StickerShape d="M 70 36 Q 82 56 94 36 Z" fill={COLORS.accentTeal} />
    <StickerShape line={{ x1: 82, y1: 30, x2: 70, y2: 36 }} inkWidth={3} halo={false} />
    <StickerShape line={{ x1: 82, y1: 30, x2: 94, y2: 36 }} inkWidth={3} halo={false} />
  </StickerBase>
);

/** Đầu robot — trí tuệ nhân tạo, ý thức máy. */
export const RobotHead: React.FC<StickerProps> = (props) => (
  <StickerBase {...props}>
    <StickerShape line={{ x1: 50, y1: 30, x2: 50, y2: 16 }} />
    <StickerShape circle={{ cx: 50, cy: 13, r: 5 }} fill={COLORS.accentRed} />
    {/* Đầu LUÔN xanh dương để không bị tối khi mood=contemplative (accent navy). */}
    <StickerShape rect={{ x: 24, y: 30, width: 52, height: 48, rx: 10 }} fill={COLORS.accentBlue} />
    {/* Mắt/miệng halo=false để KHÔNG phủ trắng lên màu đầu. */}
    <StickerShape circle={{ cx: 39, cy: 50, r: 6 }} fill={COLORS.white} halo={false} />
    <StickerShape circle={{ cx: 61, cy: 50, r: 6 }} fill={COLORS.white} halo={false} />
    <StickerShape circle={{ cx: 39, cy: 50, r: 2.4 }} fill={INK} halo={false} />
    <StickerShape circle={{ cx: 61, cy: 50, r: 2.4 }} fill={INK} halo={false} />
    <StickerShape rect={{ x: 41, y: 64, width: 18, height: 7, rx: 3 }} fill={COLORS.white} halo={false} />
  </StickerBase>
);

/* ────────────────  Triết học lô 2  ──────────────── */

/** Bập bênh khoái cảm–nỗi đau (Anna Lembke / Dopamine Nation). Đòn nghiêng:
 * bên "sướng" (coral) bổng lên, bên "đau" (teal) chìm xuống — homeostasis. */
export const Seesaw: React.FC<StickerProps> = (props) => (
  <StickerBase {...props}>
    {/* đòn nghiêng (parallelogram trắng) */}
    <StickerShape d="M 12 27 L 88 51 L 88 65 L 12 41 Z" fill={COLORS.white} />
    {/* trụ tam giác */}
    <StickerShape d="M 50 49 L 38 86 L 62 86 Z" fill={props.accent ?? COLORS.accentBlue} />
    {/* quả nặng "sướng" bổng (coral) + "đau" chìm (teal) — màu cố định */}
    <StickerShape circle={{ cx: 16, cy: 22, r: 10 }} fill={COLORS.accentRed} />
    <StickerShape circle={{ cx: 84, cy: 70, r: 10 }} fill={COLORS.accentTeal} />
  </StickerBase>
);

/** La bàn — đi tìm ý nghĩa / phương hướng. Kim Bắc đỏ, Nam navy. */
export const Compass: React.FC<StickerProps> = (props) => (
  <StickerBase {...props}>
    <StickerShape circle={{ cx: 50, cy: 50, r: 38 }} fill={COLORS.white} />
    <StickerShape line={{ x1: 50, y1: 12, x2: 50, y2: 20 }} inkWidth={4} halo={false} />
    <StickerShape d="M 50 24 L 58 50 L 42 50 Z" fill={COLORS.accentRed} />
    <StickerShape d="M 50 76 L 58 50 L 42 50 Z" fill={INK} />
    <StickerShape circle={{ cx: 50, cy: 50, r: 5 }} fill={props.accent ?? COLORS.accentBlue} halo={false} />
  </StickerBase>
);

/** Hư vô — vực thẳm tối, 1 đốm bị hút vào. */
export const Void: React.FC<StickerProps> = (props) => (
  <StickerBase {...props}>
    <StickerShape circle={{ cx: 50, cy: 50, r: 36 }} fill={INK} />
    <StickerShape circle={{ cx: 50, cy: 50, r: 23 }} fill="none" inkWidth={2} halo={false} />
    <StickerShape circle={{ cx: 66, cy: 36, r: 4 }} fill={COLORS.accentRed} halo={false} />
  </StickerBase>
);

/** Cột Hy Lạp — khắc kỷ, vững vàng (Stoicism). Capital loe + thân rãnh + đế bệ. */
export const Column: React.FC<StickerProps> = (props) => (
  <StickerBase {...props}>
    {/* Capital: tấm abacus + phần loe echinus */}
    <StickerShape rect={{ x: 20, y: 12, width: 60, height: 9, rx: 2 }} fill={COLORS.white} />
    <StickerShape d="M 30 21 Q 50 29 70 21 L 66 31 L 34 31 Z" fill={COLORS.white} />
    {/* Thân cột + rãnh dọc (fluting) */}
    <StickerShape rect={{ x: 34, y: 31, width: 32, height: 45 }} fill={COLORS.white} />
    <StickerShape line={{ x1: 42, y1: 34, x2: 42, y2: 73 }} inkWidth={3} halo={false} />
    <StickerShape line={{ x1: 50, y1: 34, x2: 50, y2: 73 }} inkWidth={3} halo={false} />
    <StickerShape line={{ x1: 58, y1: 34, x2: 58, y2: 73 }} inkWidth={3} halo={false} />
    {/* Đế: phần loe + bệ rộng */}
    <StickerShape d="M 34 76 L 66 76 L 70 84 L 30 84 Z" fill={COLORS.white} />
    <StickerShape rect={{ x: 18, y: 84, width: 64, height: 9, rx: 2 }} fill={COLORS.white} />
  </StickerBase>
);

/** Cú Minerva — minh triết. Mắt to đồng tâm + mỏ tam giác + tai nhọn. */
export const Owl: React.FC<StickerProps> = (props) => (
  <StickerBase {...props}>
    {/* tai nhọn */}
    <StickerShape d="M 30 24 L 22 6 L 42 20 Z" fill={props.accent ?? COLORS.accentBlue} />
    <StickerShape d="M 70 24 L 78 6 L 58 20 Z" fill={props.accent ?? COLORS.accentBlue} />
    {/* thân/đầu trứng */}
    <StickerShape
      d="M 50 14 Q 82 14 82 50 Q 82 90 50 90 Q 18 90 18 50 Q 18 14 50 14 Z"
      fill={props.accent ?? COLORS.accentBlue}
    />
    {/* mắt cú: đĩa trắng to + đồng tử (đồng tâm) */}
    <StickerShape circle={{ cx: 37, cy: 40, r: 15 }} fill={COLORS.white} halo={false} />
    <StickerShape circle={{ cx: 63, cy: 40, r: 15 }} fill={COLORS.white} halo={false} />
    <StickerShape circle={{ cx: 37, cy: 40, r: 6 }} fill={INK} halo={false} />
    <StickerShape circle={{ cx: 63, cy: 40, r: 6 }} fill={INK} halo={false} />
    <StickerShape circle={{ cx: 34, cy: 37, r: 2 }} fill={COLORS.white} halo={false} />
    <StickerShape circle={{ cx: 60, cy: 37, r: 2 }} fill={COLORS.white} halo={false} />
    {/* mỏ tam giác giữa 2 mắt */}
    <StickerShape d="M 50 46 L 43 57 L 57 57 Z" fill={COLORS.accentRed} halo={false} />
    {/* ngực — chevron lông */}
    <StickerShape d="M 33 68 Q 50 78 67 68" fill="none" inkWidth={3} halo={false} />
    <StickerShape d="M 38 78 Q 50 85 62 78" fill="none" inkWidth={3} halo={false} />
  </StickerBase>
);

/** Con mắt ý thức — quan sát, tỉnh giác. Iris LUÔN xanh để không tối ở contemplative. */
export const Eye: React.FC<StickerProps> = (props) => (
  <StickerBase {...props}>
    <StickerShape d="M 10 50 Q 50 18 90 50 Q 50 82 10 50 Z" fill={COLORS.white} />
    <StickerShape circle={{ cx: 50, cy: 50, r: 20 }} fill={COLORS.accentBlue} />
    <StickerShape circle={{ cx: 50, cy: 50, r: 8 }} fill={INK} halo={false} />
    <StickerShape circle={{ cx: 44, cy: 44, r: 4 }} fill={COLORS.white} halo={false} />
    <StickerShape line={{ x1: 50, y1: 16, x2: 50, y2: 7 }} inkWidth={3} halo={false} />
    <StickerShape line={{ x1: 78, y1: 31, x2: 86, y2: 23 }} inkWidth={3} halo={false} />
    <StickerShape line={{ x1: 22, y1: 31, x2: 14, y2: 23 }} inkWidth={3} halo={false} />
  </StickerBase>
);
