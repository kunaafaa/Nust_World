/**
 * Navigation performance profile (mobile viewport, 4x CPU throttling, ?simulate GPS, ?perf=1 overlay).
 *
 *   npm run build && npx next start -p 3100   (in another terminal)
 *   node scripts/perf-nav.mjs <label> [extra query, e.g. "walk=1"]
 *
 * Writes docs/perf/<label>.json (numbers) and docs/perf/traces/<label>-<scenario>.json.gz (Chrome traces).
 * Scenarios: idle map, starting directions, 30 s of navigating, expanding/collapsing the steps sheet.
 * Uses the locally installed Chrome. Software GL in headless Chrome means fps here is not a phone's fps:
 * compare runs with each other, not with a device.
 */
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

const label = process.argv[2] ?? 'run';
const extra = process.argv[3] ? `&${process.argv[3]}` : '';
const BASE = process.env.PERF_BASE ?? 'http://localhost:3100';
const DEST = 'concordia-1-6900';
const NAV_SECONDS = Number(process.env.NAV_SECONDS ?? 30);
mkdirSync('docs/perf/traces', { recursive: true });

const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  hasTouch: true,
  isMobile: true,
});
await context.addInitScript(() => {
  localStorage.setItem('nw-onboarded', '1');
  sessionStorage.setItem('nw-title', '1');
  // frame recorder: every rAF delta, plus long tasks
  const w = window;
  w.__frames = [];
  w.__long = [];
  let last = 0;
  const loop = (t) => {
    if (last) w.__frames.push(t - last);
    last = t;
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  try {
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) w.__long.push(e.duration);
    }).observe({ type: 'longtask', buffered: false });
  } catch {
    /* not supported */
  }
});
const page = await context.newPage();
const cdp = await context.newCDPSession(page);
await cdp.send('Performance.enable');

const metrics = async () => {
  const { metrics: m } = await cdp.send('Performance.getMetrics');
  return Object.fromEntries(m.map((x) => [x.name, x.value]));
};
const overlay = async () => {
  const t =
    (await page
      .locator('pre')
      .first()
      .textContent()
      .catch(() => '')) ?? '';
  return {
    r3fFps: Number(/(\d+) fps/.exec(t)?.[1] ?? NaN),
    drawCalls: Number(/calls (\d+)/.exec(t)?.[1] ?? NaN),
    trisK: Number(/tris (\d+)k/.exec(t)?.[1] ?? NaN),
  };
};

async function measure(name, run) {
  await page.evaluate(() => {
    window.__frames = [];
    window.__long = [];
  });
  await browser.startTracing(page, {
    categories: ['devtools.timeline', 'disabled-by-default-devtools.timeline', 'v8.execute'],
  });
  const m0 = await metrics();
  const t0 = Date.now();
  const samples = [];
  await run(samples);
  const secs = (Date.now() - t0) / 1000;
  const m1 = await metrics();
  const trace = await browser.stopTracing();
  writeFileSync(`docs/perf/traces/${label}-${name}.json.gz`, gzipSync(trace));
  const { frames, long } = await page.evaluate(() => ({
    frames: window.__frames,
    long: window.__long,
  }));
  const sorted = [...frames].sort((a, b) => a - b);
  const pct = (p) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] ?? 0;
  const ov = samples.length ? samples : [await overlay()];
  const avg = (k) => {
    const v = ov.map((s) => s[k]).filter((x) => Number.isFinite(x));
    return v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10 : null;
  };
  const script = (m1.ScriptDuration - m0.ScriptDuration) * 1000;
  const task = (m1.TaskDuration - m0.TaskDuration) * 1000;
  const r = {
    seconds: Math.round(secs * 10) / 10,
    rafFps: Math.round((frames.length / secs) * 10) / 10,
    frameMsMedian: Math.round(pct(0.5) * 10) / 10,
    frameMsP95: Math.round(pct(0.95) * 10) / 10,
    frameMsMax: Math.round((sorted.at(-1) ?? 0) * 10) / 10,
    framesOver50ms: frames.filter((f) => f > 50).length,
    r3fFps: avg('r3fFps'),
    drawCalls: avg('drawCalls'),
    trisK: avg('trisK'),
    jsMsPerFrame: frames.length ? Math.round((script / frames.length) * 100) / 100 : null,
    mainThreadBusyPct: Math.round((task / (secs * 1000)) * 1000) / 10,
    longTasks: long.length,
    longTaskMaxMs: Math.round(Math.max(0, ...long)),
    layoutCount: m1.LayoutCount - m0.LayoutCount,
    recalcStyleCount: m1.RecalcStyleCount - m0.RecalcStyleCount,
  };
  console.log(name.padEnd(12), JSON.stringify(r));
  return r;
}

const sample = async (samples, seconds) => {
  for (let i = 0; i < seconds; i++) {
    await page.waitForTimeout(1000);
    samples.push(await overlay());
  }
};

await page.goto(`${BASE}/?simulate=gate1&perf=1&place=${DEST}${extra}`);
await page.locator('[data-sheet][aria-label$="details"]').waitFor({ timeout: 60_000 });
await page.waitForTimeout(6000); // auto-quality probe + settle
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
const results = {
  label,
  query: extra,
  cpuThrottle: 4,
  viewport: '390x844@2x',
  date: new Date().toISOString(),
};

results.idle = await measure('idle', (s) => sample(s, 8));
results.startDirections = await measure('start', async (s) => {
  await page.getByRole('button', { name: /^Navigate to / }).click();
  const my = page.getByRole('button', { name: 'My location', exact: true });
  const start = page.getByRole('button', { name: /^Start/ });
  for (let i = 0; i < 20; i++) {
    if (await start.isVisible().catch(() => false)) {
      await start.click();
      break;
    }
    if (await my.isVisible().catch(() => false)) {
      await my.click();
      break;
    }
    await page.waitForTimeout(250);
  }
  await sample(s, 6);
});
results.navigating = await measure('navigating', (s) => sample(s, NAV_SECONDS));
results.stepsSheet = await measure('steps-sheet', async (s) => {
  for (let i = 0; i < 3; i++) {
    await page.getByRole('button', { name: 'Show all steps' }).click();
    await page.waitForTimeout(900);
    await page.getByRole('button', { name: 'Collapse steps' }).click();
    await page.waitForTimeout(900);
  }
  s.push(await overlay());
});
writeFileSync(`docs/perf/${label}.json`, JSON.stringify(results, null, 2) + '\n');
await browser.close();
