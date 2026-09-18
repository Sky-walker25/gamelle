import { TOWERS } from '@/data/towers';
import { MAP_BY_ID } from '@/data/maps';
import { TICK } from '@/core/loop';
import { World } from '@/sim/world';
import type { WorldConfig } from '@/sim/world';
import type { MapDef } from '@/sim/types';

export const ALL_TOWERS = TOWERS.map((t) => t.id);

export function makeWorld(overrides: Partial<WorldConfig> = {}): World {
  const map: MapDef = overrides.map ?? MAP_BY_ID['thermopylae']!;
  return new World({
    map,
    difficulty: 'normal',
    mode: 'classic',
    seed: 1,
    unlockedTowers: ALL_TOWERS,
    ...overrides,
  });
}

/** Advance the world by `seconds` in fixed ticks. */
export function run(world: World, seconds: number): void {
  const ticks = Math.round(seconds / TICK);
  for (let i = 0; i < ticks; i++) world.step(TICK);
}

/** Run until predicate holds or timeout (in seconds) elapses. Returns whether it held. */
export function runUntil(world: World, predicate: () => boolean, timeout = 120): boolean {
  const ticks = Math.round(timeout / TICK);
  for (let i = 0; i < ticks; i++) {
    if (predicate()) return true;
    world.step(TICK);
  }
  return predicate();
}
