// Оценка позиций партии движком с кэшем: общая основа для разбора партии и оценки ходов в игре.
import { Game } from '../core/game';
import { colorOf, type Color } from '../core/rules';
import type { Engine, Score } from '../engine/engine';
import { classifyMove, cpForCho, type Quality } from './quality';

export interface PositionEval {
  /** Оценка с точки зрения Чо, сп. */
  cpCho: number;
  score: Score | null;
  turn: Color;
  best: string | null;
  pv: string[];
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

  /** Оценивает позицию после `ply` полуходов. Возвращает null, если поиск отменён. */
  async evaluate(game: Game, ply: number, movetime: number): Promise<PositionEval | null> {
    const key = this.key(game, ply);
    const hit = this.cache.get(key);
    if (hit && (hit.terminal || hit.depth >= minDepth(movetime))) return hit;

    const g = gameAtPly(game, ply);
    const result = g.result();
    if (result) {
      const ev: PositionEval = {
        cpCho: result.winner === 'w' ? 10000 : -10000,
        score: null,
        turn: g.turn,
        best: null,
        pv: [],
        depth: 99,
        terminal: true,
      };
      this.cache.set(key, ev);
      return ev;
    }
    const r = await this.engine.search({ fen: game.startFen, moves: game.uciMoves.slice(0, ply), movetime });
    const line = r.lines[0];
    if (!r.bestmove || !line) return null;
    const ev: PositionEval = {
      cpCho: cpForCho(line.score, g.turn),
      score: line.score,
      turn: g.turn,
      best: r.bestmove,
      pv: line.pv,
      depth: line.depth,
      terminal: false,
    };
    this.cache.set(key, ev);
    return ev;
  }

  /** Качество хода номер `ply` (1…N). */
  async reviewMove(game: Game, ply: number, movetime: number): Promise<MoveReview | null> {
    const before = await this.evaluate(game, ply - 1, movetime);
    if (!before) return null;
    const after = await this.evaluate(game, ply, movetime);
    if (!after) return null;
    return makeReview(game, ply, before, after);
  }
}

function minDepth(movetime: number) {
  return movetime >= 2000 ? 16 : movetime >= 800 ? 12 : 8;
}

export function makeReview(game: Game, ply: number, before: PositionEval, after: PositionEval): MoveReview {
  const h = game.history[ply - 1];
  const mover = colorOf(h.piece);
  const { quality, loss } = classifyMove(mover, before.cpCho, after.cpCho, before.best === h.uci);
  return { ply, uci: h.uci, mover, quality, loss, before, after };
}
