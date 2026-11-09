// 占位：新资产还没画时，每个位置放一个冷灰的体块（明显是占位），大小 = docs/lab/2026-11-07-3d-pixel/clubclay.md 的规格。
// 复用的资产（裁判椅、长椅、水站、人、植物、工具架、围网）不用占位，直接是真的（reuse.ts、terrain.ts）。
// 本地原点 = 落地点（y 0 = 地面），+z 朝镜头（南），+x 朝东；尺寸米。
// 红土场面（#1 clay-court）在白模里由 terrain.ts 平涂（底色 + 状态区块 + 胶带线），水管（#7 的一部分）也在 terrain.ts 里画。
import * as THREE from 'three';
import { SPECS as DESK_SPECS, type Spec as DeskSpec } from '../clubdesk/placeholders';
import { DIM } from './layout';
import type { AssetCtx } from './world';

/** 每个资产的大致外形（米）：w 宽（x）、d 深（z）、h 高；shape 决定占位的样子；n = 清单编号（标签里显示） */
export interface Spec {
  w: number;
  d: number;
  h: number;
  shape: DeskSpec['shape'] | 'net' | 'umbrella' | 'scoreboard' | 'mat' | 'brush' | 'reel' | 'bag' | 'pole';
  crown?: number;
  n?: number;
  /** 中文短名（标签） */
  name?: string;
}

/** 新资产（这个场景要从零画的）的规格；和 clubclay.md 的清单一致 */
export const NEW_SPECS: Record<string, Spec> = {
  'clay-court': { w: 33, d: 16.6, h: 0.03, shape: 'box', n: 1, name: '红土场面（状态 + 胶带线）' },
  'court-net': { w: 0.15, d: DIM.netLen, h: DIM.netPost, shape: 'net', n: 2, name: '球网' },
  'court-umbrella': { w: 2.4, d: 2.4, h: 2.55, shape: 'umbrella', n: 3, name: '场边遮阳伞' },
  scoreboard: { w: 1.9, d: 0.35, h: 2.2, shape: 'scoreboard', n: 4, name: '翻牌记分牌' },
  'drag-mat': { w: 1.2, d: 2.4, h: 0.9, shape: 'mat', n: 5, name: '拖垫（拖场）' },
  'line-brush': { w: 0.6, d: 1.5, h: 0.2, shape: 'brush', n: 6, name: '扫线刷' },
  'hose-reel': { w: 0.8, d: 0.6, h: 0.95, shape: 'reel', n: 7, name: '水管卷盘 + 水管' },
  'kit-bag': { w: 0.95, d: 0.32, h: 0.32, shape: 'bag', n: 8, name: '球包' },
  'court-light': { w: 1.0, d: 0.5, h: 8.8, shape: 'pole', n: 9, name: '灯杆' },
};

export const SPECS: Record<string, Spec> = {
  ...(DESK_SPECS as Record<string, Spec>),
  ...NEW_SPECS,
  'umpire-chair': { w: 1.0, d: 1.0, h: 2.3, shape: 'box' },
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
      // 沿 z 的一道网（场地东西向 → 网南北向，yaw 0 下侧对镜头：一条竖的网带 + 两根网柱）
      const len = sp.d - 0.6;
      box(0.08, DIM.netMid - 0.12, len, 0, 0.05, 0);
      box(0.12, 0.12, len, 0, DIM.netMid - 0.12, 0);
      for (const s of [-1, 1]) box(0.24, DIM.netPost, 0.24, 0, 0, (s * sp.d) / 2 - s * 0.12);
      break;
    }
    case 'umbrella': {
      // 伞杆 + 底座 + 八角伞面（往下斜的扁锥）+ 顶尖；伞面中心在杆上
      box(0.5, 0.12, 0.5);
      box(0.08, sp.h - 0.1, 0.08);
      mesh(new THREE.ConeGeometry(sp.w / 2, 0.55, 8).rotateY(Math.PI / 8), 0, sp.h - 0.35, 0);
      box(0.1, 0.18, 0.1, 0, sp.h - 0.08, 0);
      break;
    }
    case 'scoreboard': {
      // 两根腿 + 一块朝南的牌（上面一条名牌、两行翻牌）
      for (const x of [-sp.w / 2 + 0.12, sp.w / 2 - 0.12]) box(0.12, sp.h, 0.12, x, 0, -0.06);
      box(sp.w, 1.2, 0.14, 0, 0.9, 0);
      box(sp.w - 0.2, 0.22, 0.04, 0, 1.86, 0.09);
      for (let r = 0; r < 2; r++)
        for (let c = 0; c < 4; c++) box(0.3, 0.36, 0.04, -0.6 + c * 0.4, 1.0 + r * 0.42, 0.09);
      break;
    }
    case 'mat': {
      // 拖垫（2.4 米宽，沿 z）+ 前面的拖杆 + 一根拉绳往 −x（西）斜上到总监手里
      box(sp.w, 0.06, sp.d, 0, 0, 0);
      box(0.12, 0.12, sp.d, -sp.w / 2, 0, 0);
      const rope = box(1.55, 0.06, 0.06, -sp.w / 2 - 0.68, 0.38, 0);
      rope.rotation.z = -0.55;
      break;
    }
    case 'brush': {
      // 扫线刷：0.6 米宽的刷头（沿 x）+ 1.4 米的柄（平放在地上，柄朝 +z）
      box(sp.w, 0.14, 0.2, 0, 0, -0.6);
      box(0.06, 0.06, 1.3, 0, 0.04, 0.1);
      break;
    }
    case 'reel': {
      // 卷盘车：两个侧盘 + 中间一卷水管 + 把手
      for (const x of [-0.32, 0.32])
        mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.06, 14).rotateZ(Math.PI / 2), x, 0.42, 0);
      mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.58, 14).rotateZ(Math.PI / 2), 0, 0.42, 0);
      box(0.7, 0.06, 0.06, 0, 0.9, -0.25);
      break;
    }
    case 'bag':
      mesh(new THREE.CylinderGeometry(sp.h / 2, sp.h / 2, sp.w, 10).rotateZ(Math.PI / 2), 0, sp.h / 2, 0);
      break;
    case 'pole':
      // 灯杆：一根 0.22 的杆 + 顶上一盏朝场地的灯
      box(0.22, sp.h - 0.3, 0.22);
      box(sp.w, 0.3, sp.d, 0, sp.h - 0.3, 0);
      break;
    case 'column':
      mesh(new THREE.CylinderGeometry(sp.w * 0.45, sp.w * 0.5, sp.h, 10), 0, sp.h / 2);
      break;
    default:
      box(sp.w, sp.h, sp.d);
  }
  ctx.mats.prepare(g);
  return g;
}
