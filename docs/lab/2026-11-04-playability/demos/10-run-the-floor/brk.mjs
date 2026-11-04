// 截第一轮结束的升级选择画面（?hold=1 让自动玩家不自动买）
export default async (page) => {
  await page.goto(page.url() + '?fast=6&auto=1&hold=1&seed=' + (process.env.SEED || 7));
  await page.waitForTimeout(300);
  { const r = await (await page.$('#startBtn')).boundingBox(); await page.touchscreen.tap(r.x + 50, r.y + 20); }
  for (let i = 0; i < 60; i++) { await page.waitForTimeout(500); if (await page.evaluate(() => window.__game.state) === 'break') break; }
  console.log('state', await page.evaluate(() => JSON.stringify({ s: window.__game.state, m: window.__game.money, r: window.__game.rep })));
};
