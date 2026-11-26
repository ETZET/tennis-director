// 走路检查（redo-calm.md）：clubwalk 按 route 依次点地面走过去，每 0.15 秒记一次总监的位置，看每个点到没到（没到 = 空气墙或挡路）。
// node walkcheck.mjs "x,z;x,z;…" [秒] [端口]
import { existsSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../../../../node_modules');
const require = createRequire(`${root}/`);
let pw;
try {
  pw = require('playwright');
} catch {
  const d = readdirSync(`${root}/.pnpm`).find((n) => n.startsWith('playwright-core@'));
  pw = require(`${root}/.pnpm/${d}/node_modules/playwright-core`);
}
const exe = `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;
const [route, secs = '40', port = '5342'] = process.argv.slice(2);
const pts = route.split(';').map((p) => p.split(',').map(Number));
const browser = await pw.chromium.launch({
  executablePath: existsSync(exe) ? exe : undefined,
  args: ['--use-gl=angle', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
await page.goto(`http://localhost:${port}/clubwalk.html?hour=12&weather=clear&route=${encodeURIComponent(route)}`);
const track = [];
// 每 0.15 秒记一次（总监走得快，1 秒一记会跳过路过的点）
for (let t = 0; t < +secs / 0.15; t++) {
  await page.waitForTimeout(150);
  const p = await page.evaluate(() => {
    const d = window.__walk?.director;
    return d ? [d.position.x, d.position.z] : null;
  });
  if (p) track.push(p);
}
await browser.close();
let ok = true;
for (const [x, z] of pts) {
  const best = Math.min(...track.map(([a, b]) => Math.hypot(a - x, b - z)));
  const hit = best < 0.6;
  ok &&= hit;
  console.log(`${hit ? 'ok  ' : 'MISS'} (${x}, ${z})  最近 ${best.toFixed(2)} 米`);
}
console.log(ok ? '全部走到' : '有点没走到');
