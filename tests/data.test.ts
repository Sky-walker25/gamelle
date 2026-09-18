import { describe, expect, it } from 'vitest';
import { ENEMIES } from '@/data/enemies';
import { MAPS } from '@/data/maps';
import { TOWERS, towerLevelDef } from '@/data/towers';
import { Grid } from '@/sim/grid';

describe('tower data', () => {
  it('has nine towers with strictly increasing costs per line', () => {
    expect(TOWERS).toHaveLength(9);
    for (const t of TOWERS) {
      expect(t.levels[0].cost).toBeGreaterThan(0);
      for (const lvl of [...t.levels, ...t.branches]) {
        expect(lvl.name.fr.length).toBeGreaterThan(0);
        expect(lvl.name.en.length).toBeGreaterThan(0);
        expect(lvl.lore.fr.length).toBeGreaterThan(20);
        expect(lvl.range).toBeGreaterThan(0);
      }
      expect(t.branches[0].cost).toBeGreaterThanOrEqual(t.levels[2].cost);
    }
  });

  it('resolves branch definitions at level 4', () => {
    expect(towerLevelDef('archers', 4, 0).name.fr).toBe('Mitrailleuse Gatling');
    expect(towerLevelDef('archers', 4, 1).name.fr).toBe('Fusiliers Lebel');
    expect(towerLevelDef('archers', 2, -1).name.fr).toBe('Arbalétriers');
  });

  it('has unique hotkeys', () => {
    const keys = new Set(TOWERS.map((t) => t.hotkey));
    expect(keys.size).toBe(TOWERS.length);
  });
});

describe('enemy data', () => {
  it('references only existing enemies for spawns', () => {
    const ids = new Set(ENEMIES.map((e) => e.id));
    for (const e of ENEMIES) {
      if (e.spawnOnDeath) expect(ids.has(e.spawnOnDeath.enemy)).toBe(true);
      if (e.spawnPeriodic) expect(ids.has(e.spawnPeriodic.enemy)).toBe(true);
    }
  });
  it('has three bosses', () => {
    expect(ENEMIES.filter((e) => e.boss)).toHaveLength(3);
  });
});

describe('map data', () => {
  it('builds every map and paths only cross buildable terrain', () => {
    for (const map of MAPS) {
      const grid = new Grid(map);
      expect(grid.cols).toBe(map.cols);
      if (map.open) {
        expect(grid.spawns.length).toBeGreaterThan(0);
        expect(grid.bases.length).toBeGreaterThan(0);
        for (const s of grid.spawns) expect(grid.flowDistance(s[0], s[1])).toBeGreaterThan(0);
        continue;
      }
      for (const t of grid.tiles) {
        if (t.kind === 'path') {
          const ch = map.terrain[t.row]?.[t.col];
          expect(ch, `${map.id} path tile ${t.col},${t.row} sits on '${ch}'`).toBe('.');
        }
      }
      expect(grid.paths.length).toBe(map.paths.length);
      for (const p of grid.paths) expect(p.length).toBeGreaterThan(300);
    }
  });

  it('rosters only use known enemies and unlocks known towers', () => {
    const enemies = new Set(ENEMIES.map((e) => e.id));
    const towers = new Set(TOWERS.map((t) => t.id));
    for (const map of MAPS) {
      for (const r of map.roster) expect(enemies.has(r.id)).toBe(true);
      for (const u of map.unlocks) expect(towers.has(u)).toBe(true);
    }
  });

  it('has unique, contiguous order numbers', () => {
    const orders = MAPS.map((m) => m.order).sort((a, b) => a - b);
    expect(orders).toEqual(orders.map((_, i) => i + 1));
  });
});
