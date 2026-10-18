import { useEffect, useRef } from 'react';
import type { MoveReview } from '../analysis/evaluator';
import { QUALITY_INFO } from '../analysis/quality';
import type { Game } from '../core/game';
import { formatMove } from '../core/notation';
import { colorOf } from '../core/rules';

interface Props {
  game: Game;
  reviews: Record<number, MoveReview>;
  /** Просматриваемый полуход; null — текущая позиция. */
  viewPly: number | null;
  onSelect: (ply: number) => void;
}

export function MoveList({ game, reviews, viewPly, onSelect }: Props) {
  const rows: { n: number; w?: number; b?: number }[] = [];
  game.history.forEach((h, i) => {
    const ply = i + 1;
    const c = colorOf(h.piece);
    const idx = h.pos.fullmove - (c === 'b' ? 2 : 1);
    const row = (rows[idx] ??= { n: idx + 1 });
    row[c] = ply;
  });
  const active = viewPly ?? game.history.length;
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.querySelector('.move.active')?.scrollIntoView({ block: 'nearest' });
  }, [active, game.history.length]);

  const cell = (ply: number | undefined, cls: string) => {
    if (!ply) return <td className={cls} />;
    const h = game.history[ply - 1];
    const r = reviews[ply];
    const info = r ? QUALITY_INFO[r.quality] : null;
    return (
      <td className={cls}>
        <button
          className={`move${ply === active ? ' active' : ''}`}
          onClick={() => onSelect(ply)}
          title={info ? `${info.ru}${r!.loss >= 1 ? ` (−${Math.round(r!.loss)}% шансов)` : ''}` : undefined}
        >
          {formatMove(h)}
          {info && (
            <span className="q-badge" style={{ background: info.color }}>
              {info.mark || '•'}
            </span>
          )}
        </button>
      </td>
    );
  };

  return (
    <div className="moves" ref={ref}>
      {rows.length === 0 && <div className="muted small">Первым ходит Чо.</div>}
      <table>
        <tbody>
          {rows.filter(Boolean).map((r) => (
            <tr key={r.n}>
              <td className="muted">{r.n}.</td>
              {cell(r.w, 'cho')}
              {cell(r.b, 'han')}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
