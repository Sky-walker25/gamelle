import { describe, expect, it } from 'vitest';
import { Rng, hashSeed } from '@/core/rng';

describe('Rng', () => {
  it('is deterministic for a given seed', () => {
    const a = new Rng(1234);
    const b = new Rng(1234);
    for (let i = 0; i < 100; i++) expect(a.next()).toBe(b.next());
  });

  it('produces values in [0, 1)', () => {
    const rng = new Rng(7);
    for (let i = 0; i < 10_000; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('int() stays inclusive of both bounds', () => {
    const rng = new Rng(99);
    const seen = new Set<number>();
    for (let i = 0; i < 2000; i++) seen.add(rng.int(1, 3));
    expect([...seen].sort()).toEqual([1, 2, 3]);
  });

  it('weighted() respects weights', () => {
    const rng = new Rng(5);
    let a = 0;
    for (let i = 0; i < 5000; i++) if (rng.weighted(['a', 'b'], [9, 1]) === 'a') a++;
    expect(a / 5000).toBeGreaterThan(0.85);
  });

  it('state can be saved and restored', () => {
    const rng = new Rng(42);
    rng.next();
    const state = rng.getState();
    const expected = rng.next();
    rng.setState(state);
    expect(rng.next()).toBe(expected);
  });

  it('hashSeed is stable', () => {
    expect(hashSeed('gamelle')).toBe(hashSeed('gamelle'));
    expect(hashSeed('a')).not.toBe(hashSeed('b'));
  });
});
