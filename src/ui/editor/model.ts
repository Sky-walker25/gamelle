import { hashSeed } from '@/core/rng';
import { ENEMIES } from '@/data/enemies';
import { MAP_BY_ID } from '@/data/maps';
import { CUSTOM_MAP_PREFIX } from '@/meta/storage';
import { Grid } from '@/sim/grid';
import type { MapDef, ThemeId } from '@/sim/types';

/**
 * Pure model of the map editor: an immutable-ish state, the operations the
 * tools apply to it, and the conversion to a playable `MapDef`. No DOM here so
 * everything is unit-testable.
 */
export interface EditorPath {
  id: string;
  waypoints: [number, number][];
}

export interface EditorState {
  id: string;
  name: string;
  subtitle: string;
  cols: number;
  rows: number;
  /** One string per row, one character per tile ('.', '#', 'T', '~', 'x', 'S', 'H'). */
  terrain: string[];
  paths: EditorPath[];
  open: boolean;
  theme: ThemeId;
  startGold: number;
  startLives: number;
  waveCount: number;
  hpScale: number;
  roster: { id: string; from: number }[];
  lore: string;
}

export const EDITOR_LIMITS = {
  minCols: 8,
  maxCols: 40,
  minRows: 6,
  maxRows: 24,
  minWaves: 5,
  maxWaves: 100,
} as const;

export type TerrainTool = '.' | '#' | 'T' | '~' | 'x' | 'S' | 'H';
export type EditorTool = TerrainTool | 'path';

export type EditorError =
  | 'editor.err.name'
  | 'editor.err.noPath'
  | 'editor.err.shortPath'
  | 'editor.err.pathBlocked'
  | 'editor.err.noSpawn'
  | 'editor.err.noBase'
  | 'editor.err.unreachable'
  | 'editor.err.roster'
  | 'editor.err.waves';

function blankRows(cols: number, rows: number): string[] {
  return Array.from({ length: rows }, () => '.'.repeat(cols));
}

export function newEditorState(): EditorState {
  const base = MAP_BY_ID['thermopylae'];
  return {
    id: `${CUSTOM_MAP_PREFIX}${Date.now().toString(36)}`,
    name: '',
    subtitle: '',
    cols: 20,
    rows: 12,
    terrain: blankRows(20, 12),
    paths: [{ id: 'path-1', waypoints: [] }],
    open: false,
    theme: 'green',
    startGold: 350,
    startLives: 20,
    waveCount: 30,
    hpScale: 1,
    roster: base
      ? base.roster.map((r) => ({ ...r }))
      : ENEMIES.filter((e) => !e.boss).map((e, i) => ({ id: e.id, from: 1 + i * 2 })),
    lore: '',
  };
}

export function fromMapDef(map: MapDef): EditorState {
  return {
    id: map.id,
    name: map.name.fr,
    subtitle: map.subtitle.fr,
    cols: map.cols,
    rows: map.rows,
    terrain: [...map.terrain],
    paths: map.paths.map((p) => ({
      id: p.id,
      waypoints: p.waypoints.map((w) => [w[0], w[1]] as [number, number]),
    })),
    open: map.open === true,
    theme: map.theme,
    startGold: map.startGold,
    startLives: map.startLives,
    waveCount: map.waveCount,
    hpScale: map.hpScale,
    roster: map.roster.map((r) => ({ ...r })),
    lore: map.lore.fr,
  };
}

/** Builds the playable definition. Paths with fewer than two waypoints are dropped (they are still editing). */
export function toMapDef(state: EditorState): MapDef {
  const name = state.name.trim() || 'Carte personnalisée';
  return {
    id: state.id,
    order: 100,
    name: { fr: name, en: name },
    subtitle: { fr: state.subtitle, en: state.subtitle },
    cols: state.cols,
    rows: state.rows,
    terrain: [...state.terrain],
    paths: state.paths
      .filter((p) => p.waypoints.length >= 2)
      .map((p) => ({ id: p.id, waypoints: p.waypoints.map((w) => [w[0], w[1]] as [number, number]) })),
    open: state.open,
    theme: state.theme,
    waveCount: state.waveCount,
    startGold: state.startGold,
    startLives: state.startLives,
    roster: state.roster.map((r) => ({ ...r })),
    unlocks: [],
    hpScale: state.hpScale,
    lore: { fr: state.lore, en: state.lore },
    seed: hashSeed(state.id),
  };
}

export function charAt(state: EditorState, col: number, row: number): string {
  return state.terrain[row]?.[col] ?? '#';
}

function setChar(terrain: string[], col: number, row: number, ch: string): string[] {
  const line = terrain[row];
  if (line === undefined || col < 0 || col >= line.length) return terrain;
  const next = [...terrain];
  next[row] = line.slice(0, col) + ch + line.slice(col + 1);
  return next;
}

export function inBounds(state: EditorState, col: number, row: number): boolean {
  return col >= 0 && row >= 0 && col < state.cols && row < state.rows;
}

/** Set of "col,row" keys covered by a path's segments. */
export function pathTiles(path: EditorPath): Set<string> {
  const out = new Set<string>();
  for (let i = 0; i < path.waypoints.length; i++) {
    const [c, r] = path.waypoints[i] as [number, number];
    if (i === 0) {
      out.add(`${c},${r}`);
      continue;
    }
    const [pc, pr] = path.waypoints[i - 1] as [number, number];
    const dc = Math.sign(c - pc);
    const dr = Math.sign(r - pr);
    let cc = pc;
    let rr = pr;
    while (cc !== c || rr !== r) {
      cc += dc;
      rr += dr;
      out.add(`${cc},${rr}`);
    }
  }
  return out;
}

export function allPathTiles(state: EditorState): Set<string> {
  const out = new Set<string>();
  for (const p of state.paths) for (const k of pathTiles(p)) out.add(k);
  return out;
}

/** Paint one tile. Painting a non-buildable tile onto a path is refused (paths must stay walkable). */
export function paint(state: EditorState, col: number, row: number, tool: TerrainTool): EditorState {
  if (!inBounds(state, col, row)) return state;
  if (!state.open && (tool === 'S' || tool === 'H')) return state;
  if (tool !== '.' && allPathTiles(state).has(`${col},${row}`)) return state;
  let terrain = state.terrain;
  // Only one base on open maps: painting a new H clears the previous one.
  if (tool === 'H') {
    terrain = terrain.map((line) => line.replaceAll('H', '.'));
  }
  terrain = setChar(terrain, col, row, tool);
  return { ...state, terrain };
}

/**
 * Append a waypoint to a path. Diagonal moves are converted into two axis
 * aligned segments (horizontal first). Tiles under the new segments become
 * buildable ground so the path is always valid.
 */
export function addWaypoint(state: EditorState, pathIndex: number, col: number, row: number): EditorState {
  if (state.open || !inBounds(state, col, row)) return state;
  const path = state.paths[pathIndex];
  if (!path) return state;
  const last = path.waypoints[path.waypoints.length - 1];
  const waypoints = path.waypoints.map((w) => [w[0], w[1]] as [number, number]);
  if (last) {
    if (last[0] === col && last[1] === row) return state;
    if (last[0] !== col && last[1] !== row) waypoints.push([col, last[1]]);
  }
  waypoints.push([col, row]);
  const nextPath: EditorPath = { id: path.id, waypoints };
  let terrain = state.terrain;
  for (const key of pathTiles(nextPath)) {
    const [c, r] = key.split(',').map(Number) as [number, number];
    if (charAt(state, c, r) !== '.') terrain = setChar(terrain, c, r, '.');
  }
  const paths = state.paths.map((p, i) => (i === pathIndex ? nextPath : p));
  return { ...state, paths, terrain };
}

export function removeLastWaypoint(state: EditorState, pathIndex: number): EditorState {
  const path = state.paths[pathIndex];
  if (!path || path.waypoints.length === 0) return state;
  const waypoints = path.waypoints.slice(0, -1);
  const paths = state.paths.map((p, i) => (i === pathIndex ? { id: p.id, waypoints } : p));
  return { ...state, paths };
}

export function addPath(state: EditorState): EditorState {
  const n = state.paths.length + 1;
  let id = `path-${n}`;
  while (state.paths.some((p) => p.id === id)) id = `${id}b`;
  return { ...state, paths: [...state.paths, { id, waypoints: [] }] };
}

export function removePath(state: EditorState, index: number): EditorState {
  if (state.paths.length <= 1) return { ...state, paths: [{ id: 'path-1', waypoints: [] }] };
  return { ...state, paths: state.paths.filter((_, i) => i !== index) };
}

export function setOpen(state: EditorState, open: boolean): EditorState {
  if (open === state.open) return state;
  if (open) return { ...state, open: true, paths: [] };
  const terrain = state.terrain.map((line) => line.replaceAll('S', '.').replaceAll('H', '.'));
  return { ...state, open: false, terrain, paths: [{ id: 'path-1', waypoints: [] }] };
}

/** Change the grid size, keeping the top-left content and dropping waypoints that fall outside. */
export function resize(state: EditorState, cols: number, rows: number): EditorState {
  const c = Math.max(EDITOR_LIMITS.minCols, Math.min(EDITOR_LIMITS.maxCols, Math.round(cols)));
  const r = Math.max(EDITOR_LIMITS.minRows, Math.min(EDITOR_LIMITS.maxRows, Math.round(rows)));
  const terrain: string[] = [];
  for (let y = 0; y < r; y++) {
    const line = state.terrain[y] ?? '';
    terrain.push((line + '.'.repeat(c)).slice(0, c));
  }
  const paths = state.paths.map((p) => {
    const kept: [number, number][] = [];
    for (const w of p.waypoints) {
      if (w[0] >= c || w[1] >= r) break;
      kept.push([w[0], w[1]]);
    }
    return { id: p.id, waypoints: kept };
  });
  return { ...state, cols: c, rows: r, terrain, paths };
}

export function toggleRoster(state: EditorState, enemyId: string, from: number | null): EditorState {
  const roster = state.roster.filter((r) => r.id !== enemyId);
  if (from !== null) roster.push({ id: enemyId, from: Math.max(1, Math.round(from)) });
  roster.sort((a, b) => a.from - b.from);
  return { ...state, roster };
}

/** Problems that prevent playing the map, as translation keys. */
export function validate(state: EditorState): EditorError[] {
  const errors: EditorError[] = [];
  if (state.name.trim().length === 0) errors.push('editor.err.name');
  if (state.roster.length === 0) errors.push('editor.err.roster');
  if (state.waveCount < EDITOR_LIMITS.minWaves || state.waveCount > EDITOR_LIMITS.maxWaves)
    errors.push('editor.err.waves');
  if (!state.open) {
    const usable = state.paths.filter((p) => p.waypoints.length >= 2);
    if (usable.length === 0) errors.push('editor.err.noPath');
    else if (state.paths.some((p) => p.waypoints.length === 1)) errors.push('editor.err.shortPath');
    for (const key of allPathTiles(state)) {
      const [c, r] = key.split(',').map(Number) as [number, number];
      if (charAt(state, c, r) !== '.') {
        errors.push('editor.err.pathBlocked');
        break;
      }
    }
  } else {
    const flat = state.terrain.join('');
    const spawns = (flat.match(/S/g) ?? []).length;
    const bases = (flat.match(/H/g) ?? []).length;
    if (spawns === 0) errors.push('editor.err.noSpawn');
    if (bases === 0) errors.push('editor.err.noBase');
    if (spawns > 0 && bases > 0) {
      try {
        const grid = new Grid(toMapDef(state));
        if (grid.spawns.some(([c, r]) => grid.flowDistance(c, r) <= 0)) errors.push('editor.err.unreachable');
      } catch {
        errors.push('editor.err.unreachable');
      }
    }
  }
  return errors;
}

/** Parses an exported map, returning null when the JSON is not a usable map. */
export function parseImportedMap(json: string): EditorState | null {
  try {
    const raw = JSON.parse(json) as Partial<MapDef>;
    if (
      !raw ||
      typeof raw !== 'object' ||
      !Array.isArray(raw.terrain) ||
      typeof raw.cols !== 'number' ||
      typeof raw.rows !== 'number'
    )
      return null;
    if (
      raw.terrain.length !== raw.rows ||
      raw.terrain.some((l) => typeof l !== 'string' || l.length !== raw.cols)
    )
      return null;
    const map: MapDef = {
      id:
        typeof raw.id === 'string' && raw.id.startsWith(CUSTOM_MAP_PREFIX)
          ? raw.id
          : `${CUSTOM_MAP_PREFIX}${Date.now().toString(36)}`,
      order: 100,
      name:
        raw.name && typeof raw.name.fr === 'string' ? raw.name : { fr: 'Carte importée', en: 'Imported map' },
      subtitle: raw.subtitle && typeof raw.subtitle.fr === 'string' ? raw.subtitle : { fr: '', en: '' },
      cols: raw.cols,
      rows: raw.rows,
      terrain: raw.terrain,
      paths: Array.isArray(raw.paths) ? raw.paths.filter((p) => p && Array.isArray(p.waypoints)) : [],
      open: raw.open === true,
      theme: raw.theme ?? 'green',
      waveCount: typeof raw.waveCount === 'number' ? raw.waveCount : 30,
      startGold: typeof raw.startGold === 'number' ? raw.startGold : 350,
      startLives: typeof raw.startLives === 'number' ? raw.startLives : 20,
      roster: Array.isArray(raw.roster)
        ? raw.roster.filter((r) => r && typeof r.id === 'string' && typeof r.from === 'number')
        : [],
      unlocks: [],
      hpScale: typeof raw.hpScale === 'number' ? raw.hpScale : 1,
      lore: raw.lore && typeof raw.lore.fr === 'string' ? raw.lore : { fr: '', en: '' },
      seed: 0,
    };
    return fromMapDef(map);
  } catch {
    return null;
  }
}
