// Готовит Fairy-Stockfish со встроенной нейросетью NNUE для Чанги в src-tauri/engine.
// Windows: готовая сборка из релиза Fairy-Stockfish-NNUE (janggi-9991472750de).
// Linux: готовых сборок с нейросетью Чанги нет, поэтому движок собирается из исходников, а сеть
//        берётся из той же сборки для Windows (она встроена в exe) и встраивается в бинарник.
//        Нужны make, g++ и tar. FSF_SRC=<папка исходников> — собрать из уже скачанных исходников.
// FAIRY_STOCKFISH=<путь> — взять готовый движок как есть.
import { copyFileSync, chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { availableParallelism, tmpdir } from 'node:os';
import { join } from 'node:path';

const NET = 'janggi-9991472750de';
const NET_SIZE = 11261920;
const RELEASE = `https://github.com/fairy-stockfish/Fairy-Stockfish-NNUE/releases/download/${NET}`;
// Версия исходников, с которой совместим формат сети.
const FSF_COMMIT = '9f778da667f6e07dae1e85d3e2ea204fc6dee94d';
const dir = new URL('../src-tauri/engine/', import.meta.url);
mkdirSync(dir, { recursive: true });
copyFileSync(new URL('../LICENSE', import.meta.url), new URL('COPYING.txt', dir));

const isWin = process.platform === 'win32' || process.argv.includes('--windows');
const target = new URL(isWin ? 'fairy-stockfish.exe' : 'fairy-stockfish', dir);

async function download(url) {
  console.log(`Скачиваю ${url}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Ошибка загрузки: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

/** Находит сеть внутри сборки для Windows: по заголовку формата и по хешу из её имени. */
function extractNet(exe) {
  const magic = Buffer.alloc(4);
  magic.writeUInt32LE(0x7af32f20);
  const want = NET.split('-')[1];
  for (let i = exe.indexOf(magic); i >= 0; i = exe.indexOf(magic, i + 1)) {
    const net = exe.subarray(i, i + NET_SIZE);
    if (createHash('sha256').update(net).digest('hex').startsWith(want)) return net;
  }
  throw new Error(`Сеть ${NET} не найдена в сборке для Windows`);
}

async function buildLinux() {
  const work = mkdtempSync(join(tmpdir(), 'fsf-'));
  let src = process.env.FSF_SRC;
  if (src) {
    cpSync(src, join(work, 'fsf'), { recursive: true, filter: (p) => !p.endsWith('.o') });
  } else {
    writeFileSync(join(work, 'fsf.tar.gz'), await download(`https://github.com/fairy-stockfish/Fairy-Stockfish/archive/${FSF_COMMIT}.tar.gz`));
    execFileSync('tar', ['xzf', 'fsf.tar.gz'], { cwd: work });
    execFileSync('mv', [`Fairy-Stockfish-${FSF_COMMIT}`, 'fsf'], { cwd: work });
  }
  src = join(work, 'fsf', 'src');
  writeFileSync(join(src, `${NET}.nnue`), extractNet(await download(`${RELEASE}/fairy-stockfish_x86-64-modern.exe`)));
  // Сеть Чанги становится встроенной сетью по умолчанию — как в сборке для Windows.
  const h = join(src, 'evaluate.h');
  writeFileSync(h, readFileSync(h, 'utf8').replace(/(#define EvalFileDefaultName\s+)"[^"]+"/, `$1"${NET}.nnue"`));
  // load_net= — не скачивать стандартную шахматную сеть: нужная уже лежит рядом.
  console.log('Собираю Fairy-Stockfish…');
  execFileSync('make', ['-j', String(availableParallelism()), 'build', 'ARCH=x86-64-modern', 'largeboards=yes', 'nnue=yes', 'load_net='], { cwd: src, stdio: ['ignore', 'ignore', 'inherit'] });
  copyFileSync(join(src, 'stockfish'), target);
}

if (process.env.FAIRY_STOCKFISH) {
  copyFileSync(process.env.FAIRY_STOCKFISH, target);
} else if (isWin) {
  writeFileSync(target, await download(`${RELEASE}/fairy-stockfish_x86-64-modern.exe`));
} else if (!existsSync(target) || process.argv.includes('--rebuild')) {
  await buildLinux();
}
if (!isWin) chmodSync(target, 0o755);
console.log(`Движок: ${target.pathname}`);
