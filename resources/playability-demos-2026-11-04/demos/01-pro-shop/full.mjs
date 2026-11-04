// 用 ?fast=6 把一局从头玩到结束画面
export default async (page) => {
  const u = page.url(); await page.goto(u + '?fast=6&seed=' + (process.env.SEED||42)); await page.waitForTimeout(500);
  await page.click('#startBtn',{force:true});
  for (let day = 0; day < 4; day++) {
    await page.evaluate(([day, mode]) => {
      const td = window.__td; const S = td.S;
      const plan = [['water', 4], ['balls', 5], ['energy', 2], ['sunscreen', 3], ['hat', 0], ['racket', 1]];
      for (const [g, i] of plan) if (!S.slots[i]) td.stock(i, g);
      // day 2+: be greedy
      if (day >= 1) for (let i = 0; i < 6; i++) if (S.slots[i]) { const n = mode === 'greedy' ? 4 : mode === 'smart' && ['hat','sunscreen','racket'].includes(S.slots[i].goods[0]) ? 3 : 0; td.select(i); for (let k = 0; k < n; k++) td.changePrice(i, 1); }
      if (mode === 'smart') for (const s of S.slots) if (s && s.goods[0] === 'water') s.price = 2;
      if (mode === 'greedy') td.applyLim(5);
      td.openShop();
    }, [day, process.env.MODE || 'greedy']);
    for (let k = 0; k < 80; k++) {
      await page.waitForTimeout(250);
      const st = await page.evaluate(() => {
        const S = window.__td.S;
        if (S.phase === 'open' && S.min > 320) for (const [g, i] of [['water', 4], ['balls', 5]]) if (!S.slots[i]) window.__td.stock(i, g);
        return S.phase;
      });
      const btns = await page.$$('#cardOv.on .cta'); const btn = btns.length === 3 && (process.env.MODE === 'honest') ? btns[2] : btns[0]; const pap = await page.$('#paperOv.on #paperOk');
      if (pap) { await pap.click({force:true}); await page.waitForTimeout(200); continue; }
      if (st === 'modal' && btn) {
        const txt = await btn.textContent();
        await btn.click({force:true}); await page.waitForTimeout(200);
        if (/开始备货|看结果/.test(txt)) { console.log('day', day, await page.evaluate(() => JSON.stringify({ cash: window.__td.S.cash, trust: Math.round(window.__td.S.trust) }))); break; }
      }
    }
  }
  await page.waitForTimeout(1500);
  console.log(await page.evaluate(() => { const S = window.__td.S; return JSON.stringify({ phase: S.phase, cash: S.cash, trust: S.trust, tot: S.tot }); }));
};
