// valley 的验收（硬门槛，全过才算完成）。在仓库根运行，dev server 要开着：
//   node docs/lab/2026-11-07-3d-pixel/tools/valley-accept.mjs <输出目录> [地点表] [时刻表]
//   dev server 不在 5191：VALLEY_PORT=<端口>
//   地点表："名字@x,z;名字@x,z;…"（不给 = 下面 SPOTS 全部）；时刻表："12,17.6,21"（默认）
// 一个页面（unlock=all、cast=0、tspeed=0）里依次传送、换时刻、截图，逐项检查：
//   1. 控制台没有报错（pageerror / console.error / NaN 几何警告）
//   2. 路面上没东西：__valley.onRoad() 为空（车道两边各收 0.4 米、离地 0.15～4 米的顶点）
//   3. 不闪：每个地点在 7.0 / 17.6 / 18.3 点附近按 0.004 小时扫 12 步，整屏平均亮度不能来回跳（相邻两步方向相反、都 > 1.5%）
//   4. 性能：俱乐部那块以外，每帧绘制 ≤ 700、三角形 ≤ 450k
//   5. 画面数字（pixel-scene 规范，降到纹素分辨率 = 1 CSS 像素）：强边缘 ≤ 0.05（每张）；
//      正午饱和度 ≥ 0.35（不到 0.42 记一条提醒）
//   6. 俱乐部没被山谷盖坏：俱乐部里 4 个点，/valley.html 和 /clubwalk.html 同点同时刻的画面差 ≤ max(2%, clubwalk 自己两次加载的差 + 1.5%)
// 结果：<输出目录>/report.json、report.md，每个地点 × 时刻一张截图。退出码 0 = 全过，1 = 有没过的。
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

const root = resolve('node_modules');
const require = createRequire(`${root}/`);
const d = readdirSync(`${root}/.pnpm`).find((n) => n.startsWith('playwright-core@'));
const pw = require(`${root}/.pnpm/${d}/node_modules/playwright-core`);
const exe = `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;

/** 默认地点：每片区域几处（站得住的点） */
const SPOTS = {
  门外车道: [150, 0],
  湾口: [240, -2],
  酒店地: [175, 60],
  双棕榈: [440, 60],
  峡谷口: [300, 230],
  汽车旅馆: [330, -300],
  梅萨: [240, -300],
  过河桥: [326, -560],
  河床中: [620, -444],
  瀑布: [36, -610],
  步道山脚: [228, -930],
  观景台: [34, -990],
  市中心南: [332, -800],
  市中心: [340, -900],
  市政厅: [560, -925],
  阿莱霍: [460, -1003],
  拉斯帕尔马斯: [262, -1200],
  电影人: [560, -1080],
  球拍俱乐部: [610, -1190],
  加油站: [470, -1290],
  学校: [790, -640],
  日出公园: [1100, -540],
  向日葵: [1150, -760],
  机场: [1330, -840],
  高尔夫东: [1200, -320],
  深井: [620, -260],
  椰枣园: [860, -1100],
  东棕榈谷: [800, -130],
};

/** 同 apps/sandbox/src/valley/layout.ts 的 S（整体缩放 0.7，锚在俱乐部门口 (140, 0)，俱乐部那块不动）。SPOTS 是原尺寸写的 */
const S = (x, z) =>
  x >= -80 && x <= 140 && z >= -60 && z <= 100 ? [x, z] : [140 + (x - 140) * 0.7, (z - 0) * 0.7];

const [outDir = 'valley-accept', spotArg, hourArg] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
// 命令行给的地点表是最终的世界坐标（不再过 S）；默认表按原尺寸写，过 S
const spots = spotArg
  ? spotArg.split(';').map((s) => {
      const [name, xz] = s.split('@');
      return [name, xz.split(',').map(Number)];
    })
  : Object.entries(SPOTS).map(([n, [x, z]]) => [n, S(x, z)]);
const hours = (hourArg ?? '12,17.6,21').split(',').map(Number);
const CLUB = { x0: -80, x1: 140, z0: -60, z1: 100 };

const b = await pw.chromium.launch({
  executablePath: existsSync(exe) ? exe : undefined,
  args: ['--use-gl=angle', '--enable-unsafe-swiftshader'],
});
const page = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => {
  const t = m.text();
  if (m.type() === 'error' || /NaN/.test(t)) errors.push(t.slice(0, 200));
});
// 天气固定晴天：自动天气会在某些时刻下雨，满屏雨丝把强边缘推到 0.06～0.07，和画面本身无关（雨天另看）
// VALLEY_EXTRA：额外的页面参数（例：inv=2 = 第二版店内）
const PORT = process.env.VALLEY_PORT ?? '5191';
const EXTRA = process.env.VALLEY_EXTRA ? `&${process.env.VALLEY_EXTRA}` : '';
await page.goto(`http://localhost:${PORT}/valley.html?unlock=all&cast=0&tspeed=0&hour=12&weather=clear${EXTRA}`);
await page.waitForFunction(() => window.__walk && window.__valley?.world, null, { timeout: 60000 });
await page.waitForTimeout(3000);

const fails = [];
const warns = [];
const rows = [];

// 2. 路面
const onRoad = await page.evaluate(() => window.__valley.onRoad());
if (Object.keys(onRoad).length) fails.push(`路面上有东西：${JSON.stringify(onRoad).slice(0, 600)}`);

const go = async (x, z, h) =>
  page.evaluate(
    async ([x, z, h]) => {
      const W = window.__walk;
      W.play.teleport(x, z);
      W.day.total = h;
      W.step(1 / 60);
      for (let i = 0; i < 40; i++) {
        W.stream(1 / 60);
        await new Promise((r) => requestAnimationFrame(r));
      }
      const s = W.play.state();
      return { x: s.x, z: s.z, y: s.y };
    },
    [x, z, h],
  );
const meanLum = () =>
  page.evaluate(
    () =>
      new Promise((res) =>
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            const c = document.getElementById('c');
            const g = document.createElement('canvas');
            g.width = 40;
            g.height = 80;
            const x = g.getContext('2d');
            x.drawImage(c, 0, 0, 40, 80);
            const dd = x.getImageData(0, 0, 40, 80).data;
            let s = 0;
            for (let k = 0; k < dd.length; k += 4) s += dd[k] + dd[k + 1] + dd[k + 2];
            res(s / (dd.length / 4) / 3);
          }),
        ),
      ),
  );
const stats = async (file) => {
  const buf = await page.screenshot({ path: file });
  return page.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const w = img.width;
    const h = img.height;
    const c = new OffscreenCanvas(w, h);
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0);
    const dd = g.getImageData(0, 0, w, h).data;
    const lum = (i) => 0.2126 * dd[i] + 0.7152 * dd[i + 1] + 0.0722 * dd[i + 2];
    let S = 0;
    let big = 0;
    let n = 0;
    // 上下各去掉 60 像素（按钮、提示条）
    for (let y = 60; y < h - 60; y++)
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const mx = Math.max(dd[i], dd[i + 1], dd[i + 2]);
        const mn = Math.min(dd[i], dd[i + 1], dd[i + 2]);
        S += mx ? (mx - mn) / mx : 0;
        if (x + 1 < w && Math.abs(lum(i) - lum(i + 4)) > 60) big++;
        n++;
      }
    return { sat: +(S / n).toFixed(3), strongEdge: +(big / n).toFixed(3) };
  }, buf.toString('base64'));
};

for (const [name, [x, z]] of spots) {
  const inClub = x > CLUB.x0 && x < CLUB.x1 && z > CLUB.z0 && z < CLUB.z1;
  for (const h of hours) {
    const at = await go(x, z, h);
    if (Math.hypot(at.x - x, at.z - z) > 3) fails.push(`${name}：传送到 (${x},${z}) 站不住，落在 (${at.x.toFixed(0)},${at.z.toFixed(0)})`);
    const file = `${outDir}/${name}-${h}.png`;
    const st = await stats(file);
    const perf = await page.evaluate(() => window.__walk.perf());
    rows.push({ name, h, ...st, calls: perf.calls, tris: perf.triangles });
    if (st.strongEdge > 0.05) fails.push(`${name} ${h} 点：强边缘 ${st.strongEdge} > 0.05`);
    // 站在车道上的点画面大半是沥青（本来就该灰）：饱和度只记提醒，不能为了过门槛把路染色
    const onRoadSpot = await page.evaluate(([x, z]) => window.__valley.onCarriageway(x, z), [x, z]);
    if (h === 12 && st.sat < 0.35 && onRoadSpot) warns.push(`${name} 正午（站在车道上）：饱和度 ${st.sat} < 0.35`);
    else if (h === 12 && st.sat < 0.35) fails.push(`${name} 正午：饱和度 ${st.sat} < 0.35`);
    else if (h === 12 && st.sat < 0.42) warns.push(`${name} 正午：饱和度 ${st.sat} < 0.42`);
    if (!inClub && perf.calls > 700) fails.push(`${name} ${h} 点：绘制 ${perf.calls} > 700`);
    if (!inClub && perf.triangles > 450000) fails.push(`${name} ${h} 点：三角形 ${perf.triangles} > 450k`);
  }
  // 3. 闪烁：清早、傍晚、日落前后各扫 12 步
  for (const h0 of [7, 17.6, 18.3]) {
    await go(x, z, h0);
    let prev = await meanLum();
    // 闪 = 来回跳（亮、暗、亮）：相邻两步方向相反、而且两步都超过 1.5%。
    // 单方向的变化（日落前长影子一点点挪、天一点点暗）不算 —— 只看"差多少"的话，长影子盖住大半屏时正常的移动也会过 3%
    let worst = 0;
    let dPrev = 0;
    for (let i = 1; i <= 12; i++) {
      await page.evaluate((h) => {
        window.__walk.day.total = h;
        window.__walk.step(1 / 60);
      }, h0 + i * 0.004);
      const l = await meanLum();
      const dd = (l - prev) / Math.max(1, prev);
      if (Math.sign(dd) !== Math.sign(dPrev) && dPrev !== 0) worst = Math.max(worst, Math.min(Math.abs(dd), Math.abs(dPrev)));
      dPrev = dd;
      prev = l;
    }
    if (worst > 0.015) fails.push(`${name} ${h0} 点附近闪：来回跳 ${(worst * 100).toFixed(1)}%`);
  }
}
// 6. 俱乐部不能被山谷盖坏：俱乐部那块里几个点，valley 和 clubwalk 同点同时刻的画面差 ≤ 2%（像素 RGB 差和 > 40 的比例）。
//    只比画面中间（上下各去 160 像素：小地图、按钮、提示条两边不一样）
{
  const CLUB_SPOTS = [
    ['俱乐部门口', 62, -4],
    ['广场', 44, -30],
    ['会员场', -17, 25],
    ['泳池边', -50, 20],
  ];
  const cw = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  await cw.goto(`http://localhost:${PORT}/clubwalk.html?cast=0&tspeed=0&hour=12&weather=clear&life=0&clouds=0&wind=0`);
  await cw.waitForFunction(() => window.__walk, null, { timeout: 60000 });
  await cw.waitForTimeout(3000);
  // 基线：clubwalk 再开一份（俱乐部里的人、喷泉、泳池水两次加载本来就不一样），山谷只许比基线多 1.5%
  const cw2 = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  await cw2.goto(`http://localhost:${PORT}/clubwalk.html?cast=0&tspeed=0&hour=12&weather=clear&life=0&clouds=0&wind=0`);
  await cw2.waitForFunction(() => window.__walk, null, { timeout: 60000 });
  await cw2.waitForTimeout(3000);
  const vw = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  await vw.goto(`http://localhost:${PORT}/valley.html?cast=0&tspeed=0&hour=12&weather=clear&life=0&clouds=0&wind=0`);
  await vw.waitForFunction(() => window.__walk && window.__valley?.world, null, { timeout: 60000 });
  await vw.waitForTimeout(3000);
  const place = (pg, x, z) =>
    pg.evaluate(
      async ([x, z]) => {
        const W = window.__walk;
        W.play.teleport(x, z);
        for (let i = 0; i < 60; i++) {
          W.step(1 / 60);
          W.stream(1 / 60);
          await new Promise((r) => requestAnimationFrame(r));
        }
      },
      [x, z],
    );
  for (const [name, x, z] of CLUB_SPOTS) {
    await place(cw, x, z);
    await place(vw, x, z);
    // 只比画面中段 y 260…700（上面是小地图、名册、山谷才有的"调试"按钮，下面是提示条）
    const clip = { x: 0, y: 260, width: 390, height: 440 };
    const a = await cw.screenshot({ path: `${outDir}/parity-${name}-clubwalk.png`, clip });
    const c = await vw.screenshot({ path: `${outDir}/parity-${name}-valley.png`, clip });
    await place(cw2, x, z);
    const a2 = await cw2.screenshot({ clip });
    const cmp = (A, B) => vw.evaluate(
      async ([A, B]) => {
        const load = async (s) => {
          const im = new Image();
          im.src = `data:image/png;base64,${s}`;
          await im.decode();
          const cv = new OffscreenCanvas(im.width, im.height);
          const g = cv.getContext('2d');
          g.drawImage(im, 0, 0);
          return g.getImageData(0, 0, im.width, im.height).data;
        };
        const p = await load(A);
        const q = await load(B);
        let ch = 0;
        for (let k = 0; k < p.length; k += 4)
          if (Math.abs(p[k] - q[k]) + Math.abs(p[k + 1] - q[k + 1]) + Math.abs(p[k + 2] - q[k + 2]) > 40) ch++;
        return ch / (p.length / 4);
      },
      [A.toString('base64'), B.toString('base64')],
    );
    const diff = await cmp(a, c);
    const base = await cmp(a, a2);
    rows.push({ name: `对照·${name}`, h: 12, sat: `基线 ${(base * 100).toFixed(1)}%`, strongEdge: `山谷 ${(diff * 100).toFixed(1)}%`, calls: '-', tris: 0 });
    if (diff > Math.max(0.02, base + 0.015))
      fails.push(
        `俱乐部被山谷改了：${name}（${x},${z}）和 clubwalk 差 ${(diff * 100).toFixed(1)}%，clubwalk 自己两次加载差 ${(base * 100).toFixed(1)}%（见 parity-${name}-*.png）`,
      );
  }
}
if (errors.length) fails.push(`控制台报错 ${errors.length} 条：${[...new Set(errors)].slice(0, 5).join(' | ')}`);
await b.close();

const md = [
  `# valley 验收 ${new Date().toISOString()}`,
  '',
  fails.length ? `## 没过（${fails.length}）` : '## 全过',
  ...fails.map((f) => `- ${f}`),
  '',
  warns.length ? `## 提醒（${warns.length}）` : '',
  ...warns.map((w) => `- ${w}`),
  '',
  '| 地点 | 时刻 | 饱和度 | 强边缘 | 绘制 | 三角形 |',
  '|---|---|---|---|---|---|',
  ...rows.map((r) => `| ${r.name} | ${r.h} | ${r.sat} | ${r.strongEdge} | ${r.calls} | ${(r.tris / 1000).toFixed(0)}k |`),
].join('\n');
writeFileSync(`${outDir}/report.md`, md);
writeFileSync(`${outDir}/report.json`, JSON.stringify({ fails, warns, rows, onRoad }, null, 1));
console.log(fails.length ? `没过 ${fails.length} 条，见 ${outDir}/report.md` : `全过（提醒 ${warns.length} 条），见 ${outDir}/report.md`);
for (const f of fails.slice(0, 30)) console.log(' ✗', f);
process.exit(fails.length ? 1 : 0);
