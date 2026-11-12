// 白模的调试层：站位（洋红小圆盘）、路线（每 0.9 米一个小点）、门（门洞里一排小方点）。只在标签开着时画（?labels=0 的截图里没有）。
// 另外给 clubwalk / 玩法用的导航数据：houseBlocked() = 墙（门洞是通的）+ 家具的脚印（按 SLOTS 和占位的规格；人、地毯、挂墙的板不算；树只挡树干；壁泉加上伸出来的半圆小池）。
import * as THREE from 'three';
import { DECK_RAMPS } from '../clubpool/layout';
import type { Shape } from '../clubsite/play/nav';
import type { RegionNav } from '../clubsite/region';
import { smoothLine } from '../clubsite/render/geo';
import { CLUBHOUSE, GROUNDS } from '../clubsite/world';
import type { AssetCtx } from './ctx';
import { alongX, DOORS, ROUTES, SLOTS, SPOTS, type V2, WALKABLE, WALLS, wallBlocked } from './layout';
import { SPECS } from './placeholders';

/** 给标签用的站位中文名（没列的不贴字） */
export const SPOT_NAMES: Partial<Record<keyof typeof SPOTS, string>> = {
  desk: '办公桌',
  barIn: '吧台里',
  stringer: '穿线机',
  till: '收银',
  physio: '理疗',
  fireplace: '壁炉前',
};

/** 不挡路的资产：人、地毯、挂墙的板（板底离地）、屋顶 / 二楼上的东西、攀柱的花 */
const NO_BLOCK = new Set([
  'player',
  'coach',
  'director',
  'kid',
  'rug',
  'schedule-board',
  'notice-board',
  'balcony',
  'chimney',
  'club-sign',
  'bougainvillea',
  'arch-window',
  'main-door',
  'agave',
]);

/** 树：只挡树干（圆，半径 = 树干底的半径 × 缩放；树冠在头顶上，底下能走） */
const TRUNK: Record<string, number> = { 'fan-palm': 0.36 };

/** 家具的脚印（矩形，转 90° 的换宽深；斜放的按包围盒）+ 墙 + 树干 */
export function houseBlocked(): Shape[] {
  const out: Shape[] = [...wallBlocked()];
  for (const s of SLOTS) {
    if (NO_BLOCK.has(s.asset) || s.mode === 'out') continue;
    const trunk = TRUNK[s.asset];
    if (trunk) {
      out.push({ x: s.x, z: s.z, r: trunk * (s.s ?? 1) });
      continue;
    }
    const sp = SPECS[s.asset];
    if (!sp) continue;
    const r = s.rotY ?? 0;
    const c = Math.abs(Math.cos(r));
    const sn = Math.abs(Math.sin(r));
    const sc = s.s ?? 1;
    const hw = ((sp.w * c + sp.d * sn) / 2) * sc;
    const hd = ((sp.w * sn + sp.d * c) / 2) * sc;
    out.push({ x0: s.x - hw, x1: s.x + hw, z0: s.z - hd, z1: s.z + hd });
    if (sp.shape === 'wallfountain') out.push(fountainBasin(s.x, s.z, r, sp.w * sc, sp.d * sc));
  }
  return out;
}

/**
 * 壁泉的半圆小池（placeholders.ts 的 wallfountain：半径 w/2、圆心在本地 z −d/2 + 0.15，朝本地 +z 伸出去）：
 * 比 w × d 的脚印往外多伸 0.35 米，按半圆挡（多边形；整圆会把墙外的西巷也挡窄）。
 */
function fountainBasin(x: number, z: number, rotY: number, w: number, d: number): Shape {
  const R = w / 2;
  const c = Math.cos(rotY);
  const s = Math.sin(rotY);
  const poly: V2[] = [];
  for (let i = 0; i <= 12; i++) {
    const a = -Math.PI / 2 + (i / 12) * Math.PI;
    const lx = R * Math.sin(a);
    const lz = -d / 2 + 0.15 + R * Math.cos(a);
    poly.push([x + lx * c + lz * s, z - lx * s + lz * c]);
  }
  return { poly };
}

/**
 * 导航（clubwalk 的区域 nav()）：能走的 WALKABLE − houseBlocked()。
 * 泳池北门的台阶（clubpool 的 DECK_RAMPS.north，x −48.7…−46.5、z −1.9…−1）在 clubwalk 里落在会所的范围（z < −1）：
 * 大世界按"点归哪个区域就问哪个区域"取高度，所以会所这边也要带上这段坡道，不然台阶那一段是平地、平台边是 0.45 的坎。
 */
export function houseNav(): RegionNav {
  return {
    bounds: { x0: GROUNDS.x0, x1: CLUBHOUSE.x1 + 0.5, z0: GROUNDS.z0, z1: -1 },
    walkable: WALKABLE,
    blocked: houseBlocked(),
    ramps: [DECK_RAMPS.north],
  };
}

export function buildNav(ctx: AssetCtx, groundAt: (x: number, z: number) => number): THREE.Group {
  const g = new THREE.Group();
  g.name = 'nav';
  const m = ctx.mat('navMark', { noShadowReceive: true });
  const disc = new THREE.CircleGeometry(0.28, 16).rotateX(-Math.PI / 2);
  const dot = new THREE.CircleGeometry(0.08, 6).rotateX(-Math.PI / 2);
  const sq = new THREE.PlaneGeometry(0.18, 0.18).rotateX(-Math.PI / 2);
  for (const [x, z] of Object.values(SPOTS)) {
    const o = new THREE.Mesh(disc, m);
    o.position.set(x, groundAt(x, z) + 0.06, z);
    g.add(o);
  }
  for (const r of ROUTES) {
    const line: V2[] = smoothLine(r.pts, 0.9);
    for (const [x, z] of line) {
      const o = new THREE.Mesh(dot, m);
      o.position.set(x, groundAt(x, z) + 0.05, z);
      g.add(o);
    }
  }
  // 门（外门）：门洞里一排小方点（沿门宽），门外 / 门里的站点画圆盘
  for (const d of Object.values(DOORS)) {
    const wall = WALLS.find((w) => {
      const ax = alongX(w);
      const c = ax ? w.a[1] : w.a[0];
      const along = ax ? d.x : d.z;
      const across = ax ? d.z : d.x;
      const [a0, a1] = ax ? [w.a[0], w.b[0]] : [w.a[1], w.b[1]];
      return Math.abs(c - across) < 0.4 && along >= Math.min(a0, a1) && along <= Math.max(a0, a1);
    });
    const ax = wall ? alongX(wall) : d.facing === 's';
    for (let k = -2; k <= 2; k++) {
      const o = new THREE.Mesh(sq, m);
      const t = (k / 2) * (d.w / 2 - 0.15);
      o.position.set(ax ? d.x + t : d.x, 0.07, ax ? d.z : d.z + t);
      g.add(o);
    }
    for (const [x, z] of [d.out, d.in]) {
      const o = new THREE.Mesh(disc, m);
      o.position.set(x, groundAt(x, z) + 0.06, z);
      g.add(o);
    }
  }
  g.traverse((o) => {
    o.castShadow = false;
    o.receiveShadow = false;
  });
  return g;
}
