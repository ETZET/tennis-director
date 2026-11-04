// 整局测试：用 ?fast=8&auto=1 重开，机器人玩完三天，点"下一天"直到结束画面
export default async (page) => {
  await page.goto(page.url().split('?')[0] + '?fast=8&auto=1&seed=444');
  for (let i = 0; i < 400; i++) {
    await page.waitForTimeout(250);
    const st = await page.evaluate(() => window.__S().phase);
    if (st === 'summary') { await page.click('#bnext'); }
    if (st === 'end') break;
  }
  const s = await page.evaluate(() => { const S = window.__S(); return { phase: S.phase, money: S.money, bad: S.bad, mem: S.mem, tot: S.tot }; });
  console.log(JSON.stringify(s));
};
