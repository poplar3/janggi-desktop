// Импорт настоящих корейских задач 박보 из DOS-игры «박보장기 1.0» (50 국면).
// Позиции переписаны с картинок прохождения в блоге enky1 (см. SOURCE ниже) в scripts/data/bakbo-classic.json:
// доска повёрнута на 180°, чтобы Чо (синие, защита) стоял внизу, как в остальных задачах приложения;
// нападает и ходит первым Хан (красные). moves — «남은 수», число ходов решающего по условию игры.
// Каждая задача проверяется Fairy-Stockfish: мат форсируется ровно за moves ходов при лучшей защите.
// Задачи, где защита находит спасение или мат дольше (в DOS-игре соперник отвечал заданными ходами),
// пропускаются. Если на каком-то ходу есть другой ход, ведущий к мату за то же число ходов,
// он сохраняется в alts вместе с продолжением, и приложение засчитывает его.
// Использование: FAIRY_STOCKFISH=<путь> node scripts/import-bakbo-classic.mjs
import { Engine, isPassUci } from './uci-engine.mjs';
import { readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'vite';

const SOURCE = [
  { url: 'https://enky1.blogspot.com/2015/09/10-1.html', title: '[공략] 박보장기 1.0 — 1화 (1~25국면)' },
  { url: 'https://enky1.blogspot.com/2015/09/10-2-2650.html', title: '[공략] 박보장기 1.0 — 2화 (26~50국면)' },
];
const IN = new URL('./data/bakbo-classic.json', import.meta.url).pathname;
const OUT = new URL('../src/puzzles/classic.json', import.meta.url).pathname;

const vite = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom', logLevel: 'error' });
const R = await vite.ssrLoadModule('/src/core/rules.ts');
const { Game } = await vite.ssrLoadModule('/src/core/game.ts');
const fenOf = (g) => R.toFen({ ...g.position, halfmove: 0, fullmove: 1 });

const eng = new Engine();
await eng.init();

/**
 * Решение из позиции g: мат ровно за left ходов. Возвращает линию от текущего хода
 * и альтернативы решающего (с номером полухода от начала задачи), если withAlts.
 */
async function solve(g, left, ply, withAlts) {
  const solver = g.turn;
  const line = [];
  const alts = [];
  for (; left > 0; left--) {
    const ls = await eng.search(fenOf(g), Math.max(14, 2 * left + 10), left > 1 ? 3 : 1);
    const top = ls[0];
    if (!top || top.score.mate === undefined || top.score.mate <= 0 || top.score.mate > left) return null;
    const mv = top.pv[0];
    if (isPassUci(mv)) return null;
    if (withAlts && left > 1) {
      for (const l of ls.slice(1)) {
        if (l.score.mate === undefined || l.score.mate <= 0 || l.score.mate > left || isPassUci(l.pv[0])) continue;
        const probe = new Game(fenOf(g));
        probe.playUci(l.pv[0]);
        const def = await eng.search(fenOf(probe), 12, 1);
        if (!def[0]) continue;
        probe.playUci(def[0].pv[0]);
        const rest = await solve(probe, left - 1, 0, false);
        if (rest) alts.push({ at: ply + line.length, line: [l.pv[0], def[0].pv[0], ...rest.line] });
      }
    }
    g.playUci(mv);
    line.push(mv);
    const res = g.result();
    if (res) return res.reason === 'checkmate' && res.winner === solver ? { line, alts } : null;
    if (left === 1) return null;
    const def = await eng.search(fenOf(g), 12, 1);
    if (!def[0]) return null;
    g.playUci(def[0].pv[0]);
    line.push(def[0].pv[0]);
    if (g.result()) return null;
  }
  return null;
}

const out = [];
for (const { n, fen, moves } of JSON.parse(readFileSync(IN, 'utf8'))) {
  const g = new Game(fen);
  const r = await solve(g, moves, 0, true);
  if (!r || r.line.length !== 2 * moves - 1) {
    console.log(`№ ${n}: мат за ${moves} не подтверждается, пропускаю`);
    continue;
  }
  // Все ходы решающего — шахи: задача попадает и в «Шах за шахом».
  const replay = new Game(fen);
  const checksOnly = r.line.every((u, i) => {
    const h = replay.playUci(u);
    return i % 2 === 1 || h.check;
  });
  const src = SOURCE[n <= 25 ? 0 : 1];
  out.push({
    id: `classic-${String(n).padStart(2, '0')}`,
    origin: 'classic',
    number: n,
    fen,
    ...(checksOnly ? { checksOnly } : {}),
    goal: 'mate',
    mateIn: moves,
    line: r.line,
    ...(r.alts.length ? { alts: r.alts } : {}),
    source: { author: `박보장기 1.0, 국면 ${n}`, title: src.title, url: src.url },
  });
  console.log(`№ ${n}: мат в ${moves}${r.alts.length ? `, альтернатив: ${r.alts.length}` : ''}`);
}
writeFileSync(OUT, JSON.stringify(out, null, 1) + '\n');
eng.quit();
await vite.close();
console.log(`Готово: ${out.length} задач в ${OUT}`);
