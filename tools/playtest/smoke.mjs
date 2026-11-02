/**
 * 试玩桥冒烟：起桥 → 开局 → 处理开局卡 → 派总监和 Dale 去扫外场 1 → 走几个小时 → 取 /state 和截图。
 * 任何一步不对就非零退出。不进 CI（要浏览器和打好的游戏包）。
 *
 *   node tools/playtest/smoke.mjs [--dist <打好的游戏目录>] [--port 7399] [--out <截图目录>]
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const arg = (k, d) => {
  const i = process.argv.indexOf(`--${k}`);
  return i >= 0 ? process.argv[i + 1] : d;
};
const here = dirname(fileURLToPath(import.meta.url));
const PORT = arg('port', '7399');
const OUT = resolve(arg('out', mkdtempSync(join(tmpdir(), 'td-smoke-'))));
const args = [join(here, 'server.mjs'), '--port', PORT, '--seed', '7', '--out', OUT];
if (arg('dist')) args.push('--dist', arg('dist'));
const bridge = spawn(process.execPath, args, { stdio: ['ignore', 'inherit', 'inherit'] });
let exited = false;
bridge.on('exit', () => {
  exited = true;
});

const get = async (p) => {
  const r = await fetch(`http://127.0.0.1:${PORT}/${p}`);
  return r.json();
};
const fail = (msg) => {
  console.error(`SMOKE FAIL: ${msg}`);
  bridge.kill();
  process.exit(1);
};
const check = (cond, msg) => {
  if (!cond) fail(msg);
  console.log(`ok  ${msg}`);
};

try {
  let s;
  for (let i = 0; i < 90 && !s; i++) {
    if (exited) fail('桥启动失败（看上面的报错；多半是没打包或没有 playwright）');
    s = await get('state').catch(() => null);
    if (!s) await new Promise((r) => setTimeout(r, 1000));
  }
  if (!s) fail('90 秒内桥没起来');
  check(
    s.day === 1 && s.restored === '0/8' && s.daysLeft === 112,
    `开局：第 ${s.day} 天，复原 ${s.restored}，剩 ${s.daysLeft} 天`,
  );
  check(s.staffIds.join() === 'director,dale', `开局只有总监和 Dale (${s.staffIds})`);
  check(s.placeIds.includes('outer_1') && s.placeIds.length === 10, '10 个地点 id');
  check(!!s.card, `开局卡：${s.card?.headline}`);
  s = await get('answer/1');
  check(!s.card, '开局卡答完');
  for (const who of ['director', 'dale']) {
    const r = await get(`assign/${who}/o1_sweep`);
    check(!r.error, `派 ${who} 去 o1_sweep`);
  }
  const w = await get('wait/180');
  check(w.waited.minutes > 0, `/wait/180 走了 ${w.waited.minutes} 分钟，stop=${w.waited.stop}`);
  s = await get('state');
  check(s.people.every((p) => p.state === 'working' || p.state === 'walking' || p.state === 'idle'), '员工状态读得出');
  const shot = await get('shot/smoke');
  check(shot.path && existsSync(shot.path), `截图 ${shot.path}`);
  // 外网字体加载失败（离线容器）不算
  const errs = (await get('errors')).errors.filter((e) => !/Failed to load resource/.test(e));
  check(errs.length === 0, `页面没有控制台错误 ${errs.length ? JSON.stringify(errs).slice(0, 200) : ''}`);
  console.log('SMOKE PASS');
  await get('quit').catch(() => {});
  process.exit(0);
} catch (e) {
  fail(String(e));
}
