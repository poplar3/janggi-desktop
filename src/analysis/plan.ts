// Словесное описание варианта (плана), найденного движком.
import { Game } from '../core/game';
import { formatMove } from '../core/notation';
import { colorOf, isPass, PIECE_VALUES, typeOf, type Color } from '../core/rules';
import { PIECE_NAMES, SIDE_NAMES } from '../ui/pieces';

export interface PlanSummary {
  moves: string[];
  /** Ожидаемый ответ соперника на первый ход линии. */
  reply: string | null;
  text: string;
}

const gen = (t: keyof typeof PIECE_NAMES) =>
  ({ K: 'генерала', A: 'стража', B: 'слона', N: 'коня', R: 'колесницу', C: 'пушку', P: 'солдата' })[t];

export function describePlan(fen: string, pv: string[], maxPlies = 8): PlanSummary {
  const g = new Game(fen);
  const moves: string[] = [];
  const gains: Record<Color, { names: string[]; points: number }> = { w: { names: [], points: 0 }, b: { names: [], points: 0 } };
  const checks: Record<Color, number> = { w: 0, b: 0 };
  let passes = 0;
  for (const uci of pv.slice(0, maxPlies)) {
    let h;
    try {
      h = g.playUci(uci);
    } catch {
      break;
    }
    moves.push(formatMove(h));
    const c = colorOf(h.piece);
    if (h.captured) {
      gains[c].names.push(gen(typeOf(h.captured)));
      gains[c].points += PIECE_VALUES[typeOf(h.captured)];
    }
    if (h.check) checks[c]++;
    if (isPass(h.move)) passes++;
  }
  const first = g.history[0] ? colorOf(g.history[0].piece) : 'w';
  const parts: string[] = [];
  const result = g.result();
  if (result?.reason === 'checkmate') parts.push(`Вариант ведёт к мату: побеждает ${SIDE_NAMES[result.winner]}.`);
  else if (result) parts.push(`Вариант заканчивает партию: побеждает ${SIDE_NAMES[result.winner]}.`);
  for (const c of [first, first === 'w' ? 'b' : 'w'] as Color[]) {
    if (gains[c].names.length) parts.push(`${SIDE_NAMES[c]} забирает ${gains[c].names.join(', ')} (${gains[c].points} очк.).`);
  }
  const net = gains[first].points - gains[first === 'w' ? 'b' : 'w'].points;
  if (!result && net === 0 && (gains.w.names.length || gains.b.names.length)) parts.push('Размен равный.');
  if (checks[first] >= 2) parts.push(`${SIDE_NAMES[first]} атакует генерала шахами.`);
  if (!parts.length) parts.push(passes ? 'Выжидательный вариант с пропусками хода.' : 'Позиционный манёвр без немедленных взятий.');
  return { moves, reply: moves[1] ?? null, text: parts.join(' ') };
}
