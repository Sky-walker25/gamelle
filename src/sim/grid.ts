import type { Vec2 } from '@/core/math';
import { polylineLength } from '@/core/math';
import type { MapDef, PathDef, Tile, TileKind } from './types';

export const TILE = 64;

export interface ResolvedPath {
  id: string;
  group: string;
  weight: number;
  /** World-space polyline. */
  points: Vec2[];
  length: number;
  /** Tile coordinates of the spawn and base. */
  spawn: [number, number];
  base: [number, number];
}

export interface GridSnapshot {
  cols: number;
  rows: number;
  tiles: Tile[];
}

const CHAR_TO_KIND: Record<string, TileKind> = {
  '.': 'build',
  '#': 'rock',
  T: 'tree',
  '~': 'water',
  x: 'ruin',
  S: 'spawn',
  H: 'base',
};

export function tileCenter(col: number, row: number): Vec2 {
  return { x: (col + 0.5) * TILE, y: (row + 0.5) * TILE };
}

export function worldToTile(x: number, y: number): [number, number] {
  return [Math.floor(x / TILE), Math.floor(y / TILE)];
}

/** Hash of a string to deterministically vary decoration. */
function tileVariant(col: number, row: number, seed: number): number {
  let h = (seed ^ (col * 374761393) ^ (row * 668265263)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}

/**
 * The static playfield: tile kinds, resolved paths and, for open maps, the
 * flow field used by enemies to reach the base through the player's towers.
 */
export class Grid {
  readonly cols: number;
  readonly rows: number;
  readonly tiles: Tile[];
  readonly paths: ResolvedPath[] = [];
  readonly airPaths: ResolvedPath[] = [];
  readonly open: boolean;
  readonly spawns: [number, number][] = [];
  readonly bases: [number, number][] = [];
  /** Tiles occupied by a tower (open maps treat them as walls). */
  private readonly occupied: Uint8Array;
  /** Open maps: distance (in tiles) to the nearest base, -1 when unreachable. */
  private flow: Int32Array;
  private flowDirty = true;

  constructor(readonly def: MapDef) {
    this.cols = def.cols;
    this.rows = def.rows;
    this.open = def.open === true;
    if (def.terrain.length !== def.rows) throw new Error(`Map ${def.id}: expected ${def.rows} terrain rows`);
    this.tiles = [];
    for (let row = 0; row < def.rows; row++) {
      const line = def.terrain[row] ?? '';
      if (line.length !== def.cols) {
        throw new Error(`Map ${def.id}: row ${row} has ${line.length} columns, expected ${def.cols}`);
      }
      for (let col = 0; col < def.cols; col++) {
        const ch = line[col] ?? '.';
        const kind = CHAR_TO_KIND[ch] ?? 'build';
        this.tiles.push({ col, row, kind, variant: tileVariant(col, row, def.seed) });
        if (kind === 'spawn') this.spawns.push([col, row]);
        if (kind === 'base') this.bases.push([col, row]);
      }
    }
    this.occupied = new Uint8Array(def.cols * def.rows);
    this.flow = new Int32Array(def.cols * def.rows).fill(-1);

    if (this.open) {
      if (this.spawns.length === 0 || this.bases.length === 0) {
        throw new Error(`Open map ${def.id} needs S and H tiles`);
      }
      this.recomputeFlow();
      for (const spawn of this.spawns) {
        const base = this.bases[0] as [number, number];
        this.airPaths.push({
          id: `air-${spawn[0]}-${spawn[1]}`,
          group: 'air',
          weight: 1,
          points: extendStart([tileCenter(spawn[0], spawn[1]), tileCenter(base[0], base[1])]),
          length: 0,
          spawn,
          base,
        });
      }
      for (const p of this.airPaths) p.length = polylineLength(p.points);
    } else {
      for (const p of def.paths) this.paths.push(this.resolvePath(p, true));
      for (const p of def.airPaths ?? []) this.airPaths.push(this.resolvePath(p, false));
      if (this.airPaths.length === 0) this.airPaths.push(...this.paths);
      for (const p of this.paths) {
        this.spawns.push(p.spawn);
        if (!this.bases.some((b) => b[0] === p.base[0] && b[1] === p.base[1])) this.bases.push(p.base);
      }
    }
  }

  private resolvePath(p: PathDef, carve: boolean): ResolvedPath {
    const points: Vec2[] = [];
    const wps = p.waypoints;
    if (wps.length < 2) throw new Error(`Path ${p.id} needs at least two waypoints`);
    for (let i = 0; i < wps.length; i++) {
      const [c, r] = wps[i] as [number, number];
      points.push(tileCenter(c, r));
      if (i > 0) {
        const [pc, pr] = wps[i - 1] as [number, number];
        if (pc !== c && pr !== r) throw new Error(`Path ${p.id}: waypoints ${i - 1} and ${i} are not aligned`);
        if (carve) {
          const dc = Math.sign(c - pc);
          const dr = Math.sign(r - pr);
          let cc = pc;
          let rr = pr;
          while (true) {
            this.setKind(cc, rr, 'path');
            if (cc === c && rr === r) break;
            cc += dc;
            rr += dr;
          }
        }
      }
    }
    const first = wps[0] as [number, number];
    const last = wps[wps.length - 1] as [number, number];
    const extended = extendStart(points);
    return {
      id: p.id,
      group: p.group ?? p.id,
      weight: p.weight ?? 1,
      points: extended,
      length: polylineLength(extended),
      spawn: first,
      base: last,
    };
  }

  private setKind(col: number, row: number, kind: TileKind): void {
    const t = this.tile(col, row);
    if (t) t.kind = kind;
  }

  index(col: number, row: number): number {
    return row * this.cols + col;
  }

  inBounds(col: number, row: number): boolean {
    return col >= 0 && row >= 0 && col < this.cols && row < this.rows;
  }

  tile(col: number, row: number): Tile | undefined {
    if (!this.inBounds(col, row)) return undefined;
    return this.tiles[this.index(col, row)];
  }

  isOccupied(col: number, row: number): boolean {
    return this.inBounds(col, row) && this.occupied[this.index(col, row)] === 1;
  }

  setOccupied(col: number, row: number, value: boolean): void {
    if (!this.inBounds(col, row)) return;
    this.occupied[this.index(col, row)] = value ? 1 : 0;
    this.flowDirty = true;
  }

  /** Whether a tower could stand on this tile, ignoring enemies and path connectivity. */
  isBuildableTile(col: number, row: number): boolean {
    const t = this.tile(col, row);
    return !!t && t.kind === 'build' && !this.isOccupied(col, row);
  }

  /** Open maps: whether the tile is walkable for ground enemies. */
  isWalkable(col: number, row: number): boolean {
    const t = this.tile(col, row);
    if (!t) return false;
    if (this.isOccupied(col, row)) return false;
    return t.kind === 'build' || t.kind === 'spawn' || t.kind === 'base' || t.kind === 'path';
  }

  /**
   * Open maps: BFS from every base outward. Result cached until a tower is
   * added or removed.
   */
  recomputeFlow(): void {
    if (!this.open) return;
    this.flow.fill(-1);
    const queue: number[] = [];
    for (const [c, r] of this.bases) {
      const i = this.index(c, r);
      this.flow[i] = 0;
      queue.push(i);
    }
    let head = 0;
    while (head < queue.length) {
      const i = queue[head++] as number;
      const d = this.flow[i] as number;
      const c = i % this.cols;
      const r = (i - c) / this.cols;
      const neighbours: [number, number][] = [
        [c + 1, r],
        [c - 1, r],
        [c, r + 1],
        [c, r - 1],
      ];
      for (const [nc, nr] of neighbours) {
        if (!this.isWalkable(nc, nr)) continue;
        const ni = this.index(nc, nr);
        if ((this.flow[ni] as number) !== -1) continue;
        this.flow[ni] = d + 1;
        queue.push(ni);
      }
    }
    this.flowDirty = false;
  }

  private ensureFlow(): void {
    if (this.flowDirty) this.recomputeFlow();
  }

  /** Open maps: distance to base in tiles, or -1 if unreachable. */
  flowDistance(col: number, row: number): number {
    if (!this.inBounds(col, row)) return -1;
    this.ensureFlow();
    return this.flow[this.index(col, row)] as number;
  }

  /** Open maps: would placing a tower here still leave a route from every spawn? */
  wouldBlock(col: number, row: number): boolean {
    if (!this.open) return false;
    this.ensureFlow();
    const saved = this.flow;
    this.flow = new Int32Array(saved.length);
    this.occupied[this.index(col, row)] = 1;
    this.recomputeFlow();
    const blocked = this.spawns.some(([c, r]) => (this.flow[this.index(c, r)] as number) < 0);
    this.occupied[this.index(col, row)] = 0;
    this.flow = saved;
    this.flowDirty = false;
    return blocked;
  }

  /**
   * Open maps: list of tile centers from a start tile to the base, following
   * the flow field and preferring to keep the current heading.
   */
  routeFrom(col: number, row: number, headingCol = 0, headingRow = 0): Vec2[] {
    this.ensureFlow();
    const out: Vec2[] = [];
    let c = col;
    let r = row;
    let dc = headingCol;
    let dr = headingRow;
    let guard = this.cols * this.rows + 2;
    let d = this.flowDistance(c, r);
    if (d < 0) {
      // Unreachable start: walk towards the nearest reachable neighbour if any.
      return out;
    }
    out.push(tileCenter(c, r));
    while (d > 0 && guard-- > 0) {
      const candidates: [number, number][] = [
        [dc, dr],
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ];
      let moved = false;
      for (const [cc, rr] of candidates) {
        if (cc === 0 && rr === 0) continue;
        const nd = this.flowDistance(c + cc, r + rr);
        if (nd === d - 1 && this.isWalkable(c + cc, r + rr)) {
          c += cc;
          r += rr;
          dc = cc;
          dr = rr;
          d = nd;
          out.push(tileCenter(c, r));
          moved = true;
          break;
        }
      }
      if (!moved) break;
    }
    return simplify(out);
  }

  /** Open maps: full route from a spawn tile, with an off-screen start. */
  spawnRoute(spawn: [number, number]): Vec2[] {
    const route = this.routeFrom(spawn[0], spawn[1]);
    return extendStart(route);
  }

  /** All path tiles (fixed maps) or all currently walkable tiles adjacent to routes (open maps). */
  pathTilesNear(x: number, y: number, radius: number): Tile[] {
    const out: Tile[] = [];
    const r2 = radius * radius;
    for (const t of this.tiles) {
      const isPath = this.open ? this.isWalkable(t.col, t.row) && this.flowDistance(t.col, t.row) > 0 : t.kind === 'path';
      if (!isPath) continue;
      const c = tileCenter(t.col, t.row);
      const dx = c.x - x;
      const dy = c.y - y;
      if (dx * dx + dy * dy <= r2) out.push(t);
    }
    return out;
  }

  get width(): number {
    return this.cols * TILE;
  }

  get height(): number {
    return this.rows * TILE;
  }
}

/** Prepend a point one tile before the first segment so enemies walk in from off-screen. */
function extendStart(points: Vec2[]): Vec2[] {
  if (points.length < 2) return points;
  const a = points[0] as Vec2;
  const b = points[1] as Vec2;
  const dx = Math.sign(b.x - a.x);
  const dy = Math.sign(b.y - a.y);
  const start = { x: a.x - dx * TILE, y: a.y - dy * TILE };
  return [start, ...points];
}

/** Remove intermediate collinear points. */
function simplify(points: Vec2[]): Vec2[] {
  if (points.length < 3) return points;
  const out: Vec2[] = [points[0] as Vec2];
  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i - 1] as Vec2;
    const c = points[i] as Vec2;
    const n = points[i + 1] as Vec2;
    const cross = (c.x - p.x) * (n.y - c.y) - (c.y - p.y) * (n.x - c.x);
    if (Math.abs(cross) > 1e-6) out.push(c);
  }
  out.push(points[points.length - 1] as Vec2);
  return out;
}
