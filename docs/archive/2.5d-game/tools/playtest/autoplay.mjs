/**
 * 用试玩桥自动玩一整局（给回归和 PR 记录用；评审代理不需要它）。
 *
 *   node tools/playtest/server.mjs --port 7300 --seed 7 --dist <目录> &
 *   node tools/playtest/autoplay.mjs [--port 7300] [--max 600]
 *
 * 策略很笨：卡一律选第 1 项（锁着就选第一个能选的）；空闲的人去扫各地点的清单，工单优先（表演赛最优先），
 * 其次没人的岗位。每一步都打印一行，最后打印结局。只用 HTTP 接口，不碰游戏内部。
 */
const arg = (k, d) => {
  const i = process.argv.indexOf(`--${k}`);
  return i >= 0 ? process.argv[i + 1] : d;
};
const BASE = `http://127.0.0.1:${arg('port', '7300')}`;
const MAX = Number(arg('max', '600'));
const get = async (p) => (await fetch(`${BASE}/${p}`)).json();
const log = (s, ...m) => console.log(`[d${String(s.day).padStart(3)} ${s.clock?.split('·')[1]?.trim() ?? ''}]`, ...m);

const on = new Map(); // 人 -> 我派他去的目标
const kind = new Map(); // 目标 -> order | post
const failed = new Set(); // 今天派不成的目标
// 先后顺序：主线修复，中间穿插能赚钱的岗位（排前面的先试，钱不够会被拒绝，再试下一个）
const ORDER = [
  'st1_exhibition',
  'o1_sweep',
  'o1_net',
  'o1_rental',
  'o1_lesson',
  'flyers',
  'ch_repair',
  'ch_desk',
  'o23_repair',
  'o23_rental',
  'o23_clinic',
  'pr_repair',
  'pr_academy',
  'pz_repair',
  'pz_food',
  'st3_dig',
  'st3_court',
  'st3_league',
  'st2_repair',
  'st2_pro',
  'st2_events',
  'st1_clear',
  'st1_rebuild',
];
// 工单永远排在岗位前面（钱够就先修，不够会被拒绝，再试下一个）；同类里按 ORDER 的先后
const rank = (c) => {
  const i = ORDER.indexOf(c.target);
  return (c.kind === 'order' ? 0 : 100) + (i >= 0 ? i : 50);
};
let s = await get('state');
let lastScan = -1;
for (let step = 0; step < MAX && !s.outcome; step++) {
  if (s.card) {
    const a = s.card.answers.find((x) => !x.locked);
    if (!a) {
      // 所有选项都点不了（比如现金为负）：不答，让时间走，倒计时到了按默认处理
      log(s, `卡 "${s.card.headline}" 选项全锁着 (${s.card.answers.map((x) => x.hint).join(' | ')})，等它到期`);
      s = await get('wait/30');
      continue;
    }
    log(s, `卡 "${s.card.headline}" -> ${a?.key} ${a?.text}`, a?.chips?.length ? `(${a.chips.join(', ')})` : '');
    s = await get(`answer/${a.key}`);
    continue;
  }
  // 空闲的人，或者站在岗位上的人（每隔几天看一眼：钱够了就把他们拉去做排在前面的工单）
  for (const p of s.people) if (p.state === 'idle') on.delete(p.id);
  const free = s.people.filter((p) => p.state === 'idle' || kind.get(on.get(p.id)) === 'post').map((p) => p.id);
  const idle = s.people.filter((p) => p.state === 'idle');
  if (free.length && (s.day - lastScan >= 3 || (idle.length && s.day !== lastScan))) {
    lastScan = s.day;
    failed.clear();
    const cands = [];
    for (const id of s.placeIds) {
      const r = await get(`tap/${id}`);
      for (const row of r.place?.rows ?? []) if (row.target && !row.locked) cands.push(row);
      await get('close');
    }
    for (const c of cands) kind.set(c.target, c.kind);
    cands.sort((a, b) => rank(a) - rank(b));
    const crew = (target) => [...on.values()].filter((x) => x === target).length;
    for (const id of free) {
      const was = on.get(id);
      for (const c of cands) {
        if (c.target === was) break; // 已经在最靠前的能做的事上
        if (rank(c) >= rank({ target: was, kind: kind.get(was) }) && was) break; // 不比现在的更靠前，就不动
        if (c.kind === 'order' ? crew(c.target) >= 2 : crew(c.target) >= 1) continue;
        if (failed.has(c.target)) continue;
        const r = await get(`assign/${id}/${c.target}`);
        if (r.error) {
          log(s, `派 ${id} -> ${c.target} 失败: ${r.error}`);
          failed.add(c.target); // 今天不再试（多半是钱不够）
          continue;
        }
        on.set(id, c.target);
        log(s, `派 ${id} -> ${c.target} (${c.text.slice(0, 50)})`);
        break;
      }
    }
  }
  const w = await get('wait/240');
  s = w;
  if (w.waited.stop !== 'time' || step % 10 === 0)
    log(
      s,
      `wait ${w.waited.minutes}min stop=${w.waited.stop} 复原 ${s.restored} 剩 ${s.daysLeft} 天 现金 ${s.strip[3]}`,
    );
  // 工单做完了：下一轮马上重新派人
  if (w.waited.stop === 'orderFinished') lastScan = -1;
}
log(s, '结局', JSON.stringify(s.outcome), '复原', s.restored);
process.exit(s.outcome ? 0 : 1);
