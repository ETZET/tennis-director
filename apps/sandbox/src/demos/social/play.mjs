// "正在玩"的截图：开工 → 等收件箱排上两张卡 → 把最前面的卡拖到"回复"上松手（弹出四张语气贴纸）。
// SHOT_OUT=apps/sandbox/public/shots/social-2.png node docs/lab/2026-11-04-playability/tools/shot.mjs "http://localhost:5184/demo-social.html?seed=3&fast=2" 2500 apps/sandbox/src/demos/social/play.mjs
export default async (page) => {
  await page.mouse.click(195, 790);
  for (let i = 0; i < 80; i++) {
    await page.waitForTimeout(250);
    if (await page.evaluate(() => window.__social.S.inbox.length >= 2 && !!document.querySelector('.card'))) break;
  }
  await page.waitForTimeout(500);
  const x0 = 195;
  const y0 = 560;
  const x1 = 72;
  const y1 = 757;
  await page.mouse.move(x0, y0);
  await page.mouse.down();
  for (let i = 1; i <= 14; i++) {
    await page.mouse.move(x0 + ((x1 - x0) * i) / 14, y0 + ((y1 - y0) * i) / 14);
    await page.waitForTimeout(16);
  }
  await page.waitForTimeout(150);
  await page.mouse.up();
  await page.waitForTimeout(500);
};
