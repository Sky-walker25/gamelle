export interface Vec2 {
  x: number;
  y: number;
}

export const TAU = Math.PI * 2;

export function vec(x: number, y: number): Vec2 {
  return { x, y };
}

export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function dist(ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  return Math.sqrt(dx * dx + dy * dy);
}

export function distSq(ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  return dx * dx + dy * dy;
}

export function angleBetween(ax: number, ay: number, bx: number, by: number): number {
  return Math.atan2(by - ay, bx - ax);
}

/** Smallest signed difference between two angles, in (-PI, PI]. */
export function angleDelta(from: number, to: number): number {
  let d = (to - from) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

export function rotateTowards(current: number, target: number, maxStep: number): number {
  const d = angleDelta(current, target);
  if (Math.abs(d) <= maxStep) return target;
  return current + Math.sign(d) * maxStep;
}

export function easeOutCubic(t: number): number {
  const u = 1 - t;
  return 1 - u * u * u;
}

export function easeInOutQuad(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

/** Total length of a polyline. */
export function polylineLength(points: readonly Vec2[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1] as Vec2;
    const b = points[i] as Vec2;
    total += dist(a.x, a.y, b.x, b.y);
  }
  return total;
}

/**
 * Position along a polyline at a given distance from its start.
 * Also returns the heading angle at that point and the segment index.
 */
export function pointAlongPolyline(
  points: readonly Vec2[],
  distance: number,
  out: { x: number; y: number; angle: number; segment: number } = { x: 0, y: 0, angle: 0, segment: 0 },
): { x: number; y: number; angle: number; segment: number } {
  if (points.length === 0) return out;
  if (points.length === 1) {
    const p = points[0] as Vec2;
    out.x = p.x;
    out.y = p.y;
    out.angle = 0;
    out.segment = 0;
    return out;
  }
  let remaining = Math.max(0, distance);
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1] as Vec2;
    const b = points[i] as Vec2;
    const segLen = dist(a.x, a.y, b.x, b.y);
    if (remaining <= segLen || i === points.length - 1) {
      const t = segLen === 0 ? 0 : clamp(remaining / segLen, 0, 1);
      out.x = lerp(a.x, b.x, t);
      out.y = lerp(a.y, b.y, t);
      out.angle = Math.atan2(b.y - a.y, b.x - a.x);
      out.segment = i - 1;
      return out;
    }
    remaining -= segLen;
  }
  return out;
}

export function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `${(n / 1000).toFixed(1)}k`;
  return Math.round(n).toString();
}
