// 一次截好几张（同一个浏览器并行开页）：node shots.mjs '[["url","out.png",宽,高,等待毫秒?]]'
// 默认藏掉 DOM 界面（只留 canvas，量图不用再裁 HUD）；HUD=1 时保留界面。
import { existsSync, readdirSync } from 'node:fs';
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
const browser = await pw.chromium.launch({
  executablePath: existsSync(exe) ? exe : undefined,
  args: ['--use-gl=angle', '--enable-unsafe-swiftshader'],
});
const jobs = JSON.parse(process.argv[2]);
const par = +(process.env.PAR ?? 3);
for (let k = 0; k < jobs.length; k += par) {
  await Promise.all(
    jobs.slice(k, k + par).map(async ([url, out, w, h, wait = 9000]) => {
      const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1, hasTouch: true });
      const errors = [];
      page.on('pageerror', (e) => errors.push(String(e)));
      page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
      await page.goto(url);
      await page.waitForTimeout(wait);
      if (process.env.HUD !== '1') {
        await page.addStyleTag({ content: '*{visibility:hidden !important} canvas{visibility:visible !important}' });
        // 小地图之类的小 canvas 也藏掉，只留画面
        await page.evaluate(() => {
          for (const c of document.querySelectorAll('canvas'))
            if (c.clientWidth < innerWidth * 0.6) c.style.setProperty('display', 'none', 'important');
        });
      }
      await page.waitForTimeout(300);
      await page.screenshot({ path: out });
      console.log(errors.length ? `ERR ${out}:\n${errors.slice(0, 3).join('\n')}` : `ok ${out}`);
      await page.close();
    }),
  );
}
await browser.close();
