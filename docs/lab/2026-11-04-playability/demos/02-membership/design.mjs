export default async (page) => {
  const tap = async (sel, dx = 0) => { const b = await page.locator(sel).first().boundingBox(); await page.touchscreen.tap(b.x + b.width / 2 + dx, b.y + b.height / 2); await page.waitForTimeout(120); };
  await tap('#start'); await tap('.card.empty'); await tap('#card1 [data-k=fine]'); await tap('#card1 [data-k=fine]');
  await page.waitForTimeout(300);
};
