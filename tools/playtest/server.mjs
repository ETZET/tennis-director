/**
 * 试玩桥：在无头浏览器里打开构建好的游戏（apps/game/dist），用 HTTP 一步一步地玩。
 * 给评审代理和自动化试玩用；它只看玩家看得到的东西（HUD 的文字、地点牌、截图）。
 *
 *   pnpm --filter @td/game build
 *   node tools/playtest/server.mjs --port 7300 --seed 7 [--lang zh] [--out /tmp/pt]
 *
 * 默认是手机竖屏（390×844，触屏）；--desktop 换成 1280×800。
 *
 *   GET /state            玩家眼前的一切：时钟、季节/天气/本周服务率、状态条、卡片（选项、提示、倒计时）、快讯、
 *                         员工条（谁在干什么）、场景里的岗位和工单标记、说明面板（开着时）、结局
 *   GET /report           点开状态条后的明细和"来龙去脉"
 *   GET /answer/1|2|3     按一个选项
 *   GET /pick/<person|none>   在员工条上点一个人（拿起来）；none 放下
 *   GET /tap/<target>     点一块地点牌（target 是锚点 id，ADR 0013）：拿着人时只有一项能接就派过去，否则打开地点清单；
 *                         target 是岗位或工单 id 时等于点清单里那一行：拿着人就派过去，没拿就打开说明（state.sheet）
 *   GET /assign/<person>/<target|none>
 *                         直接把人派到岗位或工单上（等于拖过去）；none 叫他停下来
 *   GET /sheet/<target>   某个岗位或工单的说明（派谁去会怎样），不改任何东西
 *   GET /close            放下手上的人、关掉说明
 *   GET /wait/<minutes>   让时间走，直到有新卡、要求暂停、一张工单做完、本幕结束，
 *                         或走满这么多营业分钟（夜里不算，最多 1440）
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
const DESKTOP = process.argv.includes('--desktop');
const page = await browser.newPage(
  DESKTOP
    ? { viewport: { width: 1280, height: 800 } }
    : { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 },
);
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('crash', () => console.error('page crashed'));
page.on('close', () => console.error('page closed'));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});

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
  /** 一个元素里的几段文字，用 " · " 隔开（不让它们粘在一起） */
  const parts = (el) =>
    el
      ? [...el.querySelectorAll('*')]
          .filter((x) => !x.children.length && x.textContent.trim())
          .map((x) => x.textContent.trim())
          .join(' · ')
      : null;
  const card = document.querySelector('.td-card');
  const s = window.__td.session();
  return {
    clock: t('.td-bug-clock')?.replace(/^Paused/, '') ?? null,
    season: t('.td-season')?.replace(/\s+/g, ' ') ?? null,
    weather: document.querySelector('.td-season')?.getAttribute('title') ?? null,
    status: parts(document.querySelector('.td-bug-status')),
    paused: s.paused,
    strip: [...document.querySelectorAll('.td-strip .td-cell')].map((c) => c.textContent.trim().replace(/\s+/g, ' ')),
    card: card
      ? {
          who: card.querySelector('.td-who') ? parts(card.querySelector('.td-who-col')) : null,
          tags: [...card.querySelectorAll('.td-card-tags > *')].map((x) => x.textContent.trim()),
          context: [...card.querySelectorAll('.td-ctx > *')].map((x) => x.textContent.trim()),
          headline: t('.td-card-head', card),
          body: t('.td-card-text', card),
          countdown: t('.td-count-label', card),
          note: t('.td-card-note', card),
          action: t('.td-card-action', card),
          answers: [...card.querySelectorAll('.td-answer')].map((a) => ({
            key: Number(t('.td-key', a)),
            text: t('.td-answer-text', a),
            chips: [...a.querySelectorAll('.td-chip')].map((x) => x.textContent.trim()),
            hint: t('.td-answer-hint', a),
            after: t('.td-answer-then', a),
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
        director: x.classList.contains('pl-here'),
        heading: x.classList.contains('pl-dest'),
        alert: x.classList.contains('pl-card'),
      })),
    activities: [...document.querySelectorAll('#labels .act')]
      .filter((x) => !x.hidden)
      .map((x) => x.textContent.trim()),
    staff: [...document.querySelectorAll('.td-tok')].map((x) => ({
      text: x.querySelector('button')?.getAttribute('aria-label') ?? '',
      picked: x.classList.contains('td-tok-picked'),
      locked: x.classList.contains('td-tok-locked'),
    })),
    staffIds: window.__td.staff().map((x) => x.id),
    hint: t('.td-staff-hint span'),
    targets: window.__td.targets(),
    sheet: (() => {
      const el = document.querySelector('.td-sheet');
      if (!el) return null;
      return {
        title: t('header b', el),
        note: t('.td-sheet-note', el),
        status: t('.td-sheet-status', el),
        chips: [...el.querySelectorAll('.td-chip')].map((x) => x.textContent.trim()),
        people: [...el.querySelectorAll('.td-sheet-people button')].map((b) => ({
          text: b.textContent.trim().replace(/\s+/g, ' '),
          disabled: b.disabled,
        })),
      };
    })(),
    outcome: s.s.outcome ? { result: s.s.outcome.result } : null,
  };
};

async function report() {
  const strip = await page.$('.td-strip');
  const wasOpen = !!(await page.$('.td-details'));
  if (!wasOpen) await strip?.click();
  await page.waitForTimeout(500);
  const r = await page.evaluate(() => {
    const d = document.querySelector('.td-details');
    if (!d) return null;
    const rows = [...d.querySelectorAll('.td-rows dt')].map((dt) => [
      dt.textContent.trim(),
      dt.nextElementSibling?.textContent.trim(),
    ]);
    return {
      trend: d.querySelector('.td-trend')?.textContent.trim(),
      rows: Object.fromEntries(rows),
      story: [...d.querySelectorAll('.td-story li')].map((x) => x.textContent.trim().replace(/\s+/g, ' ')),
    };
  });
  if (!wasOpen) await strip?.click();
  return r;
}

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
      await page.waitForTimeout(500);
      return send(200, await page.evaluate(STATE));
    }
    const parts2 = (q.url ?? '/')
      .split('?')[0]
      .split('/')
      .map((x) => decodeURIComponent(x));
    if (cmd === 'pick') {
      await page.evaluate((x) => window.__td.pick(x === 'none' ? null : x), parts2[2] ?? 'none');
      await page.waitForTimeout(300);
      return send(200, await page.evaluate(STATE));
    }
    if (cmd === 'tap') {
      await page.evaluate((x) => window.__td.tap(x), parts2[2] ?? '');
      await page.waitForTimeout(400);
      return send(200, await page.evaluate(STATE));
    }
    if (cmd === 'assign') {
      const [, , person, target] = parts2;
      const err = await page.evaluate(
        ([p, t]) => window.__td.assign(p, t === 'none' ? null : t),
        [person, target ?? 'none'],
      );
      await page.waitForTimeout(300);
      return send(200, { ...(err ? { error: err } : {}), ...(await page.evaluate(STATE)) });
    }
    if (cmd === 'sheet') return send(200, await page.evaluate((x) => window.__td.sheet(x), parts2[2] ?? ''));
    if (cmd === 'close') {
      await page.evaluate(() => window.__td.close());
      await page.waitForTimeout(300);
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
