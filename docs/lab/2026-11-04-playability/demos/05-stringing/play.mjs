// 交互截图：开门、接第一位客人、穿 6 根竖线 + 1 根横线，第二根横线拖到一半时截图
export async function stringOne(page, opts = {}) {
  const g = await page.evaluate(() => window.__td.path());
  if (!g) return false;
  const pts = g.pts;
  await page.mouse.move(pts[0].x, pts[0].y);
  await page.mouse.down();
  const stop = opts.stopAt ?? 1;
  const n = Math.max(2, Math.floor(pts.length * stop));
  for (let i = 1; i < n; i++) {
    await page.mouse.move(pts[i].x, pts[i].y, { steps: 3 });
  }
  if (stop < 1) return true; // 停在半路，按着不放
  // 按住拉紧，等指针进绿区
  const off = opts.miss ?? 0;
  for (let k = 0; k < 200; k++) {
    const nd = await page.evaluate(() => window.__td.needle());
    if (nd == null) break;
    if (nd >= g.req + off - g.tol * 0.4) break;
    await page.waitForTimeout(15);
  }
  await page.mouse.up();
  await page.waitForTimeout(60);
  return true;
}
export async function takeNext(page, premium = false) {
  const p = await page.evaluate(() => window.__td.slotOf());
  if (!p) return false;
  await page.mouse.click(p.x, p.y);
  await page.waitForTimeout(150);
  const open = await page.evaluate(() => !document.getElementById('sheet').classList.contains('hide'));
  if (!open) return false;
  await page.click(premium ? '#optPrem' : '#optNormal');
  await page.waitForTimeout(450);
  return true;
}
export default async (page) => {
  await page.click('#startBtn');
  await page.waitForTimeout(3200);
  await takeNext(page, false);
  for (let i = 0; i < 7; i++) await stringOne(page, { miss: 0 });
  await page.waitForTimeout(300);
  await stringOne(page, { stopAt: 0.55 });
  await page.waitForTimeout(120);
};
