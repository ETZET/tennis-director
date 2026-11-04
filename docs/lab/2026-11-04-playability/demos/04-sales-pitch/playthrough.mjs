// 自动跑完一局（?fast=1），到结束画面为止。用法（仓库根目录）：
// SEED=3 SHOT_OUT=/tmp/end.png node docs/lab/2026-11-04-playability/tools/shot.mjs docs/lab/2026-11-04-playability/demos/04-sales-pitch 300 docs/lab/2026-11-04-playability/demos/04-sales-pitch/playthrough.mjs
export default async (page) => {
  const url = page.url().split('?')[0] + '?fast=1&seed=' + (process.env.SEED || 7);
  await page.goto(url);
  await page.waitForTimeout(300);
  await page.click('#startBtn');
  const click = (sel) => page.click(sel, { timeout: 1500 }).catch(() => {});
  const vis = (sel) => page.evaluate((s) => {
    const e = document.querySelector(s);
    return !!e && e.offsetParent !== null && !e.disabled && !e.closest('.hide');
  }, sel);
  for (let i = 0; i < 800; i++) {
    await page.waitForTimeout(120);
    if (await vis('#endBox #again')) { console.log('end reached after', i, 'steps'); return; }
    if (await vis('#revOk')) { await click('#revOk'); continue; }
    const st = await page.evaluate(() => window.__state());
    if (st.phase === 'leave') { if (await vis('#nextBtn')) await click('#nextBtn'); continue; }
    if (st.phase === 'pitch' && !st.lock) {
      const cards = await page.$$('#hand .card');
      if (cards.length > 1 && Math.random() < 0.8) await cards[0].click({ timeout: 1500 }).catch(() => {});
      else await click('#goHaggle');
      continue;
    }
    if (st.phase === 'haggle') {
      if (!(await vis('#offerBtn'))) {
        const k = ['year', 'month', 'coach', 'racket'][Math.floor(Math.random() * 4)];
        await click(`#prods button[data-k="${k}"]`);
        continue;
      }
      const box = await page.locator('#strack').boundingBox({ timeout: 1000 }).catch(() => null);
      if (!box) continue;
      const t = Math.random();
      await page.mouse.move(box.x + box.width * 0.38, box.y + 9);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width * t, box.y + 9, { steps: 5 });
      await page.mouse.up();
      await click('#offerBtn');
      continue;
    }
    if (st.phase === 'counter') { await click(Math.random() < 0.6 ? '#acc' : '#push'); continue; }
  }
  console.log('DID NOT FINISH');
};
