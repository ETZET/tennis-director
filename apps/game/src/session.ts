import { PACE } from '@td/shared';
import {
  advance,
  type Command,
  type ContentBundle,
  type GameState,
  type LoggedCommand,
  newGame,
  type OptionKey,
  optionStatus,
  postDemand,
  type SimEvent,
  worldOf,
} from '@td/sim';

/**
 * 一局游戏的运行时：持有模拟状态和命令日志，把真实时间换成游戏分钟喂给模拟。
 *
 * - 1× 每秒走 6 游戏分钟（营业日 12 小时约 2 分钟）；2×、4× 按倍数（ADR 0012）。
 * - 没有卡开着、有需求的岗位都有人、没人在走路或开工时，时间再快 2 倍（PACE.idleSpeedup）。
 * - 玩家的命令先排队，下一帧和这一帧该走的分钟一起交给 advance()；暂停时命令也立刻生效。
 * - 拖人：先点（或长按拖起）一个人，再点岗位或工单；拿起来的人记在 picked 上，时间不停。
 * - 模拟发出 requestPause（例如要紧的卡打开）就自动暂停。
 */

export const MINUTES_PER_SECOND = PACE.minutesPerSecond;
export const SPEEDS = [1, 2, 4] as const;

export class Session {
  paused = false;
  speedIndex = 0;
  /** 本帧还没走完的零头分钟（0..1），画面用它在两个 tick 之间插值 */
  frac = 0;
  /** 拿起来、等着放到岗位或工单上的人（两步指派的第一步） */
  picked: string | null = null;
  /** 点开说明的岗位或工单（手上没拿人时点了它） */
  sheet: string | null = null;
  private queue: Command[] = [];

  constructor(
    public content: ContentBundle,
    public s: GameState,
    public readonly log: LoggedCommand[] = [],
  ) {}

  static fresh(content: ContentBundle, seed: number, director?: string): Session {
    return new Session(content, newGame(content, { seed, ...(director ? { director } : {}) }));
  }

  get speed(): number {
    return SPEEDS[this.speedIndex] ?? 1;
  }

  /** 现在是不是"闲着"：没卡、没人在走路或办事、没有开着的工单、有客人的岗位都有人 */
  get idle(): boolean {
    const s = this.s;
    if (s.cards.open.length || this.picked || Object.keys(s.orders).length) return false;
    for (const p of Object.values(s.people)) if (p.hired && (p.walk || p.errand)) return false;
    const w = worldOf(s, this.content);
    for (const post of w.posts.values())
      if (postDemand(s, w, post) && !Object.values(s.people).some((p) => p.hired && p.job === post.id)) return false;
    return true;
  }

  /** 当前的连续游戏时间（带零头），画面插值用 */
  get time(): number {
    return this.s.t + this.frac;
  }

  send(cmd: Command): void {
    this.queue.push(cmd);
  }

  cycleSpeed(): void {
    this.speedIndex = (this.speedIndex + 1) % SPEEDS.length;
  }

  /** 玩家按了某张卡的某个选项。能选就选；选不了返回 false。 */
  choose(uid: number, option: OptionKey): boolean {
    const st = optionStatus(this.s, worldOf(this.s, this.content), uid).find((x) => x.key === option);
    if (!st?.available) return false;
    this.send({ type: 'chooseOption', uid, option });
    return true;
  }

  /** 把一个人派到岗位或工单上（null = 叫他停下来）；放下以后手上就空了 */
  assign(person: string, target: string | null): void {
    this.picked = null;
    this.sheet = null;
    this.send({ type: 'assign', person, target });
  }

  /** 推进 dt 秒真实时间。返回这一帧的领域事件。 */
  frame(dt: number): SimEvent[] {
    let ticks = 0;
    if (!this.paused && !this.s.outcome) {
      this.frac += dt * MINUTES_PER_SECOND * this.speed * (this.idle ? PACE.idleSpeedup : 1);
      ticks = Math.floor(this.frac);
      this.frac -= ticks;
    }
    return this.run(ticks);
  }

  /** 正好走一个游戏分钟（试玩桥用：不受速度和"闲着加速"影响） */
  stepMinute(): SimEvent[] {
    return this.run(this.paused || this.s.outcome ? 0 : 1);
  }

  private run(ticks: number): SimEvent[] {
    if (!ticks && !this.queue.length) return [];
    const events: SimEvent[] = [];
    // 一分钟一分钟地走：要紧的卡一打开就停下，不会一帧跑过头
    const cmds = this.queue;
    this.queue = [];
    const first = advance(this.s, this.content, cmds, 0);
    this.log.push(...first.accepted);
    events.push(...first.events);
    for (let i = 0; i < ticks; i++) {
      const r = advance(this.s, this.content, [], 1);
      this.log.push(...r.accepted);
      events.push(...r.events);
      if (r.events.some((e) => e.type === 'requestPause') || this.s.outcome) {
        this.paused = !this.s.outcome;
        this.frac = 0;
        break;
      }
    }
    return events;
  }
}
