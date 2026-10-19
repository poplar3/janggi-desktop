// Проверка позиций курса движком.
//   node scripts/verify-lessons.mjs           — все задания «найдите ход» и «лучший ход» во всех уроках
//   node scripts/verify-lessons.mjs '<FEN>'   — лучшие ходы в одной позиции (для составления уроков)
//   node scripts/verify-lessons.mjs w '{"e2":"K","e9":"k"}' — то же для позиции в записи pos() из уроков
// Путь к движку: FAIRY_STOCKFISH=<путь>.
import { createServer } from 'vite';
import { Engine } from './uci-engine.mjs';

const DEPTH = Number(process.env.DEPTH ?? 16);
const vite = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom', logLevel: 'error' });
const { describePlan } = await vite.ssrLoadModule('/src/analysis/plan.ts');
const { LESSONS } = await vite.ssrLoadModule('/src/training/lessons.ts');
const { pos } = await vite.ssrLoadModule('/src/training/pos.ts');
const eng = new Engine();
await eng.init();

const val = (s) => (s.mate !== undefined ? (s.mate > 0 ? 100000 - s.mate : -100000 - s.mate) : s.cp);
const fmt = (s) => (s.mate !== undefined ? `мат ${s.mate}` : (s.cp / 100).toFixed(2));

async function probe(fen, multipv = 5) {
  const lines = await eng.search(fen, DEPTH, multipv);
  for (const l of lines) console.log(`  ${fmt(l.score).padStart(8)}  ${describePlan(fen, l.pv, 7).moves.join(', ')}   [${l.pv.slice(0, 3).join(' ')}]`);
  return lines;
}

let problems = 0;
if (process.argv[3]) {
  const fen = pos(process.argv[2], JSON.parse(process.argv[3]));
  console.log(fen);
  await probe(fen);
} else if (process.argv[2]) {
  await probe(process.argv[2]);
} else {
  for (const lesson of LESSONS) {
    for (const [i, t] of lesson.tasks.entries()) {
      if (t.kind !== 'find' && t.kind !== 'best') continue;
      if (t.kind === 'find' && t.line) continue;
      console.log(`${lesson.id} #${i + 1} (${t.kind}${t.goal ? ' ' + t.goal : ''}): ${t.prompt}`);
      const lines = await probe(t.fen, 4);
      if (t.kind === 'best' && lines[1] && val(lines[0].score) - val(lines[1].score) <= (t.tolerance ?? 60)) {
        // Не ошибка: засчитаются оба хода, но объяснение должно подходить к обоим.
        console.log('  ... второй ход тоже будет засчитан');
      }
      if (t.kind === 'find' && t.goal === 'exact') {
        const ok = lines.filter((l) => t.moves.includes(l.pv[0]));
        const bad = lines.filter((l) => !t.moves.includes(l.pv[0]));
        // Ожидаемый ход должен быть лучшим, а если позиция не матовая — заметно лучше остальных.
        const top = lines[0] && t.moves.includes(lines[0].pv[0]);
        const clear = !bad[0] || bad[0].score.mate !== undefined || ok[0]?.score.mate !== undefined || val(bad[0].score) < val(ok[0].score) - 100;
        if (!ok.length || !top || !clear) {
          problems++;
          console.log('  !!! ожидаемый ход не выделяется среди лучших');
        }
      }
    }
  }
  console.log(problems ? `Проблем: ${problems}` : 'Все позиции в порядке');
}
eng.quit();
await vite.close();
