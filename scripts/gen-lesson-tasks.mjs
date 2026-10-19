// Поиск позиций для продвинутых уроков. Результат — кандидаты, из которых задания отбираются вручную
// и снабжаются объяснениями; каждое задание затем проверяется scripts/verify-lessons.mjs.
//   MODE=defense — в позициях задач на мат ход передаётся защищающейся стороне; ищутся позиции,
//                  где спасает ровно один ход (остальные ведут к мату или к большой потере).
//   MODE=games   — движок играет партии сам с собой; ищутся позиции, где лучший ход заметно сильнее
//                  остальных (дебют, тихий ход в миттельшпиле, пропуск хода, единственная защита).
//   MODE=pass    — случайные эндшпильные позиции, в которых лучший ход — пропуск (цугцванг соперника).
// Использование: FAIRY_STOCKFISH=<путь> MODE=defense|games node scripts/gen-lesson-tasks.mjs <вход.json|число_партий> <выход.json>
import { Engine, isPassUci } from './uci-engine.mjs';
import { readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'vite';

const MODE = process.env.MODE ?? 'games';
const DEPTH = Number(process.env.DEPTH ?? 14);
const WORKERS = Number(process.env.WORKERS ?? 4);
const OUT = process.argv[3] ?? 'lesson-candidates.json';

const vite = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom', logLevel: 'error' });
const R = await vite.ssrLoadModule('/src/core/rules.ts');
const { Game } = await vite.ssrLoadModule('/src/core/game.ts');
const { describePlan } = await vite.ssrLoadModule('/src/analysis/plan.ts');

const val = (s) => (s.mate !== undefined ? (s.mate > 0 ? 100000 - s.mate : -100000 - s.mate) : s.cp);
const rnd = (n) => Math.floor(Math.random() * n);
const fenOf = (g) => R.toFen({ ...g.position, halfmove: 0, fullmove: 1 });
const found = [];
const seen = new Set();

function record(kind, fen, lines, extra = {}) {
  const key = fen.split(' ').slice(0, 2).join(' ');
  if (seen.has(key)) return;
  seen.add(key);
  const g = new Game(fen);
  const h = new Game(fen).playUci(lines[0].pv[0]);
  found.push({
    kind,
    fen,
    best: lines[0].pv[0],
    capture: !!h.captured,
    check: h.check,
    lines: lines.map((l) => ({ score: l.score, pv: l.pv.slice(0, 6), text: describePlan(fen, l.pv, 6).moves.join(', ') })),
    turn: g.turn,
    ...extra,
  });
  console.log(`${kind}: ${fen}  ${found.at(-1).lines[0].text}`);
}

/** Только один ход не проигрывает: у лучшего оценка терпимая, у второго — мат или потеря. */
function onlyMove(lines, minGap) {
  const [a, b] = lines;
  if (!a || !b) return false;
  if (a.score.mate !== undefined && a.score.mate < 0) return false;
  if (val(a.score) < -250) return false;
  return val(a.score) - val(b.score) >= minGap;
}

async function defense() {
  const src = JSON.parse(readFileSync(process.argv[2], 'utf8')).filter((p) => p.goal === 'mate');
  let i = 0;
  await Promise.all(
    Array.from({ length: WORKERS }, async () => {
      const eng = new Engine();
      await eng.init();
      while (i < src.length) {
        const p = src[i++];
        const pos = R.parseFen(p.fen);
        const flipped = { ...pos, turn: R.opposite(pos.turn), halfmove: 0, fullmove: 1 };
        // Сторона, которая теперь не ходит, не должна быть под шахом.
        if (R.inCheck(pos.board, pos.turn)) continue;
        const fen = R.toFen(flipped);
        if (new Game(fen).legalMoves().length < 2) continue;
        const lines = await eng.search(fen, DEPTH, 3);
        if (onlyMove(lines, 600)) record('defense', fen, lines, { from: p.fen, threat: p.line });
      }
      eng.quit();
    }),
  );
}

async function games() {
  let left = Number(process.argv[2] ?? 20);
  await Promise.all(
    Array.from({ length: WORKERS }, async () => {
      const eng = new Engine();
      await eng.init();
      while (left-- > 0) {
        const s = () => R.SETUPS[rnd(4)].id;
        const g = new Game(R.startFenWithSetups(s(), s()));
        for (let ply = 0; ply < 140 && !g.result(); ply++) {
          const fen = fenOf(g);
          // Быстрый отсев на малой глубине: глубоко считаем только позиции с заметным разрывом.
          const quick = ply >= 4 ? await eng.search(fen, 8, 2) : [];
          if (quick[1] && val(quick[0].score) - val(quick[1].score) >= 80) {
            const lines = await eng.search(fen, DEPTH, 3);
            const [a, b] = lines;
            if (a && b && a.score.mate === undefined && Math.abs(a.score.cp) < 600) {
              const gap = val(a.score) - val(b.score);
              const h = new Game(fen).playUci(a.pv[0]);
              if (isPassUci(a.pv[0]) && gap >= 60) record('pass', fen, lines, { ply });
              else if (ply < 20 && gap >= 120) record('opening', fen, lines, { ply });
              else if (onlyMove(lines, 400) && R.inCheck(g.position.board, g.turn) === false && a.score.cp < 100) record('hold', fen, lines, { ply });
              else if (!h.captured && !h.check && gap >= 150) record('quiet', fen, lines, { ply });
              else if (gap >= 200 && ply >= 20) record('middle', fen, lines, { ply });
            }
          }
          const ls = await eng.search(fen, 6, 4);
          if (!ls.length) break;
          const best = val(ls[0].score);
          const margin = Math.random() < 0.1 ? 300 : 50;
          const cands = ls.filter((l) => best - val(l.score) <= margin);
          try {
            g.playUci(cands[rnd(cands.length)].pv[0]);
          } catch {
            break;
          }
        }
        writeFileSync(OUT, JSON.stringify(found, null, 1));
      }
      eng.quit();
    }),
  );
}

const PALACE = { w: [3, 4, 5].flatMap((f) => [0, 1, 2].map((r) => R.sq(f, r))), b: [3, 4, 5].flatMap((f) => [7, 8, 9].map((r) => R.sq(f, r))) };
const ALL = Array.from({ length: 90 }, (_, i) => i);

function randomEndgame() {
  const board = Array(90).fill(null);
  const put = (t, c) => {
    const squares = t === 'K' || t === 'A' ? PALACE[c] : t === 'P' ? ALL.filter((s) => (c === 'w' ? R.rankOf(s) >= 3 : R.rankOf(s) <= 6)) : ALL;
    const free = squares.filter((s) => !board[s]);
    if (free.length) board[free[rnd(free.length)]] = c === 'w' ? t : t.toLowerCase();
  };
  for (const c of ['w', 'b']) {
    put('K', c);
    for (let i = rnd(3); i > 0; i--) put('A', c);
    const pool = ['R', 'C', 'N', 'N', 'B', 'B', 'P', 'P', 'P'];
    for (let i = 1 + rnd(3); i > 0; i--) put(pool.splice(rnd(pool.length), 1)[0], c);
  }
  const turn = Math.random() < 0.5 ? 'w' : 'b';
  if (R.inCheck(board, 'w') || R.inCheck(board, 'b') || R.generalsFacing(board)) return null;
  return R.toFen({ board, turn, halfmove: 0, fullmove: 1 });
}

async function passes() {
  let left = Number(process.argv[2] ?? 2000);
  await Promise.all(
    Array.from({ length: WORKERS }, async () => {
      const eng = new Engine();
      await eng.init();
      while (left-- > 0) {
        const fen = randomEndgame();
        if (!fen) continue;
        const quick = await eng.search(fen, 8, 2);
        if (!quick[0] || !isPassUci(quick[0].pv[0])) continue;
        const lines = await eng.search(fen, DEPTH, 3);
        const [a, b] = lines;
        if (!a || !b || !isPassUci(a.pv[0]) || a.score.mate !== undefined || a.score.cp < -300 || a.score.cp > 600) continue;
        if (val(a.score) - val(b.score) >= 50) record('pass', fen, lines);
        if (found.length % 5 === 0) writeFileSync(OUT, JSON.stringify(found, null, 1));
      }
      eng.quit();
    }),
  );
}

await (MODE === 'defense' ? defense() : MODE === 'pass' ? passes() : games());
writeFileSync(OUT, JSON.stringify(found, null, 1));
await vite.close();
console.log(`Готово: ${found.length} позиций в ${OUT}`);
