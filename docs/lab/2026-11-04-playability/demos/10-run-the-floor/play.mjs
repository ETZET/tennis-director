// 交互截图：开始 → 拿球 → 点要球的场地 → 让 Dale 去扫沙/修网 → 等几秒
export default async (page) => {
  const tap = async (x, y) => { await page.touchscreen.tap(x, y); await page.waitForTimeout(120); };
  { const b = await page.$('#startBtn'); const r = await b.boundingBox(); await tap(r.x + r.width / 2, r.y + r.height / 2); } // 开门营业
  await page.waitForTimeout(900);
  // 逻辑坐标 ×2 = 屏幕坐标
  await tap(22 * 2, 187 * 2);          // 球筐
  const t = await page.evaluate(() => 0);
  // 找要球的场地气泡
  const bubs = await page.$$eval('.bub', els => els.map(e => ({ x: parseFloat(e.style.left), y: parseFloat(e.style.top), tag: e.querySelector('.tag').textContent })));
  const ball = bubs.find(b => b.tag === '要球');
  if (ball) await tap(ball.x, ball.y - 18);
  const other = bubs.find(b => b.tag !== '要球');
  if (other) { await tap(260, 800); await tap(other.x, other.y - 18); }
  await page.waitForTimeout(2600);
  const bubs2 = await page.$$eval('.bub', els => els.map(e => ({ x: parseFloat(e.style.left), y: parseFloat(e.style.top), tag: e.querySelector('.tag').textContent })));
  for (const b of bubs2.slice(0, 2)) await tap(b.x, b.y - 18);
  await page.waitForTimeout(1500);
};
