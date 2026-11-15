import { expect, test, type Page } from './fixtures';

/**
 * Rehmat Hostel and Razi 1: template-based copies of the Ghazali 1 / Ghazali 2 footprints (data/hostel-placement.ts).
 * Real clicks only: search, tap the result, then peek / half / full on the card.
 */
const SHEET = '[data-sheet][aria-label$="details"]';
const SHOTS = 'docs/compare/razi-rehmat-ghazali-after';

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

async function snapTo(page: Page, snap: 'half' | 'full') {
  const b = (await page.locator(SHEET).locator('[data-handle]').boundingBox())!;
  const x = b.x + b.width / 2,
    y = b.y + b.height / 2;
  if (snap === 'half') await page.mouse.click(x, y);
  else {
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x, 40, { steps: 12 });
    await page.mouse.up();
  }
  await page.waitForTimeout(700);
}

const CASES = [
  { q: 'rehmat', name: 'Rehmat Hostel' },
  { q: 'rahmat', name: 'Rehmat Hostel' },
  { q: 'razi', name: 'Razi 1' },
  { q: 'razi 1', name: 'Razi 1' },
];

for (const size of [
  { name: '390x844', width: 390, height: 844 },
  { name: '844x390', width: 844, height: 390 },
]) {
  test.describe(`Razi and Rehmat hostels (${size.name})`, () => {
    test.use({ viewport: { width: size.width, height: size.height }, hasTouch: true });

    for (const { q, name } of CASES) {
      test(`search "${q}" opens ${name}: peek, half, full`, async ({ page }) => {
        await page.goto('/');
        await page.getByRole('button', { name: 'Search NUST' }).click();
        await page.getByRole('combobox', { name: 'Search places' }).fill(q);
        const option = page.getByRole('option').first();
        await expect(option).toContainText(name, { timeout: 30_000 });
        await option.click();
        const sheet = page.locator(SHEET);
        await expect(sheet).toHaveAttribute('aria-hidden', 'false', { timeout: 30_000 });
        await expect(sheet.getByRole('heading', { name })).toBeVisible();
        // peek: category, estimated floors, and the honest "approximate shape" note
        await expect(
          sheet.getByText(/Hostels · 4 floors \(est\.\) · approximate shape/),
        ).toBeVisible();
        const shot = q === 'rehmat' || q === 'razi 1';
        if (shot)
          await page.screenshot({ path: `${SHOTS}/${size.name}-${q.replace(' ', '')}-peek.png` });
        await snapTo(page, 'half');
        await expect(sheet.getByText('4 (estimated)')).toBeVisible();
        await expect(sheet.getByText('Approximate, unverified')).toBeVisible();
        await expect(sheet.getByText('Info coming soon').first()).toBeVisible();
        await expect(sheet.locator('[data-photo-slot]')).toContainText('No photo yet');
        await expect(sheet.locator('[data-photo-slot] img')).toHaveCount(0);
        if (shot)
          await page.screenshot({ path: `${SHOTS}/${size.name}-${q.replace(' ', '')}-half.png` });
        await snapTo(page, 'full');
        await expect(sheet.getByRole('heading', { name })).toBeVisible();
        await expect(sheet.getByRole('button', { name: 'Navigate here' })).toBeVisible();
        if (shot)
          await page.screenshot({ path: `${SHOTS}/${size.name}-${q.replace(' ', '')}-full.png` });
      });
    }
  });
}

test.describe('Razi Hostel Area and debug placement (390x844)', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test('the area stays a flat place with no building of its own', async ({ page }) => {
    await page.goto('/?place=prov-razi-hostel');
    const sheet = page.locator(SHEET);
    await expect(sheet).toHaveAttribute('aria-hidden', 'false', { timeout: 30_000 });
    await expect(sheet.getByRole('heading', { name: 'Razi Hostel Area' })).toBeVisible();
    await expect(sheet.getByText(/approximate shape/)).toHaveCount(0);
  });

  test('?debug=1: placement values, template flag and "Copy placement JSON"', async ({ page }) => {
    await page.goto('/?debug=1&place=rehmat-hostel');
    const sheet = page.locator(SHEET);
    await expect(sheet).toHaveAttribute('aria-hidden', 'false', { timeout: 30_000 });
    await snapTo(page, 'full');
    const box = sheet.locator('[data-placement]');
    await expect(box).toContainText('template-based, approximate: Ghazali 1 footprint');
    await expect(box).toContainText('rotation -94°');
    await expect(box).toContainText('inside the area');
    await expect(box.getByRole('button', { name: 'Copy placement JSON' })).toBeVisible();
    // the entrance arrow and its values in the 3D debug layer
    await expect(page.locator('[data-placement-debug="rehmat"]')).toHaveCount(1);
  });
});
