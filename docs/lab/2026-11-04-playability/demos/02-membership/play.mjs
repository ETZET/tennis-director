// 正在玩的截图：开始 → 调卡 → 开门迎客 → 第 1 周傍晚
export default async (page) => {
  const tap = async (sel, dx = 0) => { const b = await page.locator(sel).first().boundingBox(); await page.touchscreen.tap(b.x + b.width / 2 + dx, b.y + b.height / 2); await page.waitForTimeout(150); };
  await tap('#start');
  await tap('#card0 [data-k=fee]', 30); await tap('#card0 [data-k=fee]', 30);
  await tap('.card.empty');
  await tap('#card1 [data-k=fine]'); await tap('#card1 [data-k=fine]');
  await tap('#go');
  await page.waitForSelector('#wk1', { timeout: 60000 });
  await tap('#wk1');
  await page.waitForTimeout(15800);
};
