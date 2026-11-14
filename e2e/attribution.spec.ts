import { expect, test } from '@playwright/test';

const SHEET = '[data-sheet][aria-label$="details"]';
const SIZES = [
  { name: '844x390', width: 844, height: 390 },
  { name: '640x360', width: 640, height: 360 },
  { name: '390x844', width: 390, height: 844 },
];
type B = { x: number; y: number; width: number; height: number };
const overlap = (a: B, b: B) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

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

for (const size of SIZES) {
  test.describe(`attribution button ${size.name}`, () => {
    test.use({ viewport: { width: size.width, height: size.height }, hasTouch: true });

    test('never overlaps an open place card, and the attribution stays reachable', async ({
      page,
    }) => {
      await page.goto('/?place=concordia-1-6900');
      const sheet = page.locator(SHEET);
      await expect(sheet).toHaveAttribute('aria-hidden', 'false', { timeout: 30_000 });
      const info = page.getByRole('button', { name: 'About and attribution' });
      for (const snap of ['peek', 'half'] as const) {
        if (snap === 'half') {
          const h = (await sheet.locator('[data-handle]').boundingBox())!;
          await page.mouse.click(h.x + h.width / 2, h.y + h.height / 2);
        }
        await page.waitForTimeout(800);
        const card = (await sheet.boundingBox())!;
        // nothing else called "About and attribution" overlaps the card (it may be hidden in portrait)
        for (const b of await info.all()) {
          if (!(await b.isVisible())) continue;
          const bb = (await b.boundingBox())!;
          expect(overlap(bb, card), `${snap}: button at ${JSON.stringify(bb)}`).toBe(false);
          // and it does not sit on the other controls
          for (const other of [
            page.getByRole('button', { name: /Switch to (3D|2D)/ }),
            page.getByRole('button', { name: 'Settings' }),
          ]) {
            const ob = await other.first().boundingBox();
            if (ob) expect(overlap(bb, ob)).toBe(false);
          }
        }
      }
      // reachable: with the card closed there is exactly one visible button, and it opens the attribution
      await sheet.getByRole('button', { name: 'Close' }).click();
      await expect(info.filter({ visible: true })).toHaveCount(1);
      await info.filter({ visible: true }).click();
      await expect(page.getByText(/OpenStreetMap contributors/).first()).toBeVisible();
    });
  });
}
