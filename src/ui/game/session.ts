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
import { BuildPanel, SelectedPanel } from './panels';

export type ExitReason = 'quit' | 'abandon' | 'menu' | 'maps' | 'retry';

export interface SessionCallbacks {
  onExit: (reason: ExitReason) => void;
  onGameOver: (won: boolean) => void;
  onAutosave: (world: World) => void;
  openPause: () => void;
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
  private goldEl: HTMLElement;
  private livesEl: HTMLElement;
  private livesStat: HTMLElement;
  private waveEl: HTMLElement;
  private waveButton: HTMLButtonElement;
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
    this.field = el(
      'div',
      { class: 'field' },
      this.canvas,
      this.banner,
      this.incoming,
      this.toasts,
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
      el('div', { class: 'wave-control' }, this.countdownEl, this.waveButton),
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
    root.appendChild(this.element);
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
    this.view.buildDefId = defId;
    this.buildPanel.setActive(defId);
    if (defId) this.select(0);
    audio.play('click');
  }

  select(towerId: number): void {
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
    const tileAt = (ev: PointerEvent): [number, number] => {
      const rect = canvas.getBoundingClientRect();
      const p = this.renderer.screenToWorld(ev.clientX - rect.left, ev.clientY - rect.top);
      const col = Math.floor(p.x / TILE);
      const row = Math.floor(p.y / TILE);
      if (!this.world.grid.inBounds(col, row)) return [-1, -1];
      return [col, row];
    };
    canvas.addEventListener('pointermove', (ev) => {
      if (ev.pointerType === 'touch') return;
      const [c, r] = tileAt(ev);
      this.view.hoverCol = c;
      this.view.hoverRow = r;
    });
    canvas.addEventListener('pointerleave', () => {
      this.view.hoverCol = -1;
      this.view.hoverRow = -1;
    });
    canvas.addEventListener('pointerdown', (ev) => {
      audio.unlock();
      canvas.focus();
      this.pointerDown = { x: ev.clientX, y: ev.clientY, time: performance.now() };
      if (ev.pointerType === 'touch') {
        const [c, r] = tileAt(ev);
        this.view.hoverCol = c;
        this.view.hoverRow = r;
      }
    });
    canvas.addEventListener('pointerup', (ev) => {
      const down = this.pointerDown;
      this.pointerDown = null;
      if (!down) return;
      const moved = Math.hypot(ev.clientX - down.x, ev.clientY - down.y);
      if (moved > 12) return;
      if (ev.button === 2) {
        this.cancel();
        return;
      }
      const [c, r] = tileAt(ev);
      this.handleTileClick(c, r, ev.shiftKey);
    });
    canvas.addEventListener('contextmenu', (ev) => ev.preventDefault());
    canvas.addEventListener('keydown', (ev) => this.handleKey(ev));
    document.addEventListener('visibilitychange', this.onVisibility);
  }

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
    if (force || w.lives !== this.lastLives) {
      this.lastLives = w.lives;
      this.livesEl.textContent = `${w.lives}`;
    }
    const waveLabel =
      w.mode === 'endless'
        ? t('hud.waveEndless', { n: w.waveIndex })
        : t('hud.waveOf', { n: w.waveIndex, total: w.def.waveCount });
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
