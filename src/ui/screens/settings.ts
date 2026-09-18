import type { Settings } from '@/meta/storage';
import type { Lang } from '@/sim/types';
import { el } from '../dom';
import { t } from '../i18n';

export interface SettingsCallbacks {
  onChange: (settings: Settings) => void;
  onReset: () => void;
  onClose: () => void;
}

export function settingsContent(settings: Settings, cb: SettingsCallbacks): HTMLElement {
  const current = { ...settings };
  const emit = () => cb.onChange({ ...current });

  const slider = (label: string, key: 'master' | 'sfx' | 'music') =>
    el(
      'div',
      { class: 'setting-row' },
      el('label', { text: label, for: `setting-${key}` }),
      el('input', {
        type: 'range',
        id: `setting-${key}`,
        min: '0',
        max: '1',
        step: '0.05',
        value: String(current[key]),
        oninput: (e: Event) => {
          current[key] = Number((e.target as HTMLInputElement).value);
          emit();
        },
      }),
    );

  const toggle = (label: string, key: 'reducedMotion' | 'damageNumbers' | 'showRanges') => {
    const group = el('div', { class: 'segmented', role: 'group', 'aria-label': label });
    const render = () => {
      group.replaceChildren(
        el('button', {
          class: current[key] ? 'active' : '',
          text: t('settings.on'),
          onclick: () => {
            current[key] = true;
            emit();
            render();
          },
        }),
        el('button', {
          class: !current[key] ? 'active' : '',
          text: t('settings.off'),
          onclick: () => {
            current[key] = false;
            emit();
            render();
          },
        }),
      );
    };
    render();
    return el('div', { class: 'setting-row' }, el('span', { text: label }), group);
  };

  const langGroup = el('div', { class: 'segmented', role: 'group', 'aria-label': t('settings.language') });
  const renderLang = () => {
    langGroup.replaceChildren(
      ...(['fr', 'en'] as Lang[]).map((l) =>
        el('button', {
          class: current.lang === l ? 'active' : '',
          text: l.toUpperCase(),
          onclick: () => {
            current.lang = l;
            emit();
            renderLang();
          },
        }),
      ),
    );
  };
  renderLang();

  return el(
    'div',
    { style: { display: 'flex', flexDirection: 'column', gap: '14px' } },
    el('h2', { text: t('settings.title') }),
    el('div', { class: 'setting-row' }, el('span', { text: t('settings.language') }), langGroup),
    slider(t('settings.master'), 'master'),
    slider(t('settings.sfx'), 'sfx'),
    slider(t('settings.music'), 'music'),
    toggle(t('settings.reducedMotion'), 'reducedMotion'),
    toggle(t('settings.damageNumbers'), 'damageNumbers'),
    toggle(t('settings.showRanges'), 'showRanges'),
    el(
      'div',
      { class: 'buttons row' },
      el('button', { class: 'danger', text: t('settings.reset'), onclick: cb.onReset }),
      el('button', { class: 'primary', text: t('settings.close'), onclick: cb.onClose }),
    ),
  );
}
