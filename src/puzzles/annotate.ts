// Из сырой задачи (позиция и решение) выводятся уровень, приёмы, описание, подсказки и разбор решения.
import { Game, type HistoryEntry } from '../core/game';
import { JANGGI } from '../core/janggi';
import { colorOf, opposite, plural, typeOf, type Board, type Color, type GameId, type Variant } from '../core/types';
import { conceptsFor, type ConceptId } from './concepts';

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
  /** Задача 박보 / цумэ: каждый ход решающего — шах. */
  checksOnly?: boolean;
  /** Другие верные ходы решающего: с полухода at решение продолжается линией line. */
  alts?: { at: number; line: string[] }[];
  /** Номер задачи в источнике. */
  number?: number;
  source?: PuzzleSource;
}

export interface Level {
  n: number;
  ru: string;
  rank: string;
}

/** Уровни по корейской любительской классификации (кып — ученические разряды, дан — мастерские). */
export const LEVELS: Level[] = [
  { n: 1, ru: 'Начальный', rank: '18–15 кып' },
  { n: 2, ru: 'Новичок', rank: '14–10 кып' },
  { n: 3, ru: 'Любитель', rank: '9–5 кып' },
  { n: 4, ru: 'Опытный', rank: '4–1 кып' },
  { n: 5, ru: 'Сильный', rank: '1 дан и выше' },
];

const STRENGTH_LEVELS: Level[] = [
  { n: 1, ru: 'Начальный', rank: 'первые партии' },
  { n: 2, ru: 'Новичок', rank: 'знает правила' },
  { n: 3, ru: 'Любитель', rank: 'клубный игрок' },
  { n: 4, ru: 'Опытный', rank: 'сильный клубный игрок' },
  { n: 5, ru: 'Сильный', rank: 'кандидат в мастера' },
];

const LEVELS_BY_GAME: Record<GameId, Level[]> = {
  janggi: LEVELS,
  xiangqi: STRENGTH_LEVELS,
  makruk: STRENGTH_LEVELS,
  shatranj: STRENGTH_LEVELS,
  shogi: [
    { n: 1, ru: 'Начальный', rank: '15–10 кю' },
    { n: 2, ru: 'Новичок', rank: '9–6 кю' },
    { n: 3, ru: 'Любитель', rank: '5–3 кю' },
    { n: 4, ru: 'Опытный', rank: '2–1 кю' },
    { n: 5, ru: 'Сильный', rank: '1 дан и выше' },
  ],
};

export const levelsFor = (game: GameId) => LEVELS_BY_GAME[game];

export interface Puzzle extends PuzzleData {
  game: GameId;
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

/** Какой приём означает мат данной фигурой. */
const MATE_BY_PIECE: Record<GameId, Record<string, ConceptId>> = {
  janggi: { R: 'mate-chariot', C: 'mate-cannon', N: 'mate-horse', B: 'mate-elephant', P: 'mate-soldier' },
  xiangqi: { R: 'mate-chariot', C: 'mate-cannon', N: 'mate-horse', P: 'mate-soldier' },
  makruk: { R: 'mate-rook', N: 'mate-knight', S: 'mate-khon', M: 'mate-met', P: 'mate-pawn' },
  shatranj: { R: 'mate-rook', N: 'mate-knight', B: 'mate-alfil', Q: 'mate-met', P: 'mate-pawn' },
  shogi: {
    R: 'mate-rook', '+R': 'mate-rook', B: 'mate-bishop', '+B': 'mate-bishop',
    G: 'mate-gold', '+P': 'mate-gold', '+L': 'mate-gold', '+N': 'mate-gold', '+S': 'mate-gold',
    S: 'mate-silver', N: 'mate-knight', L: 'mate-lance', P: 'mate-pawn',
  },
};

/** Фигуры, бьющие через «экран» (пушки Чанги и Сянци). */
const isCannon = (v: Variant, p: string | null) => !!p && v.id !== 'shogi' && typeOf(p) === 'C';

const fileOf = (v: Variant, s: number) => s % v.files;
const rankOf = (v: Variant, s: number) => Math.floor(s / v.files);

const inPalace = (s: number) => {
  const f = s % 9, r = Math.floor(s / 9);
  return f >= 3 && f <= 5 && (r <= 2 || r >= 7);
};

/** Ход по диагонали дворца (Чанги: для фигур, которые ходят по прямым). */
function palaceDiagonal(v: Variant, h: HistoryEntry) {
  if (v.id !== 'janggi') return false;
  const t = typeOf(h.piece);
  if (t === 'N' || t === 'B') return false;
  const { from, to } = h.move;
  return inPalace(from) && inPalace(to) && fileOf(v, from) !== fileOf(v, to) && rankOf(v, from) !== rankOf(v, to);
}

/** Лежит ли поле `x` строго между `a` и `b` на одной вертикали или горизонтали. */
function between(v: Variant, a: number, b: number, x: number) {
  const [fa, ra, fb, rb, fx, rx] = [fileOf(v, a), rankOf(v, a), fileOf(v, b), rankOf(v, b), fileOf(v, x), rankOf(v, x)];
  if (fa === fb && fx === fa) return rx > Math.min(ra, rb) && rx < Math.max(ra, rb);
  if (ra === rb && rx === ra) return fx > Math.min(fa, fb) && fx < Math.max(fa, fb);
  return false;
}

/** Фигуры стороны `by`, атакующие поле. */
function attackers(v: Variant, board: Board, target: number, by: Color) {
  const out: number[] = [];
  board.forEach((p, s) => {
    if (p && colorOf(p) === by && typeOf(p) !== 'K' && v.attacksFrom(board, s).includes(target)) out.push(s);
  });
  return out;
}

/**
 * Сянци: генерал решающего «держит» вертикаль — хотя бы одно поле рядом с заматованным генералом
 * недоступно только из-за встречи генералов.
 */
function flyingGeneralHelps(v: Variant, board: Board, loser: Color) {
  const k = v.kingSquare(board, loser);
  const other = v.kingSquare(board, opposite(loser));
  if (k < 0 || other < 0) return false;
  const f = fileOf(v, k), r = rankOf(v, k);
  for (const [df, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const nf = f + df, nr = r + dr;
    if (nf < 3 || nf > 5 || (loser === 'w' ? nr < 0 || nr > 2 : nr < 7 || nr > 9)) continue;
    if (nf !== fileOf(v, other)) continue;
    const to = nr * v.files + nf;
    if (board[to] && colorOf(board[to]!) === loser) continue;
    const next = board.slice();
    next[to] = next[k];
    next[k] = null;
    // Пусто между генералами и никто другой это поле не бьёт.
    let open = true;
    const [lo, hi] = [Math.min(nr, rankOf(v, other)), Math.max(nr, rankOf(v, other))];
    for (let rr = lo + 1; rr < hi; rr++) if (next[rr * v.files + nf]) open = false;
    if (open && attackers(v, next, to, opposite(loser)).length === 0) return true;
  }
  return false;
}

export function annotate(d: PuzzleData, variant: Variant = JANGGI): Puzzle {
  const v = variant;
  const C = conceptsFor(v.id);
  const g = new Game(d.fen, v);
  const solver = g.turn;
  const opp = opposite(solver);
  for (const u of d.line) g.playUci(u);
  const hist = g.history;
  const mine = hist.filter((_, i) => i % 2 === 0);
  const first = mine[0];
  const last = mine[mine.length - 1];
  const concepts: ConceptId[] = [];
  const add = (c: ConceptId) => !concepts.includes(c) && concepts.push(c);
  const big = v.id === 'xiangqi' ? 2 : v.id === 'makruk' || v.id === 'shatranj' ? 2.5 : 3;
  let screen = false;
  if (d.checksOnly) add('check-chain');

  // Жертва: соперник по ходу решения забирает фигуру, и решающий в этот момент в минусе по материалу.
  let balance = 0;
  let sacrificed = false;
  hist.forEach((h, i) => {
    const val = h.captured ? v.pieceValue(h.captured) : 0;
    balance += i % 2 === 0 ? val : -val;
    if (i % 2 === 1 && val >= big && balance < 0) sacrificed = true;
  });
  const quiet = !first.captured && !first.check;

  if (d.goal === 'mate') {
    const board = last.pos.board;
    const king = v.kingSquare(board, opp);
    const checkers = attackers(v, board, king, solver);
    // Мат ставит фигура, которая объявляет шах (при вскрытом шахе это не та, что ходила).
    for (const s of checkers) {
      const mt = MATE_BY_PIECE[v.id][typeOf(board[s]!)];
      if (mt) add(mt);
    }
    if (last.move.from < 0) add('drop');
    if (palaceDiagonal(v, last)) add('palace-diagonal');
    if (v.id === 'xiangqi' && flyingGeneralHelps(v, board, opp)) add('flying-general');
    if (checkers.length >= 2) add('double-check');
    else if (checkers.length === 1 && checkers[0] !== last.move.to) {
      // Фигура, вставшая между пушкой и генералом, — это экран, а не вскрытый шах.
      if (isCannon(v, board[checkers[0]]) && between(v, checkers[0], king, last.move.to)) screen = true;
      else add('discovered');
    }
  } else {
    const after = first.pos.board;
    const targets = v.attacksFrom(after, first.move.to).filter((s) => {
      const p = after[s];
      return p && colorOf(p) === opp && (typeOf(p) === 'K' || v.pieceValue(p) >= big);
    });
    if (first.captured && d.line.length === 1 && attackers(v, after, first.move.to, opp).length === 0 && v.kingSquare(after, opp) >= 0 && !kingDefends(v, after, first.move.to, opp))
      add('hanging-piece');
    if (targets.length >= 2) add('fork');
    if (first.check && attackers(v, after, v.kingSquare(after, opp), solver).every((s) => s !== first.move.to)) add('discovered');
    if (palaceDiagonal(v, first)) add('palace-diagonal');
    if (first.move.from < 0) add('drop');
  }
  if ((v.id === 'shogi' || v.board === 'cells') && mine.some((h) => h.move.promo)) add('promotion');
  if (sacrificed) add('sacrifice');
  if (quiet && (d.goal === 'mate' || !concepts.includes('fork'))) add('quiet-move');
  if (d.goal === 'material' && !concepts.length) add('material-gain');
  if (d.goal === 'material' && concepts.length && !concepts.includes('hanging-piece')) add('material-gain');
  if (!concepts.length) add(d.goal === 'mate' ? 'check-chain' : 'material-gain');

  // Уровень: длина решения плюс трудные мотивы.
  let lvl = d.goal === 'mate' ? (d.mateIn ?? 1) : concepts.includes('hanging-piece') ? 1 : mine.length + 1;
  if (quiet) lvl++;
  if (sacrificed) lvl++;
  if (concepts.includes('double-check') || concepts.includes('discovered')) lvl = Math.max(lvl, 2);
  // В цумэ-сёги каждый ход — шах, поэтому короткие задачи проще, чем мат того же числа ходов в других играх.
  if (v.id === 'shogi' && d.checksOnly && d.goal === 'mate') lvl = Math.max(1, Math.ceil((d.mateIn ?? 1) * 0.75) + (sacrificed ? 1 : 0));
  const levels = levelsFor(v.id);
  const level = levels[Math.min(levels.length, Math.max(1, lvl)) - 1];

  const n = d.mateIn ?? mine.length;
  const moves = `${n} ${plural(n, 'ход', 'хода', 'ходов')}`;
  const title = d.goal === 'mate' ? `Мат в ${moves}` : `Выигрыш материала (+${formatPoints(d.gain ?? 0)})`;
  const side = v.sidesGen[solver];
  const description = d.checksOnly
    ? v.id === 'janggi'
      ? `Ход ${side}. Задача бакбо: поставьте мат в ${moves}, объявляя шах каждым ходом.`
      : v.id === 'shogi'
        ? `Ход ${side}. Цумэ: поставьте мат в ${moves}, объявляя шах каждым ходом.`
        : `Ход ${side}. Поставьте мат в ${moves}, объявляя шах каждым ходом.`
    : d.goal === 'mate'
      ? `Ход ${side}. Поставьте мат в ${moves}${n > 1 ? ' при любой защите соперника' : ''}.`
      : `Ход ${side}. Найдите ход, после которого вы выигрываете материал при лучшей защите соперника.`;

  const main = concepts[0];
  const firstInfo = v.pieceInfo(first.piece);
  const hints = [
    C[main].hint,
    first.move.from < 0 ? `Начните со сброса из руки: ${firstInfo.ru.toLowerCase()}.` : `Начните ходом ${firstInfo.ins} с ${v.squareName(first.move.from)}.`,
    `Первый ход: ${v.formatMove(first)}.`,
  ];

  const solution = hist.map((h) => v.formatMove(h));
  const explanation = explain(v, d, hist, solver, concepts, screen);
  return { ...d, game: v.id, solver, level, concepts, title, description, hints, solution, explanation };
}

/** Защищает ли поле король стороны `c` (взятие королём невозможно, если поле защищено). */
function kingDefends(v: Variant, board: Board, s: number, c: Color) {
  const k = v.kingSquare(board, c);
  return k >= 0 && v.attacksFrom(board, k).includes(s);
}

function formatPoints(n: number) {
  return n.toLocaleString('ru-RU', { maximumFractionDigits: 1 });
}

function explain(v: Variant, d: PuzzleData, hist: HistoryEntry[], solver: Color, concepts: ConceptId[], screen: boolean) {
  const parts: string[] = [];
  const first = hist[0];
  const nom = (p: string) => v.pieceInfo(p).ru.toLowerCase();
  const acc = (p: string) => v.pieceInfo(p).acc;
  const king = v.kingAcc;
  const kingNom = v.kingAcc === 'короля' ? 'король' : 'генерал';
  const kingDat = v.kingAcc === 'короля' ? 'королю' : 'генералу';
  if (d.checksOnly) {
    const k = Math.ceil(hist.length / 2);
    parts.push(`Все ${k} ${plural(k, 'ход', 'хода', 'ходов')} решения — шахи, поэтому у соперника каждый раз выбор только между защитами от шаха.`);
  }
  if (concepts.includes('sacrifice')) {
    const taken = hist.find((h, i) => i % 2 === 1 && h.captured);
    if (taken?.captured) parts.push(`Решающий ход строится на жертве: соперник забирает ${acc(taken.captured)}, но это не спасает.`);
  }
  if (concepts.includes('quiet-move')) parts.push(`Первый ход ${v.formatMove(first)} — тихий: он не шах и не взятие, но защиты от угрозы уже нет.`);
  if (concepts.includes('promotion')) parts.push('В решении фигура превращается — без этого мата не получится.');
  if (d.goal === 'mate') {
    const last = hist[hist.length - 1];
    let how = `${hist.length > 1 ? 'Завершает' : 'Решает'} ход ${v.formatMove(last)}`;
    if (concepts.includes('double-check')) how += `: это двойной шах, от него можно только уйти, а уйти некуда`;
    else if (screen) how += `: ${nom(last.piece)} становится экраном, и мат объявляет пушка`;
    else if (concepts.includes('discovered')) how += ': он открывает линию, и мат объявляет другая фигура';
    else if (concepts.includes('palace-diagonal')) how += `: ${nom(last.piece)} бьёт по диагонали дворца`;
    else if (v.id !== 'shogi' && typeOf(last.piece) === 'C') how += ': пушка бьёт через экран';
    else if (last.move.from < 0) how += `: фигура из руки встаёт вплотную, и ${kingDat} некуда уйти`;
    else how += `: ${kingDat} некуда уйти, а закрыться или взять атакующую фигуру нечем`;
    parts.push(how + '.');
    if (concepts.includes('flying-general')) parts.push(`Свой ${kingNom} помогает: ${king} соперника не может встать на его открытую вертикаль.`);
    if (hist.length > 1) parts.push('Другие ответы соперника проигрывают так же быстро или быстрее.');
  } else {
    const won: string[] = [];
    hist.forEach((h, i) => {
      if (i % 2 === 0 && h.captured) won.push(acc(h.captured));
    });
    if (concepts.includes('fork')) parts.push(`После ${v.formatMove(first)} ${nom(first.piece)} нападает сразу на две фигуры, обе спасти нельзя.`);
    if (concepts.includes('hanging-piece')) parts.push(`${capitalize(acc(first.captured!))} на ${v.squareName(first.move.to)} никто не защищал.`);
    if (won.length)
      parts.push(
        `В итоге ${v.pluralSides ? v.sides[solver].toLowerCase() : v.sides[solver]} ${v.pluralSides ? 'забирают' : 'забирает'} ${won.join(' и ')} и ${v.pluralSides ? 'выигрывают' : 'выигрывает'} ${formatPoints(d.gain ?? 0)} ${Number.isInteger(d.gain ?? 0) ? plural(d.gain ?? 0, 'очко', 'очка', 'очков') : 'очка'}.`,
      );
  }
  return parts.join(' ');
}

const capitalize = (s: string) => s[0].toUpperCase() + s.slice(1);
