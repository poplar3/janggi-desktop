import {
  type Color,
  type Move,
  type Position,
  START_FEN,
  generalsFacing,
  inCheck,
  isPass,
  legalMoves,
  makeMove,
  moveToUci,
  opposite,
  parseFen,
  pointsWinner,
  positionKey,
  toFen,
  type Piece,
} from './rules';

export type EndReason =
  | 'checkmate'
  | 'bikjang' // биджанг не разорван — подсчёт очков
  | 'double-pass' // оба игрока пропустили ход — подсчёт очков
  | 'move-limit' // 100 полуходов без взятий — подсчёт очков
  | 'repetition' // троекратное повторение — подсчёт очков
  | 'perpetual-check' // вечный шах запрещён — проигрывает шахующий
  | 'resign';

export interface GameResult {
  winner: Color;
  reason: EndReason;
}

export interface HistoryEntry {
  move: Move;
  uci: string;
  piece: Piece;
  captured: Piece | null;
  check: boolean;
  /** Позиция после хода. */
  pos: Position;
}

export const MOVE_LIMIT_PLIES = 100;

export class Game {
  readonly startFen: string;
  readonly start: Position;
  history: HistoryEntry[] = [];
  resigned: Color | null = null;

  constructor(startFen: string = START_FEN) {
    this.startFen = startFen;
    this.start = parseFen(startFen);
  }

  get position(): Position {
    return this.history.length ? this.history[this.history.length - 1].pos : this.start;
  }

  get turn(): Color {
    return this.position.turn;
  }

  get fen(): string {
    return toFen(this.position);
  }

  get uciMoves(): string[] {
    return this.history.map((h) => h.uci);
  }

  legalMoves(): Move[] {
    return this.result() ? [] : legalMoves(this.position);
  }

  isLegal(m: Move): boolean {
    return this.legalMoves().some((x) => x.from === m.from && x.to === m.to);
  }

  play(m: Move): HistoryEntry {
    if (!this.isLegal(m)) throw new Error(`Нелегальный ход ${moveToUci(m)}`);
    const before = this.position;
    const pos = makeMove(before, m);
    const entry: HistoryEntry = {
      move: m,
      uci: moveToUci(m),
      piece: before.board[m.from]!,
      captured: isPass(m) ? null : before.board[m.to],
      check: inCheck(pos.board, pos.turn),
      pos,
    };
    this.history.push(entry);
    return entry;
  }

  playUci(uci: string): HistoryEntry {
    const m = this.legalMoves().find((x) => moveToUci(x) === uci);
    if (!m) throw new Error(`Нелегальный ход ${uci}`);
    return this.play(m);
  }

  undo(): HistoryEntry | undefined {
    this.resigned = null;
    return this.history.pop();
  }

  resign(c: Color) {
    this.resigned = c;
  }

  /** Биджанг на доске сейчас (генералы смотрят друг на друга). */
  get bikjang(): boolean {
    return generalsFacing(this.position.board);
  }

  inCheck(): boolean {
    return inCheck(this.position.board, this.turn);
  }

  /** Результат партии или null, если партия продолжается. */
  result(): GameResult | null {
    if (this.resigned) return { winner: opposite(this.resigned), reason: 'resign' };
    const pos = this.position;
    const n = this.history.length;
    const last = this.history[n - 1];
    const prev = n >= 2 ? this.history[n - 2].pos : this.start;

    if (n > 0) {
      // Биджанг сохранился после ответного хода (или пропуска) — подсчёт очков.
      if (generalsFacing(pos.board) && generalsFacing(prev.board)) {
        return { winner: pointsWinner(pos.board), reason: 'bikjang' };
      }
      if (n >= 2 && isPass(last.move) && isPass(this.history[n - 2].move)) {
        return { winner: pointsWinner(pos.board), reason: 'double-pass' };
      }
    }

    if (legalMoves(pos).length === 0) {
      return { winner: opposite(pos.turn), reason: 'checkmate' };
    }

    if (pos.halfmove >= MOVE_LIMIT_PLIES) {
      return { winner: pointsWinner(pos.board), reason: 'move-limit' };
    }

    const rep = this.repetition();
    if (rep) return rep;
    return null;
  }

  private repetition(): GameResult | null {
    const n = this.history.length;
    if (n < 4) return null;
    const positions = [this.start, ...this.history.map((h) => h.pos)];
    const key = positionKey(positions[n]);
    let count = 0;
    let firstIdx = n;
    for (let i = n; i >= 0; i -= 2) {
      if (positionKey(positions[i]) === key) {
        count++;
        firstIdx = i;
      }
      // Взятие делает повторение невозможным
      if (i > 0 && this.history[i - 1].captured) break;
    }
    if (count < 3) return null;
    // Вечный шах: все ходы одной стороны в цикле давали шах — она проигрывает.
    const cycle = this.history.slice(firstIdx);
    const checksBy = (c: Color) => cycle.filter((h) => colorOfEntry(h) === c).every((h) => h.check);
    const lastMover = opposite(this.turn);
    const them = checksBy(lastMover);
    const us = checksBy(this.turn);
    if (them && !us) return { winner: this.turn, reason: 'perpetual-check' };
    if (us && !them) return { winner: lastMover, reason: 'perpetual-check' };
    return { winner: pointsWinner(this.position.board), reason: 'repetition' };
  }

  /** Захваченные фигуры: кто кого взял. */
  captured(): Record<Color, Piece[]> {
    const res: Record<Color, Piece[]> = { w: [], b: [] };
    for (const h of this.history) if (h.captured) res[colorOfEntry(h)].push(h.captured);
    return res;
  }
}

function colorOfEntry(h: HistoryEntry): Color {
  return h.piece === h.piece.toUpperCase() ? 'w' : 'b';
}

export const END_REASON_RU: Record<EndReason, string> = {
  checkmate: 'Мат',
  bikjang: 'Биджанг: победа по очкам',
  'double-pass': 'Оба игрока пропустили ход: победа по очкам',
  'move-limit': '100 полуходов без взятий: победа по очкам',
  repetition: 'Повторение позиции: победа по очкам',
  'perpetual-check': 'Вечный шах запрещён',
  resign: 'Сдача',
};
