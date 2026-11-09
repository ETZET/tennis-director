// 一局从头到尾（?fast=8）：一个简单的"总监机器人"按预览派人，点掉每天的收工牌，最后截结束画面。
// SHOT_OUT=/tmp/end.png node docs/lab/2026-11-04-playability/tools/shot.mjs "http://localhost:5183/demo-staff.html?seed=3&fast=8" 2000 apps/sandbox/src/demos/staff/fullrun.mjs
export default async (page) => {
  await page.click('#startBtn');
  const t0 = Date.now();
  while (Date.now() - t0 < 90000) {
    const st = await page.evaluate(() => {
      const S = window.__staff;
      const G = S.game;
      if (S.running) {
        // 每个闲着的人：找此刻需求最高、他做得最好的空岗位
        for (const p of G.people) {
          if (p.storm > 0 || p.state === 'walk') continue;
          if (p.state === 'work' && G.demand(p.post) > 0 && p.mood > 30) continue;
          if (p.mood < 25 && p.post) {
            S.assign(p.id, null);
            continue;
          }
          let best = null,
            bv = -1;
          for (const id of Object.keys(G.posts)) {
            const q = G.posts[id];
            if (!q.active || (q.occ && q.occ !== p)) continue;
            const v = G.preview(p, id).rate * (G.demand(id) > 0 ? 1 : 0.2);
            if (v > bv) {
              bv = v;
              best = id;
            }
          }
          if (best && best !== p.post && bv > 3) S.assign(p.id, best);
        }
      }
      const day = document.getElementById('dayOv');
      const end = document.getElementById('endOv');
      return {
        day: !day.classList.contains('hidden'),
        end: !end.classList.contains('hidden'),
        t: G.t,
        d: G.day,
        m: G.money,
        rep: G.rep,
      };
    });
    if (st.end) break;
    if (st.day) await page.click('#dayBtn');
    await page.waitForTimeout(250);
  }
  const s = await page.evaluate(() => JSON.stringify(window.__staff.game.stats));
  console.log('stats', s, 'rep', await page.evaluate(() => window.__staff.game.rep));
};
