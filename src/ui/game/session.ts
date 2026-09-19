import { GameLoop } from '@/core/loop';
import { formatNumber } from '@/core/math';
import { audio } from '@/audio/audio';
import { enemyDef } from '@/data/enemies';
import { TOWERS } from '@/data/towers';
import type { Settings } from '@/meta/storage';
import { Renderer } from '@/render/renderer';
import type { ViewState } from '@/render/renderer';
import { TILE } from '@/sim/grid';
import type { TargetMode, Tower } from '@/sim/types';
import { TARGET_MODES } from '@/sim/types';
import type { World } from '@/sim/world';
import { clear, el } from '../dom';
import { L, t } from '../i18n';
import { BuildPanel, SelectedPanel, towerName } from './panels';

export type ExitReason = 'quit' | 'abandon' | 'menu' | 'maps' | 'retry';

export interface SessionCallbacks {
  onExit: (reason: ExitReason) => void;
  onGameOver: (won: boolean) => void;
  onAutosave: (world: World) => void;
  openPause: () => void;
  onAutoWave?: (on: boolean) => void;
}

const SPEEDS = [1, 2, 3];

/** Owns one running game: world, renderer, loop, HUD and input. */
export class GameSession {
  readonly element: HTMLElement;
  readonly renderer: Renderer;
  readonly loop: GameLoop;
  readonly view: ViewState = {
    hoverCol: -1,
    hoverRow: -1,
    buildDefId: null,
    selectedTowerId: 0,
    showAllRanges: false,
    showDamageNumbers: true,
    reducedMotion: false,
  };
  speedIndex = 0;
  private canvas: HTMLCanvasElement;
  private field: HTMLElement;
  private banner: HTMLElement;
  private toasts: HTMLElement;
  private incoming: HTMLElement;
  private pausedOverlay: HTMLElement;
  private placementBar: HTMLElement;
  private zoomControls: HTMLElement;
  private hint: HTMLElement;
  private lastHint = '';
  private goldEl: HTMLElement;
  private livesEl: HTMLElement;
  private livesStat: HTMLElement;
  private waveEl: HTMLElement;
  private waveButton: HTMLButtonElement;
  private autoButton: HTMLButtonElement;
  private countdownEl: HTMLElement;
  private speedButtons: HTMLButtonElement[] = [];
  private buildPanel: BuildPanel;
  private selectedPanel: SelectedPanel;
  private lastGold = -1;
  private lastLives = -1;
  private lastWaveLabel = '';
  private lastButtonLabel = '';
  private lastCountdown = '';
  private lastIncoming = -1;
  private unsubscribe: (() => void)[] = [];
  private resizeObserver: ResizeObserver | null = null;
  private destroyed = false;
  private autosaveTimer = 0;
  private zoomInitialised = false;
  private musicIntensity = 0;
  private pointerDown: { x: number; y: number; time: number } | null = null;
  private gameOverShown = false;

  constructor(
    readonly world: World,
    private settings: Settings,
    private readonly callbacks: SessionCallbacks,
  ) {
    this.applySettings(settings);

    this.canvas = el('canvas', { 'aria-label': t('a11y.canvas'), role: 'img', tabindex: '0' });
    this.banner = el('div', { class: 'banner', 'aria-live': 'assertive' });
    this.toasts = el('div', { class: 'toasts' });
    this.incoming = el('div', { class: 'incoming' });
    this.pausedOverlay = el('div', { class: 'paused-overlay', text: t('hud.paused') });
    this.hint = el('div', { class: 'hint hidden', role: 'status' });
    this.placementBar = el('div', { class: 'placement-bar', role: 'dialog', 'aria-label': t('hud.build') });
    this.zoomControls = el(
      'div',
      { class: 'zoom-controls' },
      el('button', {
        text: '+',
        'aria-label': t('hud.zoomIn'),
        title: t('hud.zoomIn'),
        onclick: () => this.zoomBy(1.4),
      }),
      el('button', {
        text: '−',
        'aria-label': t('hud.zoomOut'),
        title: t('hud.zoomOut'),
        onclick: () => this.zoomBy(1 / 1.4),
      }),
      el('button', {
        class: 'reset',
        text: '⤢',
        'aria-label': t('hud.zoomReset'),
        title: t('hud.zoomReset'),
        onclick: () => this.resetZoom(),
      }),
    );
    this.field = el(
      'div',
      { class: 'field' },
      this.canvas,
      this.banner,
      this.incoming,
      this.zoomControls,
      this.toasts,
      this.hint,
      this.placementBar,
      this.pausedOverlay,
    );

    this.goldEl = el('span', { class: 'value', text: '0' });
    this.livesEl = el('span', { class: 'value', text: '0' });
    this.waveEl = el('span', { class: 'value', text: '' });
    this.livesStat = el(
      'div',
      { class: 'stat lives', title: t('hud.lives') },
      el('span', { class: 'icon' }),
      this.livesEl,
    );
    this.waveButton = el('button', { class: 'primary', onclick: () => this.callWave() }) as HTMLButtonElement;
    this.autoButton = el('button', {
      class: 'toggle',
      text: t('hud.auto'),
      title: t('hud.autoTitle'),
      'aria-pressed': 'false',
      dataset: { action: 'auto' },
      onclick: () => this.toggleAuto(),
    }) as HTMLButtonElement;
    this.countdownEl = el('span', { class: 'countdown' });
    const speed = el('div', { class: 'speed', role: 'group', 'aria-label': t('hud.speed') });
    SPEEDS.forEach((s, i) => {
      const b = el('button', { text: `×${s}`, onclick: () => this.setSpeed(i) }) as HTMLButtonElement;
      this.speedButtons.push(b);
      speed.appendChild(b);
    });
    const topbar = el(
      'div',
      { class: 'topbar' },
      el('div', { class: 'stat gold', title: t('hud.gold') }, el('span', { class: 'icon' }), this.goldEl),
      this.livesStat,
      el('div', { class: 'stat wave', title: t('hud.wave') }, el('span', { class: 'icon' }), this.waveEl),
      el('div', { class: 'spacer' }),
      el('div', { class: 'wave-control' }, this.countdownEl, this.waveButton, this.autoButton),
      speed,
      el('button', {
        text: t('hud.pause'),
        'aria-label': t('hud.pause'),
        onclick: () => this.callbacks.openPause(),
      }),
    );

    this.buildPanel = new BuildPanel(world, { onPick: (id) => this.pickBuild(id) });
    this.selectedPanel = new SelectedPanel(world, {
      onUpgrade: (id, branch) => this.upgrade(id, branch),
      onSell: (id) => this.sell(id),
      onTargetMode: (id, mode) => this.setTargetMode(id, mode),
      onClose: () => this.select(0),
    });
    const side = el(
      'aside',
      { class: 'side' },
      el('div', { class: 'panel-title' }, el('span', { text: t('hud.build') })),
      this.buildPanel.element,
      el('div', { class: 'scroll' }, this.selectedPanel.element, this.hintPanel()),
    );

    this.element = el('div', { class: 'screen game' }, topbar, this.field, side);

    this.renderer = new Renderer(this.canvas);
    this.renderer.setWorld(world);
    this.loop = new GameLoop({
      update: (dt) => this.update(dt),
      render: (_alpha, frameDt) => this.render(frameDt),
    });
    this.bindWorld();
    this.bindInput();
    this.refreshSpeedButtons();
    this.autoButton.classList.toggle('active', world.autoWave);
    this.autoButton.setAttribute('aria-pressed', world.autoWave ? 'true' : 'false');
    this.updateHud(true);
  }

  private hintPanel(): HTMLElement {
    return el(
      'div',
      { class: 'hint-panel' },
      el('div', {
        html: `<kbd>1</kbd>–<kbd>9</kbd> ${t('keys.build').slice(t('keys.build').indexOf(':') + 1)}`,
      }),
      el('div', { html: `<kbd>N</kbd> ${t('keys.wave').slice(t('keys.wave').indexOf(':') + 1)}` }),
      el('div', { html: `<kbd>Espace</kbd> ${t('keys.pause').slice(t('keys.pause').indexOf(':') + 1)}` }),
      el('div', {
        html: `<kbd>U</kbd> <kbd>S</kbd> <kbd>T</kbd> ${t('keys.upgrade').slice(t('keys.upgrade').indexOf(':') + 1)}`,
      }),
      el('div', { html: `<kbd>Échap</kbd> ${t('keys.cancel').slice(t('keys.cancel').indexOf(':') + 1)}` }),
    );
  }

  // ------------------------------------------------------------------
  // Lifecycle
  // ------------------------------------------------------------------

  mount(root: HTMLElement): void {
    if (this.element.parentElement !== root) root.appendChild(this.element);
    this.resizeObserver = new ResizeObserver(() => this.fit());
    this.resizeObserver.observe(this.field);
    this.fit();
    this.loop.start();
    audio.startMusic(this.world.def.theme);
    this.canvas.focus();
    if (this.world.isOver) this.handleGameOver(this.world.phase === 'won');
  }

  destroy(): void {
    this.destroyed = true;
    this.loop.stop();
    this.resizeObserver?.disconnect();
    document.removeEventListener('keydown', this.onKeyDown);
    document.removeEventListener('visibilitychange', this.onVisibility);
    for (const off of this.unsubscribe) off();
    this.unsubscribe = [];
    this.renderer.setWorld(null);
    audio.stopMusic();
    this.element.remove();
  }

  applySettings(settings: Settings): void {
    this.settings = settings;
    this.view.showDamageNumbers = settings.damageNumbers;
    this.view.showAllRanges = settings.showRanges;
    this.view.reducedMotion = settings.reducedMotion;
  }

  private fit(): void {
    const rect = this.field.getBoundingClientRect();
    if (rect.width < 10 || rect.height < 10) return;
    this.renderer.resize(rect.width, rect.height);
    if (!this.zoomInitialised) {
      this.zoomInitialised = true;
      // Touch screens open zoomed enough that a tile is a comfortable target.
      const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false;
      if (coarse) {
        const zoom = Math.max(this.renderer.zoomForTileSize(38), this.renderer.zoomToCoverHeight(0.78));
        this.renderer.setZoom(zoom);
        const base = this.world.grid.bases[0];
        const spawn = this.world.grid.spawns[0];
        if (base && spawn) {
          this.renderer.centerOn(
            ((base[0] + spawn[0]) / 2 + 0.5) * TILE,
            ((base[1] + spawn[1]) / 2 + 0.5) * TILE,
          );
        }
      }
      this.refreshZoomControls();
    }
  }

  setPaused(paused: boolean): void {
    this.loop.paused = paused;
    this.pausedOverlay.classList.toggle('show', paused);
    if (paused) audio.suspend();
    else audio.resume();
  }

  get paused(): boolean {
    return this.loop.paused;
  }

  setSpeed(index: number): void {
    this.speedIndex = Math.max(0, Math.min(SPEEDS.length - 1, index));
    this.loop.speed = SPEEDS[this.speedIndex] as number;
    this.refreshSpeedButtons();
  }

  private refreshSpeedButtons(): void {
    this.speedButtons.forEach((b, i) => b.classList.toggle('active', i === this.speedIndex));
  }

  // ------------------------------------------------------------------
  // World events → audio, toasts, banners
  // ------------------------------------------------------------------

  private bindWorld(): void {
    const w = this.world;
    const on = w.events.on.bind(w.events);
    const pan = (x: number) => (x / w.grid.width) * 1.4 - 0.7;
    this.unsubscribe.push(
      on('shoot', (e) => {
        const p = pan(e.x);
        switch (e.kind) {
          case 'arrow':
            audio.play('arrow', { pan: p, pitch: 0.9 + Math.random() * 0.2, volume: 0.6 });
            break;
          case 'bolt':
            audio.play('bolt', { pan: p, volume: 0.7 });
            break;
          case 'bullet':
            audio.play('musket', { pan: p, volume: 0.5, pitch: 1.1 });
            break;
          case 'tracer': {
            const tower = w.tower(e.towerId);
            const lvl = tower ? w.levelDef(tower) : null;
            if (lvl && lvl.cooldown < 0.3) audio.play('gatling', { pan: p, volume: 0.5 });
            else if (lvl && lvl.damage >= 150) audio.play('cannon', { pan: p, volume: 0.6, pitch: 1.3 });
            else audio.play('musket', { pan: p, volume: 0.6 });
            break;
          }
          case 'ball':
            audio.play('cannon', { pan: p, volume: 0.8 });
            break;
          case 'shell':
          case 'drum':
            audio.play('artillery', { pan: p, volume: 0.8 });
            break;
          case 'rocket':
            audio.play('rocket', { pan: p, volume: 0.5, pitch: 0.9 + Math.random() * 0.3 });
            break;
          case 'cone':
            audio.play('flame', { pan: p, volume: 0.5 });
            break;
        }
      }),
      on('explosion', (e) =>
        audio.play(e.radius > 90 ? 'bigExplosion' : 'explosion', {
          pan: pan(e.x),
          volume: Math.min(1, 0.4 + e.radius / 120),
        }),
      ),
      on('enemyDied', (e) => {
        audio.play('death', {
          pan: pan(e.enemy.x),
          volume: 0.5,
          pitch: enemyDef(e.enemy.defId).boss ? 0.5 : 0.9 + Math.random() * 0.3,
        });
        if (e.bounty > 0) audio.play('coin', { pan: pan(e.enemy.x), volume: 0.35 });
      }),
      on('enemyLeaked', (e) => {
        audio.play('leak', { volume: 0.6 });
        this.livesStat.classList.remove('flash');
        void this.livesStat.offsetWidth;
        this.livesStat.classList.add('flash');
        if (enemyDef(e.enemy.defId).boss || e.lives >= 3)
          this.toast(t('toast.leak', { name: L(enemyDef(e.enemy.defId).name) }), 'danger');
      }),
      on('waveStart', (e) => {
        const wave = w.wave(e.index);
        const bossGroup = wave.groups.find((g) => enemyDef(g.enemy).boss);
        if (e.boss && bossGroup) {
          audio.play('boss');
          this.showBanner(
            `${t('hud.boss')} · ${L(enemyDef(bossGroup.enemy).name)}`,
            t('hud.waveEndless', { n: e.index }),
            true,
          );
          this.toast(t('toast.boss', { name: L(enemyDef(bossGroup.enemy).name) }), 'danger');
        } else {
          audio.play('wave');
          this.showBanner(t('hud.waveEndless', { n: e.index }), '', false);
        }
      }),
      on('waveCleared', (e) => {
        this.toast(t('toast.waveCleared', { n: e.index, gold: e.reward }), 'info');
        this.scheduleAutosave(0);
      }),
      on('towerBuilt', () => {
        audio.play('build');
        this.scheduleAutosave(2);
      }),
      on('towerUpgraded', () => {
        audio.play('upgrade');
        this.scheduleAutosave(2);
      }),
      on('towerSold', (e) => {
        audio.play('sell');
        this.toast(t('toast.sold', { gold: e.refund }), 'info');
        this.scheduleAutosave(2);
      }),
      on('trapTriggered', (e) => audio.play('trap', { pan: pan(e.trap.x), volume: 0.7 })),
      on('gameOver', (e) => this.handleGameOver(e.won)),
    );
  }

  private handleGameOver(won: boolean): void {
    if (this.gameOverShown) return;
    this.gameOverShown = true;
    audio.play(won ? 'victory' : 'defeat');
    audio.setIntensity(0);
    this.view.buildDefId = null;
    this.buildPanel.setActive(null);
    window.setTimeout(
      () => {
        if (!this.destroyed) this.callbacks.onGameOver(won);
      },
      won ? 900 : 1400,
    );
  }

  /** Allows continuing after a victory in endless mode. */
  resumeAfterVictory(): void {
    this.gameOverShown = false;
  }

  private scheduleAutosave(delaySeconds: number): void {
    this.autosaveTimer = Math.min(
      this.autosaveTimer > 0 ? this.autosaveTimer : Infinity,
      Math.max(0.01, delaySeconds),
    );
  }

  showBanner(text: string, sub: string, boss: boolean): void {
    clear(this.banner);
    this.banner.appendChild(document.createTextNode(text));
    if (sub) this.banner.appendChild(el('span', { class: 'small', text: sub }));
    this.banner.classList.remove('show');
    void this.banner.offsetWidth;
    this.banner.classList.toggle('boss', boss);
    this.banner.classList.add('show');
  }

  toast(text: string, kind: 'info' | 'danger' | 'default' = 'default'): void {
    const node = el('div', { class: `toast ${kind === 'default' ? '' : kind}`, text });
    this.toasts.appendChild(node);
    while (this.toasts.children.length > 4) this.toasts.firstChild?.remove();
    window.setTimeout(() => node.remove(), 4000);
  }

  // ------------------------------------------------------------------
  // Actions
  // ------------------------------------------------------------------

  pickBuild(defId: string | null): void {
    if (defId && !this.world.unlockedTowers.has(defId)) return;
    if (!defId) this.hidePlacementBar();
    this.view.buildDefId = defId;
    this.buildPanel.setActive(defId);
    if (defId) this.select(0);
    audio.play('click');
  }

  select(towerId: number): void {
    if (towerId) this.hidePlacementBar();
    this.view.selectedTowerId = towerId;
    this.selectedPanel.show(towerId ? this.world.tower(towerId) : undefined);
    if (towerId) {
      this.view.buildDefId = null;
      this.buildPanel.setActive(null);
    }
  }

  tryBuild(col: number, row: number): boolean {
    const defId = this.view.buildDefId;
    if (!defId) return false;
    const failure = this.world.canBuild(defId, col, row);
    if (failure) {
      if (failure === 'gold') this.toast(t('hud.noGold'), 'danger');
      else if (failure === 'blocks') this.toast(t('hud.blocks'), 'danger');
      else if (failure === 'enemy') this.toast(t('hud.enemyOnTile'), 'danger');
      else if (failure === 'terrain') this.toast(t('hud.cannotBuild'), 'danger');
      audio.play('error');
      return false;
    }
    const tower = this.world.build(defId, col, row);
    if (!tower) return false;
    return true;
  }

  upgrade(towerId: number, branch: 0 | 1): void {
    const tower = this.world.tower(towerId);
    if (!tower) return;
    if (!this.world.upgrade(towerId, branch)) {
      audio.play('error');
      this.toast(t('hud.noGold'), 'danger');
      return;
    }
    this.selectedPanel.show(this.world.tower(towerId));
  }

  sell(towerId: number): void {
    this.world.sell(towerId);
    this.select(0);
  }

  setTargetMode(towerId: number, mode: TargetMode): void {
    this.world.setTargetMode(towerId, mode);
    audio.play('click');
  }

  callWave(): void {
    if (this.world.callNextWave()) audio.play('click');
  }

  toggleAuto(): void {
    this.setAuto(!this.world.autoWave);
    audio.play('click');
    this.toast(this.world.autoWave ? t('hud.autoOn') : t('hud.autoOff'), 'info');
  }

  setAuto(on: boolean): void {
    this.world.autoWave = on;
    this.autoButton.classList.toggle('active', on);
    this.autoButton.setAttribute('aria-pressed', on ? 'true' : 'false');
    this.callbacks.onAutoWave?.(on);
    // An already running countdown is skipped right away.
    if (on && this.world.phase === 'countdown') this.world.callNextWave();
  }

  cycleTargetMode(): void {
    const tower = this.world.tower(this.view.selectedTowerId);
    if (!tower) return;
    const i = TARGET_MODES.indexOf(tower.targetMode);
    const next = TARGET_MODES[(i + 1) % TARGET_MODES.length] as TargetMode;
    this.setTargetMode(tower.id, next);
    this.selectedPanel.show(tower);
  }

  // ------------------------------------------------------------------
  // Input
  // ------------------------------------------------------------------

  private bindInput(): void {
    const canvas = this.canvas;
    const pointers = new Map<number, { x: number; y: number }>();
    let pinchDistance = 0;
    let pinchZoom = 1;
    let dragged = false;
    let touching = false;

    const localPoint = (ev: PointerEvent): { x: number; y: number } => {
      const rect = canvas.getBoundingClientRect();
      return { x: ev.clientX - rect.left, y: ev.clientY - rect.top };
    };
    const tileAt = (ev: PointerEvent): [number, number] => {
      const local = localPoint(ev);
      const p = this.renderer.screenToWorld(local.x, local.y);
      const col = Math.floor(p.x / TILE);
      const row = Math.floor(p.y / TILE);
      if (!this.world.grid.inBounds(col, row)) return [-1, -1];
      return [col, row];
    };

    canvas.addEventListener('pointerdown', (ev) => {
      audio.unlock();
      canvas.focus();
      pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
      canvas.setPointerCapture(ev.pointerId);
      if (ev.pointerType === 'touch') touching = true;
      if (pointers.size === 2) {
        const both = [...pointers.values()];
        const a = both[0];
        const b = both[1];
        pinchDistance = a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
        pinchZoom = this.renderer.zoomLevel;
        dragged = true;
        return;
      }
      dragged = false;
      this.pointerDown = { x: ev.clientX, y: ev.clientY, time: performance.now() };
      if (ev.pointerType === 'touch') {
        const [c, r] = tileAt(ev);
        this.view.hoverCol = c;
        this.view.hoverRow = r;
      }
    });

    canvas.addEventListener('pointermove', (ev) => {
      const previous = pointers.get(ev.pointerId);
      if (previous) pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });

      // Two fingers: pinch to zoom around their midpoint.
      if (pointers.size === 2 && previous) {
        const both = [...pointers.values()];
        const a = both[0];
        const b = both[1];
        if (a && b && pinchDistance > 0) {
          const distance = Math.hypot(a.x - b.x, a.y - b.y);
          const rect = canvas.getBoundingClientRect();
          this.renderer.setZoom(
            pinchZoom * (distance / pinchDistance),
            (a.x + b.x) / 2 - rect.left,
            (a.y + b.y) / 2 - rect.top,
          );
          this.refreshZoomControls();
        }
        return;
      }

      if (previous && this.pointerDown) {
        const dx = ev.clientX - previous.x;
        const dy = ev.clientY - previous.y;
        const total = Math.hypot(ev.clientX - this.pointerDown.x, ev.clientY - this.pointerDown.y);
        // Dragging pans the map, but only once zoomed in and past a small threshold.
        if (total > 10 && this.renderer.zoomLevel > 1) {
          dragged = true;
          this.renderer.panBy(dx, dy);
          return;
        }
        if (total > 10) dragged = true;
      }
      if (ev.pointerType === 'touch') return;
      touching = false;
      const [c, r] = tileAt(ev);
      this.view.hoverCol = c;
      this.view.hoverRow = r;
    });

    const endPointer = (ev: PointerEvent): void => {
      pointers.delete(ev.pointerId);
      if (pointers.size < 2) pinchDistance = 0;
    };

    canvas.addEventListener('pointerup', (ev) => {
      const down = this.pointerDown;
      const wasDragged = dragged;
      endPointer(ev);
      this.pointerDown = null;
      if (!down || wasDragged) return;
      const moved = Math.hypot(ev.clientX - down.x, ev.clientY - down.y);
      if (moved > 12) return;
      if (ev.button === 2) {
        this.cancel();
        return;
      }
      const [c, r] = tileAt(ev);
      // On a touch screen a tap only aims: building needs a second, explicit confirmation.
      if (ev.pointerType === 'touch') this.handleTileTap(c, r);
      else this.handleTileClick(c, r, ev.shiftKey);
    });
    canvas.addEventListener('pointercancel', endPointer);
    canvas.addEventListener('lostpointercapture', endPointer);

    // A touch lifts the pointer out of the canvas, and the browser then sends a
    // synthetic mouse leave: neither may wipe the tile the player just aimed at.
    canvas.addEventListener('pointerleave', (ev) => {
      if (ev.pointerType === 'touch' || touching || pointers.size > 0) return;
      if (this.placementBar.classList.contains('show')) return;
      this.view.hoverCol = -1;
      this.view.hoverRow = -1;
    });

    canvas.addEventListener(
      'wheel',
      (ev) => {
        ev.preventDefault();
        const rect = canvas.getBoundingClientRect();
        const factor = Math.pow(0.999, ev.deltaY);
        this.renderer.setZoom(
          this.renderer.zoomLevel * factor,
          ev.clientX - rect.left,
          ev.clientY - rect.top,
        );
        this.refreshZoomControls();
      },
      { passive: false },
    );

    canvas.addEventListener('contextmenu', (ev) => ev.preventDefault());
    document.addEventListener('keydown', this.onKeyDown);
    document.addEventListener('visibilitychange', this.onVisibility);
  }

  /**
   * Touch flow: the first tap aims (ghost + confirmation bar), the second
   * confirms. Tapping an existing tower selects it as usual.
   */
  handleTileTap(col: number, row: number): void {
    if (col < 0 || row < 0) {
      this.cancel();
      return;
    }
    const existing = this.world.towerAt(col, row);
    if (existing) {
      this.select(existing.id);
      audio.play('click');
      return;
    }
    if (this.view.buildDefId) {
      this.view.hoverCol = col;
      this.view.hoverRow = row;
      this.showPlacementBar();
      audio.play('click');
      return;
    }
    this.select(0);
  }

  /** Confirmation bar shown over the map while aiming a tower on a touch screen. */
  private showPlacementBar(): void {
    const defId = this.view.buildDefId;
    if (!defId) {
      this.placementBar.classList.remove('show');
      return;
    }
    const failure = this.world.canBuild(defId, this.view.hoverCol, this.view.hoverRow);
    const cost = this.world.towerCost(defId);
    clear(this.placementBar);
    this.placementBar.appendChild(
      el(
        'div',
        { class: 'info' },
        el('span', { class: 'name', text: towerName(defId) }),
        el('span', { class: failure === 'gold' ? 'cost poor' : 'cost', text: t('hud.cost', { cost }) }),
      ),
    );
    if (failure) {
      const key =
        failure === 'gold'
          ? 'hud.noGold'
          : failure === 'blocks'
            ? 'hud.blocks'
            : failure === 'enemy'
              ? 'hud.enemyOnTile'
              : 'hud.cannotBuild';
      this.placementBar.appendChild(el('div', { class: 'why', text: t(key) }));
    }
    this.placementBar.appendChild(
      el(
        'div',
        { class: 'actions' },
        el('button', {
          class: 'cancel',
          text: '✕',
          'aria-label': t('keys.cancel'),
          onclick: () => this.cancel(),
        }),
        el('button', {
          class: 'primary confirm',
          text: `✓ ${t('hud.build')}`,
          disabled: failure !== null,
          dataset: { action: 'confirm-build' },
          onclick: () => this.confirmPlacement(),
        }),
      ),
    );
    this.placementBar.classList.add('show');
  }

  private hidePlacementBar(): void {
    this.placementBar.classList.remove('show');
  }

  /** Builds the aimed tower and keeps the same kind selected for quick repeats. */
  confirmPlacement(): void {
    const defId = this.view.buildDefId;
    if (!defId) return;
    if (!this.tryBuild(this.view.hoverCol, this.view.hoverRow)) {
      this.showPlacementBar();
      return;
    }
    this.hidePlacementBar();
    if (this.world.gold < this.world.towerCost(defId)) this.pickBuild(null);
  }

  private refreshZoomControls(): void {
    const zoomed = this.renderer.zoomLevel > 1.01;
    this.zoomControls.classList.toggle('zoomed', zoomed);
  }

  zoomBy(factor: number): void {
    this.renderer.setZoom(this.renderer.zoomLevel * factor);
    this.refreshZoomControls();
  }

  resetZoom(): void {
    this.renderer.resetCamera();
    this.refreshZoomControls();
  }

  /** Shortcuts work wherever focus is, except inside form fields and while a modal is open. */
  private onKeyDown = (ev: KeyboardEvent): void => {
    if (this.destroyed) return;
    const target = ev.target as HTMLElement | null;
    if (
      target &&
      (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA')
    )
      return;
    if (document.querySelector('.modal-backdrop')) return;
    this.handleKey(ev);
  };

  private onVisibility = (): void => {
    if (document.hidden && !this.world.isOver && !this.loop.paused) this.callbacks.openPause();
  };

  handleTileClick(col: number, row: number, keepBuildMode: boolean): void {
    if (col < 0 || row < 0) {
      this.cancel();
      return;
    }
    const existing = this.world.towerAt(col, row);
    if (existing) {
      this.select(existing.id);
      audio.play('click');
      return;
    }
    if (this.view.buildDefId) {
      if (this.tryBuild(col, row) && !keepBuildMode) this.pickBuild(null);
      return;
    }
    this.select(0);
  }

  cancel(): void {
    this.hidePlacementBar();
    if (this.view.buildDefId) this.pickBuild(null);
    else this.select(0);
  }

  handleKey(ev: KeyboardEvent): void {
    if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
    const key = ev.key;
    if (key >= '1' && key <= '9') {
      const def = TOWERS.find((d) => d.hotkey === key);
      if (def) this.pickBuild(this.view.buildDefId === def.id ? null : def.id);
      ev.preventDefault();
      return;
    }
    switch (key) {
      case 'Escape':
        this.cancel();
        break;
      case ' ':
        this.callbacks.openPause();
        break;
      case 'n':
      case 'N':
      case 'Enter':
        this.callWave();
        break;
      case '+':
      case '=':
        this.setSpeed(this.speedIndex + 1);
        break;
      case '-':
      case '_':
        this.setSpeed(this.speedIndex - 1);
        break;
      case 'u':
      case 'U': {
        const tower = this.world.tower(this.view.selectedTowerId);
        if (tower) this.upgrade(tower.id, 0);
        break;
      }
      case 's':
      case 'S':
        if (this.view.selectedTowerId) this.sell(this.view.selectedTowerId);
        break;
      case 't':
      case 'T':
        this.cycleTargetMode();
        break;
      case 'r':
      case 'R':
        this.view.showAllRanges = !this.view.showAllRanges;
        break;
      case 'a':
      case 'A':
        this.toggleAuto();
        break;
      default:
        return;
    }
    ev.preventDefault();
  }

  // ------------------------------------------------------------------
  // Loop
  // ------------------------------------------------------------------

  private update(dt: number): void {
    this.world.step(dt);
    if (this.autosaveTimer > 0 && this.autosaveTimer !== Infinity) {
      this.autosaveTimer -= dt;
      if (this.autosaveTimer <= 0) {
        this.autosaveTimer = 0;
        if (!this.world.isOver) this.callbacks.onAutosave(this.world);
      }
    }
  }

  private render(frameDt: number): void {
    const target = this.world.phase === 'active' ? 1 : this.world.phase === 'countdown' ? 0.25 : 0;
    this.musicIntensity += (target - this.musicIntensity) * Math.min(1, frameDt * 0.8);
    audio.setIntensity(this.musicIntensity);
    this.renderer.draw(this.view, frameDt);
    this.updateHud(false);
  }

  private updateHud(force: boolean): void {
    const w = this.world;
    if (force || w.gold !== this.lastGold) {
      this.lastGold = w.gold;
      this.goldEl.textContent = formatNumber(w.gold);
      this.buildPanel.refresh();
      this.selectedPanel.refresh();
    }
    this.selectedPanel.tick();
    if (force || w.lives !== this.lastLives) {
      this.lastLives = w.lives;
      this.livesEl.textContent = `${w.lives}`;
    }
    const compact = this.element.clientWidth < 520;
    const waveLabel =
      w.mode === 'endless'
        ? t(compact ? 'hud.waveShort' : 'hud.waveEndless', { n: w.waveIndex })
        : t(compact ? 'hud.waveShortOf' : 'hud.waveOf', { n: w.waveIndex, total: w.def.waveCount });
    if (force || waveLabel !== this.lastWaveLabel) {
      this.lastWaveLabel = waveLabel;
      this.waveEl.textContent = waveLabel;
    }
    let buttonLabel: string;
    let countdown = '';
    if (w.isOver || !w.hasMoreWaves) {
      buttonLabel = t('hud.nextWave');
    } else if (w.phase === 'idle') {
      buttonLabel = t('hud.startWave');
    } else if (w.phase === 'countdown') {
      buttonLabel = t('hud.callEarly', { bonus: w.earlyCallBonus });
      countdown = t('hud.countdown', { s: Math.ceil(w.countdown) });
    } else {
      buttonLabel =
        w.earlyCallBonus > 0 ? t('hud.callEarly', { bonus: w.earlyCallBonus }) : t('hud.nextWave');
      countdown = w.activeWaveCount > 1 ? t('hud.wavesActive', { n: w.activeWaveCount }) : '';
    }
    if (force || buttonLabel !== this.lastButtonLabel) {
      this.lastButtonLabel = buttonLabel;
      this.waveButton.textContent = buttonLabel;
    }
    const canCall = w.canCallWave;
    if (this.waveButton.disabled === canCall) this.waveButton.disabled = !canCall;
    if (force || countdown !== this.lastCountdown) {
      this.lastCountdown = countdown;
      this.countdownEl.textContent = countdown;
    }
    const incomingIndex = w.hasMoreWaves ? w.waveIndex + 1 : -1;
    if (force || incomingIndex !== this.lastIncoming) {
      this.lastIncoming = incomingIndex;
      this.renderIncoming(incomingIndex);
    }
    if (this.view.selectedTowerId && !w.tower(this.view.selectedTowerId)) this.select(0);
    this.updateHint();
  }

  /** Contextual help before the first wave of a game. */
  private updateHint(): void {
    const w = this.world;
    let text = '';
    if (w.waveIndex === 0 && !w.isOver) {
      const touch = window.matchMedia?.('(pointer: coarse)').matches ?? false;
      if (w.towers.length === 0)
        text = w.grid.open ? t('hud.hintOpen') : t(touch ? 'hud.hintBuildTouch' : 'hud.hintBuild');
      else if (w.towers.length === 1 && touch) text = t('hud.hintZoom');
      else if (w.towers.length < 3) text = t('hud.hintWave');
    }
    if (text === this.lastHint) return;
    this.lastHint = text;
    this.hint.textContent = text;
    this.hint.classList.toggle('hidden', text === '');
    this.field.classList.toggle('has-hint', text !== '');
  }

  private renderIncoming(index: number): void {
    clear(this.incoming);
    if (index < 0) {
      this.incoming.style.display = 'none';
      return;
    }
    this.incoming.style.display = '';
    const wave = this.world.wave(index);
    const counts = new Map<string, number>();
    for (const g of wave.groups) counts.set(g.enemy, (counts.get(g.enemy) ?? 0) + g.count);
    const list = el('div', { class: 'list' });
    for (const [id, n] of counts) {
      const def = enemyDef(id);
      list.appendChild(
        el('span', { class: def.boss ? 'boss' : '', text: `${n} × ${L(def.name)}${def.flying ? ' ✈' : ''}` }),
      );
    }
    this.incoming.appendChild(
      el('div', { class: 'title', text: `${t('hud.incoming')} · ${t('misc.wave')} ${index}` }),
    );
    this.incoming.appendChild(list);
  }

  /** Test hook: currently selected tower. */
  get selectedTower(): Tower | undefined {
    return this.world.tower(this.view.selectedTowerId);
  }
}
