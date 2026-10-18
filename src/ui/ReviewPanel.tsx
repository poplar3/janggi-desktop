import { useState } from 'react';
import type { MoveReview } from '../analysis/evaluator';
import { describePlan } from '../analysis/plan';
import { accuracy, QUALITY_INFO, type Quality } from '../analysis/quality';
import type { Game } from '../core/game';
import { formatMove } from '../core/notation';
import { toFen, type Color } from '../core/rules';
import { formatScore, scoreForCho } from '../engine/engine';
import { EvalGraph } from './EvalGraph';
import { SIDE_NAMES } from './pieces';

export const REVIEW_DEPTHS = [
  { id: 'fast', ru: 'Быстро (0,5 с на позицию)', movetime: 500 },
  { id: 'normal', ru: 'Обычно (1,5 с)', movetime: 1500 },
  { id: 'deep', ru: 'Глубоко (4 с)', movetime: 4000 },
] as const;

interface Props {
  game: Game;
  reviews: Record<number, MoveReview>;
  evals: (number | undefined)[];
  viewPly: number | null;
  progress: { done: number; total: number } | null;
  onSelect: (ply: number) => void;
  onStart: (movetime: number) => void;
  onStop: () => void;
  onClose: () => void;
}

const COUNTED: Quality[] = ['inaccuracy', 'mistake', 'blunder'];

export function ReviewPanel({ game, reviews, evals, viewPly, progress, onSelect, onStart, onStop, onClose }: Props) {
  const [depth, setDepth] = useState<number>(1500);
  const all = Object.values(reviews);
  const n = game.history.length;
  const complete = n > 0 && all.length >= n;
  const bySide = (c: Color) => all.filter((r) => r.mover === c);
  const ply = viewPly ?? n;
  const sel = ply > 0 ? reviews[ply] : undefined;
  const fenBefore = ply > 0 ? toFen(ply === 1 ? game.start : game.history[ply - 2].pos) : null;
  const betterPlan = sel && sel.quality !== 'best' && sel.before.pv.length && fenBefore ? describePlan(fenBefore, sel.before.pv) : null;

  return (
    <div className="panel review-panel">
      <div className="ai-head">
        <b>Разбор партии</b>
        <button className="icon-btn" onClick={onClose} aria-label="Закрыть разбор">
          ✕
        </button>
      </div>

      {n === 0 && <div className="muted small">Сделайте хотя бы один ход, чтобы разобрать партию.</div>}

      {n > 0 && !progress && (
        <div className="review-start">
          <select value={depth} onChange={(e) => setDepth(Number(e.target.value))}>
            {REVIEW_DEPTHS.map((d) => (
              <option key={d.id} value={d.movetime}>
                {d.ru}
              </option>
            ))}
          </select>
          <button className="btn primary" onClick={() => onStart(depth)}>
            {complete ? 'Заново' : 'Разобрать'}
          </button>
        </div>
      )}
      {progress && (
        <div className="review-progress">
          <div className="progress">
            <div style={{ width: `${(progress.done / Math.max(1, progress.total)) * 100}%` }} />
          </div>
          <span className="muted small">
            Позиция {progress.done} из {progress.total}
          </span>
          <button className="btn" onClick={onStop}>
            Остановить
          </button>
        </div>
      )}

      {n > 0 && <EvalGraph evals={evals} reviews={reviews} viewPly={ply} onSelect={onSelect} />}

      {all.length > 0 && (
        <table className="review-stats">
          <thead>
            <tr>
              <th />
              <th className="cho">Чо</th>
              <th className="han">Хан</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Точность</td>
              {(['w', 'b'] as const).map((c) => {
                const a = accuracy(bySide(c).map((r) => r.loss));
                return <td key={c}>{a === null ? '—' : `${Math.round(a)}%`}</td>;
              })}
            </tr>
            {COUNTED.map((q) => (
              <tr key={q}>
                <td>
                  <span className="q-badge" style={{ background: QUALITY_INFO[q].color }}>
                    {QUALITY_INFO[q].mark}
                  </span>{' '}
                  {QUALITY_INFO[q].ru}
                </td>
                {(['w', 'b'] as const).map((c) => {
                  const list = bySide(c).filter((r) => r.quality === q);
                  return (
                    <td key={c}>
                      {list.length ? (
                        <button className="link" onClick={() => onSelect(list[0].ply)} title="Перейти к первому такому ходу">
                          {list.length}
                        </button>
                      ) : (
                        0
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {sel && (
        <div className="review-move">
          <div>
            <b>
              {Math.ceil(sel.ply / 2)}. {SIDE_NAMES[sel.mover]}: {formatMove(game.history[sel.ply - 1])}
            </b>{' '}
            — <span style={{ color: QUALITY_INFO[sel.quality].color, fontWeight: 600 }}>{QUALITY_INFO[sel.quality].ru}</span>
            {sel.loss >= 1 && <span className="muted"> (−{Math.round(sel.loss)}% шансов)</span>}
          </div>
          <div className="muted small">
            Оценка после хода: {sel.after.terminal ? 'партия окончена' : sel.after.score ? formatScore(scoreForCho(sel.after.score, sel.after.turn)) : '—'}
          </div>
          {betterPlan && (
            <div className="better">
              Лучше было: <b>{betterPlan.moves[0]}</b>
              {betterPlan.reply && <> — ожидаемый ответ {betterPlan.reply}</>}
              <div className="muted small">{betterPlan.text}</div>
              <div className="muted small">Вариант: {betterPlan.moves.join(', ')}</div>
            </div>
          )}
        </div>
      )}
      {!sel && ply > 0 && all.length > 0 && <div className="muted small">Этот ход ещё не оценён.</div>}
      <div className="muted small">Стрелки ← → на клавиатуре листают ходы.</div>
    </div>
  );
}
