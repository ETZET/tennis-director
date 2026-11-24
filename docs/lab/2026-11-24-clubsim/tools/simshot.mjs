// 俱乐部的一天：手机竖屏截图（390×844，deviceScaleFactor 1）+ 量每帧的耗时。
// 先开 dev 服务器：pnpm --filter @td/sandbox exec vite --port 5184 --strictPort
// 总监一直站在前台柜台后面（?sim=1 开局就站过去，引擎按"总监在前台"跑）；换地方只挪镜头（__clubsim.look），不挪总监。
//
// node docs/lab/2026-11-24-clubsim/tools/simshot.mjs [label] [选项]
//   --page valley|clubwalk     哪个页面（默认 valley）
//   --times 7:30,12:30,...     哪几个时刻（默认 7:30,12:30,14:30,16:00,18:30,21:30）
//   --spots desk,plaza,...     哪几处（默认全部，见 SPOTS；all = 全部；none = 只拍全图）
//   --wait 毫秒                 换地方以后等多久再拍（默认 2600：区域建好、身子换好装）
//   --perf 0                   不量性能
//   --query 'a=1&b=2'          另加的 URL 参数
//   --port 5184                dev 服务器的端口
//   --watch 30                 另外照用户的路子看一遍：valley → 调试 → 观察俱乐部的一天（加速），每秒截一张、截 N 张（watch/）
// 输出：docs/lab/2026-11-24-clubsim/shots/<label>/<时刻>-<地点>.png、summary.json（每张的人数、身子数、各区域人数、性能）。
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
const label = args[0] && !args[0].startsWith('--') ? args.shift() : 'latest';
const opt = (k, d) => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 ? args[i + 1] : d;
};
const page0 = opt('page', 'valley');
const WAIT = Number(opt('wait', '2600'));
const toMin = (s) => {
  const [h, m = '0'] = s.split(':');
  return Number(h) * 60 + Number(m);
};
const times = opt('times', '7:30,12:30,14:30,16:00,18:30,21:30').split(',').map(toMin).sort((a, b) => a - b);

/** 镜头看哪（只挪镜头，总监不动） */
const SPOTS = {
  desk: [57, -3],
  plaza: [44, -19],
  food: [-31, -24],
  clay: [17, 31],
  pickle: [44, 7],
  pool: [-50, 9],
  courts: [-17, 23],
  lesson: [-17, 9],
  stadium: [0, -8],
  house: [-36, -14],
};
const spotArg = opt('spots', 'desk,plaza,food,clay,pickle,pool,courts');
const spots = spotArg === 'none' ? [] : spotArg === 'all' ? Object.keys(SPOTS) : spotArg.split(',');
const extra = opt('query', '');
const out = resolve(import.meta.dirname, `../shots/${label}`);
mkdirSync(out, { recursive: true });

const browser = await pw.chromium.launch({
  executablePath: existsSync(exe) ? exe : undefined,
  args: ['--use-gl=angle', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: true });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
const PORT = opt('port', '5184');
/** 总监站的地方：前台柜台后面（clubdesk 的 deskStand） */
const DESK_STAND = [55.55, 8.6];
const url = `http://localhost:${PORT}/${page0}.html?sim=1&simat=${times[0]}&at=${DESK_STAND.join(',')}${extra ? `&${extra}` : ''}`;
console.log('open', url);
await page.goto(url);
await page.waitForFunction(() => window.__clubsim?.on && !window.__clubsim.jumping, null, { timeout: 60000 });
await page.waitForTimeout(3000);
/** 总监在不在前台（截图期间不能挪） */
const deskCheck = async (tag) => {
  const d = await page.evaluate(() => window.__clubsim.director());
  if (d.at !== 'desk.counter') console.warn(`!! ${tag}: 总监不在前台（${d.x.toFixed(1)}, ${d.z.toFixed(1)}）`);
  return d.at;
};

const hhmm = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}${String(m % 60).padStart(2, '0')}`;
const summary = { url, shots: [], perf: null, errors };

for (const t of times) {
  await page.evaluate((m) => {
    window.__clubsim.jump(m);
    window.__clubsim.pause(true);
  }, t);
  await page.waitForFunction(() => !window.__clubsim.jumping, null, { timeout: 30000 });
  for (const sp of spots) {
    const [x, z] = SPOTS[sp];
    await page.evaluate(([x, z]) => window.__clubsim.look(x, z), [x, z]);
    await page.waitForTimeout(WAIT);
    const file = `${out}/${hhmm(t)}-${sp}.png`;
    await page.screenshot({ path: file });
    const st = await page.evaluate(() => window.__clubsim.stats());
    st.director = await deskCheck(`${hhmm(t)} ${sp}`);
    summary.shots.push({ file, t, spot: sp, ...st });
    console.log(hhmm(t), sp, `在场 ${st.present} · 身子 ${st.bodies}`);
  }
  await page.evaluate(() => window.__clubsim.overview(true));
  await page.waitForTimeout(1500);
  const file = `${out}/${hhmm(t)}-all.png`;
  await page.screenshot({ path: file });
  const st = await page.evaluate(() => window.__clubsim.stats());
  summary.shots.push({ file, t, spot: 'all', ...st });
  console.log(hhmm(t), 'all', `在场 ${st.present}`, JSON.stringify(st.byArea));
  await page.evaluate(() => window.__clubsim.overview(false));
}

// 性能：60× 跑一会儿（中午的美食广场、早上的前台），量每帧引擎 + 演出
if (opt('perf', '1') !== '0') {
  const runs = [];
  for (const [sp, t] of [
    ['food', 11 * 60 + 30],
    ['desk', 7 * 60],
  ]) {
    await page.evaluate(
      ([m, [x, z]]) => {
        window.__clubsim.jump(m);
        window.__clubsim.look(x, z);
        window.__clubsim.pause(false);
        window.__clubsim.speed(60);
      },
      [t, SPOTS[sp]],
    );
    await page.waitForFunction(() => !window.__clubsim.jumping, null, { timeout: 30000 });
    await page.waitForTimeout(2500);
    await page.evaluate(() => window.__clubsim.resetPerf());
    await page.waitForTimeout(6000);
    const p = await page.evaluate(() => window.__clubsim.perf());
    runs.push({ spot: sp, from: t, ...p });
    console.log('perf', sp, JSON.stringify(p));
  }
  // 跳时刻、换天：每帧（引擎 + 演出）最长多久（要 < 50 毫秒）。镜头先挪好、等区域建完（建区域的卡顿是 clubwalk 的，不算在跳时刻上）
  await page.evaluate(() => {
    window.__clubsim.look(44, -19);
    window.__clubsim.speed(60);
  });
  await page.waitForTimeout(4000);
  await page.evaluate(() => {
    window.__clubsim.resetPerf();
    window.__clubsim.jump(19 * 60);
  });
  await page.waitForFunction(() => !window.__clubsim.jumping, null, { timeout: 30000 });
  await page.waitForTimeout(1000);
  const pj = await page.evaluate(() => window.__clubsim.perf());
  runs.push({ spot: 'jump 19:00', ...pj });
  console.log("perf jump", JSON.stringify({ frameMax: pj.frameMax, jumpSliceMax: pj.jumpSliceMax, lastJumpMs: pj.lastJumpMs, engineMax: pj.engineMax, actorsMax: pj.actorsMax, worst: pj.worst }));
  // 跳到关门以后：人走光了就换天（再快进到开门前半小时）；量的是这一路上最长的一帧
  await page.evaluate(() => {
    window.__clubsim.resetPerf();
    window.__clubsim.jump(23 * 60 + 20);
  });
  await page.waitForFunction(() => window.__clubsim.stats().minute < 12 * 60 && !window.__clubsim.jumping, null, {
    timeout: 60000,
  });
  await page.waitForTimeout(1500);
  const pr = await page.evaluate(() => window.__clubsim.perf());
  runs.push({ spot: 'rollover', ...pr });
  console.log("perf rollover", JSON.stringify({ frameMax: pr.frameMax, rollMs: pr.rollMs, engineMax: pr.engineMax, actorsMax: pr.actorsMax, worst: pr.worst }));
  summary.perf = runs;
}

// 照用户的路子看：valley → 调试 → 观察俱乐部的一天（加速）（2×，从 6:30），每秒截一张
const WATCH = Number(opt('watch', '0'));
if (WATCH > 0) {
  const wdir = `${out}/watch`;
  mkdirSync(wdir, { recursive: true });
  const p2 = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: true });
  p2.on('pageerror', (e) => errors.push(String(e.stack ?? e)));
  await p2.goto(`http://localhost:${PORT}/valley.html${extra ? `?${extra}` : ''}`);
  await p2.waitForFunction(() => window.__clubsim, null, { timeout: 90000 });
  await p2.waitForTimeout(4000);
  await p2.getByRole('button', { name: '调试' }).click();
  await p2.waitForTimeout(300);
  await p2.getByRole('button', { name: '观察俱乐部的一天（加速）' }).click();
  // 从 6:30 放到 6:45 再开始截（2× 下 7.5 秒）
  await p2.waitForFunction(() => window.__clubsim.stats().minute >= 6 * 60 + 45, null, { timeout: 60000 });
  const wl = [];
  for (let i = 0; i < WATCH; i++) {
    const st = await p2.evaluate(() => ({ ...window.__clubsim.stats(), dir: window.__clubsim.director() }));
    const f = `${wdir}/w${String(i).padStart(2, '0')}-${st.clock.replace(':', '')}.png`;
    await p2.screenshot({ path: f });
    wl.push({ f, clock: st.clock, present: st.present, bodies: st.bodies, director: st.dir.at });
    console.log('watch', i, st.clock, `在场 ${st.present} · 身子 ${st.bodies} · 总监 ${st.dir.at}`);
    await p2.waitForTimeout(1000);
  }
  summary.watch = { frames: wl, perf: await p2.evaluate(() => window.__clubsim.perf()) };
  await p2.close();
}
writeFileSync(`${out}/summary.json`, JSON.stringify(summary, null, 2));
await browser.close();
console.log(errors.length ? `ERR:\n${[...new Set(errors)].slice(0, 20).join('\n')}` : 'ok', '->', out);
