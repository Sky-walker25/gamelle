import { ENEMIES } from '@/data/enemies';
import { DEFAULT_TOWERS, MAPS } from '@/data/maps';
import { TOWERS } from '@/data/towers';
import type { Progress } from '@/meta/storage';
import { mapProgress, unlockedTowers } from '@/meta/storage';
import { TILE } from '@/sim/grid';
import { clear, el, stars } from '../dom';
import { L, t, tk } from '../i18n';
import { enemyIcon, mapPreview, towerIcon } from '../icons';

type Tab = 'towers' | 'enemies' | 'maps';

export function codexScreen(progress: Progress, onBack: () => void): HTMLElement {
  let tab: Tab = 'towers';
  const list = el('div', { class: 'codex-list' });
  const tabs = el('div', { class: 'tabs', role: 'tablist' });
  const render = () => {
    clear(list);
    for (const b of tabs.querySelectorAll('button')) b.classList.toggle('active', b.dataset['tab'] === tab);
    if (tab === 'towers') renderTowers(list, progress);
    else if (tab === 'enemies') renderEnemies(list);
    else renderMaps(list, progress);
  };
  for (const id of ['towers', 'enemies', 'maps'] as Tab[]) {
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
