// 分图的人和活：开一页、等一会儿、跑一段 JS、截一张竖屏图。
// node docs/lab/2026-11-07-3d-pixel/tools/lifeprobe.mjs <端口> "<查询串>" "<JS 表达式>" [截图路径] [等待毫秒]
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
const [port = '5382', q = '', js = '', out = '', wait = '2500'] = process.argv.slice(2);
const browser = await pw.chromium.launch({
  executablePath: existsSync(exe) ? exe : undefined,
  args: ['--use-gl=angle', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 1,
  hasTouch: true,
  locale: 'zh-CN',
});
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.goto(`http://localhost:${port}/clubvista.html?castreset=1&${q}`);
await page.waitForFunction(() => window.__vista?.play && window.__cast, null, { timeout: 60000 });
await page.waitForTimeout(+wait);
if (js) console.log(JSON.stringify(await page.evaluate(js), null, 1));
if (out) await page.screenshot({ path: out });
console.log(errors.length ? `ERR:\n${errors.join('\n')}` : 'ok');
await browser.close();
