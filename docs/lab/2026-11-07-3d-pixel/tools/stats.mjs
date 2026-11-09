// 画面统计（降到纹素分辨率）：node docs/lab/2026-11-07-3d-pixel/tools/stats.mjs '[["名字","图.png",每纹素像素数]]'
// 饱和度（HSV 平均）、强边缘密度（相邻纹素亮度差 > 60 的比例）、亮度直方图（10 档 %）。
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
// 在仓库根目录运行
const require = createRequire(resolve('node_modules') + '/');
let pw;
try { pw = require('playwright'); } catch { pw = require(resolve('node_modules/.pnpm/playwright-core@1.63.0/node_modules/playwright-core')); }
const exe = process.env.CHROMIUM_PATH || `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;
const b = await pw.chromium.launch({ executablePath: exe });
const p = await b.newPage();
for (const [name, file, px] of JSON.parse(process.argv[2])) {
  const data = 'data:image/' + (file.endsWith('png') ? 'png' : 'jpeg') + ';base64,' + readFileSync(file).toString('base64');
  const r = await p.evaluate(async ([data, px]) => {
    const img = new Image(); img.src = data; await img.decode();
    // 降到"纹素"分辨率再统计
    const w = Math.round(img.width / px), h = Math.round(img.height / px);
    const c = new OffscreenCanvas(w, h); const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
    g.drawImage(img, 0, 0, w, h); const d = g.getImageData(0, 0, w, h).data;
    let L = [], S = [], edges = 0, big = 0; const hist = new Array(10).fill(0); const pal = new Map();
    const lum = (i) => 0.2126*d[i]+0.7152*d[i+1]+0.0722*d[i+2];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = (y*w+x)*4; const r=d[i],gg=d[i+1],bb=d[i+2];
      const mx=Math.max(r,gg,bb), mn=Math.min(r,gg,bb); const l = lum(i);
      L.push(l); S.push(mx? (mx-mn)/mx : 0); hist[Math.min(9, Math.floor(l/25.6))]++;
      const k = (r>>4)<<8|(gg>>4)<<4|(bb>>4); pal.set(k,(pal.get(k)||0)+1);
      if (x+1<w) { const j=i+4; const dl=Math.abs(l-lum(j)); if (dl>12) edges++; if (dl>60) big++; }
    }
    const n=L.length; const mean=a=>a.reduce((s,v)=>s+v,0)/a.length;
    const ml=mean(L); const sd=Math.sqrt(mean(L.map(v=>(v-ml)**2)));
    const sorted=[...pal.values()].sort((a,b)=>b-a); let acc=0,k90=0; for(const v of sorted){acc+=v;k90++; if(acc>0.9*n)break;}
    return { size:`${w}x${h}`, lumMean:ml.toFixed(0), lumSD:sd.toFixed(0), sat:mean(S).toFixed(2), colorsFor90pct:k90, edgeDensity:(edges/n).toFixed(3), strongEdge:(big/n).toFixed(3), lumHist:hist.map(v=>Math.round(100*v/n)).join(' ') };
  }, [data, px]);
  console.log(name, JSON.stringify(r));
}
await b.close();
