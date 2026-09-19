import { audio } from '@/audio/audio';
import { formatNumber } from '@/core/math';
import { hashSeed } from '@/core/rng';
import { enemyDef } from '@/data/enemies';
import { MAP_BY_ID } from '@/data/maps';
import { towerLevelDef } from '@/data/towers';
import {
  addKills,
  clearSavedGame,
  deleteCustomMap,
  findMap,
  isEditorUnlocked,
  loadCustomMaps,
  loadGame,
  loadProgress,
  loadSettings,
  recordEndless,
  recordWin,
  resetEverything,
  saveGame,
  saveSettings,
  unlockedTowers,
  upsertCustomMap,
} from '@/meta/storage';
import type { Progress, Settings } from '@/meta/storage';
import type { DifficultyId, GameMode, MapDef } from '@/sim/types';
import { World } from '@/sim/world';
import { el, stars } from './dom';
import { GameSession } from './game/session';
import { L, detectLang, formatDuration, setLang, t, tk } from './i18n';
import { confirmModal, showModal } from './modal';
import { codexScreen } from './screens/codex';
import { editorScreen } from './screens/editor';
import { fromMapDef } from './editor/model';
import { mapsScreen } from './screens/maps';
import { menuScreen } from './screens/menu';
import { settingsContent } from './screens/settings';

type ScreenId = 'menu' | 'maps' | 'codex' | 'game' | 'editor';

export class App {
  settings: Settings;
  progress: Progress;
  session: GameSession | null = null;
  private screen: HTMLElement | null = null;
  private screenDispose: (() => void) | null = null;
  private screenId: ScreenId = 'menu';
  private lastMapId: string | undefined;
  private pauseOpen = false;

  constructor(readonly root: HTMLElement) {
    this.settings = loadSettings(detectLang());
    this.progress = loadProgress();
    setLang(this.settings.lang);
    audio.setVolumes(this.settings.master, this.settings.sfx, this.settings.music);
    document.addEventListener('pointerdown', () => audio.unlock(), { once: true, capture: true });
    document.addEventListener('keydown', () => audio.unlock(), { once: true, capture: true });
    window.addEventListener('beforeunload', () => {
      if (this.session && !this.session.world.isOver) saveGame(this.session.world.serialize());
    });
  }

  start(): void {
    this.showMenu();
  }

  private setScreen(id: ScreenId, node: HTMLElement, dispose: (() => void) | null = null): void {
    if (this.session && id !== 'game') {
      this.session.destroy();
      this.session = null;
    }
    this.screenDispose?.();
    this.screen?.remove();
    this.screen = node;
    this.screenDispose = dispose;
    this.screenId = id;
    this.root.appendChild(node);
  }

  // ------------------------------------------------------------------
  // Screens
  // ------------------------------------------------------------------

  showMenu(): void {
    const saved = loadGame();
    const screen = menuScreen(this.progress, saved, {
      onContinue: () => this.continueGame(),
      onPlay: () => this.showMaps(),
      onCodex: () => this.showCodex(),
      onHowTo: () => this.openHowTo(),
      onEditor: () => this.showEditor(),
      editorUnlocked: isEditorUnlocked(this.progress),
      onSettings: () => this.openSettings(),
      onLang: (lang) => {
        this.settings.lang = lang;
        saveSettings(this.settings);
        setLang(lang);
        this.showMenu();
      },
    });
    this.setScreen('menu', screen.element, screen.dispose);
  }

  showMaps(initialMap?: string): void {
    this.setScreen(
      'maps',
      mapsScreen(
        this.progress,
        {
          onBack: () => this.showMenu(),
          onStart: (map, difficulty, mode) => this.startGame(map, difficulty, mode),
          onNewCustom: () => this.showEditor(),
          onEditCustom: (map) => this.showEditor(map),
          onDeleteCustom: async (map) => {
            if (await confirmModal(this.root, t('maps.deleteConfirm'), t('misc.yes'), t('misc.no'))) {
              deleteCustomMap(map.id);
              this.showMaps();
            }
          },
        },
        initialMap ?? this.lastMapId,
        loadCustomMaps(),
        isEditorUnlocked(this.progress),
      ),
    );
  }

  showEditor(map?: MapDef): void {
    if (!isEditorUnlocked(this.progress)) return;
    const editor = editorScreen(map ? fromMapDef(map) : null, {
      onBack: () => this.showMaps(),
      onSave: (def) => upsertCustomMap(def),
      onTest: (def) => this.startGame(def, 'normal', 'classic'),
      toast: (text) => this.flash(text),
    });
    this.setScreen('editor', editor.element);
  }

  /** Small transient message outside of a game session. */
  private flash(text: string): void {
    const node = el('div', {
      class: 'toast info',
      text,
      style: { position: 'fixed', left: '20px', bottom: '20px', zIndex: '60' },
    });
    this.root.appendChild(node);
    window.setTimeout(() => node.remove(), 3500);
  }

  showCodex(): void {
    this.setScreen(
      'codex',
      codexScreen(this.progress, () => this.showMenu()),
    );
  }

  // ------------------------------------------------------------------
  // Game
  // ------------------------------------------------------------------

  startGame(map: MapDef, difficulty: DifficultyId, mode: GameMode): void {
    const seed = hashSeed(`${map.id}:${difficulty}:${mode}:${Date.now()}`);
    const world = new World({ map, difficulty, mode, seed, unlockedTowers: unlockedTowers(this.progress) });
    world.autoWave = this.settings.autoWave;
    clearSavedGame();
    this.runSession(world);
  }

  continueGame(): void {
    const saved = loadGame();
    if (!saved) {
      this.showMenu();
      return;
    }
    const map = findMap(saved.save.map);
    if (!map) {
      clearSavedGame();
      this.showMenu();
      return;
    }
    try {
      const world = World.restore(saved.save, map);
      // Towers unlocked since the save was made become available too.
      for (const id of unlockedTowers(this.progress)) world.unlockedTowers.add(id);
      this.runSession(world);
    } catch (err) {
      console.error('Failed to restore saved game', err);
      clearSavedGame();
      this.showMenu();
    }
  }

  private runSession(world: World): GameSession {
    this.lastMapId = world.def.id;
    const session = new GameSession(world, this.settings, {
      onExit: (reason) => this.exitSession(reason),
      onGameOver: (won) => this.gameOver(won),
      onAutosave: (w) => saveGame(w.serialize()),
      openPause: () => this.openPause(),
      onAutoWave: (on) => {
        this.settings.autoWave = on;
        saveSettings(this.settings);
      },
    });
    this.setScreen('game', session.element);
    this.session = session;
    session.mount(this.root);
    return session;
  }

  /** Rebuilds the in-game interface around the same world (used after a language change). */
  private rebuildSessionUi(): void {
    const old = this.session;
    if (!old) return;
    const world = old.world;
    const speed = old.speedIndex;
    old.destroy();
    this.session = null;
    this.runSession(world).setSpeed(speed);
  }

  private exitSession(reason: 'quit' | 'abandon' | 'menu' | 'maps' | 'retry'): void {
    const session = this.session;
    if (!session) return;
    const world = session.world;
    if (reason === 'quit' && !world.isOver) saveGame(world.serialize());
    if (reason === 'abandon') clearSavedGame();
    if (reason === 'retry') {
      const map = world.def;
      const difficulty = world.difficulty.id;
      const mode = world.mode;
      this.startGame(map, difficulty, mode);
      return;
    }
    if (reason === 'maps') this.showMaps(world.def.id);
    else this.showMenu();
  }

  // ------------------------------------------------------------------
  // Modals
  // ------------------------------------------------------------------

  openPause(): void {
    const session = this.session;
    if (!session || this.pauseOpen || session.world.isOver) return;
    this.pauseOpen = true;
    session.setPaused(true);
    const content = el('div', { style: { display: 'flex', flexDirection: 'column', gap: '14px' } });
    const handle = showModal(this.root, content, {
      onClose: () => {
        this.pauseOpen = false;
        // The session may have been rebuilt (language change) while paused: resume whichever is current.
        this.session?.setPaused(false);
      },
    });
    content.appendChild(el('h2', { text: t('pause.title') }));
    content.appendChild(
      el(
        'div',
        { class: 'shortcuts' },
        el('div', { text: t('keys.build') }),
        el('div', { text: t('keys.wave') }),
        el('div', { text: t('keys.pause') }),
        el('div', { text: t('keys.speed') }),
        el('div', { text: t('keys.upgrade') }),
        el('div', { text: t('keys.auto') }),
        el('div', { text: t('keys.cancel') }),
      ),
    );
    content.appendChild(
      el(
        'div',
        { class: 'buttons' },
        el('button', {
          class: 'primary',
          text: t('pause.resume'),
          dataset: { action: 'resume' },
          onclick: () => handle.close(),
        }),
        el('button', {
          text: t('pause.settings'),
          onclick: () => this.openSettings(),
        }),
        el('button', {
          text: t('pause.restart'),
          onclick: async () => {
            if (await confirmModal(this.root, t('pause.confirmAbandon'), t('misc.yes'), t('misc.no'))) {
              handle.close();
              this.exitSession('retry');
            }
          },
        }),
        el('button', {
          text: t('pause.quit'),
          dataset: { action: 'quit' },
          onclick: () => {
            handle.close();
            this.exitSession('quit');
          },
        }),
        el('button', {
          class: 'danger',
          text: t('pause.abandon'),
          onclick: async () => {
            if (await confirmModal(this.root, t('pause.confirmAbandon'), t('misc.yes'), t('misc.no'))) {
              handle.close();
              this.exitSession('abandon');
            }
          },
        }),
      ),
    );
  }

  openHowTo(): void {
    const content = el('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } });
    content.appendChild(el('h2', { text: t('howto.title') }));
    const list = el('ol', {
      style: { margin: '0', paddingLeft: '20px', lineHeight: '1.5', color: 'var(--text-dim)' },
    });
    for (const key of [
      'howto.1',
      'howto.2',
      'howto.3',
      'howto.4',
      'howto.5',
      'howto.6',
      'howto.7',
      'howto.8',
    ] as const) {
      list.appendChild(el('li', { text: t(key), style: { marginBottom: '6px' } }));
    }
    content.appendChild(list);
    const handle = showModal(this.root, content);
    content.appendChild(
      el(
        'div',
        { class: 'buttons' },
        el('button', { class: 'primary', text: t('settings.close'), onclick: () => handle.close() }),
      ),
    );
  }

  openSettings(): void {
    const wasPaused = this.session?.paused ?? false;
    if (this.session && !wasPaused) this.session.setPaused(true);
    const previousLang = this.settings.lang;
    const handle = showModal(
      this.root,
      settingsContent(this.settings, {
        onChange: (s) => {
          this.settings = s;
          saveSettings(s);
          audio.setVolumes(s.master, s.sfx, s.music);
          this.session?.applySettings(s);
        },
        onReset: async () => {
          if (await confirmModal(this.root, t('settings.resetConfirm'), t('misc.yes'), t('misc.no'))) {
            resetEverything();
            this.progress = loadProgress();
            handle.close();
            if (this.session) {
              this.session.destroy();
              this.session = null;
            }
            this.showMenu();
          }
        },
        onClose: () => handle.close(),
      }),
      {
        onClose: () => {
          if (this.settings.lang !== previousLang) {
            setLang(this.settings.lang);
            if (this.screenId === 'menu') this.showMenu();
            else if (this.screenId === 'maps') this.showMaps();
            else if (this.screenId === 'codex') this.showCodex();
            else if (this.screenId === 'game') {
              this.rebuildSessionUi();
              if (this.pauseOpen) this.session?.setPaused(true);
            }
          }
          if (this.session && !wasPaused && !this.pauseOpen) this.session.setPaused(false);
        },
      },
    );
  }

  private gameOver(won: boolean): void {
    const session = this.session;
    if (!session) return;
    const world = session.world;
    const map = world.def;
    const stats = world.stats;
    addKills(this.progress, stats.kills);
    clearSavedGame();

    const content = el('div', { style: { display: 'flex', flexDirection: 'column', gap: '14px' } });
    const endless = world.mode === 'endless';
    let unlockedText = '';
    if (won && !endless) {
      const result = recordWin(this.progress, map.id, world.difficulty.id);
      content.appendChild(el('h2', { text: t('over.victory') }));
      content.appendChild(
        el('p', {
          text: t('over.victoryText', {
            map: L(map.name),
            waves: map.waveCount,
            difficulty: tk('difficulty.' + world.difficulty.id).toLowerCase(),
          }),
        }),
      );
      const starNode = stars(result.starsAfter);
      starNode.classList.add('big-stars');
      content.appendChild(el('div', {}, el('div', { class: 'k', text: t('over.stars') }), starNode));
      const items = [
        ...result.newTowers.map((id) => L(towerLevelDef(id, 1, -1).name)),
        ...result.newMaps.map((id) => L(MAP_BY_ID[id]?.name ?? { fr: id, en: id })),
      ];
      if (items.length > 0) unlockedText = t('over.unlocked', { items: items.join(', ') });
    } else if (endless) {
      const record = recordEndless(this.progress, map.id, stats.wavesCleared);
      content.appendChild(el('h2', { class: 'defeat', text: t('over.endlessOver') }));
      content.appendChild(el('p', { text: t('over.endlessText', { wave: stats.wavesCleared }) }));
      if (record && stats.wavesCleared > 0)
        content.appendChild(el('div', { class: 'record', text: `★ ${t('over.newRecord')}` }));
    } else {
      content.appendChild(el('h2', { class: 'defeat', text: t('over.defeat') }));
      content.appendChild(el('p', { text: t('over.defeatText', { wave: world.waveIndex }) }));
      if (world.recentLeaks.length > 0) {
        const list = el('div', { class: 'leak-list' });
        list.appendChild(el('div', { class: 'k', text: t('over.brokeThrough') }));
        for (const leak of world.recentLeaks.slice(0, 4)) {
          list.appendChild(
            el('div', {
              class: 'leak',
              text: t('over.leakLine', {
                wave: leak.wave,
                name: L(enemyDef(leak.defId).name),
                lives: leak.lives,
              }),
            }),
          );
        }
        content.appendChild(list);
      }
    }
    if (unlockedText) content.appendChild(el('div', { class: 'unlocked', text: unlockedText }));

    const statList = el('div', { class: 'stats' });
    const row = (k: string, v: string) => {
      statList.appendChild(el('span', { class: 'k', text: k }));
      statList.appendChild(el('span', { class: 'v', text: v }));
    };
    row(t('stats.kills'), `${stats.kills}`);
    row(t('stats.leaks'), `${stats.leaks}`);
    row(t('stats.goldEarned'), formatNumber(stats.goldEarned));
    row(t('stats.goldSpent'), formatNumber(stats.goldSpent));
    row(t('stats.towersBuilt'), `${stats.towersBuilt}`);
    row(t('stats.damageDealt'), formatNumber(stats.damageDealt));
    row(t('stats.earlyCalls'), `${stats.earlyCalls}`);
    row(t('stats.time'), formatDuration(stats.timePlayed));
    const best = [...world.towers].sort((a, b) => b.damageDealt - a.damageDealt)[0];
    if (best)
      row(t('stats.bestTower'), `${L(world.levelDef(best).name)} (${formatNumber(best.damageDealt)})`);
    content.appendChild(statList);

    const buttons = el('div', { class: 'buttons' });
    const handle = showModal(this.root, content, { dismissible: false });
    if (won && !endless) {
      buttons.appendChild(
        el('button', {
          class: 'primary',
          text: t('over.continueEndless'),
          dataset: { action: 'endless' },
          onclick: () => {
            handle.close();
            world.continueEndless();
            session.resumeAfterVictory();
          },
        }),
      );
    }
    const row2 = el('div', { class: 'buttons row' });
    row2.appendChild(
      el('button', {
        class: won ? '' : 'primary',
        text: t('over.retry'),
        dataset: { action: 'retry' },
        onclick: () => {
          handle.close();
          this.exitSession('retry');
        },
      }),
    );
    row2.appendChild(
      el('button', {
        text: t('over.maps'),
        dataset: { action: 'maps' },
        onclick: () => {
          handle.close();
          this.exitSession('maps');
        },
      }),
    );
    row2.appendChild(
      el('button', {
        text: t('over.menu'),
        dataset: { action: 'menu' },
        onclick: () => {
          handle.close();
          this.exitSession('menu');
        },
      }),
    );
    buttons.appendChild(row2);
    content.appendChild(buttons);
  }
}
