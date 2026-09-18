import { describe, expect, it } from 'vitest';
import { MAPS } from '@/data/maps';
import { TOWERS } from '@/data/towers';
import type { DifficultyId } from '@/sim/types';
import { World } from '@/sim/world';
import { runBot } from './bot';

function play(mapId: string, difficulty: DifficultyId): { won: boolean; wave: number; lives: number } {
  const map = MAPS.find((m) => m.id === mapId);
  if (!map) throw new Error(mapId);
  const world = new World({
    map,
    difficulty,
    mode: 'classic',
    seed: 7,
    unlockedTowers: TOWERS.map((t) => t.id),
  });
  return runBot(world, 60 * 60);
}

describe('balance: an unsophisticated bot with every tower', () => {
  for (const map of MAPS) {
    it(`wins ${map.id} on easy`, () => {
      const r = play(map.id, 'easy');
      expect(r.won, `easy ${map.id}: reached wave ${r.wave} with ${r.lives} lives`).toBe(true);
    });
    it(`wins ${map.id} on normal`, () => {
      const r = play(map.id, 'normal');
      expect(r.won, `normal ${map.id}: reached wave ${r.wave} with ${r.lives} lives`).toBe(true);
    });
  }
  it('hard is harder than normal on the first map', () => {
    const normal = play('thermopylae', 'normal');
    const hard = play('thermopylae', 'hard');
    expect(hard.lives <= normal.lives || !hard.won).toBe(true);
  });
});
