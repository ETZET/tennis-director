// 用法：node docs/lab/2026-11-04-playability/tools/shot.mjs <demo目录> [等待毫秒] [交互脚本.mjs]
// 在 390×844、deviceScaleFactor 2 下打开 <demo目录>/index.html，存 <demo目录>/shot.png。
// 交互脚本可选：export default async (page) => { ... }，在截图前执行（点几下、拖一下）。
import { createRequire } from 'node:module';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { existsSync } from 'node:fs';
const require = createRequire(resolve('node_modules') + '/');
let pw;
try { pw = require('playwright'); } catch { pw = require(resolve('node_modules/.pnpm/playwright-core@1.63.0/node_modules/playwright-core')); }
const exe = process.env.CHROMIUM_PATH ||
  `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;
const dir = resolve(process.argv[2]);
const wait = Number(process.argv[3] || 1500);
const browser = await pw.chromium.launch({ executablePath: existsSync(exe) ? exe : undefined });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(pathToFileURL(join(dir, 'index.html')).href);
await page.waitForTimeout(wait);
if (process.argv[4]) { const mod = await import(pathToFileURL(resolve(process.argv[4])).href); await mod.default(page); }
const out = process.env.SHOT_OUT || join(dir, 'shot.png');
await page.screenshot({ path: out });
await browser.close();
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'ok, no errors', '→', out);
