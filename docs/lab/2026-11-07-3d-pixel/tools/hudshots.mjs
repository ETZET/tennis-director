// 界面的截图和量图（clubsite/hud，docs/lab/2026-11-07-3d-pixel/redo-ui.md）：
//   node hudshots.mjs <输出目录> <url> <宽> <高> [前缀] [动作…]
// 动作（默认 all）：
//   ui     截一张带界面的（full）+ 一张把界面全藏掉的（bare，量场景用），再量界面像素（measure）→ <前缀>-ui.json
//   live   同 ui，但不暂停（url 里的 pause=1 拿掉），量真玩时的一帧 → <前缀>-live.json
//   peek   点离画面中心最近的一个人（演员表里的） → 头上的名字 + 一句话
//   mood   点一个心情泡 → 整句
//   clock  点日钟 → 时刻和天气面板
//   iris   圆形转场定格三帧（收拢中 / 黑 / 展开中）
//   debug  ?debug=1 的调试牌
// 截图时间：开页面以后等 WAIT 毫秒（默认 11000）。
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
const [out, url, w = '390', h = '844', pre = 'shot', ...acts0] = process.argv.slice(2);
const acts = acts0.length ? acts0 : ['ui', 'live', 'peek', 'mood', 'clock', 'iris', 'debug'];
const WAIT = Number(process.env.WAIT ?? 11000);
mkdirSync(out, { recursive: true });
const browser = await pw.chromium.launch({
  executablePath: existsSync(exe) ? exe : undefined,
  args: ['--use-gl=angle', '--enable-unsafe-swiftshader'],
});
const errors = [];
async function open(u) {
  const page = await browser.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: 1, hasTouch: true });
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(u);
  await page.waitForTimeout(WAIT);
  return page;
}
const P = (n) => `${out}/${pre}-${n}.png`;
const withQ = (u, q) => u + (u.includes('?') ? '&' : '?') + q;

// 界面像素：把场景的 canvas 藏掉、底色换成品红，数不是品红的像素（只数界面）；中间 60% 区域再数一遍，
// 再把心情泡和互动点的黄箭头也藏掉数一遍（= 中间的"字和框"）。ui = 暂停的同一帧；live = 不暂停跑一会儿（真玩的帧）。
async function measure(page) {
  const count = async (extra) => {
    const st = await page.addStyleTag({
      content: `canvas#c, canvas#c2 { visibility: hidden !important; } html, body { background: #ff00ff !important; } ${extra}`,
    });
    await page.waitForTimeout(250);
    const buf = await page.screenshot();
    if (!extra) writeFileSync(P('mask'), buf);
    await st.evaluate((e) => e.remove());
    return page.evaluate(
      async ([src, W, H]) => {
        const img = new Image();
        img.src = src;
        await img.decode();
        const c = new OffscreenCanvas(W, H);
        const g = c.getContext('2d');
        g.drawImage(img, 0, 0);
        const d = g.getImageData(0, 0, W, H).data;
        let all = 0;
        let mid = 0;
        for (let y = 0; y < H; y++)
          for (let x = 0; x < W; x++) {
            const i = (y * W + x) * 4;
            const m = Math.abs(d[i] - 255) + d[i + 1] + Math.abs(d[i + 2] - 255);
            if (m > 40) {
              all++;
              if (x >= W * 0.2 && x < W * 0.8 && y >= H * 0.2 && y < H * 0.8) mid++;
            }
          }
        return { all, mid };
      },
      [`data:image/png;base64,${buf.toString('base64')}`, +w, +h],
    );
  };
  const a = await count('');
  const b = await count('.pxh-moods, .play-mark, .play-bubbles { visibility: hidden !important; }');
  return {
    uiPx: a.all,
    uiPct: +((a.all / (+w * +h)) * 100).toFixed(2),
    midPx: a.mid,
    midTextPx: b.mid,
  };
}

for (const act of ['ui', 'live']) {
  if (!acts.includes(act)) continue;
  const page = await open(act === 'live' ? url.replace(/[&?]pause=1/, '') : url);
  await page.screenshot({ path: P(act === 'live' ? 'live' : 'full') });
  if (act === 'ui') {
    const st = await page.addStyleTag({
      content:
        'body > *:not(canvas#c) { visibility: hidden !important; } .pxh-root, .pxh-root * { visibility: hidden !important; }',
    });
    await page.waitForTimeout(300);
    await page.screenshot({ path: P('bare') });
    await st.evaluate((e) => e.remove());
  }
  const r = await measure(page);
  writeFileSync(`${out}/${pre}-${act}.json`, JSON.stringify(r, null, 1));
  console.log(pre, act, JSON.stringify(r));
  await page.close();
}

if (acts.includes('peek')) {
  const page = await open(url);
  const pt = await page.evaluate(() => {
    const cast = window.__cast;
    const walk = window.__walk;
    if (!cast || !walk) return null;
    const W = innerWidth;
    const H = innerHeight;
    let best = null;
    for (const b of cast.bound()) {
      if (b.d > 12) continue;
      const o = cast.binder.objOf(b.id)?.obj;
      if (!o || !o.visible) continue;
      const v = o.getWorldPosition(new o.position.constructor());
      v.y += 1.0;
      const p = walk.play.project(v, W, H);
      if (p.x < 30 || p.x > W - 30 || p.y < 120 || p.y > H - 120) continue;
      const d = Math.hypot(p.x - W / 2, p.y - H / 2);
      if (!best || d < best.d) best = { x: p.x, y: p.y, d, id: b.id };
    }
    return best;
  });
  if (pt) {
    await page.touchscreen.tap(pt.x, pt.y);
    await page.waitForTimeout(700);
  } else console.log('peek: 没找到人');
  await page.screenshot({ path: P('peek') });
  console.log(pre, 'peek', JSON.stringify(pt));
  await page.close();
}

if (acts.includes('mood')) {
  const page = await open(url);
  // 画面里没有人在说话：让离画面中心最近的人说一句（演员表里的人）
  if (!(await page.$$('.pxh-mood:not([hidden])')).length)
    await page.evaluate(() => {
      const cast = window.__cast;
      const walk = window.__walk;
      const W = innerWidth;
      const H = innerHeight;
      let best = null;
      for (const b of cast.bound()) {
        const o = cast.binder.objOf(b.id)?.obj;
        if (!o || !o.visible) continue;
        const v = o.getWorldPosition(new o.position.constructor());
        const p = walk.play.project(v, W, H);
        const d = Math.hypot(p.x - W / 2, p.y - H / 2);
        if (p.y > 140 && p.y < H - 140 && (!best || d < best.d)) best = { o, d };
      }
      if (best) walk.play.say(best.o, '网松了，打不了', 60, 1.8);
    });
  await page.waitForTimeout(500);
  await page.screenshot({ path: P('mood-0') });
  const els = await page.$$('.pxh-mood:not([hidden])');
  if (els.length) {
    const bb = await els[0].boundingBox();
    await page.touchscreen.tap(bb.x + bb.width / 2, bb.y + bb.height / 2);
    await page.waitForTimeout(400);
  } else console.log('mood: 没有心情泡');
  await page.screenshot({ path: P('mood') });
  await page.close();
}

if (acts.includes('clock')) {
  const page = await open(url);
  const bb = await (await page.$('.pxh-clock'))?.boundingBox();
  if (bb) {
    await page.touchscreen.tap(bb.x + bb.width / 2, bb.y + bb.height / 3);
    await page.waitForTimeout(400);
  }
  await page.screenshot({ path: P('clock') });
  await page.close();
}

if (acts.includes('iris')) {
  const page = await open(url);
  for (const [ph, k, n] of [
    ['close', 0.55, 'iris-1'],
    ['black', 0.7, 'iris-2'],
    ['open', 0.4, 'iris-3'],
  ]) {
    await page.evaluate(([ph, k]) => window.__hud?.iris.pose(ph, k), [ph, k]);
    await page.waitForTimeout(150);
    await page.screenshot({ path: P(n) });
  }
  await page.close();
}

// 真的走进会所（泳池北门 → 会所里）：转场开始以后连拍
if (acts.includes('house')) {
  const page = await open(withQ(url, 'at=-47.6,-3&prebuild=1'));
  await page.evaluate(() => window.__walk.play.tapWorld(-47.6, -14));
  let n = 0;
  for (let i = 0; i < 200 && n < 10; i++) {
    const busy = await page.evaluate(() => window.__hud?.iris.busy());
    if (busy) await page.screenshot({ path: P(`house-${n++}`) });
    else if (n) break;
    else await page.waitForTimeout(60);
  }
  await page.waitForTimeout(800);
  await page.screenshot({ path: P('house-after') });
  console.log(pre, 'house', n, '帧');
  await page.close();
}

if (acts.includes('debug')) {
  const page = await open(withQ(url, 'debug=1'));
  await page.screenshot({ path: P('debug') });
  // 调试里点日钟 = 调时间面板
  const bb = await (await page.$('.pxh-clock'))?.boundingBox();
  if (bb) {
    await page.touchscreen.tap(bb.x + bb.width / 2, bb.y + bb.height / 3);
    await page.waitForTimeout(400);
    await page.screenshot({ path: P('debug-panel') });
  }
  await page.close();
}

await browser.close();
console.log(errors.length ? `ERR:\n${[...new Set(errors)].join('\n')}` : 'ok');
