// 正在玩的截图：开门、等客人进门、出一张话术卡。
// SHOT_OUT=<dir>/shot-2.png node docs/lab/2026-11-04-playability/tools/shot.mjs <dir> 1500 <dir>/play.mjs
export default async (page) => {
  const url = page.url().split('?')[0] + '?seed=' + (process.env.SEED || 1);
  await page.goto(url);
  await page.waitForTimeout(500);
  await page.tap('#startBtn');
  await page.waitForFunction(() => window.__state().phase === 'pitch', null, { timeout: 15000 });
  await page.waitForTimeout(600);
  const cards = await page.$$('#hand .card');
  await cards[Number(process.env.CARD || 0)].tap();
  await page.waitForTimeout(Number(process.env.WAIT || 700));
};
