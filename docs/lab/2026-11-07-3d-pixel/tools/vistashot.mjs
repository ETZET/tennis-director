// clubvista 一轮的验收截图：每张图（ONLY=plaza,street 只拍这几张；取景点 = MapDef.shot，没有就用下面的表 / 图的中心） × 竖屏 390×844 / 横屏 1280×720（12 点），同一个浏览器里连拍（比 shot.mjs 一张开一次快）。
// node docs/lab/2026-11-07-3d-pixel/tools/vistashot.mjs <输出目录> [端口 5343] [额外查询串，如 "hour=18.1"] [后缀]
// 每张：clubvista.html?map=<id>&pause=1&look=<x,z>&<额外>；文件名 <id>-port<后缀>.png / <id>-land<后缀>.png。控制台报错会打出来。
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
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
const [out, port = '5343', extra = '', suffix = ''] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
/** 每张图的取景点（本图坐标）：横屏看全图中间，竖屏对准"入口 → 目的地"那一段 */
const SHOTS = [
  { id: 'arrive', land: '14,28', port: '14,26' },
  { id: 'court', land: '14,24', port: '14,34' },
  { id: 'oasis', land: '14,22', port: '13,24' },
  { id: 'practice', land: '14,26', port: '15,28' },
];
const only = process.env.ONLY?.split(',');
/** 新图的取景点写在图自己的数据里（MapDef.shot）：先开一次页面把它们读出来（第三轮：图多了，不用每张都来改这个表） */
async function readShots(browser) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  await page.goto(`http://localhost:${port}/clubvista.html?pause=1&ui=0`);
  await page.waitForFunction(() => window.__vista, null, { timeout: 60000 });
  const defs = await page.evaluate(() =>
    window.__vista.built.map((b) => ({ id: b.def.id, shot: b.def.shot ?? null, W: b.def.W, D: b.def.D })),
  );
  await page.close();
  for (const d of defs) {
    const row = SHOTS.find((s) => s.id === d.id);
    const def = { land: `${d.W / 2},${d.D / 2}`, port: `${d.W / 2},${d.D / 2}` };
    const shot = d.shot ? { land: d.shot.land.join(','), port: d.shot.port.join(',') } : null;
    if (row) Object.assign(row, shot ?? {});
    else SHOTS.push({ id: d.id, ...(shot ?? def) });
  }
}
const browser = await pw.chromium.launch({
  executablePath: existsSync(exe) ? exe : undefined,
  args: ['--use-gl=angle', '--enable-unsafe-swiftshader'],
});
await readShots(browser);
for (const s of SHOTS) {
  if (only && !only.includes(s.id)) continue;
  for (const [kind, w, h] of [
    ['port', 390, 844],
    ['land', 1280, 720],
  ]) {
    const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1, hasTouch: true });
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    const url = `http://localhost:${port}/clubvista.html?map=${s.id}&pause=1&look=${s[kind]}${extra ? `&${extra}` : ''}`;
    await page.goto(url);
    await page.waitForFunction(() => window.__vista, null, { timeout: 60000 });
    await page.waitForTimeout(2500);
    const file = `${out}/${s.id}-${kind}${suffix}.png`;
    await page.screenshot({ path: file });
    console.log(errors.length ? `ERR ${file}:\n${errors.join('\n')}` : `ok ${file}`);
    await page.close();
  }
}
await browser.close();
