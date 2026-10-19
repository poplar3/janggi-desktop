// Матч двух настроек движка друг против друга — чтобы проверить, что изменение настроек действительно
// усиливает игру. Каждая пара партий играется с одной расстановкой и сменой цветов.
// Настройки задаются JSON-объектами опций UCI, например '{"EvalFile":"/путь/janggi.nnue"}' или '{"Threads":3}'.
// Использование: FAIRY_STOCKFISH=<путь> node scripts/engine-match.mjs '<опции A>' '<опции B>' [пар партий] [мс на ход] [одновременно]
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { createServer } from 'vite';
import { ENGINE } from './uci-engine.mjs';

const [optsA, optsB] = [JSON.parse(process.argv[2] ?? '{}'), JSON.parse(process.argv[3] ?? '{}')];
const PAIRS = Number(process.argv[4] ?? 10);
const MOVETIME = Number(process.argv[5] ?? 200);
const PARALLEL = Number(process.argv[6] ?? 2);

const vite = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom', logLevel: 'error' });
const R = await vite.ssrLoadModule('/src/core/rules.ts');
const { Game } = await vite.ssrLoadModule('/src/core/game.ts');

class Player {
  constructor(opts) {
    this.proc = spawn(ENGINE, [], { stdio: ['pipe', 'pipe', 'ignore'] });
    this.waiters = [];
    createInterface({ input: this.proc.stdout }).on('line', (l) => {
      const w = this.waiters[0];
      if (w && w.test(l)) {
        this.waiters.shift();
        w.resolve(l);
      }
    });
    this.opts = opts;
  }
  send(s) {
    this.proc.stdin.write(s + '\n');
  }
  wait(test) {
    return new Promise((resolve) => this.waiters.push({ test, resolve }));
  }
  async init() {
    this.send('uci');
    await this.wait((l) => l === 'uciok');
    this.send('setoption name UCI_Variant value janggi');
    for (const [k, v] of Object.entries({ Threads: 1, Hash: 64, ...this.opts })) this.send(`setoption name ${k} value ${v}`);
    this.send('isready');
    await this.wait((l) => l === 'readyok');
  }
  async move(fen, moves) {
    this.send(`position fen ${fen}${moves.length ? ' moves ' + moves.join(' ') : ''}`);
    this.send(`go movetime ${MOVETIME}`);
    return (await this.wait((l) => l.startsWith('bestmove'))).split(/\s+/)[1];
  }
  quit() {
    this.send('quit');
  }
}

/** Партия: возвращает 'A', 'B' или null при сбое. */
async function play(fen, aIsCho) {
  const a = new Player(optsA);
  const b = new Player(optsB);
  await Promise.all([a.init(), b.init()]);
  const g = new Game(fen);
  const moves = [];
  try {
    while (!g.result()) {
      const cho = g.turn === 'w';
      const p = cho === aIsCho ? a : b;
      const m = await p.move(fen, moves);
      if (!m || m === '(none)') break;
      g.playUci(m);
      moves.push(m);
    }
  } finally {
    a.quit();
    b.quit();
  }
  const r = g.result();
  if (!r) return null;
  return { winner: (r.winner === 'w') === aIsCho ? 'A' : 'B', reason: r.reason, plies: moves.length };
}

const ids = R.SETUPS.map((s) => s.id);
const jobs = [];
for (let i = 0; i < PAIRS; i++) {
  const fen = R.startFenWithSetups(ids[i % 4], ids[Math.floor(i / 4) % 4]);
  jobs.push([fen, true], [fen, false]);
}
const score = { A: 0, B: 0 };
let next = 0;
await Promise.all(
  Array.from({ length: PARALLEL }, async () => {
    while (next < jobs.length) {
      const [fen, aIsCho] = jobs[next++];
      const r = await play(fen, aIsCho);
      if (!r) continue;
      score[r.winner]++;
      console.log(`A за ${aIsCho ? 'Чо' : 'Хан'}: победил ${r.winner} (${r.reason}, ${r.plies} пл.)  счёт A ${score.A} : ${score.B} B`);
    }
  }),
);
await vite.close();
const n = score.A + score.B;
const p = score.A / n;
const elo = p > 0 && p < 1 ? Math.round(-400 * Math.log10(1 / p - 1)) : p === 1 ? Infinity : -Infinity;
console.log(`Итог: A ${score.A} : ${score.B} B из ${n}, разница ≈ ${elo} Elo в пользу A`);
