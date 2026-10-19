import { describe, expect, it } from 'vitest';
import { Game } from '../core/game';
import { annotate } from './annotate';
import bakboJson from './bakbo.json';
import ownJson from './own.json';
import { allPuzzles } from '.';

type Raw = { id: string; fen: string; goal: string; mateIn?: number; gain?: number; line: string[]; checksOnly?: boolean };
const own = [...ownJson, ...bakboJson] as Raw[];

describe('задачи', () => {
  it('у каждой задачи уникальный id и позиция', () => {
    const ids = new Set(own.map((p) => p.id));
    const fens = new Set(own.map((p) => p.fen));
    expect(ids.size).toBe(own.length);
    expect(fens.size).toBe(own.length);
  });

  it.each(own.map((p) => [p.id, p] as const))('%s: решение корректно', (_, p) => {
    const g = new Game(p.fen);
    const solver = g.turn;
    for (const u of p.line) {
      expect(g.result()).toBeNull();
      g.playUci(u);
    }
    expect(p.line.length % 2).toBe(1);
    if (p.checksOnly) {
      // 박보: каждый ход решающего объявляет шах.
      g.history.forEach((h, i) => i % 2 === 0 && expect(h.check, `${p.id}: ход ${i + 1}`).toBe(true));
    }
    if (p.goal === 'mate') {
      expect(g.result()).toEqual({ winner: solver, reason: 'checkmate' });
      expect((p.line.length + 1) / 2).toBe(p.mateIn);
    } else {
      expect(p.gain).toBeGreaterThanOrEqual(3);
    }
  });

  it('разметка: уровень, приёмы, подсказки и разбор есть у всех', () => {
    for (const p of allPuzzles()) {
      expect(p.level.n).toBeGreaterThanOrEqual(1);
      expect(p.level.n).toBeLessThanOrEqual(5);
      expect(p.concepts.length).toBeGreaterThan(0);
      expect(p.hints).toHaveLength(3);
      expect(p.explanation.length).toBeGreaterThan(10);
      expect(p.solution).toHaveLength(p.line.length);
    }
  });

  it('мат со вскрытым шахом относится к фигуре, которая объявляет шах', () => {
    // Конь уходит с вертикали f, и шах генералу Чо объявляет пушка с f10 через стража на f8.
    const p = annotate({ id: 't', fen: '3k1c3/9/5a3/p8/2B1C4/8c/1b7/5n3/5K1n1/9 b - - 0 1', goal: 'mate', mateIn: 1, line: ['f3e5'] });
    expect(p.concepts).toContain('mate-cannon');
    expect(p.concepts).toContain('discovered');
    expect(p.concepts).not.toContain('mate-horse');
  });
});
