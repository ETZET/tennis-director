// 合成一个游戏（clubgame，页面 clubvista.html）的一轮检查：一次不刷新页面，从公交站走到每张图再走回来，
// 沿路截图（竖屏 390×844）+ 检查能不能走通、换图时状态（钱、第几天、时刻）有没有丢。
// node docs/lab/2026-11-07-3d-pixel/tools/unify.mjs [端口 5371] [截图目录]
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
const [port = '5371', out = '/tmp/unify'] = process.argv.slice(2);
mkdirSync(out, { recursive: true });

const browser = await pw.chromium.launch({
  executablePath: existsSync(exe) ? exe : undefined,
  args: ['--use-gl=angle', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 1,
  hasTouch: true,
  locale: 'zh-CN',
});
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.goto(`http://localhost:${port}/clubvista.html?castreset=1&clouds=0`);
await page.waitForFunction(() => window.__game && window.__vista?.play && window.__cast, null, { timeout: 60000 });
await page.waitForTimeout(2500);

let fails = 0;
let n = 0;
const shot = async (name) => {
  n++;
  const f = `${out}/${String(n).padStart(2, '0')}-${name}.png`;
  await page.screenshot({ path: f });
  return f;
};
const check = (name, ok, detail = '') => {
  if (!ok) fails++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name} ${detail}`);
};
/** 现在画面上的出口路牌（在台上的世界的） */
const signs = () =>
  page.evaluate(() =>
    [...document.querySelectorAll('.pxh-ways:not(.world-off) > div:not([hidden])')].map((e) => e.textContent),
  );
const where = () => page.evaluate(() => window.__game.where());
/** 状态：钱、第几天、演员表的分钟、日钟的时刻（两个世界各一个 daylight，在台上的那个） */
const state = () =>
  page.evaluate(() => {
    const g = window.__game;
    const s = window.__cast.state();
    const day = g.world() === 'club' ? g.walk().day : g.vista.day;
    return { where: g.where(), money: s.money, day: s.day, minute: s.minute, hour: +day.total.toFixed(3) };
  });
/** 在台上的那个世界里点地面走过去（本图 / 世界坐标），走到或者换了图为止 */
async function walkTo(name, to, expect, shots) {
  const from = await where();
  const r = await page.evaluate(async ([x, z]) => {
    const g = window.__game;
    const club = g.world() === 'club';
    const play = club ? g.walk().play : g.vista.play;
    const step = club ? window.__walk.step : window.__vista.step;
    const w0 = g.where();
    play.tapWorld(x, z);
    const planned = play.pathLeft();
    let t = 0;
    let best = Infinity;
    let again = 0;
    for (; t < 150; t += 0.25) {
      step(0.25);
      // 内场的区域是走到哪建到哪（每帧一点）：让一帧
      if (club) await new Promise((r) => requestAnimationFrame(r));
      const s = play.state();
      const d = Math.hypot(s.x - x, s.z - z);
      best = Math.min(best, d);
      if (g.where() !== w0) break;
      if (d < 0.6) break;
      if (play.pathLeft() === 0 && t > 2) {
        // 内场走到哪建到哪：新区域建好会重建导航、路线作废，像玩家一样再点一次（最多 8 次）
        if (!club || d < 1.5 || ++again > 8) break;
        play.tapWorld(x, z);
      }
    }
    return { planned, t, best };
  }, to);
  if (expect) await page.waitForFunction((m) => window.__game.where() === m, expect, { timeout: 30000 }).catch(() => {});
  // 刚换过去：黑幕上写着目的地名；展开以后上方淡出一次地名
  if (shots) {
    await page.waitForTimeout(250);
    await shot(`${shots}-black`);
    await page.waitForTimeout(1500);
    await shot(`${shots}-name`);
  }
  // 转场展开完
  await page.waitForTimeout(expect ? 1600 : 300);
  const now = await where();
  const ok = expect ? now === expect : r.best < 1.5 && now === from;
  if (!ok) fails++;
  console.log(
    `${ok ? 'ok  ' : 'FAIL'} ${name.padEnd(26)} 寻路 ${r.planned > 0 ? `${r.planned.toFixed(1)} 米` : '没找到'} · 走 ${r.t.toFixed(1)} 秒 · 离目标最近 ${r.best.toFixed(2)} 米 · 现在在 ${now}`,
  );
}
/** 在台上的世界里、画面里（不在界面底下）离总监最近的人：屏幕上的位置和 id */
const nearest = () =>
  page.evaluate(() => {
    const g = window.__game;
    const play = g.world() === 'club' ? g.walk().play : g.vista.play;
    const bs = [...window.__castOf(g.world()).binder.bound].sort((a, c) => a.d2 - c.d2);
    for (const b of bs) {
      const p = b.obj.getWorldPosition(b.obj.position.clone());
      p.y += 1.2;
      const s = play.project(p, innerWidth, innerHeight);
      if (s.x > 30 && s.x < innerWidth - 30 && s.y > 140 && s.y < innerHeight - 160) return { x: s.x, y: s.y, id: b.id };
    }
    return null;
  });
/** 点人 → 上方一行字（截图）→ 再点一次 → 人物卡（截图）→ 收起 */
async function tapPerson(tag) {
  const a = await nearest();
  if (!a) {
    check(`${tag}：画面里有人能点`, false);
    return;
  }
  await page.mouse.click(a.x, a.y);
  await page.waitForTimeout(1500);
  await shot(`${tag}-peek`);
  // 总监走过去要一会儿（真实时间）
  await page.waitForTimeout(2500);
  const b = (await nearest()) ?? a;
  await page.mouse.click(b.x, b.y);
  await page.waitForTimeout(1200);
  const open = () => page.evaluate(() => !!document.querySelector('.pxs-shade:not([hidden]):not(.world-off)'));
  let ok = await open();
  if (!ok) {
    // 人走开了没点中：点上方那行字也开卡
    await page.evaluate((id) => window.__castOf(window.__game.world()).open(id), a.id);
    await page.waitForTimeout(600);
  }
  await shot(`${tag}-card`);
  check(`${tag}：点人出人物卡`, ok || (await open()), ok ? '' : '（第二下没点中人，用 open(id) 开的）');
  await page.evaluate(() => {
    const c = window.__castOf(window.__game.world());
    c.close();
    c.cancel();
  });
}

// ── 开局：公交站 ──
const s0 = await state();
check('开局在到达图', s0.where === 'arrive', JSON.stringify(s0));
await shot('arrive-start');
await tapPerson('arrive');
// 地图图标
await page.click('.pxh-root:not(.world-off) button[data-id="map"]');
await page.waitForTimeout(500);
await shot('map-arrive');
check('地图图标点开', await page.evaluate(() => window.__game.map.isOpen()));
await page.evaluate(() => window.__game.map.close());
// 名册
await page.click('.pxh-root:not(.world-off) button[data-id="roster"]');
await page.waitForTimeout(600);
await shot('roster');
await page.evaluate(() => window.__castOf('vista').close());

await walkTo('到达：公交站 → 前台', [20.4, 14.6], null);
await shot('arrive-desk');
// 往东走到踏脚石上：快到出口，上方一行"→ 俱乐部内场"
await walkTo('到达：前台 → 踏脚石（出口提示）', [29.4, 14.6], null);
await shot('arrive-exit-hint');
{
  const s = await signs();
  check('踏脚石上：有去内场的路牌，没有指向当前图的', s.length > 0 && s.every((t) => !t.includes('到达')), JSON.stringify(s));
}
// 转场中间帧（圆心在总监身上）
await page.evaluate(() => window.__game.iris.pose('close', 0.55));
await shot('iris-mid');
await page.evaluate(() => window.__game.iris.pose(null));
const s1 = await state();
await walkTo('到达：前台 → 东边踏脚石（→ 内场）', [33.6, 15.6], 'club', 'to-club');
const s2 = await state();
check('进内场：钱、天数没变', s2.money === s1.money && s2.day === s1.day, `${JSON.stringify(s1)} → ${JSON.stringify(s2)}`);
check('进内场：时刻接着走', s2.hour >= s1.hour && s2.hour - s1.hour < 1.5, `${s1.hour} → ${s2.hour}`);
await page.waitForTimeout(1500);
await shot('club-gate');
await walkTo('内场：大门 → 长廊（往西）', [36, -6.5], null);
await page.waitForTimeout(800);
await shot('club-colonnade');
await tapPerson('club');
await page.click('.pxh-root:not(.world-off) button[data-id="map"]');
await page.waitForTimeout(500);
await shot('map-club');
await page.evaluate(() => window.__game.map.close());
await walkTo('内场：长廊 → 广场', [14, -6.5], null);
await page.waitForTimeout(800);
await shot('club-plaza');
const s3 = await state();
await walkTo('内场：广场 → 大门里（出口提示）', [55.5, 0], null);
await shot('club-gate-hint');
await walkTo('内场：广场 → 出大门（→ 到达）', [63.4, 0], 'arrive');
const s4 = await state();
check('回到达：钱、天数没变', s4.money === s3.money && s4.day === s3.day, `${JSON.stringify(s3)} → ${JSON.stringify(s4)}`);
check('回到达：时刻接着走', s4.hour >= s3.hour && s4.hour - s3.hour < 1.5, `${s3.hour} → ${s4.hour}`);
await shot('arrive-back-from-club');
await walkTo('到达：前台东 → 山口（→ 球场）', [23.5, -3.6], 'court', 'to-court');
await shot('court-south');
await walkTo('球场：南口 → 场里', [14, 40], null);
check('离出口远：没有路牌', (await signs()).length === 0, JSON.stringify(await signs()));
await shot('court-in');
await walkTo('球场：场里 → 东口（→ 歇脚）', [40, 37.2], 'oasis');
await shot('oasis-west');
await walkTo('歇脚：西口 → 池边', [6, 30.6], null);
await shot('oasis-pool');
await walkTo('歇脚：池边 → 西口（→ 球场）', [-12, 41.8], 'court');
await walkTo('球场：东口 → 西北石阶（→ 练习场）', [0, -3], 'practice');
await shot('practice-south');
await walkTo('练习场：南口 → 凉棚', [16, 7.2], null);
await shot('practice-ramada');
await walkTo('练习场：凉棚 → 南口（→ 球场）', [21.4, 59.4], 'court');
await walkTo('球场：南口石阶上 → 南口（→ 到达）', [11.2, 65.8], 'arrive');
await walkTo('到达：山口 → 公交站', [11, 42.2], null);
await shot('arrive-end');
const s5 = await state();
check('走完一圈：钱没变、时刻往前', s5.money === s0.money && s5.hour > s0.hour, `${JSON.stringify(s0)} → ${JSON.stringify(s5)}`);

console.log(errors.length ? `页面报错：\n${errors.join('\n')}` : '页面没有报错');
console.log(fails ? `${fails} 项没过` : '全部通过');
await browser.close();
