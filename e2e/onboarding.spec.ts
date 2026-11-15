import { expect, test, type Locator, type Page } from './fixtures';

const TIP = '[data-onboarding]';
const SHEET = '[data-sheet][aria-label$="details"]';
const LAYOUTS = [
  { name: 'portrait 390x844', width: 390, height: 844 },
  { name: 'landscape 844x390', width: 844, height: 390 },
];

// Fresh visitor: no "onboarded" flag, title already seen this session so the map opens straight away.
test.beforeEach(async ({ context }) => {
  await context.addInitScript(() => {
    try {
      sessionStorage.setItem('nw-title', '1');
    } catch {
      /* ignore */
    }
  });
});

const flag = (page: Page) => page.evaluate(() => localStorage.getItem('nw-onboarded'));

async function firstTip(page: Page, url = '/') {
  await page.goto(url);
  const tip = page.locator(TIP);
  await expect(tip).toBeVisible({ timeout: 40_000 });
  return tip;
}

async function box(l: Locator) {
  const b = await l.boundingBox();
  if (!b) throw new Error('no box');
  return b;
}
type B = { x: number; y: number; width: number; height: number };
const overlap = (a: B, b: B) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

for (const L of LAYOUTS) {
  test.describe(`first-visit tips, ${L.name}`, () => {
    test.use({ viewport: { width: L.width, height: L.height }, hasTouch: true });

    test('Next steps through every tip, Done closes and persists the flag', async ({ page }) => {
      const tip = await firstTip(page);
      await expect(tip).toContainText('Tip 1 of 3');
      await tip.getByRole('button', { name: 'Next' }).click();
      await expect(tip).toContainText('Tip 2 of 3');
      await tip.getByRole('button', { name: 'Next' }).click();
      await expect(tip).toContainText('Tip 3 of 3');
      expect(await flag(page)).toBeNull();
      await expect(tip.getByRole('button', { name: 'Next' })).toHaveCount(0);
      await tip.getByRole('button', { name: 'Done' }).click();
      await expect(tip).toHaveCount(0);
      expect(await flag(page)).toBe('1');
    });

    test('Skip closes and persists the flag; it stays gone after a reload', async ({ page }) => {
      const tip = await firstTip(page);
      await tip.getByRole('button', { name: 'Skip' }).click();
      await expect(tip).toHaveCount(0);
      expect(await flag(page)).toBe('1');
      await page.reload();
      await page.waitForTimeout(4500);
      await expect(page.locator(TIP)).toHaveCount(0);
    });

    test('buttons are 44px targets with 8px between them, and the tip clears the controls', async ({
      page,
    }) => {
      const tip = await firstTip(page);
      await page.waitForTimeout(500); // let the entrance animation settle
      const skip = await box(tip.getByRole('button', { name: 'Skip' }));
      const next = await box(tip.getByRole('button', { name: 'Next' }));
      for (const b of [skip, next]) {
        expect(b.width).toBeGreaterThanOrEqual(44);
        expect(b.height).toBeGreaterThanOrEqual(44);
      }
      expect(next.x - (skip.x + skip.width)).toBeGreaterThanOrEqual(8);
      const t = await box(tip);
      const vp = page.viewportSize()!;
      expect(t.x).toBeGreaterThanOrEqual(0);
      expect(t.x + t.width).toBeLessThanOrEqual(vp.width);
      expect(t.y).toBeGreaterThanOrEqual(0);
      expect(t.y + t.height).toBeLessThanOrEqual(vp.height);
      // never on top of the search pill, the category chips, the settings button or the controls stack
      const others = [
        page.getByRole('button', { name: 'Search NUST' }),
        page.getByRole('button', { name: 'Settings' }),
        page.getByRole('button', { name: /Switch to (3D|2D)/ }),
        page.getByRole('button', { name: 'About and attribution' }).first(),
      ];
      for (const o of others) {
        if (await o.count()) expect(overlap(t, await box(o.first()))).toBe(false);
      }
      const chips = page.getByRole('button', { name: 'Food', exact: true });
      if (await chips.count()) expect(overlap(t, await box(chips.first()))).toBe(false);
    });

    test('tapping outside dismisses the tips and sets the flag', async ({ page }) => {
      const tip = await firstTip(page);
      const t = await box(tip);
      const vp = page.viewportSize()!;
      // a point on the map that is clear of every control and of the tip
      const x = Math.min(vp.width - 90, t.x + t.width + 20);
      await page.mouse.click(x > t.x + t.width ? x : vp.width / 2, vp.height / 2 - 40);
      await expect(tip).toHaveCount(0);
      expect(await flag(page)).toBe('1');
    });

    test('Escape dismisses the tips and sets the flag', async ({ page }) => {
      const tip = await firstTip(page);
      await page.keyboard.press('Escape');
      await expect(tip).toHaveCount(0);
      expect(await flag(page)).toBe('1');
    });

    test('a tip never shows over an open card: it waits, then resumes with the next tip', async ({
      page,
    }) => {
      const tip = await firstTip(page);
      await expect(tip).toContainText('Tip 1 of 3');
      // open a card from the keyboard (a pointer press outside the tip would dismiss it, which is its own test)
      await page.getByRole('button', { name: 'Search NUST' }).focus();
      await page.keyboard.press('Enter');
      await page.getByRole('combobox', { name: 'Search places' }).fill('seecs');
      await page.keyboard.press('Enter');
      const sheet = page.locator(SHEET);
      await expect(sheet).toHaveAttribute('aria-hidden', 'false', { timeout: 20_000 });
      await expect(tip).toHaveCount(0);
      await page.waitForTimeout(800);
      await expect(tip).toHaveCount(0);
      expect(await flag(page)).toBeNull(); // not dismissed, just waiting
      await sheet.getByRole('button', { name: 'Close' }).click();
      await expect(tip).toBeVisible();
      await expect(tip).toContainText('Tip 2 of 3'); // the tip that was up was skipped
      // when the card is open the sheet and the tip are never both on screen
      await page.waitForTimeout(500);
      await tip.getByRole('button', { name: 'Skip' }).click();
    });

    test('a card opened from a deep link keeps the tip hidden until it is closed', async ({
      page,
    }) => {
      await page.goto('/?place=seecs-ug-block-0148');
      const sheet = page.locator(SHEET);
      await expect(sheet).toHaveAttribute('aria-hidden', 'false', { timeout: 30_000 });
      await page.waitForTimeout(4000);
      await expect(page.locator(TIP)).toHaveCount(0);
      await sheet.getByRole('button', { name: 'Close' }).click();
      const tip = page.locator(TIP);
      await expect(tip).toBeVisible({ timeout: 10_000 });
      await page.waitForTimeout(500);
      const t = await box(tip);
      const s = await sheet.boundingBox();
      // closed sheet is hidden, but make sure nothing visible is under the tip
      if (s && (await sheet.isVisible())) expect(overlap(t, s)).toBe(false);
    });
  });
}

test.describe('reduced motion', () => {
  test.use({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  test('the tip appears without sliding', async ({ page }) => {
    const tip = await firstTip(page);
    const y1 = (await box(tip)).y;
    await page.waitForTimeout(300);
    expect((await box(tip)).y).toBe(y1);
    await expect(tip).toHaveCSS('opacity', '1');
  });
});
