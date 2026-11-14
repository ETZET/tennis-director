// 自动玩（调星级、截图用）：照着 __st.snapshot() 的样子按按钮，手有多准由 skill 定（判定误差的正态分布）。
// ?bot=good|ok|bad 每个模拟步按一次；__st.bot(skill, 秒) 自己推着 __mg.step 跑完一段（无头测试）。
// 选人：职业球员时间够就先接；不然接时限最紧、还来得及的那位。
import type { Minigame } from '../shell';
import type { Grade, Kind, Phase, Side } from './rules';

export interface Snapshot {
  t: number;
  state: string;
  elapsed: number;
  queue: { id: number; kind: Kind; left: number; patience: number }[];
  job: {
    id: number;
    stage: string;
    phase: Phase;
    sweep: { pos: number; zone: number; period: number };
    tension: { value: number; target: number; holding: boolean; attempt: number };
    beats: { t: number; side: Side; grade: Grade | null }[];
    mainsLeft: number;
  } | null;
}
export interface BotApi {
  press(): void;
  release(): void;
  side(s: Side): void;
  pick(id: number): void;
  snapshot(): Snapshot;
}

/** 手准：竖线（条上的位置误差）、拉力（磅）、节拍（秒）、按错边的概率、接人前犹豫几秒 */
const SKILL: Record<string, { s: number; t: number; b: number; w: number; think: number }> = {
  pro: { s: 0.012, t: 0.45, b: 0.028, w: 0, think: 0.15 },
  good: { s: 0.03, t: 0.9, b: 0.05, w: 0.01, think: 0.35 },
  ok: { s: 0.055, t: 1.7, b: 0.085, w: 0.04, think: 0.7 },
  bad: { s: 0.09, t: 3, b: 0.13, w: 0.1, think: 1.2 },
};

const mem = { key: '', off: 0, prev: -1, rel: 0, side: 'L' as Side, done: false, idleSince: -1 };
let rng: (() => number) | null = null;
const gauss = (r: () => number) => {
  const u = Math.max(1e-6, r());
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r());
};

function tick(api: BotApi, mg: Minigame, skill: string) {
  const k = SKILL[skill] ?? SKILL.ok;
  rng ??= mg.rng('bot');
  const r = rng;
  const s = api.snapshot();
  if (s.state !== 'playing') return;
  const j = s.job;
  if (!j) {
    if (!s.queue.length) return;
    if (mem.idleSince < 0) mem.idleSince = s.t;
    if (s.t - mem.idleSince < k.think) return;
    mem.idleSince = -1;
    const pro = s.queue.find((q) => q.kind === 'pro' && q.left > 18);
    const ok = s.queue.filter((q) => q.left > 12).sort((a, b) => a.left - b.left);
    api.pick((pro ?? ok[0] ?? s.queue[0]).id);
    return;
  }
  if (j.stage !== 'work') return;
  if (j.phase === 'mains') {
    const key = `m${j.id}:${j.mainsLeft}`;
    if (key !== mem.key) {
      mem.key = key;
      mem.off = gauss(r) * k.s;
      mem.prev = -1;
    }
    const target = Math.min(0.99, Math.max(0.01, j.sweep.zone + mem.off));
    const pos = j.sweep.pos;
    if (mem.prev >= 0 && (mem.prev - target) * (pos - target) <= 0) {
      api.press();
      mem.prev = -1;
      return;
    }
    mem.prev = pos;
  } else if (j.phase === 'tension' || j.phase === 'tension2') {
    const key = `t${j.id}:${j.phase}:${j.tension.attempt}`;
    if (key !== mem.key) {
      mem.key = key;
      mem.rel = j.tension.target + gauss(r) * k.t;
      api.press();
      return;
    }
    if (j.tension.holding && j.tension.value >= mem.rel) api.release();
  } else {
    const i = j.beats.findIndex((b) => b.grade === null);
    if (i < 0) return;
    const key = `c${j.id}:${i}`;
    if (key !== mem.key) {
      mem.key = key;
      mem.off = gauss(r) * k.b;
      const b = j.beats[i].side;
      mem.side = r() < k.w ? (b === 'L' ? 'R' : 'L') : b;
      mem.done = false;
    }
    if (!mem.done && s.t >= j.beats[i].t + mem.off) {
      mem.done = true;
      api.side(mem.side);
    }
  }
}

/** sec = 0：按一下（每个模拟步调）；sec > 0：自己推 __mg.step 跑这么多秒，返回结束时的样子 */
export function runBot(api: BotApi, mg: Minigame, skill: string, sec: number) {
  if (!sec) {
    tick(api, mg, skill);
    return null;
  }
  const w = window as unknown as { __mg: { step(s: number): void } };
  const n = Math.round(sec * 60);
  for (let i = 0; i < n && mg.state === 'playing'; i++) {
    tick(api, mg, skill);
    w.__mg.step(1 / 60);
  }
  return api.snapshot();
}
