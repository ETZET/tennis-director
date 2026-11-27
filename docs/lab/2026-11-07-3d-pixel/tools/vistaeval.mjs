// clubvista 的万用截图：开一个页面 → 等 __vista → 跑一段 JS（可以 await）→ 截图。竖屏 390×844（LAND=1 横屏 1280×720）。
// node docs/lab/2026-11-07-3d-pixel/tools/vistaeval.mjs <输出.png> <端口> "<查询串，如 map=plaza&at=14,30&hour=12>" ["<JS>"] [等待毫秒 1500]
// 例：小地图   vistaeval.mjs map.png 5381 "map=plaza" "window.__game.map.open()"
//     走一段   vistaeval.mjs walk.png 5381 "map=plaza" "const v=__vista; v.play.tapWorld(14,10); v.step(8)"
// 查询串的位置也可以给完整的网址（file:// 的单文件 demo）。JS 的返回值（JSON）和页面报错会打出来。
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
const [out, port = '5343', query = '', js = '', wait = '1500'] = process.argv.slice(2);
const land = process.env.LAND === '1';
const browser = await pw.chromium.launch({
  executablePath: existsSync(exe) ? exe : undefined,
  args: ['--use-gl=angle', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({
  viewport: land ? { width: 1280, height: 720 } : { width: 390, height: 844 },
  deviceScaleFactor: 1,
  hasTouch: true,
});
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
const t0 = Date.now();
const full = query.startsWith('file:') || query.startsWith('http');
await page.goto(full ? query : `http://localhost:${port}/clubvista.html?${query}`);
await page.waitForFunction(() => window.__vista, null, { timeout: 90000 });
const ready = Date.now() - t0;
await page.waitForTimeout(800);
let ret;
if (js) ret = await page.evaluate(`(async () => { ${js} })()`);
await page.waitForTimeout(+wait);
await page.screenshot({ path: out });
const canvases = await page.evaluate(() => document.querySelectorAll('canvas').length);
console.log(
  `${errors.length ? `ERR:\n${errors.join('\n')}` : 'ok'} -> ${out} · 就绪 ${ready} 毫秒 · 画布 ${canvases} 块${ret !== undefined ? ` · 返回 ${JSON.stringify(ret)}` : ''}`,
);
await browser.close();
