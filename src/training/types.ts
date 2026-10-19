import type { ConceptId } from '../puzzles/concepts';

/** Иллюстрация к теории: позиция со стрелками и отмеченными полями. */
export interface Diagram {
  fen: string;
  arrows?: [string, string][];
  /** Поля, отмеченные точками (например, куда может пойти фигура). */
  marks?: string[];
  caption: string;
}

export type TheoryBlock = { text: string } | { diagram: Diagram };

/** Отметить все поля, куда может пойти фигура. */
export interface MovesTask {
  kind: 'moves';
  fen: string;
  square: string;
  prompt: string;
  explain: string;
}

/** Найти ход (или серию ходов против лучшей защиты). */
export interface FindTask {
  kind: 'find';
  fen: string;
  prompt: string;
  /**
   * Что засчитывается: мат, шах, взятие или только ходы из `moves`.
   * Для серии ходов (`line`) условие проверяется на последнем ходу.
   */
  goal: 'mate' | 'check' | 'capture' | 'exact';
  /** Принимаемые первые ходы (UCI) — обязательны для goal 'exact'. */
  moves?: string[];
  /** Полное решение с ответами соперника, если задание из нескольких ходов. */
  line?: string[];
  hint?: string;
  explain: string;
}

/**
 * Найти сильный ход; ход оценивает движок во время занятия.
 * Засчитывается любой ход, уступающий лучшему не больше `tolerance` сантипешек.
 */
export interface BestTask {
  kind: 'best';
  fen: string;
  prompt: string;
  hint?: string;
  explain: string;
  tolerance?: number;
}

/** Вопрос с вариантами ответа. */
export interface ChoiceTask {
  kind: 'choice';
  fen?: string;
  prompt: string;
  options: string[];
  answer: number;
  explain: string;
}

/** Подборка задач из раздела «Задачи» по приёму. */
export interface PuzzleSetTask {
  kind: 'puzzles';
  concept: ConceptId;
  count: number;
  /** Не длиннее стольких ходов решающего. */
  maxMoves?: number;
  /** Не короче стольких ходов решающего. */
  minMoves?: number;
  /** Только задачи не ниже этого уровня. */
  minLevel?: number;
  /** Пропустить столько подходящих задач (чтобы уроки не повторяли друг друга). */
  skip?: number;
}

export type Task = MovesTask | FindTask | BestTask | ChoiceTask | PuzzleSetTask;
export type ConcreteTask = MovesTask | FindTask | BestTask | ChoiceTask;

export interface Lesson {
  id: string;
  /** Уровень 1–5, как в задачах. */
  level: number;
  title: string;
  ko?: string;
  summary: string;
  theory: TheoryBlock[];
  tasks: Task[];
}
