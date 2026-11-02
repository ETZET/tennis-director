// 用法：node measure.mjs <label>，量 renderer.info 和每帧主通道/阴影通道的绘制调用
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire(`${process.env.REPO ?? process.cwd()}/package.json`);
const { chromium } = require('playwright-core');
const exe = process.env.CHROMIUM_PATH ?? '';
const browser = await chromium.launch({ executablePath: exe, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const FINAL = { outer_1: 'resurfaced', outer_23: 'playable', practice: 'open', clubhouse: 'open', plaza: 'open', stadium_3: 'open', stadium_2: 'open', stadium_1: 'restored' };
const out = {};
for (const state of ['start', 'repaired']) {
  const ctx = await browser.newContext(process.env.MOBILE ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    let a = 1234567;
    Math.random = () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  });
  await page.clock.install({ time: new Date('2026-11-01T12:00:00Z') });
  await page.goto(process.argv[2]);
  await page.clock.runFor(1500);
  await page.addStyleTag({ content: '.td-card{position:fixed!important;top:100vh!important;visibility:hidden!important}' });
  await page.evaluate(([state, FINAL]) => {
    const s = window.__td.session(); s.paused = true; if (window.__labCam) window.__labCam.followStory = false;
    if (state === 'repaired') { Object.assign(s.s.facilities, FINAL); window.__td.resync(); }
  }, [state, FINAL]);
  await page.keyboard.press('r');
  await page.clock.runFor(2500);
  await page.evaluate(() => {
    const st = window.__labStage;
    const objs = [];
    st.scene.traverse((o) => { if (o.isMesh || o.isSprite || o.isPoints || o.isLine) objs.push(o); });
    let main = {};
    for (const o of objs) { const prev = o.onBeforeRender; o.onBeforeRender = function (...a) { const k = o.isInstancedMesh ? 'InstancedMesh' : o.isSprite ? 'Sprite' : 'Mesh'; main[k] = (main[k] || 0) + 1; return prev.apply(this, a); }; }
    const gl = st.renderer.getContext();
    let glDraws = 0;
    for (const fn of ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced']) { const f = gl[fn]?.bind(gl); if (f) gl[fn] = (...a) => { glDraws++; return f(...a); }; }
    const render = st.renderer.render.bind(st.renderer);
    st.renderer.render = (sc, cam) => {
      main = {}; glDraws = 0;
      render(sc, cam);
      const vis = (o) => { for (let p = o; p; p = p.parent) if (!p.visible) return false; return true; };
      const info = st.renderer.info;
      const mainTotal = Object.values(main).reduce((x, y) => x + y, 0);
      window.__m = {
        glDraws, infoCalls: info.render.calls, infoTriangles: info.render.triangles,
        geometries: info.memory.geometries, textures: info.memory.textures, programs: info.programs?.length,
        mainPass: { total: mainTotal, ...main }, shadowPassApprox: glDraws - mainTotal,
        sceneVisibleDrawables: objs.filter(vis).length, visibleCasters: objs.filter((o) => vis(o) && o.castShadow).length,
        instancedVisible: objs.filter((o) => o.isInstancedMesh && vis(o)).length,
      };
    };
  });
  await page.clock.runFor(200);
  const r = await page.evaluate(() => window.__m);
  out[state] = r;
  await ctx.close();
}
console.log(JSON.stringify(out, null, 1));
await browser.close();
