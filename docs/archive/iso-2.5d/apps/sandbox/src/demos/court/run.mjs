// 一局从头玩到结束画面（测试钩子 + 真点按钮）：1 号场精修准点、2 号场等到客人走、3 号场赶工。
// 用法：SHOT_OUT=/tmp/court-end.png node docs/lab/2026-11-04-playability/tools/shot.mjs \
//   "http://localhost:5182/demo-court.html?seed=7&fast=4" 2500 apps/sandbox/src/demos/court/run.mjs
// 环境变量 COURT_MATCH_SHOT=路径：第一场比赛中途另存一张。
const D = (page, f, ...a) => page.evaluate(([f, a]) => window.__demo[f](...a), [f, a]);
const phase = (page) => D(page, 'phase');
async function waitPhase(page, want, ms = 30000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const p = await phase(page);
    if (want.includes(p)) return p;
    await page.waitForTimeout(150);
  }
  throw new Error(`timeout waiting for ${want} (now ${await phase(page)})`);
}
const tap = async (page, sel) => {
  await page.waitForSelector(sel, { state: 'visible' });
  await page.click(sel);
};

export default async (page) => {
  await tap(page, '#go');
  for (let court = 0; court < 3; court++) {
    await waitPhase(page, ['intro']);
    await tap(page, '#go');
    await waitPhase(page, ['work']);
    if (court === 0) {
      await D(page, 'cheat', 0.97);
      await page.waitForTimeout(500);
      await page.click('#open');
    } else if (court === 1) {
      // 等客人等到没耐心，选"让他们走"，路人时间用完自动开场
      await D(page, 'cheat', 0.6);
      await waitPhase(page, ['choice'], 60000);
      await tap(page, '#o3');
    } else {
      await D(page, 'cheat', 0.3);
      await page.click('#open');
    }
    await waitPhase(page, ['match'], 60000);
    if (court === 0 && process.env.COURT_MATCH_SHOT) {
      await page.waitForTimeout(6000);
      await page.screenshot({ path: process.env.COURT_MATCH_SHOT });
    }
    await waitPhase(page, ['result'], 60000);
    await page.waitForSelector('#card #go', { state: 'visible', timeout: 30000 });
    await page.waitForTimeout(1800);
    if (court === 0 && process.env.COURT_RESULT_SHOT) await page.screenshot({ path: process.env.COURT_RESULT_SHOT });
    await tap(page, '#card #go');
  }
  await waitPhase(page, ['end']);
  await page.waitForTimeout(1500);
  const r = await D(page, 'results');
  console.log(JSON.stringify(r));
  if (process.env.COURT_END_SHOT) await page.screenshot({ path: process.env.COURT_END_SHOT });
  // 再来一局：回到第一块场的开工卡
  await tap(page, '#card #go');
  await waitPhase(page, ['intro']);
  await page.waitForTimeout(800);
};
