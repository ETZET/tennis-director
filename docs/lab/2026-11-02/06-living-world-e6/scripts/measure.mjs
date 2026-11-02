// Usage: node measure.mjs <outDir> <seed> [days]
// Loads apps/game/dist in headless Chromium (phone 390x844), idles (never answers cards) to each day at 13:00,
// then hides the card, unpauses for a few real seconds and measures draw calls / frame time; takes a scene-only shot.
import { createReadStream, existsSync, mkdirSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join } from 'node:path';
import { createRequire } from 'node:module';
const { chromium } = createRequire(`${process.env.REPO ?? process.cwd()}/package.json`)('playwright-core');
const DIST = process.env.DIST ?? 'apps/game/dist';
const [out, seed = '37', daysArg = '1,7,30,60,98', setup = ''] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const T = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const srv = createServer((q, r) => {
  let u = decodeURIComponent((q.url ?? '/').split('?')[0]);
  if (u === '/') u = '/index.html';
  const f = join(DIST, u);
  if (!f.startsWith(DIST) || !existsSync(f) || statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'content-type': T[extname(f)] ?? 'application/octet-stream' });
  createReadStream(f).pipe(r);
});
await new Promise((ok) => srv.listen(0, '127.0.0.1', ok));
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.addInitScript(() => {
  // count GL draw calls per animation frame (same thing renderer.info.render.calls counts, incl. the shadow pass)
  window.__calls = 0;
  for (const C of [WebGLRenderingContext, WebGL2RenderingContext])
    for (const k of ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced']) {
      const f = C.prototype[k];
      if (f) C.prototype[k] = function (...a) { window.__calls++; return f.apply(this, a); };
    }
});
await page.goto(`http://127.0.0.1:${srv.address().port}/index.html?seed=${seed}&new&lang=en`);
await page.waitForFunction(() => !!window.__td?.session?.());
await page.evaluate(() => window.__td.fastForward(1));
if (setup) await page.evaluate(setup); // optional JS run once (e.g. assignments)
const res = [];
for (const d of daysArg.split(',').map(Number)) {
  const info = await page.evaluate((day) => {
    const s = window.__td.session();
    const target = (day - 1) * 1440 + 13 * 60;
    let guard = 0;
    while (s.s.t < target && !s.s.outcome && guard++ < 400) window.__td.fastForward(Math.min(720, Math.max(1, target - s.s.t)));
    return { t: s.s.t, day: Math.floor(s.s.t / 1440) + 1, weather: s.s.weather, season: s.s.season, members: s.s.stats.members,
      cond: Object.fromEntries(Object.entries(s.s.facilities).map(([k, v]) => [k, `${v}:${Math.round(s.s.condition[k] ?? 100)}`])),
      people: Object.values(s.s.people).filter((p) => p.hired).map((p) => `${p.id}@${p.at}:${p.job ?? 'idle'}`) };
  }, d);
  // hide the card so the world is visible; let the scene run 1x real time for a while
  await page.addStyleTag({ content: '.td-card{visibility:hidden!important}' });
  await page.evaluate(() => { window.__td.session().paused = false; });
  await page.waitForTimeout(2500);
  const perf = await page.evaluate(() => new Promise((ok) => {
    const ts = []; const calls = []; let last = performance.now(); let c0 = window.__calls;
    const f = (t) => { ts.push(t - last); last = t; calls.push(window.__calls - c0); c0 = window.__calls; if (ts.length < 90) requestAnimationFrame(f); else ok({ ts, calls }); };
    requestAnimationFrame(f);
  }));
  await page.evaluate(() => { window.__td.session().paused = true; });
  const ft = perf.ts.slice(5).sort((a, b) => a - b);
  const cl = perf.calls.slice(5).sort((a, b) => a - b);
  const r = { ...info, frameMsMedian: +ft[ft.length >> 1].toFixed(1), frameMsP90: +ft[Math.floor(ft.length * 0.9)].toFixed(1),
    callsMedian: cl[cl.length >> 1], callsMax: cl[cl.length - 1] };
  const shot = join(out, `scene-day${String(d).padStart(3, '0')}.png`);
  await page.screenshot({ path: shot });
  r.shot = shot;
  // home view (key r = camera reset) to see the whole garden
  await page.evaluate(() => { window.__td.session().paused = false; });
  await page.keyboard.press('r');
  await page.waitForTimeout(1800);
  await page.evaluate(() => { window.__td.session().paused = true; });
  await page.waitForTimeout(200);
  const home = join(out, `home-day${String(d).padStart(3, '0')}.png`);
  await page.screenshot({ path: home });
  r.home = home;
  res.push(r);
  console.log(JSON.stringify(r));
}
console.log(JSON.stringify({ errors }));
await browser.close(); srv.close();
