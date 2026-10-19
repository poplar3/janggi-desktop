// Проверка, что движок запускается, знает вариант janggi, играет с нейросетью Чанги и находит ход.
// Использование: node scripts/engine-smoke.mjs <путь к движку>
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';

const proc = spawn(process.argv[2], [], { stdio: ['pipe', 'pipe', 'inherit'] });
const timer = setTimeout(() => {
  console.error('Движок не ответил за 60 с');
  process.exit(1);
}, 60000);
const lines = [];
createInterface({ input: proc.stdout }).on('line', (l) => {
  lines.push(l);
  if (l.startsWith('bestmove')) {
    clearTimeout(timer);
    console.log(lines.filter((x) => x.startsWith('id name') || x.includes('evaluation') || x.includes(' depth 12 ') || x.startsWith('bestmove')).join('\n'));
    proc.stdin.write('quit\n');
    const nnue = lines.some((x) => /^info string NNUE evaluation using .*janggi.*enabled/.test(x));
    if (!nnue) console.error('Движок работает без нейросети Чанги');
    process.exit(nnue && /^bestmove [a-i]\d+[a-i]\d+/.test(l) ? 0 : 1);
  }
});
proc.stdin.write('uci\nsetoption name UCI_Variant value janggi\nposition startpos moves e4e5\ngo depth 12\n');
