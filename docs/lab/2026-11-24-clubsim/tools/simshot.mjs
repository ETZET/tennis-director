// 俱乐部的一天：手机竖屏截图（390×844，deviceScaleFactor 1）+ 量每帧的耗时。
// 先开 dev 服务器：pnpm --filter @td/sandbox exec vite --port 5183 --strictPort
//
// node docs/lab/2026-11-24-clubsim/tools/simshot.mjs [label] [选项]
//   --page valley|clubwalk     哪个页面（默认 valley）
//   --times 7:30,12:30,...     哪几个时刻（默认 7:30,12:30,14:30,16:00,18:30,21:30）
//   --spots desk,plaza,...     哪几处（默认全部，见 SPOTS；all = 全部；none = 只拍全图）
//   --wait 毫秒                 换地方以后等多久再拍（默认 2600：区域建好、身子换好装）
//   --perf 0                   不量性能
//   --query 'a=1&b=2'          另加的 URL 参数
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

/** 镜头站哪（总监传送到这里，镜头跟着他；镜头往南多看 1.4 米） */
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
const url = `http://localhost:5183/${page0}.html?sim=1&simat=${times[0]}&at=${SPOTS.desk.join(',')}${extra ? `&${extra}` : ''}`;
console.log('open', url);
await page.goto(url);
await page.waitForFunction(() => window.__clubsim?.on, null, { timeout: 60000 });
await page.waitForTimeout(3000);

const hhmm = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}${String(m % 60).padStart(2, '0')}`;
const summary = { url, shots: [], perf: null, errors };

for (const t of times) {
  await page.evaluate((m) => {
    window.__clubsim.jump(m);
    window.__clubsim.pause(true);
  }, t);
  for (const sp of spots) {
    const [x, z] = SPOTS[sp];
    await page.evaluate(([x, z]) => window.__clubsim.look(x, z), [x, z]);
    await page.waitForTimeout(WAIT);
    const file = `${out}/${hhmm(t)}-${sp}.png`;
    await page.screenshot({ path: file });
    const st = await page.evaluate(() => window.__clubsim.stats());
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
    await page.waitForTimeout(2500);
    await page.evaluate(() => window.__clubsim.resetPerf());
    await page.waitForTimeout(6000);
    const p = await page.evaluate(() => window.__clubsim.perf());
    runs.push({ spot: sp, from: t, ...p });
    console.log('perf', sp, JSON.stringify(p));
  }
  summary.perf = runs;
}
writeFileSync(`${out}/summary.json`, JSON.stringify(summary, null, 2));
await browser.close();
console.log(errors.length ? `ERR:\n${[...new Set(errors)].slice(0, 20).join('\n')}` : 'ok', '->', out);
