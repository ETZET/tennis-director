// 整屏的冷暖和留白：node hues.mjs '[["名字","图.png",每纹素像素数,[x0,y0,x1,y1]?],…]'
// 按纹素取色（同 stats.mjs 的缩小），每个纹素归一个色相家族（彩度 < 0.18 或很暗 = 灰/中性），输出：
//   暖 / 冷 / 灰 占比（暖 = 红 橙 黄 粉红，冷 = 青绿 青 蓝 靛 紫，黄绿 / 绿 / 品红单列不算），
//   top3 色相占比、占 3% 以上的色相数、平静纹素（和右边、下边都几乎同色的纹素，RGB 差和 < 24）、
//   饱和度（HSV 平均，同 stats.mjs）、强边缘（相邻纹素亮度差 > 60 的比例，同 stats.mjs）。
// 2026-11-25 整屏颜色（redo-color.md）：目标 暖 ≤ 60%、冷 ≥ 30%、饱和度 ≥ 0.45。
// 目标（2026-11-25 照《垂钓手记》溪流视频 5 帧量的，lessons.md「整屏的颜色和留白」）：暖 ≤ 55%、冷 ≥ 25%、平静纹素 ≥ 65%。
// 可选的框 [x0,y0,x1,y1]（屏幕像素）用来裁掉 HUD。
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../../../../node_modules');
const require = createRequire(`${root}/`);
let pw;
try {
  pw = require('playwright');
} catch {
  const d = readdirSync(`${root}/.pnpm`).find((n) => n.startsWith('playwright-core@'));
  pw = require(`${root}/.pnpm/${d}/node_modules/playwright-core`);
}
const exe = `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;
const browser = await pw.chromium.launch(existsSync(exe) ? { executablePath: exe } : { channel: 'chrome' });
const page = await browser.newPage();

for (const [name, file, px, crop] of JSON.parse(process.argv[2])) {
  const mime = file.endsWith('.png') ? 'png' : 'jpeg';
  const data = `data:image/${mime};base64,${readFileSync(file).toString('base64')}`;
  const r = await page.evaluate(
    async ([data, px, crop]) => {
      const img = new Image();
      img.src = data;
      await img.decode();
      const w = Math.round(img.width / px);
      const h = Math.round(img.height / px);
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const g = c.getContext('2d');
      g.imageSmoothingEnabled = false;
      g.drawImage(img, 0, 0, w, h);
      const [x0, y0, x1, y1] = crop ? crop.map((v) => Math.round(v / px)) : [0, 0, w, h];
      const d = g.getImageData(0, 0, w, h).data;
      const names = ['红', '橙', '黄', '黄绿', '绿', '青绿', '青', '蓝', '靛', '紫', '品红', '粉红'];
      const WARM = new Set(['红', '橙', '黄', '粉红']);
      const COOL = new Set(['青绿', '青', '蓝', '靛', '紫']);
      const fam = {};
      let n = 0;
      let calm = 0;
      let sat = 0;
      let big = 0;
      const lum = (i) => 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
      const diff = (a, b) => Math.abs(d[a] - d[b]) + Math.abs(d[a + 1] - d[b + 1]) + Math.abs(d[a + 2] - d[b + 2]);
      for (let y = y0; y < y1 - 1; y++)
        for (let x = x0; x < x1 - 1; x++) {
          const i = (y * w + x) * 4;
          const R = d[i] / 255;
          const G = d[i + 1] / 255;
          const B = d[i + 2] / 255;
          const mx = Math.max(R, G, B);
          const mn = Math.min(R, G, B);
          const s = mx ? (mx - mn) / mx : 0;
          sat += s;
          if (Math.abs(lum(i) - lum(i + 4)) > 60) big++;
          let k;
          if (s < 0.18 || mx < 0.12) k = '灰';
          else {
            const dd = mx - mn;
            let hh;
            if (mx === R) hh = ((G - B) / dd + 6) % 6;
            else if (mx === G) hh = (B - R) / dd + 2;
            else hh = (R - G) / dd + 4;
            k = names[Math.floor(hh * 2) % 12];
          }
          fam[k] = (fam[k] || 0) + 1;
          n++;
          if (diff(i, i + 4) < 24 && diff(i, i + w * 4) < 24) calm++;
        }
      const arr = Object.entries(fam)
        .map(([k, v]) => [k, v / n])
        .sort((a, b) => b[1] - a[1]);
      const sum = (set) => arr.filter(([k]) => set.has(k)).reduce((a, [, v]) => a + v, 0);
      const pct = (v) => `${Math.round(v * 100)}%`;
      return {
        warm: pct(sum(WARM)),
        cool: pct(sum(COOL)),
        grey: pct(fam['灰'] ? fam['灰'] / n : 0),
        top3: pct(arr.slice(0, 3).reduce((a, b) => a + b[1], 0)),
        fams: arr.filter((a) => a[1] > 0.03).length,
        calm: pct(calm / n),
        sat: (sat / n).toFixed(2),
        edge: (big / n).toFixed(3),
        top: arr
          .slice(0, 6)
          .map(([k, v]) => `${k} ${pct(v)}`)
          .join(' · '),
      };
    },
    [data, px, crop],
  );
  console.log(
    `${name.padEnd(14)} 暖 ${r.warm} 冷 ${r.cool} 灰 ${r.grey} | top3 ${r.top3} | >3% 的色相 ${r.fams} | 平静 ${r.calm} | 饱和 ${r.sat} 强边 ${r.edge} | ${r.top}`,
  );
}
await browser.close();
