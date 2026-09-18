import { TICK } from '@/core/loop';
import { enemyDef } from '@/data/enemies';
import { TOWERS } from '@/data/towers';
import { TILE, tileCenter } from '@/sim/grid';
import type { Tower } from '@/sim/types';
import type { World } from '@/sim/world';

/**
 * A deliberately simple automated player. It is not clever: it builds
 * near the path, upgrades what it has, and calls waves as soon as it can.
 * If this bot wins on normal, a human paying attention will too; if it
 * cannot beat a map on easy, the map is too hard.
 */
interface Spot {
  col: number;
  row: number;
  coverage: number;
}

/** On open maps the bot fills a serpentine of wall tiles to lengthen the route, nearest to the current route first. */
function mazePlan(world: World): Set<number> {
  const plan = new Set<number>();
  const grid = world.grid;
  for (let c = 3; c <= grid.cols - 4; c += 3) {
    const gapTop = (c / 3) % 2 === 1;
    for (let r = 1; r <= grid.rows - 2; r++) {
      if (gapTop ? r === 1 : r === grid.rows - 2) continue;
      plan.add(grid.index(c, r));
    }
  }
  return plan;
}

function pathCoverage(world: World, restrictTo?: Set<number>): Spot[] {
  const grid = world.grid;
  let pathTiles = grid.tiles.filter((t) => t.kind === 'path');
  if (grid.open) {
    // Open maps: cover the routes enemies currently take.
    const set = new Set<number>();
    for (const spawn of grid.spawns) {
      const route = grid.spawnRoute(spawn);
      for (let i = 1; i < route.length; i++) {
        const a = route[i - 1] as { x: number; y: number };
        const b = route[i] as { x: number; y: number };
        const steps = Math.max(1, Math.round(Math.hypot(b.x - a.x, b.y - a.y) / TILE));
        for (let s = 0; s <= steps; s++) {
          const x = a.x + ((b.x - a.x) * s) / steps;
          const y = a.y + ((b.y - a.y) * s) / steps;
          set.add(grid.index(Math.floor(x / TILE), Math.floor(y / TILE)));
        }
      }
    }
    pathTiles = grid.tiles.filter((t) => set.has(grid.index(t.col, t.row)));
  }
  const spots: Spot[] = [];
  for (const t of grid.tiles) {
    if (t.kind !== 'build') continue;
    if (restrictTo && !restrictTo.has(grid.index(t.col, t.row))) continue;
    const c = tileCenter(t.col, t.row);
    let coverage = 0;
    for (const p of pathTiles) {
      const pc = tileCenter(p.col, p.row);
      const d = Math.hypot(pc.x - c.x, pc.y - c.y);
      if (d <= 2.8 * TILE) coverage += d <= 1.6 * TILE ? 2 : 1;
    }
    if (coverage > 0) spots.push({ col: t.col, row: t.row, coverage });
  }
  return spots.sort((a, b) => b.coverage - a.coverage);
}

export function runBot(world: World, maxSeconds: number): { won: boolean; wave: number; lives: number } {
  const rotation = TOWERS.map((t) => t.id).filter((id) => world.unlockedTowers.has(id));
  // Damage dealers first, utility towers now and then.
  const preferred = [
    'archers',
    'ballista',
    'cannon',
    'rockets',
    'fire',
    'archers',
    'siege',
    'sappers',
    'ballista',
    'traps',
    'rockets',
    'command',
  ].filter((id) => rotation.includes(id));
  const antiAir = ['archers', 'ballista', 'rockets'].filter((id) => rotation.includes(id));
  const nextHasFlyers = () => {
    const next = world.nextWave;
    return !!next && next.groups.some((g) => enemyDef(g.enemy).flying);
  };
  const plan = world.grid.open ? mazePlan(world) : undefined;
  let planLeft = plan ? plan.size : 0;
  let spots = pathCoverage(world, plan);
  let spotIndex = 0;
  let pick = 0;
  let timer = 0;
  const ticks = Math.round(maxSeconds / TICK);

  const act = () => {
    // 1. Try building.
    let attempts = 0;
    while (attempts++ < 6) {
      const list = nextHasFlyers() && antiAir.length > 0 ? antiAir : preferred;
      const defId = list[pick % list.length] as string;
      const cost = world.towerCost(defId);
      if (world.gold < cost) break;
      let placed = false;
      while (spotIndex < spots.length) {
        const s = spots[spotIndex] as Spot;
        spotIndex++;
        if (world.canBuild(defId, s.col, s.row) === null) {
          world.build(defId, s.col, s.row);
          placed = true;
          break;
        }
      }
      pick++;
      if (placed && world.grid.open) {
        if (planLeft > 0) planLeft--;
        spots = pathCoverage(world, planLeft > 0 ? plan : undefined);
        spotIndex = 0;
      }
      if (!placed && spotIndex >= spots.length) {
        if (planLeft > 0) {
          planLeft = 0;
          spots = pathCoverage(world);
          spotIndex = 0;
          continue;
        }
        break;
      }
    }
    // 2. Upgrade the tower with the most kills that can be upgraded.
    const sorted = [...world.towers].sort((a: Tower, b: Tower) => b.damageDealt - a.damageDealt);
    for (const t of sorted) {
      const branch: 0 | 1 =
        t.defId === 'archers' || t.defId === 'ballista' || t.defId === 'rockets' ? 0 : t.id % 2 === 0 ? 0 : 1;
      if (world.canUpgrade(t, branch) && world.gold > (world.upgradeCost(t, branch) ?? 0) + 60) {
        world.upgrade(t.id, branch);
        break;
      }
    }
    // 3. Call the next wave when nothing is pending.
    if (world.phase === 'idle' || world.phase === 'countdown') world.callNextWave();
  };

  for (let i = 0; i < ticks; i++) {
    if (world.isOver) break;
    world.step(TICK);
    timer += TICK;
    if (timer >= 1) {
      timer = 0;
      act();
    }
  }
  return { won: world.phase === 'won', wave: world.waveIndex, lives: world.lives };
}
