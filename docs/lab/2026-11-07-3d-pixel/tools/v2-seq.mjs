// node seq.mjs <url(with pause=1)> <outPrefix> <t0,t1,...> [w h]  — 用 __d3v2.step 推进到各时刻截图，打印 life 状态
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
// 在仓库根目录运行（desert3d-v2 用）
const require = createRequire(resolve('node_modules') + '/');
const pw = require(resolve('node_modules/.pnpm/playwright-core@1.63.0/node_modules/playwright-core'));
const exe = `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;
const [url, pre, times, w = 390, h = 844] = process.argv.slice(2);
const b = await pw.chromium.launch({ executablePath: exe });
const land = Number(w) > Number(h);
const p = await b.newPage({ viewport: { width: Number(w), height: Number(h) }, deviceScaleFactor: land ? 1 : 2 });
const errs = [];
p.on('pageerror', (e) => errs.push(String(e)));
p.on('console', (m) => { if (m.type() === 'error' || m.text().startsWith('[seq]')) errs.push(m.text()); });
await p.goto(url);
await p.waitForTimeout(1500);
let now = 0;
for (const [i, ts] of times.split(',').entries()) {
  const T = Number(ts);
  const st = await p.evaluate((d) => { window.__d3v2.step(d); const l = window.__d3v2.life; return l ? JSON.stringify(l.state) : ''; }, T - now);
  now = T;
  await p.waitForTimeout(250);
  await p.screenshot({ path: `${pre}-${String(i).padStart(2, '0')}.png` });
  console.log(T, st);
}
await b.close();
console.log(errs.length ? 'ERRORS ' + errs.join('\n') : 'ok');
