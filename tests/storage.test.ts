import { beforeEach, describe, expect, it } from 'vitest';
import {
  deleteCustomMap,
  findMap,
  isEditorUnlocked,
  isEndlessUnlocked,
  isMapUnlocked,
  loadCustomMaps,
  loadGame,
  recordWin,
  upsertCustomMap,
} from '@/meta/storage';
import type { Progress } from '@/meta/storage';
import { newEditorState, toMapDef } from '@/ui/editor/model';

/** Minimal localStorage stand-in for Node. */
class MemoryStorage {
  private data = new Map<string, string>();
  getItem(k: string): string | null {
    return this.data.get(k) ?? null;
  }
  setItem(k: string, v: string): void {
    this.data.set(k, v);
  }
  removeItem(k: string): void {
    this.data.delete(k);
  }
  clear(): void {
    this.data.clear();
  }
}

describe('custom map storage', () => {
  beforeEach(() => {
    (globalThis as unknown as { localStorage: MemoryStorage }).localStorage = new MemoryStorage();
  });

  it('stores, finds and deletes custom maps', () => {
    const map = toMapDef({ ...newEditorState(), id: 'custom-abc', name: 'Ma carte' });
    expect(loadCustomMaps()).toEqual([]);
    upsertCustomMap(map);
    expect(loadCustomMaps()).toHaveLength(1);
    upsertCustomMap({ ...map, startGold: 999 });
    expect(loadCustomMaps()).toHaveLength(1);
    expect(findMap('custom-abc')?.startGold).toBe(999);
    expect(findMap('thermopylae')?.id).toBe('thermopylae');
    deleteCustomMap('custom-abc');
    expect(findMap('custom-abc')).toBeUndefined();
  });

  it('treats custom maps as always unlocked, including endless mode', () => {
    const progress: Progress = { maps: {}, totalKills: 0, totalWins: 0 };
    expect(isMapUnlocked(progress, 'custom-x')).toBe(true);
    expect(isEndlessUnlocked(progress, 'custom-x')).toBe(true);
    expect(isMapUnlocked(progress, 'alesia')).toBe(false);
  });

  it('unlocks the editor once the last campaign map is won', () => {
    const progress: Progress = { maps: {}, totalKills: 0, totalWins: 0 };
    expect(isEditorUnlocked(progress)).toBe(false);
    recordWin(progress, 'thermopylae', 'normal');
    expect(isEditorUnlocked(progress)).toBe(false);
    recordWin(progress, 'stalingrad', 'easy');
    expect(isEditorUnlocked(progress)).toBe(true);
  });

  it('ignores a saved game whose map no longer exists', () => {
    localStorage.setItem(
      'gamelle.v1.save',
      JSON.stringify({ save: { version: 1, map: 'custom-gone' }, savedAt: 1 }),
    );
    expect(loadGame()).toBeNull();
  });
});
