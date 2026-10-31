import type { ContentBundle, OptionKey } from '@td/content';
import { optionStatus } from './cards';
import { advance, type Command, type LoggedCommand, newGame } from './game';
import type { GameState } from './state';
import { worldFor } from './world';

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

/**
 * 贪心型：给每个选项按"立刻能看到的好处"打分（质量、会员、声望、现金），选最高的；
 * 需要总监到场就走过去；没事做时站在 1 号场盯课。
 */
export function greedyBot(): Bot {
  const WEIGHT: Record<string, number> = {
    quality: 3,
    members: 4,
    reputation: 2,
    cash: 0.01,
    board_support: 1,
    pickleball_pressure: -0.2,
  };
  return {
    name: 'greedy',
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
          const opt = c.options[st.key];
          if (!opt) continue;
          let score = -st.cost * (WEIGHT.cash ?? 0);
          const effs = [...opt.effects, ...(st.chance === null ? [] : st.chance >= 0.5 ? opt.onSuccess : opt.onFail)];
          for (const e of effs) {
            if ('stat' in e && 'add' in e && typeof e.add === 'number') score += e.add * (WEIGHT[e.stat] ?? 0);
            if ('facility' in e) score += 12;
            if ('hire' in e) score += (w.people.get(e.hire)?.skill ?? 0) / 4;
            if ('activity' in e) score += 6;
            if ('endAct' in e) score += e.endAct === 'won' ? 100 : -100;
            if ('fire' in e) score += 8;
          }
          if (!best || score > best.score)
            best = { key: st.key, score, need: st.available ? null : st.requiresDirectorAt };
        }
        if (!best) continue;
        if (best.need) wantAt ??= best.need;
        else cmds.push({ type: 'chooseOption', uid: o.uid, option: best.key });
      }
      const target = wantAt ?? (s.headCoach ? s.people[s.headCoach]?.at : null) ?? null;
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
