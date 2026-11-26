// 点开以后的面板（名册、人物卡片、第二层、日钟小牌子、地图、调试面板）逐个截图 + 量字数和占屏面积（redo-ui.md「面板（第二轮）」）：
//   node panelshots.mjs <输出目录> <url> <宽> <高> [前缀]
// 量法：面板 = [data-panel]（新的）或旧的 .cast-overlay .cast-sheet / #minimap / .dl-panel 里看得见的那一个；
//   chars = 面板里的字（去掉空白），seen = 其中落在屏幕里、没被滚动裁掉的；area = 面板矩形和屏幕相交的面积 / 屏幕面积。
// 输出 <前缀>-<名>.png 和 <前缀>-panels.json。WAIT 毫秒（默认 11000）后开始。
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
const [out, url, w = '390', h = '844', pre = 'p'] = process.argv.slice(2);
const WAIT = Number(process.env.WAIT ?? 11000);
mkdirSync(out, { recursive: true });
const browser = await pw.chromium.launch({
  executablePath: existsSync(exe) ? exe : undefined,
  args: ['--use-gl=angle', '--enable-unsafe-swiftshader'],
});
const errors = [];
const P = (n) => `${out}/${pre}-${n}.png`;
const withQ = (u, q) => u + (u.includes('?') ? '&' : '?') + q;
const res = {};

async function open(u) {
  const page = await browser.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: 1, hasTouch: true });
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(u);
  await page.waitForTimeout(WAIT);
  return page;
}

async function measure(page, name) {
  const r = await page.evaluate(() => {
    const W = innerWidth;
    const H = innerHeight;
    const vis = (e) => {
      if (!e) return false;
      const s = getComputedStyle(e);
      if (s.display === 'none' || s.visibility === 'hidden' || +s.opacity === 0) return false;
      const b = e.getBoundingClientRect();
      return b.width > 0 && b.height > 0;
    };
    const cands = [
      ...document.querySelectorAll('[data-panel]'),
      ...document.querySelectorAll('.cast-overlay:not([hidden]) .cast-sheet'),
      ...(document.body.classList.contains('pxh-map') ? [document.getElementById('minimap')] : []),
      ...document.querySelectorAll('.pxh-tip:not(.gone), .pxh-toast:not(.gone)'),
      ...document.querySelectorAll('.dl-panel'),
    ].filter((e) => e && vis(e) && !e.closest('[hidden]'));
    const out = [];
    for (const p of cands) {
      const b = p.getBoundingClientRect();
      const ix = Math.max(0, Math.min(W, b.right) - Math.max(0, b.left));
      const iy = Math.max(0, Math.min(H, b.bottom) - Math.max(0, b.top));
      let chars = 0;
      let seen = 0;
      const tw = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
      for (let n = tw.nextNode(); n; n = tw.nextNode()) {
        const t = n.textContent.replace(/\s+/g, '');
        if (!t) continue;
        const e = n.parentElement;
        if (!vis(e) || e.closest('[hidden]')) continue;
        chars += t.length;
        // 看得见：父元素矩形落在屏幕里、也在所有滚动祖先的可视范围里
        const eb = e.getBoundingClientRect();
        let ok = eb.bottom > 0 && eb.top < H && eb.right > 0 && eb.left < W;
        for (let a = e.parentElement; ok && a && a !== document.body; a = a.parentElement) {
          const s = getComputedStyle(a);
          if (/(auto|scroll|hidden)/.test(s.overflowY + s.overflowX)) {
            const ab = a.getBoundingClientRect();
            if (eb.bottom <= ab.top || eb.top >= ab.bottom || eb.right <= ab.left || eb.left >= ab.right) ok = false;
          }
        }
        if (ok) seen += t.length;
      }
      // 画在像素图里的数字（点阵）也算字：canvas[data-chars]
      let drawn = 0;
      for (const c of p.querySelectorAll('canvas[data-chars]')) if (vis(c)) drawn += +c.dataset.chars || 0;
      // 输入框的占位字也算
      for (const i of p.querySelectorAll('input')) if (vis(i)) chars += (i.placeholder || '').replace(/\s+/g, '').length;
      out.push({
        sel: p.dataset.panel || p.className || p.id,
        chars,
        seen,
        drawn,
        area: +(((ix * iy) / (W * H)) * 100).toFixed(1),
      });
    }
    return out;
  });
  res[name] = r;
  console.log(pre, name, JSON.stringify(r));
}

async function shot(page, name) {
  await page.waitForTimeout(450);
  await page.screenshot({ path: P(name) });
  await measure(page, name);
}

/** 离画面中心最近、看得见的人（演员表） */
const nearest = (page) =>
  page.evaluate(() => {
    const cast = window.__cast;
    const walk = window.__walk;
    if (!cast || !walk) return null;
    const W = innerWidth;
    const H = innerHeight;
    let best = null;
    for (const b of cast.bound()) {
      if (b.d > 14) continue;
      // 站着不动的人（走路的追不上，截不到"当面"）
      if (!['rest', 'watch', 'eat', 'wait', 'work'].includes(cast.ctx.nowOf(b.id).activity)) continue;
      const o = cast.binder.objOf(b.id)?.obj;
      if (!o || !o.visible) continue;
      const v = o.getWorldPosition(new o.position.constructor());
      v.y += 1.0;
      const p = walk.play.project(v, W, H);
      if (p.x < 30 || p.x > W - 30 || p.y < 120 || p.y > H - 160) continue;
      const d = Math.hypot(p.x - W / 2, p.y - H / 2);
      if (!best || d < best.d) best = { x: p.x, y: p.y, d, id: b.id };
    }
    return best;
  });

{
  const page = await open(url);
  // 1 名册
  const hasRosterBtn = await page.$('[data-hud="roster"], .pxh-btn[data-id="roster"]');
  if (hasRosterBtn) {
    const bb = await hasRosterBtn.boundingBox();
    await page.touchscreen.tap(bb.x + bb.width / 2, bb.y + bb.height / 2);
  } else await page.evaluate(() => window.__cast?.roster());
  await shot(page, 'roster');
  // 名册里点第一个人（新的：看板上的头像；旧的：第一行）
  const first = await page.$('[data-panel] [data-id], .cast-overlay:not([hidden]) .cast-row');
  if (first) {
    const bb = await first.boundingBox();
    await page.touchscreen.tap(bb.x + bb.width / 2, bb.y + bb.height / 2);
    await shot(page, 'roster-pick');
  }
  await page.evaluate(() => window.__cast?.close());
  await page.waitForTimeout(300);
  // 2 场景里的人：点一下（上方那行）→ 再点（卡片）
  const pt = await nearest(page);
  if (pt) {
    await page.touchscreen.tap(pt.x, pt.y);
    await shot(page, 'peek');
    // 走到他跟前（到了卡片自己打开），保证"当面"
    await page.evaluate((id) => window.__cast.walkTo(id), pt.id);
    await page.waitForTimeout(5000);
    await page.evaluate((id) => {
      if (!document.querySelector('.pxs-card') || document.querySelector('.pxs-card').closest('[hidden]')) window.__cast.open(id);
    }, pt.id);
    await shot(page, 'card');
    // 当面时按第一个互动（聊几句）：卡顶浮一行动作名、一句回话、心往上飘
    const act = await page.$('.pxc-acts:not(.far) > button');
    if (act) {
      const bb = await act.boundingBox();
      await page.touchscreen.tap(bb.x + bb.width / 2, bb.y + bb.height / 2);
      await page.waitForTimeout(150);
      await page.screenshot({ path: P('card-act') });
      await measure(page, 'card-act');
    }
    // 第二层：点"更多"（新的），旧的把卡片滚到底
    const more = await page.$('[data-panel] [data-more]');
    if (more) {
      const bb = await more.boundingBox();
      await page.touchscreen.tap(bb.x + bb.width / 2, bb.y + bb.height / 2);
      await shot(page, 'card-more');
    } else {
      await page.evaluate(() => {
        const b = document.querySelector('.cast-overlay:not([hidden]) .cast-body');
        if (b) b.scrollTop = b.scrollHeight;
      });
      await shot(page, 'card-more');
    }
    await page.evaluate(() => window.__cast?.close());
  } else console.log('没找到人');
  // 3 名单上的老熟人（named 第一个，见过面）
  await page.evaluate(() => {
    const c = window.__cast;
    const p = c.ctx.cast.roster().find((x) => x.tier === 'named');
    const m = { ...c.ctx.mem(p.id), met: true, favor: 6.5, mood: 80 };
    c.state().people[p.id] = m;
    c.open(p.id);
  });
  await shot(page, 'card-named');
  const more = await page.$('[data-panel] [data-more]');
  if (more) {
    const bb = await more.boundingBox();
    await page.touchscreen.tap(bb.x + bb.width / 2, bb.y + bb.height / 2);
    await shot(page, 'card-named-more');
  }
  await page.evaluate(() => window.__cast?.close());
  // 4 日钟
  const ck = await (await page.$('.pxh-clock'))?.boundingBox();
  if (ck) {
    await page.touchscreen.tap(ck.x + ck.width / 2, ck.y + ck.height / 3);
    await shot(page, 'clock');
  }
  await page.waitForTimeout(2000);
  // 5 地图
  const mp = await page.$('.pxh-btn[data-id="map"]');
  if (mp) {
    const bb = await mp.boundingBox();
    await page.touchscreen.tap(bb.x + bb.width / 2, bb.y + bb.height / 2);
  } else await page.evaluate(() => document.body.classList.add('pxh-map'));
  await shot(page, 'map');
  await page.close();
}
{
  const page = await open(withQ(url, 'debug=1'));
  await shot(page, 'debug');
  const bb = await (await page.$('.pxh-clock'))?.boundingBox();
  if (bb) {
    await page.touchscreen.tap(bb.x + bb.width / 2, bb.y + bb.height / 3);
    await shot(page, 'debug-clock');
  }
  await page.close();
}
writeFileSync(`${out}/${pre}-panels.json`, JSON.stringify(res, null, 1));
await browser.close();
console.log(errors.length ? `ERR:\n${[...new Set(errors)].join('\n')}` : 'ok');
