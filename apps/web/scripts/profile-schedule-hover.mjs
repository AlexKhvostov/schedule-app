// Local Demo only. Compare warmed runs on the same server; Demo is development-only.
// HOVER_PROFILE_URL=http://127.0.0.1:3107 node scripts/profile-schedule-hover.mjs <output.json>
import { chromium } from '@playwright/test';
import { writeFile } from 'node:fs/promises';

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.clock.setFixedTime(new Date('2026-11-07T08:00:00Z'));
  await page.addInitScript(() => {
    localStorage.setItem('v2-ui-theme', 'dark');
    localStorage.setItem('v2-schedule-prefs', JSON.stringify({ limits: ['50', '100'], kinds: ['nitro', 'regular'], hidePastDays: true }));
    const cap = count => ({ hours: Array(24).fill(count), days: {}, weekdays: {}, equalize: false, weekOn: true, monthOn: true });
    localStorage.setItem('v2-capacity-nitro', JSON.stringify({ '50': cap(3), '100': cap(2) }));
    localStorage.setItem('v2-capacity-regular', JSON.stringify({ '50': cap(1), '100': cap(1) }));
  });
  const url = process.env.HOVER_PROFILE_URL || 'http://127.0.0.1:3107';
  if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(url)) throw new Error('Use a local Demo server');
  await page.goto(`${url}/#schedule`);
  await page.getByRole('tab', { name: /Демо/ }).click();
  await page.getByRole('button', { name: 'Войти для проверки' }).click();
  await page.locator('.v2-opt-block[data-row="7"]').waitFor();
  await page.mouse.move(0, 0);
  const points = await page.locator('.v2-opt-block[data-row="7"], .v2-opt-block[data-row="8"]').evaluateAll(days => days.flatMap(day =>
    ['7-nitro-50-0', '7-nitro-50-1', '7-nitro-100-0', '7-regular-50-0'].flatMap(lane => {
      lane = lane.replace(/^7-/, `${day.getAttribute('data-row')}-`);
      return [...day.querySelectorAll(`[data-slot][data-lane="${lane}"]`)].slice(6, 42).map(el => {
        const r = el.getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
      });
    })));
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Performance.enable');
  const metrics = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(m => [m.name, m.value]));
  const results = [];
  const modes = process.env.HOVER_PROFILE_ABLATE === '1' ? ['original', 'without-root-selector', 'original', 'without-root-selector'] : ['current', 'current', 'current'];
  const removedRules = [];
  for (const mode of modes) {
    if (mode === 'without-root-selector' && !removedRules.length) {
      removedRules.push(...await page.evaluate(() => {
        const removed = [];
        [...document.styleSheets].forEach((sheet, sheetIndex) => {
          for (let i = sheet.cssRules.length - 1; i >= 0; i--) {
            const rule = sheet.cssRules[i];
            if (rule.selectorText?.includes('.v2-opt[data-lane*=')) {
              removed.push({ sheetIndex, index: i, text: rule.cssText }); sheet.deleteRule(i);
            }
          }
        });
        return removed;
      }));
      if (!removedRules.length) throw new Error('Root selector not found');
    } else if (mode === 'original' && removedRules.length) {
      await page.evaluate(rules => rules.toReversed().forEach(r => document.styleSheets[r.sheetIndex].insertRule(r.text, r.index)), removedRules);
      removedRules.length = 0;
    }
    // Warm up before collecting, keeping setup and screenshots outside the measurement.
    for (const point of points.slice(0, 12)) await page.mouse.move(point.x, point.y);
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const events = [];
    const collect = ({ value }) => events.push(...value);
    cdp.on('Tracing.dataCollected', collect);
    await cdp.send('Tracing.start', { categories: 'devtools.timeline', transferMode: 'ReportEvents' });
    const before = await metrics();
    for (const point of points) await page.mouse.move(point.x, point.y);
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const after = await metrics();
    const complete = new Promise(resolve => cdp.once('Tracing.tracingComplete', resolve));
    await cdp.send('Tracing.end'); await complete;
    cdp.off('Tracing.dataCollected', collect);
    const summary = name => {
      const selected = events.filter(e => e.name === name && e.ph === 'X');
      const times = selected.map(e => e.dur / 1000).sort((a, b) => a - b);
      return { count: times.length, totalMs: times.reduce((a, b) => a + b, 0), p95Ms: times[Math.floor(times.length * .95)] || 0, maxMs: times.at(-1) || 0,
        elements: selected.reduce((sum, e) => sum + (e.args?.elementCount || 0), 0) };
    };
    const delta = Object.fromEntries(['RecalcStyleCount', 'RecalcStyleDuration', 'LayoutCount', 'LayoutDuration', 'ScriptDuration', 'TaskDuration'].map(key => [key, after[key] - before[key]]));
    const result = { mode, moves: points.length, delta, style: summary('UpdateLayoutTree'), layout: summary('Layout'), paint: summary('Paint'), event: summary('EventDispatch') };
    results.push(result); console.log(JSON.stringify(result));
  }
  const dimensions = await page.locator('.v2-opt').evaluate(root => ({ nodes: root.querySelectorAll('*').length, slots: root.querySelectorAll('[data-slot]').length }));
  await writeFile(process.argv[2], JSON.stringify({ url, dimensions, results }, null, 2) + '\n');
} finally { await browser.close(); }
