// 整局自动跑（?fast=1）：一直接客、穿线，直到结束画面出来
import { stringOne, takeNext } from './play.mjs';
export default async (page) => {
  await page.goto(page.url().split('?')[0] + '?fast=2&seed=4242');
  await page.waitForTimeout(500);
  await page.click('#startBtn');
  let rackets = 0;
  for (let loop = 0; loop < 400; loop++) {
    const ended = await page.evaluate(() => !document.getElementById('endOv').classList.contains('hide'));
    if (ended) break;
    const hasJob = await page.evaluate(() => !!window.__td.S.job);
    if (!hasJob) {
      if (await page.evaluate(() => !!window.__td.S.fly)) { await page.waitForTimeout(200); continue; }
      const ok = await takeNext(page, rackets % 3 === 1);
      if (!ok) { await page.waitForTimeout(300); continue; }
      rackets++;
      if (rackets === 3) await page.click('#rushBtn');
      if (rackets === 5) await page.click('#rushBtn');
    }
    const ph = await page.evaluate(() => window.__td.phase());
    if (process.env.DBG && loop % 10 === 0) console.log(loop, ph, JSON.stringify(await page.evaluate(() => { const j = window.__td.S.job; return j && { cur: j.cur, base: j.base, rush: window.__td.S.rush, prog: j.strings[j.cur] && j.strings[j.cur].prog }; })));
    if (ph === 'drag') await stringOne(page, { miss: loop % 17 === 5 ? 14 : 0 });
    else if (ph === 'tension') { await page.click('#holdBtn'); }
    await page.waitForTimeout(20);
  }
  await page.waitForTimeout(1500);
  const s = await page.evaluate(() => { const S = window.__td.S; return { done: S.done, perfect: S.perfect, money: S.money, rep: S.rep, snaps: S.snaps, weaves: S.weaves, ended: S.ended }; });
  console.log('fullrun', rackets, JSON.stringify(s));
};
