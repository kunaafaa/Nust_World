import { expect, test, type Page } from './fixtures';
import { mkdirSync } from 'node:fs';

const SHEET = '[data-sheet][aria-label$="details"]';
const SHOTS = 'docs/compare/menu';
const SIZES = [
  { name: '360x640', width: 360, height: 640 },
  { name: '390x844', width: 390, height: 844 },
  { name: '844x390', width: 844, height: 390 },
];

test.beforeEach(async ({ context }) => {
  mkdirSync(SHOTS, { recursive: true });
  await context.addInitScript(() => {
    try {
      localStorage.setItem('nw-onboarded', '1');
      sessionStorage.setItem('nw-title', '1');
    } catch {
      /* ignore */
    }
  });
});

async function snapTo(page: Page, snap: 'peek' | 'half' | 'full') {
  const handle = page.locator(SHEET).locator('[data-handle]');
  const b = (await handle.boundingBox())!;
  const x = b.x + b.width / 2;
  const y = b.y + b.height / 2;
  if (snap === 'half') await page.mouse.click(x, y);
  if (snap === 'full') {
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x, 40, { steps: 12 });
    await page.mouse.up();
  }
  await page.waitForTimeout(700);
}

for (const size of SIZES) {
  test.describe(`Retro menu ${size.name}`, () => {
    test.use({ viewport: { width: size.width, height: size.height }, hasTouch: true });

    test('search "retro", open the card, peek / half / full, chip jump, scroll', async ({
      page,
    }) => {
      await page.goto('/');
      await page.getByRole('button', { name: 'Search NUST' }).click();
      await page.getByRole('combobox', { name: 'Search places' }).fill('retro');
      const option = page.getByRole('option').first();
      await expect(option).toContainText('RETRO', { timeout: 30_000 });
      await option.click();
      const sheet = page.locator(SHEET);
      await expect(sheet).toHaveAttribute('aria-hidden', 'false', { timeout: 30_000 });
      await expect(sheet.getByText(/^Menu · 46 items$/)).toBeVisible();
      await page.waitForTimeout(800);

      await page.screenshot({ path: `${SHOTS}/${size.name}-retro-peek.png` });
      await snapTo(page, 'half');
      await expect(sheet.getByRole('tab').first()).toBeVisible();
      await expect(sheet.getByText('Club sandwich')).toBeVisible();
      await page.screenshot({ path: `${SHOTS}/${size.name}-retro-half.png` });

      await snapTo(page, 'full');
      await sheet.getByRole('tab', { name: 'Pizza' }).click();
      await expect
        .poll(
          async () => {
            const top = await sheet
              .locator('[data-cat="Pizza"] h3')
              .evaluate((h) => h.getBoundingClientRect().top);
            const bodyTop = await sheet
              .locator('[data-sheet-body]')
              .evaluate((e) => e.getBoundingClientRect().top);
            return Math.abs(top - bodyTop - 52);
          },
          { timeout: 8000 },
        )
        .toBeLessThan(6);
      await page.screenshot({ path: `${SHOTS}/${size.name}-retro-full-pizza.png` });

      // a later chip jumps further down, and the body really scrolls
      const body = sheet.locator('[data-sheet-body]');
      const before = await body.evaluate((e) => e.scrollTop);
      await sheet.getByRole('tab', { name: 'Bread' }).click();
      await expect.poll(() => body.evaluate((e) => e.scrollTop)).toBeGreaterThan(before);
      await body.evaluate((e) => e.scrollBy(0, 200));
      await expect(sheet.getByText(/^Menu updated \d/)).toHaveCount(1);
      await page.screenshot({ path: `${SHOTS}/${size.name}-retro-full-bread.png` });
    });

    test('works offline after a reload', async ({ page, context }) => {
      await page.goto('/?place=retro-8873');
      const sheet = page.locator(SHEET);
      await expect(sheet.getByText(/^Menu · 46 items$/)).toBeVisible({ timeout: 40_000 });
      await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
      await page.waitForTimeout(6000); // idle warm-up fetches every menu chunk into the cache
      await page.reload();
      await expect(sheet.getByText(/^Menu · 46 items$/)).toBeVisible({ timeout: 40_000 });
      await page.waitForTimeout(3000);
      await context.setOffline(true);
      await page.reload();
      await expect(sheet).toHaveAttribute('aria-hidden', 'false', { timeout: 40_000 });
      await expect(sheet.getByText(/^Menu · 46 items$/)).toBeVisible({ timeout: 20_000 });
      await snapTo(page, 'half');
      await expect(sheet.getByText('Club sandwich')).toBeVisible();
      await page.screenshot({ path: `${SHOTS}/${size.name}-retro-offline.png` });
      await context.setOffline(false);
    });
  });
}
