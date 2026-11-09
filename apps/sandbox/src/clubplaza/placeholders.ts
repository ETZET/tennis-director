// 占位：新资产还没画时，每个位置放一个冷灰的体块（明显是占位），大小 = docs/lab/2026-11-07-3d-pixel/clubplaza.md 的规格。
// 复用的资产（蒲葵、人、长椅、陶罐、龙舌兰、大门、围网）不用占位，直接是真的（reuse.ts）。
// 本地原点 = 落地点（y 0 = 地面 / 广场顶面），+z 朝镜头（南），+x 朝东；尺寸米。
import * as THREE from 'three';
import { SPECS as DESK_SPECS, type Spec as DeskSpec } from '../clubdesk/placeholders';
import { ring } from '../clubmap/build';
import { FOUNTAIN_SPEC as F } from './layout';
import type { AssetCtx } from './world';

/** 每个资产的大致外形（米）：w 宽（x）、d 深（z）、h 高；shape 决定占位的样子；n = 清单编号（标签里显示） */
export interface Spec {
  w: number;
  d: number;
  h: number;
  shape:
    | DeskSpec['shape']
    | 'fountain'
    | 'spray'
    | 'bird'
    | 'birds'
    | 'litter'
    | 'net'
    | 'leafcart'
    | 'stand'
    | 'sitter';
  crown?: number;
  n?: number;
  /** 中文短名（标签） */
  name?: string;
}

/** 新资产（这个场景要从零画的）的规格；和 clubplaza.md 的清单一致 */
export const NEW_SPECS: Record<string, Spec> = {
  'palm-fountain': {
    w: F.basinR * 2,
    d: F.basinR * 2,
    h: F.finialTop,
    shape: 'fountain',
    n: 1,
    name: '棕榈喷泉（主角）',
  },
  'fountain-spray': { w: 8, d: 8, h: 4.4, shape: 'spray', n: 2, name: '水花' },
  grackle: { w: 0.16, d: 0.44, h: 0.3, shape: 'bird', n: 3, name: '大尾拟八哥' },
  grackles: { w: 1.2, d: 0.6, h: 0.3, shape: 'birds', n: 3, name: '池沿的鸟' },
  'palm-litter': { w: 1.3, d: 0.5, h: 0.06, shape: 'litter', n: 4, name: '落叶' },
  'skim-net': { w: 2.4, d: 0.5, h: 0.7, shape: 'net', n: 5, name: '捞网' },
  'leaf-cart': { w: 1.3, d: 0.75, h: 1.7, shape: 'leafcart', n: 6, name: '保洁车' },
  'drinks-cart': { w: 1.7, d: 0.9, h: 2.6, shape: 'stand', n: 7, name: '饮料车' },
  sitter: { w: 0.7, d: 0.8, h: 1.3, shape: 'sitter', n: 8, name: '坐着（sit 姿势）' },
  'drink-fountain': { w: 0.5, d: 0.45, h: 1.0, shape: 'column', n: 9, name: '饮水点' },
};

export const SPECS: Record<string, Spec> = {
  ...(DESK_SPECS as Record<string, Spec>),
  ...NEW_SPECS,
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
  const bird = (x: number, y: number, z: number, ry: number) => {
    // 身子 + 长尾巴（大尾拟八哥的剪影：尾巴和身子一样长，上翘）+ 头
    const b = new THREE.Group();
    const add = (w: number, h: number, d: number, px: number, py: number, pz: number, rx = 0) => {
      const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
      o.position.set(px, py, pz);
      o.rotation.x = rx;
      b.add(o);
    };
    add(0.14, 0.14, 0.24, 0, 0.12, 0.02);
    add(0.1, 0.1, 0.1, 0, 0.22, 0.14);
    add(0.06, 0.05, 0.22, 0, 0.16, -0.16, 0.5);
    b.position.set(x, y, z);
    b.rotation.y = ry;
    g.add(b);
  };
  switch (sp.shape) {
    case 'fountain': {
      // 池壁（外 4.6、内 4.0、高 0.6）+ 压顶（宽一点）+ 中间的柱、下碗、细颈、上碗、顶上的出水口。池水在 terrain（先铺一块冷色）
      mesh(ring(F.basinR, F.waterR, F.wallH - 0.08));
      mesh(ring(F.basinR + 0.08, F.waterR - 0.04, 0.08), 0, F.wallH - 0.08);
      mesh(new THREE.CylinderGeometry(F.pedestal.r1, F.pedestal.r0, F.pedestal.h, 12), 0, F.pedestal.h / 2);
      mesh(new THREE.CylinderGeometry(F.bowl1.r, F.bowl1.r * 0.45, F.bowl1.t, 16), 0, F.bowl1.y + F.bowl1.t / 2);
      mesh(
        new THREE.CylinderGeometry(F.stem.r * 0.8, F.stem.r, F.stem.h, 10),
        0,
        F.bowl1.y + F.bowl1.t + F.stem.h / 2 - 0.1,
      );
      mesh(new THREE.CylinderGeometry(F.bowl2.r, F.bowl2.r * 0.45, F.bowl2.t, 14), 0, F.bowl2.y + F.bowl2.t / 2);
      mesh(new THREE.SphereGeometry(0.28, 10, 8), 0, F.finialTop - 0.28);
      break;
    }
    case 'spray': {
      // 两层碗沿往下的溢流帘（空心圆筒，薄），顶上一股往上冒的水柱，池壁内四股往里的弧形小水柱（每股 3 段）
      const curtain = (r: number, y0: number, y1: number) => {
        const geo = new THREE.CylinderGeometry(r, r * 1.04, y1 - y0, 20, 1, true);
        mesh(geo, 0, (y0 + y1) / 2);
      };
      curtain(F.bowl1.r - 0.02, F.waterY, F.bowl1.y);
      curtain(F.bowl2.r - 0.02, F.bowl1.y + F.bowl1.t, F.bowl2.y);
      box(0.16, 0.8, 0.16, 0, F.finialTop, 0);
      for (let k = 0; k < 4; k++) {
        const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
        const arc = new THREE.Group();
        for (let j = 0; j < 3; j++) {
          const t = (j + 0.5) / 3;
          const o = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.55), m);
          o.position.set(0, F.wallH + 0.55 * Math.sin(Math.PI * t), F.waterR - 0.15 - 1.4 * t);
          o.rotation.x = 0.9 - 1.8 * t;
          arc.add(o);
        }
        arc.rotation.y = a;
        g.add(arc);
      }
      break;
    }
    case 'bird':
      bird(0, 0, 0, 0);
      break;
    case 'birds':
      bird(-0.35, 0, 0.05, 0.4);
      bird(0.3, 0, -0.1, -0.9);
      break;
    case 'litter': {
      // 一片蒲葵的枯叶（扇面 + 长柄）+ 两三片碎叶：平的、贴地
      const v = ctx.variant % 3;
      const fan = mesh(new THREE.CircleGeometry(0.42, 7, 0, Math.PI * 0.9).rotateX(-Math.PI / 2), 0.35, 0.02, 0);
      fan.rotation.y = v * 0.7;
      box(0.9, 0.04, 0.07, -0.25, 0, 0.02);
      if (v !== 1) box(0.22, 0.03, 0.14, -0.5, 0, 0.32);
      break;
    }
    case 'net': {
      // 原点 = 总监的手（世界 y 广场 + 1.05）；杆子往西、往下伸到水面（y −0.63），杆头一个网圈（0.44 米宽）
      const dx = -2.3;
      const dy = -0.6;
      const len = Math.hypot(dx, dy);
      const pole = box(len, 0.09, 0.09, dx / 2, dy / 2 - 0.045, 0);
      pole.rotation.z = Math.atan2(dy, dx) + Math.PI;
      mesh(new THREE.TorusGeometry(0.22, 0.045, 4, 12).rotateX(Math.PI / 2), dx - 0.18, dy + 0.02, 0);
      break;
    }
    case 'leafcart': {
      // 两轮的保洁车：一只落叶桶（0.7 高）+ 车架 + 把手；桶里插着扫帚、耙子，挂一只浇水壶
      box(0.8, 0.7, 0.6, 0.15, 0.12, 0);
      for (const z of [-0.33, 0.33])
        mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.08, 10).rotateX(Math.PI / 2), 0.35, 0.2, z);
      box(0.5, 0.06, 0.06, -0.45, 0.85, -0.22);
      box(0.5, 0.06, 0.06, -0.45, 0.85, 0.22);
      box(0.09, 1.0, 0.09, 0.0, 0.7, -0.12);
      box(0.09, 0.9, 0.09, 0.3, 0.7, 0.1);
      box(0.3, 0.25, 0.18, 0.62, 0.55, 0.3);
      break;
    }
    case 'stand': {
      // 饮料车：车厢（1.6 × 0.95 × 0.8）+ 两个轮子 + 一根伞杆 + 圆锥伞（r 1.25）+ 车上两只大饮料桶
      box(1.6, 0.8, 0.8, 0, 0.18, 0);
      for (const x of [-0.55, 0.55])
        mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.08, 10).rotateX(Math.PI / 2), x, 0.22, 0.44);
      box(0.08, 1.4, 0.08, 0, 0.98, -0.1);
      mesh(new THREE.ConeGeometry(1.25, 0.45, 10), 0, 2.38 + 0.22, -0.1);
      for (const x of [-0.4, 0.15]) mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.42, 10), x, 0.98 + 0.21, 0.05);
      break;
    }
    case 'sitter': {
      // 坐着的人：大腿往前伸、小腿垂下，上身直，头（Q 版大头）。长椅座面 0.45 高
      box(0.46, 0.62, 0.34, 0, 0.45, -0.1);
      box(0.42, 0.18, 0.46, 0, 0.42, 0.18);
      box(0.36, 0.42, 0.16, 0, 0.0, 0.36);
      mesh(new THREE.SphereGeometry(0.27, 10, 8), 0, 1.3, -0.08);
      break;
    }
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
