import type { Tower, TowerLevelDef, Trap } from '@/sim/types';
import {
  barrel,
  circle,
  crate,
  ellipse,
  flag,
  levelPips,
  line,
  polygon,
  rect,
  regularPolygon,
  roundRect,
  sandbagRing,
  shadow,
  soldier,
  tent,
  wheels,
} from './primitives';
import { PALETTE } from './theme';

type Ctx = CanvasRenderingContext2D;

/** Branch index used by drawing code: 1..3 for levels, 4 = branch A, 5 = branch B. */
function tier(t: Tower): number {
  if (t.level >= 4) return t.branch === 1 ? 5 : 4;
  return t.level;
}

function platform(ctx: Ctx, kind: 'wood' | 'stone' | 'sand' | 'earth' | 'concrete', r = 24): void {
  shadow(ctx, 3, 5, r + 2, (r + 2) * 0.8);
  switch (kind) {
    case 'wood':
      regularPolygon(ctx, 0, 0, r, 8, Math.PI / 8, PALETTE.wood, PALETTE.woodDark, 2);
      regularPolygon(ctx, 0, 0, r - 6, 8, Math.PI / 8, PALETTE.woodLight, undefined);
      for (let i = 0; i < 8; i++) {
        const a = Math.PI / 8 + (i / 8) * Math.PI * 2;
        line(
          ctx,
          Math.cos(a) * (r - 6),
          Math.sin(a) * (r - 6),
          Math.cos(a) * r,
          Math.sin(a) * r,
          PALETTE.woodDark,
          1.5,
        );
      }
      break;
    case 'stone':
      circle(ctx, 0, 0, r, PALETTE.stone, PALETTE.stoneDark, 2);
      circle(ctx, 0, 0, r - 6, PALETTE.stoneLight);
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        line(
          ctx,
          Math.cos(a) * (r - 6),
          Math.sin(a) * (r - 6),
          Math.cos(a) * r,
          Math.sin(a) * r,
          PALETTE.stoneDark,
          1,
        );
      }
      break;
    case 'sand':
      circle(ctx, 0, 0, r - 4, PALETTE.sandDark);
      sandbagRing(ctx, r - 4, 12);
      break;
    case 'earth':
      circle(ctx, 0, 0, r, '#7a6a4a', '#4f4330', 2);
      circle(ctx, 0, 0, r - 7, '#8f7c58');
      break;
    case 'concrete':
      regularPolygon(ctx, 0, 0, r, 6, 0, PALETTE.fieldGrey, PALETTE.ironDark, 2);
      regularPolygon(ctx, 0, 0, r - 6, 6, 0, PALETTE.ironLight);
      break;
  }
}

/** Draws the tower at the origin. Rotating parts use `tower.angle`. */
export function drawTower(ctx: Ctx, t: Tower, lvl: TowerLevelDef, time: number, selected: boolean): void {
  const tr = tier(t);
  const recoil = t.fireAnim * 6;
  ctx.save();
  if (selected) {
    ctx.save();
    ctx.globalAlpha = 0.35 + Math.sin(time * 5) * 0.1;
    circle(ctx, 0, 0, 30, 'rgba(255,220,120,0.35)');
    ctx.restore();
  }
  switch (t.defId) {
    case 'archers':
      drawArchers(ctx, t, tr, time, recoil);
      break;
    case 'ballista':
      drawBallista(ctx, t, tr, time, recoil);
      break;
    case 'cannon':
      drawCannon(ctx, t, tr, recoil);
      break;
    case 'siege':
      drawSiege(ctx, t, tr, time);
      break;
    case 'fire':
      drawFire(ctx, t, tr, time);
      break;
    case 'sappers':
      drawSappers(ctx, t, tr, lvl, time);
      break;
    case 'rockets':
      drawRockets(ctx, t, tr, recoil);
      break;
    case 'traps':
      drawTrapLayer(ctx, t, tr, time);
      break;
    case 'command':
      drawCommand(ctx, t, tr, time);
      break;
    default:
      platform(ctx, 'stone');
  }
  levelPips(ctx, t.level, 30);
  ctx.restore();
}

// ---------------------------------------------------------------------------

function drawArchers(ctx: Ctx, t: Tower, tr: number, time: number, recoil: number): void {
  if (tr === 1) {
    platform(ctx, 'wood');
    // Palisade posts.
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      circle(ctx, Math.cos(a) * 19, Math.sin(a) * 19, 3, PALETTE.woodDark);
    }
    for (const off of [-7, 7]) {
      const px = Math.cos(t.angle + Math.PI / 2) * off;
      const py = Math.sin(t.angle + Math.PI / 2) * off;
      soldier(ctx, px, py, '#5b7a3a', PALETTE.skin, t.angle, 11, PALETTE.woodDark);
      // Bow arc.
      ctx.save();
      ctx.translate(px + Math.cos(t.angle) * 9, py + Math.sin(t.angle) * 9);
      ctx.rotate(t.angle);
      ctx.beginPath();
      ctx.arc(0, 0, 6, -Math.PI / 2 - 0.4, Math.PI / 2 + 0.4);
      ctx.strokeStyle = PALETTE.woodLight;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
    }
  } else if (tr === 2) {
    platform(ctx, 'stone');
    for (const off of [-7, 7]) {
      const px = Math.cos(t.angle + Math.PI / 2) * off;
      const py = Math.sin(t.angle + Math.PI / 2) * off;
      soldier(ctx, px, py, '#6a4a2a', PALETTE.iron, t.angle, 12, PALETTE.woodDark);
      ctx.save();
      ctx.translate(px + Math.cos(t.angle) * 8, py + Math.sin(t.angle) * 8);
      ctx.rotate(t.angle);
      line(ctx, 0, -6, 0, 6, PALETTE.iron, 2);
      ctx.restore();
    }
  } else if (tr === 3) {
    platform(ctx, 'stone');
    for (const off of [-9, 0, 9]) {
      const px = Math.cos(t.angle + Math.PI / 2) * off - Math.cos(t.angle) * (off === 0 ? 6 : 0);
      const py = Math.sin(t.angle + Math.PI / 2) * off - Math.sin(t.angle) * (off === 0 ? 6 : 0);
      soldier(ctx, px, py, PALETTE.navy, '#2a2a2a', t.angle, 16, PALETTE.ironDark);
      circle(ctx, px, py, 4.5, 'rgba(0,0,0,0)', '#2a2a2a', 1.5);
    }
  } else if (tr === 4) {
    platform(ctx, 'sand');
    ctx.save();
    ctx.rotate(t.angle);
    wheels(ctx, -4, 12, 9, PALETTE.oliveDark, PALETTE.iron);
    rect(ctx, -10, -5, 14, 10, PALETTE.olive, PALETTE.oliveDark, 1.5);
    for (const dy of [-3, 0, 3]) {
      roundRect(ctx, 2 - recoil * 0.3, dy - 1.2, 20, 2.4, 1, PALETTE.ironDark);
    }
    circle(ctx, 2, 0, 5, PALETTE.iron, PALETTE.ironDark, 1);
    // Crank handle spins while firing.
    const spin = time * 20;
    line(ctx, -8, 0, -8 + Math.cos(spin) * 5, Math.sin(spin) * 5, PALETTE.ironLight, 2);
    ctx.restore();
    soldier(ctx, -Math.cos(t.angle) * 16, -Math.sin(t.angle) * 16, PALETTE.navy, '#2a2a2a', null);
  } else {
    platform(ctx, 'sand');
    for (const off of [-9, 0, 9]) {
      const px = Math.cos(t.angle + Math.PI / 2) * off - Math.cos(t.angle) * 4;
      const py = Math.sin(t.angle + Math.PI / 2) * off - Math.sin(t.angle) * 4;
      soldier(ctx, px, py, '#7d8fb0', '#5c6d84', t.angle, 18, PALETTE.ironDark);
    }
  }
}

function drawBallista(ctx: Ctx, t: Tower, tr: number, time: number, recoil: number): void {
  if (tr === 1) {
    platform(ctx, 'wood');
    ctx.save();
    ctx.rotate(t.angle);
    // Stock and bow arms.
    roundRect(ctx, -16, -3, 34, 6, 2, PALETTE.woodDark);
    line(ctx, 2, -16, 2, 16, PALETTE.woodLight, 4);
    line(ctx, 2, -16, 16 - recoil, 0, PALETTE.ironLight, 1.5);
    line(ctx, 2, 16, 16 - recoil, 0, PALETTE.ironLight, 1.5);
    // Bolt.
    line(ctx, -10 + recoil, 0, 16, 0, PALETTE.iron, 2.5);
    ctx.restore();
    soldier(ctx, -Math.cos(t.angle) * 18, -Math.sin(t.angle) * 18, PALETTE.red, PALETTE.bronze, null);
  } else if (tr === 2) {
    platform(ctx, 'wood');
    ctx.save();
    ctx.rotate(t.angle);
    wheels(ctx, -2, 12, 10);
    rect(ctx, -14, -4, 18, 8, PALETTE.wood, PALETTE.woodDark, 1.5);
    barrel(ctx, 30, 7, PALETTE.bronze, PALETTE.bronzeDark, recoil);
    ctx.restore();
  } else if (tr === 3) {
    platform(ctx, 'sand');
    ctx.save();
    ctx.rotate(t.angle);
    // Split trail.
    line(ctx, -4, 0, -20, -9, PALETTE.fieldGrey, 4);
    line(ctx, -4, 0, -20, 9, PALETTE.fieldGrey, 4);
    wheels(ctx, -2, 12, 9, PALETTE.ironDark, PALETTE.ironLight);
    polygon(
      ctx,
      [
        [2, -13],
        [6, -13],
        [6, 13],
        [2, 13],
      ],
      PALETTE.fieldGrey,
      PALETTE.ironDark,
      1.5,
    );
    barrel(ctx, 30, 5, PALETTE.fieldGrey, PALETTE.ironDark, recoil);
    ctx.restore();
  } else if (tr === 4) {
    platform(ctx, 'concrete');
    ctx.save();
    ctx.rotate(t.angle);
    // Cruciform outriggers.
    for (const a of [Math.PI / 4, -Math.PI / 4, (3 * Math.PI) / 4, (-3 * Math.PI) / 4]) {
      line(ctx, 0, 0, Math.cos(a) * 18, Math.sin(a) * 18, PALETTE.fieldGrey, 4);
    }
    circle(ctx, 0, 0, 9, PALETTE.fieldGrey, PALETTE.ironDark, 1.5);
    polygon(
      ctx,
      [
        [-2, -10],
        [4, -12],
        [4, 12],
        [-2, 10],
      ],
      PALETTE.fieldGrey,
      PALETTE.ironDark,
      1.5,
    );
    barrel(ctx, 38, 6, PALETTE.fieldGrey, PALETTE.ironDark, recoil, true);
    ctx.restore();
  } else {
    platform(ctx, 'sand');
    ctx.save();
    ctx.rotate(t.angle);
    // Prone rifleman with a long anti-tank rifle and bipod.
    ellipse(ctx, -12, 0, 10, 5, 0, '#7d8fb0', 'rgba(0,0,0,0.35)', 1);
    circle(ctx, -3, 0, 3.5, '#5c6d84');
    line(ctx, -2, 0, 26 - recoil * 0.5, 0, PALETTE.ironDark, 3);
    line(ctx, 14, 0, 12, -6, PALETTE.iron, 1.5);
    line(ctx, 14, 0, 12, 6, PALETTE.iron, 1.5);
    ctx.restore();
    void time;
  }
}

function drawCannon(ctx: Ctx, t: Tower, tr: number, recoil: number): void {
  platform(ctx, tr <= 2 ? 'stone' : tr === 3 ? 'sand' : 'concrete');
  ctx.save();
  ctx.rotate(t.angle);
  if (tr === 1) {
    wheels(ctx, -4, 11, 9);
    rect(ctx, -16, -5, 22, 10, PALETTE.wood, PALETTE.woodDark, 1.5);
    barrel(ctx, 24, 9, PALETTE.bronze, PALETTE.bronzeDark, recoil);
  } else if (tr === 2) {
    wheels(ctx, -3, 12, 11, '#3f5a3a', PALETTE.iron);
    rect(ctx, -18, -5, 24, 10, '#4b6b46', '#2e442b', 1.5);
    barrel(ctx, 28, 9, PALETTE.bronze, PALETTE.bronzeDark, recoil);
  } else if (tr === 3) {
    wheels(ctx, -3, 12, 10, PALETTE.ironDark, PALETTE.ironLight);
    line(ctx, -4, 0, -22, 0, PALETTE.fieldGrey, 5);
    polygon(
      ctx,
      [
        [0, -14],
        [5, -14],
        [5, 14],
        [0, 14],
      ],
      '#5f6f5f',
      PALETTE.ironDark,
      1.5,
    );
    rect(ctx, -6, -4, 14, 8, PALETTE.fieldGrey, PALETTE.ironDark, 1);
    barrel(ctx, 30, 6, '#5f6f5f', PALETTE.ironDark, recoil);
  } else if (tr === 4) {
    wheels(ctx, -3, 12, 11, '#3f5a3a', PALETTE.iron);
    rect(ctx, -18, -5, 24, 10, '#4b6b46', '#2e442b', 1.5);
    barrel(ctx, 22, 12, PALETTE.bronze, PALETTE.bronzeDark, recoil);
    crate(ctx, -22, -18, 10, 8);
    for (let i = 0; i < 3; i++) circle(ctx, -17 + i * 4, 14, 2.2, PALETTE.ironLight, PALETTE.ironDark, 1);
  } else {
    wheels(ctx, -6, 14, 13, PALETTE.ironDark, PALETTE.ironLight);
    line(ctx, -6, 0, -26, -10, PALETTE.fieldGrey, 5);
    line(ctx, -6, 0, -26, 10, PALETTE.fieldGrey, 5);
    rect(ctx, -12, -7, 20, 14, PALETTE.fieldGrey, PALETTE.ironDark, 1.5);
    barrel(ctx, 42, 8, PALETTE.fieldGrey, PALETTE.ironDark, recoil);
  }
  ctx.restore();
}

function drawSiege(ctx: Ctx, t: Tower, tr: number, time: number): void {
  const swing = t.fireAnim;
  if (tr === 1) {
    platform(ctx, 'wood');
    ctx.save();
    ctx.rotate(t.angle);
    rect(ctx, -18, -14, 34, 4, PALETTE.woodDark);
    rect(ctx, -18, 10, 34, 4, PALETTE.woodDark);
    rect(ctx, -12, -12, 6, 24, PALETTE.wood);
    // Throwing arm: swings forward when firing.
    const armLen = 22;
    const armAngle = -0.8 + swing * 1.6;
    ctx.save();
    ctx.translate(-8, 0);
    ctx.rotate(0);
    line(ctx, 0, 0, Math.cos(armAngle) * armLen, Math.sin(armAngle) * armLen * 0.4, PALETTE.woodLight, 4);
    circle(ctx, Math.cos(armAngle) * armLen, Math.sin(armAngle) * armLen * 0.4, 4, PALETTE.woodDark);
    ctx.restore();
    ctx.restore();
    soldier(
      ctx,
      -Math.cos(t.angle + 0.8) * 20,
      -Math.sin(t.angle + 0.8) * 20,
      PALETTE.red,
      PALETTE.bronze,
      null,
    );
  } else if (tr === 2) {
    platform(ctx, 'wood');
    ctx.save();
    ctx.rotate(t.angle);
    // A-frame base.
    line(ctx, -14, -16, 0, 0, PALETTE.woodDark, 5);
    line(ctx, -14, 16, 0, 0, PALETTE.woodDark, 5);
    line(ctx, -14, -16, -14, 16, PALETTE.woodDark, 4);
    // Long arm with counterweight box at the back.
    const armAngle = 0.25 - swing * 0.9;
    const bx = -Math.cos(armAngle) * 14;
    const by = -Math.sin(armAngle) * 14;
    line(ctx, bx, by, Math.cos(armAngle) * 30, Math.sin(armAngle) * 30, PALETTE.woodLight, 4);
    rect(ctx, bx - 5, by - 5, 10, 10, PALETTE.woodDark, PALETTE.black, 1);
    ctx.restore();
  } else if (tr === 3) {
    platform(ctx, 'earth');
    ctx.save();
    ctx.rotate(t.angle);
    rect(ctx, -16, -12, 24, 24, PALETTE.ironDark, PALETTE.black, 1);
    ellipse(ctx, 6 - swing * 4, 0, 8, 10, 0, PALETTE.fieldGrey, PALETTE.ironDark, 1.5);
    ellipse(ctx, 10 - swing * 4, 0, 5, 7, 0, PALETTE.black);
    ctx.restore();
    soldier(ctx, -Math.cos(t.angle + 1) * 20, -Math.sin(t.angle + 1) * 20, '#7d8fb0', '#5c6d84', null);
  } else if (tr === 4) {
    platform(ctx, 'sand');
    ctx.save();
    ctx.rotate(t.angle);
    circle(ctx, -6, 0, 8, PALETTE.ironDark, PALETTE.black, 1);
    line(ctx, -6, 0, 18, -4, PALETTE.fieldGrey, 5);
    line(ctx, 6, -2, 2, -12, PALETTE.iron, 2);
    line(ctx, 6, -2, 2, 8, PALETTE.iron, 2);
    ctx.restore();
    soldier(ctx, -Math.cos(t.angle - 1) * 18, -Math.sin(t.angle - 1) * 18, '#7d8fb0', '#5c6d84', null);
    soldier(ctx, -Math.cos(t.angle + 1) * 18, -Math.sin(t.angle + 1) * 18, '#7d8fb0', '#5c6d84', null);
  } else {
    platform(ctx, 'concrete', 26);
    ctx.save();
    ctx.rotate(t.angle);
    wheels(ctx, -8, 15, 13, PALETTE.ironDark, PALETTE.ironLight);
    rect(ctx, -20, -9, 26, 18, PALETTE.fieldGrey, PALETTE.ironDark, 1.5);
    roundRect(ctx, -2 - swing * 6, -8, 30, 16, 4, '#5a5f66', PALETTE.ironDark, 1.5);
    ellipse(ctx, 27 - swing * 6, 0, 3, 7, 0, PALETTE.black);
    ctx.restore();
    void time;
  }
}

function drawFire(ctx: Ctx, t: Tower, tr: number, time: number): void {
  const flicker = 0.7 + Math.sin(time * 18) * 0.3;
  if (tr <= 2) {
    platform(ctx, 'stone');
    circle(ctx, 0, 0, tr === 1 ? 9 : 11, PALETTE.bronzeDark, PALETTE.black, 1.5);
    circle(ctx, 0, 0, tr === 1 ? 6 : 8, PALETTE.fire);
    circle(ctx, 0, 0, (tr === 1 ? 3 : 4) * flicker, PALETTE.fireCore);
    ctx.save();
    ctx.rotate(t.angle);
    barrel(ctx, tr === 1 ? 18 : 22, 5, PALETTE.bronze, PALETTE.bronzeDark);
    if (tr === 2) {
      line(ctx, -8, -8, -14, -14, PALETTE.bronzeDark, 3);
    }
    ctx.restore();
    soldier(ctx, -Math.cos(t.angle) * 18, -Math.sin(t.angle) * 18, '#6a3b8a', PALETTE.bronze, null);
  } else if (tr === 3 || tr === 4) {
    platform(ctx, 'sand');
    const n = tr === 3 ? 1 : 2;
    for (let i = 0; i < n; i++) {
      const off = n === 1 ? 0 : i === 0 ? -8 : 8;
      const px = Math.cos(t.angle + Math.PI / 2) * off;
      const py = Math.sin(t.angle + Math.PI / 2) * off;
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(t.angle);
      // Backpack tanks behind the soldier.
      roundRect(ctx, -12, -6, 7, 12, 2, PALETTE.ironLight, PALETTE.ironDark, 1);
      roundRect(ctx, -5, -6, 5, 12, 2, PALETTE.ironLight, PALETTE.ironDark, 1);
      ctx.restore();
      soldier(ctx, px, py, '#7d8fb0', '#5c6d84', t.angle, 16, PALETTE.ironDark);
    }
  } else {
    platform(ctx, 'earth');
    for (const [dx, dy] of [
      [-8, -8],
      [8, -8],
      [-8, 8],
      [8, 8],
    ] as [number, number][]) {
      circle(ctx, dx, dy, 6, PALETTE.ironDark, PALETTE.black, 1);
      circle(ctx, dx, dy, 3.5, PALETTE.black);
    }
    sandbagRing(ctx, 21, 10, time * 0);
  }
}

function drawSappers(ctx: Ctx, t: Tower, tr: number, lvl: TowerLevelDef, time: number): void {
  // Area of effect drawn on the ground.
  ctx.save();
  ctx.globalAlpha = 0.16;
  const zone = tr === 5 ? '#6a4a2a' : tr === 4 ? '#5aa0d8' : tr === 3 ? '#4a3a2a' : '#8a8a80';
  circle(ctx, 0, 0, lvl.range * (1 + t.buff.range), zone);
  ctx.restore();
  ctx.save();
  ctx.globalAlpha = 0.6;
  ctx.setLineDash([6, 8]);
  circle(ctx, 0, 0, lvl.range * (1 + t.buff.range), 'rgba(0,0,0,0)', 'rgba(255,255,255,0.35)', 1.5);
  ctx.setLineDash([]);
  ctx.restore();

  if (tr === 1) {
    platform(ctx, 'earth', 20);
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      const x = Math.cos(a) * 16;
      const y = Math.sin(a) * 16;
      for (let s = 0; s < 4; s++) {
        const sa = a + (s / 4) * Math.PI * 2;
        line(ctx, x, y, x + Math.cos(sa) * 4, y + Math.sin(sa) * 4, PALETTE.ironDark, 1.5);
      }
    }
    soldier(ctx, 0, 0, '#5b6a4a', PALETTE.iron, null);
  } else if (tr === 2) {
    platform(ctx, 'earth', 20);
    ctx.beginPath();
    for (let i = 0; i <= 40; i++) {
      const a = (i / 40) * Math.PI * 2;
      const r = 17 + (i % 2 ? 3 : -3);
      const x = Math.cos(a) * r;
      const y = Math.sin(a) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = PALETTE.ironDark;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      line(ctx, Math.cos(a) * 12, Math.sin(a) * 12, Math.cos(a) * 20, Math.sin(a) * 20, PALETTE.woodDark, 3);
    }
    soldier(ctx, 0, 0, '#5b6a4a', PALETTE.iron, null);
  } else if (tr === 3) {
    platform(ctx, 'earth', 22);
    circle(ctx, 0, 0, 17, '#3a2f22', '#241d15', 2);
    circle(ctx, 0, 0, 11, '#4f4230');
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      line(ctx, Math.cos(a) * 6, Math.sin(a) * 6, Math.cos(a) * 15, Math.sin(a) * 15, PALETTE.iron, 2);
    }
  } else if (tr === 4) {
    platform(ctx, 'concrete', 24);
    ctx.save();
    ctx.rotate(time * 0.8);
    roundRect(ctx, -16, -9, 26, 18, 3, PALETTE.fieldGrey, PALETTE.ironDark, 1.5);
    rect(ctx, -16, -9, 8, 18, '#4f5459');
    wheels(ctx, -10, 10, 5, PALETTE.black, PALETTE.iron);
    wheels(ctx, 6, 10, 5, PALETTE.black, PALETTE.iron);
    circle(ctx, 4, 0, 5, PALETTE.ironLight, PALETTE.ironDark, 1);
    line(ctx, 4, 0, 20, 0, PALETTE.ironLight, 4);
    ctx.restore();
  } else {
    platform(ctx, 'earth', 22);
    ellipse(ctx, 0, 0, 20, 14, 0.3, '#5a4a34', '#3f3222', 2);
    ellipse(ctx, -4, 2, 10, 6, 0.3, '#6b5a40');
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      line(ctx, Math.cos(a) * 12, Math.sin(a) * 12, Math.cos(a) * 20, Math.sin(a) * 20, PALETTE.woodDark, 3);
    }
  }
}

function drawRockets(ctx: Ctx, t: Tower, tr: number, recoil: number): void {
  platform(ctx, tr <= 2 ? 'wood' : tr === 4 ? 'concrete' : 'sand');
  ctx.save();
  ctx.rotate(t.angle);
  if (tr === 1) {
    wheels(ctx, -6, 12, 9);
    rect(ctx, -16, -12, 24, 24, PALETTE.wood, PALETTE.woodDark, 1.5);
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 5; c++) {
        circle(ctx, -12 + c * 5, -9 + r * 6, 1.8, PALETTE.black);
      }
    }
    rect(ctx, 8, -10, 8 - recoil, 20, PALETTE.woodDark);
  } else if (tr === 2) {
    line(ctx, -14, -12, 8, 0, PALETTE.woodDark, 3);
    line(ctx, -14, 12, 8, 0, PALETTE.woodDark, 3);
    line(ctx, -14, -12, -14, 12, PALETTE.woodDark, 3);
    for (let i = -2; i <= 2; i++) {
      line(ctx, -6, i * 4, 16 - recoil, i * 4, PALETTE.ironDark, 2);
      circle(ctx, 16 - recoil, i * 4, 1.8, PALETTE.red);
    }
  } else if (tr === 3 || tr === 5) {
    roundRect(ctx, -20, -10, 34, 20, 3, tr === 3 ? PALETTE.olive : '#5d6a42', PALETTE.oliveDark, 1.5);
    rect(ctx, -20, -10, 9, 20, PALETTE.oliveDark);
    wheels(ctx, -14, 11, 5, PALETTE.black, PALETTE.iron);
    wheels(ctx, 6, 11, 5, PALETTE.black, PALETTE.iron);
    if (tr === 3) {
      for (let i = -3; i <= 3; i++) line(ctx, -8, i * 2.6, 20 - recoil, i * 2.6, PALETTE.ironDark, 1.5);
    } else {
      rect(ctx, -8, -9, 24, 18, PALETTE.fieldGrey, PALETTE.ironDark, 1);
      for (let r = 0; r < 5; r++)
        for (let c = 0; c < 8; c++) circle(ctx, -6 + c * 3, -7 + r * 3.5, 1, PALETTE.black);
    }
  } else {
    wheels(ctx, -4, 12, 9, PALETTE.ironDark, PALETTE.ironLight);
    line(ctx, -4, 0, -20, -8, PALETTE.fieldGrey, 4);
    line(ctx, -4, 0, -20, 8, PALETTE.fieldGrey, 4);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const y = Math.sin(a) * 7;
      const z = Math.cos(a) * 7;
      roundRect(ctx, -6 - recoil + z * 0.2, y - 2.5, 24, 5, 2, PALETTE.fieldGrey, PALETTE.ironDark, 1);
    }
  }
  ctx.restore();
}

function drawTrapLayer(ctx: Ctx, t: Tower, tr: number, time: number): void {
  platform(ctx, tr <= 2 ? 'earth' : 'sand', 22);
  if (tr === 1) {
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      line(
        ctx,
        Math.cos(a) * 8,
        Math.sin(a) * 8,
        Math.cos(a) * 16,
        Math.sin(a) * 16 - 4,
        PALETTE.woodLight,
        3,
      );
    }
    soldier(ctx, 0, 0, '#6a5a3a', PALETTE.skin, null);
  } else if (tr === 2) {
    circle(ctx, -6, 2, 8, PALETTE.woodDark, PALETTE.black, 1);
    circle(ctx, -6, 2, 5, PALETTE.wood);
    line(ctx, 0, -4, 10, -12, PALETTE.black, 2);
    circle(ctx, 10, -12, 2.5 + Math.sin(time * 10) * 0.8, PALETTE.fire);
    soldier(ctx, 10, 8, '#6a5a3a', PALETTE.iron, null);
  } else if (tr === 3) {
    crate(ctx, -14, -10, 18, 14);
    for (let i = 0; i < 3; i++) circle(ctx, -10 + i * 5, -3, 3, PALETTE.olive, PALETTE.black, 1);
    soldier(ctx, 10, 6, '#7d8fb0', '#5c6d84', null);
  } else if (tr === 4) {
    for (let i = 0; i < 4; i++) ellipse(ctx, -6, 8 - i * 4, 12, 6, 0, PALETTE.fieldGrey, PALETTE.ironDark, 1);
    soldier(ctx, 12, 4, '#7d8fb0', '#5c6d84', null);
  } else {
    for (let i = 0; i < 4; i++) {
      const x = -12 + (i % 2) * 12;
      const y = -8 + Math.floor(i / 2) * 12;
      circle(ctx, x, y, 5, PALETTE.olive, PALETTE.black, 1);
      circle(ctx, x, y, 1.5, PALETTE.ironLight);
    }
    soldier(ctx, 14, 2, '#7d8fb0', '#5c6d84', null);
  }
}

function drawCommand(ctx: Ctx, t: Tower, tr: number, time: number): void {
  if (tr === 1) {
    platform(ctx, 'stone', 20);
    soldier(ctx, 0, 4, PALETTE.red, PALETTE.bronze, null);
    line(ctx, 6, 6, 6, -22, PALETTE.woodDark, 2.5, 'butt');
    rect(ctx, 6, -20, 12, 9, PALETTE.red, PALETTE.redDark, 1);
    ctx.save();
    ctx.translate(6, -24);
    polygon(
      ctx,
      [
        [-4, 2],
        [0, -3],
        [4, 2],
        [0, 0],
      ],
      PALETTE.gold,
    );
    ctx.restore();
  } else if (tr === 2) {
    platform(ctx, 'stone', 22);
    for (const [x, y] of [
      [-8, -4],
      [8, 4],
    ] as [number, number][]) {
      circle(ctx, x, y, 6, PALETTE.blue, PALETTE.navy, 1.5);
      circle(ctx, x, y, 4, PALETTE.sand);
      const beat = Math.sin(time * 8 + x) * 3;
      line(ctx, x - 5, y - 6 + beat, x, y, PALETTE.woodDark, 1.5);
      line(ctx, x + 5, y - 6 - beat, x, y, PALETTE.woodDark, 1.5);
    }
    soldier(ctx, -8, 8, PALETTE.white, PALETTE.navy, null);
    soldier(ctx, 8, -8, PALETTE.white, PALETTE.navy, null);
  } else if (tr === 3) {
    platform(ctx, 'concrete', 22);
    rect(ctx, -16, 4, 14, 12, PALETTE.olive, PALETTE.oliveDark, 1.5);
    ctx.save();
    ctx.translate(4, -4);
    ctx.rotate(time * 1.2);
    line(ctx, -12, -8, -12, 8, PALETTE.ironLight, 3);
    for (let i = -2; i <= 2; i++) line(ctx, -12, i * 4, 6, i * 4, PALETTE.ironLight, 1.5);
    line(ctx, -12, 0, 6, 0, PALETTE.ironDark, 2);
    ctx.restore();
    circle(ctx, 4, -4, 3, PALETTE.ironDark);
  } else if (tr === 4) {
    platform(ctx, 'sand', 24);
    tent(ctx, -6, -2, 26, 20, PALETTE.sand);
    rect(ctx, 6, 4, 14, 9, PALETTE.wood, PALETTE.woodDark, 1);
    rect(ctx, 8, 6, 10, 5, PALETTE.white);
    soldier(ctx, 14, -6, PALETTE.navy, PALETTE.gold, null);
    soldier(ctx, 4, 12, PALETTE.navy, PALETTE.gold, null);
    flag(ctx, -18, 10, PALETTE.blue, time, 12, 14);
  } else {
    platform(ctx, 'earth', 24);
    crate(ctx, -18, -14, 12, 10);
    crate(ctx, -6, -16, 12, 10);
    crate(ctx, -14, -4, 12, 10);
    circle(ctx, 8, 0, 6, PALETTE.woodDark, PALETTE.black, 1);
    circle(ctx, 8, 0, 3.5, PALETTE.wood);
    circle(ctx, 14, 10, 6, PALETTE.woodDark, PALETTE.black, 1);
    circle(ctx, 14, 10, 3.5, PALETTE.wood);
    soldier(ctx, -8, 12, '#6a5a3a', PALETTE.skin, null);
  }
}

/** Draws a placed trap at the origin. */
export function drawTrap(ctx: Ctx, trap: Trap, tr: number, time: number): void {
  const blink = (Math.sin(time * 4 + trap.id) + 1) / 2;
  if (tr === 1) {
    ellipse(ctx, 0, 0, 9, 6, 0, '#3a2f22', '#241d15', 1.5);
    for (let i = 0; i < 4; i++) line(ctx, -6 + i * 4, 3, -6 + i * 4, -4, PALETTE.woodLight, 1.5);
  } else if (tr === 2) {
    ellipse(ctx, 0, 0, 9, 6, 0, '#5a4a34', '#3f3222', 1.5);
    for (let i = 0; i < 4; i++) circle(ctx, -5 + i * 3.5, -1, 2, PALETTE.stone, PALETTE.stoneDark, 1);
  } else {
    circle(ctx, 0, 0, 6, tr === 4 ? PALETTE.fieldGrey : PALETTE.olive, PALETTE.ironDark, 1);
    circle(ctx, 0, 0, 1.6, `rgba(255,80,60,${0.4 + blink * 0.6})`);
  }
}

/** Trap tier for a trap-laying tower. */
export function trapTier(t: Tower): number {
  return tier(t);
}
