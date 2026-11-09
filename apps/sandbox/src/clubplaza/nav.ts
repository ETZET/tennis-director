// 白模的调试层：站位（洋红小圆盘）、路线（每 0.9 米一个小点）、池子的不能走的圈（一圈小方点，池壁外 4.6 米）。
// 只在标签开着时画（?labels=0 的截图里没有）。玩法（stage 3）照 layout.ts 的 SPOTS / ROUTES / WALKABLE 做。
import * as THREE from 'three';
import { smoothLine } from '../clubfront/terrain';
import { FOUNTAIN, FOUNTAIN_SPEC, ROUTES, SPOTS, type V2 } from './layout';
import type { AssetCtx } from './world';

/** 给标签用的站位中文名（没列的不贴字） */
export const SPOT_NAMES: Partial<Record<keyof typeof SPOTS, string>> = {
  leafCart: '工具取放',
  potE: '浇花',
};

export function buildNav(ctx: AssetCtx, groundAt: (x: number, z: number) => number): THREE.Group {
  const g = new THREE.Group();
  g.name = 'nav';
  const m = ctx.mat('navMark', { noShadowReceive: true });
  const disc = new THREE.CircleGeometry(0.3, 16).rotateX(-Math.PI / 2);
  const dot = new THREE.CircleGeometry(0.08, 6).rotateX(-Math.PI / 2);
  const sq = new THREE.PlaneGeometry(0.16, 0.16).rotateX(-Math.PI / 2);
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
  // 池子：池壁外沿以内不能走（一圈小方点）
  const R = FOUNTAIN_SPEC.basinR + 0.25;
  for (let k = 0; k < 40; k++) {
    const a = (k / 40) * Math.PI * 2;
    const x = FOUNTAIN.x + Math.cos(a) * R;
    const z = FOUNTAIN.z + Math.sin(a) * R;
    const o = new THREE.Mesh(sq, m);
    o.position.set(x, groundAt(x, z) + 0.05, z);
    g.add(o);
  }
  g.traverse((o) => {
    o.castShadow = false;
    o.receiveShadow = false;
  });
  return g;
}
