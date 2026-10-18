// Генерирует эталонные позиции и списки легальных ходов с помощью Fairy-Stockfish.
// Использование: node scripts/gen-movegen-fixtures.mjs <путь к fairy-stockfish> [игр] [seed]
// Результат: src/core/__fixtures__/fsf-movegen.json
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { createInterface } from 'node:readline';

const [enginePath, gamesArg = '60', seedArg = '1'] = process.argv.slice(2);
if (!enginePath) {
  console.error('Укажите путь к движку');
  process.exit(1);
}

let seed = Number(seedArg);
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);

const proc = spawn(enginePath, [], { stdio: ['pipe', 'pipe', 'inherit'] });
const rl = createInterface({ input: proc.stdout });
let waiter = null;
let buf = [];
rl.on('line', (line) => {
  buf.push(line);
  if (waiter && waiter.done(line)) {
    const w = waiter;
    waiter = null;
    w.resolve(buf);
    buf = [];
  }
});
const send = (cmd, done) =>
  new Promise((resolve) => {
    buf = [];
    waiter = { done, resolve };
    proc.stdin.write(cmd + '\n');
  });

await send('uci', (l) => l === 'uciok');
await send('setoption name UCI_Variant value janggi\nisready', (l) => l === 'readyok');

const SETUPS = ['rnba1abnr', 'rbna1anbr', 'rnba1anbr', 'rbna1abnr'];
const positions = [];
for (let g = 0; g < Number(gamesArg); g++) {
  const top = SETUPS[Math.floor(rand() * 4)];
  const bottom = SETUPS[Math.floor(rand() * 4)].toUpperCase();
  const startFen = `${top}/4k4/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/4K4/${bottom} w - - 0 1`;
  const moves = [];
  for (let ply = 0; ply < 160; ply++) {
    const pos = `position fen ${startFen}${moves.length ? ' moves ' + moves.join(' ') : ''}`;
    const out = await send(`${pos}\ngo perft 1`, (l) => l.startsWith('Nodes searched'));
    const legal = out.filter((l) => /^[a-i]\d+[a-i]\d+: 1$/.test(l)).map((l) => l.split(':')[0]).sort();
    const d = await send('d', (l) => l.startsWith('Chased'));
    const fen = d.find((l) => l.startsWith('Fen: ')).slice(5);
    if (ply % 4 === 0) positions.push([fen, legal.join(' ')]);
    if (!legal.length) break;
    // Пропуск хода выбираем редко, иначе партии быстро заканчиваются
    const nonPass = legal.filter((m) => { const [, a, b] = /^([a-i]\d+)([a-i]\d+)$/.exec(m); return a !== b; });
    const pool = nonPass.length && rand() < 0.97 ? nonPass : legal;
    moves.push(pool[Math.floor(rand() * pool.length)]);
  }
}
proc.stdin.write('quit\n');
mkdirSync('src/core/__fixtures__', { recursive: true });
writeFileSync('src/core/__fixtures__/fsf-movegen.json', JSON.stringify(positions));
console.log(`Позиций: ${positions.length}`);
