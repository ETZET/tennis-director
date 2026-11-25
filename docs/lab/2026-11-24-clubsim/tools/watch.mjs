// 俱乐部的一天：照用户的路子看几段（valley → 调试 → 观察俱乐部的一天（加速）），每段存一串手机竖屏截图 + 数（第 2 轮"画面"修的人用）。
// 先开 dev 服务器（端口 5184）。node docs/lab/2026-11-24-clubsim/tools/watch.mjs [label] [--only a,b] [--port 5184]
// 段：
//   path      用户的路子：调试 → 观察，前院 2×（截 6 张）+ "退出"按钮在不在、"调试"藏没藏
//   feet      脚溜不溜：2× / 1× / 15× 下画面里走路的人，每帧量着地那只鞋的水平漂移（站着的那只脚该钉在地上：漂移 ≈ 0）
//   court     看一块场：红土 8:35（look）、表演赛 18:50（look + 跟着球员），截镜头拉远前后
//   overview  看全图 12:15（竖屏转过来、人点、图例），小地图（截右上角）
//   desk      面板展开："总监离开前台" → 等 25 游戏分钟截前台的队 → "总监回到前台"
//   agenda    跟着一个人，展开面板看日程（同一行不重复）
//   stadium   表演赛散场 20:00–20:40 看着北看台：寻路失败几次、身子几具、看台上消失的人
//   house     跟着会所里的人：剖面时镜头往下挪
// 输出：docs/lab/2026-11-24-clubsim/shots/<label>/<段>/*.png、watch.json
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
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
const args = process.argv.slice(2);
const label = args[0] && !args[0].startsWith('--') ? args.shift() : 'watch';
const opt = (k, d) => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 ? args[i + 1] : d;
};
const PORT = opt('port', '5184');
const only = opt('only', 'path,feet,court,overview,desk,agenda,stadium,house').split(',');
const out = resolve(import.meta.dirname, `../shots/${label}`);
mkdirSync(out, { recursive: true });
const browser = await pw.chromium.launch({
  executablePath: existsSync(exe) ? exe : undefined,
  args: ['--use-gl=angle', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const log = {};
const errors = [];
const hm = (s) => s.replace(':', '');

/** 照用户的路子打开：valley → 调试 → 观察俱乐部的一天（加速） */
async function open() {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: true });
  page.on('pageerror', (e) => errors.push(String(e.stack ?? e).slice(0, 400)));
  await page.goto(`http://localhost:${PORT}/valley.html`);
  await page.waitForFunction(() => window.__clubsim, null, { timeout: 120000 });
  await page.waitForTimeout(3000);
  await page.getByRole('button', { name: '调试' }).click();
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: '观察俱乐部的一天（加速）' }).click();
  await page.waitForFunction(() => window.__clubsim.on && !window.__clubsim.jumping, null, { timeout: 60000 });
  return page;
}
async function jump(page, m) {
  await page.evaluate((m) => window.__clubsim.jump(m), m);
  await page.waitForFunction(() => !window.__clubsim.jumping, null, { timeout: 60000 });
}
async function shots(page, dir, n, gap, clip) {
  mkdirSync(`${out}/${dir}`, { recursive: true });
  const list = [];
  for (let i = 0; i < n; i++) {
    const st = await page.evaluate(() => window.__clubsim.stats());
    const f = `${out}/${dir}/${String(i).padStart(3, '0')}-${hm(st.clock)}.png`;
    await page.screenshot({ path: f, ...(clip ? { clip } : {}) });
    list.push({ f, clock: st.clock, bodies: st.bodies, walkers: st.walkers.length });
    if (gap) await page.waitForTimeout(gap);
  }
  return list;
}

/**
 * 脚溜不溜：rAF 里每帧看画面里走路的人。脚踩在地上时（站着的那只）世界坐标应该不动，迈出去的那只走身子的两倍；
 * 每帧取这个人几只鞋里挪得最少的那只，r = 它挪的 / 身子挪的：不溜 ≈ 0，整个在溜 = 1（腿不动、身子平移）。
 * 腾空的帧（身子抬起来：跑的那一跳、冲）两只脚都离地，不算溜，另外记
 */
async function feet(page, speed, ms) {
  await page.evaluate((v) => window.__clubsim.speed(v), speed);
  return page.evaluate(
    (ms) =>
      new Promise((done) => {
        const scene = window.__clubwalk.scene;
        const V = window.__clubwalk.director.position.constructor;
        const shoes = new Map();
        const last = new Map();
        const ground = [];
        let air = 0;
        let fast = 0;
        let swap = 0;
        let all = 0;
        const steps = [];
        const t0 = performance.now();
        const tick = () => {
          for (const o of scene.children) {
            if (o.name !== 'sim:actor' || !o.visible) continue;
            let ss = shoes.get(o);
            if (!ss) {
              ss = [];
              o.traverse((m) => m.userData?.part === 'shoe' && ss.push(m));
              shoes.set(o, ss);
            }
            const ps = ss.map((m) => m.getWorldPosition(new V()));
            const prev = last.get(o);
            const ph = o.userData.posePhase?.() ?? 0;
            last.set(o, { x: o.position.x, z: o.position.z, ps, ph });
            if (!prev || prev.ps.length !== ps.length || !ps.length) continue;
            const bd = Math.hypot(o.position.x - prev.x, o.position.z - prev.z);
            if (bd < 0.01 || bd > 3) continue;
            all++;
            steps.push(bd);
            if ((o.userData.simLift ?? 0) > 0.01) {
              air++;
              continue;
            }
            // 一帧走了五分之一个周期以上：站着的那只脚可能已经换了（两帧之间没有一只脚一直踩着），量不了，另记
            const stride = (o.userData.stride ?? 0.92) * (o.userData.strideK ?? 1) * o.scale.x;
            if (bd / stride > 0.2) {
              fast++;
              continue;
            }
            // 两只脚换着地的那一下（walk 的 phase 0.25 / 0.75：前脚落地、后脚抬起是同一刻）跨在这两帧中间：没有一只脚两帧都踩着，不算
            const crosses = (a, b) => [0.25, 0.75].some((c) => (a <= b ? a < c && c <= b : a < c || c <= b));
            if (o.userData.poseName?.() === 'walk' && crosses(prev.ph, ph)) {
              swap++;
              continue;
            }
            let m = Number.POSITIVE_INFINITY;
            ps.forEach((p, i) => {
              m = Math.min(m, Math.hypot(p.x - prev.ps[i].x, p.z - prev.ps[i].z));
            });
            ground.push(m / bd);
          }
          if (performance.now() - t0 < ms) requestAnimationFrame(tick);
          else {
            const g = [...ground].sort((a, b) => a - b);
            const q = (a, k) => +(a[Math.floor(a.length * k)] ?? 0).toFixed(3);
            done({
              frames: all,
              bodyStepMedian: q([...steps].sort((a, b) => a - b), 0.5),
              /** 踩地的帧：挪得最少的那只鞋 / 身子（0 = 钉在地上） */
              slideMedian: q(g, 0.5),
              slideP90: q(g, 0.9),
              /** 踩地的帧里"在溜"（> 0.3）的比例 */
              sliding: g.length ? +(g.filter((r) => r > 0.3).length / g.length).toFixed(3) : 0,
              inAir: all ? +(air / all).toFixed(2) : 0,
              tooFast: all ? +(fast / all).toFixed(2) : 0,
              footSwap: all ? +(swap / all).toFixed(2) : 0,
            });
          }
        };
        requestAnimationFrame(tick);
      }),
    ms,
  );
}

if (only.includes('path')) {
  const page = await open();
  const ui = await page.evaluate(() => ({
    debugVisible: !!document.querySelector('#debug')?.checkVisibility?.(),
    exit: !!document.querySelector('.sim-exit')?.checkVisibility?.(),
    minimap: !!document.querySelector('#minimap')?.checkVisibility?.(),
  }));
  await page.waitForTimeout(4000);
  log.path = { ui, shots: await shots(page, 'path', 6, 700) };
  await page.close();
}
if (only.includes('feet')) {
  const page = await open();
  await jump(page, 8 * 60 + 10);
  await page.evaluate(() => window.__clubsim.look(57, -3));
  await page.waitForTimeout(3000);
  log.feet = {};
  for (const sp of [2, 1, 0.2, 15]) log.feet[`${sp}x`] = await feet(page, sp, 4000);
  // 一串连着的截图（跟着一个走路的人：镜头跟着他，截他周围一块，名字小牌藏起来）：慢放（0.2×）一串、2× 一串
  await page.addStyleTag({ content: '.sim-tag { display: none !important; }' });
  for (let k = 0; k < 2; k++) {
    await page.evaluate((v) => window.__clubsim.speed(v), k ? 2 : 0.2);
    const id = await page.evaluate(() => {
      const w = window.__clubsim.stats().walkers;
      const v = window.__clubsim.view().find((q) => q.where.kind === 'travel' && (q.where.t1 - q.where.t0) > 4 && w.some((x) => x.id === q.id))
        ?? window.__clubsim.view().find((q) => q.where.kind === 'travel' && (q.where.t1 - q.where.t0) > 4);
      if (v) window.__clubsim.follow(v.id);
      return v?.id ?? null;
    });
    await page.waitForTimeout(600);
    log.feet[`seq${k}`] = { id, shots: await shots(page, `feet-${k}`, 8, 0, { x: 115, y: 330, width: 160, height: 200 }) };
    await page.waitForTimeout(3000);
  }
  await page.close();
}
if (only.includes('court')) {
  const page = await open();
  log.court = {};
  await jump(page, 8 * 60 + 35);
  await page.evaluate(() => window.__clubsim.look(17, 31));
  await page.waitForTimeout(400);
  log.court.clayIn = await shots(page, 'court-clay', 1, 0);
  await page.waitForTimeout(2600);
  log.court.clay = await shots(page, 'court-clay', 2, 800);
  await jump(page, 18 * 60 + 50);
  await page.evaluate(() => window.__clubsim.look(0, -21));
  await page.waitForTimeout(3500);
  log.court.stadium = await shots(page, 'court-stadium', 3, 900);
  const id = await page.evaluate(() => window.__clubsim.followAt('post.stadium.pros'));
  await page.waitForTimeout(3500);
  log.court.follow = { id, shots: await shots(page, 'court-follow', 2, 900) };
  log.court.fx = await page.evaluate(() => window.__clubsim.fx());
  await page.close();
}
if (only.includes('overview')) {
  const page = await open();
  await jump(page, 12 * 60 + 15);
  await page.evaluate(() => window.__clubsim.overview(true));
  await page.waitForTimeout(2500);
  log.overview = { shots: await shots(page, 'overview', 2, 1500) };
  mkdirSync(`${out}/overview`, { recursive: true });
  await page.evaluate(() => window.__clubsim.overview(false));
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${out}/overview/minimap.png`, clip: { x: 250, y: 0, width: 140, height: 140 } });
  await page.close();
}
if (only.includes('desk')) {
  const page = await open();
  await jump(page, 8 * 60 + 40);
  await page.waitForTimeout(1500);
  await page.locator('.sim-bar').click();
  await page.waitForTimeout(400);
  mkdirSync(`${out}/desk`, { recursive: true });
  await page.screenshot({ path: `${out}/desk/0-panel.png` });
  await page.locator('.sim-desk').click();
  await page.locator('.sim-bar').click();
  await page.waitForTimeout(500);
  const q0 = await page.evaluate(() => window.__clubsim.state().queues['desk.counter']?.length ?? 0);
  await page.screenshot({ path: `${out}/desk/1-walking.png` });
  // 25 游戏分钟（2× 下 12.5 秒）
  await page.waitForTimeout(12500);
  const q1 = await page.evaluate(() => ({
    q: window.__clubsim.state().queues['desk.counter']?.length ?? 0,
    dir: window.__clubsim.director(),
    clock: window.__clubsim.stats().clock,
  }));
  await page.screenshot({ path: `${out}/desk/2-away.png` });
  await page.locator('.sim-bar').click();
  await page.waitForTimeout(300);
  await page.locator('.sim-desk').click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${out}/desk/3-back-panel.png` });
  await page.locator('.sim-bar').click();
  await page.waitForTimeout(8000);
  const q2 = await page.evaluate(() => ({
    q: window.__clubsim.state().queues['desk.counter']?.length ?? 0,
    dir: window.__clubsim.director(),
  }));
  await page.screenshot({ path: `${out}/desk/4-back.png` });
  log.desk = { q0, q1, q2 };
  await page.close();
}
if (only.includes('agenda')) {
  const page = await open();
  await jump(page, 10 * 60 + 30);
  const id = await page.evaluate(() => {
    // 跟一个今天已经干了几件事的客人（日程长一点）
    const s = window.__clubsim.state();
    const n = new Map();
    for (const e of s.log) if (e.kind === 'start') n.set(e.agent, (n.get(e.agent) ?? 0) + 1);
    const v = window.__clubsim
      .view()
      .filter((q) => q.where.kind === 'at' && !String(s.agents[q.id]?.role).match(/staff|coach/))
      .sort((a, b) => (n.get(b.id) ?? 0) - (n.get(a.id) ?? 0))[0];
    window.__clubsim.follow(v.id);
    return v.id;
  });
  await page.waitForTimeout(2500);
  await page.locator('.sim-bar').click();
  await page.waitForTimeout(500);
  mkdirSync(`${out}/agenda`, { recursive: true });
  await page.locator('.sim-more').evaluate((el) => {
    el.scrollTop = el.querySelector('.sim-follow').offsetTop - 40;
  });
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${out}/agenda/agenda.png` });
  const rows = await page.locator('.sim-agenda li').allInnerTexts();
  const dup = rows.filter((r, i) => i && r.split('\n').pop() === rows[i - 1].split('\n').pop());
  log.agenda = { id, rows, dup };
  await page.close();
}
if (only.includes('stadium')) {
  const page = await open();
  await jump(page, 19 * 60 + 58);
  await page.evaluate(() => {
    window.__clubsim.look(0, -26);
    window.__clubsim.resetPerf();
  });
  await page.waitForTimeout(1000);
  const seq = await shots(page, 'stadium-out', 8, 1800);
  const p = await page.evaluate(() => window.__clubsim.perf());
  log.stadium = { seq, paths: p.paths, pool: p.pool };
  await page.close();
}
if (only.includes('house')) {
  const page = await open();
  await jump(page, 12 * 60);
  const id = await page.evaluate(() => window.__clubsim.followAt('house.cafe'));
  await page.waitForTimeout(4000);
  log.house = { id, shots: await shots(page, 'house', 2, 1200) };
  await page.close();
}
log.errors = [...new Set(errors)].slice(0, 20);
writeFileSync(`${out}/watch.json`, JSON.stringify(log, null, 2));
console.log(JSON.stringify(log, null, 1).slice(0, 6000));
await browser.close();
