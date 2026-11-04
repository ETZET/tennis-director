// 交互截图：开始 → 拖第一张卡到"回复" → 选"道歉+券" → 等下一张 → 右滑打开语气
export default async (page) => {
  await page.click('#startBtn');
  await page.waitForTimeout(3500);
  const drag = async (x0, y0, x1, y1) => {
    await page.mouse.move(x0, y0); await page.mouse.down();
    for (let i = 1; i <= 8; i++) { await page.mouse.move(x0 + (x1 - x0) * i / 8, y0 + (y1 - y0) * i / 8); await page.waitForTimeout(30); }
    await page.mouse.up();
  };
  await drag(195, 520, 78, 690);      // card → 回复
  await page.waitForTimeout(300);
  await page.mouse.click(78, 690);    // 道歉+券
  await page.waitForTimeout(700);
};
