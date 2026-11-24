// 演员池：离镜头近的人才给一具 Q 版人（clubsite/people 的 player / kid / ball-kid，按演员表的 look 换装），远了收回来给别人用。
// - 上限 CAP 具（画面 + 一圈余量里最多也就几十个人）；新建一具 ~1–3 毫秒、换装 ~1 毫秒，每帧按预算建 / 换。
// - 收回来的身子留着衣服：同一个人又走回画面时不用再换装。
// 看全图（远景）时不用身子，每个人一根彩色小柱（按衣服的颜色，InstancedMesh，一种颜色一批）。
import * as THREE from 'three';
import { CLOTH } from '../../clubsite/cast/colors';
import type { CastLook, CastPerson } from '../../clubsite/cast/types';
import type { BodyKind } from './pose';

export interface Dresser {
  dress(obj: THREE.Object3D, look: CastLook): void;
}

export const CAP = 90;

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

  /** 给这个人一具身子；没有预算 / 到上限 = null（下一帧再试） */
  acquire(id: string, p: CastPerson | undefined, kind: BodyKind, force = false): Body | null {
    // 先找穿着他的衣服、空着的
    let b = this.all.find((q) => !q.user && q.dressed === id && q.kind === kind) ?? null;
    if (!b) {
      if (this.budget <= 0 && !force) return null;
      b = this.all.find((q) => !q.user && q.kind === kind) ?? null;
      if (!b) {
        if (this.all.length >= CAP + 12) return null;
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
      if (p && b.dressed !== id) {
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
    }
    b.user = id;
    b.obj.userData.castId = p?.id ?? id;
    return b;
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

// ── 远景的小柱 ──────────────────────────────────────────────────────────────────

/** 柱子比真人大（远景里一个人只有两三个纹素，放大才看得见）：宽 × 高（米） */
const PAWN = { w: 2.8, h: 5.6 };
const PAWN_N = 600;

export class Pawns {
  private groups = new Map<string, THREE.InstancedMesh>();
  private root = new THREE.Group();
  private geo = new THREE.BoxGeometry(PAWN.w, PAWN.h, PAWN.w).translate(0, PAWN.h / 2, 0);
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private s = new THREE.Vector3(1, 1, 1);
  private p = new THREE.Vector3();

  constructor(
    scene: THREE.Scene,
    /** 衣服色 → 材质（walk.ts 给：CLOTH 的三档 + 人物的明暗参数） */
    private matFor: (cloth: string) => THREE.Material,
  ) {
    this.root.name = 'sim:pawns';
    this.root.visible = false;
    scene.add(this.root);
  }

  set visible(v: boolean) {
    this.root.visible = v;
  }

  begin() {
    for (const g of this.groups.values()) g.count = 0;
  }

  /** 一根柱：颜色按衣服（look.accent ?? shirt 的中档） */
  add(look: CastLook | undefined, x: number, y: number, z: number, scale = 1) {
    const cloth = look ? (look.accent ?? look.shirt) : 'white';
    let g = this.groups.get(cloth);
    if (!g) {
      g = new THREE.InstancedMesh(this.geo, this.matFor(cloth in CLOTH ? cloth : 'white'), PAWN_N);
      g.count = 0;
      g.frustumCulled = false;
      g.castShadow = true;
      g.name = `sim:pawn:${cloth}`;
      this.groups.set(cloth, g);
      this.root.add(g);
    }
    if (g.count >= PAWN_N) return;
    this.p.set(x, y, z);
    this.s.set(scale, scale, scale);
    this.m.compose(this.p, this.q, this.s);
    g.setMatrixAt(g.count++, this.m);
  }

  end() {
    for (const g of this.groups.values()) g.instanceMatrix.needsUpdate = true;
  }
}
