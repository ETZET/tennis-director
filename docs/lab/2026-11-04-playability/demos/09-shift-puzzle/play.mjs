// 正在玩的截图：开始 → 拖几张卡进格子（有搭档连击）→ 停在一次拖动中
async function drag(page, sel, x, y, release = true) {
  const b = await page.locator(sel).boundingBox();
  await page.mouse.move(b.x + 20, b.y + 20);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(b.x + 20 + (x - b.x - 20) * i / 8, b.y + 20 + (y + 54 - b.y - 20) * i / 8);
  if (release) { await page.mouse.up(); await page.waitForTimeout(250); }
}
export default async (page) => {
  const b = await page.locator('#startBtn').boundingBox();
  await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
  await page.waitForTimeout(400);
  const g = await page.locator('#grid').boundingBox();
  const cell = (r, c, len) => [g.x + 54 + (c + len / 2) * 81, g.y + r * 46 + 23];
  await drag(page, '.card[data-id=ben]', ...cell(0, 0, 3));
  await drag(page, '.card[data-id=rosa]', ...cell(5, 0, 2));
  await drag(page, '.card[data-id=dale]', ...cell(2, 1, 3));
  await drag(page, '.card[data-id=jess]', ...cell(1, 2, 2));
  await page.waitForTimeout(300);
  await drag(page, '.card[data-id=dir]', ...cell(4, 2, 1), false);
  await page.waitForTimeout(200);
};
