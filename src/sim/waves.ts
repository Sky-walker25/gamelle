import { Rng, hashSeed } from '@/core/rng';
import { enemyDef } from '@/data/enemies';
import type { MapDef, WaveDef, WaveGroup } from './types';

/** Relative "cost" of an enemy in the wave budget. */
export const THREAT: Record<string, number> = {
  legionary: 6,
  conscript: 3,
  hussar: 8,
  knight: 22,
  hoplite: 18,
  berserker: 16,
  ninja: 10,
  medic: 16,
  balloon: 16,
  biplane: 14,
  truck: 42,
  elephant: 90,
  tank: 85,
};

/** Seconds between two spawns of the same group. */
const INTERVAL: Record<string, number> = {
  legionary: 0.9,
  conscript: 0.5,
  hussar: 0.55,
  knight: 1.4,
  hoplite: 1.1,
  berserker: 1.2,
  ninja: 0.8,
  medic: 1.6,
  balloon: 1.7,
  biplane: 0.9,
  truck: 3.2,
  elephant: 4.5,
  tank: 3.6,
};

const BOSSES = ['boss_surus', 'boss_zeppelin', 'boss_mark'];

export function waveBudget(n: number): number {
  return 40 + 16 * n + 1.6 * n * n;
}

export function waveReward(n: number, boss: boolean): number {
  const base = 18 + 3 * n;
  return boss ? base * 2 : base;
}

export function isBossWave(n: number): boolean {
  return n % 10 === 0;
}

type Flavor = 'mixed' | 'air' | 'rush' | 'heavy';

/**
 * Deterministically generates wave `n` (1-based) for a map. The same map and
 * wave number always yield the same composition, whatever the difficulty:
 * difficulty scales hit points and gold, not the roster.
 */
export function generateWave(map: MapDef, n: number): WaveDef {
  const rng = new Rng(hashSeed(`${map.id}:${map.seed}:${n}`));
  const pool = map.roster.filter((r) => r.from <= n).map((r) => r.id);
  if (pool.length === 0) pool.push('legionary');
  const groups: WaveGroup[] = [];
  const boss = isBossWave(n);
  let budget = waveBudget(n);

  if (boss) {
    const bossIndex = Math.floor(n / 10) - 1;
    const bossId = BOSSES[bossIndex % BOSSES.length] as string;
    const bossCount = 1 + Math.floor(Math.max(0, n - map.waveCount) / 30);
    groups.push({ enemy: bossId, count: bossCount, interval: 8, delay: 4 });
    budget *= 0.5;
  }

  const flavor = pickFlavor(rng, pool, n);
  const groupCount = n < 3 ? 1 : n < 8 ? 2 : n < 16 ? 3 : rng.int(3, 4);
  const shares = splitBudget(rng, budget, groupCount);
  const used = new Set<string>();
  let cursor = boss ? 6 : 0;

  for (let g = 0; g < groupCount; g++) {
    const share = shares[g] as number;
    const candidates = candidatePool(pool, flavor, g, n, used);
    const weights = candidates.map((id) => {
      const from = map.roster.find((r) => r.id === id)?.from ?? 1;
      const novelty = n - from <= 2 ? 2.5 : 1;
      return novelty;
    });
    const enemy = rng.weighted(candidates, weights);
    used.add(enemy);
    const threat = THREAT[enemy] ?? 10;
    let count = Math.max(1, Math.round(share / threat));
    count = Math.min(count, 40);
    const interval = INTERVAL[enemy] ?? 1;
    const spread = n < 5 ? 1 : rng.range(0.85, 1.15);
    groups.push({ enemy, count, interval: +(interval * spread).toFixed(2), delay: +cursor.toFixed(1) });
    cursor += Math.max(2, count * interval * rng.range(0.35, 0.65));
  }

  // Sort groups by delay so spawn order reads naturally in previews.
  groups.sort((a, b) => a.delay - b.delay);
  return { index: n, groups, boss, reward: Math.round(waveReward(n, boss)) };
}

function pickFlavor(rng: Rng, pool: string[], n: number): Flavor {
  const hasAir = pool.some((id) => enemyDef(id).flying);
  const hasHeavy = pool.some((id) => (THREAT[id] ?? 0) >= 40);
  if (n < 4) return 'mixed';
  const roll = rng.next();
  if (hasAir && roll < 0.18) return 'air';
  if (roll < 0.33) return 'rush';
  if (hasHeavy && roll < 0.47) return 'heavy';
  return 'mixed';
}

function candidatePool(
  pool: string[],
  flavor: Flavor,
  groupIndex: number,
  n: number,
  used: Set<string>,
): string[] {
  let list = pool;
  if (flavor === 'air' && groupIndex < 2) {
    list = pool.filter((id) => enemyDef(id).flying);
  } else if (flavor === 'rush') {
    list = pool.filter((id) => enemyDef(id).speed >= 95);
  } else if (flavor === 'heavy' && groupIndex === 0) {
    list = pool.filter((id) => (THREAT[id] ?? 0) >= 18);
  }
  if (list.length === 0) list = pool;
  // Early waves open with the cheapest troops available so players can learn the map.
  if (n < 4 || (groupIndex === 0 && n < 7)) {
    const minThreat = Math.min(...list.map((id) => THREAT[id] ?? 99));
    const cheap = list.filter((id) => (THREAT[id] ?? 99) <= minThreat + (n < 4 ? 0 : 4));
    if (cheap.length > 0) list = cheap;
  }
  const unused = list.filter((id) => !used.has(id));
  return unused.length > 0 ? unused : list;
}

function splitBudget(rng: Rng, budget: number, groups: number): number[] {
  if (groups === 1) return [budget];
  const weights: number[] = [];
  for (let i = 0; i < groups; i++) weights.push(i === 0 ? rng.range(1.4, 2) : rng.range(0.6, 1.2));
  const total = weights.reduce((a, b) => a + b, 0);
  return weights.map((w) => (budget * w) / total);
}

export function generateWaves(map: MapDef, count: number): WaveDef[] {
  const out: WaveDef[] = [];
  for (let n = 1; n <= count; n++) out.push(generateWave(map, n));
  return out;
}

/** Total threat of a wave, used by previews and tests. */
export function waveThreat(wave: WaveDef): number {
  return wave.groups.reduce((sum, g) => sum + g.count * (THREAT[g.enemy] ?? 40), 0);
}
