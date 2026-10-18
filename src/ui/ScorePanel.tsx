import type { Game } from '../core/game';
import { END_REASON_RU, MOVE_LIMIT_PLIES } from '../core/game';
import { HAN_BONUS, materialPoints, opposite, pointsWinner, type Color } from '../core/rules';
import { PieceIcon, SIDE_KO, SIDE_NAMES, type PieceStyle } from './pieces';

const fmt = (n: number) => n.toLocaleString('ru-RU', { maximumFractionDigits: 1 });

export function ScorePanel({ game, style }: { game: Game; style: PieceStyle }) {
  const board = game.position.board;
  const pts: Record<Color, number> = { w: materialPoints(board, 'w'), b: materialPoints(board, 'b') };
  const leader = pointsWinner(board);
  const diff = Math.abs(pts.w - pts.b);
  const captured = game.captured();
  const result = game.result();
  const share = (pts.w / (pts.w + pts.b)) * 100;

  return (
    <div className="panel score-panel">
      <div className="score-rows">
        {(['w', 'b'] as const).map((c) => (
          <div key={c} className={`score-row ${c === 'w' ? 'cho' : 'han'}${game.turn === c && !result ? ' to-move' : ''}`}>
            <PieceIcon piece={c === 'w' ? 'K' : 'k'} style={style} size={30} />
            <div className="score-name">
              {SIDE_NAMES[c]} <span className="muted">({SIDE_KO[c]})</span>
              {game.turn === c && !result && <span className="turn-badge">ходит</span>}
            </div>
            <div className="score-value" title={c === 'b' ? `включая ${fmt(HAN_BONUS)} очка компенсации (덤)` : undefined}>
              {fmt(pts[c])}
            </div>
          </div>
        ))}
      </div>
      <div className="score-bar" title="Соотношение очков">
        <div className="score-bar-cho" style={{ width: `${share}%` }} />
      </div>
      <div className="score-summary">
        По очкам ведёт <b className={leader === 'w' ? 'cho' : 'han'}>{SIDE_NAMES[leader]}</b> на {fmt(diff)}
        <span className="muted"> (у Хана +1,5 덤)</span>
      </div>

      {result && (
        <div className={`alert game-over ${result.winner === 'w' ? 'cho' : 'han'}`} role="status">
          <b>{result.reason === 'checkmate' ? 'Мат (외통)!' : 'Партия окончена.'}</b> Победа:{' '}
          <b>{SIDE_NAMES[result.winner]}</b>.{result.reason !== 'checkmate' && <> {END_REASON_RU[result.reason]}.</>}
        </div>
      )}
      {!result && game.bikjang && (
        <div className="alert bikjang">
          <b>Биджанг (빅장)!</b> Генералы смотрят друг на друга. {SIDE_NAMES[game.turn]} должен разорвать биджанг
          или пропустить ход — тогда партия закончится подсчётом очков, и победит{' '}
          <b>{SIDE_NAMES[leader]}</b>.
        </div>
      )}
      {!result && game.inCheck() && (
        <div className="alert check">
          <b>Шах (장군)!</b> {SIDE_NAMES[game.turn]} должен защитить генерала.
        </div>
      )}

      <div className="captured">
        {(['w', 'b'] as const).map((c) => (
          <div key={c} className="captured-row">
            <span className="muted">{SIDE_NAMES[c]} взял:</span>
            {captured[c].length === 0 && <span className="muted"> —</span>}
            {captured[c].map((p, i) => (
              <PieceIcon key={i} piece={p} style={style} size={22} />
            ))}
          </div>
        ))}
      </div>
      <div className="muted small">
        Без взятий: {game.position.halfmove} из {MOVE_LIMIT_PLIES} полуходов
        {game.history.length > 0 && game.history[game.history.length - 1].move.from === game.history[game.history.length - 1].move.to && !result && (
          <> · {SIDE_NAMES[opposite(game.turn)]} пропустил ход: второй пропуск подряд закончит партию подсчётом очков</>
        )}
      </div>
    </div>
  );
}
