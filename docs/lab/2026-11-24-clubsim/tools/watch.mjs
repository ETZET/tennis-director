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
//   （第 3 轮修画面加的）
//   rally     8:46 红土 / 9:06 会员场 / 青训东场 / 匹克球：每块场上的人按东西两半分（单打、喂球隔着网）
//   crowd     前院 7:20、午饭 12:12、匹克球 17:28、散场 20:08：每段 20 帧，画面里两具身子 < 0.35 米的帧数
//   cars      前院 7:05、9:20、17:40、20:25：车压着人的帧（runover）、车让人让了多久、被开着的车挤开的人、停着的车里站着的人
//   follow    点"随便跟一个人"挑到谁（还要待多久、面板收起没有）；跟一个正在回家的人，走了以后自动换人；"退出"再进接着上回的时刻
//   food      午饭 / 傍晚美食广场：场景演出的托盘、沙包、球露出来几个（应该 0），引擎的托盘不跟着看得见的身子的帧（orphanFrames，应该 0）
//   b1        总监下到负一层（剖面换层）：一楼的人不画在健身房里，负一层的人站在自己的器械边
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
const only = opt('only', 'path,feet,court,overview,desk,agenda,stadium,house,rally,crowd,cars,follow,food,b1').split(',');
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
if (only.includes('rally')) {
  const page = await open();
  log.rally = {};
  for (const [name, t, x, z] of [
    ['clay', 8 * 60 + 46, 17, 31],
    ['member', 9 * 60 + 6, -18, 26],
    ['practice', 8 * 60 + 46, 9, 4],
    ['pickle', 8 * 60 + 46, 41, 0],
  ]) {
    await jump(page, t);
    await page.evaluate(([x, z]) => window.__clubsim.look(x, z), [x, z]);
    await page.waitForTimeout(3500);
    mkdirSync(`${out}/rally`, { recursive: true });
    await page.screenshot({ path: `${out}/rally/${name}.png` });
    log.rally[name] = await page.evaluate(() => {
      // 每块场：站在场上打球 / 上课 / 喂球的人，按朝向分两边（朝东 = 西半场）
      const by = {};
      for (const q of window.__clubsim.bodies()) {
        if (!q.at || !/^(clay\.court|courts\.(member|practice)|pickle\.court)/.test(q.at)) continue;
        if (!['tennis', 'pickle', 'coach', 'lesson'].includes(q.doing)) continue;
        const k = (by[q.at] ??= { W: 0, E: 0, who: [] });
        k[Math.sin(q.yaw) >= 0 ? 'W' : 'E']++;
        k.who.push(`#${q.spot}(${q.x},${q.z})`);
      }
      const sameSide = Object.entries(by).filter(([, k]) => k.W + k.E >= 2 && (!k.W || !k.E)).map(([at]) => at);
      return { by, sameSide, ball: window.__clubsim.fx().ball };
    });
  }
  await page.close();
}
/** 画面里两具身子近于 0.35 米的帧（每段 20 帧） */
async function crowdSeg(page) {
  let close = 0;
  const kinds = {};
  for (let i = 0; i < 20; i++) {
    const b = await page.evaluate(() => window.__clubsim.bodies());
    let any = false;
    for (let p = 0; p < b.length; p++)
      for (let q = p + 1; q < b.length; q++) {
        if (Math.hypot(b[p].x - b[q].x, b[p].z - b[q].z) >= 0.35) continue;
        any = true;
        const k = `${b[p].moving ? 'walk' : 'stand'}/${b[q].moving ? 'walk' : 'stand'} ${b[p].party && b[p].party === b[q].party ? 'same-party' : 'other'}`;
        kinds[k] = (kinds[k] ?? 0) + 1;
      }
    if (any) close++;
    await page.waitForTimeout(500);
  }
  return { framesWithClose: close, kinds };
}
if (only.includes('crowd')) {
  log.crowd = {};
  for (const [name, t, x, z] of [
    ['fore', 7 * 60 + 20, 58, 6],
    ['lunch', 12 * 60 + 12, -20, -14],
    ['pickle', 17 * 60 + 28, 45, 6],
    ['exh', 20 * 60 + 8, 0, -12],
  ]) {
    const page = await open();
    await jump(page, t);
    await page.evaluate(([x, z]) => window.__clubsim.look(x, z), [x, z]);
    await page.waitForTimeout(2500);
    log.crowd[name] = await crowdSeg(page);
    mkdirSync(`${out}/crowd`, { recursive: true });
    await page.screenshot({ path: `${out}/crowd/${name}.png` });
    await page.close();
  }
}
if (only.includes('cars')) {
  log.cars = {};
  for (const [t, x, z, secs] of [
    [7 * 60 + 5, 64, -1, 30],
    [9 * 60 + 20, 64, -1, 25],
    [17 * 60 + 40, 70, 4, 30],
    [20 * 60 + 25, 70, 0, 30],
  ]) {
    const page = await open();
    await jump(page, t);
    await page.evaluate(([x, z]) => window.__clubsim.look(x, z), [x, z]);
    await page.waitForTimeout(1500);
    const c0 = await page.evaluate(() => window.__clubsim.fx().cars);
    await page.waitForTimeout(secs * 1000);
    const c1 = await page.evaluate(() => window.__clubsim.fx().cars);
    mkdirSync(`${out}/cars`, { recursive: true });
    await page.screenshot({ path: `${out}/cars/${hm(`${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`)}.png` });
    log.cars[t] = {
      runoverFrames: c1.runoverFrames - c0.runoverFrames,
      runoverWho: c1.runoverWho.slice(-4),
      yieldS: +(c1.yieldS - c0.yieldS).toFixed(1),
      shoved: c1.shoved - c0.shoved,
      pedPush: c1.pedPush - c0.pedPush,
      clipFrames: c1.clipFrames - c0.clipFrames,
      overlapFrames: c1.overlapFrames - c0.overlapFrames,
      ghost: c1.ghost,
    };
    await page.close();
  }
}
if (only.includes('follow')) {
  const page = await open();
  await jump(page, 9 * 60 + 2);
  await page.waitForTimeout(1500);
  await page.locator('.sim-bar').click();
  await page.waitForTimeout(400);
  await page.locator('.sim-rand').click();
  await page.waitForTimeout(2500);
  const pick = await page.evaluate(() => {
    const st = window.__clubsim.state();
    const id = window.__clubsim.stats().follow;
    const a = st.agents[id];
    return { id, doing: a.doing, staysMin: a.leaveBy - st.minute, panelOpen: !document.querySelector('.sim-more')?.hidden };
  });
  mkdirSync(`${out}/follow`, { recursive: true });
  await page.screenshot({ path: `${out}/follow/1-picked.png` });
  const leaver = await page.evaluate(() => {
    const st = window.__clubsim.state();
    const v = window.__clubsim
      .view()
      .find((q) => q.doing === 'leave' && q.where.kind === 'travel' && !/staff|coach/.test(st.agents[q.id].role));
    if (v) window.__clubsim.follow(v.id);
    return v?.id ?? null;
  });
  let switched = null;
  for (let i = 0; i < 20 && !switched; i++) {
    await page.waitForTimeout(700);
    const f = await page.evaluate(() => window.__clubsim.stats().follow);
    if (f && f !== leaver) switched = f;
  }
  await page.screenshot({ path: `${out}/follow/2-switched.png` });
  const before = await page.evaluate(() => window.__clubsim.stats().clock);
  await page.locator('.sim-bar').click();
  await page.waitForTimeout(300);
  const gapsVisible = await page.locator('.sim-gaps-h').isVisible();
  await page.locator('.sim-exit').click();
  await page.waitForTimeout(1500);
  await page.getByRole('button', { name: '调试' }).click();
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: '观察俱乐部的一天（加速）' }).click();
  await page.waitForTimeout(2000);
  const after = await page.evaluate(() => window.__clubsim.stats().clock);
  await page.screenshot({ path: `${out}/follow/3-reentered.png` });
  log.follow = { pick, leaver, switched, gapsVisible, exitAt: before, reenterAt: after };
  await page.close();
}
if (only.includes('food')) {
  const page = await open();
  log.food = {};
  for (const t of [12 * 60 + 20, 18 * 60 + 40]) {
    await jump(page, t);
    await page.evaluate(() => {
      window.__clubsim.look(-28, -28);
      window.__clubsim.speed(15);
    });
    let sceneMax = 0;
    for (let i = 0; i < 16; i++) {
      const n = await page.evaluate(() => {
        let k = 0;
        window.__clubwalk.scene.traverse((o) => {
          if (!/^food-tray:|^bag-\d$|-life:(ball|cups)/.test(o.name)) return;
          let v = o.visible;
          for (let p = o.parent; p && v; p = p.parent) v = p.visible;
          if (v) k++;
        });
        return k;
      });
      sceneMax = Math.max(sceneMax, n);
      await page.waitForTimeout(500);
    }
    await page.evaluate(() => window.__clubsim.speed(2));
    await page.waitForTimeout(1500);
    mkdirSync(`${out}/food`, { recursive: true });
    await page.screenshot({ path: `${out}/food/${t}.png` });
    const f = await page.evaluate(() => window.__clubsim.fx().food);
    log.food[t] = { sceneProps: sceneMax, orphanFrames: f.orphanFrames, orphanWho: f.orphanWho, eaters: f.eaters };
  }
  await page.close();
}
if (only.includes('b1')) {
  const page = await open();
  await jump(page, 13 * 60 + 45);
  await page.evaluate(() => {
    window.__clubsim.speed(1);
    window.__clubsim.look(-52, -25);
  });
  await page.waitForFunction(() => window.__clubwalk.lives.find((l) => l.def.id === 'clubhouse').region, null, {
    timeout: 60000,
  });
  await page.waitForTimeout(1500);
  await page.evaluate(() => window.__clubwalk.lives.find((l) => l.def.id === 'clubhouse').region.setFloor(-1));
  await page.waitForTimeout(3000);
  mkdirSync(`${out}/b1`, { recursive: true });
  await page.screenshot({ path: `${out}/b1/b1.png` });
  log.b1 = await page.evaluate(() => {
    const q = window.__clubsim.bodies().filter((b) => b.x > -64.5 && b.x < -39.5 && b.z > -43 && b.z < -1);
    return { inHouse: q.length, places: [...new Set(q.map((b) => b.at))] };
  });
  await page.evaluate(() => window.__clubwalk.lives.find((l) => l.def.id === 'clubhouse').region.setFloor(1));
  await page.close();
}
log.errors = [...new Set(errors)].slice(0, 20);
writeFileSync(`${out}/watch.json`, JSON.stringify(log, null, 2));
console.log(JSON.stringify(log, null, 1).slice(0, 6000));
await browser.close();
