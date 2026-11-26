// 冷暖分布图：node huemap.mjs in.png out.png
// 每个像素按 hues.mjs 的同一套规则归家族，涂成一个代表色：暖（红 橙 黄 粉红）= 橙、冷（青绿 青 蓝 靛 紫）= 蓝、
// 灰 / 中性 = 灰、黄绿 / 绿 = 绿、品红 = 品红；原图的亮度留一半，看得出是哪块东西。用来找"哪块东西让整屏偏暖"。
import { load, save } from './lib.mjs';

const [src, out] = process.argv.slice(2);
const p = load(src);
const FAM = {
  warm: [235, 120, 40],
  cool: [50, 110, 230],
  grey: [140, 140, 140],
  green: [70, 190, 70],
  mag: [210, 60, 200],
};
for (let i = 0; i < p.data.length; i += 4) {
  const R = p.data[i] / 255;
  const G = p.data[i + 1] / 255;
  const B = p.data[i + 2] / 255;
  const mx = Math.max(R, G, B);
  const mn = Math.min(R, G, B);
  const s = mx ? (mx - mn) / mx : 0;
  let f = 'grey';
  if (!(s < 0.18 || mx < 0.12)) {
    const d = mx - mn;
    let h;
    if (mx === R) h = ((G - B) / d + 6) % 6;
    else if (mx === G) h = (B - R) / d + 2;
    else h = (R - G) / d + 4;
    const k = Math.floor(h * 2) % 12;
    f = [0, 1, 2, 11].includes(k) ? 'warm' : [5, 6, 7, 8, 9].includes(k) ? 'cool' : k === 10 ? 'mag' : 'green';
  }
  const l = 0.5 + 0.5 * (0.2126 * R + 0.7152 * G + 0.0722 * B);
  const c = FAM[f];
  p.data[i] = c[0] * l;
  p.data[i + 1] = c[1] * l;
  p.data[i + 2] = c[2] * l;
}
save(out, p);
