// 白模的调试层：站位（洋红小圆盘）、路线（每 0.9 米一个小点）、入口（大一号的圆盘 + 一圈小方点）。
// 只在标签开着时画（?labels=0 的截图里没有）。玩法（stage 3）照 layout.ts 的 SPOTS / ROUTES / WALKABLE / ENTRANCES 做。
import * as THREE from 'three';
import { smoothLine } from '../clubsite/render/geo';
import type { AssetCtx } from './ctx';
import { ENTRANCES, ROUTES, SPOTS, type V2 } from './layout';

/** 给标签用的站位中文名（没列的不贴字；入口的字在 layout.ts 的 AREA_LABELS） */
export const SPOT_NAMES: Partial<Record<keyof typeof SPOTS, string>> = {
  pump: '加氯 / 洗滤网',
  hamper: '收毛巾',
  guardFoot: '顶班（上高椅）',
};

export function buildNav(ctx: AssetCtx, groundAt: (x: number, z: number) => number): THREE.Group {
  const g = new THREE.Group();
  g.name = 'nav';
  const m = ctx.mat('navMark', { noShadowReceive: true });
  const disc = new THREE.CircleGeometry(0.3, 16).rotateX(-Math.PI / 2);
  const big = new THREE.CircleGeometry(0.55, 20).rotateX(-Math.PI / 2);
  const dot = new THREE.CircleGeometry(0.08, 6).rotateX(-Math.PI / 2);
  const sq = new THREE.PlaneGeometry(0.16, 0.16).rotateX(-Math.PI / 2);
  const at = (geo: THREE.BufferGeometry, x: number, z: number, dy: number) => {
    const o = new THREE.Mesh(geo, m);
    o.position.set(x, groundAt(x, z) + dy, z);
    g.add(o);
  };
  for (const [x, z] of Object.values(SPOTS)) at(disc, x, z, 0.05);
  for (const r of ROUTES) for (const [x, z] of smoothLine(r.pts, 0.9) as V2[]) at(dot, x, z, 0.04);
  // 入口：大圆盘 + 一圈 8 个小方点
  for (const [x, z] of Object.values(ENTRANCES)) {
    at(big, x, z, 0.06);
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      at(sq, x + Math.cos(a) * 0.9, z + Math.sin(a) * 0.9, 0.06);
    }
  }
  g.traverse((o) => {
    o.castShadow = false;
    o.receiveShadow = false;
  });
  return g;
}
