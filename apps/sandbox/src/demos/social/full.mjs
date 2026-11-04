// 自动玩一局到结束画面（?auto=1 让页面自己回评论、拍照、修沙场、点下一天）：
// SHOT_OUT=/tmp/end.png node docs/lab/2026-11-04-playability/tools/shot.mjs "http://localhost:5184/demo-social.html?fast=8&auto=1&seed=7&mute" 2000 apps/sandbox/src/demos/social/full.mjs
export default async (page) => {
  const t0 = Date.now();
  let last = '';
  for (let i = 0; i < 300; i++) {
    await page.waitForTimeout(500);
    const s = await page.evaluate(() => {
      const g = window.__social.S;
      return `${g.phase} D${g.day} t=${g.t.toFixed(0)} inbox=${g.inbox.length} $${g.money} fans=${g.fans} mode=${g.mode}`;
    });
    const k = s.split(' t=')[0];
    if (k !== last) console.log(((Date.now() - t0) / 1000).toFixed(1), s);
    last = k;
    if (s.startsWith(process.env.STOP || 'end')) break;
  }
  console.log(await page.evaluate(() => JSON.stringify(window.__social.S.stats)));
  await page.waitForTimeout(600);
};
