#!/usr/bin/env node
/**
 * 画面回归：Hollow Creek 四个角度的截图对比。
 *
 *   node tools/screenshot/compare.mjs                 # sandbox 构建 vs 基准图（CI 用）
 *   node tools/screenshot/compare.mjs --against prototype   # sandbox 构建 vs 原型（M0 闸口；岛屿改动后只在 498030d 上成立）
 *   node tools/screenshot/compare.mjs --update        # 用 sandbox 构建重写基准图
 *
 * 先运行 pnpm build。为了让两边逐帧一致：
 *   - 页面加载后立刻按空格暂停演出，剧情停在第 0 秒；只有相机在动。
 *     演出里的随机事件（回合、台词）和 three.js 生成 UUID 共用 Math.random，
 *     打包时 three 被摇树后取数次数会变，所以不拿行进中的演出做像素对比。
 *   - Math.random 换成固定种子的 mulberry32，Playwright 假时钟驱动 requestAnimationFrame
 *   - 拦截 Google Fonts（两边都用后备字体），原型的 three.js CDN 换成本地 r128
 *   - SwiftShader 软件渲染，结果不依赖显卡
 *   - 字体固定成仓库里的 DejaVu Sans（tools/screenshot/fonts）：不拦的话 HUD 文字会落到各台机器自己的
 *     后备字体（本地是 Inter，GitHub 的 Ubuntu 是 DejaVu），同一份代码在不同机器上差 1.3%。
 *     浏览器用一份自带的 fontconfig（只认这个目录、抗锯齿和微调写死），不读系统的 /etc/fonts：
 *     同一个字体文件在不同的系统设置下栅格化出来也不一样（又差 0.7%），canvas 里画的字也走这里
 *
 * 环境变量：CHROMIUM_PATH 指定浏览器；SCREENSHOT_MAX_DIFF 允许的差异像素比例（默认 0.001）。
 */
import { createReadStream, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pixelmatch from 'pixelmatch';
import { chromium } from 'playwright-core';
import { PNG } from 'pngjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = join(ROOT, 'tools/screenshot/out');
const BASE = join(ROOT, 'tools/screenshot/baselines');
const args = process.argv.slice(2);
const against = args.includes('--against') ? args[args.indexOf('--against') + 1] : 'baselines';
const update = args.includes('--update');
const MAX_DIFF = Number(process.env.SCREENSHOT_MAX_DIFF ?? 0.001);
const FONTS = join(ROOT, 'tools/screenshot/fonts');
/** 页面里所有文字都换成同一份字体文件；粗体（600 以上）用 Bold */
const FONT_CSS = `
@font-face{font-family:"TD Shot Sans";src:url("https://td-shot.local/DejaVuSans.ttf");font-weight:100 599}
@font-face{font-family:"TD Shot Sans";src:url("https://td-shot.local/DejaVuSans-Bold.ttf");font-weight:600 900}
*,*::before,*::after{font-family:"TD Shot Sans" !important}`;

/** 浏览器专用的 fontconfig：只有 tools/screenshot/fonts，渲染参数固定，所有通用字体名都指向 DejaVu Sans */
function fontconfig() {
  const dir = join(OUT, 'fontconfig');
  mkdirSync(dir, { recursive: true });
  const file = join(dir, 'fonts.conf');
  const alias = ['sans-serif', 'serif', 'monospace', 'system-ui', 'cursive', 'fantasy']
    .map((f) => `<alias binding="strong"><family>${f}</family><prefer><family>DejaVu Sans</family></prefer></alias>`)
    .join('');
  writeFileSync(
    file,
    `<?xml version="1.0"?><!DOCTYPE fontconfig SYSTEM "fonts.dtd"><fontconfig>
<dir>${FONTS}</dir><cachedir>${join(dir, 'cache')}</cachedir>${alias}
<match target="font">
<edit name="antialias" mode="assign"><bool>true</bool></edit>
<edit name="hinting" mode="assign"><bool>false</bool></edit>
<edit name="hintstyle" mode="assign"><const>hintnone</const></edit>
<edit name="autohint" mode="assign"><bool>false</bool></edit>
<edit name="rgba" mode="assign"><const>none</const></edit>
<edit name="lcdfilter" mode="assign"><const>lcdnone</const></edit>
<edit name="embeddedbitmap" mode="assign"><bool>false</bool></edit>
</match></fontconfig>`,
  );
  return file;
}

const VIEWPORT = { width: 1280, height: 800 };
/** 每个角度：先转 90°（Q 两次），再跑这么多毫秒的假时间 */
const SETTLE_MS = 1500;
const ANGLES = 4;
/** 原型从 CDN 加载 three r128；这里换成 sandbox 依赖的同一个版本 */
const THREE_R128 = join(
  dirname(createRequire(join(ROOT, 'apps/sandbox/package.json')).resolve('three')),
  'three.min.js',
);

/* ---------- 静态文件服务：/sandbox → apps/sandbox/dist，/prototypes → prototypes ---------- */
const MOUNTS = { '/sandbox/': join(ROOT, 'apps/sandbox/dist'), '/prototypes/': join(ROOT, 'prototypes') };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' };
function serve() {
  const server = createServer((req, res) => {
    const url = decodeURIComponent((req.url ?? '/').split('?')[0]);
    for (const [prefix, dir] of Object.entries(MOUNTS)) {
      if (!url.startsWith(prefix)) continue;
      const file = join(dir, url.slice(prefix.length));
      if (!file.startsWith(dir) || !existsSync(file) || statSync(file).isDirectory()) break;
      res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
      createReadStream(file).pipe(res);
      return;
    }
    res.writeHead(404).end();
  });
  return new Promise((ok) => server.listen(0, '127.0.0.1', () => ok(server)));
}

/** 固定种子的 Math.random 和假时钟，必须在页面脚本运行前装好。 */
const INIT = `(() => {
  let a = 42;
  Math.random = () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
})();`;

async function shoot(browser, url, tag) {
  const ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await page.route(/^https:\/\/td-shot\.local\//, (r) =>
    r.fulfill({ path: join(FONTS, new URL(r.request().url()).pathname.slice(1)), contentType: 'font/ttf' }),
  );
  await page.route(/cdnjs\.cloudflare\.com\/.*three\.min\.js/, (r) =>
    r.fulfill({ path: THREE_R128, contentType: 'text/javascript' }),
  );
  // 假时钟装上后默认还会按真实时间走；立刻暂停，之后只由 runFor 推进，帧间隔才固定
  const T0 = Date.parse('2026-01-01T16:10:00Z');
  await page.clock.install({ time: T0 });
  await page.clock.pauseAt(T0 + 1000);
  await page.addInitScript(INIT);
  await page.goto(url, { waitUntil: 'load' });
  await page.addStyleTag({ content: FONT_CSS });
  await page.evaluate(() => document.fonts.ready);
  // 暂停演出（与工具栏的 Pause 相同），相机仍然按真实帧间隔缓动
  await page.keyboard.press('Space');
  const shots = [];
  for (let i = 0; i < ANGLES; i++) {
    if (i > 0) {
      await page.keyboard.press('q');
      await page.keyboard.press('q');
    }
    await page.clock.runFor(SETTLE_MS);
    // DEBUG（临时）：CI 和本地的 HUD 文字是否一样
    if (i === 0)
      console.log(
        'DBG-TEXT',
        JSON.stringify(
          await page.evaluate(() => ({
            lang: navigator.language,
            tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
            dpr: devicePixelRatio,
            text: [...document.querySelectorAll('.td-strip,.td-bug,.td-wire')].map((e) => e.innerText),
            widths: [...document.querySelectorAll('.td-strip *,.td-wire li')]
              .slice(0, 30)
              .map((e) => e.getBoundingClientRect().width.toFixed(2)),
            font: getComputedStyle(document.querySelector('.td-strip') ?? document.body).fontFamily,
            ok: document.fonts.check('16px "TD Shot Sans"'),
          })),
        ),
      );
    const buf = await page.screenshot({ type: 'png' });
    writeFileSync(join(OUT, `${tag}-${i}.png`), buf);
    shots.push(PNG.sync.read(buf));
  }
  await ctx.close();
  if (errors.length) throw new Error(`${tag}: page errors\n${errors.join('\n')}`);
  return shots;
}

function diff(a, b, name) {
  const { width, height } = a;
  const out = new PNG({ width, height });
  const n = pixelmatch(a.data, b.data, out.data, width, height, { threshold: 0.1, diffMask: true });
  writeFileSync(join(OUT, `${name}-diff.png`), PNG.sync.write(out));
  if (n) {
    // 差异像素的外框和最集中的区域（按 160×100 分块），失败时判断是 HUD 文字还是场景
    let x0 = width,
      y0 = height,
      x1 = 0,
      y1 = 0;
    const blocks = new Map();
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) {
        if (out.data[(y * width + x) * 4 + 3] === 0) continue;
        x0 = Math.min(x0, x);
        y0 = Math.min(y0, y);
        x1 = Math.max(x1, x);
        y1 = Math.max(y1, y);
        const k = `${Math.floor(x / 160) * 160},${Math.floor(y / 100) * 100}`;
        blocks.set(k, (blocks.get(k) ?? 0) + 1);
      }
    const top = [...blocks]
      .sort((p, q) => q[1] - p[1])
      .slice(0, 4)
      .map(([k, c]) => `${k}:${c}`)
      .join(' ');
    console.log(`  ${name}: 差异范围 x ${x0}–${x1}, y ${y0}–${y1}；最多的块 ${top}`);
  }
  return n / (width * height);
}

async function main() {
  if (!existsSync(join(MOUNTS['/sandbox/'], 'hollow-creek.html'))) {
    console.error('apps/sandbox/dist 不存在，先运行 pnpm build');
    process.exit(2);
  }
  mkdirSync(OUT, { recursive: true });
  mkdirSync(BASE, { recursive: true });
  const server = await serve();
  const port = server.address().port;
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || undefined,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-rasterization'],
    env: { ...process.env, FONTCONFIG_FILE: fontconfig() },
  });
  try {
    const t0 = Date.now();
    const mine = await shoot(browser, `http://127.0.0.1:${port}/sandbox/hollow-creek.html`, 'sandbox');
    console.log(`sandbox: ${ANGLES} 张截图 (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
    if (update) {
      mine.forEach((p, i) => {
        writeFileSync(join(BASE, `hollow-creek-${i}.png`), PNG.sync.write(p));
      });
      console.log('已更新基准图 → tools/screenshot/baselines/');
      return;
    }
    let ref;
    if (against === 'prototype') {
      ref = await shoot(browser, `http://127.0.0.1:${port}/prototypes/hollow-creek.html`, 'prototype');
    } else {
      ref = [];
      for (let i = 0; i < ANGLES; i++) {
        const f = join(BASE, `hollow-creek-${i}.png`);
        if (!existsSync(f)) {
          console.error(`缺少基准图 ${f}；运行 --update 生成`);
          process.exit(2);
        }
        ref.push(PNG.sync.read(readFileSync(f)));
      }
    }
    let failed = false;
    for (let i = 0; i < ANGLES; i++) {
      const r = diff(mine[i], ref[i], `angle-${i}`);
      // DEBUG（临时）：把差异最集中那块的两张小图打进日志
      if (i === 0 && r > MAX_DIFF)
        for (const [tag, img] of [
          ['MINE', mine[0]],
          ['REF', ref[0]],
        ]) {
          const crop = new PNG({ width: 200, height: 60 });
          PNG.bitblt(img, crop, 840, 20, 200, 60, 0, 0);
          console.log(`DBG-${tag} ${PNG.sync.write(crop).toString('base64')}`);
        }
      const ok = r <= MAX_DIFF;
      failed ||= !ok;
      console.log(`角度 ${i}（${i * 90}°）：差异像素 ${(r * 100).toFixed(4)}%  ${ok ? '通过' : '不通过'}`);
    }
    console.log(`对比对象：${against}；截图和差异图在 tools/screenshot/out/`);
    if (failed) process.exitCode = 1;
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
