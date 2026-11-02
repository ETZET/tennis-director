// 用法：node shoot.mjs <outDir> [url]
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire(`${process.env.REPO ?? process.cwd()}/package.json`);
const { chromium } = require('playwright-core');
const out = process.argv[2];
const url = process.argv[3] ?? 'http://127.0.0.1:7330/?seed=42&new';
fs.mkdirSync(out, { recursive: true });
const exe = process.env.CHROMIUM_PATH ?? '';
const browser = await chromium.launch({
  executablePath: fs.existsSync(exe) ? exe : undefined,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const FINAL = {
  outer_1: 'resurfaced', outer_23: 'playable', practice: 'open', clubhouse: 'open',
  plaza: 'open', stadium_3: 'open', stadium_2: 'open', stadium_1: 'restored',
};
const ONLY = (process.env.VIEWS ?? 'mobile,desktop').split(',');
const STATES = (process.env.STATES ?? 'start,repaired').split(',');
const views = [
  { name: 'mobile', viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  { name: 'desktop', viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 },
];
const report = {};
for (const v of views.filter((x) => ONLY.includes(x.name))) {
  for (const state of STATES) {
    const ctx = await browser.newContext({ viewport: v.viewport, deviceScaleFactor: v.deviceScaleFactor, isMobile: v.isMobile, hasTouch: v.hasTouch });
    const page = await ctx.newPage();
    const logs = [];
    page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(`${m.type()}: ${m.text()}`); });
    page.on('pageerror', (e) => logs.push(`pageerror: ${e.message}`));
    await page.addInitScript(() => {
      let a = 1234567;
      Math.random = () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
      window.__draws = 0; window.__tris = 0;
      for (const P of [WebGLRenderingContext.prototype, WebGL2RenderingContext.prototype]) {
        for (const fn of ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced']) {
          const orig = P[fn]; if (!orig) continue;
          P[fn] = function (...args) { window.__draws++; return orig.apply(this, args); };
        }
      }
    });
    await page.clock.install({ time: new Date('2026-11-01T12:00:00Z') });
    await page.goto(url);
    await page.clock.runFor(1500);
    await page.waitForFunction(() => !!window.__td);
    await page.evaluate(([state, FINAL]) => {
      const s = window.__td.session();
      s.paused = true;
      // 剧情镜头会在手机上接管目标点、跟着动的人走，截图就不确定了；截基准时关掉，只拍 home 姿态
      if (window.__labCam) window.__labCam.followStory = false;
      if (state === 'repaired') { Object.assign(s.s.facilities, FINAL); window.__td.resync(); }
    }, [state, FINAL]);
    await page.addStyleTag({ content: '.td-card{position:fixed!important;top:100vh!important;visibility:hidden!important}' });
    await page.clock.runFor(1500);
    for (let k = 0; k < 4; k++) {
      // 每个角度都先 r 回到初始姿态（剧情镜头可能已经接管了目标点），再转 k×90°；
      // 拍照前距离最后一次按键不到 5 秒，剧情镜头不会再接管
      await page.keyboard.press('r');
      for (let i = 0; i < 2 * k; i++) await page.keyboard.press('q');
      await page.clock.runFor(4000);
      await page.evaluate(() => { window.__fd = []; let prev = window.__draws; const tick = () => { window.__fd.push(window.__draws - prev); prev = window.__draws; if (window.__fd.length < 12) requestAnimationFrame(tick); }; requestAnimationFrame(tick); });
      await page.clock.runFor(16 * 14);
      const fd = await page.evaluate(() => window.__fd.slice(2).sort((a, b) => a - b));
      const d1 = fd[Math.floor(fd.length / 2)], d0 = 0;
      const file = `${out}/${v.name}-${state}-a${k}.png`;
      await page.screenshot({ path: file });
      const cam = await page.evaluate(() => { const c = window.__labCam; const st = window.__labStage; const r = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, +(+v).toFixed(3)])); return c ? { target: r(c.target), home: r(c.home), occl: c.occludedBottomPx, shift: +c.shiftPx.toFixed(2), simTime: window.__td.session().time, w: st.renderer.domElement.clientWidth, h: st.renderer.domElement.clientHeight } : null; });
      report[`${v.name}-${state}-a${k}`] = { drawsPerFrameApprox: d1 - d0, cam };
    }
    report[`${v.name}-${state}-logs`] = logs.slice(0, 20);
    await ctx.close();
  }
}
fs.writeFileSync(`${out}/report.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 1));
await browser.close();
