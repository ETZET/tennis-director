// 交互截图：接受挑战 → 选 Dale 指导 → 抛球到顶时上滑发球 → 打几拍 → 来球进圈时按住上滑（显示瞄准线和缩小的圈），截图
export default async (page) => {
  await page.click('#go');
  await page.waitForTimeout(400);
  await page.click('.opt[data-k="dale"]');
  const swipeUp = async (x0, y0, dx, dy, release) => {
    await page.mouse.move(x0, y0); await page.mouse.down();
    for (let i = 1; i <= 5; i++) { await page.mouse.move(x0 + dx * i / 5, y0 + dy * i / 5); await page.waitForTimeout(8); }
    if (release) await page.mouse.up();
  };
  let returns = 0;
  for (let guard = 0; guard < 40; guard++) {
    const s = await page.waitForFunction(() => (G.sub === 'toss' && G.t - G.tossT0 > 0.5) ? 'toss'
      : (G.plan && G.plan.who === 'me' && !G.plan.swung && G.plan.t - G.t < 0.35 && G.plan.t - G.t > 0.1) ? 'ret' : false, null, { timeout: 30000, polling: 'raf' });
    const kind = await s.jsonValue();
    if (kind === 'toss') { await swipeUp(200, 700, 10, -170, true); continue; }
    if (returns >= 2) { await swipeUp(190, 720, -24, -170, false); return; }
    returns++; await swipeUp(190, 720, -20, -175, true);
  }
};
