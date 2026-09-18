import { MAP_BY_ID } from '@/data/maps';
import type { Progress, SavedGame } from '@/meta/storage';
import { MAX_STARS, totalStars } from '@/meta/storage';
import { Grid } from '@/sim/grid';
import { renderTerrain } from '@/render/terrain';
import { theme } from '@/render/theme';
import type { Lang } from '@/sim/types';
import { el } from '../dom';
import { L, getLang, t } from '../i18n';

export interface MenuCallbacks {
  onContinue: () => void;
  onPlay: () => void;
  onCodex: () => void;
  onSettings: () => void;
  onLang: (lang: Lang) => void;
}

export interface Screen {
  element: HTMLElement;
  dispose: () => void;
}

export function menuScreen(progress: Progress, saved: SavedGame | null, cb: MenuCallbacks): Screen {
  const disposers: (() => void)[] = [];
  const bg = el('canvas', { class: 'menu-bg', 'aria-hidden': 'true' }) as HTMLCanvasElement;
  const screen = el('div', { class: 'screen menu' }, bg);

  // Background: the first map, blurred by CSS scaling, as a living backdrop.
  const map = MAP_BY_ID['alesia'];
  if (map) {
    const grid = new Grid(map);
    const terrain = renderTerrain(grid, theme(map.theme), 1);
    const ctx = bg.getContext('2d');
    const fit = () => {
      bg.width = screen.clientWidth || window.innerWidth;
      bg.height = screen.clientHeight || window.innerHeight;
      if (!ctx) return;
      const s = Math.max(bg.width / terrain.width, bg.height / terrain.height);
      ctx.filter = 'blur(3px) saturate(0.8)';
      ctx.drawImage(
        terrain,
        (bg.width - terrain.width * s) / 2,
        (bg.height - terrain.height * s) / 2,
        terrain.width * s,
        terrain.height * s,
      );
      ctx.filter = 'none';
      const g = ctx.createLinearGradient(0, 0, 0, bg.height);
      g.addColorStop(0, 'rgba(13,16,22,0.55)');
      g.addColorStop(1, 'rgba(13,16,22,0.95)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, bg.width, bg.height);
    };
    requestAnimationFrame(fit);
    window.addEventListener('resize', fit);
    disposers.push(() => window.removeEventListener('resize', fit));
  }

  const lang = el(
    'div',
    { class: 'lang-switch', role: 'group', 'aria-label': t('settings.language') },
    el('button', { class: getLang() === 'fr' ? 'active' : '', text: 'FR', onclick: () => cb.onLang('fr') }),
    el('button', { class: getLang() === 'en' ? 'active' : '', text: 'EN', onclick: () => cb.onLang('en') }),
  );

  const buttons = el('div', { class: 'menu-buttons' });
  if (saved) {
    const savedMap = MAP_BY_ID[saved.save.map];
    buttons.appendChild(
      el(
        'button',
        { class: 'primary', onclick: cb.onContinue, dataset: { action: 'continue' } },
        t('menu.continue'),
        el('span', {
          class: 'sub',
          text: t('menu.continueInfo', {
            map: savedMap ? L(savedMap.name) : '?',
            wave: saved.save.waveIndex,
          }),
        }),
      ),
    );
  }
  buttons.appendChild(
    el('button', {
      class: saved ? '' : 'primary',
      text: t('menu.play'),
      onclick: cb.onPlay,
      dataset: { action: 'play' },
    }),
  );
  buttons.appendChild(
    el('button', { text: t('menu.codex'), onclick: cb.onCodex, dataset: { action: 'codex' } }),
  );
  buttons.appendChild(
    el('button', { text: t('menu.settings'), onclick: cb.onSettings, dataset: { action: 'settings' } }),
  );

  const content = el(
    'div',
    { class: 'menu-content' },
    el('h1', { text: t('app.title') }),
    el('p', { class: 'tagline', text: t('app.tagline') }),
    buttons,
    el('div', {
      class: 'menu-stars',
      text: `★ ${t('menu.stars', { stars: totalStars(progress), total: MAX_STARS })}`,
    }),
    el('p', { class: 'menu-footer', text: t('menu.footer') }),
  );
  screen.appendChild(lang);
  screen.appendChild(content);
  return { element: screen, dispose: () => disposers.forEach((d) => d()) };
}
