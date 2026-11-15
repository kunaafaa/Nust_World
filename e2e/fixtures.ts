import { expect, test as base } from '@playwright/test';

/**
 * Every e2e test imports `test` from here. It fails the test if the page (or a worker) reports a Content Security
 * Policy violation: the app must work under the production policy (src/lib/security/headers.ts).
 */
export const test = base.extend<{ cspGuard: void; expectCspViolations: boolean }>({
  /** Only for the test that injects a script on purpose to prove the policy blocks it. */
  expectCspViolations: [false, { option: true }],
  cspGuard: [
    async ({ context, expectCspViolations }, use) => {
      const violations: string[] = [];
      await context.addInitScript(() => {
        document.addEventListener('securitypolicyviolation', (e) => {
          console.error(
            `[csp-violation] ${e.violatedDirective} ${e.blockedURI} ${e.sourceFile}:${e.lineNumber}`,
          );
        });
      });
      context.on('console', (m) => {
        const t = m.text();
        if (t.startsWith('[csp-violation]') || /Content Security Policy/i.test(t))
          violations.push(t);
      });
      await use();
      if (expectCspViolations)
        expect(violations.length, 'the guard saw the injected script').toBeGreaterThan(0);
      else expect(violations, 'Content Security Policy violations').toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
export type { Locator, Page } from '@playwright/test';
