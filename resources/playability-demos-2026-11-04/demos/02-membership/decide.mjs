export default async (page) => {
  await page.goto(page.url().split('?')[0] + '?fast=1&seed=7');
  const tap = async (sel) => { const b = await page.locator(sel).first().boundingBox(); await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2); await page.waitForTimeout(150); };
  await tap('#start'); await tap('#card0 [data-k=fee]'); await tap('#go');
  await page.waitForSelector('#wk1', { timeout: 60000 }); await tap('#wk1');
  await page.waitForSelector('#edit', { timeout: 60000 }); await page.waitForTimeout(600);
};
