import { expect, test, type Page } from './fixtures';

/**
 * Navigation mode on a phone (390x844), with a simulated GPS walk (?simulate=gate1&walk=1). The simulator starts at
 * Gate no. 2 (there is no "Gate 1" in the data). Real pointer input only: mouse drags, CDP touch for the pinch.
 */
const CARD = '[data-sheet][aria-label$="details"]';
const NEAR = 'admin-office-6863'; // about 425 m from the simulated start

type Cam = { target: [number, number]; distance: number; polar: number; azimuth: number };
const nav = (p: Page) => p.locator('main').getAttribute('data-nav');
const cam = (p: Page) => p.evaluate(() => (window as unknown as { __nwCam: Cam }).__nwCam);
const dot = (p: Page) =>
  p.evaluate(
    () => (window as unknown as { __nwNav: { shown: [number, number] | null } }).__nwNav.shown,
  );

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

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

/** Open a place, tap Navigate, wait for the preview, tap Start. Fails on any browser dialog or modal. */
async function startNav(page: Page, place: string, query = '') {
  page.on('dialog', (d) => {
    throw new Error(`unexpected browser dialog: ${d.message()}`);
  });
  await page.goto(`/?simulate=gate1&walk=1&place=${place}${query}`);
  await expect(page.locator(CARD)).toHaveAttribute('aria-hidden', 'false', { timeout: 40_000 });
  await page.getByRole('button', { name: /^Navigate to / }).click();
  await expect(page.locator('main')).toHaveAttribute('data-nav', 'ROUTE_PREVIEW');
  // "From" defaults to My location: no start picker, no popup
  const sheet = page.locator('[data-sheet][aria-label="Walking directions"]');
  await expect(
    sheet.getByRole('button', { name: /^Change start \(now My location\)/ }),
  ).toBeVisible({
    timeout: 20_000,
  });
  const start = sheet.getByRole('button', { name: 'Start', exact: true });
  await expect(start).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('[aria-modal="true"]')).toHaveCount(0);
  await start.click();
  await expect(page.locator('main')).toHaveAttribute('data-nav', 'NAV_FOLLOW');
  await page.waitForTimeout(1200); // the 400 ms flight plus smoothing
}

async function expectCentred(page: Page, tol = 12) {
  await expect
    .poll(
      async () => {
        const c = await cam(page);
        const d = await dot(page);
        return d ? Math.hypot(c.target[0] - d[0], c.target[1] - d[1]) : Infinity;
      },
      { timeout: 6000 },
    )
    .toBeLessThan(tol);
}

async function drag(page: Page) {
  await page.mouse.move(200, 300);
  await page.mouse.down();
  await page.mouse.move(110, 400, { steps: 10 });
  await page.mouse.up();
}

/** Two-finger pinch through real touch events (CDP). out = fingers move together = zoom out. */
async function pinch(page: Page, out: boolean) {
  const cdp = await page.context().newCDPSession(page);
  const cx = 195,
    cy = 330;
  const at = (gap: number) => [
    { x: cx - gap, y: cy, id: 1 },
    { x: cx + gap, y: cy, id: 2 },
  ];
  const [g0, g1] = out ? [140, 50] : [50, 140];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: at(g0) });
  for (let i = 1; i <= 10; i++)
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: at(g0 + ((g1 - g0) * i) / 10),
    });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
}

test('start directions: centred on the dot, top-down, walking zoom', async ({ page }) => {
  await startNav(page, 'concordia-1-6900');
  const c = await cam(page);
  expect(c.polar).toBeLessThan(0.05); // tilt 0
  expect(c.distance).toBeGreaterThan(120);
  expect(c.distance).toBeLessThan(220);
  expect(Math.abs(c.azimuth)).toBeLessThan(0.02); // north up
  await expectCentred(page);
});

test('pinch in NAV_FOLLOW only zooms and keeps following', async ({ page }) => {
  await startNav(page, 'concordia-1-6900');
  const d0 = (await cam(page)).distance;
  await pinch(page, true);
  await page.waitForTimeout(800);
  expect(await nav(page)).toBe('NAV_FOLLOW');
  const d1 = (await cam(page)).distance;
  expect(d1).toBeGreaterThan(d0 * 1.1); // zoomed out, and the zoom is kept
  await page.waitForTimeout(2500);
  expect((await cam(page)).distance).toBeCloseTo(d1, 0);
  await expectCentred(page);
});

test('pan -> NAV_FREE with a 44 px Re-centre button; pinch out stays free; Re-centre returns', async ({
  page,
}) => {
  await startNav(page, 'concordia-1-6900');
  await drag(page);
  await expect(page.locator('main')).toHaveAttribute('data-nav', 'NAV_FREE');
  const re = page.getByRole('button', { name: 'Re-centre', exact: true });
  await expect(re).toBeVisible();
  const b = (await re.boundingBox())!;
  expect(b.width).toBeGreaterThanOrEqual(44);
  expect(b.height).toBeGreaterThanOrEqual(44);
  // navigation continues in the background: the dot keeps moving
  const p0 = await dot(page);
  await page.waitForTimeout(2500);
  const p1 = await dot(page);
  expect(Math.hypot(p1![0] - p0![0], p1![1] - p0![1])).toBeGreaterThan(1);
  const dFree = (await cam(page)).distance;
  await pinch(page, true);
  await page.waitForTimeout(600);
  expect(await nav(page)).toBe('NAV_FREE');
  expect((await cam(page)).distance).toBeGreaterThan(dFree);
  await re.click();
  await expect(page.locator('main')).toHaveAttribute('data-nav', 'NAV_FOLLOW');
  await expectCentred(page);
  await expect(re).toHaveCount(0);
});

test('NAV_FREE returns to NAV_FOLLOW by itself after the auto re-centre delay', async ({
  page,
  context,
}) => {
  await context.addInitScript(() => localStorage.setItem('nw-auto-recentre', '5'));
  await startNav(page, 'concordia-1-6900');
  await drag(page);
  await expect(page.locator('main')).toHaveAttribute('data-nav', 'NAV_FREE');
  await page.waitForTimeout(3000);
  expect(await nav(page)).toBe('NAV_FREE'); // not before the delay
  await expect(page.locator('main')).toHaveAttribute('data-nav', 'NAV_FOLLOW', { timeout: 5000 });
  await expectCentred(page);
});

test('leaving the path reroutes (and only from My location)', async ({ page }) => {
  await startNav(page, 'concordia-1-6900', '&walkSpeed=4');
  const before = await page.evaluate(
    () => (window as unknown as { __nwNav: { lastRerouteAt: number } }).__nwNav.lastRerouteAt,
  );
  expect(before).toBe(0);
  await page.evaluate(() =>
    (window as unknown as { __nwSim: { offset: (m: number) => void } }).__nwSim.offset(45),
  );
  await expect
    .poll(
      () =>
        page.evaluate(
          () => (window as unknown as { __nwNav: { lastRerouteAt: number } }).__nwNav.lastRerouteAt,
        ),
      { timeout: 15_000 },
    )
    .toBeGreaterThan(0);
  await page.evaluate(() =>
    (window as unknown as { __nwSim: { offset: (m: number) => void } }).__nwSim.offset(0),
  );
  // still navigating, still following, no modal
  expect(await nav(page)).toBe('NAV_FOLLOW');
  await expect(page.locator('[aria-modal="true"]')).toHaveCount(0);
});

test('arrival: short toast, then the destination card at peek; the tilt is restored', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await startNav(page, NEAR, '&walkSpeed=20&simHz=4');
  await expect(page.getByText(/^You have arrived at /)).toBeVisible({ timeout: 70_000 });
  await expect(page.locator('main')).toHaveAttribute('data-nav', 'IDLE', { timeout: 6000 });
  const card = page.locator(CARD);
  await expect(card).toHaveAttribute('aria-hidden', 'false');
  await expect(card.getByRole('heading', { name: 'Admin Office' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Switch to 2D top-down view' })).toBeVisible(); // 3D again
});

test('ending the route (x) always works and restores the tilt', async ({ page }) => {
  await startNav(page, 'concordia-1-6900');
  await drag(page);
  await page.getByRole('button', { name: 'End route' }).click();
  await expect(page.locator('main')).toHaveAttribute('data-nav', 'IDLE');
  await expect(page.locator('[data-sheet][aria-label="Walking directions"]')).toHaveAttribute(
    'aria-hidden',
    'true',
  );
  await expect.poll(async () => (await cam(page)).polar, { timeout: 4000 }).toBeGreaterThan(0.5);
});

test.describe('no popups: location problems are chips', () => {
  test('location denied: "Location off" and "Pick a starting point" chips, no modal', async ({
    page,
  }) => {
    page.on('dialog', (d) => {
      throw new Error(`unexpected browser dialog: ${d.message()}`);
    });
    await page.goto('/?place=concordia-1-6900'); // no permission granted, no simulator
    await expect(page.locator(CARD)).toHaveAttribute('aria-hidden', 'false', { timeout: 40_000 });
    await page.getByRole('button', { name: /^Navigate to / }).click();
    await expect(page.locator('[data-chip="locationOff"]')).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('[data-chip="pickStart"]')).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('[aria-modal="true"]')).toHaveCount(0);
    // the map is not blocked: the chips area lets taps through except on the chips
    await expect(page.locator('[data-status-chips]')).toHaveCSS('pointer-events', 'none');
    // chips can be dismissed
    await page
      .locator('[data-chip="locationOff"]')
      .getByRole('button', { name: 'Dismiss' })
      .click();
    await expect(page.locator('[data-chip="locationOff"]')).toHaveCount(0);
  });

  test('off campus: the preview starts from the nearest gate, with a chip', async ({
    page,
    context,
  }) => {
    await context.grantPermissions(['geolocation']);
    await context.setGeolocation({ latitude: 33.72, longitude: 73.06, accuracy: 10 });
    await page.goto('/?place=concordia-1-6900');
    await expect(page.locator(CARD)).toHaveAttribute('aria-hidden', 'false', { timeout: 40_000 });
    await page.getByRole('button', { name: /^Navigate to / }).click();
    const chip = page.locator('[data-chip="offCampus"]');
    await expect(chip).toContainText(/You're not on campus\. Starting from .*Gate/i, {
      timeout: 20_000,
    });
    await expect(chip).toContainText('change');
    await expect(page.locator('main')).toHaveAttribute('data-nav', 'ROUTE_PREVIEW');
    await expect(page.getByRole('button', { name: /^Change start \(now .*Gate/i })).toBeVisible();
    await expect(page.locator('[aria-modal="true"]')).toHaveCount(0);
  });
});
