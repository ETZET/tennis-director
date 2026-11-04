// 正在玩的截图：点开始，改两个价格牌，滑掉/接几个电话，拖一张卡到格子上
export default async (page) => {
  const tap = async (x, y) => { await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.up(); };
  await tap(195, 640); // 开始营业（按钮大致位置，下面再用选择器兜底）
  const b = await page.$('#bstart'); if (b && await b.isVisible()) await b.click();
  await page.waitForTimeout(800);
  const drag = async (x0, y0, x1, y1) => { await page.mouse.move(x0, y0); await page.mouse.down();
    for (let i = 1; i <= 10; i++) { await page.mouse.move(x0 + (x1 - x0) * i / 10, y0 + (y1 - y0) * i / 10); await page.waitForTimeout(16); } await page.mouse.up(); };
  for (let i = 0; i < 60; i++) {
    if (await page.evaluate(() => window.__S().clock) > 16.4) break;
    await page.waitForTimeout(500);
    const call = await page.evaluate(() => { const S = window.__S(); const c = S.calls[0]; if (!c) return null; return { h: c.h }; });
    if (!call) continue;
    if (i % 3 === 2 || i > 12) {
      // 拖到对应列的第一个格子
      const r = await page.evaluate((h) => { const el = document.querySelector(`.cell[data-h="${h}"][data-c="1"]`); const q = el.getBoundingClientRect(); return [q.left + q.width / 2, q.top + q.height / 2]; }, call.h);
      if (r[0] > 45 && r[0] < 385) await drag(195, 690, r[0], r[1]); else await drag(195, 690, 330, 690);
    } else await drag(195, 690, i % 5 === 1 ? 60 : 330, 690);
  }
  // 改价：点最右边可见的价格牌
  await tap(365, 410); await page.waitForTimeout(200);
  await drag(315, 410, 315, 360);
  await page.waitForTimeout(300);
  console.log('clock', await page.evaluate(() => window.__S().clock.toFixed(2)));
};
