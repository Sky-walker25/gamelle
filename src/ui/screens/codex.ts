import { ENEMIES } from '@/data/enemies';
import { DEFAULT_TOWERS, MAPS } from '@/data/maps';
import { TOWERS } from '@/data/towers';
import type { TowerLevelDef } from '@/sim/types';
import type { Progress } from '@/meta/storage';
import { mapProgress, unlockedTowers } from '@/meta/storage';
import { TILE } from '@/sim/grid';
import { clear, el, stars } from '../dom';
import { L, t, tk } from '../i18n';
import { enemyIcon, mapPreview, towerIcon } from '../icons';

type Tab = 'towers' | 'table' | 'enemies' | 'maps';

export function codexScreen(progress: Progress, onBack: () => void): HTMLElement {
  let tab: Tab = 'towers';
  const list = el('div', { class: 'codex-list' });
  const tabs = el('div', { class: 'tabs', role: 'tablist' });
  const render = () => {
    clear(list);
    for (const b of tabs.querySelectorAll('button')) b.classList.toggle('active', b.dataset['tab'] === tab);
    list.classList.toggle('table-mode', tab === 'table');
    if (tab === 'towers') renderTowers(list, progress);
    else if (tab === 'table') renderTable(list);
    else if (tab === 'enemies') renderEnemies(list);
    else renderMaps(list, progress);
  };
  for (const id of ['towers', 'table', 'enemies', 'maps'] as Tab[]) {
    tabs.appendChild(
      el('button', {
        role: 'tab',
        text: tk('codex.' + id),
        dataset: { tab: id },
        onclick: () => {
          tab = id;
          render();
        },
      }),
    );
  }
  render();
  return el(
    'div',
    { class: 'screen codex' },
    el(
      'div',
      { class: 'screen-header' },
      el('button', { text: `← ${t('maps.back')}`, onclick: onBack, dataset: { action: 'back' } }),
      el('h2', { text: t('codex.title') }),
    ),
    el('p', { class: 'intro', text: t('codex.intro') }),
    tabs,
    list,
  );
}

function renderTowers(list: HTMLElement, progress: Progress): void {
  const unlocked = new Set(unlockedTowers(progress));
  for (const def of TOWERS) {
    const first = def.levels[0];
    const unlockMap = MAPS.find((m) => m.unlocks.includes(def.id));
    const card = el('div', { class: 'codex-card' });
    card.appendChild(
      el(
        'div',
        { class: 'head' },
        towerIcon(def.id, 1, -1, 64),
        el(
          'div',
          {},
          el('div', { class: 'name', text: L(first.name) }),
          el('div', {
            class: 'era',
            text: `${L(def.role)} · ${tk('attack.' + first.attack)} · ${tk('dmg.' + first.damageType)}`,
          }),
          el(
            'div',
            {},
            el('span', {
              class: 'badge' + (unlocked.has(def.id) ? '' : ' locked'),
              text: DEFAULT_TOWERS.includes(def.id)
                ? t('codex.default')
                : unlockMap
                  ? t('codex.unlockedBy', { map: L(unlockMap.name) })
                  : '',
            }),
          ),
        ),
      ),
    );
    const levels = el('div', { class: 'levels' });
    const entries: { tag: string; lvl: (typeof def.levels)[number] }[] = [
      { tag: 'I', lvl: def.levels[0] },
      { tag: 'II', lvl: def.levels[1] },
      { tag: 'III', lvl: def.levels[2] },
      { tag: 'A', lvl: def.branches[0] },
      { tag: 'B', lvl: def.branches[1] },
    ];
    for (const { tag, lvl } of entries) {
      levels.appendChild(
        el(
          'div',
          { class: 'level' },
          el('span', { class: 'tag', text: tag }),
          el(
            'div',
            {},
            el('span', { class: 'lname', text: L(lvl.name) }),
            el('span', {
              class: 'year',
              text: `${tk('era.' + lvl.era)} · ${lvl.year} · ${lvl.cost} ${t('hud.gold').toLowerCase()} · ${(lvl.range / TILE).toFixed(1)} ${t('misc.tiles')}`,
            }),
            el('div', { class: 'description', text: L(lvl.description) }),
            el('div', { class: 'lore', text: L(lvl.lore) }),
          ),
        ),
      );
    }
    card.appendChild(levels);
    list.appendChild(card);
  }
}

/** Compact spec lines for one tower level, used by the comparison table. */
export function specLines(lvl: TowerLevelDef): [string, string][] {
  const out: [string, string][] = [];
  const tiles = (px: number) => `${(px / TILE).toFixed(1)} ${t('misc.tiles')}`;
  out.push([t('hud.gold'), `${lvl.cost}`]);
  if (lvl.attack === 'support') {
    const a = lvl.aura ?? {};
    const parts: string[] = [];
    if (a.damage) parts.push(`+${Math.round(a.damage * 100)} % ${t('stat.damage').toLowerCase()}`);
    if (a.rate) parts.push(`+${Math.round(a.rate * 100)} % ${t('stat.rate').toLowerCase()}`);
    if (a.range) parts.push(`+${Math.round(a.range * 100)} % ${t('stat.range').toLowerCase()}`);
    if (a.gold) parts.push(`+${Math.round(a.gold * 100)} % ${t('hud.gold').toLowerCase()}`);
    if (a.reveal) parts.push(t('stat.reveal').toLowerCase());
    out.push([t('stat.aura'), parts.join(', ')]);
    out.push([t('stat.range'), tiles(lvl.range)]);
    return out;
  }
  if (lvl.attack === 'aura') {
    out.push([t('stat.dps'), `${lvl.damage}`]);
  } else if (lvl.attack === 'trap') {
    out.push([t('stat.damage'), `${lvl.damage}`]);
    if (lvl.trap) out.push([t('stat.traps'), `${lvl.trap.maxActive} · ${lvl.trap.placeInterval} s`]);
  } else {
    out.push([t('stat.damage'), `${lvl.damage}${lvl.salvo ? ` × ${lvl.salvo}` : ''}`]);
    out.push([t('stat.rate'), `${(1 / lvl.cooldown).toFixed(2)}${t('stat.perSecond')}`]);
    out.push([t('stat.dps'), `${Math.round((lvl.damage * (lvl.salvo ?? 1)) / lvl.cooldown)}`]);
  }
  out.push([t('stat.range'), tiles(lvl.range) + (lvl.minRange ? ` (min ${tiles(lvl.minRange)})` : '')]);
  if (lvl.splash) out.push([t('stat.splash'), tiles(lvl.splash)]);
  if (lvl.armorPierce) out.push([t('stat.pierce'), `${Math.round(lvl.armorPierce * 100)} %`]);
  if (lvl.bonusVsAir) out.push([t('stat.bonusAir'), `× ${lvl.bonusVsAir}`]);
  if (lvl.crit) out.push([t('stat.crit'), `${Math.round(lvl.crit.chance * 100)} % × ${lvl.crit.multiplier}`]);
  if (lvl.status?.slow) out.push([t('stat.slow'), `${Math.round((1 - lvl.status.slow.factor) * 100)} %`]);
  if (lvl.status?.burn)
    out.push([
      t('stat.burn'),
      `${lvl.status.burn.dps}${t('stat.perSecond')} · ${lvl.status.burn.duration} s`,
    ]);
  if (lvl.status?.shred) out.push([t('stat.shred'), `${Math.round(lvl.status.shred.amount * 100)} %`]);
  if (lvl.status?.stun) out.push([t('stat.stun'), `${lvl.status.stun.duration} s`]);
  out.push([
    tk('dmg.' + lvl.damageType),
    lvl.targetsAir && lvl.targetsGround
      ? t('stat.both')
      : lvl.targetsAir
        ? t('stat.airOnly')
        : t('stat.groundOnly'),
  ]);
  return out;
}

function renderTable(list: HTMLElement): void {
  const wrap = el('div', { class: 'table-wrap' });
  wrap.appendChild(el('p', { class: 'intro', text: t('codex.tableIntro') }));
  const table = el('table', { class: 'spec-table' });
  const head = el('tr', {});
  for (const h of [
    t('codex.tower'),
    t('codex.level1'),
    t('codex.level2'),
    t('codex.level3'),
    t('codex.branchAShort'),
    t('codex.branchBShort'),
  ]) {
    head.appendChild(el('th', { text: h, scope: 'col' }));
  }
  table.appendChild(el('thead', {}, head));
  const body = el('tbody', {});
  for (const def of TOWERS) {
    const row = el('tr', {});
    row.appendChild(
      el(
        'th',
        { scope: 'row' },
        towerIcon(def.id, 1, -1, 40),
        el('div', { class: 'tname', text: L(def.levels[0].name) }),
        el('div', { class: 'trole', text: `${L(def.role)} · ${tk('attack.' + def.levels[0].attack)}` }),
      ),
    );
    for (const lvl of [...def.levels, ...def.branches]) {
      const cell = el('td', {});
      cell.appendChild(el('div', { class: 'lname', text: L(lvl.name) }));
      cell.appendChild(el('div', { class: 'year', text: `${tk('era.' + lvl.era)} · ${lvl.year}` }));
      const specs = el('div', { class: 'specs' });
      for (const [k, v] of specLines(lvl)) {
        specs.appendChild(
          el(
            'div',
            { class: 'spec' },
            el('span', { class: 'k', text: k }),
            el('span', { class: 'v', text: v }),
          ),
        );
      }
      cell.appendChild(specs);
      row.appendChild(cell);
    }
    body.appendChild(row);
  }
  table.appendChild(body);
  wrap.appendChild(table);
  list.appendChild(wrap);
}

function renderEnemies(list: HTMLElement): void {
  for (const def of ENEMIES) {
    const badges = el('div', {});
    if (def.boss) badges.appendChild(el('span', { class: 'badge locked', text: t('stat.boss') }));
    if (def.flying) badges.appendChild(el('span', { class: 'badge', text: t('stat.flying') }));
    if (def.stealth) badges.appendChild(el('span', { class: 'badge', text: t('stat.stealth') }));
    if (def.shield)
      badges.appendChild(el('span', { class: 'badge', text: `${t('stat.shield')} ${def.shield.amount}` }));
    const statList = el('div', { class: 'stat-list' });
    const row = (k: string, v: string) => {
      statList.appendChild(el('span', { class: 'k', text: k }));
      statList.appendChild(el('span', { class: 'v', text: v }));
    };
    row(t('stat.hp'), `${def.hp}`);
    row(t('stat.speed'), `${def.speed}`);
    row(t('stat.armor'), `${Math.round(def.armor * 100)} %`);
    row(t('stat.reward'), `${def.reward}`);
    row(t('stat.livesDamage'), `${def.livesDamage}`);
    list.appendChild(
      el(
        'div',
        { class: 'codex-card' },
        el(
          'div',
          { class: 'head' },
          enemyIcon(def.id, 64),
          el(
            'div',
            {},
            el('div', { class: 'name', text: L(def.name) }),
            el('div', { class: 'era', text: `${tk('era.' + def.era)} · ${def.year}` }),
            badges,
          ),
        ),
        el('div', { class: 'description', text: L(def.description) }),
        statList,
        el('div', { class: 'lore', text: L(def.lore) }),
      ),
    );
  }
}

function renderMaps(list: HTMLElement, progress: Progress): void {
  for (const map of [...MAPS].sort((a, b) => a.order - b.order)) {
    const mp = mapProgress(progress, map.id);
    const preview = mapPreview(map, 300);
    preview.style.width = '100%';
    preview.style.height = 'auto';
    preview.style.borderRadius = '6px';
    list.appendChild(
      el(
        'div',
        { class: 'codex-card' },
        preview,
        el('div', { class: 'name', text: `${map.order}. ${L(map.name)}` }),
        el('div', { class: 'era', text: L(map.subtitle) }),
        stars(mp.stars),
        el('div', { class: 'lore', text: L(map.lore) }),
      ),
    );
  }
}
