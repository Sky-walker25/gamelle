import { describe, expect, it } from 'vitest';
import {
  addPath,
  addWaypoint,
  fromMapDef,
  newEditorState,
  paint,
  parseImportedMap,
  pathTiles,
  removeLastWaypoint,
  resize,
  setOpen,
  toMapDef,
  toggleRoster,
  validate,
} from '@/ui/editor/model';
import { Grid } from '@/sim/grid';
import { MAPS } from '@/data/maps';
import { generateWave } from '@/sim/waves';

describe('map editor model', () => {
  it('starts as a blank 20x12 map that needs a name and a path', () => {
    const s = newEditorState();
    expect(s.cols).toBe(20);
    expect(s.terrain).toHaveLength(12);
    expect(s.terrain[0]).toHaveLength(20);
    expect(validate(s)).toEqual(expect.arrayContaining(['editor.err.name', 'editor.err.noPath']));
  });

  it('adds waypoints with right-angle corners and clears the ground under the path', () => {
    let s = { ...newEditorState(), name: 'Test' };
    s = paint(s, 5, 2, '#');
    s = addWaypoint(s, 0, 0, 2);
    s = addWaypoint(s, 0, 5, 6); // diagonal -> corner at (5, 2)
    expect(s.paths[0]!.waypoints).toEqual([
      [0, 2],
      [5, 2],
      [5, 6],
    ]);
    expect(s.terrain[2]![5]).toBe('.');
    expect(pathTiles(s.paths[0]!).size).toBe(6 + 4);
    expect(validate(s)).toEqual([]);
    const grid = new Grid(toMapDef(s));
    expect(grid.paths).toHaveLength(1);
    expect(grid.tile(3, 2)?.kind).toBe('path');
  });

  it('refuses to paint obstacles on a path and ignores duplicate points', () => {
    let s = { ...newEditorState(), name: 'Test' };
    s = addWaypoint(s, 0, 0, 0);
    s = addWaypoint(s, 0, 4, 0);
    s = addWaypoint(s, 0, 4, 0);
    expect(s.paths[0]!.waypoints).toHaveLength(2);
    const before = s.terrain;
    s = paint(s, 2, 0, '~');
    expect(s.terrain).toBe(before);
    s = paint(s, 2, 5, '~');
    expect(s.terrain[5]![2]).toBe('~');
  });

  it('removes the last waypoint and manages several paths', () => {
    let s = { ...newEditorState(), name: 'Test' };
    s = addWaypoint(s, 0, 0, 0);
    s = addWaypoint(s, 0, 3, 0);
    s = addPath(s);
    expect(s.paths).toHaveLength(2);
    s = addWaypoint(s, 1, 0, 5);
    s = removeLastWaypoint(s, 1);
    expect(s.paths[1]!.waypoints).toHaveLength(0);
    expect(validate(s)).toEqual([]);
    s = removeLastWaypoint(s, 0);
    expect(validate(s)).toContain('editor.err.noPath');
    s = addPath(s);
    s = addWaypoint(s, 2, 0, 8);
    s = addWaypoint(s, 2, 6, 8);
    expect(validate(s)).toContain('editor.err.shortPath');
  });

  it('resizes while keeping content and dropping out-of-range waypoints', () => {
    let s = { ...newEditorState(), name: 'Test' };
    s = paint(s, 1, 1, 'T');
    s = addWaypoint(s, 0, 0, 3);
    s = addWaypoint(s, 0, 19, 3);
    s = resize(s, 10, 8);
    expect(s.cols).toBe(10);
    expect(s.terrain).toHaveLength(8);
    expect(s.terrain[1]![1]).toBe('T');
    expect(s.paths[0]!.waypoints).toEqual([[0, 3]]);
    s = resize(s, 40, 24);
    expect(s.terrain[23]).toHaveLength(40);
    s = resize(s, 2, 2);
    expect(s.cols).toBe(8);
    expect(s.rows).toBe(6);
  });

  it('validates open maps through the flow field', () => {
    let s = setOpen({ ...newEditorState(), name: 'Open' }, true);
    expect(validate(s)).toEqual(expect.arrayContaining(['editor.err.noSpawn', 'editor.err.noBase']));
    s = paint(s, 0, 5, 'S');
    s = paint(s, 19, 5, 'H');
    expect(validate(s)).toEqual([]);
    for (let r = 0; r < s.rows; r++) s = paint(s, 10, r, '#');
    expect(validate(s)).toContain('editor.err.unreachable');
    s = setOpen(s, false);
    expect(s.terrain.join('')).not.toMatch(/[SH]/);
  });

  it('round-trips campaign maps and exports importable JSON', () => {
    for (const map of MAPS) {
      const s = fromMapDef(map);
      expect(validate({ ...s, name: 'x' })).toEqual([]);
      const back = toMapDef({ ...s, id: 'custom-test' });
      const json = JSON.stringify(back);
      const imported = parseImportedMap(json);
      expect(imported).not.toBeNull();
      expect(imported!.terrain).toEqual(map.terrain);
      expect(new Grid(toMapDef(imported!)).cols).toBe(map.cols);
    }
    expect(parseImportedMap('{')).toBeNull();
    expect(parseImportedMap('{"cols":3,"rows":1,"terrain":["...."]}')).toBeNull();
  });

  it('keeps an arbitrarily large starting gold through export and import', () => {
    const huge = 987_654_321;
    const state = { ...newEditorState(), name: 'Bac à sable', startGold: huge };
    const map = toMapDef(state);
    expect(map.startGold).toBe(huge);
    const imported = parseImportedMap(JSON.stringify(map));
    expect(imported?.startGold).toBe(huge);
    // A map with no starting gold at all is a legitimate challenge, not an error.
    expect(toMapDef({ ...state, startGold: 0 }).startGold).toBe(0);
  });

  it('feeds the wave generator with the custom roster', () => {
    let s = { ...newEditorState(), name: 'Roster' };
    s = toggleRoster(s, 'tank', 2);
    s = toggleRoster(s, 'legionary', null);
    expect(s.roster.find((r) => r.id === 'tank')?.from).toBe(2);
    expect(s.roster.some((r) => r.id === 'legionary')).toBe(false);
    const wave = generateWave(toMapDef(s), 2);
    expect(wave.groups.length).toBeGreaterThan(0);
  });
});
