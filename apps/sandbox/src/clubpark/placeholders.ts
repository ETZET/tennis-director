// 占位：新资产还没画时，每个位置放一个冷灰的体块（明显是占位），大小 = docs/lab/2026-11-07-3d-pixel/clubpark.md 的规格。
// 复用的资产（植物、人、长椅、总监）不用占位，直接是真的（reuse.ts）。
// 车的本地朝向：车头朝 −z（rotY 0 = 车头朝北）。
import * as THREE from 'three';
import { SPECS as CLUB_SPECS } from '../clubfront/placeholders';
import { DESK } from '../clubmap2/layout';
import type { AssetCtx } from './world';

export interface Spec {
  w: number;
  d: number;
  h: number;
  shape: string;
}

/** 新资产（这个场景要从零画的）的规格；和 clubpark.md 的清单一致 */
export const NEW_SPECS: Record<string, Spec> = {
  'club-gate': { w: 1.9, d: 13.4, h: 6.05, shape: 'gate-east' },
  'valet-booth': { w: 2.4, d: 2.2, h: 2.9, shape: 'booth' },
  'valet-podium': { w: 0.7, d: 0.5, h: 2.5, shape: 'podium' },
  'bag-trolley': { w: 0.9, d: 1.4, h: 1.9, shape: 'trolley' },
  'valet-sign': { w: 0.8, d: 0.5, h: 1.2, shape: 'sign' },
  'club-monument': { w: 4.2, d: 0.8, h: 1.7, shape: 'monument' },
  car: { w: 1.9, d: 4.5, h: 1.45, shape: 'car' },
  suv: { w: 2.0, d: 4.8, h: 1.8, shape: 'suv' },
  valet: { w: 0.7, d: 0.5, h: 1.8, shape: 'person' },
  carport: { w: 10.8, d: 5.8, h: 3.4, shape: 'carport' },
  'clubdesk-stub': { w: DESK.w, d: DESK.d, h: DESK.h, shape: 'stub' },
};

export const SPECS: Record<string, { w: number; d: number; h: number }> = { ...CLUB_SPECS, ...NEW_SPECS };

export function placeholder(ctx: AssetCtx, asset: string): THREE.Object3D {
  const sp = NEW_SPECS[asset] ?? CLUB_SPECS[asset] ?? { w: 1, d: 1, h: 1, shape: 'box' };
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
  const v = ctx.variant;
  switch (sp.shape) {
    case 'gate-east': {
      // 照 clubmap2/build.ts：两根 1.7 见方 4.6 米的柱（z ±5.8）+ 柱帽 + 柱顶网球 + 横梁（y 3.7，0.8×0.7，沿 z 13.4）+ 朝东的招牌
      for (const z of [-5.8, 5.8]) {
        box(1.7, 4.6, 1.7, 0, 0, z);
        box(1.9, 0.4, 1.9, 0, 4.6, z);
        mesh(new THREE.SphereGeometry(0.55, 10, 6), 0, 5.5, z);
      }
      box(0.8, 0.7, 13.4, 0, 3.7, 0);
      box(0.25, 1.2, 6.4, 0.55, 2.4, 0);
      break;
    }
    case 'booth': {
      // 岗亭：土坯小屋 + 平顶出檐 + 朝南（朝镜头）的帆布雨篷 + 钥匙柜窗口
      box(sp.w, 2.5, sp.d);
      box(sp.w + 0.5, 0.22, sp.d + 0.5, 0, 2.5);
      const aw = mesh(new THREE.BoxGeometry(sp.w + 0.3, 0.08, 0.9), 0, 2.25, sp.d / 2 + 0.4);
      aw.rotation.x = 0.35;
      box(1.0, 0.18, 0.3, 0, 1.0, sp.d / 2 + 0.15);
      break;
    }
    case 'podium': {
      // 代客台（放钥匙的斜面小台）+ 一把伞
      box(0.6, 1.1, 0.45);
      box(0.2, 1.4, 0.2, -0.45, 0, -0.1);
      mesh(new THREE.ConeGeometry(1.1, 0.4, 10), -0.45, 2.3, -0.1);
      break;
    }
    case 'trolley': {
      // 行李/球包推车：底板 + 两根立杆 + 顶上的弓形横杆 + 几个球包
      box(0.9, 0.12, 1.4, 0, 0.2);
      for (const x of [-0.38, 0.38]) box(0.18, 1.8, 0.18, x, 0, -0.55);
      box(0.95, 0.18, 0.18, 0, 1.75, -0.55);
      box(0.7, 0.4, 1.1, 0, 0.32, 0.05);
      break;
    }
    case 'sign':
      box(0.18, 0.7, 0.18);
      box(0.8, 0.55, 0.12, 0, 0.65, 0);
      break;
    case 'monument':
      box(sp.w, 0.5, sp.d);
      box(sp.w - 0.4, 1.2, 0.5, 0, 0.5);
      break;
    case 'car':
    case 'suv': {
      const suv = sp.shape === 'suv';
      const bodyH = suv ? 0.85 : 0.7;
      box(sp.w, bodyH, sp.d, 0, 0.3, 0);
      box(sp.w - 0.2, suv ? 0.65 : 0.5, suv ? 2.9 : 2.3, 0, 0.3 + bodyH, suv ? 0.35 : 0.2);
      for (const x of [-sp.w / 2 + 0.2, sp.w / 2 - 0.2])
        for (const z of [-sp.d / 2 + 0.85, sp.d / 2 - 0.85]) box(0.32, 0.62, 0.62, x, 0, z);
      // 落客的车（variant 8）：两边车门打开
      if (v === 8)
        for (const s of [-1, 1]) {
          const d = box(0.08, 0.75, 1.0, s * (sp.w / 2 + 0.35), 0.35, -0.35);
          d.rotation.y = s * 0.7;
        }
      break;
    }
    case 'carport': {
      // 遮阳棚：4 根钢柱 + 前后两根梁 + 一整块往南低的帆布顶（北 3.4 → 南 3.0）
      const px = sp.w / 2 - 0.3;
      const pz = sp.d / 2 - 0.5;
      for (const x of [-px, px]) for (const z of [-pz, pz]) box(0.25, z < 0 ? 3.25 : 2.85, 0.25, x, 0, z);
      const roof = mesh(new THREE.BoxGeometry(sp.w, 0.1, sp.d), 0, 3.2, 0);
      roof.rotation.x = -0.07;
      break;
    }
    case 'stub': {
      // 墙里面的前台（clubdesk 场景的主角）：只放一个凉棚的轮廓示意
      const hw = sp.w / 2 - 0.2;
      const hd = sp.d / 2 - 0.2;
      for (const x of [-hw, hw]) for (const z of [-hd, hd]) box(0.3, sp.h, 0.3, x, 0, z);
      box(sp.w + 0.6, 0.18, sp.d + 0.6, 0, sp.h);
      box(0.7, 1.0, 4.8, sp.w / 2 - 0.6, 0, 0);
      break;
    }
    case 'person':
      mesh(new THREE.CapsuleGeometry(sp.w * 0.4, sp.h - sp.w * 0.8, 4, 8), 0, sp.h / 2);
      // 代客的帽子（variant 0）/ 门童的高帽（variant 1）
      box(0.42, v === 1 ? 0.3 : 0.14, 0.42, 0, sp.h - 0.05);
      break;
    default:
      box(sp.w, sp.h, sp.d);
  }
  ctx.mats.prepare(g);
  return g;
}
