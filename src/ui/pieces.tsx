import type { ReactNode } from 'react';
import { colorOf, typeOf, type Color, type Piece, type PieceType } from '../core/rules';

export type PieceStyle = 'icons' | 'hanja';

export const SIDE_COLORS: Record<Color, string> = { w: '#17694a', b: '#b3242a' };
export const SIDE_NAMES: Record<Color, string> = { w: 'Чо', b: 'Хан' };
export const SIDE_KO: Record<Color, string> = { w: '초', b: '한' };

export const PIECE_NAMES: Record<PieceType, { ru: string; short: string; ko: string }> = {
  K: { ru: 'Генерал', short: 'Г', ko: '궁' },
  A: { ru: 'Страж', short: 'Ст', ko: '사' },
  B: { ru: 'Слон', short: 'Сл', ko: '상' },
  N: { ru: 'Конь', short: 'К', ko: '마' },
  R: { ru: 'Колесница', short: 'Кл', ko: '차' },
  C: { ru: 'Пушка', short: 'П', ko: '포' },
  P: { ru: 'Солдат', short: 'С', ko: '졸/병' },
};

const HANJA: Record<Color, Record<PieceType, string>> = {
  w: { K: '楚', A: '士', B: '象', N: '馬', R: '車', C: '包', P: '卒' },
  b: { K: '漢', A: '士', B: '象', N: '馬', R: '車', C: '包', P: '兵' },
};

/** Радиус фигуры при шаге сетки 64: генерал крупнее всех, страж и солдат — меньше. */
export function pieceRadius(t: PieceType): number {
  return t === 'K' ? 30 : t === 'A' || t === 'P' ? 21 : 26;
}

const IVORY = '#f7ecd2';

/** Иконки в стиле «европейских» фигур; координаты в квадрате −30…30. */
function icon(t: PieceType, c: string): ReactNode {
  switch (t) {
    case 'K':
      return (
        <g fill={c}>
          <path d="M-24 12 L-27 -14 L-12 -1 L0 -22 L12 -1 L27 -14 L24 12 Z" />
          <rect x={-24} y={15} width={48} height={7} rx={2} />
          <circle cx={-27} cy={-16} r={4} />
          <circle cx={0} cy={-24} r={4} />
          <circle cx={27} cy={-16} r={4} />
        </g>
      );
    case 'A':
      return (
        <g>
          <path fill={c} d="M0 -26 L22 -18 L20 4 Q16 20 0 28 Q-16 20 -20 4 L-22 -18 Z" />
          <path d="M0 -15 V16 M-11 -3 H11" stroke={IVORY} strokeWidth={4} strokeLinecap="round" />
        </g>
      );
    case 'B':
      return (
        <g fill={c}>
          <ellipse cx={7} cy={1} rx={19} ry={13} />
          <circle cx={-13} cy={-7} r={11} />
          <path d="M-21 -2 Q-29 10 -24 23" stroke={c} strokeWidth={6} fill="none" strokeLinecap="round" />
          <rect x={-6} y={9} width={7} height={15} rx={2} />
          <rect x={15} y={9} width={7} height={15} rx={2} />
          <ellipse cx={-6} cy={-6} rx={7} ry={9} stroke={IVORY} strokeWidth={2} />
          <path d="M-18 3 Q-14 9 -8 7" stroke={IVORY} strokeWidth={2.5} fill="none" strokeLinecap="round" />
          <circle cx={-17} cy={-10} r={2} fill={IVORY} />
        </g>
      );
    case 'N':
      return (
        <g>
          <path
            fill={c}
            d="M15 26 L-15 26 L-13 17 Q-5 8 -3 1 L-13 5 Q-22 7 -24 -1 L-21 -7 Q-10 -18 -7 -24 L-4 -30 L2 -22 Q21 -17 22 3 Q22 17 15 26 Z"
          />
          <circle cx={-8} cy={-13} r={2.4} fill={IVORY} />
          <path d="M6 -18 Q14 -4 10 14" stroke={IVORY} strokeWidth={2} fill="none" strokeLinecap="round" />
        </g>
      );
    case 'R':
      return (
        <g>
          <path fill={c} d="M-27 -9 H27 L21 -25 H-21 Z" />
          <circle cx={0} cy={9} r={14} fill="none" stroke={c} strokeWidth={5} />
          <path d="M0 -5 V23 M-14 9 H14 M-10 -1 L10 19 M10 -1 L-10 19" stroke={c} strokeWidth={2.5} />
          <circle cx={0} cy={9} r={4.5} fill={c} />
        </g>
      );
    case 'C':
      return (
        <g>
          <g transform="rotate(-24)" fill={c}>
            <rect x={-25} y={-9} width={46} height={15} rx={7} />
            <rect x={18} y={-12} width={7} height={21} rx={2} />
          </g>
          <circle cx={-3} cy={13} r={11} fill={IVORY} stroke={c} strokeWidth={5} />
          <circle cx={-3} cy={13} r={3.5} fill={c} />
        </g>
      );
    case 'P':
      return (
        <g fill={c}>
          <circle cx={0} cy={-14} r={9} />
          <path d="M-8 -4 H8 L13 17 H-13 Z" />
          <rect x={-17} y={17} width={34} height={7} rx={2} />
        </g>
      );
  }
}

function octagon(r: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 8; i++) {
    const a = ((22.5 + 45 * i) * Math.PI) / 180;
    pts.push(`${(r * Math.cos(a)).toFixed(2)},${(r * Math.sin(a)).toFixed(2)}`);
  }
  return pts.join(' ');
}

interface Props {
  piece: Piece;
  style: PieceStyle;
  x: number;
  y: number;
  /** Масштаб относительно стандартного размера. */
  scale?: number;
  dim?: boolean;
}

export function PieceView({ piece, style, x, y, scale = 1, dim }: Props) {
  const c = colorOf(piece);
  const t = typeOf(piece);
  const r = pieceRadius(t);
  const color = SIDE_COLORS[c];
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`} opacity={dim ? 0.45 : 1} className="piece">
      <polygon points={octagon(r + 1.5)} fill="rgba(0,0,0,0.25)" transform="translate(1.5 2.5)" />
      <polygon points={octagon(r)} fill="url(#pieceFill)" stroke={color} strokeWidth={2.4} />
      <polygon points={octagon(r - 4)} fill="none" stroke={color} strokeOpacity={0.35} strokeWidth={1} />
      {style === 'hanja' ? (
        <text
          className="hanja"
          fill={color}
          fontSize={r * 1.15}
          textAnchor="middle"
          dominantBaseline="central"
          y={1}
        >
          {HANJA[c][t]}
        </text>
      ) : (
        <g transform={`scale(${(r * 0.72) / 30})`}>{icon(t, color)}</g>
      )}
    </g>
  );
}

/** Отдельная маленькая фигура для панелей и диалогов. */
export function PieceIcon({ piece, style, size = 32 }: { piece: Piece; style: PieceStyle; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="-32 -32 64 64" className="piece-icon">
      <PieceDefs />
      <PieceView piece={piece} style={style} x={0} y={0} scale={30 / pieceRadius(typeOf(piece))} />
    </svg>
  );
}

export function PieceDefs() {
  return (
    <defs>
      <radialGradient id="pieceFill" cx="40%" cy="35%" r="75%">
        <stop offset="0%" stopColor="#fffaf0" />
        <stop offset="70%" stopColor="#f3e3bf" />
        <stop offset="100%" stopColor="#dcc597" />
      </radialGradient>
    </defs>
  );
}
