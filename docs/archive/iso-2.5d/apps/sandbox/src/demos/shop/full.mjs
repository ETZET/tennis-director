// 从头玩到结束画面（用 ?fast=8 加速）：每天备货、开门，遇到卡就按 PICK（默认 0,1,2 轮流）选，直到「再来一局」。
// 用法：SHOT_OUT=/tmp/shop-end.png node docs/lab/2026-11-04-playability/tools/shot.mjs "http://localhost:5181/demo-shop.html?fast=8&seed=3&mute" 2000 apps/sandbox/src/demos/shop/full.mjs
export default async (page) => {
  const log = [];
  await page.click('#card .opt'); // 开张
  let pickN = 0;
  for (let step = 0; step < 900; step++) {
    const st = await page.evaluate(() => {
      const s = window.__shop.S;
      const modal = !document.getElementById('modal').hidden;
      const paper = !document.getElementById('paper').hidden;
      const title = document.querySelector('#card .k-title')?.textContent ?? '';
      const opts = [...document.querySelectorAll('#card .opt')].map((b) => ({ t: b.textContent, d: b.disabled }));
      return { phase: s.phase, day: s.day, min: s.min, cash: s.cash, trust: s.trust, modal, paper, title, opts };
    });
    if (st.paper) {
      log.push(`D${st.day + 1} 上报纸`);
      await page.click('#paperOk');
      continue;
    }
    if (st.phase === 'end') {
      log.push(`END ${st.title} cash=${st.cash} trust=${st.trust.toFixed(0)}`);
      break;
    }
    if (st.modal) {
      const ok = st.opts.map((o, i) => (o.d ? -1 : i)).filter((i) => i >= 0);
      const i = ok[pickN++ % ok.length];
      log.push(`D${st.day + 1} ${Math.round(st.min)} 卡「${st.title}」→ ${st.opts[i].t.slice(0, 12)}`);
      await page.evaluate((k) => window.__shop.pickOpt(k), i);
      await page.waitForTimeout(100);
      continue;
    }
    if (st.phase === 'prep') {
      // 备货：门口放水和球，冰柜放能量饮料，中岛帽子，里角防晒/球拍
      await page.evaluate(() => {
        const h = window.__shop;
        const plan = [
          ['water', 0],
          ['balls', 1],
          ['energy', 3],
          ['hat', 2],
          ['sunscreen', 4],
          ['racket', 5],
          ['grip', 5],
        ];
        for (const [g, i] of plan) h.drop(g, i);
        // 门口的水涨一点价（?bot=gouge：全部大涨价）
        const gouge = new URLSearchParams(location.search).get('bot') === 'gouge';
        for (const i of gouge ? [0, 1, 2, 3, 4, 5] : [0]) {
          h.select(i);
          h.price(1, gouge ? 10 : 2);
        }
        h.select(-1);
      });
      await page.evaluate(() => window.__shop.open());
      log.push(`D${st.day + 1} 开门 cash=${st.cash}`);
      continue;
    }
    // 下午补货
    if (st.phase === 'open' && step % 25 === 0)
      await page.evaluate(() => {
        const h = window.__shop;
        for (const [g, i] of [
          ['water', 0],
          ['balls', 1],
          ['energy', 3],
        ])
          h.drop(g, i);
      });
    await page.waitForTimeout(200);
  }
  console.log(log.join('\n'));
};
