import { describe, expect, it } from 'vitest';
import { computeDamage, waveHpMultiplier } from '@/sim/damage';

describe('computeDamage', () => {
  it('reduces pierce damage by armour', () => {
    expect(computeDamage({ base: 100, type: 'pierce', armor: 0.5 })).toBe(50);
  });
  it('applies armour piercing', () => {
    expect(computeDamage({ base: 100, type: 'pierce', armor: 0.5, armorPierce: 0.3 })).toBeCloseTo(80);
    expect(computeDamage({ base: 100, type: 'pierce', armor: 0.5, armorPierce: 1 })).toBe(100);
  });
  it('halves armour against explosives', () => {
    expect(computeDamage({ base: 100, type: 'explosive', armor: 0.5 })).toBe(75);
  });
  it('ignores armour for fire and true damage', () => {
    expect(computeDamage({ base: 100, type: 'fire', armor: 0.9 })).toBe(100);
    expect(computeDamage({ base: 100, type: 'true', armor: 0.9 })).toBe(100);
  });
  it('applies resistances, air bonus and crits', () => {
    expect(computeDamage({ base: 100, type: 'fire', armor: 0, resist: { fire: 1.5 } })).toBe(150);
    expect(computeDamage({ base: 100, type: 'pierce', armor: 0, flying: true, bonusVsAir: 2 })).toBe(200);
    expect(computeDamage({ base: 100, type: 'pierce', armor: 0, flying: false, bonusVsAir: 2 })).toBe(100);
    expect(computeDamage({ base: 100, type: 'pierce', armor: 0, critMultiplier: 2 })).toBe(200);
  });
});

describe('waveHpMultiplier', () => {
  it('scales linearly through the campaign then exponentially in endless', () => {
    expect(waveHpMultiplier(1, 1, 1, 30)).toBe(1);
    expect(waveHpMultiplier(30, 1, 1, 30)).toBeCloseTo(1.87);
    expect(waveHpMultiplier(40, 1, 1, 30)).toBeGreaterThan(waveHpMultiplier(30, 1, 1, 30) * 1.5);
    expect(waveHpMultiplier(10, 1.2, 0.8, 30)).toBeCloseTo((1 + 0.27) * 1.2 * 0.8);
  });
});
