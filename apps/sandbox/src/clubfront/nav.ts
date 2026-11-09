// 白模的调试层：站位（洋红小圆盘）和路线（每 0.9 米一个小点）。只在标签开着时画（?labels=0 的截图里没有）。
// 玩法（总监走动、会员到柜台）以后照 layout.ts 的 SPOTS / ROUTES / WALKABLE 做，这里只是让构图评审时看得到。
import * as THREE from 'three';
import type { AssetCtx } from '../clubsite/render/ctx';
import { smoothLine } from '../clubsite/render/geo';
import { ROUTES, SPOTS, type V2 } from './layout';

export function buildNav(ctx: AssetCtx, groundAt: (x: number, z: number) => number): THREE.Group {
  const g = new THREE.Group();
  g.name = 'nav';
  const m = ctx.mat('navMark', { noShadowReceive: true });
  const disc = new THREE.CircleGeometry(0.32, 16).rotateX(-Math.PI / 2);
  const dot = new THREE.CircleGeometry(0.09, 6).rotateX(-Math.PI / 2);
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
