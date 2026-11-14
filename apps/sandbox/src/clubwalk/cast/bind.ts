// 绑定：把场景里的 Q 版人对上演员表（每 0.5 秒扫一次已建好、看得见的区域，不每帧 traverse）。
// - 人 = 区域 root 里 userData.pose && userData.setProp 的对象（跳过总监）。
// - key = 名字去掉 'slot:'；没有 slot: 前缀的按 traverse 顺序编号 '#0'、'#1'…（含藏着的；BRIEF 的约定）。
// - CAST.who(scene, key, kind, day) → 人；obj.userData.castId = id；第一次或 id 变了 → 排队换装（每步最多花 BUDGET 毫秒，
//   区域刚建好时一个区域分几帧换完，走路不卡）。
// - 换天：清掉所有对象的 castId，下一次扫描重新选角、重新换装（只换 id 变了的）。
import * as THREE from 'three';
import type { CastLook, CastPerson, PersonKind, SceneId } from '../../clubsite/cast/types';

/** clubwalk 的 Live 只用到这几个字段 */
export interface LiveLike {
  /** rects：区域的范围（"走过去"找画面外的人时往那儿走） */
  def: { id: string; name: string; rects?: readonly { x0: number; x1: number; z0: number; z1: number }[] };
  root: THREE.Object3D;
  visible: boolean;
  region: unknown;
}

export interface Bound {
  obj: THREE.Object3D;
  id: string;
  scene: SceneId;
  slot: string;
  kind: PersonKind;
  /** 扫描那一刻离总监多远（平方，米²） */
  d2: number;
}

const wp = new THREE.Vector3();

export interface Dresser {
  dress(obj: THREE.Object3D, look: CastLook): void;
}

/** 每个模拟步最多花多少毫秒换装 */
const BUDGET = 6;

export class Binder {
  /** 看得见的人（每次扫描重建） */
  bound: Bound[] = [];
  private byId = new Map<string, Bound>();
  private queue: { obj: THREE.Object3D; p: CastPerson }[] = [];
  private day = -1;
  private t = 0;

  constructor(
    private lives: readonly LiveLike[],
    private director: THREE.Object3D,
    private who: (scene: SceneId, slot: string, kind: PersonKind, day: number) => CastPerson,
    private dresser: Dresser | null,
  ) {}

  /** 这个人现在在场景里的对象（看得见的） */
  objOf(id: string): Bound | undefined {
    return this.byId.get(id);
  }

  /** 每个模拟步调；到点扫描，再按预算换装 */
  step(dt: number, day: number, force = false) {
    if (day !== this.day) {
      this.day = day;
      force = true;
      for (const L of this.lives) if (L.region) L.root.traverse((o) => delete o.userData.castId);
    }
    this.t -= dt;
    if (this.t <= 0 || force) {
      this.t = 0.5;
      this.scan();
    }
    this.drain();
  }

  private scan() {
    const bound: Bound[] = [];
    const byId = new Map<string, Bound>();
    const dPos = this.director.position;
    for (const L of this.lives) {
      if (!L.region || !L.visible) continue;
      const scene = L.def.id as SceneId;
      let n = 0;
      const visit = (o: THREE.Object3D, vis: boolean) => {
        const ud = o.userData;
        if (ud.pose && ud.setProp) {
          const raw = o.name || '';
          const slot = raw.startsWith('slot:') ? raw.slice(5) : `#${n++}`;
          const kind = (ud.personKind as PersonKind | undefined) ?? 'player';
          if (o === this.director || kind === 'director') return;
          if (!(vis && o.visible)) return;
          let id = ud.castId as string | undefined;
          if (!id) {
            const p = this.who(scene, slot, kind, this.day);
            id = p.id;
            ud.castId = id;
            if (ud.castDressed !== id) this.queue.push({ obj: o, p });
          }
          const d2 = o.getWorldPosition(wp).distanceToSquared(dPos);
          const b: Bound = { obj: o, id, scene, slot, kind, d2 };
          bound.push(b);
          const prev = byId.get(id);
          // 同一个人在两处都有对象（相邻区域）：取离总监近的
          if (!prev || prev.d2 > d2) byId.set(id, b);
          return; // 人里面不会再套人
        }
        const v = vis && o.visible;
        for (const c of o.children) visit(c, v);
      };
      visit(L.root, true);
    }
    this.bound = bound;
    this.byId = byId;
  }

  private drain() {
    if (!this.queue.length) return;
    const t0 = performance.now();
    while (this.queue.length && performance.now() - t0 < BUDGET) {
      const { obj, p } = this.queue.shift() as { obj: THREE.Object3D; p: CastPerson };
      if (obj.userData.castId !== p.id) continue; // 换过人了（换天）
      try {
        this.dresser?.dress(obj, p.look);
      } catch (e) {
        console.warn('[cast] dress failed', p.id, e);
      }
      obj.userData.castDressed = p.id;
    }
  }

  /** 还没换完的（调试） */
  pending() {
    return this.queue.length;
  }
}

/** 头顶高度（米，按种类）：孩子矮、少年矮一点 */
export function headHeight(kind: PersonKind): number {
  return kind === 'kid' ? 1.25 : kind === 'ball-kid' ? 1.55 : 1.85;
}
