// 占位：新资产还没画时，每个位置放一个冷灰的体块（明显是占位），大小 = docs/lab/2026-11-07-3d-pixel/clubcourts.md 的规格。
// 复用的资产（教练、球车、捡球篮、工具、工具架、长椅、水站、人、植物、围网）不用占位，直接是真的（reuse.ts、terrain.ts）。
// 本地原点 = 落地点（y 0 = 地面），+z 朝镜头（南），+x 朝东；尺寸米。
// 硬地场面（#1 hard-court：积沙、水洼）在白模里由 terrain.ts 平涂。
// #2～#5 是几个场景共用的资产（实现在 src/clubsite/assets/，这里的 assets/<id>.ts 一行 re-export 就换掉占位）。
import * as THREE from 'three';
import { SPECS as DESK_SPECS } from '../clubdesk/placeholders';
import type { AssetCtx } from './ctx';
import { DIM } from './layout';

/** 每个资产的大致外形（米）：w 宽（x）、d 深（z）、h 高；shape 决定占位的样子；n = 清单编号（标签里显示） */
export interface Spec {
  w: number;
  d: number;
  h: number;
  shape: string;
  crown?: number;
  n?: number;
  /** 中文短名（标签） */
  name?: string;
}

/** 新资产（这个场景要画的；共用的标了 clubsite）的规格；和 clubcourts.md 的清单一致 */
export const NEW_SPECS: Record<string, Spec> = {
  'hard-court': { w: 33, d: 16.6, h: 0.03, shape: 'box', n: 1, name: '硬地场面（积沙 + 水洼）' },
  'court-net': { w: 0.15, d: DIM.netLen, h: DIM.netPost, shape: 'net', n: 2, name: '球网（共用）' },
  'court-umbrella': { w: 2.4, d: 2.4, h: 2.55, shape: 'umbrella', n: 3, name: '场边遮阳伞（共用）' },
  scoreboard: { w: 1.9, d: 0.35, h: 2.2, shape: 'scoreboard', n: 4, name: '翻牌记分牌（共用）' },
  'court-light': { w: 1.0, d: 0.5, h: 8.8, shape: 'pole', n: 5, name: '灯杆（共用）' },
  'ball-machine': { w: 0.62, d: 0.85, h: 0.95, shape: 'machine', n: 6, name: '发球机' },
  'mist-line': { w: 9.6, d: 0.3, h: 2.6, shape: 'mist', n: 7, name: '喷雾管' },
  'court-sail': { w: 4.2, d: 2.6, h: 3.3, shape: 'sail', n: 8, name: '场边遮阳帆' },
  squeegee: { w: 0.9, d: 0.3, h: 1.5, shape: 'squeegee', n: 9, name: '刮水板' },
  'drill-kit': { w: 1.2, d: 1.2, h: 0.3, shape: 'drill', n: 10, name: '训练标志（锥 / 圈 / 地标点）' },
  'tennis-ball': { w: 0.2, d: 0.2, h: 0.2, shape: 'ball', n: 11, name: '网球（地上的）' },
  'kit-bag': { w: 0.95, d: 0.32, h: 0.32, shape: 'bag', n: 12, name: '球包（共用，clubclay #8）' },
};

export const SPECS: Record<string, Spec> = {
  ...(DESK_SPECS as Record<string, Spec>),
  ...NEW_SPECS,
  'ball-cart': { w: 0.6, d: 0.6, h: 1.45, shape: 'box' },
  'ball-hopper': { w: 0.55, d: 0.55, h: 0.95, shape: 'box' },
  'tool-rack': { w: 2.4, d: 0.9, h: 2.2, shape: 'box' },
  tool: { w: 0.6, d: 1.4, h: 0.4, shape: 'box' },
};

export function placeholder(ctx: AssetCtx, asset: string): THREE.Object3D {
  const sp = SPECS[asset] ?? { w: 1, d: 1, h: 1, shape: 'box' };
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
      // 沿 z 的一道网（场地东西向 → 网南北向，yaw 0 下侧对镜头：一条竖的网带 + 两根网柱）
      const len = sp.d - 0.6;
      box(0.08, DIM.netMid - 0.12, len, 0, 0.05, 0);
      box(0.12, 0.12, len, 0, DIM.netMid - 0.12, 0);
      for (const s of [-1, 1]) box(0.24, DIM.netPost, 0.24, 0, 0, (s * sp.d) / 2 - s * 0.12);
      break;
    }
    case 'umbrella': {
      box(0.5, 0.12, 0.5);
      box(0.08, sp.h - 0.1, 0.08);
      mesh(new THREE.ConeGeometry(sp.w / 2, 0.55, 8).rotateY(Math.PI / 8), 0, sp.h - 0.35, 0);
      box(0.1, 0.18, 0.1, 0, sp.h - 0.08, 0);
      break;
    }
    case 'scoreboard': {
      for (const x of [-sp.w / 2 + 0.12, sp.w / 2 - 0.12]) box(0.12, sp.h, 0.12, x, 0, -0.06);
      box(sp.w, 1.2, 0.14, 0, 0.9, 0);
      box(sp.w - 0.2, 0.22, 0.04, 0, 1.86, 0.09);
      for (let r = 0; r < 2; r++)
        for (let c = 0; c < 4; c++) box(0.3, 0.36, 0.04, -0.6 + c * 0.4, 1.0 + r * 0.42, 0.09);
      break;
    }
    case 'pole':
      box(0.22, sp.h - 0.3, 0.22);
      box(sp.w, 0.3, sp.d, 0, sp.h - 0.3, 0);
      break;
    case 'bag':
      mesh(new THREE.CylinderGeometry(sp.h / 2, sp.h / 2, sp.w, 10).rotateZ(Math.PI / 2), 0, sp.h / 2, 0);
      break;
    case 'machine': {
      // 发球机：出球口朝本地 +z（rotY 转向要打的方向）；两只小轮在后、一根拉杆；顶上一个敞口的球斗
      box(0.56, 0.42, 0.7, 0, 0.12, 0);
      box(0.62, 0.36, 0.62, 0, 0.54, -0.05);
      mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.24, 8).rotateX(Math.PI / 2), 0, 0.36, 0.44);
      for (const s of [-1, 1])
        mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.06, 10).rotateZ(Math.PI / 2), s * 0.3, 0.12, -0.24);
      box(0.04, 0.6, 0.04, 0, 0.5, -0.42);
      break;
    }
    case 'mist': {
      // 喷雾管：挂在围网顶杆下面（本地 z 0 = 围网的布面，管在 +z 一侧 0.1 米），沿 x，每 1.2 米一个喷头往南下吹出一小团雾
      const y = sp.h - 0.2;
      box(sp.w, 0.08, 0.08, 0, y, 0.12);
      const n = Math.round(sp.w / 1.2);
      for (let i = 0; i <= n; i++) {
        const x = -sp.w / 2 + (i * sp.w) / n;
        box(0.06, 0.1, 0.12, x, y - 0.1, 0.2);
        // 雾团（占位：一个往前下斜的小锥）
        const c = mesh(new THREE.ConeGeometry(0.22, 0.7, 6), x, y - 0.45, 0.45);
        c.rotation.x = -0.6;
      }
      break;
    }
    case 'sail': {
      // 遮阳帆：后两根杆贴着围网（本地 −z）、前两根矮一点 → 帆面往南（镜头）斜下；帆面是一块薄板
      const hw = sp.w / 2;
      const hd = sp.d / 2;
      for (const [x, z, h] of [
        [-hw, -hd, sp.h],
        [hw, -hd, sp.h],
        [-hw, hd, sp.h - 0.7],
        [hw, hd, sp.h - 0.7],
      ])
        box(0.12, h, 0.12, x, 0, z);
      const plane = mesh(new THREE.BoxGeometry(sp.w - 0.3, 0.05, sp.d), 0, sp.h - 0.45, 0);
      plane.rotation.x = Math.atan2(0.7, sp.d);
      break;
    }
    case 'squeegee': {
      // 刮水板靠在围网上：0.9 米宽的橡胶刮头（沿 x，落地）+ 1.5 米的柄往北斜靠到围网上
      box(sp.w, 0.12, 0.1, 0, 0, 0.12);
      const h = box(0.06, 1.5, 0.06, 0, 0, 0);
      h.rotation.x = -0.25;
      break;
    }
    case 'drill': {
      if (ctx.variant === 1) {
        // 呼啦圈目标（平放）
        mesh(new THREE.TorusGeometry(0.45, 0.04, 4, 16).rotateX(Math.PI / 2), 0, 0.03, 0);
      } else if (ctx.variant === 2) {
        // 一排四个地标点（孩子排队站的位置）
        for (let i = 0; i < 4; i++) mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.02, 10), -1.35 + i * 0.9, 0.01, 0);
      } else {
        // 三个锥（目标）
        for (const [x, z] of [
          [-0.45, 0],
          [0, -0.3],
          [0.45, 0],
        ])
          mesh(new THREE.ConeGeometry(0.11, 0.26, 8), x, 0.13, z);
      }
      break;
    }
    case 'ball': {
      // 球用真的荧光黄（白模里也要看得出"球在哪"：视线的一部分），不接投影
      const o = mesh(new THREE.SphereGeometry(sp.w / 2, 8, 6), 0, sp.w / 2, 0);
      o.material = ctx.mat('ball', { noShadowReceive: true });
      break;
    }
    case 'column':
      mesh(new THREE.CylinderGeometry(sp.w * 0.45, sp.w * 0.5, sp.h, 10), 0, sp.h / 2);
      break;
    default:
      box(sp.w, sp.h, sp.d);
  }
  ctx.mats.prepare(g);
  return g;
}
