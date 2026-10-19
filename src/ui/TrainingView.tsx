import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Game } from '../core/game';
import { findGeneral, isPass, moveToUci, parseSquare, uciToMove, type Move } from '../core/rules';
import { LEVELS } from '../puzzles';
import { lessonTasks, LESSONS, loadProgress, saveProgress, type ConcreteTask, type Diagram, type Lesson } from '../training';
import type { BestTask, ChoiceTask, FindTask, MovesTask } from '../training/types';
import { describePlan } from '../analysis/plan';
import { getEngine, type PvInfo, type Score } from '../engine/engine';
import { Board, type Arrow } from './Board';
import type { PieceStyle } from './pieces';

const GREEN = '#1f8a4c';
const GRAY = '#7b8794';
const BLUE = '#2f6fd6';

export function TrainingView({ style }: { style: PieceStyle }) {
  const [progress, setProgress] = useState(loadProgress);
  const [lesson, setLesson] = useState<Lesson | null>(null);

  const markDone = (id: string, task: number) =>
    setProgress((p) => {
      if (p[id]?.includes(task)) return p;
      const next = { ...p, [id]: [...(p[id] ?? []), task] };
      saveProgress(next);
      return next;
    });

  if (lesson) {
    const idx = LESSONS.indexOf(lesson);
    return (
      <LessonView
        key={lesson.id}
        lesson={lesson}
        style={style}
        done={progress[lesson.id] ?? []}
        onDone={(i) => markDone(lesson.id, i)}
        onBack={() => setLesson(null)}
        onNext={LESSONS[idx + 1] ? () => setLesson(LESSONS[idx + 1]) : undefined}
      />
    );
  }

  const total = (l: Lesson) => lessonTasks(l).length;
  const doneCount = (l: Lesson) => (progress[l.id] ?? []).length;
  const finished = LESSONS.filter((l) => doneCount(l) >= total(l)).length;

  return (
    <div className="puzzles">
      <div className="puzzles-head">
        <div>
          <h2>Обучение</h2>
          <div className="muted">
            Пройдено уроков: {finished} из {LESSONS.length}. Уроки идут от правил к тактике и стратегии; в каждом
            — короткая теория и задания с проверкой.
          </div>
        </div>
      </div>
      {LEVELS.filter((lv) => LESSONS.some((l) => l.level === lv.n)).map((lv) => (
        <section key={lv.n} className="course-level">
          <h3>
            <span className={`lvl lvl-${lv.n}`}>{lv.ru}</span> <span className="muted small">{lv.rank}</span>
          </h3>
          <div className="puzzle-grid">
            {LESSONS.filter((l) => l.level === lv.n).map((l) => {
              const n = total(l), d = Math.min(doneCount(l), n);
              return (
                <button key={l.id} className={`puzzle-card${d >= n ? ' solved' : ''}`} onClick={() => setLesson(l)}>
                  <span className="puzzle-num">Урок {LESSONS.indexOf(l) + 1}</span>
                  {d >= n && <span className="puzzle-done">✓</span>}
                  <b>
                    {l.title}
                    {l.ko && <span className="muted"> ({l.ko})</span>}
                  </b>
                  <span className="muted small">{l.summary}</span>
                  <span className="lesson-progress">
                    <span style={{ width: `${(d / Math.max(1, n)) * 100}%` }} />
                  </span>
                  <span className="muted small">
                    Заданий: {d} из {n}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

interface LessonProps {
  lesson: Lesson;
  style: PieceStyle;
  done: number[];
  onDone: (task: number) => void;
  onBack: () => void;
  onNext?: () => void;
}

/** Шаг урока: −1 — теория, 0…N−1 — задания. */
function LessonView({ lesson, style, done, onDone, onBack, onNext }: LessonProps) {
  const tasks = useMemo(() => lessonTasks(lesson), [lesson]);
  const diagrams = lesson.theory.flatMap((b) => ('diagram' in b ? [b.diagram] : []));
  const [step, setStep] = useState(-1);
  const [diagram, setDiagram] = useState<Diagram | null>(diagrams[0] ?? null);
  const task = step >= 0 ? tasks[step] : null;
  const allDone = tasks.every((_, i) => done.includes(i));

  const nav = (
    <div className="task-dots">
      <button className={`dot-btn${step === -1 ? ' on' : ''}`} onClick={() => setStep(-1)} title="Теория">
        Т
      </button>
      {tasks.map((_, i) => (
        <button key={i} className={`dot-btn${step === i ? ' on' : ''}${done.includes(i) ? ' done' : ''}`} onClick={() => setStep(i)} title={`Задание ${i + 1}`}>
          {i + 1}
        </button>
      ))}
    </div>
  );

  const header = (
    <div className="ai-head">
      <b>
        Урок {LESSONS.indexOf(lesson) + 1}. {lesson.title}
        {lesson.ko && <span className="muted"> ({lesson.ko})</span>}
      </b>
      <button className="btn small-btn" onClick={onBack}>
        К урокам
      </button>
    </div>
  );

  const footer = (
    <div className="ai-buttons">
      {step < tasks.length - 1 ? (
        <button className="btn primary" onClick={() => setStep(step + 1)}>
          {step === -1 ? 'К заданиям' : 'Следующее задание'}
        </button>
      ) : (
        onNext && (
          <button className="btn primary" onClick={onNext} disabled={!allDone} title={allDone ? '' : 'Сначала выполните все задания'}>
            Следующий урок
          </button>
        )
      )}
    </div>
  );

  if (!task) {
    return (
      <main className="layout">
        <div className="board-area">
          <div className="board-column">
            <div className="board-wrap">{diagram && <DiagramBoard diagram={diagram} style={style} />}</div>
          </div>
        </div>
        <aside className="side">
          <div className="panel puzzle-panel">
            {header}
            {nav}
            <div className="theory">
              {lesson.theory.map((b, i) =>
                'text' in b ? (
                  <p key={i}>{b.text}</p>
                ) : (
                  <button key={i} className={`diagram-link${diagram === b.diagram ? ' on' : ''}`} onClick={() => setDiagram(b.diagram)}>
                    ♟ {b.diagram.caption}
                  </button>
                ),
              )}
            </div>
            {footer}
          </div>
        </aside>
      </main>
    );
  }

  return (
    <TaskView
      key={`${lesson.id}-${step}`}
      task={task}
      style={style}
      solved={done.includes(step)}
      onSolved={() => onDone(step)}
      head={
        <>
          {header}
          {nav}
          <div className="muted small">
            Задание {step + 1} из {tasks.length}
          </div>
        </>
      }
      foot={footer}
    />
  );
}

function DiagramBoard({ diagram, style }: { diagram: Diagram; style: PieceStyle }) {
  const g = useMemo(() => new Game(diagram.fen), [diagram]);
  const arrows: Arrow[] = (diagram.arrows ?? []).map(([a, b]) => ({ from: parseSquare(a), to: parseSquare(b), color: BLUE, main: true }));
  const marks = (diagram.marks ?? []).map((s) => ({ from: -1, to: parseSquare(s) }));
  return (
    <Board board={g.position.board} style={style} flipped={false} selected={null} targets={marks} lastMove={null} checkSquare={null} arrows={arrows} onSquareClick={() => {}} />
  );
}

interface TaskProps {
  task: ConcreteTask;
  style: PieceStyle;
  solved: boolean;
  onSolved: () => void;
  /** Заголовок урока и навигация — сверху панели; кнопка перехода — снизу. */
  head: ReactNode;
  foot: ReactNode;
}

function TaskView(p: TaskProps) {
  if (p.task.kind === 'moves') return <MovesTaskView {...p} task={p.task} />;
  if (p.task.kind === 'choice') return <ChoiceTaskView {...p} task={p.task} />;
  if (p.task.kind === 'best') return <BestTaskView {...p} task={p.task} />;
  return <FindTaskView {...p} task={p.task} />;
}

function Shell({ board, children }: { board: ReactNode; children: ReactNode }) {
  return (
    <main className="layout">
      <div className="board-area">
        <div className="board-column">
          <div className="board-wrap">{board}</div>
        </div>
      </div>
      <aside className="side">
        <div className="panel puzzle-panel">{children}</div>
      </aside>
    </main>
  );
}

function MovesTaskView({ task, style, solved, onSolved, head, foot }: TaskProps & { task: MovesTask }) {
  const g = useMemo(() => new Game(task.fen), [task]);
  const from = parseSquare(task.square);
  const correct = useMemo(() => new Set(g.legalMoves().filter((m) => m.from === from && !isPass(m)).map((m) => m.to)), [g, from]);
  const [marked, setMarked] = useState<Set<number>>(new Set());
  const [checked, setChecked] = useState<null | { missed: number[]; extra: number[] }>(null);

  const toggle = (s: number) => {
    if (s === from) return;
    setChecked(null);
    setMarked((m) => {
      const n = new Set(m);
      if (n.has(s)) n.delete(s);
      else n.add(s);
      return n;
    });
  };
  const check = () => {
    const missed = [...correct].filter((s) => !marked.has(s));
    const extra = [...marked].filter((s) => !correct.has(s));
    setChecked({ missed, extra });
    if (!missed.length && !extra.length) onSolved();
  };
  const ok = checked && !checked.missed.length && !checked.extra.length;
  const arrows: Arrow[] = checked && !ok ? [...checked.missed.map((s) => ({ from, to: s, color: GREEN, dashed: true }))] : [];

  return (
    <Shell
      board={
        <Board
          board={g.position.board}
          style={style}
          flipped={false}
          selected={from}
          targets={[...marked].map((s) => ({ from: -1, to: s }))}
          lastMove={null}
          checkSquare={null}
          arrows={arrows}
          onSquareClick={toggle}
        />
      }
    >
      {head}
      <p className="puzzle-desc">{task.prompt}</p>
      <div className="muted small">Щёлкайте по точкам доски, чтобы отметить или снять отметку. Отмечено: {marked.size}.</div>
      {checked && ok && <div className="alert game-over"><b>Верно!</b> {task.explain}</div>}
      {checked && !ok && (
        <div className="alert check">
          {checked.missed.length > 0 && <>Пропущено ходов: {checked.missed.length} (показаны пунктиром). </>}
          {checked.extra.length > 0 && <>Лишних отметок: {checked.extra.length}. </>}
          Исправьте и проверьте ещё раз.
        </div>
      )}
      {solved && !checked && <div className="muted small">✓ Задание уже выполнено.</div>}
      <div className="ai-buttons">
        <button className="btn primary" onClick={check} disabled={marked.size === 0}>
          Проверить
        </button>
        <button className="btn" onClick={() => { setMarked(new Set()); setChecked(null); }}>
          Сбросить
        </button>
      </div>
      {foot}
    </Shell>
  );
}

function ChoiceTaskView({ task, style, solved, onSolved, head, foot }: TaskProps & { task: ChoiceTask }) {
  const [picked, setPicked] = useState<number | null>(null);
  const g = useMemo(() => (task.fen ? new Game(task.fen) : null), [task]);
  const pick = (i: number) => {
    setPicked(i);
    if (i === task.answer) onSolved();
  };
  return (
    <Shell
      board={
        g ? (
          <Board board={g.position.board} style={style} flipped={false} selected={null} targets={[]} lastMove={null} checkSquare={null} arrows={[]} onSquareClick={() => {}} />
        ) : (
          <div className="choice-placeholder">?</div>
        )
      }
    >
      {head}
      <p className="puzzle-desc">{task.prompt}</p>
      <div className="choice-options">
        {task.options.map((o, i) => (
          <button
            key={i}
            className={`btn choice${picked === i ? (i === task.answer ? ' right' : ' wrong') : ''}`}
            onClick={() => pick(i)}
          >
            {o}
          </button>
        ))}
      </div>
      {picked !== null && picked === task.answer && <div className="alert game-over"><b>Верно!</b> {task.explain}</div>}
      {picked !== null && picked !== task.answer && <div className="alert check">Неверно, попробуйте ещё раз.</div>}
      {solved && picked === null && <div className="muted small">✓ Задание уже выполнено.</div>}
      {foot}
    </Shell>
  );
}

function FindTaskView({ task, style, solved, onSolved, head, foot }: TaskProps & { task: FindTask }) {
  const [game, setGame] = useState(() => new Game(task.fen));
  const [, setV] = useState(0);
  const bump = () => setV((v) => v + 1);
  const solver = useMemo(() => new Game(task.fen).turn, [task]);
  const [selected, setSelected] = useState<number | null>(null);
  const [status, setStatus] = useState<'play' | 'wrong' | 'reply' | 'done' | 'shown'>('play');
  const [hint, setHint] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const step = game.history.length;
  const lastStep = task.line ? step >= task.line.length - 1 : true;

  const accepts = (m: Move) => {
    const probe = new Game(game.fen);
    const h = probe.play(m);
    const uci = moveToUci(m);
    if (task.line && !lastStep) return uci === task.line[step];
    if (task.goal === 'mate') return probe.result()?.reason === 'checkmate';
    if (task.goal === 'check') return h.check;
    if (task.goal === 'capture') return !!h.captured;
    if (task.line) return uci === task.line[step] || (step === 0 && (task.moves ?? []).includes(uci));
    return (task.moves ?? []).includes(uci);
  };

  const tryMove = (m: Move) => {
    setSelected(null);
    if (!accepts(m)) {
      setStatus('wrong');
      return;
    }
    game.play(m);
    bump();
    setHint(false);
    if (lastStep) {
      setStatus('done');
      onSolved();
      return;
    }
    setStatus('reply');
    timers.current.push(
      setTimeout(() => {
        game.playUci(task.line![step + 1]);
        setStatus('play');
        bump();
      }, 550),
    );
  };

  const onSquareClick = (s: number) => {
    if (status !== 'play' && status !== 'wrong') return;
    const p = game.position.board[s];
    if (selected !== null) {
      const m = game.legalMoves().find((x) => x.from === selected && x.to === s && !isPass(x));
      if (m) return tryMove(m);
    }
    if (p && (p === p.toUpperCase() ? 'w' : 'b') === game.turn) setSelected(s === selected ? null : s);
    else setSelected(null);
  };

  /** Ход, который покажет подсказка или решение. */
  const solutionMove = (): Move | null => {
    if (task.line) return uciToMove(task.line[step]);
    if (task.moves?.length) return uciToMove(task.moves[0]);
    return game.legalMoves().find((m) => !isPass(m) && accepts(m)) ?? null;
  };

  const reset = () => {
    timers.current.forEach(clearTimeout);
    setGame(new Game(task.fen));
    setStatus('play');
    setSelected(null);
    setHint(false);
  };

  const show = () => {
    timers.current.forEach(clearTimeout);
    const g = new Game(task.fen);
    setGame(g);
    setStatus('shown');
    const line = task.line ?? (solutionMove() ? [moveToUci(solutionMove()!)] : []);
    line.forEach((u, i) =>
      timers.current.push(
        setTimeout(() => {
          g.playUci(u);
          bump();
        }, 700 * (i + 1)),
      ),
    );
  };

  const solving = status === 'play' || status === 'wrong';
  const sm = solving && hint ? solutionMove() : null;
  const last = game.history[game.history.length - 1];
  const result = game.result();
  const checkSquare = (!result || result.reason === 'checkmate') && game.inCheck() ? findGeneral(game.position.board, game.turn) : null;
  const targets = selected !== null ? game.legalMoves().filter((m) => m.from === selected) : [];
  const arrows: Arrow[] = sm ? [{ from: sm.from, to: sm.to, color: GRAY, dashed: true }] : [];

  return (
    <Shell
      board={
        <Board
          board={game.position.board}
          style={style}
          flipped={solver === 'b'}
          selected={selected}
          targets={targets}
          lastMove={last ? last.move : null}
          checkSquare={checkSquare}
          arrows={arrows}
          onSquareClick={onSquareClick}
        />
      }
    >
      {head}
      <p className="puzzle-desc">
        {task.prompt} {!task.prompt.startsWith('Ход ') && <span className="muted">Ход {solver === 'w' ? 'Чо' : 'Хана'}.</span>}
      </p>
      {task.hint && solving && <div className="muted small">Подсказка: {task.hint}</div>}
      {status === 'wrong' && <div className="alert check">Не тот ход. Попробуйте ещё раз.</div>}
      {status === 'reply' && <div className="puzzle-status">Верно! Соперник отвечает…</div>}
      {status === 'done' && <div className="alert game-over"><b>Верно!</b> {task.explain}</div>}
      {status === 'shown' && <div className="puzzle-status">{task.explain}</div>}
      {solved && status === 'play' && step === 0 && <div className="muted small">✓ Задание уже выполнено.</div>}
      <div className="ai-buttons">
        {solving && (
          <>
            <button className="btn" onClick={() => setHint(true)} disabled={hint}>
              Показать ход
            </button>
            <button className="btn" onClick={show}>
              Решение
            </button>
          </>
        )}
        {!solving && status !== 'reply' && (
          <button className="btn" onClick={reset}>
            Заново
          </button>
        )}
      </div>
      {foot}
    </Shell>
  );
}

/** Глубина, на которой движок оценивает ход ученика. */
const BEST_DEPTH = 14;
const BEST_LINES = 6;
const scoreVal = (sc: Score) => (sc.mate !== undefined ? (sc.mate > 0 ? 100000 - sc.mate : -100000 - sc.mate) : (sc.cp ?? 0));

function BestTaskView({ task, style, solved, onSolved, head, foot }: TaskProps & { task: BestTask }) {
  const [game, setGame] = useState(() => new Game(task.fen));
  const solver = useMemo(() => new Game(task.fen).turn, [task]);
  const [lines, setLines] = useState<PvInfo[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [verdict, setVerdict] = useState<null | { ok: boolean; best: boolean; text: string }>(null);
  const [tries, setTries] = useState(0);
  const pending = useRef<Move | null>(null);

  // Ход оценивает тот же движок, что и подсказки: фиксированная глубина, один поток, без кэша — ответ воспроизводим.
  // Поиск может прервать другой экран (например, анализ партии при запуске движка) — тогда считаем заново.
  // Принимаем только досчитанный до конца результат, чтобы оценка не зависела от момента остановки.
  useEffect(() => {
    let alive = true;
    const engine = getEngine();
    const legal = new Set(new Game(task.fen).legalMoves().map(moveToUci));
    const run = (attempt: number) =>
      engine
        .search({ fen: task.fen, depth: BEST_DEPTH, multipv: BEST_LINES, threads: 1, clearHash: true })
        .then((r) => {
          if (!alive) return;
          const ls = r.lines.filter((l) => legal.has(l.pv[0]));
          if (ls.length && ls[0].depth >= BEST_DEPTH) setLines(ls);
          else if (attempt < 3) void run(attempt + 1);
          else setFailed(true);
        })
        .catch(() => alive && setFailed(true));
    engine.stop();
    void run(0);
    return () => {
      alive = false;
      engine.stop();
    };
  }, [task]);

  const judge = (m: Move, ls: PvInfo[]) => {
    const uci = moveToUci(m);
    const tol = task.tolerance ?? 60;
    const best = scoreVal(ls[0].score);
    const mine = ls.find((l) => l.pv[0] === uci);
    const loss = mine ? best - scoreVal(mine.score) : Infinity;
    const g = new Game(task.fen);
    g.play(m);
    setGame(g);
    if (loss <= tol) {
      setVerdict({ ok: true, best: mine === ls[0] || loss <= 5, text: describePlan(task.fen, mine!.pv, 7).text });
      onSolved();
    } else {
      setTries((t) => t + 1);
      setVerdict({ ok: false, best: false, text: '' });
    }
  };

  // Ход, сделанный до окончания расчёта, оценивается, как только движок закончит.
  useEffect(() => {
    if (lines && pending.current) {
      judge(pending.current, lines);
      pending.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lines]);

  const tryMove = (m: Move) => {
    setSelected(null);
    if (lines) judge(m, lines);
    else {
      pending.current = m;
      const g = new Game(task.fen);
      g.play(m);
      setGame(g);
    }
  };

  const reset = () => {
    setGame(new Game(task.fen));
    setVerdict(null);
    setSelected(null);
  };

  const canMove = !verdict && !pending.current && !failed;
  const onSquareClick = (s: number) => {
    if (!canMove) return;
    const p = game.position.board[s];
    if (selected !== null) {
      const m = game.legalMoves().find((x) => x.from === selected && x.to === s);
      if (m) return tryMove(m);
    }
    if (p && (p === p.toUpperCase() ? 'w' : 'b') === game.turn) setSelected(s === selected ? null : s);
    else setSelected(null);
  };
  const pass = () => {
    const k = findGeneral(game.position.board, game.turn);
    const m = { from: k, to: k };
    if (game.isLegal(m)) tryMove(m);
  };

  const showBest = verdict && !verdict.ok && tries >= 2 && lines;
  const bestMove = showBest ? uciToMove(lines[0].pv[0]) : null;
  const last = game.history[game.history.length - 1];
  const targets = selected !== null ? game.legalMoves().filter((m) => m.from === selected) : [];
  const arrows: Arrow[] = bestMove ? [{ from: bestMove.from, to: bestMove.to, color: GREEN, main: true }] : [];

  return (
    <Shell
      board={
        <Board
          board={game.position.board}
          style={style}
          flipped={solver === 'b'}
          selected={selected}
          targets={targets}
          lastMove={last ? last.move : null}
          checkSquare={game.inCheck() ? findGeneral(game.position.board, game.turn) : null}
          arrows={arrows}
          onSquareClick={onSquareClick}
        />
      }
    >
      {head}
      <p className="puzzle-desc">
        {task.prompt} {!task.prompt.startsWith('Ход ') && <span className="muted">Ход {solver === 'w' ? 'Чо' : 'Хана'}.</span>}
      </p>
      <div className="muted small">
        {failed
          ? 'Движок недоступен — это задание проверить нельзя.'
          : lines
            ? 'Ход оценит движок: засчитывается лучший ход или почти равный ему.'
            : 'Движок анализирует позицию…'}
      </div>
      {task.hint && !verdict && <div className="muted small">Подсказка: {task.hint}</div>}
      {pending.current && !lines && <div className="puzzle-status">Проверяю ход…</div>}
      {verdict?.ok && (
        <div className="alert game-over">
          <b>{verdict.best ? 'Отлично, это лучший ход!' : 'Хороший ход, почти равный лучшему.'}</b> {task.explain}
          {verdict.text && <div className="muted small">Дальше движок ожидает: {verdict.text}</div>}
        </div>
      )}
      {verdict && !verdict.ok && (
        <div className="alert check">
          Есть ход заметно сильнее. {tries >= 2 && lines ? <>Лучший ход показан стрелкой: {describePlan(task.fen, lines[0].pv, 1).moves[0]}.</> : 'Попробуйте ещё раз.'}
        </div>
      )}
      {solved && !verdict && <div className="muted small">✓ Задание уже выполнено.</div>}
      <div className="ai-buttons">
        {canMove && (
          <button className="btn" onClick={pass} title="Пропуск хода тоже может быть лучшим ходом">
            Пропустить ход
          </button>
        )}
        {verdict && (
          <button className="btn" onClick={reset}>
            {verdict.ok ? 'Заново' : 'Ещё раз'}
          </button>
        )}
      </div>
      {foot}
    </Shell>
  );
}
