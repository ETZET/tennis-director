// 正在玩的截图：开张、上货、改价、开门，等一会儿
async function dragTo(page, x0, y0, x1, y1) {
  await page.mouse.move(x0, y0); await page.mouse.down();
  for (let i = 1; i <= 12; i++) await page.mouse.move(x0 + (x1 - x0) * i / 12, y0 + (y1 - y0) * i / 12);
  await page.mouse.up(); await page.waitForTimeout(150);
}
const card = (i) => 8 + 7 + (i + 0.5) * (370 / 7);
export default async (page) => {
  await page.mouse.click(195, 600); // 开张 (start button somewhere center) fallback
  const b = await page.$('#startBtn'); if (b && await b.isVisible()) await b.click({force:true});
  await page.waitForTimeout(300);
  const ty = 770;
  await dragTo(page, card(0), ty, 118, 430);   // water → door-left
  await dragTo(page, card(1), ty, 272, 430);   // balls → door-right
  await dragTo(page, card(3), ty, 300, 270);   // sunscreen → mid-right
  await dragTo(page, card(2), ty, 46, 270);    // energy → mid-left
  await dragTo(page, card(4), ty, 46, 148);    // hat → back-left
  // overprice water: select door-left tag and press + a lot
  await page.mouse.click(118, 446);
  for (let i = 0; i < 5; i++) { await page.mouse.click(339, 590); await page.waitForTimeout(40); }
  await page.click('#openBtn',{force:true});
  await page.waitForTimeout(11200);
};
