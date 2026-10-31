import type { Card, ContentBundle, Effect, OptionKey } from '@td/content';
import { type OptionStatus, optionStatus } from './cards';
import { advance, type Command, type LoggedCommand, newGame } from './game';
import type { GameState } from './state';
import { type World, worldFor } from './world';

/**
 * 机器人：无头跑局用。每个机器人看当前状态，决定这一刻发什么命令。
 * 机器人自己的随机数和游戏的种子随机流分开，不影响模拟结果的确定性。
 */

export interface Bot {
  readonly name: string;
  decide(s: GameState, content: ContentBundle): Command[];
}

/** 机器人自己的小随机数（xorshift），不碰游戏状态 */
function botRand(seed: number) {
  let x = seed | 0 || 1;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return (x >>> 0) / 4294967296;
  };
}

/**
 * 随机型：每张卡随机挑一个选项，过一会儿才处理（有时干脆放着让它过期）；
 * 选中的选项要总监到场，就先走过去。
 */
export function randomBot(seed: number): Bot {
  const r = botRand(seed);
  const plan = new Map<number, { option: OptionKey | null; at: number }>();
  return {
    name: 'random',
    decide(s, content) {
      const w = worldFor(content, s.act, s.directorConfig);
      const cmds: Command[] = [];
      for (const o of s.cards.open) {
        let p = plan.get(o.uid);
        if (!p) {
          const keys = optionStatus(s, w, o.uid).map((x) => x.key);
          const ignore = r() < 0.15;
          p = { option: ignore ? null : (keys[Math.floor(r() * keys.length)] ?? null), at: s.t + Math.floor(r() * 90) };
          plan.set(o.uid, p);
        }
        if (!p.option || s.t < p.at) continue;
        const st = optionStatus(s, w, o.uid).find((x) => x.key === p.option);
        if (!st) continue;
        if (st.available) cmds.push({ type: 'chooseOption', uid: o.uid, option: p.option });
        else if (st.blocked === 'director' && st.requiresDirectorAt && !s.director.leg)
          cmds.push({ type: 'moveDirector', to: st.requiresDirectorAt });
        else if (st.blocked) p.option = null;
      }
      return cmds;
    },
  };
}

/** "立刻能看到的好处"的权重：贪心型和走动型共用 */
const WEIGHT: Record<string, number> = {
  quality: 3,
  members: 4,
  reputation: 2,
  cash: 0.01,
  board_support: 1,
  pickleball_pressure: -0.2,
};

/** 给一个选项按看得见的效果打分（成功率按期望算） */
function scoreOption(w: World, c: Card, st: OptionStatus, expected: boolean): number {
  const opt = c.options[st.key];
  if (!opt) return Number.NEGATIVE_INFINITY;
  let score = -st.cost * (WEIGHT.cash ?? 0);
  const p = st.chance ?? 1;
  const add = (effs: readonly Effect[], k: number) => {
    for (const e of effs) {
      const m = expected ? k * (typeof e.chance === 'number' ? e.chance : 1) : 1;
      if ('stat' in e && 'add' in e && typeof e.add === 'number') score += m * e.add * (WEIGHT[e.stat] ?? 0);
      if ('facility' in e) score += m * 12;
      if ('hire' in e) score += m * ((w.people.get(e.hire)?.skill ?? 0) / 4);
      if ('activity' in e) score += m * 6;
      if ('endAct' in e) score += m * (e.endAct === 'won' ? 100 : -100);
      if ('fire' in e) score += m * 8;
    }
  };
  add(opt.effects, 1);
  if (st.chance !== null) {
    if (expected) {
      add(opt.onSuccess, p);
      add(opt.onFail, 1 - p);
    } else add(p >= 0.5 ? opt.onSuccess : opt.onFail, 1);
  }
  return score;
}

/** 最坏情况有多糟：谨慎型用（只看坏的一面，判定按失败算） */
function worstCase(c: Card, st: OptionStatus): number {
  const opt = c.options[st.key];
  if (!opt) return Number.NEGATIVE_INFINITY;
  let worst = -st.cost * (WEIGHT.cash ?? 0);
  const effs = [...opt.effects, ...(st.chance === null ? [] : opt.onFail)];
  for (const e of effs) {
    if ('stat' in e && 'add' in e && typeof e.add === 'number') worst += Math.min(0, e.add * (WEIGHT[e.stat] ?? 0));
    if ('endAct' in e && e.endAct === 'lost') worst -= 100;
  }
  if (st.chance !== null) worst -= (1 - st.chance) * 4;
  return worst;
}

/**
 * 贪心型：给每个选项按"立刻能看到的好处"打分，选最高的；
 * 需要总监到场就走过去；没事做时站在主教练身边盯课。
 */
export function greedyBot(): Bot {
  return pickerBot('greedy', (w, c, st) => scoreOption(w, c, st, false), { firstNeed: true });
}

/** 谨慎型：选最坏情况最不坏的选项（不赌判定、不乱花钱），而且不爱走动。 */
export function cautiousBot(): Bot {
  return pickerBot('cautious', (_w, c, st) => worstCase(c, st) - (st.requiresDirectorAt ? 2 : 0), {
    standByCoach: false,
  });
}

/** 走动型：卡一来就先走到出事的地方，偏爱要亲自到场的选项。 */
export function walkerBot(): Bot {
  return pickerBot('walker', (w, c, st) => scoreOption(w, c, st, true) + (st.requiresDirectorAt ? 6 : 0), {
    goToTrouble: true,
  });
}

function pickerBot(
  name: string,
  score: (w: World, c: Card, st: OptionStatus) => number,
  o: { standByCoach?: boolean; goToTrouble?: boolean; firstNeed?: boolean } = {},
): Bot {
  const { standByCoach = true, goToTrouble = false, firstNeed = false } = o;
  return {
    name,
    decide(s, content) {
      const w = worldFor(content, s.act, s.directorConfig);
      const cmds: Command[] = [];
      let wantAt: string | null = null;
      for (const o of s.cards.open) {
        const c = w.cards.get(o.card);
        if (!c) continue;
        let best: { key: OptionKey; score: number; need: string | null } | null = null;
        for (const st of optionStatus(s, w, o.uid)) {
          if (st.blocked === 'cost' || st.blocked === 'requires') continue;
          const sc = score(w, c, st);
          if (!best || sc > best.score)
            best = { key: st.key, score: sc, need: st.available ? null : st.requiresDirectorAt };
        }
        if (goToTrouble && c.location) wantAt ??= c.location;
        if (!best) continue;
        if (best.need) wantAt = firstNeed ? (wantAt ?? best.need) : best.need;
        else cmds.push({ type: 'chooseOption', uid: o.uid, option: best.key });
      }
      const coachAt = standByCoach && s.headCoach ? (s.people[s.headCoach]?.at ?? null) : null;
      const target = wantAt ?? coachAt;
      if (target && s.director.at !== target && !s.director.leg) cmds.push({ type: 'moveDirector', to: target });
      return cmds;
    },
  };
}

export interface RunResult {
  bot: string;
  seed: number;
  outcome: GameState['outcome'];
  days: number;
  state: GameState;
  commands: LoggedCommand[];
}

/** 跑完一局（或跑到 maxDays）。机器人每 step 分钟看一眼。 */
export function runGame(
  content: ContentBundle,
  bot: Bot,
  seed: number,
  o: { act?: string; director?: string; maxDays?: number; step?: number } = {},
): RunResult {
  const s = newGame(content, {
    seed,
    ...(o.act ? { act: o.act } : {}),
    ...(o.director ? { director: o.director } : {}),
  });
  const limit = (o.maxDays ?? 30) * 1440;
  const stepMin = o.step ?? 5;
  const commands: LoggedCommand[] = [];
  while (!s.outcome && s.t < limit) {
    const r = advance(s, content, bot.decide(s, content), stepMin);
    commands.push(...r.accepted);
  }
  return { bot: bot.name, seed, outcome: s.outcome, days: Math.floor(s.t / 1440) + 1, state: s, commands };
}
