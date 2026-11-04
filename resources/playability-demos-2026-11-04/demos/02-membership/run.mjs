// 全自动跑一局：?fast=1&auto=1，等到结束画面
export default async (page) => {
  const logs = [];
  page.on('console', (m) => { if (m.text().startsWith('RESULT')) logs.push(m.text()); });
  await page.goto(page.url().split('?')[0] + '?fast=1&auto=' + (process.env.AUTO || '1') + '&seed=' + (process.env.SEED || 42));
  await page.waitForSelector('.endtitle', { timeout: 150000 });
  await page.waitForTimeout(800);
  console.log(logs.join('\n'));
};
