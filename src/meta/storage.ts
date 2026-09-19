import { DEFAULT_TOWERS, MAPS, MAP_BY_ID } from '@/data/maps';
import { DIFFICULTIES } from '@/data/difficulty';
import type { DifficultyId, Lang, MapDef } from '@/sim/types';
import type { WorldSave } from '@/sim/world';

const KEY_SETTINGS = 'gamelle.v1.settings';
const KEY_PROGRESS = 'gamelle.v1.progress';
const KEY_SAVE = 'gamelle.v1.save';
const KEY_CUSTOM_MAPS = 'gamelle.v1.custom-maps';

export interface Settings {
  lang: Lang;
  master: number;
  sfx: number;
  music: number;
  reducedMotion: boolean;
  damageNumbers: boolean;
  showRanges: boolean;
  /** Call the next wave automatically once the previous one is cleared. */
  autoWave: boolean;
}

export interface MapProgress {
  stars: number;
  wins: Partial<Record<DifficultyId, boolean>>;
  bestWave: number;
}

export interface Progress {
  maps: Record<string, MapProgress>;
  totalKills: number;
  totalWins: number;
}

export interface SavedGame {
  save: WorldSave;
  savedAt: number;
}

export const DEFAULT_SETTINGS: Settings = {
  lang: 'fr',
  master: 0.8,
  sfx: 0.8,
  music: 0.5,
  reducedMotion: false,
  damageNumbers: true,
  showRanges: false,
  autoWave: false,
};

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage may be unavailable (private mode, quota): the game keeps running.
  }
}

function remove(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

export function loadSettings(fallbackLang: Lang): Settings {
  const stored = read<Partial<Settings>>(KEY_SETTINGS);
  return { ...DEFAULT_SETTINGS, lang: fallbackLang, ...(stored ?? {}) };
}

export function saveSettings(settings: Settings): void {
  write(KEY_SETTINGS, settings);
}

export function loadProgress(): Progress {
  const stored = read<Progress>(KEY_PROGRESS);
  return stored ?? { maps: {}, totalKills: 0, totalWins: 0 };
}

export function saveProgress(progress: Progress): void {
  write(KEY_PROGRESS, progress);
}

export function mapProgress(progress: Progress, mapId: string): MapProgress {
  return progress.maps[mapId] ?? { stars: 0, wins: {}, bestWave: 0 };
}

export function isMapUnlocked(progress: Progress, mapId: string): boolean {
  if (mapId.startsWith(CUSTOM_MAP_PREFIX)) return true;
  const map = MAP_BY_ID[mapId];
  if (!map) return false;
  if (map.order === 1) return true;
  const previous = MAPS.find((m) => m.order === map.order - 1);
  return !!previous && mapProgress(progress, previous.id).stars > 0;
}

export function isEndlessUnlocked(progress: Progress, mapId: string): boolean {
  if (mapId.startsWith(CUSTOM_MAP_PREFIX)) return true;
  return mapProgress(progress, mapId).stars > 0;
}

/** Towers the player may build, given their progress. */
export function unlockedTowers(progress: Progress): string[] {
  const set = new Set(DEFAULT_TOWERS);
  for (const map of MAPS) {
    if (mapProgress(progress, map.id).stars > 0) for (const id of map.unlocks) set.add(id);
  }
  return [...set];
}

export function totalStars(progress: Progress): number {
  return MAPS.reduce((sum, m) => sum + mapProgress(progress, m.id).stars, 0);
}

export const MAX_STARS = MAPS.length * 3;

export interface WinResult {
  starsBefore: number;
  starsAfter: number;
  newTowers: string[];
  newMaps: string[];
}

/** Record a campaign victory and return what it unlocked. */
export function recordWin(progress: Progress, mapId: string, difficulty: DifficultyId): WinResult {
  const before = unlockedTowers(progress);
  const mapsBefore = MAPS.filter((m) => isMapUnlocked(progress, m.id)).map((m) => m.id);
  const mp = mapProgress(progress, mapId);
  const starsBefore = mp.stars;
  mp.wins = { ...mp.wins, [difficulty]: true };
  mp.stars = Math.max(mp.stars, DIFFICULTIES[difficulty].rewardStars);
  progress.maps[mapId] = mp;
  progress.totalWins++;
  saveProgress(progress);
  const after = unlockedTowers(progress);
  const mapsAfter = MAPS.filter((m) => isMapUnlocked(progress, m.id)).map((m) => m.id);
  return {
    starsBefore,
    starsAfter: mp.stars,
    newTowers: after.filter((id) => !before.includes(id)),
    newMaps: mapsAfter.filter((id) => !mapsBefore.includes(id)),
  };
}

/** Record an endless run; returns true when it is a new record. */
export function recordEndless(progress: Progress, mapId: string, wave: number): boolean {
  const mp = mapProgress(progress, mapId);
  const record = wave > mp.bestWave;
  if (record) mp.bestWave = wave;
  progress.maps[mapId] = mp;
  saveProgress(progress);
  return record;
}

export function addKills(progress: Progress, kills: number): void {
  progress.totalKills += kills;
  saveProgress(progress);
}

export function loadGame(): SavedGame | null {
  const stored = read<SavedGame>(KEY_SAVE);
  if (!stored || !stored.save || stored.save.version !== 1) return null;
  if (!findMap(stored.save.map)) return null;
  return stored;
}

// ----------------------------------------------------------------------
// Custom maps (map editor)
// ----------------------------------------------------------------------

export const CUSTOM_MAP_PREFIX = 'custom-';

/** The editor unlocks once the final campaign map has been won. */
export function isEditorUnlocked(progress: Progress): boolean {
  const last = [...MAPS].sort((a, b) => b.order - a.order)[0];
  return !!last && mapProgress(progress, last.id).stars > 0;
}

export function isCustomMap(map: MapDef): boolean {
  return map.id.startsWith(CUSTOM_MAP_PREFIX);
}

export function loadCustomMaps(): MapDef[] {
  const stored = read<MapDef[]>(KEY_CUSTOM_MAPS);
  if (!Array.isArray(stored)) return [];
  return stored.filter((m) => m && typeof m.id === 'string' && Array.isArray(m.terrain));
}

export function saveCustomMaps(maps: MapDef[]): void {
  write(KEY_CUSTOM_MAPS, maps);
}

export function upsertCustomMap(map: MapDef): void {
  const maps = loadCustomMaps().filter((m) => m.id !== map.id);
  maps.push(map);
  saveCustomMaps(maps);
}

export function deleteCustomMap(id: string): void {
  saveCustomMaps(loadCustomMaps().filter((m) => m.id !== id));
}

/** Looks a map up among the campaign maps and the player's custom maps. */
export function findMap(id: string): MapDef | undefined {
  return MAP_BY_ID[id] ?? loadCustomMaps().find((m) => m.id === id);
}

export function saveGame(save: WorldSave): void {
  write(KEY_SAVE, { save, savedAt: Date.now() } satisfies SavedGame);
}

export function clearSavedGame(): void {
  remove(KEY_SAVE);
}

export function resetEverything(): void {
  remove(KEY_SAVE);
  remove(KEY_PROGRESS);
}
