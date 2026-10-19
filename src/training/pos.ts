import { parseSquare, toFen, type Color } from '../core/rules';

/**
 * FEN по расстановке: `pos('w', { e2: 'K', e9: 'k', a1: 'R' })`.
 * Заглавные буквы — фигуры Чо, строчные — Хана.
 */
export function pos(turn: Color, pieces: Record<string, string>): string {
  const board: (string | null)[] = Array(90).fill(null);
  for (const [sq, p] of Object.entries(pieces)) board[parseSquare(sq)] = p;
  return toFen({ board, turn, halfmove: 0, fullmove: 1 });
}
