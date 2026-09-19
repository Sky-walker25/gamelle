import { enemyDef } from '@/data/enemies';
import { towerLevelDef } from '@/data/towers';
import { drawEnemy } from '@/render/enemies';
import { drawTower } from '@/render/towers';
import { Grid, TILE } from '@/sim/grid';
import type { Enemy, MapDef, Tower } from '@/sim/types';
import { renderTerrain } from '@/render/terrain';
import { theme } from '@/render/theme';

const cache = new Map<string, HTMLCanvasElement>();

function makeCanvas(size: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = size * dpr;
  canvas.height = size * dpr;
  canvas.style.width = `${size}px`;
  canvas.style.height = `${size}px`;
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  ctx.scale(dpr, dpr);
  return { canvas, ctx };
}

export function towerIcon(defId: string, level = 1, branch: -1 | 0 | 1 = -1, size = 64): HTMLCanvasElement {
  const key = `tower:${defId}:${level}:${branch}:${size}`;
  const cached = cache.get(key);
  if (cached) return cached.cloneNode(true) as HTMLCanvasElement;
  const { canvas, ctx } = makeCanvas(size);
  const lvl = towerLevelDef(defId, level, branch);
  const tower: Tower = {
    id: 0,
    defId,
    level,
    branch,
    col: 0,
    row: 0,
    x: 0,
    y: 0,
    cooldown: 0,
    targetMode: 'first',
    targetId: 0,
    angle: -Math.PI / 4,
    kills: 0,
    damageDealt: 0,
    invested: 0,
    trapTimer: 0,
    traps: [],
    buff: { damage: 0, rate: 0, range: 0, gold: 0, reveal: false },
    salvoPhase: 0,
    builtAt: 0,
    fireAnim: 0,
  };
  ctx.translate(size / 2, size / 2 - 2);
  ctx.scale(size / 72, size / 72);
  // Sappers draw their zone; clip it to the icon.
  ctx.beginPath();
  ctx.arc(0, 0, 34, 0, Math.PI * 2);
  ctx.clip();
  drawTower(ctx, tower, lvl, 1.2, false);
  // Cloning keeps the drawn bitmap only when the canvas is copied via drawImage.
  cache.set(key, copyCanvas(canvas));
  return canvas;
}

export function enemyIcon(defId: string, size = 64): HTMLCanvasElement {
  const key = `enemy:${defId}:${size}`;
  const cached = cache.get(key);
  if (cached) return copyCanvas(cached);
  const { canvas, ctx } = makeCanvas(size);
  const def = enemyDef(defId);
  const enemy: Enemy = {
    id: 1,
    defId,
    hp: def.hp,
    maxHp: def.hp,
    shield: 0,
    x: 0,
    y: 0,
    angle: 0,
    path: [],
    pathId: '',
    travelled: 3,
    pathLength: 0,
    lane: 0,
    baseSpeed: def.speed,
    status: { slowFactor: 1, slowT: 0, burnDps: 0, burnT: 0, burnSource: 0, shred: 0, shredT: 0, stunT: 0 },
    lastDamageAt: 0,
    spawnedCount: 0,
    spawnTimer: 0,
    flying: def.flying === true,
    stealth: def.stealth === true,
    revealed: true,
    dead: false,
    leaked: false,
    spawnedAt: 0,
    hitFlash: 0,
    bounty: 0,
    livesDamage: 0,
    radius: def.radius,
    generation: 0,
    wave: 1,
  };
  const scale = Math.min(1.6, (size * 0.42) / Math.max(12, def.radius));
  ctx.translate(size / 2, size / 2);
  ctx.scale(scale, scale);
  ctx.rotate(-Math.PI / 6);
  drawEnemy(ctx, enemy, def, 1);
  cache.set(key, copyCanvas(canvas));
  return canvas;
}

/** Small preview of a map, rendered from its real terrain. */
export function mapPreview(map: MapDef, width = 260): HTMLCanvasElement {
  const key = `map:${map.id}:${map.seed}:${map.theme}:${map.cols}x${map.rows}:${map.terrain.join('|')}:${JSON.stringify(map.paths)}:${width}`;
  const cached = cache.get(key);
  if (cached) return copyCanvas(cached);
  const grid = new Grid(map);
  const scale = width / (map.cols * TILE);
  const terrain = renderTerrain(grid, theme(map.theme), scale);
  const th = theme(map.theme);
  const ctx = terrain.getContext('2d') as CanvasRenderingContext2D;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (th.overlay.alpha > 0) {
    ctx.globalCompositeOperation = th.overlay.blend;
    ctx.globalAlpha = th.overlay.alpha;
    ctx.fillStyle = th.overlay.color;
    ctx.fillRect(0, 0, terrain.width, terrain.height);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }
  if (th.night) {
    ctx.fillStyle = 'rgba(10,15,40,0.45)';
    ctx.fillRect(0, 0, terrain.width, terrain.height);
  }
  terrain.style.width = '100%';
  cache.set(key, copyCanvas(terrain));
  return terrain;
}

function copyCanvas(src: HTMLCanvasElement): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = src.width;
  c.height = src.height;
  c.style.width = src.style.width;
  c.style.height = src.style.height;
  (c.getContext('2d') as CanvasRenderingContext2D).drawImage(src, 0, 0);
  return c;
}
