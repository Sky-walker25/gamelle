import { describe, expect, it } from 'vitest';
import { MAP_BY_ID } from '@/data/maps';
import { towerLevelDef } from '@/data/towers';
import { World } from '@/sim/world';
import { makeWorld, run, runUntil } from './helpers';

describe('World economy and building', () => {
  it('starts with map gold and lives scaled by difficulty', () => {
    const w = makeWorld({ difficulty: 'hard' });
    expect(w.gold).toBe(Math.round(320 * 0.85));
    expect(w.lives).toBe(15);
  });

  it('builds a tower on buildable terrain and charges gold', () => {
    const w = makeWorld();
    const cost = w.towerCost('archers');
    const tower = w.build('archers', 5, 5);
    expect(tower).not.toBeNull();
    expect(w.gold).toBe(Math.round(320) - cost);
    expect(w.towers).toHaveLength(1);
    expect(w.canBuild('archers', 5, 5)).toBe('occupied');
  });

  it('refuses to build on the path, on rocks, on water or when locked or broke', () => {
    const w = makeWorld({ unlockedTowers: ['archers'] });
    expect(w.canBuild('archers', 2, 6)).toBe('terrain'); // path
    expect(w.canBuild('archers', 0, 0)).toBe('terrain'); // rock
    expect(w.canBuild('archers', 5, 10)).toBe('terrain'); // water
    expect(w.canBuild('cannon', 5, 5)).toBe('locked');
    w.gold = 10;
    expect(w.canBuild('archers', 5, 5)).toBe('gold');
    expect(w.build('archers', 5, 5)).toBeNull();
  });

  it('upgrades through levels and branches, then refuses further upgrades', () => {
    const w = makeWorld();
    w.gold = 5000;
    const t = w.build('archers', 5, 5)!;
    expect(w.upgrade(t.id)).toBe(true);
    expect(t.level).toBe(2);
    expect(w.upgrade(t.id)).toBe(true);
    expect(t.level).toBe(3);
    expect(w.upgradeCost(t, 1)).toBe(towerLevelDef('archers', 4, 1).cost);
    expect(w.upgrade(t.id, 1)).toBe(true);
    expect(t.level).toBe(4);
    expect(t.branch).toBe(1);
    expect(w.levelDef(t).name.fr).toBe('Fusiliers Lebel');
    expect(w.upgrade(t.id, 0)).toBe(false);
    expect(t.invested).toBe(70 + 85 + 130 + 240);
  });

  it('sells for 70% of the investment and frees the tile', () => {
    const w = makeWorld();
    const before = w.gold;
    const t = w.build('ballista', 6, 5)!;
    const refund = w.sell(t.id);
    expect(refund).toBe(Math.floor(110 * 0.7));
    expect(w.gold).toBe(before - 110 + refund);
    expect(w.towers).toHaveLength(0);
    expect(w.canBuild('ballista', 6, 5)).toBeNull();
  });

  it('support towers buff neighbours without stacking', () => {
    const w = makeWorld();
    w.gold = 5000;
    const a = w.build('archers', 5, 5)!;
    w.build('command', 6, 5);
    w.build('command', 5, 4);
    expect(a.buff.damage).toBeCloseTo(0.15);
    const stats = w.towerStats(a);
    expect(stats.damage).toBeCloseTo(9 * 1.15);
    const far = w.build('archers', 17, 3)!;
    expect(far.buff.damage).toBe(0);
  });
});

describe('World waves', () => {
  it('waits for the player before the first wave, then runs a countdown between waves', () => {
    const w = makeWorld();
    run(w, 5);
    expect(w.waveIndex).toBe(0);
    expect(w.phase).toBe('idle');
    expect(w.callNextWave()).toBe(true);
    expect(w.phase).toBe('active');
    expect(w.waveIndex).toBe(1);
  });

  it('spawns every enemy of the wave and enemies walk the path', () => {
    const w = makeWorld();
    w.callNextWave();
    const wave = w.wave(1);
    const total = wave.groups.reduce((s, g) => s + g.count, 0);
    let spawned = 0;
    w.events.on('enemySpawned', () => spawned++);
    run(w, 1);
    const first = w.enemies[0]!;
    const x0 = first.x;
    run(w, 1);
    expect(first.x).toBeGreaterThan(x0);
    runUntil(w, () => spawned >= total, 60);
    expect(spawned).toBe(total);
  });

  it('loses lives when enemies leak and ends the game at zero', () => {
    const w = makeWorld();
    w.lives = 3;
    let over: boolean | null = null;
    w.events.on('gameOver', (e) => (over = e.won));
    w.callNextWave();
    runUntil(w, () => w.phase === 'lost', 90);
    expect(w.lives).toBe(0);
    expect(over).toBe(false);
    expect(w.stats.leaks).toBeGreaterThanOrEqual(3);
  });

  it('a strong defence clears wave one and awards the reward', () => {
    const w = makeWorld();
    w.gold = 3000;
    // Ring the first corridor with upgraded ballistae and archers.
    for (const [c, r] of [
      [1, 5],
      [2, 5],
      [3, 5],
      [1, 7],
      [2, 7],
      [3, 7],
      [5, 4],
      [5, 5],
    ] as [number, number][]) {
      const t = w.build(c % 2 === 0 ? 'archers' : 'ballista', c, r)!;
      w.upgrade(t.id);
      w.upgrade(t.id);
    }
    let cleared = -1;
    let reward = 0;
    w.events.on('waveCleared', (e) => {
      cleared = e.index;
      reward = e.reward;
    });
    const before = w.lives;
    w.callNextWave();
    const ok = runUntil(w, () => cleared === 1, 120);
    expect(ok).toBe(true);
    expect(reward).toBeGreaterThan(0);
    expect(w.lives).toBe(before);
    expect(w.phase).toBe('countdown');
    expect(w.stats.kills).toBeGreaterThan(0);
    expect(w.earlyCallBonus).toBeGreaterThan(0);
  });

  it('awards an early call bonus during the countdown', () => {
    const w = makeWorld();
    w.phase = 'countdown';
    w.countdown = 10;
    const before = w.gold;
    w.callNextWave();
    expect(w.gold).toBe(before + 15);
    expect(w.waveIndex).toBe(1);
  });
});

describe('World targeting', () => {
  function seeded(): World {
    const w = makeWorld();
    w.gold = 5000;
    return w;
  }

  it('first targets the enemy closest to the base, last the furthest', () => {
    const w = seeded();
    const path = w.grid.paths[0]!;
    const t = w.build('archers', 2, 5)!;
    const near = w.spawnEnemy('legionary', 1, path.points, path.id, 200, 0);
    const far = w.spawnEnemy('legionary', 1, path.points, path.id, 120, 0);
    w.setTargetMode(t.id, 'first');
    w.step(1 / 60);
    expect(t.targetId).toBe(near.id);
    w.setTargetMode(t.id, 'last');
    w.step(1 / 60);
    expect(t.targetId).toBe(far.id);
  });

  it('strong and weak pick by hit points', () => {
    const w = seeded();
    const path = w.grid.paths[0]!;
    const t = w.build('archers', 2, 5)!;
    const weak = w.spawnEnemy('hussar', 1, path.points, path.id, 180, 0);
    const strong = w.spawnEnemy('knight', 1, path.points, path.id, 170, 0);
    w.setTargetMode(t.id, 'strong');
    w.step(1 / 60);
    expect(t.targetId).toBe(strong.id);
    w.setTargetMode(t.id, 'weak');
    w.step(1 / 60);
    expect(t.targetId).toBe(weak.id);
  });

  it('cannons cannot target flying enemies but archers can', () => {
    const w = seeded();
    const path = w.grid.paths[0]!;
    const cannon = w.build('cannon', 2, 5)!;
    const archers = w.build('archers', 2, 7)!;
    w.spawnEnemy('balloon', 1, path.points, path.id, 180, 0);
    w.step(1 / 60);
    expect(cannon.targetId).toBe(0);
    expect(archers.targetId).not.toBe(0);
  });

  it('stealth enemies are only seen at half range unless revealed', () => {
    const w = seeded();
    const path = w.grid.paths[0]!;
    const t = w.build('archers', 1, 4)!; // two tiles above the path row 6
    const ninja = w.spawnEnemy('ninja', 1, path.points, path.id, 190, 0);
    w.step(1 / 60);
    // distance ~128px, range 172px, half range 86px -> not visible
    expect(t.targetId).toBe(0);
    const radar = w.build('command', 3, 4)!;
    w.upgrade(radar.id);
    w.upgrade(radar.id);
    expect(t.buff.reveal).toBe(true);
    w.step(1 / 60);
    expect(t.targetId).toBe(ninja.id);
  });

  it('damage kills enemies, pays bounty and elephants drop legionaries', () => {
    const w = seeded();
    const path = w.grid.paths[0]!;
    const t = w.build('archers', 2, 5)!;
    const elephant = w.spawnEnemy('elephant', 1, path.points, path.id, 190, 0);
    const before = w.gold;
    w.damageEnemy(elephant, 99999, 'true', 0, t.id, false, 1);
    expect(elephant.dead).toBe(true);
    expect(w.gold).toBe(before + 60);
    expect(t.kills).toBe(1);
    expect(w.enemies.filter((e) => e.defId === 'legionary' && !e.dead)).toHaveLength(2);
  });

  it('applies slows and burns', () => {
    const w = seeded();
    const path = w.grid.paths[0]!;
    const e = w.spawnEnemy('legionary', 1, path.points, path.id, 100, 0);
    w.applyStatus(e, { slow: { factor: 0.5, duration: 1 }, burn: { dps: 10, duration: 2 } }, 0);
    const hp = e.hp;
    run(w, 0.5);
    expect(e.status.slowFactor).toBe(0.5);
    expect(e.hp).toBeLessThan(hp);
    run(w, 0.6);
    expect(e.status.slowFactor).toBe(1);
  });
});

describe('Open (maze) maps', () => {
  it('routes enemies from spawn to base and refuses blocking placements', () => {
    const w = makeWorld({ map: MAP_BY_ID['verdun']! });
    w.gold = 100000;
    expect(w.grid.open).toBe(true);
    // Wall the corridor except one gap, then try closing the gap.
    for (let r = 1; r <= 10; r++) {
      if (r === 6) continue;
      expect(w.build('archers', 2, r), `row ${r}`).not.toBeNull();
    }
    expect(w.canBuild('archers', 2, 6)).toBe('blocks');
    expect(w.build('archers', 2, 6)).toBeNull();
    const route = w.grid.spawnRoute(w.grid.spawns[0]!);
    expect(route.length).toBeGreaterThan(2);
  });

  it('reroutes live enemies when a tower changes the maze', () => {
    const w = makeWorld({ map: MAP_BY_ID['verdun']! });
    w.gold = 100000;
    w.callNextWave();
    run(w, 6);
    const e = w.enemies.find((x) => !x.flying)!;
    expect(e).toBeDefined();
    const lengthBefore = e.pathLength - e.travelled;
    for (let r = 1; r <= 10; r++) {
      if (r === 1) continue;
      w.build('archers', 10, r);
    }
    const remaining = e.pathLength - e.travelled;
    expect(remaining).toBeGreaterThan(lengthBefore);
    run(w, 2);
    expect(e.dead).toBe(false);
  });
});

describe('Persistence', () => {
  it('round-trips through serialize/restore deterministically', () => {
    const w = makeWorld();
    w.gold = 2000;
    w.build('archers', 3, 5);
    w.build('cannon', 5, 5);
    w.build('traps', 6, 4);
    w.callNextWave();
    run(w, 8);
    const save = JSON.parse(JSON.stringify(w.serialize()));
    const restored = World.restore(save, MAP_BY_ID['thermopylae']!);
    expect(restored.enemies.length).toBe(w.enemies.length);
    expect(restored.towers.length).toBe(3);
    run(w, 5);
    run(restored, 5);
    expect(restored.gold).toBe(w.gold);
    expect(restored.lives).toBe(w.lives);
    expect(restored.enemies.length).toBe(w.enemies.length);
    expect(restored.stats.kills).toBe(w.stats.kills);
    expect(restored.rng.getState()).toBe(w.rng.getState());
  });
});

describe('Open map placement with enemies in flight', () => {
  it('does not report a blocked placement because of enemies still off-screen', () => {
    const w = makeWorld({ map: MAP_BY_ID['verdun']! });
    w.gold = 100000;
    w.callNextWave();
    run(w, 1.2); // first enemies have spawned just outside the map edge
    expect(w.enemies.length).toBeGreaterThan(0);
    expect(w.canBuild('archers', 9, 3)).toBeNull();
  });
});

describe('Automatic waves', () => {
  it('calls the next wave as soon as the previous one is cleared, with the early bonus', () => {
    const w = makeWorld();
    w.gold = 3000;
    for (const [c, r] of [
      [1, 5],
      [2, 5],
      [3, 5],
      [1, 7],
      [2, 7],
      [3, 7],
      [5, 4],
      [5, 5],
    ] as [number, number][]) {
      const t = w.build(c % 2 === 0 ? 'archers' : 'ballista', c, r)!;
      w.upgrade(t.id);
      w.upgrade(t.id);
    }
    w.autoWave = true;
    let cleared = 0;
    let starts = 0;
    w.events.on('waveCleared', () => cleared++);
    w.events.on('waveStart', () => starts++);
    w.callNextWave();
    runUntil(w, () => cleared >= 1, 120);
    expect(cleared).toBe(1);
    expect(starts).toBe(2);
    expect(w.phase).toBe('active');
    expect(w.stats.earlyCalls).toBe(1);
  });

  it('is kept in the save file', () => {
    const w = makeWorld();
    w.autoWave = true;
    const restored = World.restore(JSON.parse(JSON.stringify(w.serialize())), MAP_BY_ID['thermopylae']!);
    expect(restored.autoWave).toBe(true);
  });
});
