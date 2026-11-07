import type { GameId } from '../core/types';
import { allPuzzles } from '../puzzles';
import { LESSONS } from './lessons';
import { MAKRUK_LESSONS } from './lessonsMakruk';
import { SHATRANJ_LESSONS } from './lessonsShatranj';
import { SHOGI_LESSONS } from './lessonsShogi';
import { XIANGQI_LESSONS } from './lessonsXiangqi';
import type { ConcreteTask, Lesson } from './types';

export { LESSONS } from './lessons';
export { SHOGI_LESSONS } from './lessonsShogi';
export { XIANGQI_LESSONS } from './lessonsXiangqi';

/** Курс обучения для игры. */
export function lessonsFor(game: GameId): Lesson[] {
  if (game === 'makruk') return MAKRUK_LESSONS;
  if (game === 'shatranj') return SHATRANJ_LESSONS;
  return game === 'xiangqi' ? XIANGQI_LESSONS : game === 'shogi' ? SHOGI_LESSONS : LESSONS;
}
export type { ConcreteTask, Diagram, Lesson, TheoryBlock } from './types';

/** Задания урока, где подборки задач заменены конкретными задачами (самыми простыми подходящими). */
export function lessonTasks(lesson: Lesson, game: GameId = 'janggi'): ConcreteTask[] {
  const used = new Set<string>();
  return lesson.tasks.flatMap((t): ConcreteTask[] => {
    if (t.kind !== 'puzzles') return [t];
    return allPuzzles(game)
      .filter((p) => {
        const moves = (p.line.length + 1) / 2;
        return p.concepts.includes(t.concept) && moves <= (t.maxMoves ?? 9) && moves >= (t.minMoves ?? 1) && p.level.n >= (t.minLevel ?? 1) && !used.has(p.id);
      })
      .slice(t.skip ?? 0, (t.skip ?? 0) + t.count)
      .map((p) => {
        used.add(p.id);
        return {
          kind: 'find',
          fen: p.fen,
          prompt: p.description,
          goal: p.goal === 'mate' ? 'mate' : 'exact',
          moves: p.goal === 'mate' ? undefined : [p.line[0]],
          line: p.line,
          hint: p.hints[0],
          explain: p.explanation,
        };
      });
  });
}

const KEY = 'janggi.training.done';

/** Пройденные задания: id урока → номера выполненных заданий. */
export function loadProgress(): Record<string, number[]> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}');
  } catch {
    return {};
  }
}

export function saveProgress(p: Record<string, number[]>) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    // хранилище недоступно — прогресс просто не сохранится
  }
}

export function lessonById(id: string, game: GameId = 'janggi') {
  return lessonsFor(game).find((l) => l.id === id);
}
