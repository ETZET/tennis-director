import { clamp, ease, lerp, type XZ } from '@td/shared';
import type { Facing, PersonSheet, PixelArt, SlotColors } from '../art/format';
import { ADULT, BODY_OVERLAYS, HAIR_OVERLAYS, KID, KID_BODY_OVERLAYS, KID_HAIR_OVERLAYS } from '../art/people';
import { HELD, HELD_SLOTS } from '../art/props/held';
import { bakeArt } from '../core/art';
import { type BakedArt, Custom, type DrawContext, Group, Node, Sprite, V3 } from '../core/graph';
import { type FramePick, pickFrame, strokeKey } from './frames';
import { CAP_STYLES, personSlots } from './looks';
import { type GestureName, type PoseName, STROKES, type StrokeName } from './poses';
import { artOffsetToWorld, peopleView } from './view';

export type HairStyle = 'cap' | 'visor' | 'pony' | 'long' | 'bald' | 'curly' | 'short';

/** 一个像素小人的外观和初始状态。外观完全由数据决定。 */
export interface PersonOptions {
  name: string;
  x: number;
  z: number;
  /** 锁定朝向（例如击球时面向球网）；null 表示自由转身 */
  lock?: number | null;
  yaw?: number;
  base?: PoseName;
  /** 坐着时臀部的世界高度；null 表示站立 */
  seatY?: number | null;
  reach?: number;
  wide?: boolean;
  shirt: string;
  trim?: string;
  sleeve?: string;
  longSleeve?: boolean;
  shorts: string;
  pants?: boolean;
  socks?: string;
  skin: string;
  hair: string;
  hairStyle?: HairStyle;
  cap?: string;
  beard?: string;
  shoes: string;
  racket?: string;
  paddle?: string;
  phone?: boolean;
  clipboard?: boolean;
  box?: boolean;
  /** 整体缩放（小朋友 0.6 左右）；默认 1。小于 0.8 用小孩体型的精灵 */
  scale?: number;
}

/** 人物所在的世界：场景图、地面高度函数，以及登记所有人物的列表。 */
export interface PeopleWorld {
  readonly scene: Node;
  groundY(x: number, z: number): number;
  readonly people: Person[];
}

type GoTask = { k: 'go'; x: number; z: number; speed: number; face?: number; stepMul?: number; t0?: number };
type WaitTask = { k: 'wait'; d: number; t0?: number };
type CallTask = { k: 'call'; fn: (now: number) => void; t0?: number };
type Task = GoTask | WaitTask | CallTask;

/** 摔倒：face 脸朝下扑倒，back 仰面躺倒。 */
export type FallKind = 'face' | 'back';
/** 头上 / 身上的临时覆盖物：毛巾盖头、被烟熏黑的脸、一身泥。 */
export type OverlayKind = 'towel' | 'soot' | 'mud';
type Bounds2 = { x0: number; x1: number; z0: number; z1: number };

/** 帽子的标记节点：不画，只记位置和颜色（大风吹帽子时演出读它，藏起来就是帽子没了）。 */
export class CapMark extends Group {
  constructor(readonly color: string) {
    super();
  }
}

/** 挂点往镜头方向挪一点，手里的东西排在身体前面画 */
const HAND_TO_CAM = 0.12;
/** 跑动时不摆臂的基础姿势（像素版里只影响取帧，保留给演出读） */
export const NO_ARM_SWING = new Set<PoseName>(['carry', 'phoneStand', 'pull', 'umbrella', 'juggle', 'spinball']);

/** 素材表里一个覆盖物：可能是单张图，也可能按朝向分两张。 */
function overlayArt(v: unknown, facing: Facing): PixelArt | null {
  if (!v || typeof v !== 'object') return null;
  if ('rows' in v) return v as PixelArt;
  const o = v as Partial<Record<Facing, unknown>>;
  const a = o[facing] ?? o.front ?? o.back;
  if (!a || typeof a !== 'object') return null;
  if ('rows' in a) return a as PixelArt;
  // 也可能是 ArtAnim
  const fr = (a as { frames?: readonly PixelArt[] }).frames;
  return fr?.[0] ?? null;
}

/** 手持道具素材的精灵（锚点就是握点） */
export function heldSprite(name: string, slots?: SlotColors): Sprite {
  const art = HELD[name];
  const s = new Sprite(art ? bakeArt(art, slots ?? HELD_SLOTS[name]) : null);
  s.renderOrder = 0.02;
  return s;
}

/**
 * 像素小人：程序化动画（走、跑、击球、手势、坐下），画成一张按帧换的精灵。
 * 动作排成队列：go / wait / call，每帧 update 推进。
 * 肢体节点（body、upper、legL……）保留为空 Group，演出偶尔转它们也不出错；
 * headTop / handL / handR / racketHead 每帧跟着当前帧的挂点走，表情、手里的道具挂在上面。
 */
export class Person {
  readonly o: PersonOptions;
  readonly name: string;
  readonly root: Group;
  readonly body: Group;
  readonly legL: Group;
  readonly legR: Group;
  readonly upper: Group;
  readonly head: Group;
  readonly armL: Group;
  readonly armR: Group;
  readonly handL: Node;
  readonly handR: Node;
  /** 手里的辞退信（总监递给教练） */
  readonly slip: Group;
  phone: Group | null = null;
  boxMesh: Group | null = null;
  /** 身体精灵 */
  readonly sprite: Sprite;
  /** 用的精灵表（大人 / 小孩） */
  readonly sheet: PersonSheet;

  readonly pos: V3;
  lock: number | null;
  yaw: number;
  idleFace: number | null = null;
  moveYaw: number;
  watch: Person | null = null;
  base: PoseName;
  seatY: number | null;
  reach: number;
  hopT = -9;
  /** 小跳的高度和时长（默认 0.1 米、0.3 秒） */
  hopH = 0.1;
  hopD = 0.3;
  writing = false;
  /** 移动速度倍率（疲劳时变慢） */
  speedK = 1;
  /** 疲劳 0..1、是否在喘气：只给演出的漫画特效读 */
  tired = 0;
  panting = false;
  /** 被移出场景后为 true */
  removed = false;
  /** 演出代码自己的标记（路人、学生……） */
  userData: { passer?: boolean; student?: boolean } = {};
  /** 摔倒滑行时不出这个范围（所在世界的坐标） */
  slideBounds: Bounds2 | null = null;
  /** 每帧在取姿势之后调用（踢球、瑜伽单腿站）；像素版里只能改肢体空节点，不影响画面 */
  legHook: ((p: Person, now: number) => void) | null = null;
  down: { t0: number; kind: FallKind; dur: number; slide: number; onUp: (() => void) | null } | null = null;
  /** 当前这一帧选了什么（调试、测试用） */
  frame: FramePick | null = null;
  private spinT = -9;
  private spinD = 0.6;
  private lift = 0;
  private readonly capParts: CapMark[] = [];
  private readonly headTopN: Node;
  private racketN: Node | null = null;
  private readonly held: { L?: Node | null; R?: Node | null } = {};
  private readonly hairSpr: Sprite;
  private readonly overlays: Partial<Record<OverlayKind, Sprite>> = {};
  private readonly ovOn: Partial<Record<OverlayKind, boolean>> = {};
  private slots: SlotColors;
  private capOn = true;
  private readonly baked = new Map<PixelArt, BakedArt>();
  private readonly bakedNoRacket = new Map<PixelArt, BakedArt>();

  private queue: Task[] = [];
  private task: Task | null = null;
  private phase = 0;
  private stepMul = 1;
  private speedNow = 0;
  stroke: { type: StrokeName; tc: number } | null = null;
  private gest: { name: GestureName; t0: number; dur: number } | null = null;

  constructor(
    o: PersonOptions,
    private world: PeopleWorld,
  ) {
    this.o = o;
    this.name = o.name;
    this.sheet = o.scale != null && o.scale < 0.8 ? KID : ADULT;
    this.slots = personSlots(o);
    const root = new Group();
    root.name = o.name;
    this.root = root;
    world.scene.add(root);
    const g = () => new Group();
    this.body = g();
    this.legL = g();
    this.legR = g();
    this.upper = g();
    this.head = g();
    this.armL = g();
    this.armR = g();
    root.add(this.body);
    this.body.add(this.legL, this.legR, this.upper);
    this.upper.add(this.head, this.armL, this.armR);

    // 脚下的影子：一小块压暗的椭圆，贴着地面（跳起来时留在地上）
    const shadow = new Custom(
      (r: DrawContext, self: Custom) => {
        const w = self.getWorldPosition();
        const gy = this.world.groundY(w.x, w.z);
        const [sx, sy] = r.P(w.x, gy, w.z);
        const s = r.spriteScale * (this.sheet === KID ? 0.75 : 1);
        const rx = 3.5 * s;
        const ry = 1.5 * s;
        for (let y = Math.floor(sy - ry); y <= Math.ceil(sy + ry); y++)
          for (let x = Math.floor(sx - rx); x <= Math.ceil(sx + rx); x++) {
            const dx = (x + 0.5 - sx) / rx;
            const dy = (y + 0.5 - sy) / ry;
            if (dx * dx + dy * dy <= 1) r.darken(x, y, 0.72);
          }
      },
      { x0: -0.3, x1: 0.3, y0: 0, y1: 0.05, z0: -0.3, z1: 0.3 },
    );
    shadow.renderOrder = -0.05;
    root.add(shadow);

    this.sprite = new Sprite();
    this.body.add(this.sprite);
    this.hairSpr = new Sprite();
    this.hairSpr.renderOrder = 0.01;
    this.hairSpr.visible = false;
    this.body.add(this.hairSpr);

    // 挂点直接挂在 root 下（每帧算局部位置），不随空肢体节点转
    this.headTopN = new Node();
    this.handL = new Node();
    this.handR = new Node();
    root.add(this.headTopN, this.handL, this.handR);
    if (o.racket || o.paddle) {
      this.racketN = new Node();
      root.add(this.racketN);
    }

    if (o.hairStyle && CAP_STYLES.has(o.hairStyle)) {
      const c = new CapMark(o.cap ?? o.hair);
      this.headTopN.add(c);
      this.capParts.push(c);
    }
    // 手机、夹板、辞退信、纸箱：手持道具精灵，包一层 Group（演出切 visible）
    if (o.phone) {
      this.phone = new Group();
      this.handL.add(this.phone);
      this.phone.add(heldSprite('phone'));
    }
    if (o.clipboard) {
      const b = new Group();
      this.handL.add(b);
      b.add(heldSprite('clipboard'));
    }
    const slip = new Group();
    this.slip = slip;
    this.handR.add(slip);
    slip.add(heldSprite('slip'));
    slip.visible = false;
    // 纸箱：carryBox 帧自带箱子，这里只是开关（visible = 抱着）
    if (o.box) {
      const b = new Group();
      this.boxMesh = b;
      this.handR.add(b);
      b.visible = false;
    }

    this.pos = new V3(o.x, 0, o.z);
    this.lock = o.lock != null ? o.lock : null;
    this.yaw = o.yaw != null ? o.yaw : this.lock != null ? this.lock : 0;
    this.moveYaw = this.yaw;
    this.base = o.base || 'relaxed';
    this.reach = o.reach || 1;
    this.seatY = o.seatY != null ? o.seatY : null;
    if (o.scale != null && o.scale !== 1) root.scale.setScalar(o.scale);
    world.people.push(this);
    this.update(0, 0);
  }

  /** 当前所在的世界（场景图 + 地面高度）。 */
  get peopleWorld(): PeopleWorld {
    return this.world;
  }

  /** 换到另一个世界（例如活动的局部坐标系）。人物列表应该是同一个，位置由调用方换算。 */
  rehome(world: PeopleWorld): void {
    this.world = world;
    world.scene.add(this.root);
  }

  /** 平滑后的移动速度（米/秒）。 */
  get speed(): number {
    return this.speedNow;
  }

  get moving(): boolean {
    return this.task?.k === 'go';
  }

  /** 还有没做完的移动 / 等待 / 回调。 */
  busy(): boolean {
    return !!this.task || this.queue.length > 0;
  }

  /** 头顶的挂点（表情、气泡跟着它走）。 */
  get headTop(): Node {
    return this.headTopN;
  }

  /** 球拍拍面中心（没有球拍时是右手）。 */
  get racketHead(): Node {
    return this.racketN ?? this.handR;
  }

  /** 帽子的标记节点（cap / visor 发型）；没有帽子时为空。藏起来（visible=false）帽子就不画了。 */
  get cap(): readonly CapMark[] {
    return this.capParts;
  }

  /** 小跳：t 是演出时刻。 */
  hop(t: number, h = 0.1, d = 0.3): void {
    this.hopT = t;
    this.hopH = h;
    this.hopD = d;
  }

  /** 原地转一圈。 */
  spin(t: number, d = 0.6): void {
    this.spinT = t;
    this.spinD = d;
  }

  /** 摔倒：dur 秒后自己爬起来；slide 是扑出去的初速度（米/秒）。 */
  fall(t: number, kind: FallKind = 'face', dur = 1.6, opt: { slide?: number; onUp?: () => void } = {}): void {
    this.down = { t0: t, kind, dur, slide: opt.slide ?? 0, onUp: opt.onUp ?? null };
    this.stroke = null;
    this.gest = null;
  }

  /** 手里拿个东西（水瓶、奖杯、铲子……）。side 是 L / R；也可以给手持道具素材的名字（HELD）。 */
  give(side: 'L' | 'R', obj: Node | string): Node {
    this.take(side);
    let n: Node;
    if (typeof obj === 'string') n = heldSprite(obj);
    else n = obj;
    (side === 'L' ? this.handL : this.handR).add(n);
    this.held[side] = n;
    return n;
  }

  take(side: 'L' | 'R'): void {
    const o = this.held[side];
    o?.parent?.remove(o);
    this.held[side] = null;
  }

  /** 毛巾盖头、熏黑的脸、一身泥。 */
  overlay(kind: OverlayKind, on: boolean): void {
    this.ovOn[kind] = on;
    if (on && !this.overlays[kind]) {
      const s = new Sprite();
      s.renderOrder = 0.015;
      this.body.add(s);
      this.overlays[kind] = s;
    }
    const s = this.overlays[kind];
    if (s) s.visible = on;
  }

  /** 演出结束时把临时状态都清掉（借来的人物还给游戏前调用）。 */
  resetAction(): void {
    this.clearMoves();
    this.take('L');
    this.take('R');
    for (const k of ['towel', 'soot', 'mud'] as const) this.overlay(k, false);
    for (const m of this.capParts) m.visible = true;
    this.stroke = null;
    this.gest = null;
    this.down = null;
    this.root.rotation.x = 0;
    this.lift = 0;
    this.speedK = 1;
    this.tired = 0;
    this.panting = false;
    this.legHook = null;
    this.slideBounds = null;
    this.hopT = -9;
    this.hopH = 0.1;
    this.hopD = 0.3;
    this.spinT = -9;
  }

  go(x: number, z: number, speed = 2.5, opt: { face?: number; stepMul?: number } = {}): this {
    this.queue.push(Object.assign({ k: 'go' as const, x, z, speed }, opt));
    return this;
  }

  path(pts: readonly XZ[], speed?: number): this {
    for (const p of pts) this.go(p.x, p.z, speed);
    return this;
  }

  wait(d: number): this {
    this.queue.push({ k: 'wait', d });
    return this;
  }

  call(fn: (now: number) => void): this {
    this.queue.push({ k: 'call', fn });
    return this;
  }

  clearMoves(): void {
    this.queue.length = 0;
    this.task = null;
  }

  setStroke(type: StrokeName, tc: number): void {
    this.stroke = { type, tc };
  }

  gesture(name: GestureName, t: number, dur: number): void {
    this.gest = { name, t0: t, dur };
  }

  update(dt: number, now: number): void {
    let moved = 0;
    let guard = 0;
    const dn = this.down;
    if (dn) {
      const t = now - dn.t0;
      if (t >= dn.dur) {
        this.down = null;
        this.lift = 0;
        dn.onUp?.();
      } else if (t >= 0) {
        const k = t < 0.22 ? ease(t / 0.22) : t > dn.dur - 0.35 ? ease((dn.dur - t) / 0.35) : 1;
        this.lift = 0.04 * k;
        if (dn.slide > 0 && t < 0.6) {
          const v = dn.slide * (1 - t / 0.6);
          this.pos.x += Math.sin(this.yaw) * v * dt;
          this.pos.z += Math.cos(this.yaw) * v * dt;
          const b = this.slideBounds;
          if (b) {
            this.pos.x = clamp(this.pos.x, b.x0, b.x1);
            this.pos.z = clamp(this.pos.z, b.z0, b.z1);
          }
        }
      }
    }
    while (!this.down && guard++ < 6) {
      if (!this.task) {
        this.task = this.queue.shift() || null;
        if (this.task) this.task.t0 = now;
      }
      const k = this.task;
      if (!k) break;
      if (k.k === 'call') {
        this.task = null;
        k.fn(now);
        continue;
      }
      if (k.k === 'wait') {
        if (now - (k.t0 ?? now) >= k.d) {
          this.task = null;
          continue;
        }
        break;
      }
      this.stepMul = k.stepMul || 1;
      const dx = k.x - this.pos.x;
      const dz = k.z - this.pos.z;
      const d = Math.hypot(dx, dz);
      const step = k.speed * this.speedK * dt;
      if (d > 0.001) this.moveYaw = Math.atan2(dx, dz);
      if (d <= step || d < 1e-6) {
        this.pos.x = k.x;
        this.pos.z = k.z;
        moved += d;
        this.task = null;
        if (dt === 0) break;
        continue;
      }
      this.pos.x += (dx / d) * step;
      this.pos.z += (dz / d) * step;
      moved += step;
      break;
    }
    if (dt > 0) this.speedNow = lerp(this.speedNow, moved / dt, 1 - Math.exp(-dt * 12));
    const k = this.task;
    const moving = k?.k === 'go';
    if (this.watch && !moving) this.idleFace = Math.atan2(this.watch.pos.x - this.pos.x, this.watch.pos.z - this.pos.z);
    const ty =
      k?.k === 'go'
        ? k.face != null
          ? k.face
          : this.lock != null
            ? this.lock
            : this.moveYaw
        : this.lock != null
          ? this.lock
          : this.idleFace != null
            ? this.idleFace
            : this.yaw;
    if (!this.down) {
      let dy = ty - this.yaw;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      this.yaw += dy * Math.min(1, dt * 7);
    }

    // 击球：取最近的关键姿势
    let sk: PoseName | null = null;
    if (this.stroke) {
      const t = now - this.stroke.tc;
      const fr = STROKES[this.stroke.type];
      if (t >= (fr[fr.length - 1] as readonly [number, unknown])[0]) this.stroke = null;
      else sk = strokeKey(this.stroke.type, t, this.base);
    }
    let gest: { name: string; t: number } | null = null;
    if (this.gest) {
      const t = now - this.gest.t0;
      if (t > this.gest.dur) this.gest = null;
      else if (t >= 0) gest = { name: this.gest.name, t };
    }
    this.phase += moved * 2.9 * this.stepMul;
    this.legHook?.(this, now);

    const ht = now - this.hopT;
    const hopping = ht >= 0 && ht < this.hopD;
    const runAmt = clamp(this.speedNow / 2.6, 0, 1);
    let by = Math.abs(Math.cos(this.phase)) * 0.03 * runAmt;
    if (hopping) by += Math.sin((ht / this.hopD) * Math.PI) * this.hopH;
    this.body.position.y = by;
    const gy = this.seatY != null ? this.seatY : this.world.groundY(this.pos.x, this.pos.z);
    this.root.position.set(this.pos.x, this.lift ? gy + this.lift : gy, this.pos.z);
    const st = now - this.spinT;
    this.root.rotation.y = st >= 0 && st < this.spinD ? this.yaw + ease(st / this.spinD) * Math.PI * 2 : this.yaw;

    // 取帧：朝向按世界转角（root 的父节点可能是转过的活动坐标系）
    const parentYaw = this.root.parent ? this.root.parent.getWorldYaw() : 0;
    const worldYaw = this.root.rotation.y + parentYaw;
    const view = peopleView();
    const fp = pickFrame(
      this.sheet,
      {
        yaw: worldYaw,
        base: this.base,
        seated: this.seatY != null,
        down: this.down && now - this.down.t0 >= 0 ? this.down.kind : null,
        strokeKey: sk,
        gesture: gest,
        speed: this.speedNow,
        phase: this.phase,
        hop: hopping && this.hopH >= 0.15,
        now,
        carryBox: !!this.boxMesh?.visible,
      },
      view.ang,
    );
    this.frame = fp;
    this.applyFrame(fp, worldYaw);
  }

  private bake(a: PixelArt, racket = true): BakedArt {
    const cache = racket ? this.baked : this.bakedNoRacket;
    let b = cache.get(a);
    if (!b) {
      b = bakeArt(a, racket ? this.slots : { ...this.slots, racket: 'none' });
      cache.set(a, b);
    }
    return b;
  }

  /**
   * 把选好的帧放到精灵上，并按帧的挂点摆好 headTop / 手 / 拍面 / 覆盖物。
   * 帧大小不一，只按锚点对齐。翻转约定（和精灵表一致）：锚点 ox' = W - ox、挂点 x' = W-1-x；
   * core 的 flipArt 也按 ox' = W - ox，所以身体和覆盖物的精灵不用补偿；挂点是像素（取左缘），翻转后要往左挪 1 个素材像素。
   */
  private applyFrame(fp: FramePick, worldYaw: number): void {
    // 帽子被吹飞：帽子槽位换成头发色，重烘
    const capOn = this.capParts.every((c) => c.visible);
    if (capOn !== this.capOn) {
      this.capOn = capOn;
      this.slots = personSlots(this.o, capOn);
      this.baked.clear();
      this.bakedNoRacket.clear();
    }
    const spr = this.sprite;
    const art = fp.art;
    spr.flipX = fp.flip;
    // 只有带 racket 挂点的帧才画拍子（Q 槽位），其余帧 Q 透明
    spr.frame = art ? this.bake(art, !!art.pts?.racket) : null;
    const inv = 1 / (this.root.scale.x || 1);
    const c = Math.cos(-worldYaw);
    const s = Math.sin(-worldYaw);
    // 世界偏移 → root 局部（反转绕 y 的转角：three 的 Ry）
    const local = (n: Node, w: { x: number; y: number; z: number }, dy: number) =>
      n.position.set((w.x * c + w.z * s) * inv, (w.y + dy) * inv, (-w.x * s + w.z * c) * inv);
    // 坐姿：seated / seatPhone 的臀部在锚点上方 4 像素（锚点是座位前的地面）；坐地上、晕眩、摔倒的锚点在地面
    let sy = 0;
    if (this.seatY != null && art) {
      if (fp.name === 'seated' || fp.name === 'seatPhone') sy = artOffsetToWorld(0, 4).y;
      else if (fp.name === 'sitGround' || fp.name === 'dizzy' || fp.name === 'fallFace' || fp.name === 'fallBack')
        sy = this.world.groundY(this.pos.x, this.pos.z) - this.seatY;
    }
    const fo = fp.flip ? -1 : 0;
    local(spr, artOffsetToWorld(0, 0), sy);
    if (!art) return;
    const sgn = fp.flip ? -1 : 1;
    const by = this.body.position.y;
    const place = (
      n: Node,
      pt: readonly [number, number] | undefined,
      fb: readonly [number, number],
      toCam: number,
    ) => {
      const p = pt ?? fb;
      local(n, artOffsetToWorld((p[0] - art.ox) * sgn + fo, p[1] - art.oy, toCam), by + sy);
    };
    const pts = art.pts ?? {};
    const top: readonly [number, number] = [art.ox, art.oy - art.rows.length];
    place(this.headTopN, pts.head_top, top, 0);
    const mid: readonly [number, number] = [art.ox, art.oy - Math.round(art.rows.length * 0.45)];
    place(this.handR, pts.hand_r, mid, HAND_TO_CAM);
    place(this.handL, pts.hand_l, mid, HAND_TO_CAM);
    if (this.racketN) place(this.racketN, pts.racket ?? pts.hand_r, mid, HAND_TO_CAM);

    // 发型（帽子每一帧都叠，手势帧的头顶不画帽子）和覆盖物：素材锚点对准身体帧的 head_top 像素
    const ht = pts.head_top ?? top;
    const hd = (ht[0] - art.ox) * sgn;
    const style = this.o.hairStyle && !(CAP_STYLES.has(this.o.hairStyle) && !this.capOn) ? this.o.hairStyle : 'short';
    const kid = this.sheet === KID;
    const lay = (sp: Sprite, oa: PixelArt | null) => {
      if (!oa || fp.name === 'fallFace' || fp.name === 'fallBack') {
        sp.visible = false;
        return;
      }
      sp.visible = true;
      sp.frame = this.bake(oa);
      sp.flipX = fp.flip;
      local(sp, artOffsetToWorld(hd, ht[1] - art.oy, 0.02), sy);
    };
    lay(this.hairSpr, overlayArt((kid ? KID_HAIR_OVERLAYS : HAIR_OVERLAYS)[style as HairStyle], fp.facing));
    for (const kd of ['towel', 'soot', 'mud'] as const) {
      const sp = this.overlays[kd];
      if (sp && this.ovOn[kd]) lay(sp, overlayArt((kid ? KID_BODY_OVERLAYS : BODY_OVERLAYS)[kd], fp.facing));
    }
  }
}
