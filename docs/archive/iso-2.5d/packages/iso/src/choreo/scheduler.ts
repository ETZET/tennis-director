/**
 * 演出时间轴：在演出时间（可暂停、可变速）的某一刻执行回调。
 * 回调收到的是它被安排的时刻，而不是当前帧的时刻，这样连续排的动作不会累积误差。
 */
export class Scheduler {
  now = 0;
  private readonly events: { t: number; fn: (t: number) => void }[] = [];

  at(t: number, fn: (t: number) => void): void {
    this.events.push({ t, fn });
    this.events.sort((a, b) => a.t - b.t);
  }

  /** 推进时间并执行到期的回调（每帧最多 200 个，防止死循环）。 */
  advance(dt: number): void {
    this.now += dt;
    let guard = 0;
    while (this.events.length && (this.events[0] as { t: number }).t <= this.now && guard++ < 200) {
      const e = this.events.shift();
      e?.fn(e.t);
    }
  }

  get pending(): number {
    return this.events.length;
  }
}
