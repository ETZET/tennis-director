// 分图的活能不能做完：到达图帮客人拎行李、歇脚图收空杯。每件活：等它出现 → 总监走过去做 → 断言钱涨了、有反馈。
// node docs/lab/2026-11-07-3d-pixel/tools/lifechores.mjs [端口 5382] [截图目录]
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
const [port = '5382', out = '/tmp/lifechores'] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const browser = await pw.chromium.launch({
  executablePath: existsSync(exe) ? exe : undefined,
  args: ['--use-gl=angle', '--enable-unsafe-swiftshader'],
});
let fails = 0;
const check = (name, ok, detail = '') => {
  if (!ok) fails++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name} ${detail}`);
};

async function open(q) {
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
    hasTouch: true,
    locale: 'zh-CN',
  });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(`http://localhost:${port}/clubvista.html?castreset=1&clouds=0&${q}`);
  await page.waitForFunction(() => window.__vista?.play && window.__cast, null, { timeout: 60000 });
  return { page, errors };
}
/** 等 cond 成立（最多 sec 秒） */
async function until(page, cond, sec) {
  try {
    await page.waitForFunction(cond, null, { timeout: sec * 1000, polling: 250 });
    return true;
  } catch {
    return false;
  }
}
const money = (page) => page.evaluate(() => window.__cast.state().money);
/** 上方那行反馈字（像素界面的 pop）：读 DOM 里最近冒出来的 */
const popText = (page) =>
  page.evaluate(() => [...document.querySelectorAll('[class*="pxh-pop"], [class*="pxh-toast"]')].map((e) => e.textContent).join(' | '));

// ── 到达：帮客人拎行李 ──
{
  const { page, errors } = await open('hour=9.2');
  const got = await until(page, () => [...window.__vista.play.ui().items ?? []].length >= 0 && window.__vista.play.item?.('luggage-0'), 90);
  check('到达：有客人带着行李下接驳车', got);
  if (got) {
    const m0 = await money(page);
    await page.evaluate(() => {
      const p = window.__vista.play;
      const it = p.item('luggage-0');
      const w = it.obj.getWorldPosition(it.obj.position.clone());
      p.teleport(w.x + 0.9, w.z - 0.3);
    });
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${out}/arrive-luggage.png` });
    await page.evaluate(() => window.__vista.play.pick());
    const held = await until(page, () => window.__vista.play.held()?.id === 'luggage-0', 4);
    check('到达：总监拿起行李', held);
    await page.evaluate(() => {
      const p = window.__vista.play;
      p.walkTo(20 + window.__vista.built[0].ox, 12.6);
    });
    const there = await until(page, () => !window.__vista.play.pathLeft(), 60);
    check('到达：推着行李走到前台', there);
    await page.evaluate(() => window.__vista.play.pick());
    const paid = await until(page, (m) => window.__cast.state().money > 0 && window.__vista.life.debug().done.luggageDone >= 1, 6);
    const m1 = await money(page);
    check('到达：放下行李 → 钱涨了', paid && m1 > m0, `${m0} → ${m1}`);
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${out}/arrive-luggage-done.png` });
  }
  check('到达：页面没有报错', errors.length === 0, errors.slice(0, 3).join(' / '));
  await page.close();
}

// ── 歇脚：收空杯 ──
{
  const { page, errors } = await open('map=oasis&hour=10&tspeed=900');
  const got = await until(
    page,
    () => [...window.__vista.scene.getObjectsByProperty('name', 'cup-left')].length > 0,
    120,
  );
  check('歇脚：有客人走了、桌上留下空杯', got);
  if (got) {
    const m0 = await money(page);
    await page.evaluate(() => {
      const v = window.__vista;
      const c = v.scene.getObjectsByProperty('name', 'cup-left')[0];
      const w = c.getWorldPosition(c.position.clone());
      v.play.teleport(w.x, w.z + 0.9, Math.PI);
    });
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${out}/oasis-cup.png` });
    await page.evaluate(() => {
      const p = window.__vista.play;
      p.setUse(true);
      setTimeout(() => p.setUse(false), 200);
    });
    const paid = await until(page, () => window.__vista.life.debug().done.cupDone >= 1, 6);
    const m1 = await money(page);
    check('歇脚：收杯子 → 钱涨了', paid && m1 > m0, `${m0} → ${m1}`);
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${out}/oasis-cup-done.png` });
  }
  check('歇脚：页面没有报错', errors.length === 0, errors.slice(0, 3).join(' / '));
  await page.close();
}

await browser.close();
console.log(fails ? `${fails} FAIL` : 'all ok');
process.exit(fails ? 1 : 0);
