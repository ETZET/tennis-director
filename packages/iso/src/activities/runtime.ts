import { clamp, hdist, lerp, mulberry32, pick, type Rand, range, type XYZ, type XZ } from '@td/shared';
import { Box, Group, type Node, V3 } from '../core/graph';
import type { IconName } from '../fx/icons';
import { Particles } from '../fx/particles';
import { SpriteLayer } from '../fx/sprites';
import { BallPool } from '../motion/ball';
import type { Bounds } from '../motion/ballistics';
import { type FallKind, type PeopleWorld, Person, type PersonOptions } from '../people/person';
import type { GestureName, PoseName, StrokeName } from '../people/poses';
import type { CourtFrame } from '../world/frame';
import { coachLook, type LookOptions, look, VENUE_STYLE, type VenueStyle } from './looks';
import { mkUmbrella, PropBatch } from './props';
import { textFor } from './text';
import type { ActivityEnv, ActivityMeta, Conditions, Lang, ParamValue, StartOptions, Venue, Weather } from './types';

/**
 * 一次活动演出的运行时（原型里的 `a`）：
 * - 活动的一切都挂在一个局部坐标组里，组的原点和朝向就是场地坐标系，
 *   所以演出代码全用局部坐标（球网在 x=0），和原型的写法一样；
 * - 生成的人物进宿主的人物列表（宿主每帧 update），但站在局部坐标里；
 * - 借来的人物（游戏里的教练、青少年）临时搬进局部坐标，演完还回去；
 * - 球、粒子、漫画字都是活动自己的，停下时一起清理；
 * - 时间用宿主的时间轴；每帧的逻辑靠时间轴自己排的 tick 推进，宿主不用额外调用。
 */

export interface Runner {
  update?(dt: number): void;
}

interface Tween {
  o: Node;
  from: XYZ;
  to: XYZ;
  t0: number;
  dur: number;
  h: number;
  spin: number;
  onEnd?: () => void;
}

interface Flyer {
  o: Node;
  v: XYZ;
  spin: XZ;
  b: number;
  floor: number;
  rest: boolean;
  drop: boolean;
  onRest?: () => void;
}

/** 停在围网上的乌鸦：会飞下来叼走地上的球、烤架上的肉饼。 */
export interface ActCrow {
  g: Group;
  head: Box;
  wl: Group;
  wr: Group;
  beak: Node;
  yaw: number;
  home: XYZ;
  ph: number;
  busy: boolean;
  fly: boolean;
  done: (() => void) | null;
}

interface Saved {
  p: Person;
  world: PeopleWorld;
  x: number;
  z: number;
  yaw: number;
  lock: number | null;
  base: PoseName;
  seatY: number | null;
  idleFace: number | null;
  visible: boolean;
}

export interface PopOpt {
  fg?: string;
  h?: number;
  dur?: number;
  rise?: number;
}

/** 方块，(x,y,z) 是中心（和旧版 people/parts 的 part() 一样） */
function part(g: Node, w: number, h: number, d: number, x: number, y: number, z: number, col: string): Box {
  const b = new Box(w, h, d, col);
  b.position.set(x, y, z);
  g.add(b);
  return b;
}

/** 3×4 仿射矩阵（graph.ts 的列主序布局）求逆 */
function invertAffine(m: Float64Array): Float64Array {
  const [a, b, c, d, e, f, g, h, i, tx, ty, tz] = m as unknown as number[];
  const A = e * i - f * h;
  const B = -(d * i - f * g);
  const C = d * h - e * g;
  const det = a * A + b * B + c * C || 1e-12;
  const o = new Float64Array(12);
  o[0] = A / det;
  o[3] = B / det;
  o[6] = C / det;
  o[1] = -(b * i - c * h) / det;
  o[4] = (a * i - c * g) / det;
  o[7] = -(a * h - b * g) / det;
  o[2] = (b * f - c * e) / det;
  o[5] = -(a * f - c * d) / det;
  o[8] = (a * e - b * d) / det;
  o[9] = -((o[0] as number) * tx + (o[3] as number) * ty + (o[6] as number) * tz);
  o[10] = -((o[1] as number) * tx + (o[4] as number) * ty + (o[7] as number) * tz);
  o[11] = -((o[2] as number) * tx + (o[5] as number) * ty + (o[8] as number) * tz);
  return o;
}

export const EAST = Math.PI / 2;
export const WEST = -Math.PI / 2;
export const SOUTH = 0;
export const NORTH = Math.PI;
export const BR = 0.08;
export const fwd = (y: number): XZ => ({ x: Math.sin(y), z: Math.cos(y) });
export const rgt = (y: number): XZ => ({ x: -Math.cos(y), z: Math.sin(y) });
/** 风（局部坐标的恒定加速度） */
export const WIND: XZ = { x: 0.4, z: 1.5 };
const ZERO: XZ = { x: 0, z: 0 };
const _v = new V3();

export class Act {
  readonly group: Group;
  readonly lw: PeopleWorld;
  readonly pool: BallPool;
  readonly fx: Particles;
  readonly spr: SpriteLayer;
  /** 活动道具的批次（一个装 Box 的组）：setup 里往里加，buildProps 挂进活动的组 */
  readonly vb = new PropBatch();
  readonly rand: Rand;
  readonly lang: Lang;
  readonly b: Bounds;
  readonly style: VenueStyle;
  readonly P: Record<string, ParamValue>;
  readonly crows: ActCrow[] = [];
  /** 水坑（局部坐标的矩形）：球落进去会溅水 */
  readonly puddles: { x: number; z: number; w: number; d: number }[] = [];
  alive = true;
  finished = false;
  /** 画面震动（动画库的相机读它） */
  shake = 0;
  runner: Runner | undefined;

  private readonly spawned: Person[] = [];
  private readonly saved: Saved[] = [];
  private tweens: Tween[] = [];
  private flyers: Flyer[] = [];
  private ups: ((dt: number, now: number) => unknown)[] = [];
  private fxT = 0;
  /** 活动组世界矩阵的逆（lp 用） */
  private readonly inv: Float64Array;
  private last: number;

  constructor(
    readonly env: ActivityEnv,
    readonly meta: ActivityMeta,
    readonly fr: CourtFrame,
    readonly C: Conditions,
    params: Record<string, ParamValue>,
    readonly opts: StartOptions,
  ) {
    this.P = params;
    this.rand = env.rand ?? mulberry32(opts.seed ?? 0x5eed);
    this.lang = env.lang ?? 'en';
    this.style = VENUE_STYLE[C.venue];
    this.b = opts.bounds
      ? { ...opts.bounds }
      : { x0: -fr.hx + 0.15, x1: fr.hx - 0.15, z0: -fr.hz + 0.15, z1: fr.hz - 0.15 };
    const g = new Group();
    g.name = `activity:${meta.id}`;
    g.position.set(fr.ox, fr.oy, fr.oz);
    g.rotation.y = fr.a;
    env.scene.add(g);
    g.updateMatrixWorld();
    this.group = g;
    this.inv = invertAffine(g.matrixWorld);
    const gy = (x: number, z: number) => {
      const w = fr.w({ x, z });
      return env.groundY(w.x, w.z) - fr.oy;
    };
    this.lw = { scene: g, people: env.world.people, groundY: gy };
    this.pool = new BallPool(g, gy);
    this.fx = new Particles(g, this.rand, { groundY: gy, wind: () => this.drift() });
    this.spr = new SpriteLayer(g, env.spriteScale ?? 1);
    this.last = env.sched.now;
  }

  /* ---------------- 条件 ---------------- */

  get now(): number {
    return this.env.sched.now;
  }
  get wx(): Weather {
    return this.C.weather;
  }
  get rain(): boolean {
    return this.C.weather === 'rain';
  }
  get wind(): boolean {
    return this.C.weather === 'wind';
  }
  get heat(): boolean {
    return this.C.weather === 'heat';
  }
  /** 有效疲劳：酷热再加 0.22 */
  get f(): number {
    return clamp(this.C.fatigue + (this.heat ? 0.22 : 0), 0, 1);
  }
  /** 教练水平 1..5 */
  get c(): number {
    return clamp(Math.round(this.C.coach), 1, 5);
  }
  get venue(): Venue {
    return this.C.venue;
  }
  num(key: string): number {
    const v = this.P[key];
    return typeof v === 'number' ? v : Number(v) || 0;
  }
  str(key: string): string {
    return String(this.P[key] ?? '');
  }
  drift(): XZ {
    return this.wind ? WIND : ZERO;
  }

  /* ---------------- 随机数和文案 ---------------- */

  rr(a: number, b: number): number {
    return range(this.rand, a, b);
  }
  ri(a: number, b: number): number {
    return Math.floor(range(this.rand, a, b + 1));
  }
  pick<T>(arr: readonly T[]): T {
    return pick(arr, this.rand);
  }
  chance(p: number): boolean {
    return this.rand() < p;
  }
  /** 场景里的字（按语言），数组随机取一句；{x} 占位 */
  t(key: string, vars?: Record<string, string | number>): string {
    return textFor(this.lang, key, this.rand, vars);
  }

  /* ---------------- 时间 ---------------- */

  /** d 秒后执行；活动停下后不再执行 */
  at(d: number, fn: (t: number) => void): void {
    this.env.sched.at(this.now + Math.max(0, d), (t) => {
      if (!this.alive) return;
      fn(t);
    });
  }

  /** 每帧调用；回调返回 true 表示做完了，以后不再调用 */
  onFrame(fn: (dt: number, now: number) => unknown): void {
    this.ups.push(fn);
  }

  /* ---------------- 人物 ---------------- */

  /** 生成一个人物（局部坐标），停下时删掉。 */
  spawn(o: Omit<PersonOptions, 'name'> & { name?: string; umbrella?: string }): Person {
    const { umbrella, ...rest } = o;
    const p = new Person({ name: '', ...rest }, this.lw);
    p.slideBounds = this.b;
    if (umbrella) {
      p.give('R', mkUmbrella(umbrella));
      if (!o.base || o.base === 'relaxed') p.base = 'umbrella';
    }
    this.spawned.push(p);
    return p;
  }

  /** 随机样子的人物 */
  person(o: LookOptions & { x: number; z: number }): Person {
    return this.spawn(look(this.rand, this.venue, this.rain, o) as PersonOptions & { umbrella?: string });
  }

  /** 按教练水平打扮的教练 */
  coachPerson(o: Partial<PersonOptions> & { x: number; z: number }): Person {
    return this.spawn(coachLook(this.rand, this.venue, this.c, o) as PersonOptions);
  }

  /**
   * 借一个现有人物（没有就返回 null）：搬进局部坐标，放到 at，演完原样还回去。
   */
  borrow(
    p: Person | null | undefined,
    at: { x: number; z: number; lock?: number | null; yaw?: number; base?: PoseName },
  ): Person | null {
    if (!p || p.removed || this.saved.some((s) => s.p === p)) return null;
    this.saved.push({
      p,
      world: p.peopleWorld,
      x: p.pos.x,
      z: p.pos.z,
      yaw: p.yaw,
      lock: p.lock,
      base: p.base,
      seatY: p.seatY,
      idleFace: p.idleFace,
      visible: p.root.visible,
    });
    p.resetAction();
    p.rehome(this.lw);
    p.pos.set(at.x, 0, at.z);
    p.lock = at.lock ?? null;
    p.yaw = at.yaw ?? at.lock ?? 0;
    p.moveYaw = p.yaw;
    p.base = at.base ?? 'relaxed';
    p.seatY = null;
    p.idleFace = null;
    p.watch = null;
    p.root.visible = true;
    p.slideBounds = this.b;
    return p;
  }

  /** 借来的或者新生成的 */
  cast(
    p: Person | null | undefined,
    at: { x: number; z: number; lock?: number | null; yaw?: number; base?: PoseName },
    make: () => Person,
  ): Person {
    return this.borrow(p, at) ?? make();
  }

  isBorrowed(p: Person): boolean {
    return this.saved.some((s) => s.p === p);
  }

  /** 删掉一个生成的人物（借来的人物不删，只藏起来）。 */
  remove(p: Person): void {
    if (this.isBorrowed(p)) {
      p.clearMoves();
      p.root.visible = false;
      return;
    }
    p.removed = true;
    p.clearMoves();
    p.root.parent?.remove(p.root);
    const L = this.env.world.people;
    const i = L.indexOf(p);
    if (i >= 0) L.splice(i, 1);
    const j = this.spawned.indexOf(p);
    if (j >= 0) this.spawned.splice(j, 1);
  }

  /** 场上所有还在的人物 */
  get people(): Person[] {
    return [...this.spawned, ...this.saved.map((s) => s.p)].filter((p) => !p.removed && p.root.visible);
  }

  /** 物体在局部坐标里的位置 */
  lp(o: Node): XYZ {
    o.getWorldPosition(_v);
    // 活动的组建好后不再动：用构造时缓存的逆矩阵，不让 worldToLocal 每次重算整组（道具批次有上百个方块）
    const m = this.inv;
    const { x, y, z } = _v;
    return {
      x: (m[0] as number) * x + (m[3] as number) * y + (m[6] as number) * z + (m[9] as number),
      y: (m[1] as number) * x + (m[4] as number) * y + (m[7] as number) * z + (m[10] as number),
      z: (m[2] as number) * x + (m[5] as number) * y + (m[8] as number) * z + (m[11] as number),
    };
  }

  gy(x: number, z: number): number {
    return this.lw.groundY(x, z);
  }

  /* ---------------- 动作快捷方式 ---------------- */

  gesture(p: Person, name: GestureName, dur: number): void {
    p.gesture(name, this.now, dur);
  }
  swing(p: Person, s: StrokeName, tc: number): void {
    p.setStroke(s, tc);
  }
  hop(p: Person, h = 0.3, d = 0.32): void {
    p.hop(this.now, h, d);
  }
  spin(p: Person, d = 0.6): void {
    p.spin(this.now, d);
  }
  fall(p: Person, kind: FallKind = 'face', dur = 1.6, opt: { slide?: number; onUp?: () => void } = {}): void {
    p.fall(this.now, kind, dur, opt);
    if (this.rain) this.fx.splash(p.pos.x, this.gy(p.pos.x, p.pos.z) + 0.02, p.pos.z, 12);
    else this.fx.dust(p.pos.x, this.gy(p.pos.x, p.pos.z) + 0.02, p.pos.z, 8);
  }

  /* ---------------- 漫画字和表情 ---------------- */

  emote(p: Person, name: IconName, dur = 1.5): void {
    if (!p.removed) this.spr.emote(p.headTop, name, dur);
  }
  pop(text: string, target: Person | XYZ, o: PopOpt = {}): void {
    if (target instanceof Person) {
      if (target.removed) return;
      this.spr.pop(text, target.headTop, o);
    } else this.spr.pop(text, target, o);
  }
  say(p: Person, text: string, dur = 2.2, o: PopOpt & { bg?: string } = {}): void {
    if (!p.removed) this.spr.say(p.headTop, text, dur, o);
  }
  dizzy(p: Person, dur = 1.6): void {
    this.spr.dizzy(p.headTop, dur);
  }
  flash(pos: XYZ, h = 1.3): void {
    this.spr.flash(pos, h);
  }
  card(p: Person, text: string, col?: string): void {
    this.spr.card(p.handR, text, col);
  }
  icon(name: IconName, pos: XYZ, h: number, dur: number, rise = 0.4): void {
    this.spr.icon(name, { pos, h, dur, rise });
  }
  /** 教练头顶的星级（只在动画库里显示） */
  badge(p: Person): void {
    if (!this.opts.extras?.badges) return;
    this.spr.badge(p.headTop, this.c);
  }

  /* ---------------- 补间和抛飞 ---------------- */

  tween(o: Node, from: XYZ, to: XYZ, dur: number, opt: { h?: number; spin?: number; onEnd?: () => void } = {}): void {
    this.tweens.push({
      o,
      from: { ...from },
      to: { ...to },
      t0: this.now,
      dur,
      h: opt.h ?? 0,
      spin: opt.spin ?? 0,
      onEnd: opt.onEnd,
    });
  }

  fling(
    o: Node,
    v: XYZ,
    spin?: XZ,
    opt: { b?: number; floor?: number; onRest?: () => void; drop?: boolean } = {},
  ): void {
    this.flyers.push({
      o,
      v: { ...v },
      spin: spin ?? { x: this.rr(-8, 8), z: this.rr(-8, 8) },
      b: opt.b ?? 2,
      floor: opt.floor ?? 0,
      rest: false,
      drop: !!opt.drop,
      onRest: opt.onRest,
    });
  }

  unfling(o: Node): void {
    this.flyers = this.flyers.filter((f) => f.o !== o);
  }

  /* ---------------- 乌鸦 ---------------- */

  addCrow(x: number, y: number, z: number, yaw: number): ActCrow {
    const g = new Group();
    g.name = 'crow';
    g.position.set(x, y, z);
    g.rotation.y = yaw;
    this.group.add(g);
    part(g, 0.22, 0.2, 0.36, 0, 0.12, 0, '#18181c');
    const head = part(g, 0.15, 0.15, 0.15, 0, 0.27, 0.2, '#18181c');
    part(g, 0.05, 0.05, 0.1, 0, 0.26, 0.32, '#5a5a5a');
    part(g, 0.14, 0.04, 0.2, 0, 0.12, -0.25, '#18181c');
    const wl = new Group();
    wl.position.set(0.11, 0.18, 0);
    g.add(wl);
    part(wl, 0.3, 0.03, 0.24, 0.15, 0, 0, '#222227');
    const wr = new Group();
    wr.position.set(-0.11, 0.18, 0);
    g.add(wr);
    part(wr, 0.3, 0.03, 0.24, -0.15, 0, 0, '#222227');
    const beak = new Group();
    beak.position.set(0, 0.2, 0.42);
    g.add(beak);
    const c: ActCrow = {
      g,
      head,
      wl,
      wr,
      beak,
      yaw,
      home: { x, y, z },
      ph: this.rr(0, 6),
      busy: false,
      fly: false,
      done: null,
    };
    this.crows.push(c);
    return c;
  }

  /* ---------------- 每帧 ---------------- */

  /** 时间轴自己排的 tick：每次 advance 跑一次 */
  startTicking(): void {
    const tick = () => {
      if (!this.alive) return;
      const dt = this.now - this.last;
      this.last = this.now;
      this.update(dt);
      this.env.sched.at(this.now + 1e-4, tick);
    };
    this.env.sched.at(this.now + 1e-4, tick);
  }

  update(dt: number): void {
    const now = this.now;
    this.runner?.update?.(dt);
    if (this.ups.length) this.ups = this.ups.filter((u) => u(dt, now) !== true);
    this.updFlyers(dt);
    this.updTweens();
    for (const c of this.crows) {
      if (c.fly) {
        const f = Math.sin(now * 22) * 0.9;
        c.wl.rotation.z = f;
        c.wr.rotation.z = -f;
        c.wl.scale.x = 1;
        c.wr.scale.x = 1;
      } else {
        c.wl.rotation.z = 0;
        c.wr.rotation.z = 0;
        c.wl.scale.x = 0.35;
        c.wr.scale.x = 0.35;
        c.head.rotation.y = Math.sin(now * 1.3 + c.ph) * 0.5;
      }
    }
    this.comic(dt);
    this.pool.update(now);
    this.fx.update(dt);
    this.spr.update(now);
    this.shake = Math.max(0, this.shake - dt);
  }

  /** 漫画特效：累了出汗、喘气冒白雾、跑得快有速度线和尘土 */
  private comic(dt: number): void {
    this.fxT -= dt;
    if (this.fxT > 0 || dt <= 0) return;
    this.fxT = 0.06;
    for (const p of this.people) {
      if (p.tired > 0.38 && this.chance((p.tired - 0.3) * 0.55)) {
        const h = this.lp(p.headTop);
        this.fx.sweat(h.x, h.y - 0.1, h.z);
      }
      if (p.panting && this.chance(0.35)) {
        const h = this.lp(p.headTop);
        const f = fwd(p.yaw);
        this.fx.puff(h.x + f.x * 0.3, h.y - 0.25, h.z + f.z * 0.3);
      }
      if (p.speed > 4.6) {
        const f = fwd(p.moveYaw);
        const s = p.root.scale.x;
        for (let i = 0; i < 2; i++)
          this.fx.speed(
            p.pos.x - f.x * this.rr(0.6, 1.2),
            this.rr(0.3, 1.6) * s,
            p.pos.z - f.z * this.rr(0.6, 1.2),
            p.moveYaw,
          );
        if (this.chance(0.4)) {
          const y = this.gy(p.pos.x, p.pos.z) + 0.02;
          if (this.rain) this.fx.splash(p.pos.x, y, p.pos.z, 3);
          else this.fx.dust(p.pos.x, y, p.pos.z, 2);
        }
      }
    }
  }

  private updFlyers(dt: number): void {
    for (const f of this.flyers) {
      if (f.rest) continue;
      f.v.y -= 9.8 * dt;
      f.o.position.x += f.v.x * dt;
      f.o.position.y += f.v.y * dt;
      f.o.position.z += f.v.z * dt;
      f.o.rotation.x += f.spin.x * dt;
      f.o.rotation.z += f.spin.z * dt;
      if (f.o.position.y <= f.floor && f.v.y < 0) {
        if (f.b > 0) {
          f.b--;
          f.v.y *= -0.35;
          f.v.x *= 0.5;
          f.v.z *= 0.5;
          f.spin.x *= 0.5;
          f.spin.z *= 0.5;
        } else {
          f.o.position.y = f.floor;
          f.rest = true;
          f.onRest?.();
        }
      }
    }
    this.flyers = this.flyers.filter((f) => !f.rest || !f.drop);
  }

  private updTweens(): void {
    for (let i = this.tweens.length - 1; i >= 0; i--) {
      const t = this.tweens[i] as Tween;
      const u = clamp((this.now - t.t0) / t.dur, 0, 1);
      t.o.position.set(
        lerp(t.from.x, t.to.x, u),
        lerp(t.from.y, t.to.y, u) + Math.sin(u * Math.PI) * t.h,
        lerp(t.from.z, t.to.z, u),
      );
      if (t.spin) t.o.rotation.y = u * t.spin;
      if (u >= 1) {
        this.tweens.splice(i, 1);
        t.onEnd?.();
      }
    }
  }

  /** 离某点最近的人 */
  nearest(ps: readonly Person[], at: XZ): Person | undefined {
    let best: Person | undefined;
    let bd = Number.POSITIVE_INFINITY;
    for (const p of ps) {
      const d = hdist(p.pos, at);
      if (d < bd) {
        bd = d;
        best = p;
      }
    }
    return best;
  }

  /* ---------------- 收尾 ---------------- */

  stop(): void {
    if (!this.alive) return;
    this.alive = false;
    for (const p of [...this.spawned]) this.remove(p);
    for (const s of this.saved) {
      const p = s.p;
      p.resetAction();
      p.rehome(s.world);
      p.pos.set(s.x, 0, s.z);
      p.yaw = s.yaw;
      p.moveYaw = s.yaw;
      p.lock = s.lock;
      p.base = s.base;
      p.seatY = s.seatY;
      p.idleFace = s.idleFace;
      p.watch = null;
      p.root.visible = s.visible;
      p.slideBounds = null;
    }
    this.saved.length = 0;
    this.spr.dispose();
    this.fx.dispose();
    // 像素版没有 GPU 资源要释放：球池有 dispose 就调（把球从场景图里摘掉），其余随组一起摘
    (this.pool as { dispose?: () => void }).dispose?.();
    this.group.parent?.remove(this.group);
  }

  /** 把道具批次挂进活动的组（setup 之后调用一次） */
  buildProps(): void {
    if (!this.vb.boxCount) return;
    this.vb.build(this.group);
  }

  /** 活动自己的节点（招牌、写字的牌子、飞走的帽子）：挂进活动的组，停下时一起摘掉 */
  own<T extends Node>(o: T): T {
    o.userData.disposable = true;
    this.group.add(o);
    return o;
  }
}
