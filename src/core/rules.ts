// Правила Чанги (корейские шахматы).
// Семантика совпадает с вариантом "janggi" движка Fairy-Stockfish:
// мат, пропуск хода, биджанг, подсчёт очков, правило 100 полуходов и повторений.

export type Color = 'w' | 'b'; // w = Чо (初/楚, ходит первым), b = Хан (漢)
export type PieceType = 'K' | 'A' | 'B' | 'N' | 'R' | 'C' | 'P';
// Фигура хранится символом FEN: заглавная — Чо, строчная — Хан.
export type Piece = string;
export type Board = (Piece | null)[];

export const FILES = 9;
export const RANKS = 10;
export const FILE_LETTERS = 'abcdefghi';

export const START_FEN = 'rnba1abnr/4k4/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/4K4/RNBA1ABNR w - - 0 1';

/** Очки фигур по официальным правилам. Хан получает 1,5 очка компенсации (덤). */
export const PIECE_VALUES: Record<PieceType, number> = { K: 0, R: 13, C: 7, N: 5, B: 3, A: 3, P: 2 };
export const HAN_BONUS = 1.5;

export interface Move {
  from: number;
  to: number;
}

export interface Position {
  board: Board;
  turn: Color;
  halfmove: number; // полуходов без взятия
  fullmove: number;
}

export const sq = (file: number, rank: number) => rank * FILES + file;
export const fileOf = (s: number) => s % FILES;
export const rankOf = (s: number) => Math.floor(s / FILES);
export const onBoard = (f: number, r: number) => f >= 0 && f < FILES && r >= 0 && r < RANKS;

export const colorOf = (p: Piece): Color => (p === p.toUpperCase() ? 'w' : 'b');
export const typeOf = (p: Piece): PieceType => p.toUpperCase() as PieceType;
export const opposite = (c: Color): Color => (c === 'w' ? 'b' : 'w');
export const isPass = (m: Move) => m.from === m.to;

export function squareName(s: number): string {
  return FILE_LETTERS[fileOf(s)] + (rankOf(s) + 1);
}

export function parseSquare(name: string): number {
  const f = FILE_LETTERS.indexOf(name[0]);
  const r = parseInt(name.slice(1), 10) - 1;
  if (f < 0 || !(r >= 0 && r < RANKS)) throw new Error(`Неверное поле: ${name}`);
  return sq(f, r);
}

export function moveToUci(m: Move): string {
  return squareName(m.from) + squareName(m.to);
}

export function uciToMove(uci: string): Move {
  const m = /^([a-i])(10|[1-9])([a-i])(10|[1-9])$/.exec(uci);
  if (!m) throw new Error(`Неверный ход: ${uci}`);
  return { from: parseSquare(m[1] + m[2]), to: parseSquare(m[3] + m[4]) };
}

// ---------- FEN ----------

export function parseFen(fen: string): Position {
  const [placement, turn = 'w', , , half = '0', full = '1'] = fen.trim().split(/\s+/);
  const rows = placement.split('/');
  if (rows.length !== RANKS) throw new Error('FEN: должно быть 10 рядов');
  const board: Board = new Array(FILES * RANKS).fill(null);
  rows.forEach((row, i) => {
    const rank = RANKS - 1 - i;
    let file = 0;
    const re = /(\d+)|([a-zA-Z])/g;
    let t: RegExpExecArray | null;
    while ((t = re.exec(row))) {
      if (t[1]) file += parseInt(t[1], 10);
      else {
        const ch = t[2] === 'E' ? 'B' : t[2] === 'e' ? 'b' : t[2];
        if (!'KABNRCPkabnrcp'.includes(ch)) throw new Error(`FEN: неизвестная фигура ${ch}`);
        board[sq(file, rank)] = ch;
        file++;
      }
    }
    if (file !== FILES) throw new Error(`FEN: ряд ${rank + 1} неполный`);
  });
  return { board, turn: turn === 'b' ? 'b' : 'w', halfmove: parseInt(half, 10) || 0, fullmove: parseInt(full, 10) || 1 };
}

export function toFen(pos: Position): string {
  const rows: string[] = [];
  for (let r = RANKS - 1; r >= 0; r--) {
    let row = '';
    let empty = 0;
    for (let f = 0; f < FILES; f++) {
      const p = pos.board[sq(f, r)];
      if (!p) empty++;
      else {
        if (empty) row += empty;
        empty = 0;
        row += p;
      }
    }
    if (empty) row += empty;
    rows.push(row);
  }
  return `${rows.join('/')} ${pos.turn} - - ${pos.halfmove} ${pos.fullmove}`;
}

// ---------- Расстановки (상차림) ----------

/** Порядок коня (N) и слона (B) на четырёх полях b, c, g, h — слева направо с точки зрения игрока. */
export type Setup = 'NBNB' | 'NBBN' | 'BNNB' | 'BNBN';

export const SETUPS: { id: Setup; ko: string; ru: string }[] = [
  { id: 'NBBN', ko: '마상상마', ru: 'Внутренние слоны (конь-слон-слон-конь)' },
  { id: 'BNNB', ko: '상마마상', ru: 'Внешние слоны (слон-конь-конь-слон)' },
  { id: 'NBNB', ko: '마상마상', ru: 'Левый конь (конь-слон-конь-слон)' },
  { id: 'BNBN', ko: '상마상마', ru: 'Правый слон (слон-конь-слон-конь)' },
];

export function startFenWithSetups(cho: Setup, han: Setup): string {
  const pos = parseFen(START_FEN);
  // Для Чо «слева» — вертикаль b, для Хана (сидит напротив) — вертикаль h.
  const choFiles = [1, 2, 6, 7];
  const hanFiles = [7, 6, 2, 1];
  choFiles.forEach((f, i) => (pos.board[sq(f, 0)] = cho[i]));
  hanFiles.forEach((f, i) => (pos.board[sq(f, 9)] = han[i].toLowerCase()));
  return toFen(pos);
}

// ---------- Дворец ----------

function inPalace(f: number, r: number, c?: Color): boolean {
  if (f < 3 || f > 5) return false;
  if (c === 'w') return r <= 2;
  if (c === 'b') return r >= 7;
  return r <= 2 || r >= 7;
}

/** Центр дворца, в котором находится поле, либо null. */
function palaceCenter(f: number, r: number): [number, number] | null {
  if (!inPalace(f, r)) return null;
  return [4, r <= 2 ? 1 : 8];
}

/** Диагональные шаги вдоль линий дворца из поля (только угол↔центр). */
function palaceDiagonalSteps(f: number, r: number): [number, number][] {
  const c = palaceCenter(f, r);
  if (!c) return [];
  const [cf, cr] = c;
  if (f === cf && r === cr) return [[-1, -1], [1, -1], [-1, 1], [1, 1]];
  if (Math.abs(f - cf) === 1 && Math.abs(r - cr) === 1) return [[cf - f, cr - r]];
  return [];
}

const ORTHO: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];

// ---------- Генерация ходов ----------

/** Псевдолегальные ходы фигуры (без проверки шаха своему генералу). */
function pieceMoves(board: Board, from: number, out: Move[]): void {
  const p = board[from]!;
  const us = colorOf(p);
  const t = typeOf(p);
  const f0 = fileOf(from);
  const r0 = rankOf(from);
  const add = (f: number, r: number) => {
    if (!onBoard(f, r)) return false;
    const target = board[sq(f, r)];
    if (target && colorOf(target) === us) return false;
    out.push({ from, to: sq(f, r) });
    return true;
  };

  switch (t) {
    case 'K':
    case 'A': {
      for (const [df, dr] of ORTHO) {
        const f = f0 + df, r = r0 + dr;
        if (inPalace(f, r, us)) add(f, r);
      }
      for (const [df, dr] of palaceDiagonalSteps(f0, r0)) {
        const f = f0 + df, r = r0 + dr;
        if (inPalace(f, r, us)) add(f, r);
      }
      break;
    }
    case 'P': {
      const fwd = us === 'w' ? 1 : -1;
      add(f0, r0 + fwd);
      add(f0 - 1, r0);
      add(f0 + 1, r0);
      for (const [df, dr] of palaceDiagonalSteps(f0, r0)) {
        if (dr === fwd) add(f0 + df, r0 + dr);
      }
      break;
    }
    case 'N': {
      for (const [df, dr] of ORTHO) {
        const bf = f0 + df, br = r0 + dr;
        if (!onBoard(bf, br) || board[sq(bf, br)]) continue;
        // два диагональных продолжения «наружу»
        const sides: [number, number][] = df ? [[df, 1], [df, -1]] : [[1, dr], [-1, dr]];
        for (const [sf, sr] of sides) add(bf + sf, br + sr);
      }
      break;
    }
    case 'B': {
      for (const [df, dr] of ORTHO) {
        const bf = f0 + df, br = r0 + dr;
        if (!onBoard(bf, br) || board[sq(bf, br)]) continue;
        const sides: [number, number][] = df ? [[df, 1], [df, -1]] : [[1, dr], [-1, dr]];
        for (const [sf, sr] of sides) {
          const mf = bf + sf, mr = br + sr;
          if (!onBoard(mf, mr) || board[sq(mf, mr)]) continue;
          add(mf + sf, mr + sr);
        }
      }
      break;
    }
    case 'R': {
      for (const [df, dr] of ORTHO) {
        let f = f0 + df, r = r0 + dr;
        while (onBoard(f, r)) {
          const target = board[sq(f, r)];
          if (target) {
            if (colorOf(target) !== us) out.push({ from, to: sq(f, r) });
            break;
          }
          out.push({ from, to: sq(f, r) });
          f += df;
          r += dr;
        }
      }
      // по диагоналям дворца
      for (const [df, dr] of palaceDiagonalSteps(f0, r0)) {
        let f = f0 + df, r = r0 + dr;
        while (onBoard(f, r) && inPalace(f, r) && palaceCenter(f, r)![1] === palaceCenter(f0, r0)![1]) {
          const target = board[sq(f, r)];
          if (target) {
            if (colorOf(target) !== us) out.push({ from, to: sq(f, r) });
            break;
          }
          out.push({ from, to: sq(f, r) });
          // продолжать можно только через центр дворца
          const c = palaceCenter(f, r)!;
          if (f !== c[0] || r !== c[1]) break;
          f += df;
          r += dr;
        }
      }
      break;
    }
    case 'C': {
      const isCannon = (q: Piece | null) => !!q && typeOf(q) === 'C';
      for (const [df, dr] of ORTHO) {
        let f = f0 + df, r = r0 + dr;
        while (onBoard(f, r) && !board[sq(f, r)]) {
          f += df;
          r += dr;
        }
        if (!onBoard(f, r) || isCannon(board[sq(f, r)])) continue; // нет «лафета» или это пушка
        f += df;
        r += dr;
        while (onBoard(f, r)) {
          const target = board[sq(f, r)];
          if (target) {
            if (colorOf(target) !== us && !isCannon(target)) out.push({ from, to: sq(f, r) });
            break;
          }
          out.push({ from, to: sq(f, r) });
          f += df;
          r += dr;
        }
      }
      // прыжок по диагонали дворца из угла через центр в противоположный угол
      const steps = palaceDiagonalSteps(f0, r0);
      if (steps.length === 1) {
        const [df, dr] = steps[0];
        const screen = board[sq(f0 + df, r0 + dr)];
        if (screen && !isCannon(screen)) {
          const tf = f0 + 2 * df, tr = r0 + 2 * dr;
          const target = board[sq(tf, tr)];
          if (!target || (colorOf(target) !== us && !isCannon(target))) out.push({ from, to: sq(tf, tr) });
        }
      }
      break;
    }
  }
}

export function findGeneral(board: Board, c: Color): number {
  const g = c === 'w' ? 'K' : 'k';
  return board.indexOf(g);
}

/** Поля, которые бьёт фигура на поле `from` (без учёта шаха своему генералу). */
export function attacksFrom(board: Board, from: number): number[] {
  const moves: Move[] = [];
  if (board[from]) pieceMoves(board, from, moves);
  return moves.filter((m) => m.to !== m.from).map((m) => m.to);
}

/** Атакует ли сторона `by` поле `target`. */
export function isAttacked(board: Board, target: number, by: Color): boolean {
  const moves: Move[] = [];
  for (let s = 0; s < board.length; s++) {
    const p = board[s];
    if (p && colorOf(p) === by) pieceMoves(board, s, moves);
  }
  return moves.some((m) => m.to === target);
}

export function inCheck(board: Board, c: Color): boolean {
  const g = findGeneral(board, c);
  return g >= 0 && isAttacked(board, g, opposite(c));
}

/** Биджанг: генералы стоят на одной вертикали и между ними нет фигур. */
export function generalsFacing(board: Board): boolean {
  const w = findGeneral(board, 'w');
  const b = findGeneral(board, 'b');
  if (w < 0 || b < 0 || fileOf(w) !== fileOf(b)) return false;
  const f = fileOf(w);
  const [lo, hi] = [Math.min(rankOf(w), rankOf(b)), Math.max(rankOf(w), rankOf(b))];
  for (let r = lo + 1; r < hi; r++) if (board[sq(f, r)]) return false;
  return true;
}

export function applyMoveToBoard(board: Board, m: Move): Board {
  const next = board.slice();
  if (!isPass(m)) {
    next[m.to] = next[m.from];
    next[m.from] = null;
  }
  return next;
}

/** Все легальные ходы, включая пропуск хода (ход генерала «на месте»). */
export function legalMoves(pos: Position): Move[] {
  const { board, turn } = pos;
  const pseudo: Move[] = [];
  for (let s = 0; s < board.length; s++) {
    const p = board[s];
    if (p && colorOf(p) === turn) pieceMoves(board, s, pseudo);
  }
  const bikjang = generalsFacing(board);
  const legal = pseudo.filter((m) => {
    const next = applyMoveToBoard(board, m);
    if (inCheck(next, turn)) return false;
    // При биджанге нельзя сделать ход, сохраняющий биджанг (кроме пропуска).
    if (bikjang && generalsFacing(next)) return false;
    return true;
  });
  const g = findGeneral(board, turn);
  if (g >= 0 && (bikjang || !inCheck(board, turn))) legal.push({ from: g, to: g });
  return legal;
}

export function makeMove(pos: Position, m: Move): Position {
  const capture = !isPass(m) && !!pos.board[m.to];
  return {
    board: applyMoveToBoard(pos.board, m),
    turn: opposite(pos.turn),
    halfmove: capture ? 0 : pos.halfmove + 1,
    fullmove: pos.turn === 'b' ? pos.fullmove + 1 : pos.fullmove,
  };
}

// ---------- Очки ----------

export function materialPoints(board: Board, c: Color): number {
  let sum = c === 'b' ? HAN_BONUS : 0;
  for (const p of board) if (p && colorOf(p) === c) sum += PIECE_VALUES[typeOf(p)];
  return sum;
}

/** Победитель по подсчёту очков (ничьей быть не может из-за 1,5 очка Хана). */
export function pointsWinner(board: Board): Color {
  return materialPoints(board, 'w') > materialPoints(board, 'b') ? 'w' : 'b';
}

export function positionKey(pos: Position): string {
  return pos.board.map((p) => p ?? '.').join('') + pos.turn;
}
