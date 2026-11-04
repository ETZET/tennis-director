// 正在玩的截图：开始 → 开工 → 扫几下 → 压一下 → 描一段线
const tap = async (page, sel) => { const b = await page.locator(sel).boundingBox(); await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2); await page.waitForTimeout(250); };
const drag = async (page, pts, steps = 12) => {
  await page.mouse.move(pts[0][0], pts[0][1]); await page.mouse.down();
  for (let k = 1; k < pts.length; k++) await page.mouse.move(pts[k][0], pts[k][1], { steps });
  await page.mouse.up(); await page.waitForTimeout(60);
};
export default async (page) => {
  await tap(page, '#goBtn');
  await tap(page, '#goBtn');
  // 扫把：从中间往左右两边推
  for (let y = 120; y < 330; y += 18) await drag(page, [[200, y], [40, y]], 14);
  for (let y = 130; y < 330; y += 18) await drag(page, [[190, y], [360, y]], 14);
  // 压路机
  await tap(page, '.tool[data-t="roller"]');
  for (let y = 150; y < 320; y += 14) await drag(page, [[100, y], [300, y]], 16);
  // 画线车：左边双打线（逻辑 x=59 → css 118，画点在手指上方 15 逻辑 = 30 css）
  await tap(page, '.tool[data-t="paint"]');
  await page.mouse.move(118, 138 + 30); await page.mouse.down();
  for (let y = 140; y <= 300; y += 3) await page.mouse.move(118 + Math.sin(y / 9) * 3, y + 30);
  await page.mouse.move(119, 330, { steps: 4 });
  await page.waitForTimeout(400);
};
