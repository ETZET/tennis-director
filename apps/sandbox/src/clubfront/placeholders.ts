// 占位：新资产还没画时，每个位置放一个冷灰的体块（明显是占位），大小 = ASSETS.md 里的规格。
// 复用的 desert3d-v2 资产（植物、人、长椅、遮阳帆）不用占位，直接是真的（reuse.ts）。
import * as THREE from 'three';
import { SPECS as DESERT_SPECS, type Spec as DesertSpec } from '../clubsite/assets/specs';
import type { AssetCtx } from '../clubsite/render/ctx';

/** 每个资产的大致外形（米）：w 宽（x）、d 深（z）、h 高；shape 决定占位的样子 */
export interface Spec {
  w: number;
  d: number;
  h: number;
  shape: DesertSpec['shape'] | 'pergola' | 'gate' | 'desk' | 'cart';
  crown?: number;
}

/** 新资产（这个场景要从零画的）的规格；和 ASSETS.md 的清单一致 */
export const NEW_SPECS: Record<string, Spec> = {
  pergola: { w: 8.4, d: 4.2, h: 3.5, shape: 'pergola' },
  'front-desk': { w: 4.4, d: 0.65, h: 1.05, shape: 'desk' },
  gate: { w: 4.4, d: 0.9, h: 4.0, shape: 'gate' },
  'towel-cart': { w: 1.2, d: 0.6, h: 1.1, shape: 'box' },
  'water-station': { w: 0.8, d: 0.6, h: 1.45, shape: 'column' },
  planter: { w: 1.8, d: 0.8, h: 0.55, shape: 'box' },
  pot: { w: 0.75, d: 0.75, h: 0.85, shape: 'column' },
  'court-fence': { w: 8.0, d: 0.12, h: 3.0, shape: 'box' },
  'golf-cart': { w: 1.25, d: 2.4, h: 1.85, shape: 'cart' },
};

export const SPECS: Record<string, Spec> = { ...DESERT_SPECS, ...NEW_SPECS, coach: DESERT_SPECS.player };

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
    case 'pergola': {
      // 四根柱（0.3 米）+ 帆布顶（一块薄板）+ 朝镜头的垂边 0.35 米 + 后柜（柜台后 2.6 米，见 front-desk）
      const px = sp.w / 2 - 0.2;
      const pz = sp.d / 2 - 0.2;
      for (const [x, z] of [
        [-px, -pz],
        [px, -pz],
        [px, pz],
        [-px, pz],
      ])
        box(0.3, sp.h, 0.3, x, 0, z);
      box(sp.w, 0.12, sp.d, 0, sp.h - 0.12, 0);
      box(sp.w, 0.35, 0.06, 0, sp.h - 0.47, sp.d / 2 - 0.03);
      break;
    }
    case 'desk': {
      // 柜台 + 后柜（柜台后 2.2 米、凉棚两根后柱之间满宽、1.4 米高：正好填满帆布垂边下面露出来的那条地，
      // 暗的正面是总监身后的深色底）
      box(sp.w, sp.h, sp.d);
      box(7.6, 1.4, 0.5, 0, 0, -2.2);
      break;
    }
    case 'gate': {
      // 两根土坯柱（0.9 见方，柱距 3.4）+ 横梁 + 挂在横梁下的招牌 + 柱顶的陶砖帽
      const cx = 1.7;
      for (const x of [-cx, cx]) box(0.9, 3.4, sp.d, x, 0, 0);
      box(sp.w, 0.55, 0.6, 0, 3.05, 0);
      box(2.6, 0.75, 0.12, 0, 2.3, 0.36);
      box(1.05, 0.4, 1.05, -cx, 3.4, 0);
      box(1.05, 0.4, 1.05, cx, 3.4, 0);
      break;
    }
    case 'cart': {
      box(sp.w, 0.9, sp.d, 0, 0.25, 0);
      for (const z of [-0.85, 0.55]) box(0.12, 1.0, 0.12, 0, 0.85, z);
      box(sp.w + 0.1, 0.1, sp.d * 0.8, 0, sp.h - 0.1, -0.15);
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
