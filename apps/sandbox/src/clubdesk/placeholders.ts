// 占位：新资产还没画时，每个位置放一个冷灰的体块（明显是占位），大小 = docs/lab/2026-11-07-3d-pixel/clubdesk.md 的规格。
// 复用的资产（植物、人、长椅、遮阳帆、工具架）不用占位，直接是真的（reuse.ts）。
// 本地原点 = 落地点（y 0 = 地面），+z 朝镜头（南），+x 朝东；尺寸米。
import * as THREE from 'three';
import { SPECS as DESERT_SPECS, type Spec as DesertSpec } from '../clubsite/assets/specs';
import type { AssetCtx } from './ctx';
import { CANOPY, COUNTER, GATE_SPEC } from './layout';

/** 每个资产的大致外形（米）：w 宽（x）、d 深（z）、h 高；shape 决定占位的样子；n = 清单编号（标签里显示） */
export interface Spec {
  w: number;
  d: number;
  h: number;
  shape: DesertSpec['shape'] | 'canopy' | 'counter' | 'gate' | 'cart' | 'board';
  crown?: number;
  n?: number;
  /** 中文短名（标签） */
  name?: string;
}

/** 新资产（这个场景要从零画的）的规格；和 clubdesk.md 的清单一致 */
export const NEW_SPECS: Record<string, Spec> = {
  'desk-canopy': {
    w: Math.round((CANOPY.x1 - CANOPY.x0) * 100) / 100,
    d: Math.round((CANOPY.z1 - CANOPY.z0) * 100) / 100,
    h: CANOPY.top,
    shape: 'canopy',
    n: 1,
    name: '凉棚',
  },
  'desk-counter': { w: 1.4, d: 3.7, h: COUNTER.h, shape: 'counter', n: 2, name: 'L 形柜台' },
  'back-cabinet': { w: 0.5, d: 4.6, h: 1.5, shape: 'box', n: 3, name: '后柜（棚下）' },
  'towel-cart': { w: 1.2, d: 0.6, h: 1.1, shape: 'cart', n: 4, name: '毛巾车' },
  'water-station': { w: 0.8, d: 0.6, h: 1.45, shape: 'column', n: 5, name: '自助水站' },
  'checkin-board': { w: 0.8, d: 0.55, h: 1.25, shape: 'board', n: 6, name: '今日场地板' },
  'east-gate': {
    w: GATE_SPEC.cap,
    d: 13.4,
    h: GATE_SPEC.ballY + GATE_SPEC.ball,
    shape: 'gate',
    n: 7,
    name: '大门（内侧）',
  },
  'fence-screen': { w: 8, d: 0.22, h: 2.2, shape: 'box', n: 8, name: '挡风布围网' },
  pot: { w: 0.75, d: 0.75, h: 0.85, shape: 'column', n: 9, name: '陶罐' },
};

export const SPECS: Record<string, Spec> = {
  ...DESERT_SPECS,
  ...NEW_SPECS,
  coach: DESERT_SPECS.player,
  'tool-rack': { w: 2.4, d: 0.9, h: 2.2, shape: 'box' },
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
    case 'canopy': {
      // 四根柱（0.3 米，世界 x 52.6 / 56.2、z 2.5 / 9.0）+ 帆布顶（0.12 厚）+ 北、东、西三边 0.3 米垂边；南沿不挂垂边（会挡总监）
      const cz = (CANOPY.z0 + CANOPY.z1) / 2;
      const cx = (CANOPY.x0 + CANOPY.x1) / 2;
      for (const [x, z] of [
        [52.6, 2.5],
        [56.2, 2.5],
        [52.6, 9.0],
        [56.2, 9.0],
      ])
        box(0.3, sp.h - CANOPY.thick, 0.3, x - cx, 0, z - cz);
      box(sp.w, CANOPY.thick, sp.d, 0, sp.h - CANOPY.thick, 0);
      box(sp.w, 0.3, 0.06, 0, sp.h - CANOPY.thick - 0.3, -sp.d / 2 + 0.03);
      box(0.06, 0.3, sp.d, sp.w / 2 - 0.03, sp.h - CANOPY.thick - 0.3, 0);
      box(0.06, 0.3, sp.d, -sp.w / 2 + 0.03, sp.h - CANOPY.thick - 0.3, 0);
      break;
    }
    case 'counter': {
      // 原点 = 转角（世界 56.3, 9.4）：东段朝东、南段朝南（朝镜头）；台面前沿伸出 0.06
      const ox = 56.3;
      const oz = 9.4;
      const seg = (r: { x0: number; x1: number; z0: number; z1: number }) => {
        box(r.x1 - r.x0, COUNTER.h - 0.06, r.z1 - r.z0, (r.x0 + r.x1) / 2 - ox, 0, (r.z0 + r.z1) / 2 - oz);
        box(
          r.x1 - r.x0 + 0.12,
          0.06,
          r.z1 - r.z0 + 0.12,
          (r.x0 + r.x1) / 2 - ox,
          COUNTER.h - 0.06,
          (r.z0 + r.z1) / 2 - oz,
        );
      };
      seg(COUNTER.east);
      seg(COUNTER.south);
      // 台面上的一叠毛巾 + 服务铃（胖的小块，总监站的位置前面空着）
      box(0.4, 0.22, 0.32, -0.95, COUNTER.h, 0);
      box(0.18, 0.14, 0.18, 0, COUNTER.h, -1.2);
      break;
    }
    case 'gate': {
      // 原点 = 门洞中心（世界 x 60, z 0）：两根门柱 + 柱帽 + 柱顶网球 + 横梁 + 朝东的招牌（这一侧看不到正面）
      const S = GATE_SPEC;
      for (const z of S.pierZ) {
        box(S.pier, S.pierH, S.pier, 0, 0, z);
        box(S.cap, S.capH, S.cap, 0, S.pierH, z);
        mesh(new THREE.SphereGeometry(S.ball, 12, 8), 0, S.ballY, z);
      }
      box(S.beamW, S.beamH, sp.d, 0, S.beamY, 0);
      box(0.25, 1.2, 6.4, 0.55, 2.4 - 0.6, 0);
      break;
    }
    case 'cart': {
      // 两层推车 + 4 个胖轮子（≥ 3 纹素）+ 把手
      box(sp.w, 0.08, sp.d, 0, 0.3, 0);
      box(sp.w, 0.08, sp.d, 0, 0.72, 0);
      for (const x of [-sp.w / 2 + 0.05, sp.w / 2 - 0.05]) box(0.08, sp.h - 0.1, sp.d, x, 0.1, 0);
      for (const x of [-0.45, 0.45])
        for (const z of [-0.2, 0.2])
          mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.08, 10).rotateZ(Math.PI / 2), x, 0.11, z);
      box(0.9, 0.18, 0.4, 0, 0.38, 0);
      box(0.9, 0.18, 0.4, 0, 0.8, 0);
      break;
    }
    case 'board': {
      // A 字黑板：两块往里斜的板（朝镜头那块读得出字）
      const a = 0.22;
      const b1 = box(sp.w, sp.h, 0.05, 0, 0, 0.14);
      b1.rotation.x = -a;
      const b2 = box(sp.w, sp.h, 0.05, 0, 0, -0.14);
      b2.rotation.x = a;
      break;
    }
    case 'column':
      mesh(new THREE.CylinderGeometry(sp.w * 0.45, sp.w * 0.5, sp.h, 10), 0, sp.h / 2);
      break;
    case 'blob': {
      const b = mesh(new THREE.SphereGeometry(0.5, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2));
      b.scale.set(sp.w, sp.h * 2, sp.d);
      break;
    }
    case 'person':
      mesh(new THREE.CapsuleGeometry(sp.w * 0.4, sp.h - sp.w * 0.8, 4, 8), 0, sp.h / 2);
      break;
    default:
      box(sp.w, sp.h, sp.d);
  }
  ctx.mats.prepare(g);
  return g;
}
