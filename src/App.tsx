import { useCallback, useEffect, useRef, useState } from 'react';
import { END_REASON_RU, Game } from './core/game';
import { formatMove } from './core/notation';
import { findGeneral, isPass, opposite, startFenWithSetups, uciToMove, type Move } from './core/rules';
import { BOT_LEVELS, formatScore, getEngine, scoreForCho, type PvInfo, type Score } from './engine/engine';
import { loadConfig, saveConfig, type GameConfig } from './settings';
import { Board, type Arrow } from './ui/Board';
import { NewGameDialog } from './ui/NewGameDialog';
import { RulesDialog } from './ui/RulesDialog';
import { ScorePanel } from './ui/ScorePanel';
import { Modal } from './ui/Modal';
import { SIDE_NAMES } from './ui/pieces';
import './App.css';

type EngineStatus = { state: 'loading' } | { state: 'ready'; name: string } | { state: 'error'; message: string };

const ARROW_COLORS = ['#2f6fd6', '#d97a00', '#7b8794'];

function newGame(c: GameConfig) {
  return new Game(startFenWithSetups(c.choSetup, c.hanSetup));
}

/** Перевод главной линии в русскую запись. */
function pvToText(fen: string, pv: string[], max = 6): string {
  const g = new Game(fen);
  const out: string[] = [];
  for (const uci of pv.slice(0, max)) {
    try {
      out.push(formatMove(g.playUci(uci)));
    } catch {
      break;
    }
  }
  return out.join(', ');
}

/** Доля перевеса Чо для шкалы оценки, 0…1. */
function evalShare(s: Score): number {
  if (s.mate !== undefined) return s.mate > 0 ? 1 : 0;
  return 1 / (1 + Math.exp(-(s.cp ?? 0) / 400));
}

export default function App() {
  const [config, setConfig] = useState<GameConfig>(loadConfig);
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
  const [lines, setLines] = useState<{ fen: string; turn: 'w' | 'b'; lines: PvInfo[]; kind: 'hint' | 'analysis' } | null>(null);
  const [thinking, setThinking] = useState<'bot' | 'hint' | null>(null);
  const token = useRef(0);

  const engine = getEngine();
  const result = game.result();
  const botTurn = config.mode === 'bot' && game.turn !== config.humanColor && !result;
  const humanCanMove = !result && !botTurn;

  useEffect(() => {
    engine
      .init()
      .then(() => setEngineStatus({ state: 'ready', name: engine.name }))
      .catch((e: Error) => setEngineStatus({ state: 'error', message: e.message }));
  }, [engine]);

  // Ход бота и непрерывный анализ.
  useEffect(() => {
    const my = ++token.current;
    engine.stop();
    setLines(null);
    if (result || engineStatus.state !== 'ready' || showNewGame) {
      setThinking(null);
      return;
    }
    const g = gameRef.current;
    const fen = g.startFen;
    const moves = g.uciMoves;
    const posFen = g.fen;
    const turn = g.turn;
    if (botTurn) {
      const level = BOT_LEVELS.find((l) => l.id === config.level) ?? BOT_LEVELS[0];
      setThinking('bot');
      const startedAt = Date.now();
      engine.search({ fen, moves, movetime: level.movetime, elo: level.elo, skill: level.skill }).then((r) => {
        if (my !== token.current || !r.bestmove) return;
        // Небольшая пауза, чтобы ход бота был заметен
        const delay = Math.max(0, 350 - (Date.now() - startedAt));
        setTimeout(() => {
          if (my !== token.current) return;
          try {
            g.playUci(r.bestmove!);
          } catch (e) {
            console.error(e);
          }
          setThinking(null);
          bump();
        }, delay);
      });
    } else if (analysisOn) {
      setThinking(null);
      engine.search({
        fen,
        moves,
        infinite: true,
        multipv: 3,
        onInfo: (ls) => my === token.current && setLines({ fen: posFen, turn, lines: ls, kind: 'analysis' }),
      });
    } else {
      setThinking(null);
    }
    return () => {
      engine.stop();
    };
  }, [version, analysisOn, engineStatus.state, showNewGame, config]);

  const requestHint = useCallback(() => {
    if (!humanCanMove || engineStatus.state !== 'ready') return;
    const my = ++token.current;
    engine.stop();
    const g = gameRef.current;
    const posFen = g.fen;
    const turn = g.turn;
    setThinking('hint');
    engine
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

  const play = (m: Move) => {
    if (!game.isLegal(m)) return;
    game.play(m);
    setSelected(null);
    bump();
  };

  const onSquareClick = (s: number) => {
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

  const undo = () => {
    token.current++;
    engine.stop();
    if (config.mode === 'bot') {
      game.undo();
      while (game.history.length && game.turn !== config.humanColor) game.undo();
    } else game.undo();
    setSelected(null);
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

  const targets = selected !== null ? game.legalMoves().filter((m) => m.from === selected) : [];
  const last = game.history[game.history.length - 1];
  const checkSquare = !result && game.inCheck() ? findGeneral(game.position.board, game.turn) : null;
  const canPass = humanCanMove && game.legalMoves().some(isPass);

  const shownLines = lines && lines.fen === game.fen ? lines : null;
  const arrows: Arrow[] =
    shownLines?.lines
      .filter((l) => l.pv.length)
      .slice(0, 3)
      .map((l, i) => {
        const m = uciToMove(l.pv[0]);
        return { from: m.from, to: m.to, color: ARROW_COLORS[i], label: String(i + 1) };
      })
      .reverse() ?? [];
  const mainScore = shownLines?.lines[0] ? scoreForCho(shownLines.lines[0].score, shownLines.turn) : null;

  const movePairs: { n: number; w?: string; b?: string; wi?: number; bi?: number }[] = [];
  const firstTurn = game.start.turn;
  game.history.forEach((h, i) => {
    const color = firstTurn === 'w' ? (i % 2 === 0 ? 'w' : 'b') : i % 2 === 0 ? 'b' : 'w';
    const idx = firstTurn === 'w' ? Math.floor(i / 2) : Math.floor((i + 1) / 2);
    if (!movePairs[idx]) movePairs[idx] = { n: idx + 1 };
    movePairs[idx][color] = formatMove(h);
    movePairs[idx][color === 'w' ? 'wi' : 'bi'] = i;
  });

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
          <div className={`eval-bar${mainScore ? '' : ' empty'}`} title={mainScore ? formatScore(mainScore) : 'Включите анализ или запросите подсказку'}>
            <div className="eval-han" style={{ height: `${(1 - (mainScore ? evalShare(mainScore) : 0.5)) * 100}%` }} />
          </div>
          <div className="board-wrap">
            <Board
              board={game.position.board}
              style={config.pieceStyle}
              flipped={flipped}
              selected={selected}
              targets={targets}
              lastMove={last ? last.move : null}
              checkSquare={checkSquare}
              arrows={arrows}
              onSquareClick={onSquareClick}
            />
          </div>
        </div>

        <aside className="side">
          <ScorePanel game={game} style={config.pieceStyle} />

          <div className="panel controls">
            <button className="btn" onClick={pass} disabled={!canPass} title="Пропустить ход (нельзя под шахом)">
              Пропустить ход
            </button>
            <button className="btn" onClick={undo} disabled={game.history.length === 0}>
              Отменить ход
            </button>
            <button className="btn" onClick={() => setFlipped((f) => !f)}>
              Перевернуть доску
            </button>
            <button className="btn danger" onClick={resign} disabled={!!result}>
              Сдаться
            </button>
          </div>

          <div className="panel ai-panel">
            <div className="ai-head">
              <b>ИИ-помощник</b>
              <span className="muted small">
                {engineStatus.state === 'loading' && 'движок загружается…'}
                {engineStatus.state === 'ready' && engineStatus.name}
                {engineStatus.state === 'error' && 'движок недоступен'}
              </span>
            </div>
            {engineStatus.state === 'error' && <div className="alert check small">{engineStatus.message}</div>}
            <div className="ai-buttons">
              <button className="btn primary" onClick={requestHint} disabled={!humanCanMove || engineStatus.state !== 'ready' || analysisOn}>
                Подсказка
              </button>
              <button
                className={`btn${analysisOn ? ' active' : ''}`}
                onClick={() => setAnalysisOn((a) => !a)}
                disabled={engineStatus.state !== 'ready'}
                title="Непрерывная оценка позиции и лучшие продолжения"
              >
                Анализ: {analysisOn ? 'вкл' : 'выкл'}
              </button>
            </div>
            {thinking === 'bot' && (
              <div className="muted small">
                Компьютер думает… ({BOT_LEVELS.find((l) => l.id === config.level)?.name})
              </div>
            )}
            {thinking === 'hint' && <div className="muted small">Ищу лучший ход…</div>}
            {shownLines && (
              <ol className="pv-list">
                {shownLines.lines.slice(0, 3).map((l, i) => (
                  <li key={l.multipv}>
                    <span className="pv-dot" style={{ background: ARROW_COLORS[i] }} />
                    <b>{formatScore(scoreForCho(l.score, shownLines.turn))}</b>
                    <span className="muted"> · глубина {l.depth}</span>
                    <div className="pv-text">{pvToText(shownLines.fen, l.pv)}</div>
                  </li>
                ))}
              </ol>
            )}
            {!shownLines && !thinking && engineStatus.state === 'ready' && (
              <div className="muted small">
                «Подсказка» покажет три лучших хода стрелками. «Анализ» постоянно оценивает позицию.
              </div>
            )}
          </div>

          <div className="panel moves-panel">
            <b>Ходы</b>
            <div className="moves">
              {movePairs.length === 0 && <div className="muted small">Первым ходит Чо.</div>}
              <table>
                <tbody>
                  {movePairs.map((p) => (
                    <tr key={p.n}>
                      <td className="muted">{p.n}.</td>
                      <td className="cho">{p.w ?? ''}</td>
                      <td className="han">{p.b ?? ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </aside>
      </main>

      {showNewGame && (
        <NewGameDialog initial={config} onStart={startGame} onClose={game.history.length || version > 0 ? () => setShowNewGame(false) : undefined} />
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
          {config.mode === 'bot' && <p className="muted">{result.winner === config.humanColor ? 'Поздравляем!' : 'Попробуйте ещё раз или выберите уровень полегче.'}</p>}
        </Modal>
      )}
    </div>
  );
}
