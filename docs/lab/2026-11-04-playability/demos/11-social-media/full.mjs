// 整局测试：?fast=8，随机操作直到结束画面
export default async (page) => {
  await page.goto(page.url().split('?')[0] + '?fast=8&seed=99');
  await page.waitForTimeout(500);
  await page.click('#startBtn');
  const acts = ['sorry', 'explain', 'sass', 'cute', 'gift', 'report', 'ignore'];
  for (let i = 0; i < 400; i++) {
    const st = await page.evaluate(() => { const S = window.__td.S; return { phase: S.phase, q: S.queue.length && S.queue[0].state, posted: S.posted, mode: S.mode, day: S.day }; });
    if (st.phase === 'end') break;
    if (st.q === 'live' && st.mode === 'cards') await page.evaluate((a) => window.__td.resolve(a), acts[i % acts.length]);
    if (!st.posted && st.mode === 'cards' && i % 5 === 0) await page.evaluate(() => window.__td.snap());
    if (i === 30) await page.mouse.click(324, 394); // 水军
    await page.waitForTimeout(100);
  }
  const s = await page.evaluate(() => ({ phase: window.__td.S.phase, title: document.getElementById('endTitle').textContent, line: document.getElementById('endStats').textContent }));
  console.log(JSON.stringify(s));
};
