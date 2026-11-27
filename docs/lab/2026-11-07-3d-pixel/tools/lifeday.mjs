// 分图里的一整天（加速）：每张图开一页，从 7 点跑到 21 点，每过一会儿量一次——
//   在场几个人（每张图每个时刻都该有人，白天不该空）、有没有人走着走着卡住超过 N 秒、有没有人站在不能走的地方（水里、墙里），
//   换图（__vista.go）以后人还在、时钟还对。
// node docs/lab/2026-11-07-3d-pixel/tools/lifeday.mjs [端口 5382] [图，逗号分开；默认全部] [截图目录]
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
const [port = '5382', only = '', out = ''] = process.argv.slice(2);
if (out) mkdirSync(out, { recursive: true });
/** 走着不挪地方超过这么多秒算卡住 */
const STUCK = 6;
/** 白天（9–19 点）每张图至少几个人 */
const MIN_DAY = 2;
/** 游戏秒 / 真实秒：一天（14 个钟头）≈ 70 秒 */
const TSPEED = 720;

const browser = await pw.chromium.launch({
  executablePath: existsSync(exe) ? exe : undefined,
  args: ['--use-gl=angle', '--enable-unsafe-swiftshader'],
});
let fails = 0;
const check = (name, ok, detail = '') => {
  if (!ok) fails++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name} ${detail}`);
};

const page0 = await browser.newPage();
await page0.goto(`http://localhost:${port}/clubvista.html?castreset=1&cast=1&ui=0`);
await page0.waitForFunction(() => window.__vista?.built, null, { timeout: 60000 });
const all = await page0.evaluate(() => window.__vista.built.map((b) => b.def.id));
await page0.close();
const maps = only ? only.split(',') : all;

for (const id of maps) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: true });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(`http://localhost:${port}/clubvista.html?castreset=1&clouds=0&map=${id}&hour=7&tspeed=${TSPEED}&nightfast=0`, { timeout: 120000 });
  await page.waitForFunction(() => window.__vista?.life, null, { timeout: 60000 });
  // 总监站到图外一角（不挡人）
  const samples = await page.evaluate(
    async ({ STUCK }) => {
      const v = window.__vista;
      const b = v.built.find((m) => m.def.id === v.cur());
      v.play.teleport(b.def.start.at[0] + b.ox, b.def.start.at[1]);
      const out = [];
      const stuck = new Map();
      const off = new Map();
      let maxStill = 0;
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      while (v.clock().minute < 21 * 60 && v.clock().day === 1) {
        await wait(500);
        const d = v.life.debug();
        const here = d.actors.filter((a) => a.state !== 'away');
        for (const a of here) {
          if (a.state === 'walk' && a.still > STUCK) stuck.set(a.key, `${a.x.toFixed(1)},${a.z.toFixed(1)}`);
          if (a.state === 'walk') maxStill = Math.max(maxStill, a.still);
          // 走路的人脚下要能站（坐着、站在位置上的可以在家具里、池沿上）
          if (a.state === 'walk' && v.play.nav.height(a.x + b.ox, a.z) === null) {
            const k = a.key;
            off.set(k, (off.get(k) ?? 0) + 1);
          }
        }
        out.push({ m: Math.round(v.clock().minute), n: here.length, walk: here.filter((a) => a.state === 'walk').length });
      }
      const d = v.life.debug();
      // 骨架图：没有站位、也没摆人（world 还没做完的图）——人数不考
      const skeleton = !(b.def.spots?.length) && !b.placed.some((p) => p.obj.userData.pose && p.obj.userData.setProp);
      return { out, stuck: [...stuck], off: [...off].filter(([, n]) => n >= 3), maxStill, stats: d.stats, total: d.actors.length, skeleton };
    },
    { STUCK },
  );
  const byHour = {};
  for (const s of samples.out) {
    const h = Math.floor(s.m / 60);
    byHour[h] = Math.max(byHour[h] ?? 0, s.n);
  }
  const dayLow = Object.entries(byHour).filter(([h, n]) => +h >= 9 && +h <= 19 && n < MIN_DAY);
  console.log(`── ${id}（${samples.total} 个人位）每个钟头最多几个人：${Object.entries(byHour).map(([h, n]) => `${h}点${n}`).join(' ')}`);
  if (samples.skeleton) console.log(`skip ${id}：骨架图（没有站位、没摆人），人数不考`);
  else check(`${id}：白天每个钟头至少 ${MIN_DAY} 个人`, dayLow.length === 0, dayLow.map(([h, n]) => `${h}点只有${n}`).join(' '));
  check(`${id}：没有人卡住超过 ${STUCK} 秒`, samples.stuck.length === 0, JSON.stringify(samples.stuck));
  check(`${id}：走路的人都在能走的地方`, samples.off.length === 0, JSON.stringify(samples.off));
  check(`${id}：有人来也有人走`, samples.stats.spawned > 0 && samples.stats.left > 0, JSON.stringify(samples.stats));
  if (out) await page.screenshot({ path: `${out}/day-${id}.png` });
  check(`${id}：页面没有报错`, errors.length === 0, errors.slice(0, 2).join(' / '));
  await page.close();
}

// ── 换图不丢状态 ──
{
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: true });
  await page.goto(`http://localhost:${port}/clubvista.html?castreset=1&clouds=0&map=oasis&hour=12`, { timeout: 120000 });
  await page.waitForFunction(() => window.__vista?.life, null, { timeout: 60000 });
  await page.waitForTimeout(3000);
  const a = await page.evaluate(() => {
    const d = window.__vista.life.debug();
    return { keys: d.actors.filter((x) => x.state !== 'away' && x.state !== 'walk').map((x) => x.key), clock: window.__vista.clock(), money: window.__cast.state().money };
  });
  const exit = await page.evaluate(() => window.__vista.built.find((b) => b.def.id === 'oasis').def.exits[0]);
  await page.evaluate((e) => window.__vista.go(e.to, e.entry), exit);
  await page.waitForTimeout(2500);
  const back = await page.evaluate(() => {
    const b = window.__vista.built.find((m) => m.def.id === window.__vista.cur());
    return b.def.exits.find((e) => e.to === 'oasis');
  });
  if (back) await page.evaluate((e) => window.__vista.go(e.to, e.entry), back);
  await page.waitForTimeout(2500);
  const c = await page.evaluate(() => {
    const d = window.__vista.life.debug();
    return { map: window.__vista.cur(), keys: d.actors.filter((x) => x.state !== 'away').map((x) => x.key), clock: window.__vista.clock(), money: window.__cast.state().money, cs: window.__cast.state() };
  });
  check('换图：回到歇脚还是这张图', c.map === 'oasis', c.map);
  const kept = a.keys.filter((k) => c.keys.includes(k));
  check('换图：坐着的人回来还在（时段没过的）', kept.length >= Math.max(1, a.keys.length - 2), `${kept.length}/${a.keys.length}`);
  check('换图：时钟往前走、没倒退', c.clock.minute > a.clock.minute && c.clock.day === a.clock.day, `${a.clock.minute.toFixed(0)} → ${c.clock.minute.toFixed(0)}`);
  check('换图：演员表的时钟和天光一致', Math.abs(c.cs.minute - c.clock.minute) <= 2 && c.cs.day === c.clock.day, `${c.cs.minute} vs ${c.clock.minute.toFixed(1)}`);
  check('换图：钱没丢', c.money === a.money, `${a.money} → ${c.money}`);
  await page.close();
}

await browser.close();
console.log(fails ? `${fails} FAIL` : 'all ok');
process.exit(fails ? 1 : 0);
