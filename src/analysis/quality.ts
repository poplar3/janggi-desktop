// Оценка качества ходов по изменению шансов на победу.
import type { Color } from '../core/rules';
import type { Score } from '../engine/engine';

export type Quality = 'best' | 'excellent' | 'good' | 'inaccuracy' | 'mistake' | 'blunder';

export const QUALITY_INFO: Record<Quality, { ru: string; mark: string; color: string }> = {
  best: { ru: 'Лучший ход', mark: '!', color: '#1f8a4c' },
  excellent: { ru: 'Отличный ход', mark: '', color: '#4f9d69' },
  good: { ru: 'Хороший ход', mark: '', color: '#7b8794' },
  inaccuracy: { ru: 'Неточность', mark: '?!', color: '#d9a400' },
  mistake: { ru: 'Ошибка', mark: '?', color: '#e07000' },
  blunder: { ru: 'Зевок', mark: '??', color: '#c62828' },
};

/** Оценка позиции с точки зрения Чо в сантипешках (мат — ±10 000). */
export function cpForCho(score: Score, sideToMove: Color): number {
  const k = sideToMove === 'w' ? 1 : -1;
  if (score.mate !== undefined) {
    // мат 0 — сторона, которая ходит, уже получила мат
    const sign = score.mate > 0 ? 1 : -1;
    return k * sign * (10000 - Math.min(Math.abs(score.mate), 100) * 10);
  }
  return k * (score.cp ?? 0);
}

/** Шансы на победу Чо, 0…100 (та же кривая, что у lichess). */
export function winPercent(cpCho: number): number {
  const cp = Math.max(-2000, Math.min(2000, cpCho));
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1);
}

/**
 * Качество хода стороны `mover`.
 * @param before оценка позиции до хода (Чо, сп)
 * @param after оценка позиции после хода (Чо, сп)
 * @param isBest совпал ли ход с лучшим ходом движка
 */
export function classifyMove(mover: Color, before: number, after: number, isBest: boolean): { quality: Quality; loss: number } {
  const wpBefore = mover === 'w' ? winPercent(before) : 100 - winPercent(before);
  const wpAfter = mover === 'w' ? winPercent(after) : 100 - winPercent(after);
  const loss = Math.max(0, wpBefore - wpAfter);
  if (isBest) return { quality: 'best', loss };
  if (loss < 2) return { quality: 'excellent', loss };
  if (loss < 5) return { quality: 'good', loss };
  if (loss < 10) return { quality: 'inaccuracy', loss };
  if (loss < 20) return { quality: 'mistake', loss };
  return { quality: 'blunder', loss };
}

/** Точность игры по потерям шансов (формула lichess), 0…100. */
export function accuracy(losses: number[]): number | null {
  if (!losses.length) return null;
  const per = losses.map((l) => Math.max(0, Math.min(100, 103.1668 * Math.exp(-0.04354 * l) - 3.1669)));
  return per.reduce((a, b) => a + b, 0) / per.length;
}
