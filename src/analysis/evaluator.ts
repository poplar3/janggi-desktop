// Оценка позиций партии движком с кэшем: общая основа для подсказки, оценки ходов в игре и разбора партии.
// Все оценки делаются на фиксированную глубину в один поток с очисткой хеша, поэтому повторный запрос
// для той же позиции даёт тот же ответ, а подсказка и оценка хода согласованы между собой.
import { Game } from '../core/game';
import { colorOf, legalMoves, opposite, type Color } from '../core/rules';
import type { Engine, PvInfo, Score } from '../engine/engine';
import { classifyMove, cpForCho, type Quality } from './quality';

/** Глубина оценки ходов во время игры. */
export const LIVE_DEPTH = 12;
/** Глубина подсказки. */
export const HINT_DEPTH = 16;
/** Сколько лучших вариантов считает оценка. */
export const MULTIPV = 3;

export interface PositionEval {
  /** Оценка с точки зрения Чо, сп. */
  cpCho: number;
  score: Score | null;
  turn: Color;
  best: string | null;
  pv: string[];
  /** Лучшие варианты одной глубины (до MULTIPV). */
  lines: PvInfo[];
  depth: number;
  terminal: boolean;
}

export interface MoveReview {
  /** Номер полухода (1 — первый ход партии). */
  ply: number;
  uci: string;
  mover: Color;
  quality: Quality;
  /** Потеря шансов на победу, в процентных пунктах. */
  loss: number;
  before: PositionEval;
  after: PositionEval;
}

/** Партия, остановленная на полуходе `ply` (0 — начальная позиция). */
export function gameAtPly(game: Game, ply: number): Game {
  const g = new Game(game.startFen);
  for (const h of game.history.slice(0, ply)) g.play(h.move);
  return g;
}

export class Evaluator {
  private cache = new Map<string, PositionEval>();
  private engine: Engine;

  constructor(engine: Engine) {
    this.engine = engine;
  }

  cached(game: Game, ply: number): PositionEval | undefined {
    return this.cache.get(this.key(game, ply));
  }

  private key(game: Game, ply: number) {
    return `${game.startFen}|${game.uciMoves.slice(0, ply).join(' ')}`;
  }

  /**
   * Оценивает позицию после `ply` полуходов на глубину не меньше `depth`.
   * Возвращает null, если поиск отменён.
   */
  async evaluate(game: Game, ply: number, depth: number, onDepth?: (d: number) => void): Promise<PositionEval | null> {
    const key = this.key(game, ply);
    const hit = this.cache.get(key);
    if (hit && (hit.terminal || hit.depth >= depth)) return hit;

    const g = gameAtPly(game, ply);
    const result = g.result();
    if (result) {
      const ev: PositionEval = {
        cpCho: result.winner === 'w' ? 10000 : -10000,
        score: null,
        turn: g.turn,
        best: null,
        pv: [],
        lines: [],
        depth: 99,
        terminal: true,
      };
      this.cache.set(key, ev);
      return ev;
    }
    const expectedLines = Math.min(MULTIPV, legalMoves(g.position).length);
    const r = await this.engine.search({
      fen: game.startFen,
      moves: game.uciMoves.slice(0, ply),
      depth,
      multipv: MULTIPV,
      expectedLines,
      threads: 1,
      clearHash: true,
      onDepth: (ls) => onDepth?.(ls[0]?.depth ?? 0),
    });
    const line = r.lines[0];
    if (!r.bestmove || !line) return null;
    const ev: PositionEval = {
      cpCho: cpForCho(line.score, g.turn),
      score: line.score,
      turn: g.turn,
      best: line.pv[0] ?? r.bestmove,
      pv: line.pv,
      lines: r.lines,
      depth: line.depth,
      terminal: false,
    };
    this.cache.set(key, ev);
    return ev;
  }

  /** Качество хода номер `ply` (1…N). */
  async reviewMove(game: Game, ply: number, depth: number): Promise<MoveReview | null> {
    const before = await this.evaluate(game, ply - 1, depth);
    if (!before) return null;
    const uci = game.history[ply - 1].uci;
    // Если сыгранный ход есть среди лучших вариантов, берём его оценку из того же поиска:
    // так сильный ход не получит случайную «неточность» из-за разницы между двумя поисками.
    const line = before.lines.find((l) => l.pv[0] === uci);
    let after = this.cached(game, ply);
    if (line && !after?.terminal) {
      const synthetic: PositionEval = {
        cpCho: cpForCho(line.score, before.turn),
        score: line.score.mate !== undefined ? { mate: -line.score.mate } : { cp: -(line.score.cp ?? 0) },
        turn: opposite(before.turn),
        best: line.pv[1] ?? null,
        pv: line.pv.slice(1),
        lines: [],
        depth: line.depth - 1,
        terminal: false,
      };
      if (!after) this.cache.set(this.key(game, ply), synthetic);
      return makeReview(game, ply, before, synthetic);
    }
    after = (await this.evaluate(game, ply, depth)) ?? undefined;
    if (!after) return null;
    return makeReview(game, ply, before, after);
  }
}

export function makeReview(game: Game, ply: number, before: PositionEval, after: PositionEval): MoveReview {
  const h = game.history[ply - 1];
  const mover = colorOf(h.piece);
  const bestLine = before.lines[0];
  const playedLine = before.lines.find((l) => l.pv[0] === h.uci);
  // Ход, равный по оценке лучшему, тоже считается лучшим.
  const isBest =
    before.best === h.uci ||
    (!!bestLine && !!playedLine && cpForCho(playedLine.score, before.turn) === cpForCho(bestLine.score, before.turn));
  const { quality, loss } = classifyMove(mover, before.cpCho, after.cpCho, isBest);
  return { ply, uci: h.uci, mover, quality, loss, before, after };
}
