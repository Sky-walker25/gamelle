import { describe, expect, it } from 'vitest';
import { ENEMY_BY_ID } from '@/data/enemies';
import { MAPS } from '@/data/maps';
import { generateWave, generateWaves, waveThreat } from '@/sim/waves';

describe('wave generator', () => {
  const map = MAPS[0]!;

  it('is deterministic', () => {
    const a = generateWaves(map, 30);
    const b = generateWaves(map, 30);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('grows in threat over the campaign', () => {
    const waves = generateWaves(map, 30);
    const early = waveThreat(waves[0]!);
    const mid = waveThreat(waves[14]!);
    const late = waveThreat(waves[28]!);
    expect(mid).toBeGreaterThan(early * 3);
    expect(late).toBeGreaterThan(mid * 1.8);
  });

  it('places bosses every ten waves', () => {
    for (const map of MAPS) {
      for (const n of [10, 20, 30, 40]) {
        const w = generateWave(map, n);
        expect(w.boss).toBe(true);
        expect(w.groups.some((g) => ENEMY_BY_ID[g.enemy]?.boss)).toBe(true);
      }
      expect(generateWave(map, 11).boss).toBe(false);
    }
  });

  it('only uses roster enemies unlocked at that wave', () => {
    for (const map of MAPS) {
      for (let n = 1; n <= 30; n++) {
        const w = generateWave(map, n);
        for (const g of w.groups) {
          const def = ENEMY_BY_ID[g.enemy];
          expect(def).toBeDefined();
          if (def!.boss) continue;
          const entry = map.roster.find((r) => r.id === g.enemy);
          expect(entry, `${map.id} wave ${n} uses ${g.enemy}`).toBeDefined();
          expect(entry!.from).toBeLessThanOrEqual(n);
        }
        expect(w.groups.length).toBeGreaterThan(0);
        expect(w.reward).toBeGreaterThan(0);
      }
    }
  });

  it('keeps the first wave gentle', () => {
    for (const map of MAPS) {
      const w = generateWave(map, 1);
      const total = w.groups.reduce((s, g) => s + g.count, 0);
      expect(total).toBeLessThanOrEqual(14);
      expect(total).toBeGreaterThanOrEqual(3);
    }
  });
});
