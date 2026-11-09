// 占位：资产还没画时，每个位置放一个冷灰的体块（明显是占位），大小 = ASSETS.md 里的规格。
// 例外：球场占位用调色板平涂（它是主角，构图和明暗要靠它来判断），资产 court 画好后替换。
import * as THREE from 'three';
import { COURT } from './layout';
import type { AssetCtx } from './world';

/** 每个资产的大致外形（米）：w 宽（x）、d 深（z）、h 高；shape 决定占位的样子 */
export interface Spec {
  w: number;
  d: number;
  h: number;
  shape: 'tree' | 'palm' | 'blob' | 'column' | 'box' | 'person' | 'flat' | 'sail';
  /** 树、蒲葵：树冠的半径（米） */
  crown?: number;
}

export const SPECS: Record<string, Spec> = {
  court: { w: COURT.padHw * 2, d: COURT.padHl * 2, h: 0.05, shape: 'flat' },
  net: { w: 12.8, d: 0.15, h: 1.07, shape: 'box' },
  'umpire-chair': { w: 1.0, d: 1.0, h: 2.3, shape: 'box' },
  bench: { w: 1.9, d: 0.55, h: 0.85, shape: 'box' },
  'ball-hopper': { w: 0.55, d: 0.55, h: 0.95, shape: 'box' },
  'shade-sail': { w: 4.6, d: 3.4, h: 3.0, shape: 'sail' },
  player: { w: 0.7, d: 0.5, h: 1.8, shape: 'person' },
  director: { w: 0.8, d: 0.6, h: 1.85, shape: 'person' },
  'fan-palm': { w: 5, d: 5, h: 8.5, shape: 'palm', crown: 2.4 },
  'palo-verde': { w: 5.5, d: 5, h: 5.0, shape: 'tree', crown: 2.7 },
  'smoke-tree': { w: 3.6, d: 3.4, h: 3.6, shape: 'tree', crown: 1.8 },
  creosote: { w: 2.0, d: 1.8, h: 1.5, shape: 'blob' },
  brittlebush: { w: 1.4, d: 1.3, h: 0.9, shape: 'blob' },
  ocotillo: { w: 2.4, d: 2.2, h: 3.6, shape: 'column' },
  'barrel-cactus': { w: 0.8, d: 0.8, h: 1.0, shape: 'column' },
  cholla: { w: 1.2, d: 1.1, h: 1.5, shape: 'column' },
  agave: { w: 1.8, d: 1.8, h: 0.9, shape: 'blob' },
  rocks: { w: 2.6, d: 2.0, h: 1.2, shape: 'blob' },
  tumbleweed: { w: 0.9, d: 0.9, h: 0.8, shape: 'blob' },
};

export function placeholder(ctx: AssetCtx, asset: string): THREE.Object3D {
  if (asset === 'court') return courtBlockout(ctx);
  const sp = SPECS[asset] ?? { w: 1, d: 1, h: 1, shape: 'box' as const };
  const m = ctx.mat('placeholder');
  const g = new THREE.Group();
  const mesh = (geo: THREE.BufferGeometry, x = 0, y = 0, z = 0) => {
    const o = new THREE.Mesh(geo, m);
    o.position.set(x, y, z);
    g.add(o);
    return o;
  };
  switch (sp.shape) {
    case 'palm': {
      const c = sp.crown ?? 2;
      mesh(new THREE.CylinderGeometry(0.22, 0.32, sp.h - c * 0.4, 8), 0, (sp.h - c * 0.4) / 2);
      const crown = mesh(new THREE.SphereGeometry(c, 12, 8), 0, sp.h - c * 0.5);
      crown.scale.y = 0.5;
      break;
    }
    case 'tree': {
      const c = sp.crown ?? 2;
      mesh(new THREE.CylinderGeometry(0.16, 0.24, sp.h - c, 8), 0, (sp.h - c) / 2);
      const crown = mesh(new THREE.SphereGeometry(c, 12, 8), 0, sp.h - c * 0.65);
      crown.scale.set(sp.w / (2 * c), 0.65, sp.d / (2 * c));
      break;
    }
    case 'blob': {
      const b = mesh(new THREE.SphereGeometry(0.5, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2));
      b.scale.set(sp.w, sp.h * 2, sp.d);
      break;
    }
    case 'column':
      mesh(new THREE.CylinderGeometry(sp.w * 0.3, sp.w * 0.35, sp.h, 8), 0, sp.h / 2);
      break;
    case 'person':
      mesh(new THREE.CapsuleGeometry(sp.w * 0.4, sp.h - sp.w * 0.8, 4, 8), 0, sp.h / 2);
      break;
    case 'sail': {
      for (const [x, z] of [
        [-sp.w / 2, -sp.d / 2],
        [sp.w / 2, -sp.d / 2],
        [sp.w / 2, sp.d / 2],
        [-sp.w / 2, sp.d / 2],
      ])
        mesh(new THREE.BoxGeometry(0.2, sp.h, 0.2), x, sp.h / 2, z);
      mesh(new THREE.BoxGeometry(sp.w, 0.08, sp.d), 0, sp.h, 0);
      break;
    }
    default:
      mesh(new THREE.BoxGeometry(sp.w, sp.h, sp.d), 0, sp.h / 2);
  }
  ctx.mats.prepare(g);
  return g;
}

/** 球场占位：调色板平涂（外场绿、内场青蓝、奶油线），没有破损和积沙 */
function courtBlockout(ctx: AssetCtx): THREE.Object3D {
  const g = new THREE.Group();
  const plane = (w: number, d: number, y: number, key: 'surround' | 'court' | 'line', x = 0, z = 0) => {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2), ctx.mat(key));
    p.position.set(x, y, z);
    g.add(p);
  };
  const { hw, hl, shw, service, padHw, padHl } = COURT;
  plane(padHw * 2, padHl * 2, 0.02, 'surround');
  plane(hw * 2, hl * 2, 0.03, 'court');
  const L = Math.max(0.16, ctx.texel * 2); // 线宽：2 纹素
  for (const s of [-1, 1]) {
    plane(hw * 2 + L, L, 0.04, 'line', 0, s * hl);
    plane(L, hl * 2, 0.04, 'line', s * hw, 0);
    plane(L, hl * 2, 0.04, 'line', s * shw, 0);
    plane(shw * 2, L, 0.04, 'line', 0, s * service);
  }
  plane(L, service * 2, 0.04, 'line', 0, 0);
  ctx.mats.prepare(g);
  for (const o of g.children) o.castShadow = false;
  return g;
}
