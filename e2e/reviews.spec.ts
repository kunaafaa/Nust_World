import { expect, test, type Page } from './fixtures';

/**
 * Reviews and food ratings, driven through the in-memory store (`?reviews=memory`): nothing is sent anywhere.
 * The production build has reviews switched off, which the first test checks.
 */
const SHEET = '[data-sheet][aria-label$="details"]';
const C1 = 'concordia-1-6900';
const MOSQUE = 'masjid-5311';
const SIZES = [
  { name: '360x640', width: 360, height: 640 },
  { name: '390x844', width: 390, height: 844 },
  { name: '844x390', width: 844, height: 390 },
];

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

async function openCard(page: Page, id: string, memory = true) {
  await page.goto(`/?place=${id}${memory ? '&reviews=memory' : ''}`);
  await expect(page.locator(SHEET)).toHaveAttribute('aria-hidden', 'false', { timeout: 30_000 });
}

/** Wait until the sheet has stopped moving (same as e2e/menu.spec.ts). */
async function settle(page: Page) {
  const handle = page.locator(SHEET).locator('[data-handle]');
  let last = -1;
  for (let i = 0; i < 40; i++) {
    const y = Math.round((await handle.boundingBox())?.y ?? -1);
    if (y === last) return;
    last = y;
    await page.waitForTimeout(150);
  }
}

/** Drag the card to full height (the card body only scrolls once the sheet is open). */
async function openFull(page: Page) {
  const vp = page.viewportSize()!;
  const side = vp.width >= 768 || vp.height < 500;
  const want = side ? Math.max(200, vp.height - 136) : Math.round(vp.height * 0.9);
  for (let attempt = 0; attempt < 3; attempt++) {
    await settle(page);
    if (Math.abs(vp.height - (await page.locator(SHEET).boundingBox())!.y - want) < 12) return;
    const box = (await page.locator(SHEET).locator('[data-handle]').boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2, 40, { steps: 12 });
    await page.mouse.up();
    await page.waitForTimeout(700);
  }
  await settle(page);
}

/** The reviews block, scrolled into view inside the card. */
async function reviews(page: Page) {
  const rv = page.locator(SHEET).locator('[data-reviews]');
  await expect(rv).toBeAttached({ timeout: 15_000 });
  await rv.scrollIntoViewIfNeeded();
  return rv;
}

async function signIn(page: Page, email = 'me@seecs.edu.pk') {
  const rv = await reviews(page);
  await rv.getByLabel('University email').fill(email);
  await rv.getByRole('button', { name: 'Send link' }).click();
  return rv;
}

test('off by default: "Reviews coming soon", no rating UI, nothing loaded from Supabase', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const supabase: string[] = [];
  page.on('request', (r) => {
    if (/supabase/i.test(r.url())) supabase.push(r.url());
  });
  await openCard(page, C1, false);
  const sheet = page.locator(SHEET);
  await expect(sheet.getByText('Reviews coming soon')).toBeAttached();
  await expect(sheet.locator('[data-reviews]')).toHaveCount(0);
  await expect(sheet.getByText('Menu · 216 items')).toBeVisible();
  await expect(sheet.getByRole('button', { name: /^Rate / })).toHaveCount(0);
  await expect(sheet.getByRole('tab', { name: 'Top rated' })).toHaveCount(0);
  await openCard(page, MOSQUE, false);
  await expect(page.locator(SHEET).getByText('Reviews coming soon')).toHaveCount(0);
  expect(supabase).toEqual([]);
});

test('prayer places never show reviews', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openCard(page, MOSQUE);
  await expect(page.locator(SHEET).getByRole('button', { name: 'Navigate here' })).toBeAttached();
  await expect(page.locator(SHEET).locator('[data-reviews]')).toHaveCount(0);
});

for (const vp of SIZES) {
  test.describe(`reviews ${vp.name}`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height }, hasTouch: true });

    test('read, sign in, write, refuse bad text, edit, report, delete my data', async ({
      page,
    }) => {
      await openCard(page, C1);
      await openFull(page);
      let rv = await reviews(page);
      await expect(rv.getByText('4.5 · 2 reviews')).toBeVisible();
      // plain text only: the tag is shown literally and never becomes an element
      await expect(rv.getByText('<b>Not bold</b>', { exact: false })).toBeVisible();
      expect(await rv.locator('.rv-body b').count()).toBe(0);
      await expect(rv.getByText(/Reviews are about places and food only/)).toBeVisible();
      // signed out: no write / report actions
      await expect(rv.getByRole('button', { name: 'Report' })).toHaveCount(0);

      rv = await signIn(page, 'someone@gmail.com');
      await expect(rv.getByRole('alert')).toHaveText('Use your university email address.');
      rv = await signIn(page);
      await expect(rv.getByText('Signed in as me@seecs.edu.pk')).toBeVisible();

      await rv.getByRole('button', { name: 'Write a review' }).click();
      await rv.getByRole('radio', { name: '5 stars' }).click();
      await rv.getByLabel('Display name').fill('Night owl');
      await rv.getByLabel('Review text').fill('Ask for chai, call 0300 1234567');
      await expect(rv.getByRole('alert')).toHaveText('Please leave out phone numbers.');
      await rv.getByRole('button', { name: 'Post review' }).click();
      await expect(rv.getByRole('alert')).toHaveText('Please leave out phone numbers.');
      await rv.getByLabel('Review text').fill('Ask for the chai, it is great');
      await rv.getByRole('button', { name: 'Post review' }).click();
      await expect(rv.getByText('Thanks, your review is up')).toBeVisible();
      await expect(rv.getByText('4.7 · 3 reviews')).toBeVisible();

      await rv.getByRole('button', { name: 'Edit your review' }).click();
      await rv.getByRole('radio', { name: '2 stars' }).click();
      await rv.getByRole('button', { name: 'Save' }).click();
      await expect(rv.getByText('3.7 · 3 reviews')).toBeVisible();

      const other = rv.locator('[data-review]', { hasText: 'Demo reviewer A' });
      await other.getByRole('button', { name: 'Report' }).click();
      await other.getByLabel('Report reason').fill('not about the place');
      await other.getByRole('button', { name: 'Send report' }).click();
      await expect(rv.getByText('Thanks, the review was reported')).toBeVisible();

      await rv.getByRole('button', { name: 'Delete my data' }).click();
      await rv.getByRole('button', { name: 'Delete all' }).click();
      await expect(rv.getByText('Your reviews and ratings were deleted')).toBeVisible();
      await expect(rv.getByText('4.5 · 2 reviews')).toBeVisible();
      await expect(rv.getByText('Night owl')).toHaveCount(0);
      // no horizontal overflow at this size
      const over = await rv.evaluate((el) => el.scrollWidth - el.clientWidth);
      expect(over).toBeLessThanOrEqual(1);
    });

    test('food ratings: pill from 3 ratings, Top rated chip, inline rater', async ({ page }) => {
      await openCard(page, C1);
      await openFull(page);
      const sheet = page.locator(SHEET);
      await expect(sheet.getByRole('tab', { name: 'Top rated' })).toBeVisible({ timeout: 15_000 });
      const top = sheet.locator('[data-cat="Top rated"]');
      await expect(top.locator('.menu-name')).toHaveText([
        'Chicken Tikka Piece',
        'Chicken Tikka Boti',
      ]);
      // two ratings only: no pill yet
      const achari = sheet.locator('[data-cat="BBQ"] .menu-row', {
        hasText: 'Chicken Achari Boti',
      });
      await expect(achari.locator('.rv-pill')).toHaveCount(0);

      // guest ratings are counted and said so (demo user B is a guest)
      await expect(
        top.getByLabel('Rated 4.7 out of 5 from 3 ratings, including 1 from guests'),
      ).toBeVisible();
      // signed out: the rater offers "Continue as guest" and the NUST email
      await achari.getByRole('button', { name: 'Rate Chicken Achari Boti' }).click();
      await expect(achari.getByRole('button', { name: 'Continue as guest' })).toBeVisible();
      await expect(achari.getByRole('button', { name: 'use your NUST email' })).toBeVisible();

      await signIn(page);
      await achari.scrollIntoViewIfNeeded();
      const rate = achari.getByRole('button', { name: 'Rate Chicken Achari Boti' });
      if ((await rate.getAttribute('aria-expanded')) !== 'true') await rate.click();
      await achari.getByRole('radio', { name: '5 stars' }).click();
      await expect(achari.getByText('Thanks for rating')).toBeVisible();
      await expect(
        achari.getByRole('button', { name: /Your rating for Chicken Achari Boti: 5 stars/ }),
      ).toBeVisible();
      await expect(achari.getByLabel('Rated 3.0 out of 5 from 3 ratings')).toBeVisible();
      await expect(top.locator('.menu-name')).toHaveText([
        'Chicken Tikka Piece',
        'Chicken Tikka Boti',
        'Chicken Achari Boti',
      ]);
    });
  });
}

test.describe('guests', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test('continue as guest: name rules, Guest label, note on averages, rate a dish, upgrade', async ({
    page,
  }) => {
    await openCard(page, C1);
    await openFull(page);
    const rv = await reviews(page);
    // labels come from the store: demo A is a university account, demo B a guest
    await expect(
      rv.locator('[data-review]', { hasText: 'Demo reviewer A' }).getByText('NUST'),
    ).toBeVisible();
    await expect(
      rv.locator('[data-review]', { hasText: 'Demo reviewer B' }).getByText('Guest'),
    ).toBeVisible();
    await expect(rv.getByText('Includes 1 guest review (not verified)')).toBeVisible();

    const guest = rv.locator('[data-reviews-guest]');
    await guest.getByLabel('Guest display name').fill('NUST Admin');
    await expect(guest.getByRole('alert')).toHaveText(/cannot look official/);
    await guest.getByLabel('Guest display name').fill('Chai lover');
    await guest.getByRole('button', { name: 'Continue as guest' }).click();
    await expect(rv.getByText('Posting as Chai lover')).toBeVisible();

    await rv.getByRole('button', { name: 'Write a review' }).click();
    // a guest posts under their guest name: no name field
    await expect(rv.getByLabel('Display name', { exact: true })).toHaveCount(0);
    await rv.getByRole('radio', { name: '5 stars' }).click();
    await rv.getByRole('button', { name: 'Post review' }).click();
    await expect(rv.getByText('4.7 · 3 reviews')).toBeVisible();
    await expect(rv.getByText('Includes 2 guest reviews (not verified)')).toBeVisible();
    const mine = rv.locator('[data-review]', { hasText: 'Chai lover' });
    await expect(mine.getByText('Guest')).toBeVisible();

    // the same guest can rate a dish
    const achari = page.locator(SHEET).locator('[data-cat="BBQ"] .menu-row', {
      hasText: 'Chicken Achari Boti',
    });
    await achari.scrollIntoViewIfNeeded();
    await achari.getByRole('button', { name: 'Rate Chicken Achari Boti' }).click();
    await achari.getByRole('radio', { name: '4 stars' }).click();
    await expect(achari.getByText('Thanks for rating')).toBeVisible();

    // upgrade: verify a university email, same account, the review now shows NUST
    await rv.scrollIntoViewIfNeeded();
    await rv.getByLabel('University email').fill('me@seecs.edu.pk');
    await rv.getByRole('button', { name: 'Send link' }).click();
    await expect(rv.getByText('Signed in as me@seecs.edu.pk')).toBeVisible();
    await expect(mine.getByText('NUST')).toBeVisible();
    await expect(rv.getByRole('button', { name: 'Edit your review' })).toBeVisible();
  });
});

test.describe('offline', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test('read-only while offline, writable again online', async ({ page, context }) => {
    await openCard(page, C1);
    await openFull(page);
    const rv = await signIn(page);
    await expect(rv.getByRole('button', { name: 'Write a review' })).toBeVisible();
    await context.setOffline(true);
    await expect(rv.getByText('Offline: showing saved reviews, read-only.')).toBeVisible();
    await expect(rv.getByRole('button', { name: 'Write a review' })).toHaveCount(0);
    await expect(rv.getByText('4.5 · 2 reviews')).toBeVisible();
    await context.setOffline(false);
    await expect(rv.getByRole('button', { name: 'Write a review' })).toBeVisible();
  });
});

test.describe('failure', () => {
  // page.route cannot see requests the service worker answers, so keep it out of this test.
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, serviceWorkers: 'block' });

  test('a reviews block that fails to load never breaks the map or the card', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/?reviews=memory');
    await page.getByRole('button', { name: 'Search NUST' }).click({ timeout: 40_000 });
    // From now on every new script chunk fails, so the reviews block cannot load.
    await page.route('**/_next/static/chunks/**', (r) => r.abort());
    await page.getByRole('combobox', { name: 'Search places' }).fill('concordia 1');
    const option = page.getByRole('option').first();
    await expect(option).toBeVisible({ timeout: 30_000 });
    await option.click();
    const sheet = page.locator(SHEET);
    await expect(sheet).toHaveAttribute('aria-hidden', 'false', { timeout: 30_000 });
    await expect(sheet.getByText('Reviews are unavailable right now')).toBeAttached({
      timeout: 15_000,
    });
    // the card and the map still work
    await expect(sheet.getByRole('button', { name: /^Navigate to / })).toBeVisible();
    await expect(page.locator('canvas').first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Search NUST' })).toBeVisible();
    expect(errors.filter((e) => !/chunk|Failed to fetch|Loading/i.test(e))).toEqual([]);
  });
});
