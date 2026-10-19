// Из сырой задачи (позиция и решение) выводятся уровень, приёмы, описание, подсказки и разбор решения.
import { Game, type HistoryEntry } from '../core/game';
import { formatMove } from '../core/notation';
import {
  attacksFrom,
  colorOf,
  findGeneral,
  fileOf,
  isAttacked,
  opposite,
  PIECE_VALUES,
  rankOf,
  squareName,
  typeOf,
  type Color,
  type PieceType,
} from '../core/rules';
import { SIDE_NAMES } from '../ui/pieces';
import { CONCEPTS, type ConceptId } from './concepts';

export interface PuzzleSource {
  author: string;
  title?: string;
  url?: string;
}

export interface PuzzleData {
  id: string;
  fen: string;
  goal: 'mate' | 'material';
  mateIn?: number;
  gain?: number;
  /** Решение: ходы решающего и лучшие ответы соперника, в UCI. */
  line: string[];
  source?: PuzzleSource;
}

export interface Level {
  n: number;
  ru: string;
  rank: string;
}

/** Уровни по корейской любительской классификации (급 — ученические разряды, 단 — мастерские). */
export const LEVELS: Level[] = [
  { n: 1, ru: 'Начальный', rank: '18–15 급' },
  { n: 2, ru: 'Новичок', rank: '14–10 급' },
  { n: 3, ru: 'Любитель', rank: '9–5 급' },
  { n: 4, ru: 'Опытный', rank: '4–1 급' },
  { n: 5, ru: 'Сильный', rank: '1 단 и выше' },
];

export interface Puzzle extends PuzzleData {
  solver: Color;
  level: Level;
  concepts: ConceptId[];
  title: string;
  description: string;
  hints: string[];
  /** Ходы решения в русской записи. */
  solution: string[];
  explanation: string;
}

const MATE_BY_PIECE: Partial<Record<PieceType, ConceptId>> = {
  R: 'mate-chariot',
  C: 'mate-cannon',
  N: 'mate-horse',
  B: 'mate-elephant',
  P: 'mate-soldier',
};

const acc = (t: PieceType) => ({ K: 'генералом', A: 'стражем', B: 'слоном', N: 'конём', R: 'колесницей', C: 'пушкой', P: 'солдатом' })[t];
const nom = (t: PieceType) => ({ K: 'генерал', A: 'страж', B: 'слон', N: 'конь', R: 'колесница', C: 'пушка', P: 'солдат' })[t];
const accus = (t: PieceType) => ({ K: 'генерала', A: 'стража', B: 'слона', N: 'коня', R: 'колесницу', C: 'пушку', P: 'солдата' })[t];

function plural(n: number, one: string, few: string, many: string) {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

const inPalace = (s: number) => {
  const f = fileOf(s), r = rankOf(s);
  return f >= 3 && f <= 5 && (r <= 2 || r >= 7);
};

/** Ход по диагонали дворца (для фигур, которые ходят по прямым). */
function palaceDiagonal(h: HistoryEntry) {
  const t = typeOf(h.piece);
  if (t === 'N' || t === 'B') return false;
  const { from, to } = h.move;
  return inPalace(from) && inPalace(to) && fileOf(from) !== fileOf(to) && rankOf(from) !== rankOf(to);
}

/** Лежит ли поле `x` строго между `a` и `b` на одной вертикали или горизонтали. */
function between(a: number, b: number, x: number) {
  const [fa, ra, fb, rb, fx, rx] = [fileOf(a), rankOf(a), fileOf(b), rankOf(b), fileOf(x), rankOf(x)];
  if (fa === fb && fx === fa) return rx > Math.min(ra, rb) && rx < Math.max(ra, rb);
  if (ra === rb && rx === ra) return fx > Math.min(fa, fb) && fx < Math.max(fa, fb);
  return false;
}

/** Фигуры стороны `by`, атакующие поле. */
function attackers(board: (string | null)[], target: number, by: Color) {
  const out: number[] = [];
  board.forEach((p, s) => {
    if (p && colorOf(p) === by && attacksFrom(board, s).includes(target)) out.push(s);
  });
  return out;
}

export function annotate(d: PuzzleData): Puzzle {
  const g = new Game(d.fen);
  const solver = g.turn;
  const opp = opposite(solver);
  for (const u of d.line) g.playUci(u);
  const hist = g.history;
  const mine = hist.filter((_, i) => i % 2 === 0);
  const first = mine[0];
  const last = mine[mine.length - 1];
  const concepts: ConceptId[] = [];
  const add = (c: ConceptId) => !concepts.includes(c) && concepts.push(c);
  let screen = false;

  // Жертва: соперник по ходу решения забирает фигуру, и решающий в этот момент в минусе по материалу.
  let balance = 0;
  let sacrificed = false;
  hist.forEach((h, i) => {
    const v = h.captured ? PIECE_VALUES[typeOf(h.captured)] : 0;
    balance += i % 2 === 0 ? v : -v;
    if (i % 2 === 1 && v >= 3 && balance < 0) sacrificed = true;
  });
  const quiet = !first.captured && !first.check;

  if (d.goal === 'mate') {
    const board = last.pos.board;
    const checkers = attackers(board, findGeneral(board, opp), solver);
    // Мат ставит фигура, которая объявляет шах (при вскрытом шахе это не та, что ходила).
    for (const s of checkers) {
      const mt = MATE_BY_PIECE[typeOf(board[s]!)];
      if (mt) add(mt);
    }
    if (palaceDiagonal(last)) add('palace-diagonal');
    if (checkers.length >= 2) add('double-check');
    else if (checkers.length === 1 && checkers[0] !== last.move.to) {
      // Фигура, вставшая между пушкой и генералом, — это экран, а не вскрытый шах.
      if (typeOf(board[checkers[0]]!) === 'C' && between(checkers[0], findGeneral(board, opp), last.move.to)) screen = true;
      else add('discovered');
    }
  } else {
    const after = first.pos.board;
    const targets = attacksFrom(after, first.move.to).filter((s) => {
      const p = after[s];
      return p && colorOf(p) === opp && (typeOf(p) === 'K' || PIECE_VALUES[typeOf(p)] >= 3);
    });
    if (first.captured && d.line.length === 1 && !isAttacked(after, first.move.to, opp)) add('hanging-piece');
    if (targets.length >= 2) add('fork');
    if (first.check && attackers(after, findGeneral(after, opp), solver).every((s) => s !== first.move.to)) add('discovered');
    if (palaceDiagonal(first)) add('palace-diagonal');
  }
  if (sacrificed) add('sacrifice');
  if (quiet && (d.goal === 'mate' || !concepts.includes('fork'))) add('quiet-move');
  if (d.goal === 'material' && !concepts.length) add('material-gain');
  if (d.goal === 'material' && concepts.length && !concepts.includes('hanging-piece')) add('material-gain');

  // Уровень: длина решения плюс трудные мотивы.
  let lvl = d.goal === 'mate' ? (d.mateIn ?? 1) : concepts.includes('hanging-piece') ? 1 : mine.length + 1;
  if (quiet) lvl++;
  if (sacrificed) lvl++;
  if (concepts.includes('double-check') || concepts.includes('discovered')) lvl = Math.max(lvl, 2);
  const level = LEVELS[Math.min(LEVELS.length, Math.max(1, lvl)) - 1];

  const n = d.mateIn ?? mine.length;
  const title =
    d.goal === 'mate'
      ? `Мат в ${n} ${plural(n, 'ход', 'хода', 'ходов')}`
      : `Выигрыш материала (+${formatPoints(d.gain ?? 0)})`;
  const side = solver === 'w' ? 'Чо' : 'Хана';
  const description =
    d.goal === 'mate'
      ? `Ход ${side}. Поставьте мат в ${n} ${plural(n, 'ход', 'хода', 'ходов')}${n > 1 ? ' при любой защите соперника' : ''}.`
      : `Ход ${side}. Найдите ход, после которого вы выигрываете материал при лучшей защите соперника.`;

  const main = concepts[0];
  const firstType = typeOf(first.piece);
  const hints = [
    CONCEPTS[main].hint,
    `Начните ходом ${acc(firstType)} с ${squareName(first.move.from)}.`,
    `Первый ход: ${formatMove(first)}.`,
  ];

  const solution = hist.map(formatMove);
  const explanation = explain(d, hist, solver, concepts, screen);
  return { ...d, solver, level, concepts, title, description, hints, solution, explanation };
}

function formatPoints(n: number) {
  return n.toLocaleString('ru-RU', { maximumFractionDigits: 1 });
}

function explain(d: PuzzleData, hist: HistoryEntry[], solver: Color, concepts: ConceptId[], screen: boolean) {
  const parts: string[] = [];
  const first = hist[0];
  if (concepts.includes('sacrifice')) {
    const taken = hist.find((h, i) => i % 2 === 1 && h.captured);
    if (taken?.captured) parts.push(`Решающий ход строится на жертве: соперник забирает ${accus(typeOf(taken.captured))}, но это не спасает.`);
  }
  if (concepts.includes('quiet-move')) parts.push(`Первый ход ${formatMove(first)} — тихий: он не шах и не взятие, но защиты от угрозы уже нет.`);
  if (d.goal === 'mate') {
    const last = hist[hist.length - 1];
    let how = `${hist.length > 1 ? 'Завершает' : 'Решает'} ход ${formatMove(last)}`;
    if (concepts.includes('double-check')) how += ': это двойной шах, от него можно только уйти, а уйти некуда';
    else if (screen) how += `: ${nom(typeOf(last.piece))} становится экраном, и мат объявляет пушка`;
    else if (concepts.includes('discovered')) how += ': он открывает линию, и мат объявляет другая фигура';
    else if (concepts.includes('palace-diagonal')) how += `: ${nom(typeOf(last.piece))} бьёт по диагонали дворца`;
    else if (typeOf(last.piece) === 'C') how += ': пушка бьёт через экран';
    else how += ': генералу некуда уйти, а закрыться или взять атакующую фигуру нечем';
    parts.push(how + '.');
    if (hist.length > 1) parts.push('Другие ответы соперника проигрывают так же быстро или быстрее.');
  } else {
    const won: string[] = [];
    hist.forEach((h, i) => {
      if (i % 2 === 0 && h.captured) won.push(accus(typeOf(h.captured)));
    });
    if (concepts.includes('fork')) parts.push(`После ${formatMove(first)} ${nom(typeOf(first.piece))} нападает сразу на две фигуры, обе спасти нельзя.`);
    if (concepts.includes('hanging-piece')) parts.push(`${capitalize(accus(typeOf(first.captured!)))} на ${squareName(first.move.to)} никто не защищал.`);
    if (won.length) parts.push(`В итоге ${SIDE_NAMES[solver]} забирает ${won.join(' и ')} и выигрывает ${formatPoints(d.gain ?? 0)} ${plural(Math.round(d.gain ?? 0), 'очко', 'очка', 'очков')}.`);
  }
  return parts.join(' ');
}

const capitalize = (s: string) => s[0].toUpperCase() + s.slice(1);

