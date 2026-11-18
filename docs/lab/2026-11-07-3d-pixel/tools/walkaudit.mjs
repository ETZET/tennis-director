// clubwalk 的导航体检：画面上看着能走的和导航真能走的对一对（apps/sandbox/src/clubwalk/audit.ts）。
// 在仓库根运行，dev server（或 vite preview）要开着：
//   node docs/lab/2026-11-07-3d-pixel/tools/walkaudit.mjs <输出目录> [区域;区域…] [--port 5317] [--check] [--update]
//   区域 = 下面 AREAS 的 id，或 "x0,x1,z0,z1" 一块范围；不给 = 所有区域 + 底图那几块
// 每块一张对照图 <id>.png（格 0.1 米 × 2 像素；红 A 穿模、蓝 B 空气墙、橙 C 脚不着地、黄 D 踩空；
// 浅绿 = 导航能站，灰 = 不能走的地面，深褐 = 画面上的障碍；右半边是正上方的真实画面）和 report.json（每片的位置、面积）；
// 再查这块显示着的区域的互动点从停车场的落客点走不走得到（够不着的列出来）。
//
// 验收（CI 跑）：--check 跟 walkaudit-baseline.json 比，有下面任何一条就退出码 1：
//   - 互动点够不着；
//   - 新冒出来一片 ≥ GATE 米²的（基线里同一种、位置挨着的没有），或者基线里那片变大了（> 1.3 倍 + 0.3）。
//   人旁边的穿模（人会动）、例外（clubwalk/nav-exceptions.ts）不算。
// --update：把这次的结果写成新基线（修好了问题、或者确认是故意的以后跑）。
// 渲染一律用 SwiftShader（软件 GL）：Mac 和 CI 的 Linux 量出来一样。
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

const require = createRequire(`${resolve('node_modules')}/`);
const pw = require('playwright-core');

/** 区域的范围（同 regions.ts；体检范围 = 矩形的包围盒） */
const AREAS = {
  clubpark: [61, 120, -45, 45],
  clubdesk: [52, 61, -8.6, 34],
  clubpickle: [33.6, 52, -8.6, 34],
  clubplaza: [29.6, 61, -44, -8.6],
  clubstadium: [-22.6, 33.6, -44, -4.4],
  clubcourts: [-38.5, 27, -4.4, 47],
  clubclay: [-1, 36, 16.6, 53],
  clubhouse: [-64.5, -40, -44, -1],
  clubpool: [-64.5, -38.5, -9.4, 20],
  clubgolf: [-64.5, 96, 51.4, 78],
  clubfood: [-46, -21.4, -44, -9.4],
  // 不归区域的：青训东头、长廊西段、草坪南边
  rest_east: [27, 36, -4.4, 16.6],
  rest_south: [-38.5, 61, 34, 53],
};
/** 验收：新冒出来的片多大才算 */
const GATE = 0.5;
const BASELINE = resolve(import.meta.dirname, 'walkaudit-baseline.json');

const argv = process.argv.slice(2);
const flag = (k) => argv.includes(k);
const opt = (k, d) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : d);
const pos = argv.filter((a, i) => !a.startsWith('--') && !argv[i - 1]?.startsWith('--port'));
const [outDir = 'walkaudit', which] = pos;
const port = opt('--port', '5317');
mkdirSync(outDir, { recursive: true });
const list = which
  ? which.split(';').map((w) => (AREAS[w] ? [w, AREAS[w]] : [`r_${w.replace(/,/g, '_')}`, w.split(',').map(Number)]))
  : Object.entries(AREAS);

// 浏览器：Mac 上用本机装好的 Chrome for Testing（同 valley-accept.mjs），别处用 playwright-core install 装的
const mac = `${process.env.HOME}/Library/Caches/ms-playwright`;
let executablePath;
if (existsSync(mac)) {
  const { readdirSync } = await import('node:fs');
  const chr = readdirSync(mac)
    .filter((n) => /^chromium-\d+$/.test(n))
    .sort()
    .pop();
  const p = chr && `${mac}/${chr}/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;
  if (p && existsSync(p)) executablePath = p;
}
const b = await pw.chromium.launch({
  executablePath,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.goto(`http://localhost:${port}/clubwalk.html?audit=1&eager=1&cast=0&pause=1&clouds=0`);
await page.waitForFunction(() => window.__navAudit, null, { timeout: 300000 });
const report = {};
for (const [id, [x0, x1, z0, z1]] of list) {
  const t0 = Date.now();
  const r = await page.evaluate(async (a) => window.__navAudit(a), { x0, x1, z0, z1 });
  writeFileSync(`${outDir}/${id}.png`, Buffer.from(r.png.split(',')[1], 'base64'));
  // 互动点够不够得着（从开局的停车场落客点出发）
  const reach = await page.evaluate(async (a) => window.__navReach(a, [66, -1.5]), { x0, x1, z0, z1 });
  report[id] = { area: { x0, x1, z0, z1 }, samples: r.samples, clusters: r.clusters, reach };
  const n = (k) =>
    r.clusters
      .filter((c) => c.kind === k && !c.exc)
      .reduce((s, c) => s + c.area, 0)
      .toFixed(1);
  console.log(
    `${id}: A ${n('A')} m² · B ${n('B')} · C ${n('C')} · D ${n('D')}（不含例外）  (${r.clusters.length} 片, ${Date.now() - t0} ms)` +
      ` · 互动点 ${reach.n - reach.bad.length}/${reach.n} 够得着`,
  );
  for (const x of reach.bad) console.log(`   够不着 ${x.id} @${x.at} ${x.why}`);
}
writeFileSync(`${outDir}/report.json`, JSON.stringify(report, null, 1));
await b.close();
if (errors.length) console.log('页面报错：', errors.slice(0, 10));

/** 验收算的片：不是例外、够大；穿模（A）旁边有人的不算（人会动，挡路圆跟着人走，身子擦一下导航管不着） */
const gated = (c, min) =>
  !c.exc && c.area >= min && !(c.kind === 'A' && (c.near ?? []).some((n) => n.startsWith('人:')));
const slim = (c) => ({ kind: c.kind, area: c.area, cx: c.cx, cz: c.cz, box: c.box });

if (flag('--update')) {
  const base = existsSync(BASELINE) && which ? JSON.parse(readFileSync(BASELINE, 'utf8')) : {};
  for (const [id, v] of Object.entries(report)) base[id] = v.clusters.filter((c) => gated(c, GATE * 0.6)).map(slim);
  writeFileSync(BASELINE, `${JSON.stringify(base, null, 1)}\n`);
  console.log(`基线写到 ${BASELINE}`);
}

if (flag('--check')) {
  const base = JSON.parse(readFileSync(BASELINE, 'utf8'));
  const fails = [];
  const near = (p, q) =>
    Math.min(p.box.x1, q.box.x1) - Math.max(p.box.x0, q.box.x0) > -0.3 &&
    Math.min(p.box.z1, q.box.z1) - Math.max(p.box.z0, q.box.z0) > -0.3;
  for (const [id, v] of Object.entries(report)) {
    for (const x of v.reach.bad) fails.push(`${id}: 互动点 ${x.id} 够不着（${x.why}）`);
    const old = base[id];
    if (!old) {
      fails.push(`${id}: 基线里没有这块（新区域先 --update）`);
      continue;
    }
    for (const c of v.clusters.filter((c) => gated(c, GATE))) {
      const m = old.find((o) => o.kind === c.kind && near(o, c));
      const what = { A: '穿模', B: '空气墙', C: '脚不着地', D: '踩空' }[c.kind];
      if (!m) fails.push(`${id}: 新的${what} ${c.area} m² @(${c.cx}, ${c.cz})`);
      else if (c.area > m.area * 1.3 + 0.3) fails.push(`${id}: ${what} @(${c.cx}, ${c.cz}) 变大 ${m.area} → ${c.area} m²`);
    }
  }
  if (errors.length) fails.push(`页面报错 ${errors.length} 条`);
  if (fails.length) {
    console.log(`\n导航体检没过（${fails.length} 条）：\n${fails.map((f) => `  ✗ ${f}`).join('\n')}`);
    console.log(`对照图在 ${outDir}/；确认是故意的：写进 clubwalk/nav-exceptions.ts，或者修好以后 --update`);
    process.exit(1);
  }
  console.log('\n导航体检过了：没有新的对不上，互动点都够得着');
}
