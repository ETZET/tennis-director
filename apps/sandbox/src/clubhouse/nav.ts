// 会所的导航（三层）+ 白模的调试层。
// 导航：clubsite/play 的 NavMap 一个格子只有一个高度 → **每层一张**（houseNav(层)）：surface(x, z) 先看这一层的楼梯段（layout.ts 的 FLIGHTS，
//   grids 含这一层的），再看这一层能站的房间（一层 = 整个脚印 + 四周），别的地方不能站；blocked = 这一层的墙（门洞是通的）+ 家具脚印 + 楼梯栏板 + 电梯井。
//   换层：脚下高度过了 floorFor 的阈值就换成那一层的导航（play.nav.setBlocked 重建网格；surface 读当前层）。电梯 = 站在门口按动作键传送。
// 调试层：站位（洋红小圆盘）、路线（每 0.9 米一个小点）、门（门洞里一排小方点）。只在标签开着时画（?labels=0 的截图里没有）。
import * as THREE from 'three';
import { DECK_RAMPS } from '../clubpool/layout';
import type { Shape } from '../clubsite/play/nav';
import { smoothLine } from '../clubsite/render/geo';
import type { AssetCtx } from './ctx';
import {
  alongX,
  DOORS,
  FLOOR_Y,
  type Floor,
  FOOT,
  flightHeight,
  flightsOn,
  GOODS_LIFT,
  LIFT,
  levelOf,
  NEWEL,
  type Rect,
  type V2,
  WALKABLE,
  WALLS,
  walkOn,
  wallBlocked,
} from './layout';
import { SPECS } from './placeholders';
import { type P3, ROUTES, SPOTS } from './routes';
import { SLOTS } from './slots';
import { tagViews, viewOf, viewsFor } from './view';

/** 不挡路的资产：人、地毯、挂墙的板（板底离地）、屋顶 / 二楼外面的东西、攀柱的花 */
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
  'grate-band',
  'glass-block',
]);

const inR = (r: Rect, x: number, z: number) => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1;
const inAny = (rs: readonly Rect[], x: number, z: number) => rs.some((r) => inR(r, x, z));
const LIFT_SHAFT: Rect = { x0: LIFT.x0, x1: LIFT.x1, z0: LIFT.z0, z1: LIFT.z1 };
const GOODS_SHAFT: Rect = { x0: GOODS_LIFT.x0, x1: GOODS_LIFT.x1, z0: GOODS_LIFT.z0, z1: GOODS_LIFT.z1 };

/** 树：只挡树干（圆，半径 = 树干底的半径 × 缩放；树冠在头顶上，底下能走） */
const TRUNK: Record<string, number> = { 'fan-palm': 0.36 };

/** 某一层挡路的：墙 + 家具的脚印（矩形，转 90° 的换宽深；斜放的按包围盒）+ 楼梯栏板 + 电梯井。不给层 = 一层 */
export function houseBlocked(floor: Floor = 1): Shape[] {
  const cut = viewOf(true, floor);
  const out: Shape[] = [...wallBlocked(floor), NEWEL, LIFT_SHAFT, GOODS_SHAFT];
  for (const s of SLOTS) {
    if ((s.level ?? 1) !== floor || NO_BLOCK.has(s.asset) || s.noBlock || s.mode === 'out' || s.asset === 'lift')
      continue;
    // 这一层的剖面里看不到的不挡（views 只有 'out' 的钟楼塔身、烟囱：钟楼门厅、钟楼二层就在塔身里）。
    // 一层不给 mode 的（拱廊的长椅、花盆）viewsFor 含 '1f'，照样挡
    if (!(s.views ?? viewsFor(s.level ?? 1, s.mode)).includes(cut)) continue;
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

/** 壁泉的半圆小池（半径 w/2、圆心在本地 z −d/2 + 0.15，朝本地 +z 伸出去）：比 w × d 的脚印往外多伸 0.35 米，按半圆挡 */
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

/** 泳池北门的台阶（clubpool 的 DECK_RAMPS.north）在 clubwalk 里落在会所的范围（z < −1）：会所的 surface 也带上这段坡道 */
const POOL_STEPS = DECK_RAMPS.north;
function poolSteps(x: number, z: number): number | null {
  const r = POOL_STEPS;
  if (x < r.x0 || x > r.x1 || z < r.z0 || z > r.z1) return null;
  return r.from + ((r.to - r.from) * (z - r.z0)) / (r.z1 - r.z0);
}

/**
 * 某一层能站的高度（null = 不能站）：这一层的楼梯段 → 会所脚印里这一层的房间（一层 = 整个脚印）→ 脚印外的四周（WALKABLE，地面 0）。
 * 给 NavSpec.surface 用（坡道不放进 NavSpec.ramps：坡道是按层的）。
 */
export function surfaceOn(floor: Floor): (x: number, z: number) => number | null {
  const fl = flightsOn(floor);
  const rooms = walkOn(floor);
  return (x, z) => {
    for (const s of fl) {
      const h = flightHeight(s, x, z);
      if (h !== null) return h;
    }
    // 楼上、地下：这一层的房间（B1 比会所大，伸到巷子和沙地下面）；会所脚印里别的地方不能站；脚印外是地面
    if (floor !== 1 && inAny(rooms, x, z)) return FLOOR_Y[floor];
    if (inAny(FOOT[1], x, z)) return floor === 1 ? 0 : null;
    return poolSteps(x, z) ?? (inAny(WALKABLE, x, z) ? 0 : null);
  };
}

/** 一层的导航（clubwalk、独立页面都用）：walkable = 脚印 + 四周，blocked，surface（按层） */
export function houseNav(floor: Floor = 1) {
  return { walkable: WALKABLE, blocked: houseBlocked(floor), surface: surfaceOn(floor), ramps: [POOL_STEPS] };
}

/**
 * 脚下高度 y → 该用哪一层的导航（带滞回：上楼过 ±1.7 换，下楼回到 ±1.6 才换回来）。
 * 两个平台（±2）、半跑都同时在两层的导航里，所以换过去的那一刻总监脚下一定站得住。
 */
export function floorFor(cur: Floor, y: number): Floor {
  if (cur === 1) return y > 1.7 ? 2 : y < -1.7 ? -1 : 1;
  if (cur === 2) return y < 1.6 ? 1 : 2;
  return y > -1.6 ? 1 : -1;
}

/** 坐电梯：从这一层去哪一层（往上一层，到顶回到负一层） */
export const liftNext = (f: Floor): Floor => (f === -1 ? 1 : f === 1 ? 2 : -1);

/** 站位 / 路线的点 → 世界坐标的高度（y 给了用 y；不给：楼梯段里按一层的坡道，不然 0） */
const yOf = (p: P3) => (p.length > 2 ? (p[2] as number) : 0);
const levelOfY = (y: number): Floor => (y > 2 ? 2 : y < -2 ? -1 : 1);

export function buildNav(ctx: AssetCtx, _groundAt?: (x: number, z: number) => number): THREE.Group {
  const g = new THREE.Group();
  g.name = 'nav';
  const m = ctx.mat('navMark', { noShadowReceive: true });
  const disc = new THREE.CircleGeometry(0.28, 16).rotateX(-Math.PI / 2);
  const dot = new THREE.CircleGeometry(0.08, 6).rotateX(-Math.PI / 2);
  const sq = new THREE.PlaneGeometry(0.18, 0.18).rotateX(-Math.PI / 2);
  /** 一个标记：按高度归层（楼上 / 地下的只在那一层的剖面里显示；一层的在外观、一层、二层剖面都显示 —— 同 1F 的家具） */
  const mark = (geo: THREE.BufferGeometry, x: number, y: number, z: number) => {
    const o = new THREE.Mesh(geo, m);
    o.position.set(x, y + 0.06, z);
    const L = levelOfY(y);
    tagViews(o, L === 1 ? viewsFor(1) : viewsFor(L, 'in'));
    g.add(o);
  };
  for (const s of Object.values(SPOTS)) mark(disc, s.at[0], yOf(s.at), s.at[1]);
  for (const r of ROUTES) {
    // 按段插点：同一段两头高度不同（上下楼）时高度线性插值
    for (let i = 0; i + 1 < r.pts.length; i++) {
      const a = r.pts[i];
      const b = r.pts[i + 1];
      // 同一个 x、z 换 y 的一段 = 坐电梯：不画点（曲线长度 0）
      if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 1e-6) continue;
      const seg: V2[] = smoothLine([[a[0], a[1]] as V2, [b[0], b[1]] as V2], 0.9);
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      for (const [x, z] of seg) {
        const k = Math.hypot(x - a[0], z - a[1]) / len;
        mark(dot, x, yOf(a) + (yOf(b) - yOf(a)) * k, z);
      }
    }
  }
  // 门（外门）：门洞里一排小方点（沿门宽），门外 / 门里的站点画圆盘
  for (const d of Object.values(DOORS)) {
    const wall = WALLS.find((w) => {
      if (levelOf(w) !== 1) return false;
      const ax = alongX(w);
      const c = ax ? w.a[1] : w.a[0];
      const along = ax ? d.x : d.z;
      const across = ax ? d.z : d.x;
      const [a0, a1] = ax ? [w.a[0], w.b[0]] : [w.a[1], w.b[1]];
      return Math.abs(c - across) < 0.4 && along >= Math.min(a0, a1) && along <= Math.max(a0, a1);
    });
    const ax = wall ? alongX(wall) : d.facing === 's';
    for (let k = -2; k <= 2; k++) {
      const t = (k / 2) * (d.w / 2 - 0.15);
      mark(sq, ax ? d.x + t : d.x, 0.01, ax ? d.z : d.z + t);
    }
    for (const [x, z] of [d.out, d.in]) mark(disc, x, 0, z);
  }
  g.traverse((o) => {
    o.castShadow = false;
    o.receiveShadow = false;
  });
  return g;
}

/** 给标签用的站位中文名（SPOTS 里写了 name 的） */
export const SPOT_NAMES: Record<string, string> = Object.fromEntries(
  Object.entries(SPOTS)
    .filter(([, s]) => s.name)
    .map(([k, s]) => [k, s.name as string]),
);
