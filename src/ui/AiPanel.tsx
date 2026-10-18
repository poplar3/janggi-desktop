import type { MoveReview } from '../analysis/evaluator';
import { describePlan } from '../analysis/plan';
import { QUALITY_INFO } from '../analysis/quality';
import type { Game } from '../core/game';
import { formatMove } from '../core/notation';
import { toFen } from '../core/rules';
import { formatScore, scoreForCho, type PvInfo } from '../engine/engine';
import { SIDE_NAMES } from './pieces';

export type EngineStatus = { state: 'loading' } | { state: 'ready'; name: string } | { state: 'error'; message: string };
export const ARROW_COLORS = ['#2f6fd6', '#d97a00', '#7b8794'];
export const REPLY_COLOR = '#8e44ad';

export interface ShownLines {
  fen: string;
  turn: 'w' | 'b';
  lines: PvInfo[];
  kind: 'hint' | 'analysis';
}

interface Props {
  game: Game;
  status: EngineStatus;
  lines: ShownLines | null;
  thinking: 'bot' | 'hint' | 'eval' | null;
  botName?: string;
  analysisOn: boolean;
  evalMovesOn: boolean;
  canHint: boolean;
  lastReview: MoveReview | null;
  onHint: () => void;
  onToggleAnalysis: () => void;
  onToggleEvalMoves: () => void;
  onReview: () => void;
}

export function AiPanel(p: Props) {
  const ready = p.status.state === 'ready';
  const top = p.lines?.lines[0];
  const plan = top && p.lines ? describePlan(p.lines.fen, top.pv) : null;
  const last = p.lastReview;
  return (
    <div className="panel ai-panel">
      <div className="ai-head">
        <b>ИИ-помощник</b>
        <span className="muted small">
          {p.status.state === 'loading' && 'движок загружается…'}
          {p.status.state === 'ready' && p.status.name}
          {p.status.state === 'error' && 'движок недоступен'}
        </span>
      </div>
      {p.status.state === 'error' && <div className="alert check small">{p.status.message}</div>}
      <div className="ai-buttons">
        <button className="btn primary" onClick={p.onHint} disabled={!p.canHint || !ready || p.analysisOn} title="Три лучших хода и ожидаемый ответ соперника">
          Подсказка
        </button>
        <button className={`btn${p.analysisOn ? ' active' : ''}`} onClick={p.onToggleAnalysis} disabled={!ready} title="Непрерывная оценка позиции и лучшие продолжения">
          Анализ: {p.analysisOn ? 'вкл' : 'выкл'}
        </button>
      </div>
      <div className="ai-buttons">
        <button className={`btn${p.evalMovesOn ? ' active' : ''}`} onClick={p.onToggleEvalMoves} disabled={!ready} title="После каждого хода показывать, насколько он хорош">
          Оценка ходов: {p.evalMovesOn ? 'вкл' : 'выкл'}
        </button>
        <button className="btn" onClick={p.onReview} disabled={!ready || p.game.history.length === 0} title="Оценить все ходы партии, найти ошибки и лучшие продолжения">
          Разбор партии
        </button>
      </div>

      {last && (
        <div className="last-move" style={{ borderColor: QUALITY_INFO[last.quality].color }}>
          <span className="q-badge" style={{ background: QUALITY_INFO[last.quality].color }}>
            {QUALITY_INFO[last.quality].mark || '•'}
          </span>{' '}
          {SIDE_NAMES[last.mover]}: {formatMove(p.game.history[last.ply - 1])} — <b>{QUALITY_INFO[last.quality].ru}</b>
          {last.loss >= 1 && <span className="muted"> (−{Math.round(last.loss)}% шансов)</span>}
          {last.quality !== 'best' && last.before.best && (
            <div className="muted small">Лучший ход был: {bestText(p.game, last)}</div>
          )}
        </div>
      )}

      {p.thinking === 'bot' && <div className="muted small">Компьютер думает… ({p.botName})</div>}
      {p.thinking === 'hint' && <div className="muted small">Ищу лучший ход…</div>}
      {p.thinking === 'eval' && <div className="muted small">Оцениваю ход…</div>}

      {p.lines && (
        <>
          <ol className="pv-list">
            {p.lines.lines.slice(0, 3).map((l, i) => (
              <li key={l.multipv}>
                <span className="pv-dot" style={{ background: ARROW_COLORS[i] }} />
                <b>{formatScore(scoreForCho(l.score, p.lines!.turn))}</b>
                <span className="muted"> · глубина {l.depth}</span>
                <div className="pv-text">{describePlan(p.lines!.fen, l.pv, 6).moves.join(', ')}</div>
              </li>
            ))}
          </ol>
          {plan && (
            <div className="plan">
              {plan.reply && (
                <div>
                  <span className="pv-dot" style={{ background: REPLY_COLOR }} />
                  Ожидаемый ответ соперника: <b>{plan.reply}</b>
                </div>
              )}
              <div className="muted small">План: {plan.text}</div>
            </div>
          )}
        </>
      )}
      {!p.lines && !p.thinking && ready && !last && (
        <div className="muted small">
          «Подсказка» покажет три лучших хода стрелками и ожидаемый ответ соперника. «Анализ» постоянно оценивает
          позицию. «Оценка ходов» отмечает ошибки после каждого хода, «Разбор партии» проверяет всю партию.
        </div>
      )}
    </div>
  );
}

function bestText(game: Game, r: MoveReview): string {
  const before = r.ply === 1 ? game.start : game.history[r.ply - 2].pos;
  return describePlan(toFen(before), [r.before.best!], 1).moves[0] ?? r.before.best!;
}
