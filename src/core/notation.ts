import { type HistoryEntry } from './game';
import { isPass, squareName, typeOf } from './rules';
import { PIECE_NAMES } from '../ui/pieces';

/** Запись хода по-русски: «Кл a1–a3», «К b1×c3+», «пропуск». */
export function formatMove(h: HistoryEntry): string {
  if (isPass(h.move)) return 'пропуск';
  const name = PIECE_NAMES[typeOf(h.piece)].short;
  const sep = h.captured ? '×' : '–';
  return `${name} ${squareName(h.move.from)}${sep}${squareName(h.move.to)}${h.check ? '+' : ''}`;
}
