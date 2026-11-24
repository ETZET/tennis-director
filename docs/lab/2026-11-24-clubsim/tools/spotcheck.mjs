// 站位核对：clubwalk/sim/spots.ts 的每个站位在世界导航（clubwalk 的 play.nav，所有区域都建好）里站不站得住。
//   node docs/lab/2026-11-24-clubsim/tools/spotcheck.mjs [--json 输出.json]
//   自己起一个 vite（端口 SPOTCHECK_PORT，默认 5182）；已经有 dev server 开着就给 SPOTCHECK_URL=http://localhost:5173
//
// 怎么查（导航 = clubsite/play/nav.ts 的 NavMap）：
//   - 站着的位置、排队的点、窗口边等餐的点（pickup）、门：standAt(x, z) 不是 null（脚下能站、身体一圈没压到墙、网、桌子、水、围网、摆件）；
//   - 坐的位置（pose 'sit'，y 不给或贴地）：人坐在长椅 / 桌凳的脚印里（导航挡着），查 height(x, z) 有地面、
//     旁边 1.2 米以内有一个 standAt 的点（走过去停在那儿再坐下）；
//   - 给了 y 的矮座（喷泉池沿：座位离旁边能站的地 < 0.4 米）照坐的查；
//   - 高处的位置（y ≥ 0.3：看台、裁判椅、车窗里、楼上）、藏起来的（hidden，只查 door）、水里的（y < 0）：不查站位；
//   - 走得到：从大门里（59, 0.6）寻路（findPath）到每个能站的点（坐的 = 旁边那个点、门），终点离目标 < 0.35 米。
// 没过的列出来（地点、第几个、坐标、原因、最近能站的点），退出码 1。
import { existsSync, readdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

const repo = resolve(import.meta.dirname, '../../../..');
const nm = resolve(repo, 'node_modules');
const require = createRequire(`${nm}/`);
let pw;
try {
  pw = require('playwright');
} catch {
  const d = readdirSync(`${nm}/.pnpm`).find((n) => n.startsWith('playwright-core@'));
  pw = require(`${nm}/.pnpm/${d}/node_modules/playwright-core`);
}
const exe = `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;

const args = process.argv.slice(2);
const jsonOut = args.includes('--json') ? args[args.indexOf('--json') + 1] : null;

let server = null;
let base = process.env.SPOTCHECK_URL;
if (!base) {
  const { createServer } = await import(require.resolve('vite', { paths: [resolve(repo, 'apps/sandbox')] }));
  const port = Number(process.env.SPOTCHECK_PORT ?? 5182);
  server = await createServer({
    root: resolve(repo, 'apps/sandbox'),
    configFile: resolve(repo, 'apps/sandbox/vite.config.ts'),
    logLevel: 'warn',
    server: { port, strictPort: true, host: '127.0.0.1' },
  });
  await server.listen();
  base = `http://127.0.0.1:${port}`;
}

const browser = await pw.chromium.launch({
  executablePath: existsSync(exe) ? exe : undefined,
  args: ['--use-gl=angle', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 300)));
await page.goto(`${base}/clubwalk.html?eager=1&life=0&cast=0&clouds=0`);
await page.waitForFunction(() => window.__clubwalk?.play?.nav, null, { timeout: 180000 });
await page.waitForTimeout(1500);

const res = await page.evaluate(async () => {
  const { SPOTS } = await import('/src/clubwalk/sim/spots.ts');
  const { PLACES } = await import('/src/clubsite/sim/places.ts');
  const nav = window.__clubwalk.play.nav;
  const r3 = (v) => Math.round(v * 100) / 100;
  /** 离 (x, z) 最近的能站的点（1.5 米以内，0.1 米一圈） */
  const nearest = (x, z, R = 1.5) => {
    for (let r = 0.1; r <= R + 1e-9; r += 0.1)
      for (let k = 0; k < 24; k++) {
        const a = (k / 24) * Math.PI * 2;
        const px = x + Math.cos(a) * r;
        const pz = z + Math.sin(a) * r;
        if (nav.standAt(px, pz) !== null) return [r3(px), r3(pz), r3(r)];
      }
    return null;
  };
  /**
   * 已知的例外：站位在场景导航给总监划的禁区里（不是墙、不是摆件，人本来就该站在那儿），列出来、不算没过。
   * clubcourts 的 KIDS_ZONE（青训西场孩子那一块 + 家长那一条，layout.ts）：play.ts 把它整块挡住，"训练中总监不能进"；
   * 引擎的孩子、家长要进去 → 演出走到 door / 禁区边上以后直线走进去（不寻路）。
   */
  const KIDS_ZONE = { x0: -13.0, x1: -0.75, z0: -2.05, z1: 12.6 };
  const ZONES = { 'courts.lesson': KIDS_ZONE, 'courts.lesson.parents': KIDS_ZONE };
  const inZone = (id, x, z) => {
    const r = ZONES[id];
    return r && x >= r.x0 - 0.3 && x <= r.x1 + 0.3 && z >= r.z0 - 0.3 && z <= r.z1 + 0.3;
  };
  const excepts = [];
  /** 走得到：大门里 → (x, z) */
  const GATE_IN = [59.0, 0.6];
  let paths = 0;
  const reach = (x, z) => {
    paths++;
    const p = nav.findPath(GATE_IN[0], GATE_IN[1], x, z);
    if (!p) return false;
    const e = p.at(-1);
    return Math.hypot(e[0] - x, e[1] - z) < 0.35;
  };
  const fails = [];
  const stats = { stand: 0, sit: 0, queue: 0, pickup: 0, door: 0, skipped: 0 };
  const why = (x, z) => {
    const h = nav.height(x, z);
    if (h === null) return '脚下没有地面（不在导航里 / 水里 / 墙里）';
    if (nav.clearAt(x, z) === null) return '身体一圈有一边站不住（贴着边、台阶、水边）';
    if (nav.hitsBlocked(x, z, nav.body)) return '压到挡路的东西（摆件、网、围网、墙）';
    return '?';
  };
  for (const p of PLACES) {
    const s = SPOTS[p.id];
    if (!s) {
      fails.push({ id: p.id, what: '没有站位' });
      continue;
    }
    if (s.door) {
      stats.door++;
      if (nav.standAt(s.door.x, s.door.z) === null)
        fails.push({
          id: p.id,
          what: 'door',
          at: [s.door.x, s.door.z],
          why: why(s.door.x, s.door.z),
          near: nearest(s.door.x, s.door.z),
        });
      else if (!reach(s.door.x, s.door.z)) fails.push({ id: p.id, what: 'door', at: [s.door.x, s.door.z], why: '走不到' });
    }
    if (s.hidden) {
      stats.skipped += s.spots.length;
      continue;
    }
    s.spots.forEach((q, i) => {
      if (q.y !== undefined && (q.y >= 0.3 || q.y < -0.2)) {
        // 矮的座（喷泉池沿、泳池池沿）：座位离旁边的地 < 0.4 米 → 照坐的查（旁边能站、走得到）；别的（看台、高椅、车窗里）不查
        const near = q.pose === 'sit' ? nearest(q.x, q.z, 1.2) : null;
        const h = near ? nav.height(near[0], near[1]) : null;
        if (!near || h === null || q.y - h >= 0.4) {
          stats.skipped++;
          return;
        }
        stats.sit++;
        if (!reach(near[0], near[1]))
          fails.push({ id: p.id, what: `spot ${i}（坐）`, at: [q.x, q.z], why: `旁边的点 (${near[0]}, ${near[1]}) 走不到` });
        return;
      }
      if (inZone(p.id, q.x, q.z) && nav.clearAt(q.x, q.z) !== null) {
        excepts.push({ id: p.id, what: `spot ${i}`, at: [q.x, q.z] });
        return;
      }
      if (q.pose === 'sit') {
        stats.sit++;
        const near = nearest(q.x, q.z, 1.2);
        if (nav.height(q.x, q.z) === null && !(p.id === 'pool.edge'))
          fails.push({ id: p.id, what: `spot ${i}（坐）`, at: [q.x, q.z], why: '座位底下没有地面', near });
        else if (!near) fails.push({ id: p.id, what: `spot ${i}（坐）`, at: [q.x, q.z], why: '1.2 米以内没有能站的点' });
        else if (!reach(near[0], near[1]))
          fails.push({ id: p.id, what: `spot ${i}（坐）`, at: [q.x, q.z], why: `旁边的点 (${near[0]}, ${near[1]}) 走不到` });
        return;
      }
      stats.stand++;
      if (nav.standAt(q.x, q.z) === null)
        fails.push({ id: p.id, what: `spot ${i}`, at: [q.x, q.z], why: why(q.x, q.z), near: nearest(q.x, q.z) });
      else if (!reach(q.x, q.z)) fails.push({ id: p.id, what: `spot ${i}`, at: [q.x, q.z], why: '走不到' });
    });
    (s.queue ?? []).forEach((q, i) => {
      stats.queue++;
      if (nav.standAt(q.x, q.z) === null)
        fails.push({ id: p.id, what: `queue ${i}`, at: [q.x, q.z], why: why(q.x, q.z), near: nearest(q.x, q.z) });
      else if (!reach(q.x, q.z)) fails.push({ id: p.id, what: `queue ${i}`, at: [q.x, q.z], why: '走不到' });
    });
    (s.pickup ?? []).forEach((q, i) => {
      stats.pickup++;
      if (nav.standAt(q.x, q.z) === null)
        fails.push({ id: p.id, what: `pickup ${i}`, at: [q.x, q.z], why: why(q.x, q.z), near: nearest(q.x, q.z) });
      else if (!reach(q.x, q.z)) fails.push({ id: p.id, what: `pickup ${i}`, at: [q.x, q.z], why: '走不到' });
    });
  }
  return { fails, excepts, stats, paths, places: PLACES.length };
});

await browser.close();
if (server) await server.close();

const { fails, excepts, stats, paths, places } = res;
console.log(
  `地点 ${places}：站着 ${stats.stand}、坐 ${stats.sit}、排队 ${stats.queue}、等餐 ${stats.pickup}、门 ${stats.door}、不查（高处 / 水里 / 藏着）${stats.skipped}；寻路 ${paths} 条`,
);
if (excepts.length)
  console.log(
    `例外 ${excepts.length} 个（在总监的禁区里，见 ZONES）：${[...new Set(excepts.map((e) => e.id))].join('、')}`,
  );
if (errors.length) console.log(`页面报错 ${errors.length} 条：\n  ${errors.join('\n  ')}`);
for (const f of fails)
  console.log(
    `✗ ${f.id} ${f.what}${f.at ? ` @ (${f.at.join(', ')})` : ''}：${f.why ?? ''}${f.near ? ` → 最近能站 (${f.near[0]}, ${f.near[1]})，离 ${f.near[2]} 米` : ''}`,
  );
console.log(fails.length ? `没过 ${fails.length} 个` : '全过');
if (jsonOut) writeFileSync(jsonOut, JSON.stringify(res, null, 1));
process.exit(fails.length ? 1 : 0);
