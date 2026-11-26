// clubvista 的白模：还没画的资产先用冷灰体块（box）占位，尺寸照规格；每张图唯一的暖色焦点用 boxHot。
// 规格 = 宽（本地 x）× 高 × 深（本地 z），米。shape：box 方块、roof 柱子 + 顶棚、umb 伞（杆 + 扁锥）、net 网（矮长条）、fall 瀑布（泡沫色竖片）。
import * as THREE from 'three';
import type { AssetCtx } from './ctx';
import type { Pal } from './palette';

export interface Spec {
  w: number;
  h: number;
  d: number;
  shape?: 'box' | 'roof' | 'umb' | 'net' | 'fall' | 'pole';
  mat?: keyof Pal;
  name: string;
}

export const SPECS: Record<string, Spec> = {
  'bus-shelter': { w: 5.2, h: 2.7, d: 2, shape: 'roof', name: '公交候车亭' },
  'stop-pole': { w: 0.3, h: 2.6, d: 0.3, shape: 'pole', name: '站牌' },
  suitcase: { w: 0.55, h: 0.7, d: 0.35, name: '行李箱' },
  shuttle: { w: 10, h: 3, d: 2.6, name: '接驳巴士' },
  culvert: { w: 3.2, h: 0.9, d: 0.7, name: '涵洞口' },
  'front-desk': { w: 7, h: 3.4, d: 4.6, shape: 'roof', mat: 'boxHot', name: '露天前台' },
  ramada: { w: 4.4, h: 2.9, d: 3.6, shape: 'roof', name: '凉棚' },
  lounger: { w: 0.8, h: 0.45, d: 2, name: '躺椅' },
  umbrella: { w: 2.8, h: 2.5, d: 2.8, shape: 'umb', name: '遮阳伞' },
  'umbrella-hot': { w: 2.8, h: 2.5, d: 2.8, shape: 'umb', mat: 'boxHot', name: '遮阳伞（焦点）' },
  kiosk: { w: 4, h: 3, d: 3, shape: 'roof', mat: 'boxHot', name: '咖啡亭' },
  'cafe-table': { w: 1.2, h: 0.8, d: 1.2, name: '咖啡桌' },
  'side-table': { w: 0.6, h: 0.55, d: 0.6, name: '小边桌' },
  waterfall: { w: 3.6, h: 4.95, d: 0.3, shape: 'fall', mat: 'foam', name: '瀑布' },
  'hit-wall': { w: 9, h: 3, d: 0.4, name: '练习墙' },
  net: { w: 12.8, h: 1.07, d: 0.12, shape: 'net', name: '球网' },
  'umpire-chair': { w: 1, h: 2.2, d: 1, name: '裁判椅' },
  'player-bench': { w: 2.2, h: 0.9, d: 0.6, name: '球员长椅' },
};

export function placeholder(ctx: AssetCtx, id: string): THREE.Object3D {
  const sp = SPECS[id] ?? { w: 1, h: 1, d: 1, name: id };
  const g = new THREE.Group();
  const m = ctx.mat(sp.mat ?? 'box');
  const roofM = ctx.mat(sp.mat ?? 'box');
  const postM = ctx.mat('box');
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number) => {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    g.add(mesh);
  };
  const { w, h, d } = sp;
  switch (sp.shape) {
    case 'roof': {
      const t = 0.28;
      for (const [sx, sz] of [
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
      ])
        add(new THREE.BoxGeometry(0.22, h - t, 0.22), postM, (sx * (w - 0.4)) / 2, (h - t) / 2, (sz * (d - 0.4)) / 2);
      add(new THREE.BoxGeometry(w, t, d), roofM, 0, h - t / 2, 0);
      // 后墙 / 柜台：一块矮体
      add(new THREE.BoxGeometry(w * 0.8, 1.1, 0.5), postM, 0, 0.55, -d / 2 + 0.4);
      break;
    }
    case 'umb': {
      add(new THREE.CylinderGeometry(0.06, 0.06, h, 6), postM, 0, h / 2, 0);
      add(new THREE.ConeGeometry(w / 2, 0.6, 10), m, 0, h - 0.3, 0);
      break;
    }
    case 'net': {
      add(new THREE.BoxGeometry(w, h * 0.92, d), m, 0, (h * 0.92) / 2, 0);
      for (const sx of [-1, 1]) add(new THREE.BoxGeometry(0.12, h, 0.12), postM, (sx * w) / 2, h / 2, 0);
      break;
    }
    case 'pole': {
      add(new THREE.BoxGeometry(0.1, h, 0.1), postM, 0, h / 2, 0);
      add(new THREE.BoxGeometry(w * 2, 0.7, 0.08), m, 0, h - 0.45, 0);
      break;
    }
    case 'fall': {
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), ctx.mat(sp.mat ?? 'foam', { noShadowReceive: true }));
      mesh.position.set(0, h / 2, d);
      g.add(mesh);
      break;
    }
    default:
      add(new THREE.BoxGeometry(w, h, d), m, 0, h / 2, 0);
  }
  g.userData.spec = sp;
  return g;
}
