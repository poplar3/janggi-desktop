// Задачи для Макрука и Шатранджа без движка: полный перебор по правилам приложения.
// Перебираются случайные позиции с небольшим числом фигур, в них ищутся
//  - маты в 1 и 2 хода (полный перебор ходов) и маты в 3 хода, где каждый ход решающего — шах;
//  - выигрыш материала: перебор на 3 полухода с продолжением взятий до затишья.
// Каждое решение проверяется на единственность: на каждом ходе решающего есть только один выигрывающий ход.
// Использование: node scripts/gen-chess8-puzzles.mjs <makruk|shatranj> [секунд] [выход.json]
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'vite';

const VARIANT = process.argv[2] ?? 'makruk';
const SECONDS = Number(process.argv[3] ?? 120);
const OUT = process.argv[4] ?? new URL(`../src/puzzles/${VARIANT}.json`, import.meta.url).pathname;
const SEED = Number(process.env.SEED ?? 1);
const TARGET = { mate1: Number(process.env.MATE1 ?? 30), mate2: Number(process.env.MATE2 ?? 50), mate3: Number(process.env.MATE3 ?? 30), material: Number(process.env.MATERIAL ?? 50) };

const vite = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom', logLevel: 'error' });
const { getVariant } = await vite.ssrLoadModule('/src/core/variants.ts');
const V = getVariant(VARIANT);

let seed = SEED;
// mulberry32: целочисленный генератор, разные SEED дают разные последовательности.
const rand = () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const rnd = (n) => Math.floor(rand() * n);
const colorOf = (p) => (p === p.toUpperCase() ? 'w' : 'b');
const opp = (c) => (c === 'w' ? 'b' : 'w');

const PIECES = VARIANT === 'makruk' ? ['R', 'R', 'N', 'N', 'S', 'S', 'M', 'P', 'P', 'P'] : ['R', 'R', 'N', 'N', 'B', 'B', 'Q', 'P', 'P', 'P'];
/** Горизонтали, на которых может стоять пешка стороны (0 — первая). */
const pawnRanks = (c) => (VARIANT === 'makruk' ? (c === 'w' ? [2, 3, 4] : [3, 4, 5]) : [1, 2, 3, 4, 5, 6]);

function randomPosition(nMine, nTheirs) {
  const board = Array(64).fill(null);
  const free = () => {
    for (;;) {
      const s = rnd(64);
      if (!board[s]) return s;
    }
  };
  board[free()] = 'K';
  board[free()] = 'k';
  for (const [c, n] of [['w', nMine], ['b', nTheirs]]) {
    for (let i = 0; i < n; i++) {
      const t = PIECES[rnd(PIECES.length)];
      let s = free();
      if (t === 'P') {
        const ranks = pawnRanks(c);
        for (let k = 0; k < 50 && (board[s] || !ranks.includes(Math.floor(s / 8))); k++) s = rnd(64);
        if (board[s] || !ranks.includes(Math.floor(s / 8))) continue;
      }
      board[s] = c === 'w' ? t : t.toLowerCase();
    }
  }
  const pos = { board, turn: 'w', halfmove: 0, fullmove: 1 };
  // Сторона, которая не ходит, не должна быть под шахом; решающий тоже не под шахом.
  if (V.inCheck({ ...pos, turn: 'b' }) || V.inCheck(pos)) return null;
  // Иногда решают чёрные: отражаем доску.
  if (rand() < 0.5) {
    const flipped = Array(64).fill(null);
    for (let s = 0; s < 64; s++) {
      const p = board[s];
      if (!p) continue;
      const f = s % 8, r = Math.floor(s / 8);
      flipped[(7 - r) * 8 + f] = colorOf(p) === 'w' ? p.toLowerCase() : p.toUpperCase();
    }
    return { board: flipped, turn: 'b', halfmove: 0, fullmove: 1 };
  }
  return pos;
}

/** Итог партии в позиции (без истории): null — игра продолжается. */
const resultOf = (pos) => V.result(pos, []);

/** Может ли сторона, которая ходит, выиграть (любым способом) не больше чем за n своих ходов. */
function wins(pos, n, checksOnly = false) {
  const me = pos.turn;
  for (const m of order(pos, V.legalMoves(pos))) {
    const p2 = V.makeMove(pos, m);
    if (checksOnly && !V.inCheck(p2)) continue;
    const r = resultOf(p2);
    if (r) {
      if (r.winner === me) return true;
      continue;
    }
    if (n > 1 && V.legalMoves(p2).every((d) => wins(V.makeMove(p2, d), n - 1, checksOnly))) return true;
  }
  return false;
}

/** Сначала шахи и взятия — так перебор быстрее находит выигрыш. */
function order(pos, moves) {
  const score = (m) => (pos.board[m.to] ? 2 : 0) + (m.promo ? 1 : 0);
  return moves.sort((a, b) => score(b) - score(a));
}

/** Ходы решающего, выигрывающие не больше чем за n ходов. */
function winningMoves(pos, n, checksOnly) {
  const me = pos.turn;
  const out = [];
  for (const m of V.legalMoves(pos)) {
    const p2 = V.makeMove(pos, m);
    if (checksOnly && !V.inCheck(p2)) continue;
    const r = resultOf(p2);
    if (r) {
      if (r.winner === me) out.push({ m, p2, r });
      continue;
    }
    if (n > 1 && V.legalMoves(p2).every((d) => wins(V.makeMove(p2, d), n - 1, checksOnly))) out.push({ m, p2, r: null });
    if (out.length > 1) break;
  }
  return out;
}

/** Мат ровно в n ходов с единственным решением; возвращает линию или null. */
function solveMate(pos, n, checksOnly = false) {
  // Быстрее нет: иначе это задача на меньшее число ходов.
  for (let k = 1; k < n; k++) if (wins(pos, k)) return null;
  const line = [];
  let cur = pos;
  for (let left = n; left > 0; left--) {
    const ws = winningMoves(cur, left, checksOnly);
    if (ws.length !== 1) return null;
    // Если решающему доступна и задача без ограничения «только шахи» быстрее — не годится (проверено выше).
    const { m, p2, r } = ws[0];
    line.push(V.moveToUci(m));
    if (r) return left === 1 && r.reason === 'checkmate' ? line : null;
    if (left === 1) return null;
    // Защита соперника: дольше всех держится; при равенстве — взятие.
    let best = null;
    for (const d of V.legalMoves(p2)) {
      const p3 = V.makeMove(p2, d);
      const fast = wins(p3, left - 2, checksOnly) && left > 2;
      const key = (fast ? 0 : 10) + (p2.board[d.to] ? 1 : 0);
      if (!best || key > best.key) best = { d, p3, key };
    }
    if (!best) return null;
    line.push(V.moveToUci(best.d));
    cur = best.p3;
  }
  return null;
}

// ---------- Выигрыш материала ----------

const MATE = 1000;
const matOf = (board, c) => board.reduce((s, p) => (p && colorOf(p) === c ? s + V.pieceValue(p) : s), 0);
const evalFor = (pos) => matOf(pos.board, pos.turn) - matOf(pos.board, opp(pos.turn));

function terminalScore(pos) {
  const r = resultOf(pos);
  if (!r) return null;
  return r.winner === null ? 0 : r.winner === pos.turn ? MATE : -MATE;
}

function quiesce(pos, alpha, beta, depth = 0) {
  const t = terminalScore(pos);
  if (t !== null) return t;
  const stand = evalFor(pos);
  if (stand >= beta) return stand;
  if (stand > alpha) alpha = stand;
  if (depth > 6) return alpha;
  for (const m of V.legalMoves(pos)) {
    if (!pos.board[m.to] && !m.promo) continue;
    const v = -quiesce(V.makeMove(pos, m), -beta, -alpha, depth + 1);
    if (v >= beta) return v;
    if (v > alpha) alpha = v;
  }
  return alpha;
}

function search(pos, depth, alpha, beta, pv) {
  const t = terminalScore(pos);
  if (t !== null) return t;
  if (depth === 0) return quiesce(pos, alpha, beta);
  let best = -Infinity;
  for (const m of order(pos, V.legalMoves(pos))) {
    const sub = [];
    const v = -search(V.makeMove(pos, m), depth - 1, -beta, -alpha, sub);
    if (v > best) {
      best = v;
      pv.length = 0;
      pv.push(m, ...sub);
    }
    if (v > alpha) alpha = v;
    if (alpha >= beta) break;
  }
  return best;
}

function solveMaterial(pos) {
  const base = quiesce(pos, -Infinity, Infinity);
  // Уже сейчас что-то висит — это не задача.
  if (base > evalFor(pos) + 0.5) return null;
  const results = [];
  for (const m of V.legalMoves(pos)) {
    const pv = [];
    const v = -search(V.makeMove(pos, m), 2, -Infinity, Infinity, pv);
    results.push({ m, v, pv });
  }
  results.sort((a, b) => b.v - a.v);
  const [a, b] = results;
  if (!a || a.v >= MATE / 2 || a.v - base < 2.5) return null;
  if (b && b.v - base > 0.5) return null;
  // Линия: первый ход, ответ и взятие решающего (нечётная длина).
  const moves = [a.m, ...a.pv].slice(0, 3);
  let cur = pos;
  const line = [];
  for (const m of moves) {
    line.push(V.moveToUci(m));
    cur = V.makeMove(cur, m);
    if (resultOf(cur)) break;
  }
  if (line.length % 2 === 0) line.pop();
  // Проверяем, что к концу линии материал действительно выигран.
  let p = pos;
  for (const u of line) p = V.makeMove(p, V.legalMoves(p).find((m) => V.moveToUci(m) === u));
  const gain = matOf(p.board, pos.turn) - matOf(p.board, opp(pos.turn)) - evalFor(pos);
  if (gain < 2.5) return null;
  return { line, gain: Math.round(a.v - base) === a.v - base ? a.v - base : Math.round((a.v - base) * 4) / 4 };
}

// ---------- Основной цикл ----------

const found = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : [];
const seen = new Set(found.map((p) => p.fen.split(' ').slice(0, 2).join(' ')));
const count = (k) => found.filter((p) => (k === 'material' ? p.goal === 'material' : k === 'mate3' ? p.checksOnly : p.goal === 'mate' && !p.checksOnly && p.mateIn === Number(k.slice(4)))).length;
const need = (k) => count(k) < TARGET[k];
const prefix = VARIANT === 'makruk' ? 'mk' : 'sh';
const deadline = Date.now() + SECONDS * 1000;
let tried = 0;

while (Date.now() < deadline && Object.keys(TARGET).some(need)) {
  const pos = randomPosition(2 + rnd(3), 1 + rnd(4));
  if (!pos || resultOf(pos)) continue;
  const fen = V.toFen(pos);
  const key = fen.split(' ').slice(0, 2).join(' ');
  if (seen.has(key)) continue;
  tried++;
  let item = null;
  if (need('mate1') || need('mate2') || need('mate3')) {
    for (const [k, n, checks] of [['mate1', 1, false], ['mate2', 2, false], ['mate3', 3, true]]) {
      if (!need(k)) continue;
      const line = solveMate(pos, n, checks);
      if (line) {
        item = { goal: 'mate', mateIn: n, line, origin: checks ? 'checks' : 'compose', ...(checks ? { checksOnly: true } : {}) };
        break;
      }
    }
  }
  if (!item && need('material')) {
    const t = solveMaterial(pos);
    if (t) item = { goal: 'material', gain: t.gain, line: t.line, origin: 'compose' };
  }
  if (!item) continue;
  seen.add(key);
  const id = `${prefix}-${(Date.now() % 1e9).toString(36)}${rnd(1296).toString(36)}`;
  const { origin, ...rest } = item;
  found.push({ id, origin, fen, ...rest });
  console.log(`${found.length}: ${item.goal} ${item.mateIn ?? item.gain} ${fen} ${item.line.join(' ')}`);
  writeFileSync(OUT, JSON.stringify(found, null, 1));
}

console.log(`Позиций перебрано: ${tried}; задач: ${found.length} (мат в 1: ${count('mate1')}, в 2: ${count('mate2')}, шахами в 3: ${count('mate3')}, материал: ${count('material')})`);
writeFileSync(OUT, JSON.stringify(found, null, 1));
await vite.close();
