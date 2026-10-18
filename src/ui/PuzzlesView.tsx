import { useEffect, useMemo, useRef, useState } from 'react';
import { Game } from '../core/game';
import { formatMove } from '../core/notation';
import { findGeneral, isPass, moveToUci, squareName, typeOf, uciToMove, type Move } from '../core/rules';
import { allPuzzles, CONCEPTS, LEVELS, loadSolved, saveSolved, type ConceptId, type Puzzle } from '../puzzles';
import { Board, type Arrow } from './Board';
import { PIECE_NAMES, SIDE_NAMES, type PieceStyle } from './pieces';

interface Props {
  style: PieceStyle;
  /** Начать обычную партию с компьютером из этой позиции. */
  onPlayFrom: (fen: string, human: 'w' | 'b') => void;
}

type Status = 'play' | 'wrong' | 'reply' | 'solved' | 'shown' | 'free';

export function PuzzlesView({ style, onPlayFrom }: Props) {
  const puzzles = useMemo(() => allPuzzles(), []);
  const [solved, setSolved] = useState(loadSolved);
  const [current, setCurrent] = useState<Puzzle | null>(null);
  const [level, setLevel] = useState<number | null>(null);
  const [concept, setConcept] = useState<ConceptId | ''>('');

  const markSolved = (id: string, clean: boolean) => {
    setSolved((s) => {
      const next = { ...s, [id]: { clean: clean || !!s[id]?.clean } };
      saveSolved(next);
      return next;
    });
  };

  if (current) {
    const idx = puzzles.indexOf(current);
    const next = puzzles.slice(idx + 1).find((p) => !solved[p.id]) ?? puzzles[idx + 1] ?? null;
    return (
      <PuzzleSolver
        key={current.id}
        puzzle={current}
        number={idx + 1}
        style={style}
        onSolved={(clean) => markSolved(current.id, clean)}
        onBack={() => setCurrent(null)}
        onNext={next ? () => setCurrent(next) : undefined}
        onPlayFrom={onPlayFrom}
      />
    );
  }

  const usedConcepts = (Object.keys(CONCEPTS) as ConceptId[]).filter((c) => puzzles.some((p) => p.concepts.includes(c)));
  const list = puzzles.filter((p) => (level === null || p.level.n === level) && (!concept || p.concepts.includes(concept)));
  const solvedCount = puzzles.filter((p) => solved[p.id]).length;

  return (
    <div className="puzzles">
      <div className="puzzles-head">
        <div>
          <h2>Задачи</h2>
          <div className="muted">
            Решено {solvedCount} из {puzzles.length}. Задачи упорядочены от простых к сложным; уровни соответствуют
            корейским любительским разрядам.
          </div>
        </div>
        <div className="puzzle-filters">
          <div className="segmented level-filter">
            <button className={level === null ? 'active' : ''} onClick={() => setLevel(null)}>
              Все
            </button>
            {LEVELS.map((l) => (
              <button key={l.n} className={level === l.n ? 'active' : ''} onClick={() => setLevel(l.n)} title={l.rank}>
                {l.ru}
              </button>
            ))}
          </div>
          <select value={concept} onChange={(e) => setConcept(e.target.value as ConceptId | '')} aria-label="Приём">
            <option value="">Все приёмы</option>
            {usedConcepts.map((c) => (
              <option key={c} value={c}>
                {CONCEPTS[c].ru}
              </option>
            ))}
          </select>
        </div>
      </div>
      {concept && <div className="panel concept-about"><b>{CONCEPTS[concept].ru}.</b> {CONCEPTS[concept].about}</div>}
      <div className="puzzle-grid">
        {list.map((p) => (
          <button key={p.id} className={`puzzle-card${solved[p.id] ? ' solved' : ''}`} onClick={() => setCurrent(p)}>
            <span className="puzzle-num">№ {puzzles.indexOf(p) + 1}</span>
            {solved[p.id] && <span className="puzzle-done" title={solved[p.id].clean ? 'Решена с первой попытки' : 'Решена'}>{solved[p.id].clean ? '★' : '✓'}</span>}
            <b>{p.title}</b>
            <span className={`lvl lvl-${p.level.n}`}>{p.level.ru}</span>
            <span className="muted small">{p.concepts.map((c) => CONCEPTS[c].ru).join(', ')}</span>
            <span className="muted small">Ход {p.solver === 'w' ? 'Чо' : 'Хана'}</span>
          </button>
        ))}
        {list.length === 0 && <div className="muted">Нет задач с такими условиями.</div>}
      </div>
    </div>
  );
}

interface SolverProps {
  puzzle: Puzzle;
  number: number;
  style: PieceStyle;
  onSolved: (clean: boolean) => void;
  onBack: () => void;
  onNext?: () => void;
  onPlayFrom: (fen: string, human: 'w' | 'b') => void;
}

function PuzzleSolver({ puzzle, number, style, onSolved, onBack, onNext, onPlayFrom }: SolverProps) {
  // Партия мутируется на месте; bump() перерисовывает, setGame() подменяет её целиком.
  const [game, setGame] = useState(() => new Game(puzzle.fen));
  const [, setVersion] = useState(0);
  const bump = () => setVersion((v) => v + 1);
  const [status, setStatus] = useState<Status>('play');
  const [selected, setSelected] = useState<number | null>(null);
  const [hintLevel, setHintLevel] = useState(0);
  const [errors, setErrors] = useState(0);
  const [usedHelp, setUsedHelp] = useState(false);
  const [wrongMove, setWrongMove] = useState<Move | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const later = (ms: number, f: () => void) => timers.current.push(setTimeout(f, ms));
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  // В режиме решения номер следующего ожидаемого хода — это длина истории.
  const step = status === 'free' ? -1 : game.history.length;
  const solving = status === 'play' || status === 'wrong';

  const reset = () => {
    timers.current.forEach(clearTimeout);
    setGame(new Game(puzzle.fen));
    setStatus('play');
    setSelected(null);
    setHintLevel(0);
    setWrongMove(null);
    bump();
  };

  const tryMove = (m: Move) => {
    const g = game;
    if (status === 'free') {
      g.play(m);
      setSelected(null);
      bump();
      return;
    }
    const expected = puzzle.line[step];
    let ok = moveToUci(m) === expected;
    // На последнем ходу засчитывается любой мат.
    if (!ok && puzzle.goal === 'mate' && step === puzzle.line.length - 1) {
      const probe = new Game(puzzle.fen);
      for (const u of g.uciMoves) probe.playUci(u);
      probe.play(m);
      ok = probe.result()?.reason === 'checkmate';
    }
    setSelected(null);
    if (!ok) {
      setErrors((e) => e + 1);
      setWrongMove(m);
      setStatus('wrong');
      return;
    }
    setWrongMove(null);
    g.play(m);
    setHintLevel(0);
    if (step + 1 >= puzzle.line.length) {
      setStatus('solved');
      onSolved(errors === 0 && !usedHelp);
    } else {
      setStatus('reply');
      later(550, () => {
        g.playUci(puzzle.line[step + 1]);
        setStatus('play');
        bump();
      });
    }
    bump();
  };

  const onSquareClick = (s: number) => {
    if (!(solving || status === 'free')) return;
    const p = game.position.board[s];
    if (selected !== null) {
      const m = game.legalMoves().find((x) => x.from === selected && x.to === s && !isPass(x));
      if (m) return tryMove(m);
    }
    if (p && (p === p.toUpperCase() ? 'w' : 'b') === game.turn) setSelected(s === selected ? null : s);
    else setSelected(null);
  };

  const showSolution = () => {
    timers.current.forEach(clearTimeout);
    const g = new Game(puzzle.fen);
    setGame(g);
    setStatus('shown');
    setUsedHelp(true);
    setSelected(null);
    setWrongMove(null);
    bump();
    puzzle.line.forEach((u, i) =>
      later(700 * (i + 1), () => {
        g.playUci(u);
        bump();
      }),
    );
  };

  /** Свободная игра: с текущей позиции, а если партия уже закончилась — с позиции задачи. */
  const startFree = () => {
    if (game.result()) setGame(new Game(puzzle.fen));
    setSelected(null);
    setStatus('free');
    bump();
  };

  const hint = () => {
    setUsedHelp(true);
    setHintLevel((h) => Math.min(h + 1, 3));
  };

  // Подсказки: для первого хода — приём, фигура, ход; для следующих — фигура и ход.
  const expectedUci = step >= 0 ? puzzle.line[step] : undefined;
  const expectedMove = expectedUci ? uciToMove(expectedUci) : null;
  const hintTexts: string[] = [];
  if (expectedMove && solving) {
    if (step === 0) hintTexts.push(...puzzle.hints.slice(0, hintLevel));
    else {
      const piece = game.position.board[expectedMove.from]!;
      const probe = new Game(game.fen);
      const h = probe.play(expectedMove);
      if (hintLevel >= 1) hintTexts.push(`Ходит ${PIECE_NAMES[typeOf(piece)].ru.toLowerCase()} с ${squareName(expectedMove.from)}.`);
      if (hintLevel >= 2) hintTexts.push(`Ход: ${formatMove(h)}.`);
    }
  }
  const maxHints = step === 0 ? 3 : 2;
  const hintSquare = solving && expectedMove && (step === 0 ? hintLevel >= 2 : hintLevel >= 1) ? expectedMove.from : null;
  const arrows: Arrow[] =
    solving && expectedMove && hintLevel >= maxHints ? [{ from: expectedMove.from, to: expectedMove.to, color: '#1f8a4c', main: true }] : [];
  if (wrongMove && status === 'wrong') arrows.push({ from: wrongMove.from, to: wrongMove.to, color: '#7b8794', dashed: true });

  const last = game.history[game.history.length - 1];
  const result = game.result();
  const checkSquare = (!result || result.reason === 'checkmate') && game.inCheck() ? findGeneral(game.position.board, game.turn) : null;
  const targets = selected !== null ? game.legalMoves().filter((m) => m.from === selected) : [];
  const done = status === 'solved' || status === 'shown' || status === 'free';
  const animating = status === 'shown' && game.history.length < puzzle.line.length;

  return (
    <main className="layout">
      <div className="board-area">
        <div className="board-column">
          <div className="board-wrap">
            <Board
              board={game.position.board}
              style={style}
              flipped={puzzle.solver === 'b'}
              selected={selected ?? hintSquare}
              targets={targets}
              lastMove={last ? last.move : null}
              checkSquare={checkSquare}
              arrows={arrows}
              onSquareClick={onSquareClick}
            />
          </div>
        </div>
      </div>
      <aside className="side">
        <div className="panel puzzle-panel">
          <div className="ai-head">
            <b>
              Задача № {number}: {puzzle.title}
            </b>
            <button className="btn small-btn" onClick={onBack}>
              К списку
            </button>
          </div>
          <div className="puzzle-meta">
            <span className={`lvl lvl-${puzzle.level.n}`} title={puzzle.level.rank}>
              {puzzle.level.ru} · {puzzle.level.rank}
            </span>
          </div>
          <p className="puzzle-desc">{puzzle.description}</p>
          <div className="concept-chips">
            {puzzle.concepts.map((c) => (
              <span key={c} className="chip" title={CONCEPTS[c].about}>
                {CONCEPTS[c].ru}
              </span>
            ))}
          </div>

          {status === 'play' && <div className="puzzle-status">Ваш ход: вы играете за {puzzle.solver === 'w' ? 'Чо' : 'Хана'}.</div>}
          {status === 'wrong' && <div className="alert check">Не тот ход. Попробуйте ещё раз или возьмите подсказку.</div>}
          {status === 'reply' && <div className="puzzle-status">Верно! Соперник отвечает…</div>}
          {status === 'solved' && (
            <div className="alert game-over">
              <b>Задача решена!</b> {errors === 0 && !usedHelp ? 'С первой попытки и без подсказок.' : ''}
            </div>
          )}
          {status === 'shown' && <div className="puzzle-status">{animating ? 'Показываю решение…' : 'Решение показано.'}</div>}
          {status === 'free' && (
            <div className="puzzle-status">
              Свободная игра: ходите за обе стороны как угодно. {result && <b>Партия окончена: победа {SIDE_NAMES[result.winner]}.</b>}
            </div>
          )}

          {hintTexts.length > 0 && (
            <ul className="hint-list">
              {hintTexts.map((t, i) => (
                <li key={i}>{t}</li>
              ))}
            </ul>
          )}

          <div className="ai-buttons">
            {solving && (
              <>
                <button className="btn primary" onClick={hint} disabled={hintLevel >= maxHints}>
                  Подсказка {hintLevel > 0 ? `(${hintLevel}/${maxHints})` : ''}
                </button>
                <button className="btn" onClick={showSolution}>
                  Показать решение
                </button>
              </>
            )}
            {(done || status === 'wrong') && (
              <button className="btn" onClick={reset}>
                Заново
              </button>
            )}
            {done && !animating && status !== 'free' && (
              <button
                className="btn"
                onClick={startFree}
                title={result ? 'Партия окончена — свободная игра начнётся с позиции задачи' : 'Продолжить с этой позиции без проверки ходов'}
              >
                Свободная игра
              </button>
            )}
            {status === 'free' && (
              <button
                className="btn"
                onClick={() => {
                  game.undo();
                  bump();
                }}
                disabled={game.history.length === 0}
              >
                Отменить ход
              </button>
            )}
            {done && !animating && (
              <button
                className="btn"
                onClick={() => (result ? onPlayFrom(puzzle.fen, puzzle.solver) : onPlayFrom(game.fen, game.turn))}
                title={result ? 'Обычная партия с компьютером с позиции задачи' : 'Обычная партия с компьютером из текущей позиции'}
              >
                Играть с компьютером
              </button>
            )}
            {onNext && done && !animating && (
              <button className="btn primary" onClick={onNext}>
                Следующая задача
              </button>
            )}
          </div>

          {done && !animating && (
            <div className="puzzle-solution">
              <div>
                <b>Решение:</b> {puzzle.solution.join(', ')}
              </div>
              <p>{puzzle.explanation}</p>
              {puzzle.concepts.map((c) => (
                <p key={c} className="small">
                  <b>{CONCEPTS[c].ru}{CONCEPTS[c].ko ? ` (${CONCEPTS[c].ko})` : ''}.</b> {CONCEPTS[c].about}
                </p>
              ))}
            </div>
          )}
          {puzzle.source && (
            <div className="muted small puzzle-source">
              Источник: {puzzle.source.author}
              {puzzle.source.title ? `. ${puzzle.source.title}` : ''}
            </div>
          )}
        </div>
        {status === 'free' && (
          <div className="panel controls">
            <button
              className="btn"
              onClick={() => {
                const g = findGeneral(game.position.board, game.turn);
                const m = { from: g, to: g };
                if (game.isLegal(m)) tryMove(m);
              }}
              disabled={!!result || !game.legalMoves().some(isPass)}
            >
              Пропустить ход
            </button>
          </div>
        )}
      </aside>
    </main>
  );
}
