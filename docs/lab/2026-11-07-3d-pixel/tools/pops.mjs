// 找"凭空出现"：总监站在各处，模拟 N 秒，记录 30 米内的人：看不见→看得见（出现）、看得见→看不见（消失）、一步挪 >0.6 米（瞬移）
// 找"凭空出现"：总监站在给的地点，模拟 N 秒（页面暂停，脚本推模拟），记录 30 米内每个人：
//   appear / vanish   看不见 ↔ 看得见（凭空，除非在出入口：停车场、落客点、会所里和外墙一圈 —— 汇总时按坐标过滤）
//   jump              看得见时一步挪出去 > 0.6 米（< 1.2 米的多半是坐下 / 站起，汇总时过滤）
//   swap-in / swap-out  和通勤替身交接（clubwalk/cast/commute.ts）：合理
//   c-appear / c-vanish 替身自己出现 / 消失（commuter:exit = 在出入口收工，合理；别的原因要查）
// 用法：dev server 开着（默认 5181），node pops.mjs '[["plaza",42,-20]]' 180 [端口] → pops.json（同目录）
// 每个地点单独开一个页面跑（连着跑会把上一个地点的状态带过来）。
import { existsSync, readdirSync } from 'node:fs';
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
const launch = () => pw.chromium.launch({ executablePath: existsSync(exe) ? exe : undefined, args: ['--use-angle=metal', '--enable-gpu'] });
const PORT = process.argv[4] ?? '5181';
import fs from 'node:fs';
const SPOTS = JSON.parse(process.argv[2] ?? '[["park",66,0]]');
const SECS = Number(process.argv[3] ?? 90);
const b = await launch();
const p = await b.newPage({ viewport: { width: 390, height: 844 } });
const errs = []; p.on('pageerror', (e) => errs.push(e.message));
await p.goto(`http://localhost:${PORT}/clubwalk.html?castreset=1&pause=1`, { timeout: 120000 });
await p.waitForFunction(() => window.__clubwalk, null, { timeout: 120000 });
await p.waitForTimeout(3000);
const all = [];
for (const [name, x, z] of SPOTS) {
  await p.evaluate(([x, z]) => window.__clubwalk.play.teleport(x, z, 0), [x, z]);
  await p.waitForTimeout(5000); // 让区域建好
  await p.evaluate(() => { window.__pp = { prev: new Map(), out: [], i: 0, list: null }; });
  for (let k = 0; k < SECS / 5; k++) {
    await p.evaluate(([name]) => {
      const { lives, director, step } = window.__clubwalk;
      const S = window.__pp;
      const shown = (o) => { for (let q = o; q; q = q.parent) if (!q.visible) return false; return true; };
      const w = new director.position.constructor();
      const people = () => {
        const r = [];
        for (const L of lives) {
          if (!L.visible) continue;
          L.root.traverse((o) => { const u = o.userData; if (u.pose && u.setProp && o !== director && u.personKind !== 'director') r.push([L.def.id, o]); });
        }
        return r;
      };
      const sc = window.__clubwalk.scene;
      const comm = () => sc.children.filter((c) => c.name === 'commuter').map((c) => ({ u: c.uuid, id: c.userData.castId, vis: c.visible, x: c.position.x, z: c.position.z, why: c.userData.commuteWhy }));
      for (let j = 0; j < 300; j++, S.i++) {
        const cBefore = comm();
        step(1 / 60);
        const cAfter = comm();
        const matchC = (list, id, x, z, r, vis) => list.some((c) => c.id === id && c.vis === vis && Math.hypot(c.x - x, c.z - z) <= r);
        // 替身自己的出现 / 消失（不是和真人交接的）
        for (const c of cAfter) {
          const b = cBefore.find((q) => q.u === c.u);
          const d = Math.hypot(c.x - director.position.x, c.z - director.position.z);
          if (d > 30) continue;
          const fromReal = c.vis && (!b || !b.vis) && (S.list || []).some(([, o]) => { if (o.userData.castId !== c.id) return false; const q = o.getWorldPosition(new o.position.constructor()); return Math.hypot(q.x - c.x, q.z - c.z) < 1.6; });
          if (fromReal) continue;
          if (c.vis && (!b || !b.vis)) S.out.push({ spot: name, t: +(S.i / 60).toFixed(1), kind: 'c-appear', who: 'commuter ' + c.id, at: [+c.x.toFixed(1), +c.z.toFixed(1)], d: +d.toFixed(1) });
          const swapped = !c.vis && b && b.vis && (S.list || []).some(([, o]) => { if (o.userData.castId !== c.id || !o.visible) return false; const q = o.getWorldPosition(new o.position.constructor()); return Math.hypot(q.x - b.x, q.z - b.z) < 1.6; });
          if (swapped) continue;
          if (!c.vis && b && b.vis) S.out.push({ spot: name, t: +(S.i / 60).toFixed(1), kind: 'c-vanish', who: 'commuter:' + c.why + ' ' + c.id, at: [+b.x.toFixed(1), +b.z.toFixed(1)], d: +d.toFixed(1) });
        }
        S.cB = cBefore; S.cA = cAfter; S.matchC = matchC;
        if (!S.list || S.i % 120 === 0) S.list = people();
        for (const [rid, o] of S.list) {
          o.updateWorldMatrix(true, false);
          w.setFromMatrixPosition(o.matrixWorld);
          const d = Math.hypot(w.x - director.position.x, w.z - director.position.z);
          const vis = o.visible && shown(o.parent);
          const pr = S.prev.get(o.uuid);
          if (pr && d < 30) {
            const t = +(S.i / 60).toFixed(1);
            const who = `${rid}/${o.name || '?'}${o.userData.castId ? ' ' + o.userData.castId : ''}`;
            const at = [+w.x.toFixed(1), +w.z.toFixed(1)];
            const id = o.userData.castId;
            const swapIn = !pr.vis && vis && S.matchC(S.cB, id, w.x, w.z, 1.5, true) && !S.matchC(S.cA, id, w.x, w.z, 1.5, true);
            const swapOut = pr.vis && !vis && S.matchC(S.cA, id, pr.x, pr.z, 1.5, true);
            if (swapIn || swapOut) S.out.push({ spot: name, t, kind: swapIn ? 'swap-in' : 'swap-out', who, at, d: +d.toFixed(1) });
            else if (!pr.vis && vis) S.out.push({ spot: name, t, kind: 'appear', who, at, d: +d.toFixed(1) });
            else if (pr.vis && !vis) S.out.push({ spot: name, t, kind: 'vanish', who, at, d: +d.toFixed(1) });
            else if (vis && pr.vis && Math.hypot(w.x - pr.x, w.z - pr.z) > 0.6) S.out.push({ spot: name, t, kind: 'jump', who, from: [+pr.x.toFixed(1), +pr.z.toFixed(1)], at, d: +d.toFixed(1) });
          }
          S.prev.set(o.uuid, { vis, x: w.x, z: w.z });
        }
      }
    }, [name]);
  }
  const ev = await p.evaluate(() => window.__pp.out);
  all.push(...ev);
  console.log(name, ev.length);
}
fs.writeFileSync(resolve(import.meta.dirname, 'pops.json'), JSON.stringify(all, null, 1));
if (errs.length) console.log('ERR', errs.slice(0, 3));
await b.close();
