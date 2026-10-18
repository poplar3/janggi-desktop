import { describe, expect, it } from 'vitest';
import fixtures from './__fixtures__/fsf-movegen.json';
import {
  START_FEN,
  generalsFacing,
  legalMoves,
  materialPoints,
  moveToUci,
  parseFen,
  startFenWithSetups,
  toFen,
} from './rules';
import { Game } from './game';

describe('FEN', () => {
  it('читает и записывает начальную позицию', () => {
    expect(toFen(parseFen(START_FEN))).toBe(START_FEN);
  });
  it('собирает расстановки с точки зрения каждого игрока', () => {
    const fen = startFenWithSetups('BNNB', 'NBNB');
    // Хан смотрит с другой стороны: его левый край — вертикаль i
    expect(fen.split(' ')[0].split('/')[0]).toBe('rbna1abnr');
    expect(fen.split(' ')[0].split('/')[9]).toBe('RBNA1ANBR');
  });
});

describe('генерация ходов совпадает с Fairy-Stockfish', () => {
  const data = fixtures as [string, string][];
  it(`на ${data.length} позициях из случайных партий`, () => {
    let mismatches = 0;
    const examples: string[] = [];
    for (const [fen, expected] of data) {
      const ours = legalMoves(parseFen(fen)).map(moveToUci).sort().join(' ');
      if (ours !== expected) {
        mismatches++;
        if (examples.length < 3) examples.push(`${fen}\n  наши: ${ours}\n  FSF:  ${expected}`);
      }
    }
    expect(examples.join('\n\n')).toBe('');
    expect(mismatches).toBe(0);
  });
});

describe('очки', () => {
  it('в начале партии: Чо 72, Хан 73,5', () => {
    const b = parseFen(START_FEN).board;
    expect(materialPoints(b, 'w')).toBe(72);
    expect(materialPoints(b, 'b')).toBe(73.5);
  });
});

describe('биджанг', () => {
  // Генералы на одной вертикали e, между ними пусто.
  const fen = '4k4/9/9/9/9/9/9/9/4K4/R8 b - - 0 1';
  it('распознаётся', () => {
    expect(generalsFacing(parseFen(fen).board)).toBe(true);
  });
  it('нельзя сделать ход, сохраняющий биджанг; пропуск разрешён', () => {
    const moves = legalMoves(parseFen(fen)).map(moveToUci);
    expect(moves).toContain('e10e10');
    expect(moves).not.toContain('e10e9');
    expect(moves).toContain('e10d10');
  });
  it('если соперник не разорвал биджанг — подсчёт очков', () => {
    const g = new Game('4k4/9/9/9/9/9/9/9/3K5/R8 w - - 0 1');
    g.playUci('d2e2'); // Чо создаёт биджанг
    expect(g.result()).toBeNull();
    g.playUci('e10e10'); // Хан пропускает ход
    // Чо: колесница 13 > Хан: 1,5
    expect(g.result()).toEqual({ winner: 'w', reason: 'bikjang' });
  });
});

describe('конец партии', () => {
  it('мат двумя колесницами', () => {
    const g = new Game('4k4/R8/9/9/9/9/9/9/9/3K4R w - - 0 1');
    g.playUci('i1i10');
    expect(g.result()).toEqual({ winner: 'w', reason: 'checkmate' });
  });
  it('двойной пропуск хода', () => {
    const g = new Game();
    g.playUci('e2e2');
    g.playUci('e9e9');
    expect(g.result()).toEqual({ winner: 'b', reason: 'double-pass' });
  });
});
