/**
 * 试玩桥：在无头浏览器里打开构建好的游戏（apps/game/dist），用 HTTP 一步一步地玩。
 * 给评审代理和自动化试玩用；它只看玩家看得到的东西（HUD 的文字、地点牌、截图）。
 *
 *   pnpm --filter @td/game build
 *   node tools/playtest/server.mjs --port 7300 --seed 7 [--lang zh] [--out /tmp/pt]
 *
 *   GET /state            玩家眼前的一切：时钟、状态条、卡片（选项、提示、倒计时）、快讯、地点牌、结局
 *   GET /report           点开状态条后的明细和"来龙去脉"
 *   GET /answer/1|2|3     按数字键选一个选项
 *   GET /walk/<anchor>    点一块地点牌（总监走过去）
 *   GET /wait/<minutes>   让时间走，直到有新卡、要求暂停、本幕结束，或走满这么多游戏分钟（最多 1440）
 *   GET /shot/<name>      截一张图，返回路径
 *   GET /new/<seed>       用这个种子重开一局
 *   GET /quit             关掉
 *
 * 环境变量 CHROMIUM_PATH 指定浏览器。
 */
import { createReadStream, existsSync, mkdirSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const DIST = join(ROOT, 'apps/game/dist');
const arg = (k, d) => {
  const i = process.argv.indexOf(`--${k}`);
  return i >= 0 ? process.argv[i + 1] : d;
};
const PORT = Number(arg('port', '7300'));
const LANG = arg('lang', 'en');
const OUT = resolve(arg('out', join(ROOT, 'tools/playtest/out')));
mkdirSync(OUT, { recursive: true });
if (!existsSync(join(DIST, 'index.html'))) {
  console.error('apps/game/dist missing — run: pnpm --filter @td/game build');
  process.exit(1);
}

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const files = createServer((q, r) => {
  let u = decodeURIComponent((q.url ?? '/').split('?')[0]);
  if (u === '/') u = '/index.html';
  const f = join(DIST, u);
  if (!f.startsWith(DIST) || !existsSync(f) || statSync(f).isDirectory()) {
    r.writeHead(404);
    r.end();
    return;
  }
  r.writeHead(200, { 'content-type': TYPES[extname(f)] ?? 'application/octet-stream' });
  createReadStream(f).pipe(r);
});
await new Promise((ok) => files.listen(0, '127.0.0.1', ok));
const base = `http://127.0.0.1:${files.address().port}/index.html`;

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));

async function open(seed) {
  await page.goto(`${base}?seed=${seed}&new&lang=${LANG}`);
  await page.waitForFunction(() => !!window.__td?.session?.());
  // 开场：走一分钟，让开场卡打开，然后停住
  await page.evaluate(() => window.__td.fastForward(1));
  await page.waitForTimeout(300);
}

/** 只读 DOM：玩家看到什么就报告什么 */
const STATE = () => {
  const t = (sel, root = document) => root.querySelector(sel)?.textContent?.trim() ?? null;
  const card = document.querySelector('.td-card');
  const s = window.__td.session();
  return {
    clock: t('.td-bug-clock'),
    status: t('.td-bug-status'),
    paused: s.paused,
    strip: [...document.querySelectorAll('.td-strip .td-cell')].map((c) => c.textContent.trim().replace(/\s+/g, ' ')),
    card: card
      ? {
          tags: [...card.querySelectorAll('.td-card-tags > *')].map((x) => x.textContent.trim()),
          headline: t('.td-card-head', card),
          body: t('.td-card-text', card),
          countdown: t('.td-count-label', card),
          note: t('.td-card-note', card),
          action: t('.td-card-action', card),
          answers: [...card.querySelectorAll('.td-answer')].map((a) => ({
            key: Number(t('.td-key', a)),
            text: t('.td-answer-text', a),
            hint: t('.td-answer-hint', a),
            locked: a.getAttribute('aria-disabled') === 'true',
            walkFirst: a.classList.contains('td-walk'),
            chosen: a.classList.contains('td-chosen'),
          })),
        }
      : null,
    wire: [...document.querySelectorAll('.td-wire-items li')].map((x) => x.textContent.trim().replace(/\s+/g, ' ')),
    places: [...document.querySelectorAll('#labels .pl')]
      .filter((x) => !x.hidden)
      .map((x) => ({
        name: x.textContent.trim(),
        here: x.classList.contains('pl-here'),
        heading: x.classList.contains('pl-dest'),
        alert: x.classList.contains('pl-card'),
      })),
    activities: [...document.querySelectorAll('#labels .act')].filter((x) => !x.hidden).map((x) => x.textContent.trim()),
    outcome: s.s.outcome ? { result: s.s.outcome.result } : null,
  };
};

async function report() {
  const strip = await page.$('.td-strip');
  const wasOpen = !!(await page.$('.td-details'));
  if (!wasOpen) await strip?.click();
  await page.waitForTimeout(150);
  const r = await page.evaluate(() => {
    const d = document.querySelector('.td-details');
    if (!d) return null;
    const rows = [...d.querySelectorAll('.td-rows dt')].map((dt) => [dt.textContent.trim(), dt.nextElementSibling?.textContent.trim()]);
    return {
      trend: d.querySelector('.td-trend')?.textContent.trim(),
      rows: Object.fromEntries(rows),
      story: [...d.querySelectorAll('.td-story li')].map((x) => x.textContent.trim().replace(/\s+/g, ' ')),
    };
  });
  if (!wasOpen) await strip?.click();
  return r;
}

const ANCHORS = {
  deck: 'Clubhouse deck',
  court_1: 'Court 1',
  court_2: 'Court 2',
  bubble_court: 'Bubble court',
  clay_court: 'Clay court',
  lot: 'Parking lot',
  pool: 'Pool',
  creek_bridge: 'Footbridge',
};

await open(Number(arg('seed', '7')));

const api = createServer(async (q, r) => {
  const send = (code, body) => {
    r.writeHead(code, { 'content-type': 'application/json; charset=utf-8' });
    r.end(`${JSON.stringify(body, null, 1)}\n`);
  };
  try {
    const [, cmd, a] = (q.url ?? '/').split('?')[0].split('/');
    if (cmd === 'state') return send(200, await page.evaluate(STATE));
    if (cmd === 'report') return send(200, await report());
    if (cmd === 'answer') {
      const k = Number(a);
      if (![1, 2, 3].includes(k)) return send(400, { error: 'answer 1, 2 or 3' });
      await page.evaluate((key) => window.__td.answer(key), k);
      await page.waitForTimeout(100);
      return send(200, await page.evaluate(STATE));
    }
    if (cmd === 'walk') {
      const id = Object.keys(ANCHORS).find((k) => k === a || ANCHORS[k].toLowerCase() === decodeURIComponent(a ?? '').toLowerCase());
      if (!id) return send(400, { error: `unknown place; one of ${Object.keys(ANCHORS).join(', ')}` });
      await page.evaluate((x) => window.__td.walk(x), id);
      return send(200, await page.evaluate(STATE));
    }
    if (cmd === 'wait') {
      const m = Math.min(1440, Math.max(1, Number(a) || 60));
      const res = await page.evaluate((x) => window.__td.fastForward(x), m);
      await page.waitForTimeout(400); // 让画面跟上一点，截图才对
      return send(200, { waited: res, ...(await page.evaluate(STATE)) });
    }
    if (cmd === 'shot') {
      const name = (a || `shot-${Date.now()}`).replace(/[^\w.-]/g, '_');
      await page.waitForTimeout(600);
      const path = join(OUT, name.endsWith('.png') ? name : `${name}.png`);
      await page.screenshot({ path });
      return send(200, { path });
    }
    if (cmd === 'new') {
      await open(Number(a) || 1);
      return send(200, await page.evaluate(STATE));
    }
    if (cmd === 'errors') return send(200, { errors });
    if (cmd === 'quit') {
      send(200, { bye: true });
      await browser.close();
      files.close();
      api.close();
      return;
    }
    send(404, { error: 'see the header of tools/playtest/server.mjs for commands' });
  } catch (e) {
    send(500, { error: String(e) });
  }
});
api.listen(PORT, '127.0.0.1', () => console.log(`playtest bridge on http://127.0.0.1:${PORT} (screens → ${OUT})`));
