const C = (i) => ({ x: 41 + 76 * i, y: 768 });
const P = { desk: [90, 176], court: [300, 176], string: [90, 314], junior: [300, 314], club: [90, 452], pool: [300, 452] };
async function drag(page, from, to, hold = false) {
  await page.mouse.move(from.x, from.y); await page.mouse.down();
  const steps = 14;
  for (let i = 1; i <= steps; i++) { await page.mouse.move(from.x + (to[0] - from.x) * i / steps, from.y + (to[1] - from.y) * i / steps); await page.waitForTimeout(25); }
  if (!hold) { await page.waitForTimeout(120); await page.mouse.up(); }
}
export default async (page) => {
  const b = await page.$('#startBtn'); const bb = await b.boundingBox();
  await page.mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2);
  await page.waitForTimeout(300);
  await drag(page, C(2), P.desk);   // Ben
  await drag(page, C(1), P.court);  // Rosa
  await drag(page, C(4), P.string); // Gus
  await page.waitForTimeout(5200);
  await drag(page, C(0), P.club);   // Dale
  await page.waitForTimeout(2500);
  await drag(page, C(3), [P.string[0] + 8, P.string[1] + 6], true); // Jess hovering over string (hates it)
  await page.waitForTimeout(500);
};
