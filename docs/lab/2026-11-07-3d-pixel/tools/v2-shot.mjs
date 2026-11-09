// node shot.mjs <url> <out.png> [w] [h] [wait]
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
// 在仓库根目录运行（desert3d-v2 用）
const require = createRequire(resolve('node_modules') + '/');
const pw = require(resolve('node_modules/.pnpm/playwright-core@1.63.0/node_modules/playwright-core'));
const exe = `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;
const [url, out, w = 390, h = 844, wait = 4000] = process.argv.slice(2);
const b = await pw.chromium.launch({ executablePath: exe, args: ['--use-angle=metal', '--enable-gpu'] });
const land = Number(w) > Number(h);
const p = await b.newPage({ viewport: { width: Number(w), height: Number(h) }, deviceScaleFactor: land ? 1 : 2 });
const errs = [];
p.on('pageerror', (e) => errs.push(String(e)));
p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
await p.goto(url);
await p.waitForTimeout(Number(wait));
await p.screenshot({ path: out });
await b.close();
console.log(errs.length ? 'ERRORS ' + errs.join('\n') : 'ok', out);
