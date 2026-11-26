// 留白诊断图：node calmmap.mjs in.png out.png 每纹素像素数
// 降到纹素分辨率（取每格左上像素），画面压暗成灰底；不平静的纹素（和右边或下边 RGB 差和 ≥ 24，同 hues.mjs）标黄，
// 强边缘（和右边亮度差 > 60，同 stats.mjs）标红。输出按纹素放大回原尺寸。最后打印 9 宫格各自的平静 % 和强边缘 ‰，找"哪一块最忙"。
import { load, PNG, save } from './lib.mjs';

const [inp, out, pxs = '1'] = process.argv.slice(2);
const px = +pxs;
const im = load(inp);
const w = Math.floor(im.width / px);
const h = Math.floor(im.height / px);
const at = (x, y) => {
  const i = (y * px * im.width + x * px) * 4;
  return [im.data[i], im.data[i + 1], im.data[i + 2]];
};
const L = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
const o = new PNG({ width: w * px, height: h * px });
const grid = Array.from({ length: 9 }, () => ({ n: 0, calm: 0, big: 0 }));
for (let y = 0; y < h; y++)
  for (let x = 0; x < w; x++) {
    const c = at(x, y);
    let col = c.map((v) => v * 0.35 + 60);
    const g = grid[Math.min(2, Math.floor((3 * y) / h)) * 3 + Math.min(2, Math.floor((3 * x) / w))];
    if (x + 1 < w && y + 1 < h) {
      const r = at(x + 1, y);
      const d = at(x, y + 1);
      const dr = Math.abs(c[0] - r[0]) + Math.abs(c[1] - r[1]) + Math.abs(c[2] - r[2]);
      const dd = Math.abs(c[0] - d[0]) + Math.abs(c[1] - d[1]) + Math.abs(c[2] - d[2]);
      g.n++;
      if (dr < 24 && dd < 24) g.calm++;
      else col = [230, 200, 60];
      if (Math.abs(L(c) - L(r)) > 60) {
        g.big++;
        col = [255, 40, 40];
      }
    }
    for (let j = 0; j < px; j++)
      for (let i = 0; i < px; i++) {
        const k = ((y * px + j) * w * px + x * px + i) * 4;
        o.data[k] = col[0];
        o.data[k + 1] = col[1];
        o.data[k + 2] = col[2];
        o.data[k + 3] = 255;
      }
  }
save(out, o);
const row = (r) =>
  grid
    .slice(r * 3, r * 3 + 3)
    .map((g) => `${Math.round((100 * g.calm) / g.n)}% ${Math.round((1000 * g.big) / g.n)}‰`.padEnd(11))
    .join(' | ');
console.log(`${out}\n  ${row(0)}\n  ${row(1)}\n  ${row(2)}`);
