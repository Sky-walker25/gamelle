import { formatNumber } from '@/core/math';
import { TOWERS, TOWER_BY_ID, towerLevelDef } from '@/data/towers';
import { TILE } from '@/sim/grid';
import type { TargetMode, Tower, TowerLevelDef } from '@/sim/types';
import { TARGET_MODES } from '@/sim/types';
import type { World } from '@/sim/world';
import { clear, el } from '../dom';
import { L, t, tk } from '../i18n';
import { towerIcon } from '../icons';

export interface BuildPanelCallbacks {
  onPick: (defId: string | null) => void;
}

export interface SelectedPanelCallbacks {
  onUpgrade: (towerId: number, branch: 0 | 1) => void;
  onSell: (towerId: number) => void;
  onTargetMode: (towerId: number, mode: TargetMode) => void;
  onClose: () => void;
}

export function describeAttack(lvl: TowerLevelDef): string {
  if (lvl.attack === 'support') return t('stat.none');
  if (lvl.targetsAir && lvl.targetsGround) return t('stat.both');
  if (lvl.targetsAir) return t('stat.airOnly');
  return t('stat.groundOnly');
}

/** Stat rows for a level definition, optionally showing deltas versus a previous level. */
export function statRows(
  lvl: TowerLevelDef,
  stats: { damage: number; cooldown: number; range: number; dps: number },
  prev?: { lvl: TowerLevelDef; damage: number; cooldown: number; range: number; dps: number },
): HTMLElement {
  const list = el('div', { class: 'stat-list' });
  const row = (k: string, v: string, up?: boolean) => {
    list.appendChild(el('span', { class: 'k', text: k }));
    list.appendChild(el('span', { class: up ? 'v up' : 'v', text: v }));
  };
  const tiles = (px: number) => `${(px / TILE).toFixed(1)} ${t('misc.tiles')}`;
  if (lvl.attack === 'support') {
    const a = lvl.aura ?? {};
    if (a.damage)
      row(
        t('stat.damage'),
        `+${Math.round(a.damage * 100)} %`,
        prev ? (prev.lvl.aura?.damage ?? 0) < a.damage : undefined,
      );
    if (a.rate)
      row(
        t('stat.rate'),
        `+${Math.round(a.rate * 100)} %`,
        prev ? (prev.lvl.aura?.rate ?? 0) < a.rate : undefined,
      );
    if (a.range)
      row(
        t('stat.range'),
        `+${Math.round(a.range * 100)} %`,
        prev ? (prev.lvl.aura?.range ?? 0) < a.range : undefined,
      );
    if (a.gold)
      row(
        t('stat.gold'),
        `+${Math.round(a.gold * 100)} %`,
        prev ? (prev.lvl.aura?.gold ?? 0) < a.gold : undefined,
      );
    if (a.reveal) row(t('stat.reveal'), '✓');
    row(t('stat.aura'), tiles(stats.range), prev ? prev.range < stats.range : undefined);
    return list;
  }
  if (lvl.attack === 'aura') {
    if (stats.damage > 0)
      row(t('stat.dps'), formatNumber(stats.damage), prev ? prev.damage < stats.damage : undefined);
  } else if (lvl.attack === 'trap') {
    row(t('stat.damage'), formatNumber(stats.damage), prev ? prev.damage < stats.damage : undefined);
    if (lvl.trap)
      row(
        t('stat.traps'),
        `${lvl.trap.maxActive} · ${lvl.trap.placeInterval}s`,
        prev ? (prev.lvl.trap?.maxActive ?? 0) < lvl.trap.maxActive : undefined,
      );
  } else {
    row(
      t('stat.damage'),
      formatNumber(stats.damage) + (lvl.salvo ? ` × ${lvl.salvo}` : ''),
      prev ? prev.damage < stats.damage || (prev.lvl.salvo ?? 1) < (lvl.salvo ?? 1) : undefined,
    );
    row(
      t('stat.rate'),
      `${(1 / stats.cooldown).toFixed(2)}${t('stat.perSecond')}`,
      prev ? prev.cooldown > stats.cooldown : undefined,
    );
    row(t('stat.dps'), formatNumber(stats.dps), prev ? prev.dps < stats.dps : undefined);
  }
  row(t('stat.range'), tiles(stats.range), prev ? prev.range < stats.range : undefined);
  if (lvl.minRange) row(t('stat.minRange'), tiles(lvl.minRange));
  if (lvl.splash)
    row(t('stat.splash'), tiles(lvl.splash), prev ? (prev.lvl.splash ?? 0) < lvl.splash : undefined);
  if (lvl.armorPierce)
    row(
      t('stat.pierce'),
      `${Math.round(lvl.armorPierce * 100)} %`,
      prev ? (prev.lvl.armorPierce ?? 0) < lvl.armorPierce : undefined,
    );
  if (lvl.bonusVsAir) row(t('stat.bonusAir'), `× ${lvl.bonusVsAir}`);
  if (lvl.crit) row(t('stat.crit'), `${Math.round(lvl.crit.chance * 100)} % × ${lvl.crit.multiplier}`);
  if (lvl.status?.slow)
    row(
      t('stat.slow'),
      `${Math.round((1 - lvl.status.slow.factor) * 100)} %`,
      prev ? (prev.lvl.status?.slow?.factor ?? 1) > lvl.status.slow.factor : undefined,
    );
  if (lvl.status?.burn)
    row(
      t('stat.burn'),
      `${lvl.status.burn.dps}${t('stat.perSecond')} · ${lvl.status.burn.duration}s`,
      prev ? (prev.lvl.status?.burn?.dps ?? 0) < lvl.status.burn.dps : undefined,
    );
  if (lvl.status?.shred) row(t('stat.shred'), `${Math.round(lvl.status.shred.amount * 100)} %`);
  if (lvl.status?.stun) row(t('stat.stun'), `${lvl.status.stun.duration}s`);
  row(tk('dmg.' + lvl.damageType), describeAttack(lvl));
  return list;
}

export class BuildPanel {
  readonly element: HTMLElement;
  private cards = new Map<string, HTMLButtonElement>();
  private costs = new Map<string, number>();
  private active: string | null = null;

  constructor(
    private readonly world: World,
    private readonly callbacks: BuildPanelCallbacks,
  ) {
    this.element = el('div', { class: 'build-grid', role: 'toolbar', 'aria-label': t('hud.build') });
    for (const def of TOWERS) {
      const lvl = def.levels[0];
      const unlocked = world.unlockedTowers.has(def.id);
      const card = el(
        'button',
        {
          class: 'tower-card' + (unlocked ? '' : ' locked'),
          title: unlocked ? `${L(lvl.name)} · ${L(def.role)}\n${L(lvl.description)}` : t('hud.locked'),
          disabled: !unlocked,
          dataset: { tower: def.id },
          onclick: () => this.callbacks.onPick(this.active === def.id ? null : def.id),
        },
        el('span', { class: 'key', text: def.hotkey }),
        towerIcon(def.id, 1, -1, 48),
        el('span', { class: 'name', text: L(lvl.name) }),
        el('span', { class: 'cost', text: `${lvl.cost}` }),
      );
      this.cards.set(def.id, card);
      this.costs.set(def.id, lvl.cost);
      this.element.appendChild(card);
    }
  }

  setActive(defId: string | null): void {
    this.active = defId;
    for (const [id, card] of this.cards) card.classList.toggle('active', id === defId);
  }

  refresh(): void {
    for (const [id, card] of this.cards) {
      const cost = this.costs.get(id) ?? 0;
      card.classList.toggle('poor', this.world.gold < cost && this.world.unlockedTowers.has(id));
    }
  }
}

export class SelectedPanel {
  readonly element: HTMLElement;
  private towerId = 0;
  private upgradeButtons: { button: HTMLButtonElement; cost: number }[] = [];

  constructor(
    private readonly world: World,
    private readonly callbacks: SelectedPanelCallbacks,
  ) {
    this.element = el('div', { class: 'selected-panel', style: { display: 'none' } });
  }

  get currentTowerId(): number {
    return this.towerId;
  }

  show(tower: Tower | undefined): void {
    clear(this.element);
    this.upgradeButtons = [];
    if (!tower) {
      this.towerId = 0;
      this.element.style.display = 'none';
      return;
    }
    this.towerId = tower.id;
    this.element.style.display = '';
    const world = this.world;
    const def = TOWER_BY_ID[tower.defId];
    if (!def) return;
    const lvl = world.levelDef(tower);
    const stats = world.towerStats(tower);

    const head = el(
      'div',
      { class: 'head' },
      towerIcon(tower.defId, tower.level, tower.branch, 56),
      el(
        'div',
        {},
        el('div', { class: 'name', text: L(lvl.name) }),
        el('div', {
          class: 'era',
          text: `${tk('era.' + lvl.era)} · ${lvl.year} · ${tower.level >= 4 ? t('tower.max') : t('tower.level', { level: tower.level })}`,
        }),
      ),
      el('button', {
        class: 'ghost',
        text: '✕',
        'aria-label': t('keys.cancel'),
        style: { marginLeft: 'auto' },
        onclick: () => this.callbacks.onClose(),
      }),
    );
    this.element.appendChild(head);
    this.element.appendChild(el('div', { class: 'description', text: L(lvl.description) }));
    this.element.appendChild(statRows(lvl, stats));
    if (tower.buff.damage > 0 || tower.buff.rate > 0 || tower.buff.range > 0) {
      this.element.appendChild(
        el('div', {
          class: 'description',
          style: { color: 'var(--accent)' },
          text: `★ ${t('tower.buffed')}`,
        }),
      );
    }

    if (lvl.attack !== 'support' && lvl.attack !== 'aura' && lvl.attack !== 'trap') {
      const modes = el('div', { class: 'target-modes', role: 'group', 'aria-label': t('tower.target') });
      for (const mode of TARGET_MODES) {
        modes.appendChild(
          el('button', {
            class: mode === tower.targetMode ? 'active' : '',
            text: tk('target.' + mode),
            onclick: () => {
              this.callbacks.onTargetMode(tower.id, mode);
              this.show(world.tower(tower.id));
            },
          }),
        );
      }
      this.element.appendChild(
        el('div', {
          class: 'panel-title',
          style: { padding: '2px 0', border: '0' },
          text: t('tower.target'),
        }),
      );
      this.element.appendChild(modes);
    }

    // Upgrade boxes.
    const buildBox = (next: TowerLevelDef, branch: 0 | 1, label: string) => {
      const cost = next.cost;
      const nextStats = {
        damage: next.damage * (1 + tower.buff.damage),
        cooldown: next.cooldown > 0 ? next.cooldown / (1 + tower.buff.rate) : 0,
        range: next.range * (1 + tower.buff.range),
        dps: 0,
      };
      nextStats.dps =
        next.attack === 'aura'
          ? nextStats.damage
          : nextStats.cooldown > 0
            ? (nextStats.damage * (next.salvo ?? 1)) / nextStats.cooldown
            : 0;
      const button = el('button', {
        class: 'primary',
        text: `${label} · ${cost} ${t('hud.gold').toLowerCase()}`,
        disabled: world.gold < cost,
        onclick: () => this.callbacks.onUpgrade(tower.id, branch),
      }) as HTMLButtonElement;
      this.upgradeButtons.push({ button, cost });
      const box = el(
        'div',
        { class: 'upgrade-box' },
        el(
          'div',
          { class: 'title' },
          el('span', { text: L(next.name) }),
          el('span', { class: 'year', text: `${tk('era.' + next.era)} · ${next.year}` }),
        ),
        el('div', { class: 'description', text: L(next.description) }),
        statRows(next, nextStats, { lvl, ...stats }),
        button,
      );
      return box;
    };
    if (tower.level < 3) {
      const next = def.levels[tower.level] as TowerLevelDef;
      this.element.appendChild(buildBox(next, 0, t('tower.upgrade')));
    } else if (tower.level === 3) {
      this.element.appendChild(
        el('div', {
          class: 'panel-title',
          style: { padding: '4px 0', border: '0' },
          text: t('tower.choose'),
        }),
      );
      this.element.appendChild(buildBox(def.branches[0], 0, t('tower.specialise')));
      this.element.appendChild(buildBox(def.branches[1], 1, t('tower.specialise')));
    }

    const info = el('div', { class: 'stat-list' });
    info.appendChild(el('span', { class: 'k', text: t('tower.kills') }));
    info.appendChild(el('span', { class: 'v', text: `${tower.kills}` }));
    info.appendChild(el('span', { class: 'k', text: t('tower.damageDealt') }));
    info.appendChild(el('span', { class: 'v', text: formatNumber(tower.damageDealt) }));
    this.element.appendChild(info);
    this.element.appendChild(el('div', { class: 'lore', text: L(lvl.lore) }));
    this.element.appendChild(
      el(
        'div',
        { class: 'actions' },
        el('button', {
          class: 'danger',
          text: t('tower.sell', { gold: world.sellValue(tower) }),
          onclick: () => this.callbacks.onSell(tower.id),
        }),
      ),
    );
  }

  /** Cheap per-frame refresh of affordability. */
  refresh(): void {
    for (const { button, cost } of this.upgradeButtons) button.disabled = this.world.gold < cost;
  }
}

export function towerName(defId: string, level = 1, branch: -1 | 0 | 1 = -1): string {
  return L(towerLevelDef(defId, level, branch).name);
}
