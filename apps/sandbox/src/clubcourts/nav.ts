// 白模的调试层：站位（洋红小圆盘）、路线（每 0.9 米一个小点）。只在标签开着时画（?labels=0 的截图里没有）。
// 玩法（stage 3）照 layout.ts 的 SPOTS / ROUTES / WALKABLE 做。
import * as THREE from 'three';
import { smoothLine } from '../clubsite/render/geo';
import type { AssetCtx } from './ctx';
import { ROUTES, SPOTS, type V2 } from './layout';

/** 给标签用的站位中文名（没列的不贴字） */
export const SPOT_NAMES: Partial<Record<keyof typeof SPOTS, string>> = {
  toolRack: '工具架取放',
  squeegee: '刮水板',
  picker: '捡球器',
  cartDump: '倒球（球车）',
  hopperE: '捡球篮（加球）',
  doorPW_S: '南门',
  doorPE_S: '南门',
  doorM_N: '北门',
};

export function buildNav(ctx: AssetCtx, groundAt: (x: number, z: number) => number): THREE.Group {
  const g = new THREE.Group();
  g.name = 'nav';
  const m = ctx.mat('navMark', { noShadowReceive: true });
  const disc = new THREE.CircleGeometry(0.3, 16).rotateX(-Math.PI / 2);
  const dot = new THREE.CircleGeometry(0.08, 6).rotateX(-Math.PI / 2);
  for (const [x, z] of Object.values(SPOTS)) {
    const o = new THREE.Mesh(disc, m);
    o.position.set(x, groundAt(x, z) + 0.05, z);
    g.add(o);
  }
  for (const r of ROUTES) {
    const line: V2[] = smoothLine(r.pts, 0.9);
    for (const [x, z] of line) {
      const o = new THREE.Mesh(dot, m);
      o.position.set(x, groundAt(x, z) + 0.04, z);
      g.add(o);
    }
  }
  g.traverse((o) => {
    o.castShadow = false;
    o.receiveShadow = false;
  });
  return g;
}
