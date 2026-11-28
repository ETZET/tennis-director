// 屏上的字有多少（redo-ui.md「第四轮：让布局说话」）：九张图竖屏 390×844，每张拍几帧、把屏上每一段看得见的字列出来（哪种、在哪、多大），
// 算字框面积占屏。
//   enter = 进图 1.2 秒（地名、开局提示还亮着的时候）；still = 再过 6 秒（静止）；exit = 站到一个出口里面一点（路牌 / 出口箭头）；
//   chore = 干完一件活（进账反馈，life.testReward）+ 动作键第一次亮；peek = 点离屏幕中心最近的一个人（上方一行）。
// node docs/lab/2026-11-07-3d-pixel/tools/lesstext.mjs <输出目录> [端口 5391] [额外查询串，如 "hour=22"] [后缀]
// ONLY=arrive,plaza 只拍这几张；FRAMES=enter,still 只拍这几帧。输出 <id>-<帧><后缀>.png、text<后缀>.json，最后打一张表。
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
const [out, port = '5391', extra = 'hour=12', suffix = ''] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const MAPS = (process.env.ONLY ?? 'arrive,court,oasis,practice,plaza,lobby,street,academy,golf').split(',');
const FRAMES = (process.env.FRAMES ?? 'enter,still,exit,chore,peek').split(',');
const W = 390;
const H = 844;

const browser = await pw.chromium.launch({
  executablePath: existsSync(exe) ? exe : undefined,
  args: ['--use-gl=angle', '--enable-unsafe-swiftshader'],
});

/** 页面里：所有看得见的字（文字节点的行框），按界面的哪一块归类 */
function inventory() {
  const KINDS = [
    ['.pxh-ways', '出口路牌'],
    ['.pxh-place', '地名'],
    ['.pxh-blacknote', '转场地名'],
    ['.pxh-hint', '操作提示'],
    ['.pxh-sign', '按钮名牌'],
    ['.pxh-cpop', '进账'],
    ['.pxh-gain', '进账'],
    ['.pxh-toast', '上方一行'],
    ['.pxh-date', '日钟下'],
    ['.pxh-money', '钱'],
    ['#palsel, #pxsel, .crowd-btn, .play-bar, .dl-panel, #perf, #info', '调试'],
  ];
  const vis = (el) => {
    let op = 1;
    for (let e = el; e && e !== document.documentElement; e = e.parentElement) {
      const cs = getComputedStyle(e);
      if (cs.display === 'none') return false;
      if (e === el && cs.visibility === 'hidden') return false;
      op *= Number(cs.opacity);
    }
    return op > 0.05;
  };
  const list = [];
  const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = tw.nextNode(); n; n = tw.nextNode()) {
    const s = n.textContent.trim();
    if (!s) continue;
    const el = n.parentElement;
    if (!el || el.closest('script,style') || !vis(el)) continue;
    const r = document.createRange();
    r.selectNodeContents(n);
    let area = 0;
    let box = null;
    for (const rc of r.getClientRects()) {
      const x0 = Math.max(0, rc.left);
      const y0 = Math.max(0, rc.top);
      const x1 = Math.min(innerWidth, rc.right);
      const y1 = Math.min(innerHeight, rc.bottom);
      if (x1 <= x0 || y1 <= y0) continue;
      area += (x1 - x0) * (y1 - y0);
      box = box
        ? [Math.min(box[0], x0), Math.min(box[1], y0), Math.max(box[2], x1), Math.max(box[3], y1)]
        : [x0, y0, x1, y1];
    }
    if (!area) continue;
    const kind = KINDS.find(([sel]) => el.closest(sel))?.[1] ?? `其他(${el.className || el.tagName})`;
    list.push({
      kind,
      text: s.slice(0, 40),
      box: box.map(Math.round),
      font: getComputedStyle(el).fontSize,
      area: Math.round(area),
    });
  }
  return list;
}

const rows = [];
async function open(id) {
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1, hasTouch: true });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(`http://localhost:${port}/clubvista.html?map=${id}&castreset=1&${extra}`, { timeout: 120000 });
  await page.waitForFunction(() => window.__vista?.play && window.__hud, null, { timeout: 90000 });
  return { page, errors };
}
async function snap(page, id, frame) {
  await page.screenshot({ path: `${out}/${id}-${frame}${suffix}.png` });
  const inv = await page.evaluate(inventory);
  const area = inv.reduce((a, b) => a + b.area, 0);
  rows.push({ id, frame, pct: +((area / (W * H)) * 100).toFixed(2), n: inv.length, inv });
}

for (const id of MAPS) {
  const { page, errors } = await open(id);
  if (FRAMES.includes('enter')) {
    await page.waitForTimeout(1200);
    await snap(page, id, 'enter');
  }
  if (FRAMES.includes('still')) {
    await page.waitForTimeout(6000);
    await snap(page, id, 'still');
  }
  if (FRAMES.includes('exit')) {
    // 第一个出口：站到对面那张图回来时进的入口上（就在出口里面一点）
    await page.evaluate(() => {
      const v = window.__vista;
      const b = v.built.find((m) => m.def.id === v.cur());
      const ex = b.def.exits[0];
      const ents = Object.values(b.def.entries);
      ents.sort((p, q) => Math.hypot(p.at[0] - ex.at[0], p.at[1] - ex.at[1]) - Math.hypot(q.at[0] - ex.at[0], q.at[1] - ex.at[1]));
      // 站在出口里面 (半径 + 2.5) 米、朝最近的入口那边（入口可能离出口很远：喷泉广场的西入口在 12 米外）
      const e = ents[0];
      const dx = e.at[0] - ex.at[0];
      const dz = e.at[1] - ex.at[1];
      const L = Math.hypot(dx, dz) || 1;
      const k = Math.min(1, (ex.r + 2.5) / L);
      v.play.teleport(ex.at[0] + dx * k + b.ox, ex.at[1] + dz * k, e.yaw);
      v.step(0.3);
    });
    await page.waitForTimeout(700);
    await snap(page, id, 'exit');
  }
  if (FRAMES.includes('chore')) {
    await page.evaluate(() => {
      const v = window.__vista;
      const b = v.built.find((m) => m.def.id === v.cur());
      v.play.teleport(b.def.start.at[0] + b.ox, b.def.start.at[1], b.def.start.yaw);
      v.step(0.2);
    });
    // 镜头跟过去以后再干活（金币冒在总监头上）
    await page.waitForTimeout(1200);
    // 每张图干一件它那儿的活（进账那一行最前面的图标跟着活变）
    const CHORE = { arrive: 'luggageDone', court: 'sweepDone', oasis: 'waterDone', practice: 'ballsDone', plaza: 'cupDone', lobby: 'towelDone', street: 'netDone', academy: 'hopperDone', golf: 'greetDone' };
    await page.evaluate((k) => window.__vista.life?.testReward?.(k, 2, 3), CHORE[id] ?? 'ballsDone');
    await page.waitForTimeout(400);
    await snap(page, id, 'chore');
  }
  if (FRAMES.includes('peek')) {
    await page.waitForTimeout(2600);
    const pt = await page.evaluate(() => {
      const cast = window.__cast;
      const v = window.__vista;
      if (!cast || !v) return null;
      let best = null;
      for (const b of cast.bound()) {
        const o = cast.binder.objOf(b.id)?.obj;
        if (!o || !o.visible || !o.parent) continue;
        const w = o.getWorldPosition(new o.position.constructor());
        w.y += 1.0;
        const p = v.play.project(w, innerWidth, innerHeight);
        if (p.x < 30 || p.x > innerWidth - 30 || p.y < 130 || p.y > innerHeight - 140) continue;
        const d = Math.hypot(p.x - innerWidth / 2, p.y - innerHeight / 2);
        if (!best || d < best.d) best = { x: p.x, y: p.y, d, id: b.id };
      }
      return best;
    });
    if (pt) {
      await page.touchscreen.tap(pt.x, pt.y);
      await page.waitForTimeout(600);
      await snap(page, id, 'peek');
    } else rows.push({ id, frame: 'peek', pct: null, n: 0, inv: [], note: '没找到人' });
  }
  if (errors.length) console.log(`${id} 页面报错：\n  ${errors.slice(0, 4).join('\n  ')}`);
  await page.close();
}
await browser.close();
writeFileSync(`${out}/text${suffix}.json`, JSON.stringify(rows, null, 1));

// 表：每帧字框占屏 %；再按种类合计（所有帧加起来的面积、出现几次、例子）
const frames = [...new Set(rows.map((r) => r.frame))];
console.log(`| 图 | ${frames.join(' | ')} |`);
console.log(`| --- | ${frames.map(() => '---').join(' | ')} |`);
for (const id of MAPS) {
  const cells = frames.map((f) => {
    const r = rows.find((x) => x.id === id && x.frame === f);
    return r ? (r.pct === null ? '—' : `${r.pct}%`) : '';
  });
  console.log(`| ${id} | ${cells.join(' | ')} |`);
}
const avg = (f) => {
  const xs = rows.filter((r) => r.frame === f && r.pct !== null).map((r) => r.pct);
  return xs.length ? (xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(2) : '—';
};
console.log(`| 平均 | ${frames.map((f) => `${avg(f)}%`).join(' | ')} |`);
const kinds = {};
for (const r of rows)
  for (const t of r.inv) {
    const k = (kinds[t.kind] ??= { n: 0, area: 0, ex: new Set(), font: t.font });
    k.n++;
    k.area += t.area;
    if (k.ex.size < 4) k.ex.add(t.text);
  }
console.log('\n| 种类 | 出现（帧·段） | 面积合计 px | 字号 | 例子 |\n| --- | --- | --- | --- | --- |');
for (const [k, v] of Object.entries(kinds).sort((a, b) => b[1].area - a[1].area))
  console.log(`| ${k} | ${v.n} | ${v.area} | ${v.font} | ${[...v.ex].join(' / ')} |`);
