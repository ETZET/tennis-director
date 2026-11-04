// 整局冒烟测试：?fast=3 跑完三天到结束画面。用法同 play.mjs（SHOT_OUT=.../shot-end.png）
const C = (i) => ({ x: 41 + 76 * i, y: 768 });
const P = { desk: [90, 176], court: [300, 176], string: [90, 314], junior: [300, 314], club: [90, 452], pool: [300, 452], lounge: [195, 560] };
async function drag(page, from, to) {
  await page.mouse.move(from.x, from.y); await page.mouse.down();
  for (let i = 1; i <= 8; i++) { await page.mouse.move(from.x + (to[0] - from.x) * i / 8, from.y + (to[1] - from.y) * i / 8); await page.waitForTimeout(15); }
  await page.mouse.up();
}
const tap = async (page, sel) => { const b = await page.$(sel); const bb = await b.boundingBox(); await page.mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2); };
export default async (page) => {
  await page.goto(page.url().split('?')[0] + '?fast=3&seed=11'); await page.waitForTimeout(500);
  await tap(page, '#startBtn');
  for (let d = 1; d <= 3; d++) {
    await drag(page, C(2), P.desk); await drag(page, C(1), P.court); await drag(page, C(4), P.string); await drag(page, C(0), P.club); await drag(page, C(3), P.pool);
    if (d === 2) await tap(page, '#mode');
    await page.waitForTimeout(6000);
    await drag(page, C(0), P.junior); await drag(page, C(4), P.club); await drag(page, C(3), P.string);
    for (let i = 0; i < 120; i++) { if (await page.$eval('#dayOv', (e) => e.classList.contains('on'))) break; await page.waitForTimeout(250); }
    console.log('day', d, await page.$eval('#dayPanel', (e) => e.innerText.replace(/\n+/g, ' | ')));
    await tap(page, '#dayBtn'); await page.waitForTimeout(300);
  }
  console.log('end', await page.$eval('#endPanel', (e) => e.innerText.replace(/\n+/g, ' | ')));
};
