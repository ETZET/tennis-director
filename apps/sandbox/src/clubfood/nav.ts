// 白模的调试层：站位（洋红小圆盘）、路线（每 0.9 米一个小点）、院子的边（一圈小方点 = 建议的 FOOD_COURT + ARCADE_YARD）。
// 只在标签开着时画（?labels=0 的截图里没有）。玩法（stage 3）照 layout.ts 的 SPOTS / ROUTES / WALKABLE 做。
import * as THREE from 'three';
import { smoothLine } from '../clubfront/terrain';
import { ARCADE_YARD, FOOD_COURT, type Rect, ROUTES, SPOTS, type V2 } from './layout';
import type { AssetCtx } from './world';

/** 给标签用的站位中文名（没列的不贴字） */
export const SPOT_NAMES: Partial<Record<keyof typeof SPOTS, string>> = {
  restockTaco: '补货（后门）',
  helpTaco: '帮忙出餐',
  tableB: '擦桌子',
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
  // 建议的范围：每 1.2 米一个小方点
  const rim = (r: Rect) => {
    const pts: V2[] = [
      [r.x0, r.z0],
      [r.x1, r.z0],
      [r.x1, r.z1],
      [r.x0, r.z1],
    ];
    for (let i = 0; i < 4; i++) {
      const [ax, az] = pts[i];
      const [bx, bz] = pts[(i + 1) % 4];
      const n = Math.max(1, Math.round(Math.hypot(bx - ax, bz - az) / 1.2));
      for (let k = 0; k < n; k++) {
        const x = ax + ((bx - ax) * k) / n;
        const z = az + ((bz - az) * k) / n;
        const o = new THREE.Mesh(sq, m);
        o.position.set(x, groundAt(x, z) + 0.05, z);
        g.add(o);
      }
    }
  };
  rim(FOOD_COURT);
  rim(ARCADE_YARD);
  g.traverse((o) => {
    o.castShadow = false;
    o.receiveShadow = false;
  });
  return g;
}
