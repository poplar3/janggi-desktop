import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Evaluator, gameAtPly, makeReview, type MoveReview, type PositionEval } from './analysis/evaluator';
import { cpForCho, winPercent } from './analysis/quality';
import { END_REASON_RU, Game } from './core/game';
import { findGeneral, isPass, opposite, startFenWithSetups, uciToMove, type Move } from './core/rules';
import { BOT_LEVELS, formatScore, getEngine } from './engine/engine';
import { loadConfig, loadPrefs, saveConfig, savePrefs, type GameConfig } from './settings';
import { AiPanel, ARROW_COLORS, REPLY_COLOR, type EngineStatus, type ShownLines } from './ui/AiPanel';
import { Board, type Arrow } from './ui/Board';
import { Modal } from './ui/Modal';
import { MoveList } from './ui/MoveList';
import { NewGameDialog } from './ui/NewGameDialog';
import { ReviewPanel } from './ui/ReviewPanel';
import { RulesDialog } from './ui/RulesDialog';
import { ScorePanel } from './ui/ScorePanel';
import { SIDE_NAMES } from './ui/pieces';
import './App.css';

/** Время на оценку одной позиции при «Оценке ходов» во время игры. */
const LIVE_EVAL_MS = 500;

function newGame(c: GameConfig) {
  return new Game(startFenWithSetups(c.choSetup, c.hanSetup));
}

export default function App() {
  const [config, setConfig] = useState<GameConfig>(loadConfig);
  const [prefs, setPrefs] = useState(loadPrefs);
  const gameRef = useRef<Game>(newGame(config));
  const [version, setVersion] = useState(0);
  const bump = () => setVersion((v) => v + 1);
  const game = gameRef.current;

  const [selected, setSelected] = useState<number | null>(null);
  const [flipped, setFlipped] = useState(config.mode === 'bot' && config.humanColor === 'b');
  const [showNewGame, setShowNewGame] = useState(true);
  const [showRules, setShowRules] = useState(false);
  const [resultClosed, setResultClosed] = useState(false);

  const [engineStatus, setEngineStatus] = useState<EngineStatus>({ state: 'loading' });
  const [analysisOn, setAnalysisOn] = useState(false);
  const [lines, setLines] = useState<ShownLines | null>(null);
  const [thinking, setThinking] = useState<'bot' | 'hint' | 'eval' | null>(null);
  const token = useRef(0);

  // Разбор и оценка ходов
  const [reviews, setReviews] = useState<Record<number, MoveReview>>({});
  const reviewsRef = useRef(reviews);
  reviewsRef.current = reviews;
  const [viewPly, setViewPly] = useState<number | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewProgress, setReviewProgress] = useState<{ done: number; total: number } | null>(null);
  const reviewing = reviewProgress !== null;

  const engine = getEngine();
  const evaluator = useMemo(() => new Evaluator(engine), [engine]);
  const result = game.result();
  const botTurn = config.mode === 'bot' && game.turn !== config.humanColor && !result;
  const viewing = viewPly !== null && viewPly !== game.history.length;
  const humanCanMove = !result && !botTurn && !viewing && !reviewing;

  useEffect(() => {
    engine
      .init()
      .then(() => setEngineStatus({ state: 'ready', name: engine.name }))
      .catch((e: Error) => setEngineStatus({ state: 'error', message: e.message }));
  }, [engine]);

  // Оценка последнего хода, ход бота и непрерывный анализ — строго по очереди.
  useEffect(() => {
    // Во время разбора движок занят им; токен не трогаем, чтобы не прервать разбор.
    if (reviewing) return;
    const my = ++token.current;
    engine.stop();
    setLines(null);
    if (engineStatus.state !== 'ready' || showNewGame) {
      setThinking(null);
      return;
    }
    const g = gameRef.current;
    const n = g.history.length;
    void (async () => {
      if (prefs.evalMoves && n > 0 && !reviewsRef.current[n]) {
        setThinking('eval');
        const r = await evaluator.reviewMove(g, n, LIVE_EVAL_MS);
        if (my !== token.current) return;
        if (r) setReviews((prev) => ({ ...prev, [n]: r }));
      }
      if (g.result()) {
        setThinking(null);
        return;
      }
      const fen = g.startFen;
      const moves = g.uciMoves;
      const posFen = g.fen;
      const turn = g.turn;
      if (config.mode === 'bot' && g.turn !== config.humanColor) {
        const level = BOT_LEVELS.find((l) => l.id === config.level) ?? BOT_LEVELS[0];
        setThinking('bot');
        const startedAt = Date.now();
        const r = await engine.search({ fen, moves, movetime: level.movetime, elo: level.elo, skill: level.skill });
        if (my !== token.current || !r.bestmove) return;
        // Небольшая пауза, чтобы ход бота был заметен
        await new Promise((res) => setTimeout(res, Math.max(0, 350 - (Date.now() - startedAt))));
        if (my !== token.current) return;
        try {
          g.playUci(r.bestmove);
        } catch (e) {
          console.error(e);
        }
        setThinking(null);
        setViewPly(null);
        bump();
      } else if (analysisOn) {
        setThinking(null);
        void engine.search({
          fen,
          moves,
          infinite: true,
          multipv: 3,
          onInfo: (ls) => my === token.current && setLines({ fen: posFen, turn, lines: ls, kind: 'analysis' }),
        });
      } else {
        setThinking(null);
      }
    })();
    return () => {
      // Если управление уже перехватил другой поиск (подсказка, разбор), не мешаем ему.
      if (token.current === my) engine.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, analysisOn, prefs.evalMoves, engineStatus.state, showNewGame, config, reviewing]);

  const requestHint = useCallback(() => {
    if (!humanCanMove || engineStatus.state !== 'ready') return;
    const my = ++token.current;
    engine.stop();
    const g = gameRef.current;
    const posFen = g.fen;
    const turn = g.turn;
    setThinking('hint');
    void engine
      .search({
        fen: g.startFen,
        moves: g.uciMoves,
        movetime: 2000,
        multipv: 3,
        onInfo: (ls) => my === token.current && setLines({ fen: posFen, turn, lines: ls, kind: 'hint' }),
      })
      .then((r) => {
        if (my !== token.current) return;
        setLines({ fen: posFen, turn, lines: r.lines, kind: 'hint' });
        setThinking(null);
      });
  }, [engine, engineStatus.state, humanCanMove]);

  const startReview = async (movetime: number) => {
    const my = ++token.current;
    engine.stop();
    setThinking(null);
    const g = gameRef.current;
    const n = g.history.length;
    setReviewProgress({ done: 0, total: n + 1 });
    let prev: PositionEval | null = null;
    for (let ply = 0; ply <= n; ply++) {
      const ev = await evaluator.evaluate(g, ply, movetime);
      if (my !== token.current) return;
      if (!ev) break;
      if (prev) {
        const r = makeReview(g, ply, prev, ev);
        setReviews((x) => ({ ...x, [ply]: r }));
      }
      prev = ev;
      setReviewProgress({ done: ply + 1, total: n + 1 });
    }
    setReviewProgress(null);
  };

  const stopReview = () => {
    token.current++;
    engine.stop();
    setReviewProgress(null);
  };

  const play = (m: Move) => {
    if (!game.isLegal(m)) return;
    game.play(m);
    setSelected(null);
    setViewPly(null);
    bump();
  };

  const onSquareClick = (s: number) => {
    if (viewing) {
      setViewPly(null);
      return;
    }
    if (!humanCanMove) return;
    const p = game.position.board[s];
    if (selected !== null) {
      const m = game.legalMoves().find((x) => x.from === selected && x.to === s && !isPass(x));
      if (m) return play(m);
    }
    if (p && (p === p.toUpperCase() ? 'w' : 'b') === game.turn) setSelected(s === selected ? null : s);
    else setSelected(null);
  };

  const pass = () => {
    const g = findGeneral(game.position.board, game.turn);
    play({ from: g, to: g });
  };

  const dropReviewsAfter = (n: number) =>
    setReviews((x) => Object.fromEntries(Object.entries(x).filter(([k]) => Number(k) <= n)));

  const undo = () => {
    token.current++;
    engine.stop();
    setReviewProgress(null);
    if (config.mode === 'bot') {
      game.undo();
      while (game.history.length && game.turn !== config.humanColor) game.undo();
    } else game.undo();
    dropReviewsAfter(game.history.length);
    setSelected(null);
    setViewPly(null);
    setResultClosed(false);
    bump();
  };

  const startGame = (c: GameConfig) => {
    token.current++;
    engine.stop();
    saveConfig(c);
    setConfig(c);
    gameRef.current = newGame(c);
    setFlipped(c.mode === 'bot' && c.humanColor === 'b');
    setSelected(null);
    setShowNewGame(false);
    setResultClosed(false);
    setLines(null);
    setReviews({});
    setViewPly(null);
    setReviewOpen(false);
    setReviewProgress(null);
    bump();
  };

  const resign = () => {
    if (result) return;
    const loser = config.mode === 'bot' ? config.humanColor : game.turn;
    game.resign(loser);
    token.current++;
    engine.stop();
    bump();
  };

  const openReview = () => {
    setReviewOpen(true);
    setResultClosed(true);
    if (viewPly === null) setViewPly(game.history.length);
  };

  const togglePrefs = (k: 'evalMoves') => {
    const p = { ...prefs, [k]: !prefs[k] };
    setPrefs(p);
    savePrefs(p);
  };

  // Листание ходов стрелками
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (showNewGame || showRules) return;
      const n = gameRef.current.history.length;
      const cur = viewPly ?? n;
      if (e.key === 'ArrowLeft') setViewPly(Math.max(0, cur - 1));
      else if (e.key === 'ArrowRight') setViewPly(cur + 1 >= n ? null : cur + 1);
      else if (e.key === 'Home') setViewPly(0);
      else if (e.key === 'End') setViewPly(null);
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [viewPly, showNewGame, showRules]);

  // ---------- Что показать на доске ----------
  const n = game.history.length;
  const shownPly = viewPly ?? n;
  const shownGame = viewing ? gameAtPly(game, shownPly) : game;
  const shownEntry = shownPly > 0 ? game.history[shownPly - 1] : null;
  const targets = selected !== null && !viewing ? game.legalMoves().filter((m) => m.from === selected) : [];
  const shownResult = shownGame.result();
  const checkSquare = !shownResult && shownGame.inCheck() ? findGeneral(shownGame.position.board, shownGame.turn) : null;
  const canPass = humanCanMove && game.legalMoves().some(isPass);

  const shownLines = !viewing && lines && lines.fen === game.fen ? lines : null;
  let arrows: Arrow[] = [];
  if (shownLines) {
    arrows = shownLines.lines
      .filter((l) => l.pv.length)
      .slice(0, 3)
      .map((l, i) => {
        const m = uciToMove(l.pv[0]);
        return { from: m.from, to: m.to, color: ARROW_COLORS[i], label: String(i + 1), main: i === 0 };
      })
      .reverse();
    const reply = shownLines.lines[0]?.pv[1];
    if (reply) {
      const m = uciToMove(reply);
      arrows.unshift({ from: m.from, to: m.to, color: REPLY_COLOR, dashed: true });
    }
  } else if ((viewing || reviewOpen) && shownPly > 0) {
    const r = reviews[shownPly];
    if (r && r.quality !== 'best' && r.before.best) {
      const m = uciToMove(r.before.best);
      arrows = [{ from: m.from, to: m.to, color: '#1f8a4c', label: 'лучше', main: true }];
    }
  }

  // Шкала оценки: просматриваемая позиция или текущий анализ
  let barCp: number | null = null;
  if (shownLines?.lines[0]) barCp = cpForCho(shownLines.lines[0].score, shownLines.turn);
  else barCp = evaluator.cached(game, shownPly)?.cpCho ?? null;

  const evals = Array.from({ length: n + 1 }, (_, i) => evaluator.cached(game, i)?.cpCho);
  const lastReview = !viewing && n > 0 ? (reviews[n] ?? null) : null;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">將</span> Чанги <span className="muted">корейские шахматы</span>
        </div>
        <nav>
          <button className="btn" onClick={() => setShowNewGame(true)}>
            Новая партия
          </button>
          <button className="btn" onClick={() => setShowRules(true)}>
            Правила
          </button>
          <button className="btn" disabled title="Появится в следующей версии">
            Задачи
          </button>
          <button className="btn" disabled title="Появится в следующей версии">
            Обучение
          </button>
        </nav>
      </header>

      <main className="layout">
        <div className="board-area">
          <div
            className={`eval-bar${barCp === null ? ' empty' : ''}`}
            title={barCp === null ? 'Включите анализ или оценку ходов' : formatScore({ cp: barCp })}
          >
            <div className="eval-han" style={{ height: `${100 - (barCp === null ? 50 : winPercent(barCp))}%` }} />
          </div>
          <div className="board-column">
            {viewing && (
              <div className="view-banner">
                Просмотр: {shownPly === 0 ? 'начальная позиция' : `после ${shownPly}-го полухода`}
                <button className="btn small-btn" onClick={() => setViewPly(null)}>
                  К текущей позиции
                </button>
              </div>
            )}
            <div className="board-wrap">
              <Board
                board={shownGame.position.board}
                style={config.pieceStyle}
                flipped={flipped}
                selected={viewing ? null : selected}
                targets={targets}
                lastMove={shownEntry ? shownEntry.move : null}
                checkSquare={checkSquare}
                arrows={arrows}
                onSquareClick={onSquareClick}
              />
            </div>
          </div>
        </div>

        <aside className="side">
          <ScorePanel game={shownGame} style={config.pieceStyle} />

          <div className="panel controls">
            <button className="btn" onClick={pass} disabled={!canPass} title="Пропустить ход (нельзя под шахом)">
              Пропустить ход
            </button>
            <button className="btn" onClick={undo} disabled={n === 0}>
              Отменить ход
            </button>
            <button className="btn" onClick={() => setFlipped((f) => !f)}>
              Перевернуть доску
            </button>
            <button className="btn danger" onClick={resign} disabled={!!result}>
              Сдаться
            </button>
          </div>

          {reviewOpen ? (
            <ReviewPanel
              game={game}
              reviews={reviews}
              evals={evals}
              viewPly={shownPly}
              progress={reviewProgress}
              onSelect={(p) => setViewPly(p >= n ? null : p)}
              onStart={(ms) => void startReview(ms)}
              onStop={stopReview}
              onClose={() => {
                stopReview();
                setReviewOpen(false);
                setViewPly(null);
              }}
            />
          ) : (
            <AiPanel
              game={game}
              status={engineStatus}
              lines={shownLines}
              thinking={thinking}
              botName={BOT_LEVELS.find((l) => l.id === config.level)?.name}
              analysisOn={analysisOn}
              evalMovesOn={prefs.evalMoves}
              canHint={humanCanMove}
              lastReview={lastReview}
              onHint={requestHint}
              onToggleAnalysis={() => setAnalysisOn((a) => !a)}
              onToggleEvalMoves={() => togglePrefs('evalMoves')}
              onReview={openReview}
            />
          )}

          <div className="panel moves-panel">
            <b>Ходы</b>
            <MoveList game={game} reviews={reviews} viewPly={viewPly} onSelect={(p) => setViewPly(p >= n ? null : p)} />
          </div>
        </aside>
      </main>

      {showNewGame && (
        <NewGameDialog initial={config} onStart={startGame} onClose={n || version > 0 ? () => setShowNewGame(false) : undefined} />
      )}
      {showRules && <RulesDialog style={config.pieceStyle} onClose={() => setShowRules(false)} />}
      {result && !resultClosed && (
        <Modal
          title="Партия окончена"
          onClose={() => setResultClosed(true)}
          footer={
            <>
              <button className="btn" onClick={() => setResultClosed(true)}>
                Посмотреть доску
              </button>
              <button className="btn" onClick={openReview} disabled={engineStatus.state !== 'ready'}>
                Разбор партии
              </button>
              <button className="btn primary" onClick={() => setShowNewGame(true)}>
                Новая партия
              </button>
            </>
          }
        >
          <p className="result-line">
            Победа: <b className={result.winner === 'w' ? 'cho' : 'han'}>{SIDE_NAMES[result.winner]}</b>
            {result.reason === 'resign' && ` — ${SIDE_NAMES[opposite(result.winner)]} сдался`}
          </p>
          <p>{END_REASON_RU[result.reason]}</p>
          {config.mode === 'bot' && (
            <p className="muted">
              {result.winner === config.humanColor ? 'Поздравляем!' : 'Попробуйте ещё раз или выберите уровень полегче.'}
            </p>
          )}
        </Modal>
      )}
    </div>
  );
}
