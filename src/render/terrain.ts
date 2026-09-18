import type { Grid } from '@/sim/grid';
import { TILE, tileCenter } from '@/sim/grid';
import type { Tile } from '@/sim/types';
import { PALETTE } from './theme';
import type { Theme } from './theme';

/** Pseudo random in [0,1) from a tile variant and a salt. */
function vr(t: Tile, salt: number): number {
  let h = (t.variant + salt * 0x9e3779b1) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h = (h ^ (h >>> 13)) >>> 0;
  return (h % 10000) / 10000;
}

/** Renders the static playfield to an offscreen canvas at the given scale. */
export function renderTerrain(grid: Grid, theme: Theme, scale: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(grid.width * scale);
  canvas.height = Math.ceil(grid.height * scale);
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  ctx.scale(scale, scale);

  drawGround(ctx, grid, theme);
  drawWater(ctx, grid, theme);
  drawPaths(ctx, grid, theme);
  drawOpenMarkers(ctx, grid, theme);
  drawDecor(ctx, grid, theme);
  drawSpawnsAndBases(ctx, grid, theme);
  return canvas;
}

function drawGround(ctx: CanvasRenderingContext2D, grid: Grid, theme: Theme): void {
  ctx.fillStyle = theme.ground[0];
  ctx.fillRect(0, 0, grid.width, grid.height);
  for (const t of grid.tiles) {
    const x = t.col * TILE;
    const y = t.row * TILE;
    const shade = vr(t, 1);
    ctx.fillStyle = shade < 0.33 ? theme.ground[0] : shade < 0.66 ? theme.ground[1] : theme.ground[2];
    ctx.fillRect(x, y, TILE, TILE);
    // Soft blotches to break the grid.
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = vr(t, 2) < 0.5 ? theme.ground[1] : theme.ground[2];
    ctx.beginPath();
    ctx.ellipse(
      x + vr(t, 3) * TILE,
      y + vr(t, 4) * TILE,
      18 + vr(t, 5) * 22,
      12 + vr(t, 6) * 16,
      vr(t, 7) * Math.PI,
      0,
      Math.PI * 2,
    );
    ctx.fill();
    ctx.globalAlpha = 1;
    // Grass tufts / pebbles.
    if (t.kind === 'build' || t.kind === 'spawn' || t.kind === 'base') {
      const n = 2 + Math.floor(vr(t, 8) * 4);
      ctx.strokeStyle = theme.tuft;
      ctx.lineWidth = 1.5;
      ctx.lineCap = 'round';
      for (let i = 0; i < n; i++) {
        const tx = x + 6 + vr(t, 10 + i) * (TILE - 12);
        const ty = y + 6 + vr(t, 20 + i) * (TILE - 12);
        ctx.globalAlpha = 0.55;
        ctx.beginPath();
        ctx.moveTo(tx - 3, ty + 3);
        ctx.lineTo(tx, ty - 3);
        ctx.moveTo(tx, ty + 3);
        ctx.lineTo(tx + 2, ty - 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }
  }
  if (theme.snowCaps) {
    // Snow drifts.
    for (const t of grid.tiles) {
      if (vr(t, 30) > 0.3) continue;
      const c = tileCenter(t.col, t.row);
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.beginPath();
      ctx.ellipse(c.x + (vr(t, 31) - 0.5) * 30, c.y + (vr(t, 32) - 0.5) * 30, 26, 14, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawWater(ctx: CanvasRenderingContext2D, grid: Grid, theme: Theme): void {
  const isWater = (c: number, r: number) => grid.tile(c, r)?.kind === 'water';
  // Shore halo first.
  for (const t of grid.tiles) {
    if (t.kind !== 'water') continue;
    ctx.fillStyle = theme.shore;
    ctx.fillRect(t.col * TILE - 4, t.row * TILE - 4, TILE + 8, TILE + 8);
  }
  for (const t of grid.tiles) {
    if (t.kind !== 'water') continue;
    const x = t.col * TILE;
    const y = t.row * TILE;
    ctx.fillStyle = theme.water;
    ctx.fillRect(x, y, TILE, TILE);
    // Deeper centre when surrounded.
    const surrounded =
      isWater(t.col - 1, t.row) &&
      isWater(t.col + 1, t.row) &&
      isWater(t.col, t.row - 1) &&
      isWater(t.col, t.row + 1);
    if (surrounded) {
      ctx.fillStyle = theme.waterDeep;
      ctx.globalAlpha = 0.6;
      ctx.fillRect(x + 6, y + 6, TILE - 12, TILE - 12);
      ctx.globalAlpha = 1;
    }
    if (theme.waterKind === 'water') {
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 1.5;
      for (let i = 0; i < 3; i++) {
        const wx = x + 8 + vr(t, 40 + i) * 40;
        const wy = y + 10 + vr(t, 50 + i) * 44;
        ctx.beginPath();
        ctx.moveTo(wx, wy);
        ctx.quadraticCurveTo(wx + 5, wy - 3, wx + 10, wy);
        ctx.quadraticCurveTo(wx + 15, wy + 3, wx + 20, wy);
        ctx.stroke();
      }
    } else {
      // Mud: ripples and puddles.
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.beginPath();
      ctx.ellipse(x + 32 + (vr(t, 41) - 0.5) * 20, y + 32 + (vr(t, 42) - 0.5) * 20, 20, 9, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.18)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(x + 32, y + 32, 24, 12, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
}

function drawPaths(ctx: CanvasRenderingContext2D, grid: Grid, theme: Theme): void {
  if (grid.paths.length === 0) return;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  for (const pass of [
    { color: theme.pathEdge, width: 50 },
    { color: theme.path, width: 40 },
  ]) {
    ctx.strokeStyle = pass.color;
    ctx.lineWidth = pass.width;
    for (const p of grid.paths) {
      ctx.beginPath();
      p.points.forEach((pt, i) => (i === 0 ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y)));
      ctx.stroke();
    }
  }
  // Wheel ruts / stones along the path.
  ctx.strokeStyle = theme.pathDetail;
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 14]);
  for (const p of grid.paths) {
    for (const offset of [-9, 9]) {
      ctx.beginPath();
      for (let i = 1; i < p.points.length; i++) {
        const a = p.points[i - 1]!;
        const b = p.points[i]!;
        const ang = Math.atan2(b.y - a.y, b.x - a.x);
        const ox = -Math.sin(ang) * offset;
        const oy = Math.cos(ang) * offset;
        if (i === 1) ctx.moveTo(a.x + ox, a.y + oy);
        ctx.lineTo(b.x + ox, b.y + oy);
      }
      ctx.stroke();
    }
  }
  ctx.setLineDash([]);
  // Pebbles.
  ctx.fillStyle = theme.pathEdge;
  for (const t of grid.tiles) {
    if (t.kind !== 'path') continue;
    for (let i = 0; i < 3; i++) {
      const px = t.col * TILE + 10 + vr(t, 60 + i) * 44;
      const py = t.row * TILE + 10 + vr(t, 70 + i) * 44;
      ctx.globalAlpha = 0.5;
      ctx.beginPath();
      ctx.ellipse(px, py, 2.5, 1.6, vr(t, 80 + i) * 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }
}

function drawOpenMarkers(ctx: CanvasRenderingContext2D, grid: Grid, theme: Theme): void {
  if (!grid.open) return;
  // Trench-like scratches and craters to sell the open battlefield.
  for (const t of grid.tiles) {
    if (t.kind !== 'build') continue;
    if (vr(t, 90) > 0.12) continue;
    const c = tileCenter(t.col, t.row);
    ctx.fillStyle = 'rgba(0,0,0,0.14)';
    ctx.beginPath();
    ctx.ellipse(
      c.x + (vr(t, 91) - 0.5) * 20,
      c.y + (vr(t, 92) - 0.5) * 20,
      14,
      9,
      vr(t, 93) * 3,
      0,
      Math.PI * 2,
    );
    ctx.fill();
    ctx.strokeStyle = theme.rockLight;
    ctx.globalAlpha = 0.25;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
}

function drawDecor(ctx: CanvasRenderingContext2D, grid: Grid, theme: Theme): void {
  for (const t of grid.tiles) {
    const c = tileCenter(t.col, t.row);
    switch (t.kind) {
      case 'rock':
        drawRock(ctx, c.x, c.y, t, theme);
        break;
      case 'tree':
        drawTree(ctx, c.x, c.y, t, theme);
        break;
      case 'ruin':
        drawRuin(ctx, c.x, c.y, t, theme);
        break;
      default:
        break;
    }
  }
}

function drawRock(ctx: CanvasRenderingContext2D, x: number, y: number, t: Tile, theme: Theme): void {
  const n = 2 + Math.floor(vr(t, 100) * 2);
  for (let i = 0; i < n; i++) {
    const rx = x + (vr(t, 101 + i) - 0.5) * 30;
    const ry = y + (vr(t, 111 + i) - 0.5) * 30;
    const r = 12 + vr(t, 121 + i) * 14;
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath();
    ctx.ellipse(rx + 3, ry + 5, r, r * 0.7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = theme.rock;
    ctx.beginPath();
    const sides = 6;
    for (let s = 0; s < sides; s++) {
      const a = (s / sides) * Math.PI * 2;
      const rr = r * (0.8 + vr(t, 131 + s + i * 7) * 0.35);
      const px = rx + Math.cos(a) * rr;
      const py = ry + Math.sin(a) * rr * 0.75;
      if (s === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = theme.rockDark;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = theme.snowCaps ? '#ffffff' : theme.rockLight;
    ctx.globalAlpha = theme.snowCaps ? 0.8 : 0.5;
    ctx.beginPath();
    ctx.ellipse(rx - r * 0.25, ry - r * 0.3, r * 0.4, r * 0.22, -0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

function drawTree(ctx: CanvasRenderingContext2D, x: number, y: number, t: Tile, theme: Theme): void {
  const n = 1 + Math.floor(vr(t, 200) * 2);
  for (let i = 0; i < n; i++) {
    const tx = x + (vr(t, 201 + i) - 0.5) * 26;
    const ty = y + (vr(t, 211 + i) - 0.5) * 26;
    const r = 14 + vr(t, 221 + i) * 10;
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.beginPath();
    ctx.ellipse(tx + 5, ty + 8, r, r * 0.6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = theme.trunk;
    ctx.fillRect(tx - 2.5, ty, 5, 10);
    ctx.fillStyle = theme.treeDark;
    ctx.beginPath();
    ctx.arc(tx, ty - 2, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = theme.tree;
    ctx.beginPath();
    ctx.arc(tx - r * 0.25, ty - r * 0.3, r * 0.7, 0, Math.PI * 2);
    ctx.fill();
    if (theme.snowCaps) {
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.beginPath();
      ctx.arc(tx - r * 0.2, ty - r * 0.45, r * 0.45, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawRuin(ctx: CanvasRenderingContext2D, x: number, y: number, t: Tile, theme: Theme): void {
  const w = 30 + vr(t, 300) * 22;
  const h = 18 + vr(t, 301) * 22;
  const rx = x - w / 2 + (vr(t, 302) - 0.5) * 8;
  const ry = y - h / 2 + (vr(t, 303) - 0.5) * 8;
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(rx + 4, ry + 6, w, h);
  ctx.fillStyle = theme.ruin;
  ctx.beginPath();
  ctx.moveTo(rx, ry + h);
  ctx.lineTo(rx, ry + h * (0.3 + vr(t, 304) * 0.5));
  const steps = 5;
  for (let s = 0; s <= steps; s++) {
    const px = rx + (w * s) / steps;
    const py = ry + h * (0.1 + vr(t, 310 + s) * 0.6);
    ctx.lineTo(px, py);
  }
  ctx.lineTo(rx + w, ry + h);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = theme.ruinDark;
  ctx.lineWidth = 2;
  ctx.stroke();
  // Window holes and brick lines.
  ctx.fillStyle = theme.ruinDark;
  if (vr(t, 320) > 0.4) ctx.fillRect(rx + w * 0.3, ry + h * 0.5, 7, 9);
  if (vr(t, 321) > 0.4) ctx.fillRect(rx + w * 0.65, ry + h * 0.55, 7, 9);
  ctx.strokeStyle = 'rgba(0,0,0,0.15)';
  ctx.lineWidth = 1;
  for (let i = 1; i < 4; i++) {
    ctx.beginPath();
    ctx.moveTo(rx, ry + (h * i) / 4);
    ctx.lineTo(rx + w, ry + (h * i) / 4);
    ctx.stroke();
  }
  if (theme.snowCaps) {
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fillRect(rx, ry + h * 0.1, w, 4);
  }
}

function drawSpawnsAndBases(ctx: CanvasRenderingContext2D, grid: Grid, theme: Theme): void {
  for (const [c, r] of grid.spawns) drawGate(ctx, tileCenter(c, r), grid, c, r, theme);
  for (const [c, r] of grid.bases) drawFortress(ctx, tileCenter(c, r), theme);
}

function drawGate(
  ctx: CanvasRenderingContext2D,
  p: { x: number; y: number },
  grid: Grid,
  col: number,
  row: number,
  theme: Theme,
): void {
  // Orientation: face into the map from the edge.
  let angle = 0;
  if (col === 0) angle = 0;
  else if (col === grid.cols - 1) angle = Math.PI;
  else if (row === 0) angle = Math.PI / 2;
  else if (row === grid.rows - 1) angle = -Math.PI / 2;
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(angle);
  // Two wooden posts with a crossbar, plus torches.
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(-26, -30, 12, 62);
  ctx.fillStyle = PALETTE.woodDark;
  ctx.fillRect(-30, -32, 10, 20);
  ctx.fillRect(-30, 12, 10, 20);
  ctx.fillStyle = PALETTE.wood;
  ctx.fillRect(-28, -30, 6, 16);
  ctx.fillRect(-28, 14, 6, 16);
  ctx.fillStyle = PALETTE.redDark;
  ctx.beginPath();
  ctx.moveTo(-22, -22);
  ctx.lineTo(-4, -16);
  ctx.lineTo(-22, -10);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-22, 22);
  ctx.lineTo(-4, 16);
  ctx.lineTo(-22, 10);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = theme.night ? '#ffb347' : PALETTE.gold;
  ctx.beginPath();
  ctx.arc(-25, -34, 3.5, 0, Math.PI * 2);
  ctx.arc(-25, 34, 3.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawFortress(ctx: CanvasRenderingContext2D, p: { x: number; y: number }, theme: Theme): void {
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.beginPath();
  ctx.ellipse(4, 10, 30, 22, 0, 0, Math.PI * 2);
  ctx.fill();
  // Keep.
  ctx.fillStyle = PALETTE.stoneDark;
  ctx.fillRect(-24, -18, 48, 40);
  ctx.fillStyle = PALETTE.stone;
  ctx.fillRect(-22, -20, 44, 36);
  // Battlements.
  ctx.fillStyle = PALETTE.stoneLight;
  for (let i = 0; i < 5; i++) ctx.fillRect(-22 + i * 10, -26, 6, 8);
  // Towers on corners.
  for (const [cx, cy] of [
    [-22, -18],
    [22, -18],
    [-22, 18],
    [22, 18],
  ] as [number, number][]) {
    ctx.fillStyle = PALETTE.stoneDark;
    ctx.beginPath();
    ctx.arc(cx, cy, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = PALETTE.stoneLight;
    ctx.beginPath();
    ctx.arc(cx, cy, 6, 0, Math.PI * 2);
    ctx.fill();
  }
  // Gate.
  ctx.fillStyle = PALETTE.woodDark;
  ctx.beginPath();
  ctx.moveTo(-8, 16);
  ctx.lineTo(-8, 2);
  ctx.arc(0, 2, 8, Math.PI, 0);
  ctx.lineTo(8, 16);
  ctx.closePath();
  ctx.fill();
  // Flag.
  ctx.fillStyle = PALETTE.ironDark;
  ctx.fillRect(-1, -46, 2, 26);
  ctx.fillStyle = PALETTE.red;
  ctx.beginPath();
  ctx.moveTo(1, -46);
  ctx.lineTo(18, -40);
  ctx.lineTo(1, -33);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = PALETTE.gold;
  ctx.beginPath();
  ctx.arc(8, -40, 2.2, 0, Math.PI * 2);
  ctx.fill();
  if (theme.snowCaps) {
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.fillRect(-22, -20, 44, 3);
  }
  ctx.restore();
}
