// 喷泉两件资产之间的"连线"：palm-fountain（池子、水面 shader）和 fountain-spray（溢流帘、水柱）是两个 SLOT，
// 但水量（flow）和水面上的落叶（leaves）是同一件事：水量小了，帘子、水柱、涟漪一起变小；叶子多了，水面变暗、闪光变少。
// 按场景的 SharedUniforms 对象分组（同一个场景里两件资产拿到的是同一份 ctx.uniforms），不同场景 / 画廊各管各的。
import type * as THREE from 'three';
import type { SharedUniforms } from '../../ctx';

export interface FountainLink {
  /** 水量 0..1（1 = 正常；0 = 关水：帘子、水柱、涟漪都没了，水面只剩闪光） */
  uFlow: THREE.IUniform<number>;
  /** 水面上的落叶片数（≥ 3 水面变暗、闪光变少；5 片封顶） */
  uLeaves: THREE.IUniform<number>;
}

const LINKS = new WeakMap<object, FountainLink>();

export function fountainLink(u: SharedUniforms): FountainLink {
  let l = LINKS.get(u);
  if (!l) {
    l = { uFlow: { value: 1 }, uLeaves: { value: 0 } };
    LINKS.set(u, l);
  }
  return l;
}

/** 两件资产的 userData 上都挂这两个函数（改的是同一份 link） */
export function linkApi(l: FountainLink) {
  return {
    /** 水量 0..1 */
    setFlow(f: number) {
      l.uFlow.value = Math.min(1, Math.max(0, f));
    },
    /** 水面上的落叶片数（palm-litter 由别的代理画；玩法层数一下水里有几片，调这个） */
    setLeaves(n: number) {
      l.uLeaves.value = Math.max(0, n);
    },
    get flow() {
      return l.uFlow.value;
    },
    get leaves() {
      return l.uLeaves.value;
    },
  };
}
