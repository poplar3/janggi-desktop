// Отбор сбалансированного набора задач из сырого вывода gen-puzzles.mjs в src/puzzles/own.json.
// Использование: node scripts/select-puzzles.mjs сырой1.json [сырой2.json …]
import { readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'vite';

const OUT = new URL('../src/puzzles/own.json', import.meta.url).pathname;
/** Не больше стольких задач с одним главным приёмом на одном уровне. */
const PER_BUCKET = 10;
/** Не больше стольких задач из одной партии. */
const PER_GAME = 2;

const vite = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom', logLevel: 'error' });
const { annotate } = await vite.ssrLoadModule('/src/puzzles/annotate.ts');

// Стабильный id по позиции, чтобы прогресс игрока не терялся при пересборке набора.
const hash = (s) => {
  let h = 0x811c9dc5;
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 0x01000193) >>> 0;
  return h.toString(36).padStart(7, '0');
};

const raw = process.argv.slice(2).flatMap((f) => JSON.parse(readFileSync(f, 'utf8')));
const seen = new Set();
const perGame = new Map();
const buckets = new Map();
const out = [];
// Сначала длинные решения: они ценнее и реже.
raw.sort((a, b) => b.line.length - a.line.length || Math.random() - 0.5);
for (const d of raw) {
  const key = d.fen.split(' ').slice(0, 2).join(' ');
  if (seen.has(key)) continue;
  if (d.game && d.game !== 'compose' && (perGame.get(d.game) ?? 0) >= PER_GAME) continue;
  const data = { id: 'own-' + hash(key), origin: d.game === 'compose' ? 'compose' : 'game', fen: d.fen, goal: d.goal, ...(d.mateIn ? { mateIn: d.mateIn } : {}), ...(d.gain ? { gain: d.gain } : {}), line: d.line };
  let p;
  try {
    p = annotate(data);
  } catch (e) {
    console.warn('пропуск', d.fen, e.message);
    continue;
  }
  const bucket = `${p.level.n}|${p.goal}|${p.concepts[0]}`;
  if ((buckets.get(bucket) ?? 0) >= PER_BUCKET) continue;
  seen.add(key);
  if (d.game) perGame.set(d.game, (perGame.get(d.game) ?? 0) + 1);
  buckets.set(bucket, (buckets.get(bucket) ?? 0) + 1);
  out.push(data);
}
out.sort((a, b) => a.id.localeCompare(b.id));
writeFileSync(OUT, JSON.stringify(out, null, 1) + '\n');

const count = (f) => Object.entries(out.reduce((m, d) => ((m[f(d)] = (m[f(d)] ?? 0) + 1), m), {})).sort();
console.log(`Отобрано ${out.length} из ${raw.length}`);
console.log('по цели:', count((d) => (d.goal === 'mate' ? `мат в ${d.mateIn}` : 'материал')));
console.log('по уровню:', count((d) => annotate(d).level.ru));
await vite.close();
