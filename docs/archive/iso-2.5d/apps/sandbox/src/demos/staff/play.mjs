// 交互脚本：开局，拖几个人到岗位上，最后一次拖着悬停在青训上（截"正在玩"）。
// 用法见 notes-r2.md：SHOT_OUT=... node docs/lab/.../tools/shot.mjs http://localhost:5183/demo-staff.html?seed=7 3000 apps/sandbox/src/demos/staff/play.mjs
export async function dragTo(page, id, post, { hold = false, steps = 14 } = {}) {
  const pt = await page.evaluate(
    ([id, post]) => {
      const S = window.__staff;
      const toks = [...document.querySelectorAll('.s-tok')];
      const i = S.game.people.findIndex((p) => p.id === id);
      const r = toks[i].getBoundingClientRect();
      const st = document.getElementById('stage').getBoundingClientRect();
      const at = post === 'lounge' ? { x: -24, z: -14 } : S.game.posts[post].def.spot;
      const g = S.stage.project(at.x, 0, at.z);
      return { a: { x: r.left + r.width / 2, y: r.top + 20 }, b: { x: st.left + g.x, y: st.top + g.y } };
    },
    [id, post],
  );
  await page.mouse.move(pt.a.x, pt.a.y);
  await page.mouse.down();
  for (let i = 1; i <= steps; i++) {
    const k = i / steps;
    await page.mouse.move(pt.a.x + (pt.b.x - pt.a.x) * k + Math.sin(k * 6) * 10, pt.a.y + (pt.b.y - pt.a.y) * k);
    await page.waitForTimeout(16);
  }
  await page.waitForTimeout(200);
  if (!hold) await page.mouse.up();
}
export default async (page) => {
  await page.click('#startBtn');
  await page.waitForTimeout(300);
  await dragTo(page, 'ben', 'desk');
  await dragTo(page, 'rosa', 'court');
  await dragTo(page, 'gus', 'string');
  await dragTo(page, 'jess', 'pool');
  await dragTo(page, 'dale', 'junior');
  // 跳到下午：青训开课、泳池最忙
  await page.evaluate(() => {
    window.__staff.game.t = 14.6 * 60;
  });
  await page.waitForTimeout(5200);
  // 拿起正在泳池干活的 Jess，悬停在红土上：挨着 Dale（搭档），但维护差、泳池那圈白干
  await dragTo(page, 'jess', 'clay', { hold: true });
  await page.waitForTimeout(400);
};
