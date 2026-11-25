// 演员池：离镜头近的人才给一具 Q 版人（clubsite/people 的 player / kid / ball-kid，按演员表的 look 换装），远了收回来给别人用。
// - 上限 CAP 具（画面 + 一圈余量里最多也就几十个人）；新建一具 ~1–3 毫秒、换装 ~1 毫秒，每帧按预算建 / 换。
// - 收回来的身子留着衣服：同一个人又走回画面时不用再换装。
// 看全图（远景）时不用身子，每个人一个贴地的彩色圆点（按在干什么上色，见 Dots）。
import * as THREE from 'three';
import type { CastLook, CastPerson } from '../../clubsite/cast/types';
import type { BodyKind } from './pose';

export interface Dresser {
  dress(obj: THREE.Object3D, look: CastLook): void;
}

/** 最多几具身子同时在画面上（第 2 轮：90 → 110，周末看台坐得满一点；坐着的人隔帧摆姿势，省出来的时间够） */
export const CAP = 110;
/**
 * 池子最多建几具（三种身子加起来；不用的藏着，不画不摆）：比 CAP 多一截，大人、孩子、少年各自够用
 * （第 2 轮：池子只比 CAP 多 12，大人那种先建满了，周末看台上的大人最多 98 个）
 */
export const POOL_MAX = CAP + 30;

export interface Body {
  obj: THREE.Object3D;
  kind: BodyKind;
  /** 现在穿的是谁的衣服 */
  dressed: string | null;
  /** 正在给谁用（null = 空着） */
  user: string | null;
  /** 现在的道具、座（变了才调 setProp / setSeat） */
  prop: string | null | undefined;
  seat: string;
}

export const bodyKindOf = (p: CastPerson | undefined): BodyKind =>
  p?.look.body === 'kid' ? 'kid' : p?.look.body === 'teen' ? 'teen' : 'adult';

export class BodyPool {
  readonly all: Body[] = [];
  /** 这一帧还能花多少毫秒建 / 换装 */
  private budget = 0;
  stats = { made: 0, dressed: 0, ms: 0 };

  constructor(
    private scene: THREE.Scene,
    private make: (k: BodyKind) => THREE.Object3D,
    private dresser: Dresser | null,
  ) {}

  /** 每帧开头：给预算（毫秒） */
  frame(ms: number) {
    this.budget = ms;
  }

  used() {
    let n = 0;
    for (const b of this.all) if (b.user) n++;
    return n;
  }

  /**
   * 给这个人一具身子；没有预算 / 到上限 = null（下一帧再试）。
   * dress = false：先不换装（快进时路上一晃而过的人，换装比他在画面里待的还久）；停下来以后 redress 补上
   */
  acquire(id: string, p: CastPerson | undefined, kind: BodyKind, force = false, dress = true): Body | null {
    // 先找穿着他的衣服、空着的
    let b = this.all.find((q) => !q.user && q.dressed === id && q.kind === kind) ?? null;
    if (!b) {
      if (this.budget <= 0 && !force) return null;
      b = this.all.find((q) => !q.user && q.kind === kind) ?? null;
      if (!b) {
        if (this.all.length >= POOL_MAX) return null;
        const t0 = performance.now();
        const obj = this.make(kind);
        obj.name = 'sim:actor';
        obj.visible = false;
        obj.userData.simActor = true;
        this.scene.add(obj);
        b = { obj, kind, dressed: null, user: null, prop: undefined, seat: '' };
        this.all.push(b);
        this.stats.made++;
        const dt = performance.now() - t0;
        this.budget -= dt;
        this.stats.ms += dt;
      }
      if (dress) this.dressOn(b, id, p);
    }
    b.user = id;
    b.obj.userData.castId = p?.id ?? id;
    return b;
  }

  /** 身子穿的不是他的衣服（快进时先借来用的）：有预算就换上；换了 / 本来就对 = true */
  redress(b: Body, id: string, p: CastPerson | undefined): boolean {
    if (b.dressed === id || !p) return true;
    if (this.budget <= 0) return false;
    this.dressOn(b, id, p);
    return true;
  }

  private dressOn(b: Body, id: string, p: CastPerson | undefined) {
    if (!p || b.dressed === id) return;
    const t0 = performance.now();
    try {
      this.dresser?.dress(b.obj, p.look);
    } catch (e) {
      console.warn('[sim] dress failed', id, e);
    }
    const dt = performance.now() - t0;
    this.budget -= dt;
    this.stats.ms += dt;
    this.stats.dressed++;
    b.dressed = id;
  }

  /**
   * 预建（观察一打开，分几帧做）：每种身子先建到 want 具藏着（建一具 1–3 毫秒：别等午饭、表演赛人一多时当场建、一帧卡几十毫秒）。
   * 这一帧最多花 ms 毫秒；都建好了 = true
   */
  prebuild(want: Readonly<Record<BodyKind, number>>, ms: number): boolean {
    const t0 = performance.now();
    for (const kind of Object.keys(want) as BodyKind[]) {
      let have = 0;
      for (const b of this.all) if (b.kind === kind) have++;
      while (have < want[kind]) {
        if (performance.now() - t0 > ms || this.all.length >= POOL_MAX) return this.all.length >= POOL_MAX;
        const obj = this.make(kind);
        obj.name = 'sim:actor';
        obj.visible = false;
        obj.userData.simActor = true;
        // 每具身子第一次坐下、吃、做饭时要建自己的小东西（一口吃的、左手的杯子、锅铲，clubsite/people 的 extra）：
        // 一具 10–20 毫秒，午饭时几十个人一起坐下就是一帧卡一下 —— 建身子的时候先摆一遍，再站回来
        const ud = obj.userData;
        ud.setSeat?.(0.52);
        ud.pose?.('sit', 0.3);
        ud.pose?.('eat', 0.3);
        ud.pose?.('eat', 0.86);
        ud.setSeat?.(null);
        ud.pose?.('cook', 0.4);
        ud.pose?.('idle', 0);
        this.scene.add(obj);
        this.all.push({ obj, kind, dressed: null, user: null, prop: undefined, seat: '' });
        this.stats.made++;
        have++;
      }
    }
    return true;
  }

  release(b: Body) {
    b.user = null;
    b.obj.visible = false;
    b.obj.userData.lookAt?.(null);
  }

  releaseAll() {
    for (const b of this.all) if (b.user) this.release(b);
  }

  /** 关掉观察：身子都藏起来（留着，下次打开直接用） */
  hideAll() {
    for (const b of this.all) {
      b.user = null;
      b.obj.visible = false;
    }
  }
}

// ── 看全图的人点 ────────────────────────────────────────────────────────────────

/**
 * 看全图时每个人一个贴地的圆点（第 2 轮评审：一根根彩色柱子挤在一起像柱状图，看不出谁在干什么）：
 * 直径 DOT.d 米、高 DOT.h 米（矮矮的一块：描边按深度差画得出来），颜色按在干什么（mount.ts 的 dotColor），不打光（夜里也看得清）。
 * 一个 InstancedMesh（每个点自己的颜色），最多 DOT_N 个
 */
const DOT = { d: 3, h: 0.8 };
const DOT_N = 900;

export class Dots {
  private mesh: THREE.InstancedMesh;
  private m = new THREE.Matrix4();
  private c = new THREE.Color();
  private n = 0;

  constructor(scene: THREE.Scene) {
    const geo = new THREE.CylinderGeometry(DOT.d / 2, DOT.d / 2, DOT.h, 10).translate(0, DOT.h / 2 + 0.05, 0);
    this.mesh = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color: 0xffffff }), DOT_N);
    this.mesh.name = 'sim:dots';
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    // 每个点一种颜色：先填一遍白的（instanceColor 建出来）
    for (let i = 0; i < DOT_N; i++) this.mesh.setColorAt(i, this.c.set(0xffffff));
    scene.add(this.mesh);
  }

  set visible(v: boolean) {
    this.mesh.visible = v;
  }

  begin() {
    this.n = 0;
  }

  /** 一个点：在 (x, y, z)，颜色 color（0xRRGGBB），scale 缩放（孩子小一点） */
  add(x: number, y: number, z: number, color: number, scale = 1) {
    if (this.n >= DOT_N) return;
    this.m.makeScale(scale, 1, scale).setPosition(x, y, z);
    this.mesh.setMatrixAt(this.n, this.m);
    this.mesh.setColorAt(this.n, this.c.setHex(color));
    this.n++;
  }

  end() {
    this.mesh.count = this.n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}
