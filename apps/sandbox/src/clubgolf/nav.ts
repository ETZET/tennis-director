// 白模的调试层：站位（洋红小圆盘）、路线（每 0.9 米一个小点）、建议的门洞（一圈小方点）。
// 只在标签开着时画（?labels=0 的截图里没有）。玩法（stage 3）照 layout.ts 的 SPOTS / ROUTES / WALKABLE 做；
// clubwalk 把场景连成一个大世界时，入口用 SPOTS.gateIn / gateOut（南墙门）和 eastIn / eastOut（东边绕，停车场南片）。
import * as THREE from 'three';
import { smoothLine } from '../clubsite/render/geo';
import type { AssetCtx } from './ctx';
import { GOLF_GATE, type Rect, ROUTES, SPOTS, type V2 } from './layout';

/** 给标签用的站位中文名（没列的不贴字） */
export const SPOT_NAMES: Partial<Record<keyof typeof SPOTS, string>> = {
  pondBalls: '捞球',
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
    for (const [x, z] of smoothLine(r.pts, 0.9)) {
      const o = new THREE.Mesh(dot, m);
      o.position.set(x, groundAt(x, z) + 0.04, z);
      g.add(o);
    }
  }
  // 建议的门洞：每 0.6 米一个小方点
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
      const n = Math.max(1, Math.round(Math.hypot(bx - ax, bz - az) / 0.6));
      for (let k = 0; k < n; k++) {
        const x = ax + ((bx - ax) * k) / n;
        const z = az + ((bz - az) * k) / n;
        const o = new THREE.Mesh(sq, m);
        o.position.set(x, groundAt(x, z) + 0.05, z);
        g.add(o);
      }
    }
  };
  rim({ x0: GOLF_GATE.x0, x1: GOLF_GATE.x1, z0: GOLF_GATE.z - 0.6, z1: GOLF_GATE.z + 0.6 });
  g.traverse((o) => {
    o.castShadow = false;
    o.receiveShadow = false;
  });
  return g;
}
