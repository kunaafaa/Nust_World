import { defineConfig } from '@playwright/test';

/**
 * Visual + behaviour checks for the place card. Uses the locally installed Chrome (no browser download).
 * Needs a production build: `npm run build`, then `npm run test:e2e` (it starts `next start` on :3100 itself).
 * Update baselines only for intended UI changes: `npm run test:e2e -- --update-snapshots`.
 */
export default defineConfig({
  testDir: './e2e',
  snapshotPathTemplate: '{testDir}/__screenshots__/{testFileName}/{arg}{ext}',
  timeout: 60_000,
  retries: 0,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:3100',
    channel: 'chrome',
    launchOptions: {
      args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
    },
    serviceWorkers: 'allow',
  },
  expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.03, animations: 'disabled' } },
  webServer: {
    command: 'npx next start -p 3100',
    url: 'http://localhost:3100',
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
