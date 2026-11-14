import { expect, test, type Page } from '@playwright/test';

const SHEET = '[data-sheet][aria-label$="details"]';

test.beforeEach(async ({ context }) => {
  await context.addInitScript(() => {
    try {
      localStorage.setItem('nw-onboarded', '1');
      sessionStorage.setItem('nw-title', '1');
    } catch {
      /* ignore */
    }
  });
});

async function searchOpen(page: Page, q: string) {
  await page.getByRole('button', { name: 'Search NUST' }).click();
  await page.getByRole('combobox', { name: 'Search places' }).fill(q);
  const option = page.getByRole('option').first();
  await expect(option).toContainText('Coffee Lounge', { timeout: 30_000 });
  await option.click();
}

for (const vp of [
  { width: 390, height: 844 },
  { width: 844, height: 390 },
]) {
  test.describe(`Coffee Lounge point landmark ${vp.width}x${vp.height}`, () => {
    test.use({ viewport: vp, hasTouch: true });

    test('searchable, shows its menu, and its map marker is tappable', async ({ page }) => {
      await page.goto('/');
      await searchOpen(page, 'coffee lounge');
      const sheet = page.locator(SHEET);
      await expect(sheet).toHaveAttribute('aria-hidden', 'false', { timeout: 30_000 });
      await expect(sheet.getByText(/^Menu · 115 items$/)).toBeVisible();
      const h = (await sheet.locator('[data-handle]').boundingBox())!;
      await page.mouse.click(h.x + h.width / 2, h.y + h.height / 2);
      await expect(sheet.getByRole('tab').first()).toBeVisible();

      // close the card, then tap the marker just under its label (labels themselves let taps through)
      await sheet.getByRole('button', { name: 'Close' }).click();
      await expect(sheet).toHaveAttribute('aria-hidden', 'true');
      await page.waitForTimeout(1200);
      const label = page.locator('span', { hasText: /^Coffee Lounge$/ }).filter({ visible: true });
      await expect(label).toHaveCount(1);
      const lb = (await label.locator('..').boundingBox())!;
      let opened = false;
      for (const dy of [4, 8, 12, 16, 22, 28]) {
        await page.mouse.click(lb.x + lb.width / 2, lb.y + lb.height + dy);
        await page.waitForTimeout(500);
        if ((await sheet.getAttribute('aria-hidden')) === 'false') {
          opened = true;
          break;
        }
      }
      expect(opened).toBe(true);
      await expect(sheet.getByText('Coffee Lounge').first()).toBeVisible();
      await expect(sheet.getByText(/^Menu · 115 items$/)).toBeVisible();
      await page.screenshot({
        path: `docs/compare/menu/${vp.width}x${vp.height}-coffee-lounge-tap.png`,
      });
    });
  });
}
