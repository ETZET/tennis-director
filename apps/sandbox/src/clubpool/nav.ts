// 白模的调试层：站位（洋红小圆盘）、路线（每 0.9 米一个小点）、入口（大一号的圆盘 + 一圈小方点）。
// 只在标签开着时画（?labels=0 的截图里没有）。玩法（stage 3）照 layout.ts 的 SPOTS / ROUTES / WALKABLE / ENTRANCES 做。
import * as THREE from 'three';
import type { Shape } from '../clubsite/play/nav';
import type { RegionNav } from '../clubsite/region';
import { smoothLine } from '../clubsite/render/geo';
import { GROUNDS, POOL } from '../clubsite/world';
import type { AssetCtx } from './ctx';
import { DECK_RAMPS, ENTRANCES, FENCE, GATES, ROUTES, SLOTS, SPOTS, type V2 } from './layout';
import { SPECS } from './placeholders';

/** 给标签用的站位中文名（没列的不贴字；入口的字在 layout.ts 的 AREA_LABELS） */
export const SPOT_NAMES: Partial<Record<keyof typeof SPOTS, string>> = {
  pump: '加氯 / 洗滤网',
  hamper: '收毛巾',
  guardFoot: '顶班（上高椅）',
};

/** 按脚印（矩形，转 90° 换宽深）挡路的资产 */
const BOXED = new Set([
  'cabana',
  'lifeguard-chair',
  'lounger',
  'side-table',
  'towel-cart',
  'towel-hamper',
  'pool-ladder',
  'pump-house',
]);
/** 按圆挡路的：树只挡树干、伞只挡伞杆、灌木 / 仙人掌按冠的大半（半径 × 缩放；和 clubcourts/play.ts 的 PLANT_R 一致） */
const ROUND: Record<string, number> = {
  'fan-palm': 0.36,
  'palo-verde': 0.45,
  'court-umbrella': 0.12,
  agave: 0.6,
  brittlebush: 0.45,
  'barrel-cactus': 0.35,
  creosote: 0.6,
};
/** 围栏的半厚（柱子 0.34，矮墙 0.24） */
const FENCE_T = 0.17;

/**
 * 挡路的：池水（只挡水面，池沿 0.45 能走：捞叶子、下水的站位都在池沿边上）、围栏（四边按门切开，门洞整宽留着）、
 * 家具（帐篷、救生员椅、躺椅、边桌、毛巾车、回收筐、梯子、泵房）的脚印、淋浴只挡立柱、树干、伞杆、灌木。
 * 人、浮床、落叶、台阶（坡道）、门（门柱在围栏的段头里）不挡。
 */
export function poolBlocked(): Shape[] {
  const out: Shape[] = [{ ...POOL }];
  const cut = (a0: number, a1: number, door?: { at: number; gap: number }) =>
    door
      ? [
          [a0, door.at - door.gap / 2],
          [door.at + door.gap / 2, a1],
        ]
      : [[a0, a1]];
  const { x0, x1, z0, z1 } = FENCE;
  const t = FENCE_T;
  for (const [a, b] of cut(x0, x1, GATES.north)) out.push({ x0: a, x1: b, z0: z0 - t, z1: z0 + t });
  out.push({ x0, x1, z0: z1 - t, z1: z1 + t });
  for (const [a, b] of cut(z0, z1, GATES.east)) out.push({ x0: x1 - t, x1: x1 + t, z0: a, z1: b });
  for (const [a, b] of cut(z0, z1, GATES.service)) out.push({ x0: x0 - t, x1: x0 + t, z0: a, z1: b });
  for (const s of SLOTS) {
    const sc = s.s ?? 1;
    const r = ROUND[s.asset];
    if (r) {
      out.push({ x: s.x, z: s.z, r: r * sc });
      continue;
    }
    // 淋浴：立柱在本地 −z 0.2（两个都没转）
    if (s.asset === 'pool-shower') {
      out.push({ x: s.x, z: s.z - 0.2, r: 0.1 });
      continue;
    }
    const sp = SPECS[s.asset];
    if (!BOXED.has(s.asset) || !sp) continue;
    const ry = s.rotY ?? 0;
    const c = Math.abs(Math.cos(ry));
    const sn = Math.abs(Math.sin(ry));
    const hw = ((sp.w * c + sp.d * sn) / 2) * sc;
    const hd = ((sp.w * sn + sp.d * c) / 2) * sc;
    out.push({ x0: s.x - hw, x1: s.x + hw, z0: s.z - hd, z1: s.z + hd });
  }
  return out;
}

/**
 * 导航（clubwalk 的区域 nav()）：池畔平台的高差由 groundAt 给，三处台阶是坡道，挡路的见 poolBlocked()。
 * 东边到 x −36.5（西步道中线：东门台阶脚下的入口 fromWestPath 在 x −37.6；clubwalk 里 x −38.5 以东归 clubcourts，不受影响）。
 */
export function poolNav(): RegionNav {
  return {
    bounds: { x0: GROUNDS.x0, x1: -36.5, z0: -10, z1: 20 },
    blocked: poolBlocked(),
    ramps: Object.values(DECK_RAMPS),
  };
}

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
