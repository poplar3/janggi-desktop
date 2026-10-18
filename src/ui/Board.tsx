import {
  FILES,
  FILE_LETTERS,
  RANKS,
  type Board as BoardArr,
  type Move,
  findGeneral,
  fileOf,
  generalsFacing,
  rankOf,
  sq,
} from '../core/rules';
import { PieceDefs, PieceView, type PieceStyle } from './pieces';

export const CELL = 64;
const MARGIN = 56;
const W = (FILES - 1) * CELL + 2 * MARGIN;
const H = (RANKS - 1) * CELL + 2 * MARGIN;

export interface Arrow {
  from: number;
  to: number;
  color: string;
  label?: string;
  dashed?: boolean;
  /** Толстая стрелка для главного хода. */
  main?: boolean;
}

interface Props {
  board: BoardArr;
  style: PieceStyle;
  flipped: boolean;
  selected: number | null;
  targets: Move[];
  lastMove: Move | null;
  checkSquare: number | null;
  arrows: Arrow[];
  onSquareClick: (s: number) => void;
}

export function Board({ board, style, flipped, selected, targets, lastMove, checkSquare, arrows, onSquareClick }: Props) {
  const pos = (s: number) => {
    const f = fileOf(s);
    const r = rankOf(s);
    const x = MARGIN + (flipped ? FILES - 1 - f : f) * CELL;
    const y = MARGIN + (flipped ? r : RANKS - 1 - r) * CELL;
    return { x, y };
  };
  const pt = (f: number, r: number) => pos(sq(f, r));

  const grid = (() => {
    const lines: string[] = [];
    for (let f = 0; f < FILES; f++) {
      const a = pt(f, 0), b = pt(f, RANKS - 1);
      lines.push(`M${a.x} ${a.y}L${b.x} ${b.y}`);
    }
    for (let r = 0; r < RANKS; r++) {
      const a = pt(0, r), b = pt(FILES - 1, r);
      lines.push(`M${a.x} ${a.y}L${b.x} ${b.y}`);
    }
    for (const [r0, r1] of [[0, 2], [7, 9]]) {
      const a = pt(3, r0), b = pt(5, r1), c = pt(5, r0), d = pt(3, r1);
      lines.push(`M${a.x} ${a.y}L${b.x} ${b.y}M${c.x} ${c.y}L${d.x} ${d.y}`);
    }
    return lines.join('');
  })();

  const facing = generalsFacing(board);
  const wg = findGeneral(board, 'w');
  const bg = findGeneral(board, 'b');
  const targetSet = new Map(targets.map((m) => [m.to, m]));

  return (
    <svg className="board" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Доска для Чанги">
      <PieceDefs />
      <defs>
        <linearGradient id="wood" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#f0cf8e" />
          <stop offset="100%" stopColor="#dcae62" />
        </linearGradient>
        <radialGradient id="checkGlow">
          <stop offset="0%" stopColor="rgba(230,30,30,0.85)" />
          <stop offset="100%" stopColor="rgba(230,30,30,0)" />
        </radialGradient>
        {['#2f6fd6', '#d97a00', '#7b8794', '#8e44ad', '#1f8a4c'].map((c) => (
          <marker key={c} id={`arrow-${c.slice(1)}`} viewBox="0 0 10 10" refX="5" refY="5" markerWidth="3.2" markerHeight="3.2" orient="auto">
            <path d="M0 0L10 5L0 10z" fill={c} />
          </marker>
        ))}
      </defs>
      <rect x={0} y={0} width={W} height={H} rx={10} fill="url(#wood)" />
      <rect x={MARGIN} y={MARGIN} width={W - 2 * MARGIN} height={H - 2 * MARGIN} fill="none" stroke="#5b3a17" strokeWidth={2.5} />
      <path d={grid} stroke="#5b3a17" strokeWidth={1.3} fill="none" />

      {Array.from({ length: FILES }, (_, f) => {
        const p = pt(f, flipped ? RANKS - 1 : 0);
        return (
          <text key={`f${f}`} className="coord" x={p.x} y={H - 12} textAnchor="middle">
            {FILE_LETTERS[f]}
          </text>
        );
      })}
      {Array.from({ length: RANKS }, (_, r) => {
        const p = pt(flipped ? FILES - 1 : 0, r);
        return (
          <text key={`r${r}`} className="coord" x={18} y={p.y + 5} textAnchor="middle">
            {r + 1}
          </text>
        );
      })}

      {lastMove &&
        [lastMove.from, lastMove.to].map((s, i) => {
          const p = pos(s);
          return <rect key={i} x={p.x - 30} y={p.y - 30} width={60} height={60} rx={8} fill="rgba(255,240,90,0.45)" />;
        })}

      {checkSquare !== null && (() => {
        const p = pos(checkSquare);
        return <circle cx={p.x} cy={p.y} r={44} fill="url(#checkGlow)" />;
      })()}

      {facing && wg >= 0 && bg >= 0 && (() => {
        const a = pos(wg), b = pos(bg);
        return <line className="bikjang-line" x1={a.x} y1={a.y} x2={b.x} y2={b.y} />;
      })()}

      {board.map((p, s) => {
        if (!p) return null;
        const { x, y } = pos(s);
        return (
          <g key={s}>
            {selected === s && <circle cx={x} cy={y} r={36} fill="none" stroke="#2f6fd6" strokeWidth={5} />}
            <PieceView piece={p} style={style} x={x} y={y} />
          </g>
        );
      })}

      {[...targetSet.keys()].map((s) => {
        const { x, y } = pos(s);
        const isPassTarget = targetSet.get(s)!.from === s;
        if (isPassTarget) return null;
        return board[s] ? (
          <circle key={`t${s}`} cx={x} cy={y} r={33} fill="none" stroke="rgba(47,111,214,0.85)" strokeWidth={4} />
        ) : (
          <circle key={`t${s}`} cx={x} cy={y} r={9} fill="rgba(47,111,214,0.75)" />
        );
      })}

      {arrows.map((a, i) => {
        const p = pos(a.from), q = pos(a.to);
        if (a.from === a.to) {
          return <circle key={`a${i}`} cx={p.x} cy={p.y} r={36} fill="none" stroke={a.color} strokeWidth={6} strokeDasharray="8 6" opacity={0.85} />;
        }
        const dx = q.x - p.x, dy = q.y - p.y;
        const len = Math.hypot(dx, dy);
        const ex = q.x - (dx / len) * 14, ey = q.y - (dy / len) * 14;
        return (
          <g key={`a${i}`} opacity={0.85} pointerEvents="none">
            <line x1={p.x} y1={p.y} x2={ex} y2={ey} stroke={a.color} strokeWidth={a.main ? 9 : 6} strokeLinecap="round" strokeDasharray={a.dashed ? '12 9' : undefined} markerEnd={`url(#arrow-${a.color.slice(1)})`} />
            {a.label && (
              <text x={(p.x + q.x) / 2} y={(p.y + q.y) / 2 - 8} className="arrow-label" textAnchor="middle">
                {a.label}
              </text>
            )}
          </g>
        );
      })}

      {Array.from({ length: FILES * RANKS }, (_, s) => {
        const { x, y } = pos(s);
        return <circle key={`h${s}`} cx={x} cy={y} r={31} fill="transparent" className="hit" onClick={() => onSquareClick(s)} />;
      })}
    </svg>
  );
}
