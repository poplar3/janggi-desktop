import { describe, expect, it } from 'vitest';
import { accuracy, classifyMove, cpForCho, winPercent } from './quality';
import { describePlan } from './plan';

describe('качество ходов', () => {
  it('шансы симметричны', () => {
    expect(winPercent(0)).toBeCloseTo(50);
    expect(winPercent(300) + winPercent(-300)).toBeCloseTo(100);
  });
  it('мат переводится в большую оценку со стороны Чо', () => {
    expect(cpForCho({ mate: 3 }, 'b')).toBeLessThan(-9000);
    expect(cpForCho({ cp: 50 }, 'b')).toBe(-50);
  });
  it('потеря колесницы — зевок, точный ход — лучший', () => {
    expect(classifyMove('w', 50, -1200, false).quality).toBe('blunder');
    expect(classifyMove('b', 50, 1200, false).quality).toBe('blunder');
    expect(classifyMove('b', 50, 40, true).quality).toBe('best');
    expect(classifyMove('w', 50, 30, false).quality).toBe('excellent');
  });
  it('точность', () => {
    expect(accuracy([0, 0])).toBeGreaterThan(99);
    expect(accuracy([30])!).toBeLessThan(30);
    expect(accuracy([])).toBeNull();
  });
});

describe('описание плана', () => {
  it('замечает взятие', () => {
    // Колесница Чо a1 бьёт незащищённую колесницу Хана a10
    const plan = describePlan('r3k4/9/9/9/9/9/9/9/3K5/R8 w - - 0 1', ['a1a10']);
    expect(plan.text).toContain('Чо забирает колесницу');
  });
});
