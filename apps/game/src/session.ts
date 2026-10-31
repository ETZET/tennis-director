import {
  advance,
  type Command,
  type ContentBundle,
  type GameState,
  type LoggedCommand,
  newGame,
  type OptionKey,
  optionStatus,
  type SimEvent,
  worldOf,
} from '@td/sim';

/**
 * 一局游戏的运行时：持有模拟状态和命令日志，把真实时间换成游戏分钟喂给模拟。
 *
 * - 1× 每秒走 4 游戏分钟（营业日 12 小时约 3 分钟）；2×、4× 按倍数。
 * - 玩家的命令先排队，下一帧和这一帧该走的分钟一起交给 advance()；暂停时命令也立刻生效。
 * - 选了"要先走过去"的选项：先发 moveDirector，记下这个意图；总监一到、选项可用，就替玩家选定。
 * - 模拟发出 requestPause（例如要紧的卡打开）就自动暂停。
 */

export const MINUTES_PER_SECOND = 4;
export const SPEEDS = [1, 2, 4] as const;

export interface Intent {
  uid: number;
  option: OptionKey;
  to: string;
}

export class Session {
  paused = false;
  speedIndex = 0;
  /** 本帧还没走完的零头分钟（0..1），画面用它在两个 tick 之间插值 */
  frac = 0;
  intent: Intent | null = null;
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

  /** 玩家按了某张卡的某个选项。能选就选；要走过去就出发并记下意图；选不了返回 false。 */
  choose(uid: number, option: OptionKey): boolean {
    const st = optionStatus(this.s, worldOf(this.s, this.content), uid).find((x) => x.key === option);
    if (!st) return false;
    if (st.available) {
      this.intent = null;
      this.send({ type: 'chooseOption', uid, option });
      return true;
    }
    if (st.blocked === 'director' && st.requiresDirectorAt) {
      this.intent = { uid, option, to: st.requiresDirectorAt };
      this.send({ type: 'moveDirector', to: st.requiresDirectorAt });
      return true;
    }
    return false;
  }

  /** 玩家点了地图上的某个地点 */
  walkTo(anchor: string): void {
    if (this.intent && this.intent.to !== anchor) this.intent = null;
    this.send({ type: 'moveDirector', to: anchor });
  }

  /** 推进 dt 秒真实时间。返回这一帧的领域事件。 */
  frame(dt: number): SimEvent[] {
    let ticks = 0;
    if (!this.paused && !this.s.outcome) {
      this.frac += dt * MINUTES_PER_SECOND * this.speed;
      ticks = Math.floor(this.frac);
      this.frac -= ticks;
    }
    if (!ticks && !this.queue.length) return [];
    const events: SimEvent[] = [];
    // 一分钟一分钟地走：要紧的卡一打开就停下，不会一帧跑过头
    const cmds = this.queue;
    this.queue = [];
    const first = advance(this.s, this.content, cmds, 0);
    this.log.push(...first.accepted);
    events.push(...first.events);
    for (let i = 0; i < ticks; i++) {
      const r = advance(this.s, this.content, this.followIntent(), 1);
      this.log.push(...r.accepted);
      events.push(...r.events);
      if (r.events.some((e) => e.type === 'requestPause') || this.s.outcome) {
        this.paused = !this.s.outcome;
        this.frac = 0;
        break;
      }
    }
    // 走到了也许这一帧就能替玩家选定
    const late = this.followIntent();
    if (late.length) {
      const r = advance(this.s, this.content, late, 0);
      this.log.push(...r.accepted);
      events.push(...r.events);
    }
    return events;
  }

  private followIntent(): Command[] {
    const it = this.intent;
    if (!it) return [];
    if (!this.s.cards.open.some((o) => o.uid === it.uid)) {
      this.intent = null;
      return [];
    }
    if (this.s.director.at !== it.to) return [];
    const st = optionStatus(this.s, worldOf(this.s, this.content), it.uid).find((x) => x.key === it.option);
    this.intent = null;
    return st?.available ? [{ type: 'chooseOption', uid: it.uid, option: it.option }] : [];
  }
}
