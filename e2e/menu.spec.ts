import { expect, test, type Page } from '@playwright/test';

const SHEET = '[data-sheet][aria-label$="details"]';
const C1 = 'concordia-1-6900';
const SEECS = 'seecs-ug-block-0148';
const SIZES = [
  { name: '360x640', width: 360, height: 640 },
  { name: '390x844', width: 390, height: 844 },
  { name: '844x390', width: 844, height: 390 },
];

// The first-visit tip overlay can sit on top of the card handle in the short layouts; mark it as seen
// with the same flag the app sets when the tips are done (no app code involved).
test.beforeEach(async ({ context }) => {
  await context.addInitScript(() => {
    try {
      localStorage.setItem('nw-onboarded', '1');
    } catch {
      /* ignore */
    }
  });
});

async function openCard(page: Page, id: string) {
  await page.goto(`/?place=${id}`);
  await expect(page.locator(SHEET)).toBeVisible({ timeout: 30_000 });
  await expect(page.locator(SHEET)).toHaveAttribute('aria-hidden', 'false', { timeout: 30_000 });
}

/** Drag the sheet handle: peek -> half is a tap, full is a drag up. */
async function snapTo(page: Page, snap: 'peek' | 'half' | 'full') {
  const handle = page.locator(SHEET).locator('[data-handle]');
  const box = (await handle.boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  if (snap === 'peek') return;
  if (snap === 'half') {
    await page.mouse.click(x, y);
  } else {
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x, 40, { steps: 12 });
    await page.mouse.up();
  }
  await page.waitForTimeout(700);
}

for (const size of SIZES) {
  test.describe(`cafe menu ${size.name}`, () => {
    test.use({ viewport: { width: size.width, height: size.height }, hasTouch: true });

    test('C1 shows pill, chips, rows, sticky headers and search', async ({ page }) => {
      await openCard(page, C1);
      const sheet = page.locator(SHEET);
      await expect(sheet.getByText(/^Menu · 216 items$/)).toBeVisible();
      await snapTo(page, 'half');
      await expect(sheet.getByRole('tab').first()).toBeVisible();
      await expect(sheet.getByText('Chicken Tikka Piece')).toBeVisible();
      // short screens keep half height for chips + rows; search joins at full height
      const search = sheet.getByRole('searchbox', { name: 'Search the menu' });
      if (size.height >= 700) await expect(search).toBeVisible();
      else await expect(search).toHaveCount(0);
      await expect(sheet.getByText(/^Menu updated \d/)).toHaveCount(1);

      // chip jump scrolls to its section
      await snapTo(page, 'full');
      await expect(search).toBeVisible();
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

      // search filters
      await sheet.getByRole('searchbox').fill('oreo');
      await expect(sheet.getByText(/Oreo/i).first()).toBeVisible();
      await expect(sheet.getByText('Chicken Tikka Piece')).toHaveCount(0);
      await sheet.getByRole('searchbox').fill('zzzzqq');
      await expect(sheet.getByText(/No items match/)).toBeVisible();
    });

    test('touch targets and text sizes', async ({ page }) => {
      await openCard(page, C1);
      await snapTo(page, 'full');
      const sheet = page.locator(SHEET);
      const chip = sheet.getByRole('tab').first();
      const b = (await chip.boundingBox())!;
      expect(b.height + 8).toBeGreaterThanOrEqual(44); // 36 px + 4 px hit-area on each side
      const sizes = await sheet
        .locator('.menu-name, .menu-desc, .menu-cat, .menu-chip, .menu-updated')
        .evaluateAll((els) => els.map((e) => parseFloat(getComputedStyle(e).fontSize)));
      expect(Math.min(...sizes)).toBeGreaterThanOrEqual(14);
      const price = await sheet
        .locator('.menu-price')
        .first()
        .evaluate((e) => parseFloat(getComputedStyle(e).fontSize));
      expect(price).toBeGreaterThanOrEqual(15);
    });
  });
}

test.describe('visual regression (390x844)', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });
  for (const snap of ['peek', 'half', 'full'] as const) {
    test(`menu ${snap}`, async ({ page }) => {
      await openCard(page, C1);
      await snapTo(page, snap);
      // hide the WebGL map so only the card is compared; clip to the part of the card on screen
      await page.addStyleTag({
        content: '*{caret-color:transparent!important} canvas{visibility:hidden!important}',
      });
      await page.waitForTimeout(300);
      const box = (await page.locator(SHEET).boundingBox())!;
      const vp = page.viewportSize()!;
      const y = Math.max(0, Math.round(box.y));
      await expect(page).toHaveScreenshot(`menu-${snap}.png`, {
        clip: { x: 0, y, width: vp.width, height: vp.height - y },
      });
    });
  }
});

test.describe('other cards', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });
  test('a place that is not a cafe has no menu', async ({ page }) => {
    await openCard(page, SEECS);
    await snapTo(page, 'half');
    await expect(page.locator(SHEET).locator('.menu')).toHaveCount(0);
  });
  test('a cafe without menu data says "Menu coming soon" and nothing else', async ({ page }) => {
    await openCard(page, 'central-library-cafe-3305');
    await snapTo(page, 'half');
    const menu = page.locator(SHEET).locator('.menu');
    await expect(menu).toHaveText('Menu coming soon');
    await expect(menu.locator('.menu-chip, .menu-row, .menu-search')).toHaveCount(0);
    await expect(page.locator(SHEET).getByText(/^Menu · /)).toHaveCount(0);
  });
});
