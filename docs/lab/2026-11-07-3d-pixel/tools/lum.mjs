// 按框统计明暗档：node lum.mjs '[["名字","图.png",x,y,w,h], ...]'
// 输出平均亮度和 暗(<120)/中(<170)/亮 百分比（亮度 = Rec.709 加权）。用来按物件对照参考图的明暗结构。
import { load } from './lib.mjs';
const boxes = JSON.parse(process.argv[2]);
for (const [name, file, x, y, w, h] of boxes) {
  const im = load(file);
  let n = 0, s = 0, dark = 0, mid = 0, lit = 0;
  for (let j = y; j < y + h; j++)
    for (let i = x; i < x + w; i++) {
      const k = (j * im.width + i) * 4;
      const L = 0.2126 * im.data[k] + 0.7152 * im.data[k + 1] + 0.0722 * im.data[k + 2];
      n++; s += L;
      if (L < 120) dark++; else if (L < 170) mid++; else lit++;
    }
  console.log(String(name).padEnd(16), 'mean', (s / n).toFixed(0), ' dark/mid/lit %', [dark, mid, lit].map((v) => Math.round((100 * v) / n)).join('/'));
}
