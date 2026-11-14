import { expect, test } from '@playwright/test';

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

test.describe('Razi and Rehmat hostels (390x844)', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  for (const q of ['rehmat', 'rahmat', 'razi', 'razi 1']) {
    test(`search "${q}" lands on Razi Hostel Area`, async ({ page }) => {
      await page.goto('/');
      await page.getByRole('button', { name: 'Search NUST' }).click();
      await page.getByRole('combobox', { name: 'Search places' }).fill(q);
      const option = page.getByRole('option').first();
      await expect(option).toContainText('Razi Hostel Area', { timeout: 30_000 });
      await option.click();
      const sheet = page.locator(SHEET);
      await expect(sheet).toHaveAttribute('aria-hidden', 'false', { timeout: 30_000 });
      await expect(sheet.getByRole('heading', { name: 'Razi Hostel Area' })).toBeVisible();
    });
  }

  test('card: Hostels, 4 (estimated) floors, approximate entrance, photo placeholder', async ({
    page,
  }) => {
    await page.goto('/?place=prov-razi-hostel');
    const sheet = page.locator(SHEET);
    await expect(sheet).toHaveAttribute('aria-hidden', 'false', { timeout: 30_000 });
    await expect(sheet.getByText(/^Hostels · 4 floors \(est\.\)/)).toBeVisible();
    const h = (await sheet.locator('[data-handle]').boundingBox())!;
    await page.mouse.click(h.x + h.width / 2, h.y + h.height / 2);
    await expect(sheet.getByText('4 (estimated)')).toBeVisible();
    await expect(sheet.getByText('Approximate, unverified')).toBeVisible();
    await expect(sheet.locator('[data-photo-slot]')).toContainText('No photo yet');
    await expect(sheet.locator('[data-photo-slot] img')).toHaveCount(0);
  });
});
