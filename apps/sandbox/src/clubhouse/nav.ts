// 白模的调试层：站位（洋红小圆盘）、路线（每 0.9 米一个小点）、门（门洞里一排小方点）。只在标签开着时画（?labels=0 的截图里没有）。
// 另外给 clubwalk / 玩法用的导航数据：houseBlocked() = 墙（门洞是通的）+ 家具的脚印（按 SLOTS 和占位的规格；人、地毯、挂墙的板不算）。
import * as THREE from 'three';
import type { Rect as NavRect } from '../clubsite/play/nav';
import { smoothLine } from '../clubsite/render/geo';
import type { AssetCtx } from './ctx';
import { alongX, DOORS, ROUTES, SLOTS, SPOTS, type V2, WALLS, wallBlocked } from './layout';
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

/** 家具的脚印（矩形，转 90° 的换宽深；斜放的按包围盒）+ 墙 */
export function houseBlocked(): NavRect[] {
  const out: NavRect[] = [...wallBlocked()];
  for (const s of SLOTS) {
    if (NO_BLOCK.has(s.asset) || s.mode === 'out') continue;
    const sp = SPECS[s.asset];
    if (!sp) continue;
    const r = s.rotY ?? 0;
    const c = Math.abs(Math.cos(r));
    const sn = Math.abs(Math.sin(r));
    const sc = s.s ?? 1;
    const hw = ((sp.w * c + sp.d * sn) / 2) * sc;
    const hd = ((sp.w * sn + sp.d * c) / 2) * sc;
    out.push({ x0: s.x - hw, x1: s.x + hw, z0: s.z - hd, z1: s.z + hd });
  }
  return out;
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
