import { PALETTE } from './theme';

type Ctx = CanvasRenderingContext2D;

export function circle(
  ctx: Ctx,
  x: number,
  y: number,
  r: number,
  fill: string,
  stroke?: string,
  lw = 1.5,
): void {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lw;
    ctx.stroke();
  }
}

export function ellipse(
  ctx: Ctx,
  x: number,
  y: number,
  rx: number,
  ry: number,
  rot: number,
  fill: string,
  stroke?: string,
  lw = 1.5,
): void {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lw;
    ctx.stroke();
  }
}

export function rect(
  ctx: Ctx,
  x: number,
  y: number,
  w: number,
  h: number,
  fill: string,
  stroke?: string,
  lw = 1.5,
): void {
  ctx.fillStyle = fill;
  ctx.fillRect(x, y, w, h);
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lw;
    ctx.strokeRect(x, y, w, h);
  }
}

export function roundRect(
  ctx: Ctx,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  fill: string,
  stroke?: string,
  lw = 1.5,
): void {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lw;
    ctx.stroke();
  }
}

export function line(
  ctx: Ctx,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  color: string,
  lw = 2,
  cap: CanvasLineCap = 'round',
): void {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.strokeStyle = color;
  ctx.lineWidth = lw;
  ctx.lineCap = cap;
  ctx.stroke();
}

export function polygon(ctx: Ctx, points: [number, number][], fill: string, stroke?: string, lw = 1.5): void {
  ctx.beginPath();
  points.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lw;
    ctx.stroke();
  }
}

export function regularPolygon(
  ctx: Ctx,
  x: number,
  y: number,
  r: number,
  sides: number,
  rot: number,
  fill: string,
  stroke?: string,
  lw = 1.5,
): void {
  const pts: [number, number][] = [];
  for (let i = 0; i < sides; i++) {
    const a = rot + (i / sides) * Math.PI * 2;
    pts.push([x + Math.cos(a) * r, y + Math.sin(a) * r]);
  }
  polygon(ctx, pts, fill, stroke, lw);
}

/** Ground shadow under a sprite. */
export function shadow(ctx: Ctx, x: number, y: number, rx: number, ry: number): void {
  ellipse(ctx, x, y, rx, ry, 0, PALETTE.shadow);
}

/** Small top-down soldier: body disc, head, optional weapon line at `aim`. */
export function soldier(
  ctx: Ctx,
  x: number,
  y: number,
  coat: string,
  helmet: string,
  aim: number | null,
  weaponLen = 12,
  weaponColor: string = PALETTE.ironDark,
  size = 1,
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size, size);
  circle(ctx, 0, 0, 5.5, coat, 'rgba(0,0,0,0.35)', 1);
  circle(ctx, 0, 0, 3.2, helmet);
  if (aim !== null) {
    line(
      ctx,
      Math.cos(aim) * 2,
      Math.sin(aim) * 2,
      Math.cos(aim) * weaponLen,
      Math.sin(aim) * weaponLen,
      weaponColor,
      2,
    );
  }
  ctx.restore();
}

/** Horizontal barrel drawn along +x from the origin. */
export function barrel(
  ctx: Ctx,
  length: number,
  width: number,
  color: string,
  dark: string,
  recoil = 0,
  brake = false,
): void {
  const start = -recoil;
  roundRect(ctx, start, -width / 2, length, width, width / 3, color, dark, 1.5);
  rect(ctx, start + length - 5, -width / 2 - 1, 5, width + 2, dark);
  if (brake) {
    rect(ctx, start + length - 9, -width / 2 - 2, 3, width + 4, dark);
    rect(ctx, start + length - 14, -width / 2 - 2, 3, width + 4, dark);
  }
}

/** Pair of wheels perpendicular to the barrel, centred at (x, 0). */
export function wheels(
  ctx: Ctx,
  x: number,
  spacing: number,
  r: number,
  color: string = PALETTE.woodDark,
  hub: string = PALETTE.iron,
): void {
  for (const side of [-1, 1]) {
    ellipse(ctx, x, side * spacing, r * 0.45, r, 0, color, PALETTE.black, 1);
    ellipse(ctx, x, side * spacing, r * 0.18, r * 0.4, 0, hub);
  }
}

export function sandbagRing(ctx: Ctx, r: number, count = 12, rot = 0): void {
  for (let i = 0; i < count; i++) {
    const a = rot + (i / count) * Math.PI * 2;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    ellipse(
      ctx,
      x,
      y,
      7,
      4.5,
      a + Math.PI / 2,
      i % 2 ? PALETTE.sand : PALETTE.sandDark,
      'rgba(0,0,0,0.3)',
      1,
    );
  }
}

export function flag(
  ctx: Ctx,
  x: number,
  y: number,
  color: string,
  time: number,
  len = 16,
  height = 18,
): void {
  line(ctx, x, y, x, y - height, PALETTE.ironDark, 2, 'butt');
  const wave = Math.sin(time * 6) * 2;
  polygon(
    ctx,
    [
      [x, y - height],
      [x + len, y - height + 4 + wave],
      [x, y - height + 9],
    ],
    color,
  );
}

export function crate(
  ctx: Ctx,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string = PALETTE.wood,
): void {
  rect(ctx, x, y, w, h, color, PALETTE.woodDark, 1.5);
  line(ctx, x, y, x + w, y + h, PALETTE.woodDark, 1);
  line(ctx, x + w, y, x, y + h, PALETTE.woodDark, 1);
}

export function tent(ctx: Ctx, x: number, y: number, w: number, h: number, color: string): void {
  polygon(
    ctx,
    [
      [x - w / 2, y + h / 2],
      [x, y - h / 2],
      [x + w / 2, y + h / 2],
    ],
    color,
    'rgba(0,0,0,0.35)',
    1.5,
  );
  line(ctx, x, y - h / 2, x, y + h / 2, 'rgba(0,0,0,0.25)', 1.5);
}

/** Level pips shown under a tower. */
export function levelPips(ctx: Ctx, level: number, y: number): void {
  const total = 4;
  const w = 6;
  const startX = -((total - 1) * w) / 2;
  for (let i = 0; i < total; i++) {
    const x = startX + i * w;
    circle(
      ctx,
      x,
      y,
      2,
      i < level ? PALETTE.gold : 'rgba(0,0,0,0.35)',
      i < level ? PALETTE.goldDark : undefined,
      1,
    );
  }
}
