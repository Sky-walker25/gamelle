import { ENEMIES } from '@/data/enemies';
import { renderTerrain } from '@/render/terrain';
import { theme } from '@/render/theme';
import { Grid, TILE } from '@/sim/grid';
import type { MapDef, ThemeId } from '@/sim/types';
import { clear, el } from '../dom';
import type { EditorState, EditorTool, TerrainTool } from '../editor/model';
import {
  EDITOR_LIMITS,
  addPath,
  addWaypoint,
  newEditorState,
  paint,
  parseImportedMap,
  removeLastWaypoint,
  removePath,
  resize,
  setOpen,
  toMapDef,
  toggleRoster,
  validate,
} from '../editor/model';
import { L, t, tk } from '../i18n';

export interface EditorCallbacks {
  onBack: () => void;
  onSave: (map: MapDef) => void;
  onTest: (map: MapDef) => void;
  toast: (text: string) => void;
}

const THEMES: ThemeId[] = ['sunny', 'green', 'dusk', 'rain', 'night', 'snow'];
const TOOL_COLORS: Record<TerrainTool, string> = {
  '.': '#7aa54f',
  '#': '#8c8c82',
  T: '#3e7a34',
  '~': '#3f7fa8',
  x: '#b9b5a6',
  S: '#e3b53c',
  H: '#b2332f',
};
const PATH_COLORS = ['#ffd84a', '#6fc3ff', '#ff8d86', '#bff0bf', '#e0a8ff', '#ffc98a'];

/** Full-screen map editor. Renders the real terrain so what you paint is what you play. */
export function editorScreen(
  initial: EditorState | null,
  cb: EditorCallbacks,
): { element: HTMLElement; getState: () => EditorState } {
  let state = initial ?? newEditorState();
  let tool: EditorTool = state.open ? 'S' : 'path';
  let pathIndex = 0;
  let hover: [number, number] | null = null;
  let painting = false;
  let terrainCache: { key: string; canvas: HTMLCanvasElement } | null = null;

  const canvas = el('canvas', {
    class: 'editor-canvas',
    tabindex: '0',
    'aria-label': t('editor.title'),
  }) as HTMLCanvasElement;
  const canvasWrap = el('div', { class: 'editor-canvas-wrap' }, canvas);
  const panel = el('div', { class: 'editor-panel' });
  const errorsBox = el('div', { class: 'editor-errors' });
  const screen = el(
    'div',
    { class: 'screen editor' },
    el(
      'div',
      { class: 'screen-header' },
      el('button', {
        text: `← ${t('editor.back')}`,
        dataset: { action: 'back' },
        onclick: () => cb.onBack(),
      }),
      el('h2', { text: t('editor.title') }),
      el('button', { text: t('editor.save'), dataset: { action: 'save' }, onclick: () => save() }),
      el('button', {
        class: 'primary',
        text: t('editor.test'),
        dataset: { action: 'test' },
        onclick: () => test(),
      }),
    ),
    el('div', { class: 'editor-body' }, canvasWrap, panel),
  );

  // ------------------------------------------------------------------
  // Rendering
  // ------------------------------------------------------------------

  function scale(): number {
    const rect = canvasWrap.getBoundingClientRect();
    const w = Math.max(320, rect.width - 8);
    const h = Math.max(240, rect.height - 8);
    return Math.min(w / (state.cols * TILE), h / (state.rows * TILE), 1);
  }

  function terrainCanvas(): HTMLCanvasElement | null {
    const def = toMapDef(state);
    const key = JSON.stringify([def.terrain, def.paths, def.open, def.theme, def.cols, def.rows]);
    if (terrainCache && terrainCache.key === key) return terrainCache.canvas;
    try {
      const grid = new Grid(def);
      const c = renderTerrain(grid, theme(def.theme), 1);
      terrainCache = { key, canvas: c };
      return c;
    } catch {
      return null;
    }
  }

  function draw(): void {
    const s = scale();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cssW = state.cols * TILE * s;
    const cssH = state.rows * TILE * s;
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    canvas.style.width = `${cssW}px`;
    canvas.style.height = `${cssH}px`;
    canvas.dataset['cols'] = String(state.cols);
    canvas.dataset['rows'] = String(state.rows);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr * s, 0, 0, dpr * s, 0, 0);
    const terrain = terrainCanvas();
    if (terrain) ctx.drawImage(terrain, 0, 0);
    else {
      // Fallback when the map is temporarily invalid: flat colours per tile.
      for (let r = 0; r < state.rows; r++) {
        for (let c = 0; c < state.cols; c++) {
          const ch = (state.terrain[r]?.[c] ?? '.') as TerrainTool;
          ctx.fillStyle = TOOL_COLORS[ch] ?? '#555';
          ctx.fillRect(c * TILE, r * TILE, TILE, TILE);
        }
      }
    }
    // Grid lines.
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 1;
    for (let c = 0; c <= state.cols; c++) {
      ctx.beginPath();
      ctx.moveTo(c * TILE, 0);
      ctx.lineTo(c * TILE, state.rows * TILE);
      ctx.stroke();
    }
    for (let r = 0; r <= state.rows; r++) {
      ctx.beginPath();
      ctx.moveTo(0, r * TILE);
      ctx.lineTo(state.cols * TILE, r * TILE);
      ctx.stroke();
    }
    // Paths: polylines and numbered waypoints.
    if (!state.open) {
      state.paths.forEach((p, i) => {
        const color = PATH_COLORS[i % PATH_COLORS.length] as string;
        const active = i === pathIndex && tool === 'path';
        ctx.strokeStyle = color;
        ctx.lineWidth = active ? 5 : 3;
        ctx.globalAlpha = active ? 0.9 : 0.5;
        ctx.setLineDash(active ? [] : [10, 8]);
        ctx.beginPath();
        p.waypoints.forEach(([c, r], k) => {
          const x = (c + 0.5) * TILE;
          const y = (r + 0.5) * TILE;
          if (k === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
        p.waypoints.forEach(([c, r], k) => {
          const x = (c + 0.5) * TILE;
          const y = (r + 0.5) * TILE;
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(x, y, 11, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#1c1c1c';
          ctx.font = '700 13px system-ui, sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(String(k + 1), x, y);
        });
      });
    }
    // Hover.
    if (hover) {
      const [c, r] = hover;
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.fillRect(c * TILE, r * TILE, TILE, TILE);
      ctx.strokeStyle = 'rgba(255,255,255,0.8)';
      ctx.lineWidth = 2;
      ctx.strokeRect(c * TILE + 1, r * TILE + 1, TILE - 2, TILE - 2);
    }
  }

  // ------------------------------------------------------------------
  // State updates
  // ------------------------------------------------------------------

  function update(next: EditorState, rebuildPanel = false): void {
    state = next;
    if (pathIndex >= state.paths.length) pathIndex = Math.max(0, state.paths.length - 1);
    draw();
    renderErrors();
    if (rebuildPanel) renderPanel();
    else refreshPathList();
  }

  function renderErrors(): void {
    clear(errorsBox);
    const errors = validate(state);
    if (errors.length === 0) {
      errorsBox.style.display = 'none';
      return;
    }
    errorsBox.style.display = '';
    errorsBox.appendChild(el('div', { class: 'label', text: t('editor.errors') }));
    for (const e of errors) errorsBox.appendChild(el('div', { class: 'err', text: t(e) }));
  }

  function tileAt(ev: PointerEvent): [number, number] | null {
    const rect = canvas.getBoundingClientRect();
    const s = rect.width / (state.cols * TILE);
    const c = Math.floor((ev.clientX - rect.left) / (TILE * s));
    const r = Math.floor((ev.clientY - rect.top) / (TILE * s));
    if (c < 0 || r < 0 || c >= state.cols || r >= state.rows) return null;
    return [c, r];
  }

  function applyTool(c: number, r: number): void {
    if (tool === 'path') update(addWaypoint(state, pathIndex, c, r));
    else update(paint(state, c, r, tool));
  }

  canvas.addEventListener('pointerdown', (ev) => {
    canvas.focus();
    const tile = tileAt(ev);
    if (!tile) return;
    if (ev.button === 2) {
      if (tool === 'path') update(removeLastWaypoint(state, pathIndex));
      return;
    }
    painting = tool !== 'path';
    applyTool(tile[0], tile[1]);
  });
  canvas.addEventListener('pointermove', (ev) => {
    const tile = tileAt(ev);
    hover = tile;
    if (painting && tile) applyTool(tile[0], tile[1]);
    else draw();
  });
  canvas.addEventListener('pointerup', () => (painting = false));
  canvas.addEventListener('pointerleave', () => {
    painting = false;
    hover = null;
    draw();
  });
  canvas.addEventListener('contextmenu', (ev) => ev.preventDefault());
  canvas.addEventListener('keydown', (ev) => {
    if (ev.key === 'Backspace' && tool === 'path') {
      update(removeLastWaypoint(state, pathIndex));
      ev.preventDefault();
    }
  });

  // ------------------------------------------------------------------
  // Panel
  // ------------------------------------------------------------------

  let pathList: HTMLElement = el('div', { class: 'path-list' });

  function refreshPathList(): void {
    clear(pathList);
    if (state.open) return;
    state.paths.forEach((p, i) => {
      pathList.appendChild(
        el('button', {
          class: 'path-chip' + (i === pathIndex ? ' active' : ''),
          style: { borderColor: PATH_COLORS[i % PATH_COLORS.length] as string },
          text: `${t('editor.tool.path').split(' ')[0]} ${i + 1} · ${p.waypoints.length}`,
          onclick: () => {
            pathIndex = i;
            tool = 'path';
            renderPanel();
            draw();
          },
        }),
      );
    });
  }

  function field(label: string, control: HTMLElement): HTMLElement {
    return el('label', { class: 'editor-field' }, el('span', { class: 'label', text: label }), control);
  }

  /** `max` may be Infinity, in which case the field is left unbounded. */
  function numberInput(
    value: number,
    min: number,
    max: number,
    step: number,
    onChange: (v: number) => void,
    id: string,
  ): HTMLInputElement {
    const bounded = Number.isFinite(max);
    return el('input', {
      type: 'number',
      id,
      value: String(value),
      min: String(min),
      max: bounded ? String(max) : false,
      step: String(step),
      onchange: (e: Event) => {
        const raw = Number((e.target as HTMLInputElement).value);
        if (!Number.isFinite(raw)) return;
        const clamped = Math.max(min, bounded ? Math.min(max, raw) : raw);
        onChange(clamped);
        // Reflect the clamp back into the field so it never shows a refused value.
        (e.target as HTMLInputElement).value = String(Math.round(clamped));
      },
    }) as HTMLInputElement;
  }

  function renderPanel(): void {
    clear(panel);
    // Identity.
    panel.appendChild(
      field(
        t('editor.name'),
        el('input', {
          type: 'text',
          id: 'editor-name',
          value: state.name,
          maxlength: '40',
          dataset: { field: 'name' },
          oninput: (e: Event) => update({ ...state, name: (e.target as HTMLInputElement).value }),
        }),
      ),
    );
    panel.appendChild(
      field(
        t('editor.subtitle'),
        el('input', {
          type: 'text',
          id: 'editor-subtitle',
          value: state.subtitle,
          maxlength: '60',
          oninput: (e: Event) => update({ ...state, subtitle: (e.target as HTMLInputElement).value }),
        }),
      ),
    );
    // Size.
    panel.appendChild(
      el(
        'div',
        { class: 'editor-field' },
        el('span', { class: 'label', text: t('editor.size') }),
        el(
          'div',
          { class: 'row' },
          numberInput(
            state.cols,
            EDITOR_LIMITS.minCols,
            EDITOR_LIMITS.maxCols,
            1,
            (v) => update(resize(state, v, state.rows), true),
            'editor-cols',
          ),
          el('span', { class: 'unit', text: t('editor.cols') }),
          numberInput(
            state.rows,
            EDITOR_LIMITS.minRows,
            EDITOR_LIMITS.maxRows,
            1,
            (v) => update(resize(state, state.cols, v), true),
            'editor-rows',
          ),
          el('span', { class: 'unit', text: t('editor.rows') }),
        ),
      ),
    );
    // Mode.
    const modeGroup = el('div', { class: 'segmented' });
    modeGroup.appendChild(
      el('button', {
        class: !state.open ? 'active' : '',
        text: t('editor.modeFixed'),
        dataset: { mode: 'fixed' },
        onclick: () => {
          tool = 'path';
          update(setOpen(state, false), true);
        },
      }),
    );
    modeGroup.appendChild(
      el('button', {
        class: state.open ? 'active' : '',
        text: t('editor.modeOpen'),
        dataset: { mode: 'open' },
        onclick: () => {
          tool = 'S';
          update(setOpen(state, true), true);
        },
      }),
    );
    panel.appendChild(
      el('div', { class: 'editor-field' }, el('span', { class: 'label', text: t('editor.mode') }), modeGroup),
    );
    // Tools.
    const tools = el('div', { class: 'tool-grid' });
    const toolDefs: { id: EditorTool; label: string }[] = [
      { id: '.', label: t('editor.tool.build') },
      { id: '#', label: t('editor.tool.rock') },
      { id: 'T', label: t('editor.tool.tree') },
      { id: '~', label: t('editor.tool.water') },
      { id: 'x', label: t('editor.tool.ruin') },
    ];
    if (state.open)
      toolDefs.push({ id: 'S', label: t('editor.tool.spawn') }, { id: 'H', label: t('editor.tool.base') });
    else toolDefs.unshift({ id: 'path', label: t('editor.tool.path') });
    for (const td of toolDefs) {
      tools.appendChild(
        el(
          'button',
          {
            class: 'tool-btn' + (tool === td.id ? ' active' : ''),
            dataset: { tool: td.id },
            onclick: () => {
              tool = td.id;
              renderPanel();
              draw();
            },
          },
          el('span', {
            class: 'swatch',
            style: {
              background:
                td.id === 'path'
                  ? PATH_COLORS[pathIndex % PATH_COLORS.length]
                  : TOOL_COLORS[td.id as TerrainTool],
            },
          }),
          td.label,
        ),
      );
    }
    panel.appendChild(
      el('div', { class: 'editor-field' }, el('span', { class: 'label', text: t('editor.tools') }), tools),
    );
    panel.appendChild(
      el('p', { class: 'hint', text: state.open ? t('editor.openHint') : t('editor.pathHint') }),
    );
    // Paths.
    if (!state.open) {
      pathList = el('div', { class: 'path-list' });
      refreshPathList();
      panel.appendChild(
        el(
          'div',
          { class: 'editor-field' },
          el('span', { class: 'label', text: t('editor.paths') }),
          pathList,
          el(
            'div',
            { class: 'row' },
            el('button', {
              text: t('editor.newPath'),
              dataset: { action: 'new-path' },
              onclick: () => {
                const next = addPath(state);
                pathIndex = next.paths.length - 1;
                tool = 'path';
                update(next, true);
              },
            }),
            el('button', {
              text: t('editor.undoWaypoint'),
              onclick: () => update(removeLastWaypoint(state, pathIndex)),
            }),
            el('button', {
              class: 'danger',
              text: t('editor.removePath'),
              onclick: () => {
                const next = removePath(state, pathIndex);
                pathIndex = 0;
                update(next, true);
              },
            }),
          ),
        ),
      );
    }
    // Theme.
    const themeSelect = el('select', {
      id: 'editor-theme',
      onchange: (e: Event) => update({ ...state, theme: (e.target as HTMLSelectElement).value as ThemeId }),
    }) as HTMLSelectElement;
    for (const th of THEMES)
      themeSelect.appendChild(
        el('option', { value: th, text: tk('editor.themes.' + th), selected: th === state.theme }),
      );
    panel.appendChild(field(t('editor.theme'), themeSelect));
    // Economy.
    panel.appendChild(
      el(
        'div',
        { class: 'editor-field' },
        el('span', {
          class: 'label',
          text: `${t('editor.gold')} · ${t('editor.lives')} · ${t('editor.waves')}`,
        }),
        el(
          'div',
          { class: 'row' },
          // Starting gold is deliberately unbounded: the editor is a sandbox.
          numberInput(
            state.startGold,
            0,
            Number.POSITIVE_INFINITY,
            10,
            (v) => update({ ...state, startGold: v }),
            'editor-gold',
          ),
          numberInput(
            state.startLives,
            1,
            200,
            1,
            (v) => update({ ...state, startLives: v }),
            'editor-lives',
          ),
          numberInput(
            state.waveCount,
            EDITOR_LIMITS.minWaves,
            EDITOR_LIMITS.maxWaves,
            1,
            (v) => update({ ...state, waveCount: v }),
            'editor-waves',
          ),
        ),
      ),
    );
    const hpLabel = el('span', { class: 'unit', text: `× ${state.hpScale.toFixed(2)}` });
    panel.appendChild(
      el(
        'div',
        { class: 'editor-field' },
        el('span', { class: 'label', text: t('editor.hpScale') }),
        el(
          'div',
          { class: 'row' },
          el('input', {
            type: 'range',
            id: 'editor-hp',
            min: '0.5',
            max: '2',
            step: '0.05',
            value: String(state.hpScale),
            oninput: (e: Event) => {
              const v = Number((e.target as HTMLInputElement).value);
              hpLabel.textContent = `× ${v.toFixed(2)}`;
              update({ ...state, hpScale: v });
            },
          }),
          hpLabel,
        ),
      ),
    );
    // Roster.
    const roster = el('div', { class: 'roster-grid' });
    for (const def of ENEMIES) {
      if (def.boss) continue;
      const entry = state.roster.find((r) => r.id === def.id);
      const fromInput = el('input', {
        type: 'number',
        min: '1',
        max: String(EDITOR_LIMITS.maxWaves),
        value: String(entry?.from ?? 1),
        disabled: !entry,
        'aria-label': `${L(def.name)} — ${t('editor.roster')}`,
        onchange: (e: Event) =>
          update(toggleRoster(state, def.id, Number((e.target as HTMLInputElement).value))),
      }) as HTMLInputElement;
      roster.appendChild(
        el(
          'label',
          { class: 'roster-row' },
          el('input', {
            type: 'checkbox',
            checked: !!entry,
            onchange: (e: Event) => {
              const on = (e.target as HTMLInputElement).checked;
              fromInput.disabled = !on;
              update(toggleRoster(state, def.id, on ? Number(fromInput.value) || 1 : null));
            },
          }),
          el('span', { class: 'ename', text: L(def.name) }),
          fromInput,
        ),
      );
    }
    panel.appendChild(
      el('div', { class: 'editor-field' }, el('span', { class: 'label', text: t('editor.roster') }), roster),
    );
    // Lore.
    panel.appendChild(
      field(
        t('editor.lore'),
        el('textarea', {
          id: 'editor-lore',
          rows: '3',
          maxlength: '400',
          text: state.lore,
          oninput: (e: Event) => update({ ...state, lore: (e.target as HTMLTextAreaElement).value }),
        }),
      ),
    );
    // Import / export.
    const importBox = el('textarea', {
      id: 'editor-import',
      rows: '3',
      placeholder: t('editor.importHint'),
    }) as HTMLTextAreaElement;
    panel.appendChild(
      el(
        'div',
        { class: 'editor-field' },
        el(
          'div',
          { class: 'row' },
          el('button', {
            text: t('editor.export'),
            onclick: async () => {
              const json = JSON.stringify(toMapDef(state), null, 2);
              importBox.value = json;
              try {
                await navigator.clipboard.writeText(json);
                cb.toast(t('editor.copied'));
              } catch {
                importBox.focus();
                importBox.select();
              }
            },
          }),
          el('button', {
            text: t('editor.import'),
            onclick: () => {
              const parsed = parseImportedMap(importBox.value);
              if (!parsed) {
                cb.toast(t('editor.importError'));
                return;
              }
              pathIndex = 0;
              tool = parsed.open ? 'S' : 'path';
              terrainCache = null;
              update({ ...parsed, id: state.id }, true);
            },
          }),
        ),
        importBox,
      ),
    );
    panel.appendChild(errorsBox);
    renderErrors();
  }

  function save(): boolean {
    const errors = validate(state);
    if (errors.length > 0) {
      renderErrors();
      errorsBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      return false;
    }
    cb.onSave(toMapDef(state));
    cb.toast(t('editor.saved'));
    return true;
  }

  function test(): void {
    if (!save()) return;
    cb.onTest(toMapDef(state));
  }

  renderPanel();
  requestAnimationFrame(() => draw());
  const ro = new ResizeObserver(() => draw());
  ro.observe(canvasWrap);
  return { element: screen, getState: () => state };
}
