// Скачивает Fairy-Stockfish со встроенной нейросетью NNUE для Чанги в src-tauri/engine.
// Windows: готовая сборка из релиза Fairy-Stockfish-NNUE (janggi-9991472750de).
// Linux: укажите собранный вручную движок через переменную FAIRY_STOCKFISH=<путь>.
import { copyFileSync, chmodSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';

const RELEASE = 'https://github.com/fairy-stockfish/Fairy-Stockfish-NNUE/releases/download/janggi-9991472750de';
const dir = new URL('../src-tauri/engine/', import.meta.url);
mkdirSync(dir, { recursive: true });
copyFileSync(new URL('../LICENSE', import.meta.url), new URL('COPYING.txt', dir));

const isWin = process.platform === 'win32' || process.argv.includes('--windows');
const target = new URL(isWin ? 'fairy-stockfish.exe' : 'fairy-stockfish', dir);

if (process.env.FAIRY_STOCKFISH) {
  copyFileSync(process.env.FAIRY_STOCKFISH, target);
} else if (isWin) {
  const url = `${RELEASE}/fairy-stockfish_x86-64-modern.exe`;
  console.log(`Скачиваю ${url}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Ошибка загрузки: ${res.status}`);
  writeFileSync(target, Buffer.from(await res.arrayBuffer()));
} else if (!existsSync(target)) {
  console.error('Для Linux соберите Fairy-Stockfish (make build ARCH=x86-64-modern largeboards=yes) и укажите FAIRY_STOCKFISH=<путь>');
  process.exit(1);
}
if (!isWin) chmodSync(target, 0o755);
console.log(`Движок: ${target.pathname}`);
