// node sheet.mjs out.png cols x y w h scale label1=file1 ...
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
// 在仓库根目录运行（desert3d-v2 用）
import { readFileSync } from 'node:fs';
const require = createRequire(resolve('node_modules') + '/');
const pw = require(resolve('node_modules/.pnpm/playwright-core@1.63.0/node_modules/playwright-core'));
const exe = `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;
const [out, cols, x, y, w, h, sc, ...items] = process.argv.slice(2);
const C = Number(cols), W = w * sc, Hh = h * sc;
const cells = items.map((it) => { const [lab, f] = it.split('='); return `<div style="position:relative;width:${W}px;height:${Hh}px;overflow:hidden"><img src="data:image/png;base64,${readFileSync(f).toString('base64')}" style="image-rendering:pixelated;transform-origin:0 0;transform:scale(${sc}) translate(-${x}px,-${y}px)"><span style="position:absolute;left:4px;top:4px;background:#1b1410cc;color:#f4ead8;font:12px sans-serif;padding:1px 5px;border-radius:3px">${lab}</span></div>`; });
const b = await pw.chromium.launch({ executablePath: exe });
const rows = Math.ceil(cells.length / C);
const p = await b.newPage({ viewport: { width: C * W + (C - 1) * 4, height: rows * Hh + (rows - 1) * 4 } });
await p.setContent(`<body style="margin:0;background:#1b1410"><div style="display:grid;grid-template-columns:repeat(${C},${W}px);gap:4px">${cells.join('')}</div></body>`);
await p.waitForTimeout(300);
await p.screenshot({ path: out });
await b.close();
