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

const ev = (f, a) => page.evaluate(f, a);
await ev(() => window.__td.answer(1));
const A = (p, t) => ev(([p, t]) => window.__td.assign(p, t), [p, t]);
console.log('sweep', await A('director', 'o1_sweep'), await A('dale', 'o1_sweep'));
const runUntil = (pred, max = 20000) => ev(([src, max]) => { const f = new Function('s', 'return ' + src); let g = 0;
  while (!f(window.__td.session().s) && g++ < max) window.__td.fastForward(1); return window.__td.session().s.t; }, [pred.toString(), max]);
await runUntil("s.facilities.outer_1 === 'swept'");
console.log('net', await A('director', 'o1_net'), await A('dale', null));
await runUntil("s.facilities.outer_1 === 'playable'");
await A('director', null); await A('dale', null);
const t0 = await ev(() => window.__td.session().s.t);
for (const dd of [0, 2, 4, 6, 8, 12]) {
  const info = await ev(([t0, dd]) => { const S = window.__td.session(); const target = Math.floor(t0 / 1440) * 1440 + dd * 1440 + 13 * 60;
    let g = 0; while (S.s.t < target && g++ < 400) window.__td.fastForward(Math.min(720, Math.max(1, target - S.s.t)));
    // keep everybody idle (routines would send them back)
    for (const id of Object.keys(S.s.people)) if (S.s.people[id].hired && S.s.people[id].job) window.__td.assign(id, null);
    return { day: Math.floor(S.s.t / 1440) + 1, c: Math.round(S.s.condition.outer_1), st: S.s.facilities.outer_1, weather: S.s.weather,
      people: Object.values(S.s.people).filter((p) => p.hired).map((p) => p.id + '@' + p.at + ':' + (p.job ?? 'idle')) }; }, [t0, dd]);
  await page.addStyleTag({ content: '.td-card{visibility:hidden!important}' });
  await ev(() => { window.__td.session().paused = false; });
  await page.keyboard.press('r');
  await page.waitForTimeout(2200);
  await ev(() => { window.__td.session().paused = true; });
  const shot = join(out, `court1-d${String(dd).padStart(2, '0')}-c${info.c}.png`);
  await page.screenshot({ path: shot });
  console.log(JSON.stringify({ ...info, shot }));
}
console.log(JSON.stringify({ errors }));
await browser.close(); srv.close();
