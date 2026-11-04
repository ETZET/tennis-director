// 自动玩完整一局（?fast=1&auto=1），确认能到结束画面
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
export default async (page) => {
  for (const seed of [11, 42, 2026]) {
    await page.goto(pathToFileURL(resolve('docs/lab/2026-11-04-playability/demos/09-shift-puzzle/index.html')).href + `?fast=1&auto=1&seed=${seed}`);
    await page.waitForFunction(() => window.__G && window.__G().phase === 'end', null, { timeout: 60000 });
    const r = await page.evaluate(() => { const G = window.__G(); return { money: G.money, stars: G.stars, st: G.st, title: document.querySelector('#modal h2').textContent }; });
    console.log(seed, JSON.stringify(r));
  }
};
