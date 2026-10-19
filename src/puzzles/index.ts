import own from './own.json';
import { annotate, type Puzzle, type PuzzleData } from './annotate';

export { LEVELS, type Puzzle } from './annotate';
export { CONCEPTS, type ConceptId } from './concepts';

const OWN_SOURCE = {
  game: { author: 'Задачи приложения', title: 'Позиция из партии Fairy-Stockfish, решение проверено движком на единственность' },
  compose: { author: 'Задачи приложения', title: 'Позиция с небольшим числом фигур, составленная с помощью Fairy-Stockfish; решение проверено движком на единственность' },
};

let cache: Puzzle[] | null = null;

/** Все задачи, от простых к сложным. */
export function allPuzzles(): Puzzle[] {
  if (cache) return cache;
  const raw: PuzzleData[] = (own as (Omit<PuzzleData, 'source'> & { origin: 'game' | 'compose' })[]).map(({ origin, ...d }) => ({
    ...d,
    source: OWN_SOURCE[origin],
  }));
  cache = raw
    .map(annotate)
    .sort((a, b) => a.level.n - b.level.n || (a.mateIn ?? 9) - (b.mateIn ?? 9) || a.line.length - b.line.length || a.id.localeCompare(b.id));
  return cache;
}

const KEY = 'janggi.puzzles.solved';

/** Решённые задачи: id → решена без ошибок и подсказок. */
export function loadSolved(): Record<string, { clean: boolean }> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}');
  } catch {
    return {};
  }
}

export function saveSolved(s: Record<string, { clean: boolean }>) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // хранилище недоступно — прогресс просто не сохранится
  }
}
