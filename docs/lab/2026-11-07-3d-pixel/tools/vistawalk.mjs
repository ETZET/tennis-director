// clubvista 能不能走通：每条路线 = 在某张图的某个入口站好 → 点地面（play.tapWorld，A* 寻路）走到目标 → 看到没到、出口转场换没换图。
// node docs/lab/2026-11-07-3d-pixel/tools/vistawalk.mjs [端口 5343]
// 打一张表：路线、寻路找没找到、走了多少秒（模拟时间）、终点离目标多远、转场以后在哪张图。
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
const [port = '5343'] = process.argv.slice(2);

/** [名字, 图, 起点（本图坐标）, 目标（本图坐标）, 期望转场到哪张图（null = 只走到）] */
const ROUTES = [
  ['到达：下车 → 前台', 'arrive', [11, 42.2], [20.4, 14.6], null],
  ['到达：下车 → 歇脚长椅', 'arrive', [11, 42.2], [13.4, 9.2], null],
  ['到达：下车 → 山口（→ 球场）', 'arrive', [11, 42.2], [23.5, -3.6], 'court'],
  ['球场：南口 → 场里', 'court', [10, 57.8], [14, 40], null],
  ['球场：南口 → 凉棚', 'court', [10, 57.8], [29.2, 37.4], null],
  ['球场：南口 → 东口（→ 泳池）', 'court', [10, 57.8], [40, 22.8], 'oasis'],
  ['球场：南口 → 北崖石阶（→ 练习场）', 'court', [10, 57.8], [-6, -3.4], 'practice'],
  ['球场：南口 → 回到达', 'court', [14, 57.4], [10.2, 61.4], 'arrive'],
  ['泳池：西口 → 躺椅', 'oasis', [-8, 46.9], [12.6, 45.6], null],
  ['泳池：西口 → 咖啡座', 'oasis', [-8, 46.9], [36, 19.6], null],
  ['泳池：咖啡座 → 西口（→ 球场）', 'oasis', [36, 19.6], [-12, 46.8], 'court'],
  ['练习场：南口 → 场里', 'practice', [23.4, 55.4], [13, 40], null],
  ['练习场：南口 → 凉棚', 'practice', [23.4, 55.4], [16, 7.2], null],
  ['练习场：凉棚 → 南口（→ 球场）', 'practice', [16, 7.2], [21.4, 59.4], 'court'],
];

const browser = await pw.chromium.launch({
  executablePath: existsSync(exe) ? exe : undefined,
  args: ['--use-gl=angle', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: true });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
let fails = 0;
for (const [name, map, from, to, expect] of ROUTES) {
  await page.goto(`http://localhost:${port}/clubvista.html?map=${map}&at=${from.join(',')}&clouds=0`);
  await page.waitForFunction(() => window.__vista?.play, null, { timeout: 60000 });
  await page.waitForTimeout(600);
  const r = await page.evaluate(
    async ([to]) => {
      const v = window.__vista;
      const b = v.built.find((m) => m.def.id === v.cur());
      v.play.tapWorld(to[0] + b.ox, to[1]);
      const planned = v.play.pathLeft();
      let t = 0;
      let best = Infinity;
      for (; t < 90; t += 0.5) {
        v.step(0.5);
        const s = v.play.state();
        const d = Math.hypot(s.x - b.ox - to[0], s.z - to[1]);
        best = Math.min(best, d);
        if (v.cur() !== b.def.id) break;
        if (d < 0.6 || (v.play.pathLeft() === 0 && Math.hypot(s.speed ?? 0) < 0.01 && t > 2)) break;
      }
      return { planned, t, best };
    },
    [to],
  );
  // 转场是真实时间（requestAnimationFrame）：等它走完
  if (expect) await page.waitForFunction((m) => window.__vista.cur() === m, expect, { timeout: 20000 }).catch(() => {});
  const now = await page.evaluate(() => window.__vista.cur());
  const ok = expect ? now === expect : r.best < 1.2;
  if (!ok) fails++;
  console.log(
    `${ok ? 'ok  ' : 'FAIL'} ${name.padEnd(22)} 寻路 ${r.planned > 0 ? `${r.planned.toFixed(1)} 米` : '没找到'} · 走 ${r.t.toFixed(1)} 秒 · 离目标最近 ${r.best.toFixed(2)} 米 · 现在在 ${now}`,
  );
}
console.log(errors.length ? `页面报错：\n${errors.join('\n')}` : '页面没有报错');
console.log(fails ? `${fails} 条没走通` : '全部走通');
await browser.close();
