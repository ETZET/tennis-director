// clubwalk 的导航体检在游戏画面里看（配 walkaudit.mjs）：每个地点跑一次体检（周围 ±R 米）、把标记贴进场景，总监站过去截一张竖屏。
//   node docs/lab/2026-11-07-3d-pixel/tools/walkspots.mjs <输出目录> "名字@x,z;名字@x,z[,半径];…" [端口] [px]
// 标记：红 A 穿模、蓝 B 空气墙、橙 C 脚不着地、黄 D 踩空、绿 = 导航能站的边。总监站的点要能站（站不住就放在最近能站的地方）。
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

const require = createRequire(`${resolve('node_modules')}/`);
const pw = require('playwright-core');
// 浏览器：Mac 上用本机装好的 Chrome for Testing（同 walkaudit.mjs），别处用 playwright-core install 装的
const cache = `${process.env.HOME}/Library/Caches/ms-playwright`;
const chr = existsSync(cache)
  ? readdirSync(cache)
      .filter((n) => /^chromium-\d+$/.test(n))
      .sort()
      .pop()
  : null;
const mac = chr && `${cache}/${chr}/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;
const exe = mac && existsSync(mac) ? mac : undefined;

const [outDir = 'walkspots', spots = '', port = '5317', px = '2'] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
const list = spots
  .split(';')
  .filter(Boolean)
  .map((s) => {
    const [name, xz] = s.split('@');
    const [x, z, r = 12] = xz.split(',').map(Number);
    return { name, x, z, r };
  });

const b = await pw.chromium.launch({ executablePath: exe, args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
const page = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(`http://localhost:${port}/clubwalk.html?audit=1&eager=1&cast=0&clouds=0&px=${px}&hour=12&tspeed=0`);
await page.waitForFunction(() => window.__navAudit, null, { timeout: 120000 });
for (const s of list) {
  const res = await page.evaluate(async ({ x, z, r }) => {
    const w = window.__walk;
    const nav = w.play.nav;
    const p = nav.nearestFree ? nav.nearestFree(x, z, 6) : null;
    const [tx, tz] = p ? [p[0] ?? p.x, p[1] ?? p.z] : [x, z];
    w.play.teleport(tx, tz);
    for (let i = 0; i < 40; i++) w.step(1 / 60);
    const a = await window.__navAudit({ x0: x - r, x1: x + r, z0: z - r, z1: z + r }, { overlay: true });
    for (let i = 0; i < 2; i++) w.step(1 / 60);
    return {
      at: [tx, tz],
      clusters: a.clusters
        .filter((c) => c.area >= 0.4)
        .map((c) => `${c.kind} ${c.area}m² @${c.cx},${c.cz} ${c.dh ?? ''} ${(c.near ?? []).join(',')}`),
    };
  }, s);
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${outDir}/${s.name}.png` });
  console.log(s.name, `总监站在 ${res.at.map((v) => v.toFixed(1))}`);
  for (const c of res.clusters) console.log(`  ${c}`);
}
if (errors.length) console.log('页面报错：', errors.slice(0, 10));
await b.close();
