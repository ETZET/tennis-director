// 正在玩的截图：开张 → 真拖几样货上架（手指拖动）→ 点价签、按 + 改价 → 开门 → 等客人进来
// 用法：SHOT_OUT=apps/sandbox/public/shots/shop-2.png node docs/lab/2026-11-04-playability/tools/shot.mjs http://localhost:5181/demo-shop.html?seed=7 3000 apps/sandbox/src/demos/shop/shot-play.mjs
const GHOST_UP = 64;
async function center(page, sel, n = 0) {
  return page.evaluate(
    ([s, k]) => {
      const r = document.querySelectorAll(s)[k].getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    },
    [sel, n],
  );
}
async function dragGood(page, card, slot) {
  const a = await center(page, '#tray .card', card);
  const t = await page.evaluate((i) => window.__shop.slotAt(i), slot);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  const bx = t.x;
  const by = t.y + GHOST_UP;
  for (let i = 1; i <= 14; i++) await page.mouse.move(a.x + ((bx - a.x) * i) / 14, a.y + ((by - a.y) * i) / 14);
  await page.waitForTimeout(80);
  await page.mouse.up();
  await page.waitForTimeout(260);
}
export default async (page) => {
  await page.click('#card .opt');
  await page.waitForTimeout(300);
  await dragGood(page, 0, 0); // 水 → 门口
  await dragGood(page, 1, 1); // 球 → 门口
  await dragGood(page, 2, 3); // 能量饮料 → 冰柜
  await dragGood(page, 4, 2); // 帽子 → 中岛
  await dragGood(page, 3, 4); // 防晒 → 里角
  await page.click('#openBtn');
  await page.waitForTimeout(Number(process.env.PLAY_MS || 9000));
  // 点门口的水价签，涨价
  const tg = await page.evaluate(() => window.__shop.tagAt(0));
  await page.mouse.click(tg.x, tg.y - 20);
  await page.waitForTimeout(150);
  for (let i = 0; i < 4; i++) {
    await page.click('#plus');
    await page.waitForTimeout(60);
  }
  await page.waitForTimeout(700);
};
