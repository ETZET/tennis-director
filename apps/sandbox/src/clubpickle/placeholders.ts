// 占位：新资产还没画时，每个位置放一个冷灰的体块（明显是占位），大小 = docs/lab/2026-11-07-3d-pixel/clubpickle.md 的规格。
// 复用的资产（人、长椅、捡球篮、clubdesk 的水站 / 凉棚 / 围网……）不用占位，直接是真的（reuse.ts）。
// 本地原点 = 落地点（y 0 = 地面），+z 朝镜头（南），+x 朝东；尺寸米。
// 人手里的道具（匹克球拍 paddle、捡球管 tube、绞盘摇把 crank）和新姿势（sit、crank、dink）是人物骨骼的活，
// 白模里球员先拿网球拍、观众先站着，清单见 clubpickle.md #7、#8。
import * as THREE from 'three';
import { SPECS as DESK_SPECS, type Spec as DeskSpec } from '../clubdesk/placeholders';
import type { AssetCtx } from './ctx';
import { PK } from './layout';

/** 每个资产的大致外形（米）：w 宽（x）、d 深（z）、h 高；shape 决定占位的样子；n = 清单编号（标签里显示） */
export interface Spec {
  w: number;
  d: number;
  h: number;
  shape: DeskSpec['shape'] | 'net' | 'rack' | 'umbrella' | 'scoreboard' | 'ball';
  crown?: number;
  n?: number;
  /** 中文短名（标签） */
  name?: string;
}

/** 网柱之间的距离（边线外各 0.3） */
const NET_SPAN = PK.W + PK.postOut * 2;

/** 新资产（这个场景要从零画的）的规格；和 clubpickle.md 的清单一致 */
export const NEW_SPECS: Record<string, Spec> = {
  'pickle-net': { w: 0.2, d: NET_SPAN + 0.2, h: PK.postH, shape: 'net', n: 1, name: '匹克球网' },
  'paddle-rack': { w: 1.3, d: 0.32, h: 1.05, shape: 'rack', n: 2, name: '拍架（挂拍排队）' },
  'shade-umbrella': { w: 2.1, d: 2.1, h: 2.4, shape: 'umbrella', n: 3, name: '遮阳伞' },
  'flip-scoreboard': { w: 1.1, d: 0.35, h: 1.45, shape: 'scoreboard', n: 4, name: '翻牌记分牌' },
  'gear-box': { w: 0.8, d: 0.5, h: 0.75, shape: 'box', n: 5, name: '器材箱' },
  pickleball: { w: 0.18, d: 0.18, h: 0.18, shape: 'ball', n: 6, name: '匹克球' },
};

export const SPECS: Record<string, Spec> = {
  ...(DESK_SPECS as Record<string, Spec>),
  ...NEW_SPECS,
  'water-station': { w: 0.8, d: 0.6, h: 1.45, shape: 'column' },
  'ball-hopper': { w: 0.55, d: 0.55, h: 0.95, shape: 'box' },
};

export function placeholder(ctx: AssetCtx, asset: string): THREE.Object3D {
  const sp = SPECS[asset] ?? { w: 1, d: 1, h: 1, shape: 'box' as const };
  const m = ctx.mat('placeholder');
  const g = new THREE.Group();
  const box = (w: number, h: number, d: number, x = 0, y = 0, z = 0) => {
    const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    o.position.set(x, y + h / 2, z);
    g.add(o);
    return o;
  };
  const mesh = (geo: THREE.BufferGeometry, x = 0, y = 0, z = 0) => {
    const o = new THREE.Mesh(geo, m);
    o.position.set(x, y, z);
    g.add(o);
    return o;
  };
  switch (sp.shape) {
    case 'net': {
      // 网沿 z（场地东西向，网南北走）：两根胖网柱（0.2 见方、0.914 高）+ 网身（中间 0.86；v1 = 松了，中间垂到 0.6）+ 中间一条竖的中心带
      const slack = ctx.variant === 1;
      const half = NET_SPAN / 2;
      for (const z of [-half, half]) box(0.2, PK.postH, 0.2, 0, 0, z);
      // 绞盘（只在南柱上：一个胖方块 + 伸出来的摇把）
      box(0.22, 0.2, 0.22, 0, 0.45, half - 0.05);
      box(0.06, 0.06, 0.3, 0.14, 0.5, half + 0.12);
      const n = 8;
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n;
        const zc = -half + 0.1 + t * (NET_SPAN - 0.2);
        const k = 1 - (2 * t - 1) ** 2; // 中间 1、两头 0
        const top = PK.postH - 0.04 - k * (PK.postH - (slack ? 0.6 : PK.netH));
        box(0.08, top - 0.1, (NET_SPAN - 0.2) / n + 0.01, 0, 0.1, zc);
      }
      box(0.1, slack ? 0.55 : PK.netH - 0.1, 0.12, 0, 0.05, 0);
      break;
    }
    case 'rack': {
      // 拍架：两根立柱 + 一块横板（开槽）+ 底座；槽里竖着插 6 把拍子（拍面朝镜头，0.2 × 0.4）
      for (const x of [-sp.w / 2 + 0.05, sp.w / 2 - 0.05]) box(0.08, sp.h, 0.08, x, 0, 0);
      box(sp.w, 0.08, sp.d, 0, 0.0, 0);
      box(sp.w, 0.12, sp.d * 0.7, 0, 0.62, 0);
      for (let i = 0; i < 6; i++) {
        const x = -sp.w / 2 + 0.2 + i * ((sp.w - 0.4) / 5);
        box(0.2, 0.26, 0.03, x, 0.74, 0.02);
        box(0.05, 0.14, 0.05, x, 0.6, 0.02);
      }
      break;
    }
    case 'umbrella': {
      // 遮阳伞：配重底座 + 杆 + 往北（朝太阳）斜 9° 的八角伞面（影子往回收到长椅和观众身上，少落到 2 号场上）
      box(0.5, 0.12, 0.5);
      const tilt = 0.15;
      const pole = new THREE.Group();
      pole.rotation.x = -tilt;
      g.add(pole);
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, sp.h - 0.2, 6), m);
      p.position.y = (sp.h - 0.2) / 2;
      pole.add(p);
      const cone = new THREE.Mesh(new THREE.ConeGeometry(sp.w / 2, 0.45, 8, 1, true), m);
      cone.position.y = sp.h - 0.3;
      cone.material = m;
      pole.add(cone);
      const under = new THREE.Mesh(new THREE.CircleGeometry(sp.w / 2, 8).rotateX(Math.PI / 2), m);
      under.position.y = sp.h - 0.52;
      pole.add(under);
      break;
    }
    case 'scoreboard': {
      // 翻牌记分牌：两条腿 + 一块板（朝镜头）+ 三张翻牌（匹克球双打报三个数：4-2-1）
      for (const x of [-sp.w / 2 + 0.08, sp.w / 2 - 0.08]) box(0.08, sp.h, 0.08, x, 0, -0.05);
      box(sp.w, 0.62, 0.1, 0, sp.h - 0.66, 0);
      for (const x of [-0.34, 0, 0.34]) box(0.26, 0.42, 0.06, x, sp.h - 0.58, 0.08);
      box(sp.w * 0.8, 0.06, 0.25, 0, 0.35, 0);
      break;
    }
    case 'ball':
      mesh(new THREE.SphereGeometry(sp.w / 2, 10, 6));
      break;
    case 'column':
      mesh(new THREE.CylinderGeometry(sp.w * 0.45, sp.w * 0.5, sp.h, 10), 0, sp.h / 2);
      break;
    case 'person':
      mesh(new THREE.CapsuleGeometry(sp.w * 0.4, sp.h - sp.w * 0.8, 4, 8), 0, sp.h / 2);
      break;
    default:
      box(sp.w, sp.h, sp.d);
  }
  ctx.mats.prepare(g);
  return g;
}
