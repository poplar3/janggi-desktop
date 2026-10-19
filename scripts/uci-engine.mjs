// Простая обёртка над Fairy-Stockfish по UCI для скриптов (генерация задач, проверка уроков).
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';

export const ENGINE = process.env.FAIRY_STOCKFISH ?? new URL('../src-tauri/engine/fairy-stockfish', import.meta.url).pathname;

export class Engine {
  constructor() {
    this.proc = spawn(ENGINE, [], { stdio: ['pipe', 'pipe', 'ignore'] });
    this.waiters = [];
    this.buf = [];
    createInterface({ input: this.proc.stdout }).on('line', (l) => {
      this.buf.push(l);
      const w = this.waiters[0];
      if (w && w.test(l)) {
        this.waiters.shift();
        w.resolve(this.buf.splice(0));
      }
    });
    this.multipv = 0;
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
    this.send('setoption name Threads value 1');
    this.send('setoption name Hash value 64');
    this.send('isready');
    await this.wait((l) => l === 'readyok');
  }
  /** Линии последней завершённой глубины, лучшая первой. */
  async search(fen, depth, multipv) {
    if (multipv !== this.multipv) {
      this.send(`setoption name MultiPV value ${multipv}`);
      this.multipv = multipv;
    }
    this.buf = [];
    this.send(`position fen ${fen}`);
    this.send(`go depth ${depth}`);
    const out = await this.wait((l) => l.startsWith('bestmove'));
    const byDepth = new Map();
    for (const l of out) {
      const m = /^info .*?\bdepth (\d+) .*?\bmultipv (\d+) .*?\bscore (cp|mate) (-?\d+).*?\bpv (.+)$/.exec(l);
      if (!m) continue;
      const d = +m[1];
      if (!byDepth.has(d)) byDepth.set(d, []);
      const arr = byDepth.get(d);
      arr[+m[2] - 1] = { score: m[3] === 'cp' ? { cp: +m[4] } : { mate: +m[4] }, pv: m[5].trim().split(/\s+/) };
    }
    const depths = [...byDepth.keys()].sort((a, b) => b - a);
    for (const d of depths) {
      const arr = byDepth.get(d).filter(Boolean);
      if (arr.length && byDepth.get(d)[0]) return arr;
    }
    return [];
  }
  quit() {
    this.send('quit');
  }
}

/** Пропуск хода: генерал «ходит» на своё же поле (e2e2). Номер горизонтали может быть двузначным (h1h10). */
export function isPassUci(u) {
  const m = /^([a-i]\d+)([a-i]\d+)$/.exec(u);
  return !!m && m[1] === m[2];
}
