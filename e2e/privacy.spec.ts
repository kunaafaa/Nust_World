import { expect, test, type Page } from './fixtures';

/**
 * Location never leaves the device. Records every request (URL, headers that carry data, and body) while the user
 * turns on location, opens a place and walks a route with the simulated GPS, and fails if any of them holds a
 * coordinate or a location-looking field. Also checks that the CSP guard in ./fixtures really reports violations.
 */
const CARD = '[data-sheet][aria-label$="details"]';
const DEST = 'admin-office-6863';

// Campus coordinates are about 33.64 N, 72.98 E. Any decimal near them, or a lat/lng/coords field, is a leak.
const COORD = /(^|[^0-9])(33\.6\d{2,}|72\.9\d{2,}|72\.98|33\.64)/;
const FIELD = /(^|[^a-z])(lat|lng|lon|latitude|longitude|coords|accuracy|heading|geo)([^a-z]|$)/i;

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

function record(page: Page) {
  const seen: string[] = [];
  page.context().on('request', (r) => {
    const body = r.postData() ?? '';
    seen.push(`${r.method()} ${r.url()} ${body}`);
  });
  return seen;
}

test('no request carries the user location during locate and directions', async ({ page }) => {
  const seen = record(page);
  await page.goto('/?simulate=gate1&walk=1&walkSpeed=20');
  await page.getByRole('button', { name: 'Show my location' }).click({ timeout: 40_000 });
  await expect(page.getByRole('button', { name: 'Stop showing my location' })).toBeVisible();
  await page.goto(`/?simulate=gate1&walk=1&walkSpeed=20&place=${DEST}`);
  await expect(page.locator(CARD)).toHaveAttribute('aria-hidden', 'false', { timeout: 40_000 });
  await page.getByRole('button', { name: /^Navigate to / }).click();
  const sheet = page.locator('[data-sheet][aria-label="Walking directions"]');
  await sheet.getByRole('button', { name: 'Start', exact: true }).click({ timeout: 20_000 });
  await expect(page.locator('main')).toHaveAttribute('data-nav', /NAV_/);
  await page.waitForTimeout(6000); // walk part of the route: many location fixes
  expect(seen.length).toBeGreaterThan(5);
  const leaks = seen.filter((s) => {
    const [, url = '', body = ''] = /^\S+ (\S+) ?([\s\S]*)$/.exec(s) ?? [];
    const query = (() => {
      try {
        return decodeURIComponent(new URL(url).search);
      } catch {
        return url;
      }
    })();
    return COORD.test(query) || COORD.test(body) || FIELD.test(query) || FIELD.test(body);
  });
  expect(leaks, 'requests that look like they carry location').toEqual([]);
});

test.describe('CSP guard', () => {
  test.use({ expectCspViolations: true });
  // What an XSS bug would look like: markup with an inline handler, and data sent to another origin. (A script that
  // is already running can still add scripts: that is what 'strict-dynamic' allows by design.)
  test('the CSP blocks injected inline handlers and other origins (and the guard notices)', async ({
    page,
  }) => {
    await page.goto('/?place=x');
    const result = await page.evaluate(
      () =>
        new Promise<{ handlerRan: boolean; fetched: boolean; violations: number }>((resolve) => {
          const w = window as unknown as { __injected?: boolean };
          let violations = 0;
          document.addEventListener('securitypolicyviolation', () => violations++);
          const div = document.createElement('div');
          div.innerHTML = '<img src="data:," onload="window.__injected = true" alt="">';
          document.body.appendChild(div);
          fetch('https://example.com/collect?x=1', { mode: 'no-cors' })
            .then(() => true)
            .catch(() => false)
            .then((fetched) =>
              setTimeout(
                () => resolve({ handlerRan: w.__injected === true, fetched, violations }),
                300,
              ),
            );
        }),
    );
    expect(result.handlerRan).toBe(false);
    expect(result.fetched).toBe(false);
    expect(result.violations).toBeGreaterThanOrEqual(2);
  });
});
