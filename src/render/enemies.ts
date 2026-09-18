import type { Enemy, EnemyDef } from '@/sim/types';
import { circle, ellipse, line, polygon, rect, roundRect } from './primitives';
import { PALETTE } from './theme';

type Ctx = CanvasRenderingContext2D;

/**
 * Draws an enemy at the origin, facing +x. The renderer rotates the context
 * by the enemy's heading beforehand. Flying units are drawn slightly larger
 * and get their shadow offset by the renderer.
 */
export function drawEnemy(ctx: Ctx, e: Enemy, def: EnemyDef, time: number): void {
  const phase = e.travelled / 10;
  const flash = e.hitFlash;
  switch (def.id) {
    case 'legionary':
      walker(ctx, phase, PALETTE.red, PALETTE.bronze, 1);
      // Scutum on the left side, pilum on the right.
      roundRect(ctx, -6, -11, 12, 6, 2, PALETTE.red, PALETTE.redDark, 1);
      line(ctx, -4, 8, 12, 8, PALETTE.woodDark, 1.5);
      break;
    case 'conscript':
      walker(ctx, phase, PALETTE.blue, '#2a2f50', 0.85);
      line(ctx, -3, 6, 10, 6, PALETTE.ironDark, 1.5);
      break;
    case 'hussar':
      horse(ctx, phase, '#6b4a2a');
      circle(ctx, 2, 0, 5, PALETTE.blue, PALETTE.navy, 1);
      circle(ctx, 2, 0, 3, PALETTE.black);
      line(ctx, 4, -2, 14, -6, PALETTE.ironLight, 1.5);
      break;
    case 'knight':
      walker(ctx, phase, PALETTE.ironLight, PALETTE.iron, 1.25);
      // Heater shield with heraldry and a sword.
      polygon(
        ctx,
        [
          [-8, -12],
          [2, -12],
          [2, -6],
          [-3, -3],
          [-8, -6],
        ],
        PALETTE.gold,
        PALETTE.goldDark,
        1,
      );
      line(ctx, -5, -12, -1, -5, PALETTE.red, 1.5);
      line(ctx, -2, 8, 14, 8, PALETTE.ironLight, 2);
      break;
    case 'hoplite':
      walker(ctx, phase, '#8a3a2a', PALETTE.bronze, 1.1);
      // Big round aspis with a pattern, plus crest.
      circle(ctx, -3, -8, 8, PALETTE.bronze, PALETTE.bronzeDark, 1.5);
      circle(ctx, -3, -8, 3, PALETTE.redDark);
      line(ctx, -4, 0, -10, 0, PALETTE.red, 3);
      line(ctx, 0, 8, 16, 8, PALETTE.woodDark, 1.5);
      break;
    case 'berserker': {
      const rage = 1 - e.hp / e.maxHp;
      walker(ctx, phase * (1 + rage), PALETTE.skin, '#c9a16a', 1.15);
      // Fur cloak and axe.
      ellipse(ctx, -5, 0, 6, 8, 0, '#6a5030');
      circle(ctx, 0, 0, 4, '#c9a16a');
      line(ctx, 2, 6, 12, 10, PALETTE.woodDark, 2);
      polygon(
        ctx,
        [
          [12, 6],
          [16, 10],
          [12, 14],
        ],
        PALETTE.ironLight,
      );
      if (rage > 0.35) circle(ctx, 3, -1.5, 1.2, '#ff3b2f');
      break;
    }
    case 'ninja': {
      const alpha = e.revealed ? 0.95 : 0.45;
      ctx.save();
      ctx.globalAlpha = alpha;
      walker(ctx, phase, '#232323', '#101010', 0.9);
      line(ctx, -2, -7, 10, -9, PALETTE.ironLight, 1.5);
      ctx.restore();
      break;
    }
    case 'medic':
      walker(ctx, phase, PALETTE.white, '#3a3a3a', 1);
      rect(ctx, -2, -2, 4, 4, PALETTE.red);
      roundRect(ctx, -8, 4, 8, 6, 1, '#6a5030', PALETTE.woodDark, 1);
      // Heal pulse.
      ctx.save();
      ctx.globalAlpha = 0.25 + Math.sin(time * 4) * 0.15;
      circle(ctx, 0, 0, def.heal?.radius ?? 60, 'rgba(120,220,120,0.12)', 'rgba(120,220,120,0.5)', 1);
      ctx.restore();
      break;
    case 'balloon': {
      const sway = Math.sin(time * 1.5 + e.id) * 2;
      ellipse(ctx, sway, 0, 17, 15, 0, '#d8b04a', '#8a6a22', 1.5);
      for (let i = -2; i <= 2; i++) {
        line(ctx, sway + i * 6, -14, sway + i * 6, 14, 'rgba(120,60,20,0.5)', 2);
      }
      ellipse(ctx, sway, 0, 6, 15, 0, '#b7402f');
      rect(ctx, sway - 4, -4, 8, 8, PALETTE.woodDark, PALETTE.black, 1);
      break;
    }
    case 'biplane': {
      const prop = time * 40;
      rect(ctx, -4, -16, 6, 32, '#c9b27a', '#7a6640', 1);
      rect(ctx, 6, -13, 5, 26, '#c9b27a', '#7a6640', 1);
      roundRect(ctx, -12, -3, 26, 6, 2, '#a88a52', '#5e4d2a', 1);
      rect(ctx, -14, -6, 4, 12, '#a88a52');
      circle(ctx, 2, -12, 3, PALETTE.blue);
      circle(ctx, 2, 12, 3, PALETTE.blue);
      circle(ctx, 2, -12, 1.5, PALETTE.white);
      circle(ctx, 2, 12, 1.5, PALETTE.white);
      line(ctx, 14, Math.cos(prop) * 7, 14, -Math.cos(prop) * 7, 'rgba(40,40,40,0.7)', 1.5);
      circle(ctx, -3, 0, 2, PALETTE.black);
      break;
    }
    case 'truck':
      roundRect(ctx, -16, -8, 22, 16, 2, '#4a6b3a', '#2f4526', 1.5);
      rect(ctx, 6, -7, 10, 14, '#3d5a30', '#2f4526', 1.5);
      rect(ctx, 12, -5, 3, 10, '#8fb9d8');
      for (const [x, y] of [
        [-10, -9],
        [-10, 9],
        [8, -9],
        [8, 9],
      ] as [number, number][]) {
        ellipse(ctx, x, y, 4, 2.2, 0, PALETTE.black);
      }
      line(ctx, -14, -6, 4, -6, 'rgba(255,255,255,0.35)', 1);
      break;
    case 'elephant':
    case 'boss_surus':
      elephant(ctx, phase, def.boss === true, time);
      break;
    case 'tank':
      tank(ctx, phase, 14, 9, '#5b6b3a', false);
      break;
    case 'boss_zeppelin': {
      const sway = Math.sin(time * 0.8) * 2;
      ellipse(ctx, sway, 0, 36, 12, 0, '#c9c9c4', '#7a7a76', 1.5);
      for (let i = -3; i <= 3; i++) line(ctx, sway + i * 9, -11, sway + i * 9, 11, 'rgba(0,0,0,0.15)', 1);
      rect(ctx, sway - 8, 8, 16, 5, '#5a5a56', PALETTE.black, 1);
      polygon(
        ctx,
        [
          [sway - 36, 0],
          [sway - 44, -8],
          [sway - 44, 8],
        ],
        '#a9a9a4',
        '#7a7a76',
        1,
      );
      circle(ctx, sway + 10, 0, 3, PALETTE.red);
      break;
    }
    case 'boss_mark':
      tank(ctx, phase, 26, 14, '#6e6a4a', true);
      break;
    default:
      walker(ctx, phase, '#888', '#444', 1);
  }
  if (flash > 0) {
    ctx.save();
    ctx.globalAlpha = flash * 0.7;
    ctx.globalCompositeOperation = 'lighter';
    circle(ctx, 0, 0, def.radius, '#ffffff');
    ctx.restore();
  }
}

/** Top-down foot soldier: two feet stepping, body, head. */
function walker(ctx: Ctx, phase: number, coat: string, helmet: string, size: number): void {
  ctx.save();
  ctx.scale(size * 1.15, size * 1.15);
  const step = Math.sin(phase * 1.6) * 4;
  ellipse(ctx, step, -4, 3, 2, 0, '#3a2a1a');
  ellipse(ctx, -step, 4, 3, 2, 0, '#3a2a1a');
  circle(ctx, 0, 0, 7, coat, 'rgba(0,0,0,0.4)', 1);
  circle(ctx, 1, 0, 4, helmet, 'rgba(0,0,0,0.3)', 1);
  ctx.restore();
}

function horse(ctx: Ctx, phase: number, color: string): void {
  const gallop = Math.sin(phase * 2.2) * 3;
  for (const [x, y] of [
    [-8, -5],
    [-8, 5],
    [6, -5],
    [6, 5],
  ] as [number, number][]) {
    ellipse(ctx, x + (y < 0 ? gallop : -gallop), y, 3, 2, 0, '#3a2a1a');
  }
  ellipse(ctx, 0, 0, 12, 6, 0, color, 'rgba(0,0,0,0.4)', 1);
  ellipse(ctx, 13, 0, 5, 3, 0, color, 'rgba(0,0,0,0.4)', 1);
  line(ctx, -12, 0, -17, 3, '#2a1a0a', 2);
}

function elephant(ctx: Ctx, phase: number, boss: boolean, time: number): void {
  const s = boss ? 1.25 : 1;
  ctx.save();
  ctx.scale(s, s);
  const step = Math.sin(phase * 1.2) * 3;
  for (const [x, y] of [
    [-9, -9],
    [-9, 9],
    [9, -9],
    [9, 9],
  ] as [number, number][]) {
    circle(ctx, x + (y < 0 ? step : -step), y, 4, '#5a5a5a');
  }
  ellipse(ctx, 0, 0, 20, 13, 0, '#7d7d7d', '#4a4a4a', 1.5);
  circle(ctx, 18, 0, 9, '#8a8a8a', '#4a4a4a', 1.5);
  ellipse(ctx, 18, -9, 6, 4, 0.5, '#8a8a8a');
  ellipse(ctx, 18, 9, 6, 4, -0.5, '#8a8a8a');
  line(ctx, 25, 0, 34 + Math.sin(time * 3) * 2, 3, '#7d7d7d', 4);
  line(ctx, 24, -4, 32, -7, '#efe6c8', 2.5);
  line(ctx, 24, 4, 32, 7, '#efe6c8', 2.5);
  // Howdah with a rider.
  rect(ctx, -8, -7, 14, 14, boss ? PALETTE.redDark : PALETTE.red, PALETTE.black, 1);
  circle(ctx, -1, 0, 3.5, PALETTE.skin);
  if (boss) {
    // Armour plating and a war banner.
    rect(ctx, 6, -10, 10, 20, 'rgba(180,140,60,0.7)', PALETTE.bronzeDark, 1);
    line(ctx, -12, 0, -12, -16, PALETTE.woodDark, 2);
    polygon(
      ctx,
      [
        [-12, -16],
        [-2, -13],
        [-12, -9],
      ],
      PALETTE.gold,
    );
  }
  ctx.restore();
}

function tank(
  ctx: Ctx,
  phase: number,
  length: number,
  width: number,
  color: string,
  rhomboid: boolean,
): void {
  const trackShift = (phase * 4) % 6;
  if (rhomboid) {
    polygon(
      ctx,
      [
        [-length, -width],
        [length * 0.8, -width],
        [length, 0],
        [length * 0.8, width],
        [-length, width],
      ],
      color,
      '#3a3826',
      1.5,
    );
    // Side sponsons with guns.
    rect(ctx, -6, -width - 5, 12, 5, '#5a5640', '#3a3826', 1);
    rect(ctx, -6, width, 12, 5, '#5a5640', '#3a3826', 1);
    line(ctx, 6, -width - 2.5, 16, -width - 2.5, PALETTE.ironDark, 2.5);
    line(ctx, 6, width + 2.5, 16, width + 2.5, PALETTE.ironDark, 2.5);
    for (let i = 0; i < 8; i++) {
      const x = -length + 2 + i * 7 + trackShift;
      if (x > length - 4) continue;
      rect(ctx, x, -width - 1, 4, 3, '#2a2a2a');
      rect(ctx, x, width - 2, 4, 3, '#2a2a2a');
    }
  } else {
    rect(ctx, -length, -width - 3, length * 2, 3, '#2a2a2a');
    rect(ctx, -length, width, length * 2, 3, '#2a2a2a');
    for (let i = 0; i < 5; i++) {
      const x = -length + 1 + i * 6 + trackShift;
      if (x > length - 3) continue;
      rect(ctx, x, -width - 3, 3, 3, '#5a5a5a');
      rect(ctx, x, width, 3, 3, '#5a5a5a');
    }
    roundRect(ctx, -length, -width, length * 2, width * 2, 2, color, '#3a3826', 1.5);
    circle(ctx, 0, 0, 6, '#4f5c33', '#3a3826', 1.5);
    line(ctx, 3, 0, 16, 0, PALETTE.ironDark, 2.5);
  }
}

/** Health (and shield) bar drawn above an enemy in world space, unrotated. */
export function drawHealthBar(ctx: Ctx, e: Enemy, def: EnemyDef): void {
  const w = def.boss ? 60 : Math.max(18, def.radius * 2);
  const h = def.boss ? 6 : 3.5;
  const x = e.x - w / 2;
  const y = e.y - def.radius - (e.flying ? 26 : 12);
  const ratio = Math.max(0, e.hp / e.maxHp);
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
  ctx.fillStyle = ratio > 0.5 ? '#5ad35a' : ratio > 0.25 ? '#e9c23a' : '#e04a3a';
  ctx.fillRect(x, y, w * ratio, h);
  if (def.shield && e.shield > 0) {
    ctx.fillStyle = '#6fc3ff';
    ctx.fillRect(x, y - h - 1, w * Math.min(1, e.shield / def.shield.amount), h * 0.7);
  }
}
