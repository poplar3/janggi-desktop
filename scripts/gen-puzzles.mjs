// Генератор собственных задач: движок играет партии сам с собой со случайностью,
// в найденных позициях ищутся форсированные маты и выигрыш материала,
// и каждая задача проверяется на единственность решения.
// В режиме MODE=compose вместо партий перебираются случайные позиции с небольшим числом фигур
// (как в составленных задачах 묘수풀이) и в них ищутся маты в 2–4 хода.
// Использование: FAIRY_STOCKFISH=<путь> [MODE=compose] node scripts/gen-puzzles.mjs [число_партий|число_позиций] [выход.json]
import { Engine, isPassUci } from './uci-engine.mjs';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createServer } from 'vite';

const GAMES = Number(process.argv[2] ?? 40);
const OUT = process.argv[3] ?? new URL('../src/puzzles/generated.json', import.meta.url).pathname;
const WORKERS = Number(process.env.WORKERS ?? 4);
const MODE = process.env.MODE ?? 'games';
const MIN_MATE = Number(process.env.MIN_MATE ?? 2);

const vite = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom', logLevel: 'error' });
const R = await vite.ssrLoadModule('/src/core/rules.ts');
const { Game } = await vite.ssrLoadModule('/src/core/game.ts');

const val = (s) => (s.mate !== undefined ? (s.mate > 0 ? 100000 - s.mate : -100000 - s.mate) : s.cp);
const rnd = (n) => Math.floor(Math.random() * n);
const material = (board, c) => R.materialPoints(board, c) - (c === 'b' ? R.HAN_BONUS : 0);
const fenOf = (g) => R.toFen({ ...g.position, halfmove: 0, fullmove: 1 });

/** Мат в N с единственным решением на каждом ходе решающего (кроме последнего). */
async function verifyMate(eng, fen, n) {
  const g = new Game(fen);
  const solver = g.turn;
  const line = [];
  for (let left = n; left > 0; left--) {
    const ls = await eng.search(fenOf(g), Math.max(12, 2 * left + 8), left > 1 ? 2 : 1);
    const top = ls[0];
    if (!top || top.score.mate === undefined || top.score.mate <= 0 || top.score.mate > left) return null;
    // Другой ход может тоже вести к мату, но только медленнее — иначе решение не единственное.
    if (left > 1 && ls[1] && ls[1].score.mate !== undefined && ls[1].score.mate > 0 && ls[1].score.mate <= left) return null;
    const mv = top.pv[0];
    if (isPassUci(mv)) return null;
    g.playUci(mv);
    line.push(mv);
    const res = g.result();
    if (res) return res.reason === 'checkmate' && res.winner === solver && left === 1 ? line : null;
    if (left === 1) return null;
    const def = await eng.search(fenOf(g), 10, 1);
    if (!def[0]) return null;
    g.playUci(def[0].pv[0]);
    line.push(def[0].pv[0]);
    if (g.result()) return null;
  }
  return null;
}

/** Выигрыш не меньше 3 очков материала с единственным сильным ходом на каждом шаге. */
async function verifyTactic(eng, fen) {
  const g = new Game(fen);
  const solver = g.turn;
  const opp = R.opposite(solver);
  const start = material(g.position.board, solver) - material(g.position.board, opp);
  if (Math.abs(start) > 6) return null;
  const line = [];
  for (let step = 0; step < 3; step++) {
    const ls = await eng.search(fenOf(g), 14, 2);
    const [a, b] = ls;
    if (!a || a.score.mate !== undefined) return null;
    if (a.score.cp < 250) return null;
    if (b && val(a.score) - val(b.score) < 250) return null;
    const mv = a.pv[0];
    if (isPassUci(mv)) return null;
    g.playUci(mv);
    line.push(mv);
    if (g.result()) return null;
    // Ответ соперника — лучший по движку.
    const def = await eng.search(fenOf(g), 12, 1);
    if (!def[0]) return null;
    const reply = def[0].pv[0];
    // Если решающий уже выиграл материал и ответ ничего не возвращает, задача закончена.
    const gainNow = material(g.position.board, solver) - material(g.position.board, opp) - start;
    const g2 = new Game(fenOf(g));
    g2.playUci(reply);
    const gainAfterReply = material(g2.position.board, solver) - material(g2.position.board, opp) - start;
    if (gainNow >= 3 && gainAfterReply >= 3) return { line, gain: gainAfterReply };
    g.playUci(reply);
    line.push(reply);
    if (g.result()) return null;
  }
  return null;
}

const found = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : [];
const seen = new Set(found.map((p) => p.fen.split(' ').slice(0, 2).join(' ')));
let gamesLeft = GAMES;

async function worker(id) {
  const eng = new Engine();
  await eng.init();
  while (gamesLeft-- > 0) {
    const s = () => R.SETUPS[rnd(4)].id;
    const g = new Game(R.startFenWithSetups(s(), s()));
    const gameId = Math.random().toString(36).slice(2, 8);
    for (let ply = 0; ply < 160 && !g.result(); ply++) {
      const fen = fenOf(g);
      const key = fen.split(' ').slice(0, 2).join(' ');
      if (ply >= 12 && !seen.has(key)) {
        const quick = await eng.search(fen, 9, 2);
        const top = quick[0];
        if (top && top.score.mate !== undefined && top.score.mate > 0 && top.score.mate <= 4) {
          const line = await verifyMate(eng, fen, top.score.mate);
          if (line) {
            seen.add(key);
            found.push({ fen, goal: 'mate', mateIn: top.score.mate, line, game: gameId, ply });
            console.log(`[${id}] мат в ${top.score.mate}: ${fen} ${line.join(' ')}`);
          }
        } else if (top && top.score.cp >= 300 && (!quick[1] || val(top.score) - val(quick[1].score) >= 250)) {
          const t = await verifyTactic(eng, fen);
          if (t) {
            seen.add(key);
            found.push({ fen, goal: 'material', gain: t.gain, line: t.line, game: gameId, ply });
            console.log(`[${id}] +${t.gain}: ${fen} ${t.line.join(' ')}`);
          }
        }
      }
      // Ход партии: случайный среди близких по силе, иногда заметно слабее — чтобы появлялись тактические позиции.
      const ls = await eng.search(fen, 6, 4);
      if (!ls.length) break;
      const best = val(ls[0].score);
      const margin = Math.random() < 0.12 ? 400 : 60;
      const cands = ls.filter((l) => best - val(l.score) <= margin);
      const pick = cands[rnd(cands.length)].pv[0];
      try {
        g.playUci(pick);
      } catch {
        break;
      }
    }
    writeFileSync(OUT, JSON.stringify(found, null, 1));
    console.log(`[${id}] партия сыграна, всего задач: ${found.length}`);
  }
  eng.quit();
}


const PALACE = { w: [3, 4, 5].flatMap((f) => [0, 1, 2].map((r) => R.sq(f, r))), b: [3, 4, 5].flatMap((f) => [7, 8, 9].map((r) => R.sq(f, r))) };
const pickFree = (board, squares) => {
  const free = squares.filter((s) => !board[s]);
  return free.length ? free[rnd(free.length)] : -1;
};
const ALL = Array.from({ length: 90 }, (_, i) => i);
/** Поля, где фигура данного типа может стоять в настоящей партии. */
function squaresFor(t, c) {
  if (t === 'A') return PALACE[c];
  if (t === 'P') return ALL.filter((s) => (c === 'w' ? R.rankOf(s) >= 3 : R.rankOf(s) <= 6));
  return ALL;
}

function randomPosition() {
  const att = Math.random() < 0.5 ? 'w' : 'b';
  const def = R.opposite(att);
  const board = Array(90).fill(null);
  const put = (t, c) => {
    const s = pickFree(board, t === 'K' ? PALACE[c] : squaresFor(t, c));
    if (s >= 0) board[s] = c === 'w' ? t : t.toLowerCase();
  };
  put('K', def);
  put('K', att);
  for (let i = rnd(3); i > 0; i--) put('A', def);
  const defExtra = ['P', 'P', 'N', 'B', 'C', 'R'];
  for (let i = rnd(3); i > 0; i--) put(defExtra[rnd(defExtra.length)], def);
  for (let i = rnd(2); i > 0; i--) put('A', att);
  const attPool = ['R', 'R', 'C', 'C', 'N', 'N', 'B', 'B', 'P', 'P', 'P'];
  for (let i = 2 + rnd(3); i > 0; i--) put(attPool.splice(rnd(attPool.length), 1)[0], att);
  const pos = { board, turn: att, halfmove: 0, fullmove: 1 };
  if (R.inCheck(board, def) || R.inCheck(board, att) || R.generalsFacing(board)) return null;
  // Две пушки на одной линии с генералом и прочие экзотические случаи отсеет движок; здесь — только базовая законность.
  return R.toFen(pos);
}

let positionsLeft = GAMES;
async function composer(id) {
  const eng = new Engine();
  await eng.init();
  while (positionsLeft-- > 0) {
    const fen = randomPosition();
    if (!fen) continue;
    const key = fen.split(' ').slice(0, 2).join(' ');
    if (seen.has(key)) continue;
    const quick = await eng.search(fen, 8, 1);
    const top = quick[0];
    if (!top || top.score.mate === undefined || top.score.mate < MIN_MATE || top.score.mate > 4) continue;
    const line = await verifyMate(eng, fen, top.score.mate);
    if (!line) continue;
    seen.add(key);
    found.push({ fen, goal: 'mate', mateIn: top.score.mate, line, game: 'compose' });
    console.log(`[${id}] этюд, мат в ${top.score.mate}: ${fen} ${line.join(' ')}`);
    if (found.length % 5 === 0) writeFileSync(OUT, JSON.stringify(found, null, 1));
  }
  eng.quit();
}

await Promise.all(Array.from({ length: WORKERS }, (_, i) => (MODE === 'compose' ? composer(i) : worker(i))));
writeFileSync(OUT, JSON.stringify(found, null, 1));
await vite.close();
console.log(`Готово: ${found.length} задач в ${OUT}`);
