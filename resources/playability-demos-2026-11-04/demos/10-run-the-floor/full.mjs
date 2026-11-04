// 整局自动跑：?fast=6&auto=1，自动玩家打完三轮，截结束画面
export default async (page) => {
  await page.goto(page.url() + '?fast=6&auto=1&seed=42');
  await page.waitForTimeout(300);
  { const r = await (await page.$('#startBtn')).boundingBox(); await page.touchscreen.tap(r.x + 50, r.y + 20); }
  for (let i = 0; i < 120; i++) {
    await page.waitForTimeout(500);
    const s = await page.evaluate(() => window.__game.state);
    if (s === 'end') break;
  }
  console.log('final', await page.evaluate(() => JSON.stringify({ s: window.__game.state, m: window.__game.money, r: window.__game.rep })));
};
