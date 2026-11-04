// 整局跑通：?fast=1，三块场地分别走"精修准点 / 放走客人 / 赶工"三条路，停在结束画面
const tap = async (page, sel) => { await page.waitForSelector(sel, { state: 'visible', timeout: 30000 }); const b = await page.locator(sel).boundingBox(); await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2); await page.waitForTimeout(300); };
const waitPhase = (page, ph) => page.waitForFunction((p) => window.__demo.phase() === p, ph, { timeout: 60000 });
export default async (page) => {
  await page.goto(page.url().split('?')[0] + '?fast=1&seed=7'); await page.waitForTimeout(800);
  await tap(page, '#goBtn'); await tap(page, '#goBtn');
  // 1：真的扫几下、挂网（拉到 72%），然后作弊补齐，准点开场
  for (let y = 120; y < 500; y += 60) { await page.mouse.move(200, y); await page.mouse.down(); await page.mouse.move(30, y, { steps: 10 }); await page.mouse.up(); }
  await tap(page, '.tool[data-t="net"]');
  await page.mouse.move(200, 500); await page.mouse.down(); await page.mouse.move(200, 500 - 0.72 * 150, { steps: 15 }); await page.mouse.up();
  await page.evaluate(() => window.__demo.cheat(0.97));
  await page.waitForTimeout(600);
  await tap(page, '#openBtn');
  await waitPhase(page, 'result'); console.log('court1', JSON.stringify(await page.evaluate(() => window.__demo.measure())));
  await page.waitForTimeout(1600); await tap(page, '#goBtn');
  // 2：什么都不做，等客人发火 → 让他们走 → 路人
  await tap(page, '#goBtn');
  await page.evaluate(() => window.__demo.cheat(0.6));
  await waitPhase(page, 'choice'); await tap(page, '#o3');
  await waitPhase(page, 'result'); console.log('court2 done');
  await page.waitForTimeout(1600); await tap(page, '#goBtn');
  // 3：赶工，马上开
  await tap(page, '#goBtn');
  await page.evaluate(() => window.__demo.cheat(0.4));
  await page.waitForTimeout(300); await tap(page, '#openBtn');
  await waitPhase(page, 'result'); await page.waitForTimeout(1600); await tap(page, '#goBtn');
  await waitPhase(page, 'end'); console.log(JSON.stringify(await page.evaluate(() => window.__demo.results()))); await page.waitForTimeout(500);
};
