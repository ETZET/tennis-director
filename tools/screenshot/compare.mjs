#!/usr/bin/env node
/**
 * 画面回归：Hollow Creek 四个角度的截图对比。
 *
 *   node tools/screenshot/compare.mjs                 # sandbox 构建 vs 基准图（CI 用）
 *   node tools/screenshot/compare.mjs --against prototype   # sandbox 构建 vs 原型（M0 闸口）
 *   node tools/screenshot/compare.mjs --update        # 用 sandbox 构建重写基准图
 *
 * 先运行 pnpm build。为了让两边逐帧一致：
 *   - 页面加载后立刻按空格暂停演出，剧情停在第 0 秒；只有相机在动。
 *     演出里的随机事件（回合、台词）和 three.js 生成 UUID 共用 Math.random，
 *     打包时 three 被摇树后取数次数会变，所以不拿行进中的演出做像素对比。
 *   - Math.random 换成固定种子的 mulberry32，Playwright 假时钟驱动 requestAnimationFrame
 *   - 拦截 Google Fonts（两边都用后备字体），原型的 three.js CDN 换成本地 r128
 *   - SwiftShader 软件渲染，结果不依赖显卡
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
  await page.route(/cdnjs\.cloudflare\.com\/.*three\.min\.js/, (r) =>
    r.fulfill({ path: THREE_R128, contentType: 'text/javascript' }),
  );
  // 假时钟装上后默认还会按真实时间走；立刻暂停，之后只由 runFor 推进，帧间隔才固定
  const T0 = Date.parse('2026-01-01T16:10:00Z');
  await page.clock.install({ time: T0 });
  await page.clock.pauseAt(T0 + 1000);
  await page.addInitScript(INIT);
  await page.goto(url, { waitUntil: 'load' });
  // 暂停演出（与工具栏的 Pause 相同），相机仍然按真实帧间隔缓动
  await page.keyboard.press('Space');
  const shots = [];
  for (let i = 0; i < ANGLES; i++) {
    if (i > 0) {
      await page.keyboard.press('q');
      await page.keyboard.press('q');
    }
    await page.clock.runFor(SETTLE_MS);
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
  const n = pixelmatch(a.data, b.data, out.data, width, height, { threshold: 0.1 });
  writeFileSync(join(OUT, `${name}-diff.png`), PNG.sync.write(out));
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
