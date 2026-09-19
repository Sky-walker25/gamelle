import { devices, expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

/**
 * Phone-sized runs. These guard the things that made the game unplayable on a
 * phone: the battlefield being squeezed by the panels, tiles too small to hit,
 * and taps that built nothing.
 */
test.use({ ...devices['Pixel 7'] });

interface MobileHook {
  app: {
    session: {
      world: {
        gold: number;
        towers: unknown[];
        grid: { cols: number; rows: number };
        canBuild: (id: string, c: number, r: number) => string | null;
        callNextWave: () => boolean;
      };
      renderer: {
        zoomLevel: number;
        viewScale: number;
        worldToScreen: (x: number, y: number) => { x: number; y: number };
      };
      view: { hoverCol: number; hoverRow: number };
      select: (id: number) => void;
    };
  };
}

async function startGame(page: Page): Promise<void> {
  await page.goto('/');
  await page.tap('button[data-action="play"]');
  await page.tap('button[data-action="start"]');
  await expect(page.locator('.field canvas')).toBeVisible();
  await page.waitForTimeout(600);
}

/** Screen position of the centre of a tile, using the game's own camera. */
async function tilePoint(page: Page, col: number, row: number): Promise<{ x: number; y: number }> {
  return page.evaluate(
    (tile: { c: number; r: number }) => {
      const s = (window as unknown as { __gamelle: MobileHook }).__gamelle.app.session;
      const rect = (document.querySelector('.field canvas') as HTMLElement).getBoundingClientRect();
      const p = s.renderer.worldToScreen((tile.c + 0.5) * 64, (tile.r + 0.5) * 64);
      return { x: rect.left + p.x, y: rect.top + p.y };
    },
    { c: col, r: row },
  );
}

test.describe('Phone ergonomics', () => {
  test('the battlefield takes most of the screen and tiles are big enough to tap', async ({ page }) => {
    await startGame(page);
    const m = await page.evaluate(() => {
      const canvas = (document.querySelector('.field canvas') as HTMLElement).getBoundingClientRect();
      const s = (window as unknown as { __gamelle: MobileHook }).__gamelle.app.session;
      return {
        canvasH: canvas.height,
        viewportH: window.innerHeight,
        tilePx: s.renderer.viewScale * 64,
        pageWidth: document.documentElement.scrollWidth,
        viewportW: window.innerWidth,
      };
    });
    // The map area gets at least two thirds of the height, and no sideways scroll.
    expect(m.canvasH / m.viewportH).toBeGreaterThan(0.65);
    expect(m.pageWidth).toBeLessThanOrEqual(m.viewportW);
    // A tile must be a comfortable touch target.
    expect(m.tilePx).toBeGreaterThanOrEqual(36);
  });

  test('a tap aims and a second tap on Build places the tower', async ({ page }) => {
    await startGame(page);
    await page.evaluate(() => {
      (window as unknown as { __gamelle: MobileHook }).__gamelle.app.session.world.gold = 2000;
    });
    await page.tap('.tower-card[data-tower="archers"]');
    const point = await tilePoint(page, 5, 1);
    await page.touchscreen.tap(point.x, point.y);
    // Aiming shows a confirmation bar and does not build yet.
    await expect(page.locator('.placement-bar.show')).toBeVisible();
    expect(
      await page.evaluate(
        () => (window as unknown as { __gamelle: MobileHook }).__gamelle.app.session.world.towers.length,
      ),
    ).toBe(0);
    const aimed = await page.evaluate(() => {
      const v = (window as unknown as { __gamelle: MobileHook }).__gamelle.app.session.view;
      return [v.hoverCol, v.hoverRow];
    });
    expect(aimed).toEqual([5, 1]);
    await page.tap('button[data-action="confirm-build"]');
    await expect
      .poll(() =>
        page.evaluate(
          () => (window as unknown as { __gamelle: MobileHook }).__gamelle.app.session.world.towers.length,
        ),
      )
      .toBe(1);
    await expect(page.locator('.placement-bar.show')).toBeHidden();
  });

  test('tapping a tower opens the details sheet without shrinking the map', async ({ page }) => {
    await startGame(page);
    const before = await page.evaluate(
      () => (document.querySelector('.field canvas') as HTMLElement).getBoundingClientRect().height,
    );
    await page.evaluate(() => {
      const s = (window as unknown as { __gamelle: MobileHook }).__gamelle.app.session;
      s.world.gold = 2000;
      (s.world as unknown as { build: (id: string, c: number, r: number) => { id: number } }).build(
        'archers',
        5,
        1,
      );
    });
    const point = await tilePoint(page, 5, 1);
    await page.touchscreen.tap(point.x, point.y);
    await expect(page.locator('.selected-panel')).toBeVisible();
    await expect(page.locator('.selected-panel .name')).toHaveText('Archers');
    const after = await page.evaluate(
      () => (document.querySelector('.field canvas') as HTMLElement).getBoundingClientRect().height,
    );
    expect(after).toBe(before);
    await page.tap('.selected-panel .head button');
    await expect(page.locator('.selected-panel .name')).toHaveCount(0);
  });

  test('zoom controls change the camera and reset restores the full map', async ({ page }) => {
    await startGame(page);
    const start = await page.evaluate(
      () => (window as unknown as { __gamelle: MobileHook }).__gamelle.app.session.renderer.zoomLevel,
    );
    await page.tap('.zoom-controls button >> nth=0');
    const zoomed = await page.evaluate(
      () => (window as unknown as { __gamelle: MobileHook }).__gamelle.app.session.renderer.zoomLevel,
    );
    expect(zoomed).toBeGreaterThan(start);
    await page.tap('.zoom-controls .reset');
    const reset = await page.evaluate(
      () => (window as unknown as { __gamelle: MobileHook }).__gamelle.app.session.renderer.zoomLevel,
    );
    expect(reset).toBe(1);
  });

  test('the tower rail scrolls sideways and every control is thumb-sized', async ({ page }) => {
    await startGame(page);
    const sizes = await page.evaluate(() => {
      const small: string[] = [];
      const selectors = ['.tower-card', '.topbar button', '.wave-control button', '.zoom-controls button'];
      for (const selector of selectors) {
        for (const node of document.querySelectorAll(selector)) {
          const r = node.getBoundingClientRect();
          if (r.height < 38 || r.width < 34)
            small.push(`${selector} ${Math.round(r.width)}x${Math.round(r.height)}`);
        }
      }
      const rail = document.querySelector('.build-grid') as HTMLElement;
      return {
        small,
        scrollable: rail.scrollWidth > rail.clientWidth,
        overflowX: getComputedStyle(rail).overflowX,
      };
    });
    expect(sizes.small).toEqual([]);
    expect(sizes.overflowX).toBe('auto');
    expect(sizes.scrollable).toBe(true);
  });

  test('menus and the encyclopedia fit the screen without sideways scrolling', async ({ page }) => {
    await page.goto('/');
    for (const action of ['play', 'codex'] as const) {
      await page.goto('/');
      await page.tap(`button[data-action="${action}"]`);
      await page.waitForTimeout(300);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth + 1,
      );
      expect(overflow, action).toBe(false);
    }
    // The map cards keep their labels readable.
    await page.goto('/');
    await page.tap('button[data-action="play"]');
    const visible = await page.evaluate(() => {
      const card = document.querySelector('.map-card') as HTMLElement;
      const name = card.querySelector('.name') as HTMLElement;
      const cb = card.getBoundingClientRect();
      const nb = name.getBoundingClientRect();
      return nb.top >= cb.top && nb.bottom <= cb.bottom + 1;
    });
    expect(visible).toBe(true);
  });
});
