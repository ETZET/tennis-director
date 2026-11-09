// 白模的调试层（照 clubdesk/nav.ts）：站位（洋红小圆盘）、路线（每 0.9 米一个小点）、南围网挡住半身的界线（SOUTH_HIDE_Z，一排小方点）。
// 只在标签开着时画（?labels=0 的截图里没有）。玩法（stage 3）照 layout.ts 的 SPOTS / ROUTES / WALKABLE 做。
import * as THREE from 'three';
import { smoothLine } from '../clubsite/render/geo';
import type { AssetCtx } from './ctx';
import { PICKLE, ROUTES, SOUTH_HIDE_Z, SPOTS, type V2 } from './layout';

/** 给标签用的站位中文名（没列的不贴字） */
export const SPOT_NAMES: Partial<Record<keyof typeof SPOTS, string>> = {
  gearBox: '器材箱取放',
  sweepStart: '捡球起点',
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
  // 南围网挡住半身的界线（以南 = 被挡 = 不让进）
  for (let x = PICKLE.x0 + 0.3; x < PICKLE.x1; x += 0.45) {
    const o = new THREE.Mesh(sq, m);
    o.position.set(x, 0.05, SOUTH_HIDE_Z);
    g.add(o);
  }
  g.traverse((o) => {
    o.castShadow = false;
    o.receiveShadow = false;
  });
  return g;
}
