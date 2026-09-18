import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

interface Hook {
  app: {
    session: {
      world: {
        gold: number;
        lives: number;
        waveIndex: number;
        phase: string;
        towers: { id: number; level: number }[];
        enemies: unknown[];
        stats: { kills: number };
        build: (id: string, c: number, r: number) => { id: number } | null;
        upgrade: (id: number, branch: 0 | 1) => boolean;
        callNextWave: () => boolean;
        isOver: boolean;
      };
      setSpeed: (i: number) => void;
      pickBuild: (id: string | null) => void;
      handleTileClick: (c: number, r: number, keep: boolean) => void;
      select: (id: number) => void;
      view: { buildDefId: string | null; selectedTowerId: number };
    } | null;
  };
}

// Inside page.evaluate callbacks the debug hook is read straight from `window`
// (the callback runs in the browser, so no Node-side helper can be referenced).
async function startFirstMap(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByRole('button', { name: /Campagne/ }).click();
  await expect(page.locator('.map-card').first()).toBeVisible();
  await page.locator('button[data-action="start"]').click();
  await expect(page.locator('.field canvas')).toBeVisible();
}

test.describe('Gamelle Defense', () => {
  test('shows the main menu in French with the campaign entry', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('h1')).toHaveText('Gamelle Defense');
    await expect(page.getByRole('button', { name: /Campagne/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Encyclopédie/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Réglages/ })).toBeVisible();
    await page.getByRole('button', { name: /Comment jouer/ }).click();
    await expect(page.locator('.modal h2')).toHaveText('Comment jouer');
    await page.keyboard.press('Escape');
    await expect(page.locator('.modal')).toHaveCount(0);
  });

  test('switches language to English', async ({ page }) => {
    await page.goto('/');
    await page.locator('.lang-switch button', { hasText: 'EN' }).click();
    await expect(page.getByRole('button', { name: /Campaign/ })).toBeVisible();
    await page.locator('.lang-switch button', { hasText: 'FR' }).click();
    await expect(page.getByRole('button', { name: /Campagne/ })).toBeVisible();
  });

  test('only the first map is unlocked at the start', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /Campagne/ }).click();
    const cards = page.locator('.map-card');
    await expect(cards).toHaveCount(6);
    await expect(cards.nth(0)).toBeEnabled();
    await expect(cards.nth(1)).toBeDisabled();
    await expect(page.locator('.map-detail h3')).toContainText('Thermopyles');
  });

  test('builds a tower by clicking the build card then the field, and starts a wave', async ({ page }) => {
    await startFirstMap(page);
    const gold = page.locator('.stat.gold .value');
    await expect(gold).toHaveText('320');
    await page.locator('.tower-card[data-tower="archers"]').click();
    await expect(page.locator('.tower-card[data-tower="archers"]')).toHaveClass(/active/);
    // Place the tower through the input handler on a known buildable tile.
    await page.evaluate(() =>
      (window as unknown as { __gamelle: Hook }).__gamelle.app.session!.handleTileClick(3, 5, false),
    );
    await expect(gold).toHaveText('250');
    await expect
      .poll(() =>
        page.evaluate(
          () => (window as unknown as { __gamelle: Hook }).__gamelle.app.session!.world.towers.length,
        ),
      )
      .toBe(1);
    // Selecting the tower opens its panel with upgrade information.
    await page.evaluate(() =>
      (window as unknown as { __gamelle: Hook }).__gamelle.app.session!.handleTileClick(3, 5, false),
    );
    await expect(page.locator('.selected-panel')).toBeVisible();
    await expect(page.locator('.selected-panel .name')).toHaveText('Archers');
    await expect(page.locator('.upgrade-box .title')).toContainText('Arbalétriers');
    // Start the first wave.
    await page.getByRole('button', { name: /Lancer la vague/ }).click();
    await expect(page.locator('.stat.wave .value')).toHaveText('Vague 1 / 30');
    await expect
      .poll(
        () =>
          page.evaluate(
            () => (window as unknown as { __gamelle: Hook }).__gamelle.app.session!.world.enemies.length,
          ),
        { timeout: 15_000 },
      )
      .toBeGreaterThan(0);
  });

  test('a strong defence clears the first wave and awards gold', async ({ page }) => {
    await startFirstMap(page);
    await page.evaluate(() => {
      const s = (window as unknown as { __gamelle: Hook }).__gamelle.app.session!;
      s.world.gold = 5000;
      for (const [c, r] of [
        [1, 5],
        [2, 5],
        [3, 5],
        [1, 7],
        [2, 7],
        [3, 7],
        [5, 4],
        [5, 5],
        [8, 4],
        [8, 7],
      ] as [number, number][]) {
        s.world.build(c % 2 ? 'ballista' : 'archers', c, r);
      }
      s.setSpeed(2);
      s.world.callNextWave();
    });
    await expect(page.locator('.toast', { hasText: /Vague 1 repoussée/ })).toBeVisible({ timeout: 90_000 });
    const lives = await page.locator('.stat.lives .value').textContent();
    expect(lives).toBe('20');
    const kills = await page.evaluate(
      () => (window as unknown as { __gamelle: Hook }).__gamelle.app.session!.world.stats.kills,
    );
    expect(kills).toBeGreaterThan(5);
  });

  test('losing every life shows the defeat screen', async ({ page }) => {
    await startFirstMap(page);
    await page.evaluate(() => {
      const s = (window as unknown as { __gamelle: Hook }).__gamelle.app.session!;
      s.world.lives = 1;
      s.setSpeed(2);
      s.world.callNextWave();
    });
    await expect(page.locator('.modal h2.defeat')).toHaveText('Défaite', { timeout: 90_000 });
    await page.locator('button[data-action="maps"]').click();
    await expect(page.locator('.map-grid')).toBeVisible();
  });

  test('winning records stars and unlocks the next map', async ({ page }) => {
    await startFirstMap(page);
    await page.evaluate(() => {
      const s = (window as unknown as { __gamelle: Hook }).__gamelle.app.session!;
      const w = s.world;
      // Jump to the last wave with an overwhelming defence.
      w.gold = 99999;
      w.waveIndex = 29;
      const spots: [number, number][] = [];
      for (let c = 0; c < 20; c++) for (let r = 2; r < 10; r++) spots.push([c, r]);
      let n = 0;
      for (const [c, r] of spots) {
        if (n > 40) break;
        const t = w.build(n % 3 === 0 ? 'ballista' : 'archers', c, r);
        if (t) {
          n++;
          w.upgrade(t.id, 0);
          w.upgrade(t.id, 0);
          w.upgrade(t.id, 0);
        }
      }
      s.setSpeed(2);
      w.callNextWave();
    });
    await expect(page.locator('.modal h2', { hasText: 'Victoire' })).toBeVisible({ timeout: 110_000 });
    await expect(page.locator('.modal .unlocked')).toContainText('Alésia');
    await page.locator('button[data-action="maps"]').click();
    const cards = page.locator('.map-card');
    await expect(cards.nth(1)).toBeEnabled();
    await expect(cards.nth(0).locator('.stars .on')).toHaveCount(2);
  });

  test('pausing, quitting and resuming keeps the saved game', async ({ page }) => {
    await startFirstMap(page);
    await page.evaluate(() => {
      const s = (window as unknown as { __gamelle: Hook }).__gamelle.app.session!;
      s.world.build('archers', 3, 5);
      s.world.callNextWave();
    });
    await page.waitForTimeout(1500);
    await page.getByRole('button', { name: 'Pause' }).click();
    await expect(page.locator('.modal h2')).toHaveText('Pause');
    await page.locator('button[data-action="quit"]').click();
    await expect(page.locator('button[data-action="continue"]')).toBeVisible();
    await page.locator('button[data-action="continue"]').click();
    await expect(page.locator('.field canvas')).toBeVisible();
    const towers = await page.evaluate(
      () => (window as unknown as { __gamelle: Hook }).__gamelle.app.session!.world.towers.length,
    );
    expect(towers).toBe(1);
    await expect(page.locator('.stat.wave .value')).toHaveText('Vague 1 / 30');
  });

  test('the encyclopedia lists towers, enemies and battlefields', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /Encyclopédie/ }).click();
    await expect(page.locator('.codex-card')).toHaveCount(9);
    await page.locator('button[data-tab="enemies"]').click();
    await expect(page.locator('.codex-card')).toHaveCount(16);
    await page.locator('button[data-tab="maps"]').click();
    await expect(page.locator('.codex-card')).toHaveCount(6);
  });

  test('keyboard shortcuts pick towers and change speed', async ({ page }) => {
    await startFirstMap(page);
    await page.locator('.field canvas').focus();
    await page.keyboard.press('2');
    await expect(page.locator('.tower-card[data-tower="ballista"]')).toHaveClass(/active/);
    await page.keyboard.press('Escape');
    await expect(page.locator('.tower-card[data-tower="ballista"]')).not.toHaveClass(/active/);
    await page.keyboard.press('+');
    await expect(page.locator('.speed button').nth(1)).toHaveClass(/active/);
  });
});
