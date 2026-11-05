// 截图脚本："正在玩"的一张：开工 → 扫开西半场的沙 → 压几下 → 选画线车描北边的边线，手指按着不放时截图。
// 用法：SHOT_OUT=apps/sandbox/public/shots/court-2.png node docs/lab/2026-11-04-playability/tools/shot.mjs \
//   "http://localhost:5182/demo-court.html?seed=7&fast=5" 3000 apps/sandbox/src/demos/court/play.mjs
const scr = (page, u, v) => page.evaluate(([a, b]) => window.__demo.screen(a, b), [u, v]);

async function drag(page, pts, steps = 8, dy = 0) {
  let p = await scr(page, pts[0][0], pts[0][1]);
  await page.mouse.move(p.x, p.y + dy);
  await page.mouse.down();
  for (const [u, v] of pts.slice(1)) {
    p = await scr(page, u, v);
    await page.mouse.move(p.x, p.y + dy, { steps });
  }
  await page.mouse.up();
}

export default async (page) => {
  await page.click('#go');
  await page.waitForTimeout(400);
  await page.click('#go');
  await page.waitForTimeout(500);
  // 扫把：西半场从中间往西推，一行一行搭着扫
  for (let k = 0; k < 9; k++) {
    const v = -7.4 + k * 1.8;
    await drag(
      page,
      [
        [-1, v],
        [-17, v],
      ],
      16,
    );
  }
  // 压路滚：来回压几道
  await page.click('.tool[data-t="roller"]');
  for (let k = 0; k < 4; k++)
    await drag(
      page,
      [
        [-14, -6 + k * 2.5],
        [-2, -6 + k * 2.5],
        [-14, -5 + k * 2.5],
      ],
      10,
    );
  // 画线车：描北边的双打边线，按着不放（笔尖在手指上方 46 像素）
  await page.click('.tool[data-t="paint"]');
  await page.waitForTimeout(200);
  const pen = 46;
  let p = await scr(page, -11.6, -5.485);
  await page.mouse.move(p.x, p.y + pen);
  await page.mouse.down();
  for (let u = -11.6; u <= -4; u += 0.8) {
    p = await scr(page, u, -5.485 + Math.sin(u * 1.3) * 0.5);
    await page.mouse.move(p.x, p.y + pen, { steps: 3 });
  }
  await page.waitForTimeout(250);
};
