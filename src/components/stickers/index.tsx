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
