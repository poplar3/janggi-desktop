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

/**
 * FEN Сёги по расстановке (поля в записи движка: a1–i9, сэнтэ внизу):
 * `shogiPos('w', { e1: 'K', e9: 'k' }, 'GP')` — в руке у сэнтэ золото и пешка.
 */
export function shogiPos(turn: Color, pieces: Record<string, string>, hand = ''): string {
  const rows: string[] = [];
  for (let r = 9; r >= 1; r--) {
    let row = '';
    let empty = 0;
    for (const f of 'abcdefghi') {
      const p = pieces[`${f}${r}`];
      if (!p) empty++;
      else {
        if (empty) row += empty;
        empty = 0;
        row += p;
      }
    }
    if (empty) row += empty;
    rows.push(row);
  }
  return `${rows.join('/')}[${hand}] ${turn} - - 0 1`;
}

/**
 * FEN доски 8×8 (Макрук, Шатрандж) по расстановке, белые внизу:
 * `pos8('w', { d1: 'K', e8: 'k', a1: 'R' })`.
 */
export function pos8(turn: Color, pieces: Record<string, string>): string {
  const rows: string[] = [];
  for (let r = 8; r >= 1; r--) {
    let row = '';
    let empty = 0;
    for (const f of 'abcdefgh') {
      const p = pieces[`${f}${r}`];
      if (!p) empty++;
      else {
        if (empty) row += empty;
        empty = 0;
        row += p;
      }
    }
    if (empty) row += empty;
    rows.push(row);
  }
  return `${rows.join('/')} ${turn} - - 0 1`;
}
