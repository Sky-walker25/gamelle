import { DIFFICULTY_ORDER } from '@/data/difficulty';
import { MAPS } from '@/data/maps';
import { towerLevelDef } from '@/data/towers';
import type { Progress } from '@/meta/storage';
import { isEndlessUnlocked, isMapUnlocked, mapProgress } from '@/meta/storage';
import type { DifficultyId, GameMode, MapDef } from '@/sim/types';
import { clear, el, stars } from '../dom';
import { L, t, tk } from '../i18n';
import { mapPreview } from '../icons';

export interface MapsCallbacks {
  onBack: () => void;
  onStart: (map: MapDef, difficulty: DifficultyId, mode: GameMode) => void;
}

export function mapsScreen(progress: Progress, cb: MapsCallbacks, initialMap?: string): HTMLElement {
  let selected: MapDef | null = null;
  let difficulty: DifficultyId = 'normal';
  let mode: GameMode = 'classic';
  const cards = new Map<string, HTMLButtonElement>();

  const grid = el('div', { class: 'map-grid' });
  const detail = el('div', { class: 'map-detail', style: { display: 'none' } });

  const renderDetail = () => {
    clear(detail);
    if (!selected) {
      detail.style.display = 'none';
      return;
    }
    const map = selected;
    detail.style.display = '';
    const mp = mapProgress(progress, map.id);
    const endlessOk = isEndlessUnlocked(progress, map.id);
    if (!endlessOk) mode = 'classic';

    const diffGroup = el('div', { class: 'segmented', role: 'group', 'aria-label': t('maps.difficulty') });
    for (const d of DIFFICULTY_ORDER) {
      diffGroup.appendChild(
        el('button', {
          class: d === difficulty ? 'active' : '',
          text: tk('difficulty.' + d),
          title: tk(`difficulty.${d}.desc`),
          dataset: { difficulty: d },
          onclick: () => {
            difficulty = d;
            renderDetail();
          },
        }),
      );
    }
    const modeGroup = el('div', { class: 'segmented', role: 'group', 'aria-label': t('maps.mode') });
    modeGroup.appendChild(
      el('button', {
        class: mode === 'classic' ? 'active' : '',
        text: t('maps.mode.classic', { waves: map.waveCount }),
        dataset: { mode: 'classic' },
        onclick: () => {
          mode = 'classic';
          renderDetail();
        },
      }),
    );
    modeGroup.appendChild(
      el('button', {
        class: mode === 'endless' ? 'active' : '',
        text: t('maps.mode.endless'),
        disabled: !endlessOk,
        title: endlessOk ? '' : t('maps.endlessLocked'),
        dataset: { mode: 'endless' },
        onclick: () => {
          mode = 'endless';
          renderDetail();
        },
      }),
    );
    const unlockNames = map.unlocks.map((id) => L(towerLevelDef(id, 1, -1).name)).join(', ');
    const left = el(
      'div',
      {},
      el('h3', { text: `${L(map.name)} — ${L(map.subtitle)}` }),
      el('p', { class: 'lore', text: L(map.lore) }),
      el(
        'div',
        { class: 'map-options' },
        el(
          'div',
          { class: 'option-group' },
          el('span', { class: 'label', text: t('maps.difficulty') }),
          diffGroup,
        ),
        el('div', { class: 'option-group' }, el('span', { class: 'label', text: t('maps.mode') }), modeGroup),
      ),
      el('p', { class: 'hint', text: tk(`difficulty.${difficulty}.desc`) }),
      el(
        'p',
        { class: 'hint' },
        `${t('maps.gold', { gold: map.startGold })} · ${t('maps.lives', { lives: map.startLives })}` +
          (unlockNames && mp.stars === 0 ? ` · ${t('maps.unlocks', { towers: unlockNames })}` : '') +
          (mp.bestWave > 0 ? ` · ${t('maps.bestWave', { wave: mp.bestWave })}` : '') +
          (map.open ? ` · ${t('maps.openHint')}` : ''),
      ),
    );
    const start = el('button', {
      class: 'primary start',
      text: t('maps.start'),
      dataset: { action: 'start' },
      onclick: () => cb.onStart(map, difficulty, mode),
    });
    detail.appendChild(left);
    detail.appendChild(start);
  };

  for (const map of [...MAPS].sort((a, b) => a.order - b.order)) {
    const unlocked = isMapUnlocked(progress, map.id);
    const mp = mapProgress(progress, map.id);
    const card = el(
      'button',
      {
        class: 'map-card',
        disabled: !unlocked,
        dataset: { map: map.id },
        'aria-label': L(map.name),
        onclick: () => {
          selected = map;
          for (const [id, c] of cards) c.classList.toggle('selected', id === map.id);
          renderDetail();
          detail.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        },
      },
      mapPreview(map, 320),
      el(
        'div',
        { class: 'body' },
        el('div', { class: 'name', text: `${map.order}. ${L(map.name)}` }),
        el('div', { class: 'subtitle', text: L(map.subtitle) }),
        unlocked ? stars(mp.stars) : el('div', { class: 'lock', text: `🔒 ${t('maps.locked')}` }),
      ),
    ) as HTMLButtonElement;
    cards.set(map.id, card);
    grid.appendChild(card);
  }

  const screen = el(
    'div',
    { class: 'screen maps' },
    el(
      'div',
      { class: 'screen-header' },
      el('button', { text: `← ${t('maps.back')}`, onclick: cb.onBack, dataset: { action: 'back' } }),
      el('h2', { text: t('maps.title') }),
    ),
    grid,
    detail,
  );

  const first =
    initialMap && isMapUnlocked(progress, initialMap)
      ? initialMap
      : [...MAPS].sort((a, b) => b.order - a.order).find((m) => isMapUnlocked(progress, m.id))?.id;
  if (first) cards.get(first)?.click();
  return screen;
}
