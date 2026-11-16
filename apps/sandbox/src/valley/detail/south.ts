// valley 细节：俱乐部山湾外、南棕榈谷（双棕榈、梅萨小区、印第安峡谷口和绿洲、峡谷高尔夫、汽车旅馆）、塔奎兹溪河床和峡谷（瀑布）、美术馆步道和观景台、酒店扩张地。
// 接口见 build.ts 的 DetailCtx。只改这个文件。
//
// 照 pixel-scene 的构图规矩（lessons.md「沙漠失败复盘」）：
// - 平地留白，细节成簇放在"值得跑过去"的地方（瀑布潭、河床里的木拍、绿洲、山嘴石堆、步道拐角），不满地撒；
// - 朝镜头（南）的竖直面自动落暗档 = 免费的暗带：河床北岸的冲刷坎、院墙、汽车旅馆的走廊、峡谷北壁的岩檐都朝南；
// - 可见的东西 ≥ 3 纹素（杆子 ≥ 0.14 米），栏杆、篱笆用一整条带子，不画一根根细杆；
// - 树冠、灌木用球面法线的团（不是面法线的多面体）；石头用面法线的切面；
// - 小植物不放在大东西的影子里（太阳在北边偏高，影子落向镜头 = 南边）。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Shape } from '../../clubsite/play';
import { topGeo as topGeoW } from '../../clubsite/render/geo';
import type { DetailCtx, InstItem } from '../build';
import {
  ANCHOR,
  along,
  type Bldg,
  BUILDINGS,
  distToLine,
  FLOOR,
  GREENS,
  HOTEL_PLOT,
  houses,
  inPoly,
  POIS,
  ROADS,
  S,
  SCALE,
  type V2,
  WASH,
  washDist,
} from '../layout';
import type { PalKey } from '../reuse';
import { inClubBox, LOOKOUT, mountainY, trailY } from '../terrain';

type V3 = readonly [number, number, number];
// 第三轮（2026-11-16）：山谷整体往俱乐部门口缩到 0.7（layout.ts 的 S）。这个文件里手写的世界坐标都按原尺寸写、过 S；
// 只缩位置，不缩大小（半径、偏移量、宽高照旧）。能从 layout 的数据（楼、路、POI、绿地）推出来的就从数据推。
/** S 的反过来（原尺寸的坐标；按原尺寸写的区域判断用） */
const U = (x: number, z: number): V2 => {
  const [a, b] = S(x, z);
  if (a === x && b === z) return [x, z];
  return [ANCHOR[0] + (x - ANCHOR[0]) / SCALE, ANCHOR[1] + (z - ANCHOR[1]) / SCALE];
};
/** 一串原尺寸的点 → 缩放后的 */
/** 原尺寸的 (x, y, z) → 缩放后的（y 不动） */
const xyS = (x: number, y: number, z: number): [number, number, number] => {
  const [a, b] = S(x, z);
  return [a, y, b];
};
const SL = (pts: readonly (readonly [number, number])[]): V2[] => pts.map(([x, z]) => S(x, z) as V2);
/** 水平顶面（clubsite/render/geo 的 topGeo；它要可写的点） */
const topGeo = (pts: readonly V2[], y: number) =>
  topGeoW(
    pts.map(([x, z]) => [x, z] as [number, number]),
    y,
  );
const TAU = Math.PI * 2;

// ── 几何小工具（都是本地原点；put 之前再摆） ───────────────────────────
/** 盒子：底在 y 0 */
const boxG = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d).translate(0, h / 2, 0);
/** 竖的圆柱（底在 y 0） */
const cylG = (rt: number, rb: number, h: number, seg = 6) =>
  new THREE.CylinderGeometry(rt, rb, h, seg).translate(0, h / 2, 0);
/** 一团（树冠、灌木）：球面法线（每团有亮顶、中腰、暗底），再按轴缩放 */
function blobG(r: number, sx = 1, sy = 1, sz = 1): THREE.BufferGeometry {
  // 小团（花、球、小灌木，最大半轴 < 0.45 米）用 20 面就够了（屏幕上不到 10 纹素）
  const g = new THREE.IcosahedronGeometry(r, r * Math.max(sx, sy, sz) < 0.45 ? 0 : 1);
  const p = g.attributes.position as THREE.BufferAttribute;
  const n = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const v = new THREE.Vector3(p.getX(i), p.getY(i), p.getZ(i)).normalize();
    n.set([v.x, v.y, v.z], i * 3);
  }
  g.setAttribute('normal', new THREE.BufferAttribute(n, 3));
  g.deleteAttribute('uv');
  return g.scale(sx, sy, sz);
}
/** 石头：面法线的十二面体，压扁、转一下 */
function rockG(r: number, rnd: () => number, flat = 0.62): THREE.BufferGeometry {
  const g = new THREE.DodecahedronGeometry(r, 0);
  g.scale(0.85 + rnd() * 0.35, flat * (0.8 + rnd() * 0.4), 0.85 + rnd() * 0.35);
  g.rotateY(rnd() * TAU);
  g.rotateX((rnd() - 0.5) * 0.3);
  return g;
}
/** 棕榈的冠：n 片往下垂的叶（扁长条，单双数垂得不一样）+ 中间一小团；长 L、宽 w、在 y */
function fronds(n: number, L: number, w: number, y: number): THREE.BufferGeometry {
  const list: THREE.BufferGeometry[] = [prep(blobG(0.6).translate(0, y, 0))];
  for (let k = 0; k < n; k++) {
    const a = (k / n) * TAU + (k % 2) * 0.2;
    const droop = k % 2 ? 0.6 : 0.3;
    list.push(
      prep(
        new THREE.BoxGeometry(w, 0.09, L)
          .translate(0, 0, L / 2 - 0.1)
          .rotateX(droop)
          .rotateY(a)
          .translate(0, y, 0),
      ),
    );
  }
  return mergeGeometries(list);
}
/** 三角形攒成的面：朝下的翻过来（坡、带子的绕向不定） */
function upTris(pos: number[]): THREE.BufferGeometry {
  for (let i = 0; i < pos.length; i += 9) {
    const ax = pos[i + 3] - pos[i];
    const az = pos[i + 5] - pos[i + 2];
    const bx = pos[i + 6] - pos[i];
    const bz = pos[i + 8] - pos[i + 2];
    if (az * bx - ax * bz < 0) {
      for (let k = 0; k < 3; k++) {
        const t = pos[i + 3 + k];
        pos[i + 3 + k] = pos[i + 6 + k];
        pos[i + 6 + k] = t;
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}
/** 合并前统一（同 build.ts 的 prep）：不带索引、只留 position + normal */
function prep(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const o = g.index ? g.toNonIndexed() : g;
  for (const k of Object.keys(o.attributes)) if (k !== 'position' && k !== 'normal') o.deleteAttribute(k);
  if (!o.attributes.normal) o.computeVertexNormals();
  return o;
}
/** 折线上离 (x, z) 最近的点 */
function closest(pts: readonly V2[], x: number, z: number): V2 {
  let best = Number.POSITIVE_INFINITY;
  let out: V2 = pts[0];
  for (let i = 1; i < pts.length; i++) {
    const [ax, az] = pts[i - 1];
    const [bx, bz] = pts[i];
    const dx = bx - ax;
    const dz = bz - az;
    const L = dx * dx + dz * dz;
    const t = L > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L)) : 0;
    const qx = ax + dx * t;
    const qz = az + dz * t;
    const dd = Math.hypot(x - qx, z - qz);
    if (dd < best) {
      best = dd;
      out = [qx, qz];
    }
  }
  return out;
}
/** 一维的平滑起伏（-1…1）：三个正弦叠起来，相位按种子 */
const wav = (s: number, ph: readonly number[], k = 1) =>
  Math.sin(s / (41 * k) + ph[0]) * 0.5 + Math.sin(s / (17 * k) + ph[1]) * 0.3 + Math.sin(s / (7.3 * k) + ph[2]) * 0.2;
const smooth01 = (t: number) => {
  const k = Math.max(0, Math.min(1, t));
  return k * k * (3 - 2 * k);
};
/** 不规则的一圈（池塘、碎石场）：中心、半径、抖动 */
function blobPoly(cx: number, cz: number, rx: number, rz: number, rnd: () => number, n = 12, jit = 0.22): V2[] {
  const out: V2[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    const k = 1 + (rnd() - 0.5) * 2 * jit;
    out.push([cx + Math.cos(a) * rx * k, cz + Math.sin(a) * rz * k]);
  }
  return out;
}
/** 圆角矩形（泳池）：中心、宽、深、圆角、转角 */
function roundRect(cx: number, cz: number, w: number, h: number, r: number, rot: number): V2[] {
  const out: V2[] = [];
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  const corners: [number, number, number][] = [
    [w / 2 - r, h / 2 - r, 0],
    [-w / 2 + r, h / 2 - r, Math.PI / 2],
    [-w / 2 + r, -h / 2 + r, Math.PI],
    [w / 2 - r, -h / 2 + r, Math.PI * 1.5],
  ];
  for (const [ox, oz, a0] of corners)
    for (let k = 0; k <= 3; k++) {
      const a = a0 + (k / 3) * (Math.PI / 2);
      const lx = ox + Math.cos(a) * r;
      const lz = oz + Math.sin(a) * r;
      out.push([cx + lx * c + lz * s, cz - lx * s + lz * c]);
    }
  return out;
}

// ── 河床中线：按离起点的距离取点、半宽、切向 ─────────────────────────
interface WashSample {
  s: number;
  x: number;
  z: number;
  tx: number;
  tz: number;
  h: number;
}
function washSamples(step: number, xMax: number): WashSample[] {
  const out: WashSample[] = [];
  let acc = 0;
  const { pts, half } = WASH;
  for (let i = 1; i < pts.length; i++) {
    const [ax, az] = pts[i - 1];
    const [bx, bz] = pts[i];
    const L = Math.hypot(bx - ax, bz - az);
    for (let u = acc === 0 ? 0 : step - (acc % step); u < L; u += step) {
      const t = u / L;
      const x = ax + (bx - ax) * t;
      if (x > xMax) return out;
      out.push({
        s: acc + u,
        x,
        z: az + (bz - az) * t,
        tx: (bx - ax) / L,
        tz: (bz - az) / L,
        h: half[i - 1] + (half[i] - half[i - 1]) * t,
      });
    }
    acc += L;
  }
  return out;
}

export function detailSouth(d: DetailCtx): void {
  const HOUSES = houses();
  const BLD: Bldg[] = [...BUILDINGS, ...HOUSES];
  const reg = (x: number, z: number) => d.regionOf(x, z);

  // ── 攒几何：三角形按（区域, 材质），零件直接 put ──
  const tris = new Map<string, number[]>();
  const tri = (r: string, key: PalKey, a: V3, b: V3, c: V3, flat = false) => {
    // 薄片按 160 米一块分开（实例化网格按整体包围球剔除：一整片区域一个网格就永远剔不掉）
    const k = `${r}|${key}${flat ? `|${Math.floor(a[0] / 160)}_${Math.floor(a[2] / 160)}` : ''}`;
    let l = tris.get(k);
    if (!l) {
      l = [];
      tris.set(k, l);
    }
    l.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
  };
  const quad = (r: string, key: PalKey, a: V3, b: V3, c: V3, e: V3) => {
    tri(r, key, a, b, c);
    tri(r, key, a, c, e);
  };
  /**
   * 贴地的薄片（水面、积沙、车道、草纹、坎）：不投影。build 按材质定投不投影，水、积沙、水泥、草纹都投 ——
   * 薄片自己投自己，太阳低的时候满是麻点（第二轮：傍晚的高尔夫草纹一片噪点）。走 instance(cast = false)，锁着照样压暗
   */
  const fquad = (r: string, key: PalKey, a: V3, b: V3, c: V3, e: V3) => {
    tri(r, key, a, b, c, true);
    tri(r, key, a, c, e, true);
  };
  const flats = new Map<string, THREE.BufferGeometry[]>();
  const putF = (key: PalKey, g: THREE.BufferGeometry, x: number, y: number, z: number, rot = 0, r?: string) => {
    if (rot) g.rotateY(rot);
    g.translate(x, y, z);
    g.computeBoundingBox();
    const c = (g.boundingBox as THREE.Box3).getCenter(new THREE.Vector3());
    const k = `${r ?? reg(x, z)}|${key}|${Math.floor(c.x / 160)}_${Math.floor(c.z / 160)}`;
    const l = flats.get(k) ?? [];
    l.push(prep(g));
    flats.set(k, l);
  };
  /** 摆一件：本地几何 → 绕 y 转 → 平移；区域按 (x, z) */
  const put = (key: PalKey, g: THREE.BufferGeometry, x: number, y: number, z: number, rot = 0, r?: string) => {
    if (rot) g.rotateY(rot);
    g.translate(x, y, z);
    d.put(r ?? reg(x, z), key, g);
  };
  /**
   * 散在大片地上的石头：按 320 米一块分开合并、走 instance（投影），视锥外的块不画。
   * 原来合进（区域, 材质）一个网格：山脚一圈几百块石头横跨整张图，在哪都全画（第二轮：河床那边三角形超预算）
   */
  const rocks = new Map<string, THREE.BufferGeometry[]>();
  const putC = (key: PalKey, g: THREE.BufferGeometry, x: number, y: number, z: number, rot = 0, r?: string) => {
    if (rot) g.rotateY(rot);
    g.translate(x, y, z);
    const k = `${r ?? reg(x, z)}|${key}|${Math.floor(x / 320)}_${Math.floor(z / 320)}`;
    const l = rocks.get(k) ?? [];
    l.push(prep(g));
    rocks.set(k, l);
  };
  const blocked = (sh: Shape) => d.block(sh);
  const blockC = (x: number, z: number, r: number) => blocked({ x, z, r });

  // ── 占地检查：平地里、不在俱乐部那块、离路 / 楼 / 绿地远 ──
  const inHotel = (x: number, z: number, pad = 0) =>
    x > HOTEL_PLOT.x0 - pad && x < HOTEL_PLOT.x1 + pad && z > HOTEL_PLOT.z0 - pad && z < HOTEL_PLOT.z1 + pad;
  const nearRoad = (x: number, z: number, pad: number, trails = true) =>
    ROADS.some((q) => (trails || q.kind !== 'trail') && distToLine(q.pts, x, z) < q.w / 2 + pad);
  const nearBldg = (x: number, z: number, pad: number, skip?: Bldg) => {
    for (const o of BLD) {
      if (o === skip) continue;
      const R = Math.max(o.w, o.d) / 2 + pad;
      if (Math.abs(o.x - x) > R || Math.abs(o.z - z) > R) continue;
      const c = Math.cos(o.rot ?? 0);
      const s = Math.sin(o.rot ?? 0);
      const X = x - o.x;
      const Z = z - o.z;
      if (Math.abs(X * c - Z * s) < o.w / 2 + pad && Math.abs(X * s + Z * c) < o.d / 2 + pad) return true;
    }
    return false;
  };
  const inGreen = (x: number, z: number) => GREENS.some((q) => inPoly(q.poly, x, z));
  const inFloor = (x: number, z: number) => inPoly(FLOOR, x, z);
  const free = (x: number, z: number, pad = 1) =>
    inFloor(x, z) &&
    !inClubBox(x, z) &&
    !inHotel(x, z, 2) &&
    !nearRoad(x, z, pad) &&
    !nearBldg(x, z, pad) &&
    !inGreen(x, z);
  /** 地面高度：平地 0，山上按高度场 */
  const groundY = (x: number, z: number) => (inFloor(x, z) ? 0 : Math.max(0, mountainY(x, z)));

  // ── 小件：石头、植物（成簇摆，不满地撒） ──
  const rock = (x: number, z: number, r: number, rnd: () => number, key: PalKey = 'rock', y?: number, flat = 0.62) => {
    const gy = y ?? groundY(x, z);
    putC(key, rockG(r, rnd, flat), x, gy + r * flat * 0.35, z);
  };
  const shrub = (x: number, z: number, s: number, key: PalKey = 'sage', y = 0) =>
    put(key, blobG(0.7 * s, 1.1, 0.72, 1), x, y + 0.32 * s, z);
  const brittle = (x: number, z: number, s: number, rnd: () => number, y = 0) => {
    put('silverBlue', blobG(0.6 * s, 1.1, 0.7, 1), x, y + 0.3 * s, z);
    for (let k = 0; k < 3; k++) {
      const a = rnd() * TAU;
      put('flowerYellow', blobG(0.18 * s), x + Math.cos(a) * 0.35 * s, y + 0.62 * s, z + Math.sin(a) * 0.3 * s);
    }
  };
  const agave = (x: number, z: number, s: number, rnd: () => number, y = 0, key: PalKey = 'silverBlue') => {
    const n = 7;
    const a0 = rnd() * TAU;
    for (let k = 0; k < n; k++) {
      const a = a0 + (k / n) * TAU;
      const g = boxG(0.24 * s, 0.9 * s, 0.1 * s)
        .rotateX(0.62 + (k % 2) * 0.25)
        .rotateY(a);
      put(key, g, x, y, z);
    }
    put(key, blobG(0.22 * s, 1, 1.6, 1), x, y + 0.2 * s, z);
  };
  const barrel = (x: number, z: number, s: number, y = 0) => {
    put('cactus', blobG(0.34 * s, 1, 1.15, 1), x, y + 0.36 * s, z);
    put('flowerYellow', blobG(0.13 * s, 1, 0.6, 1), x, y + 0.76 * s, z);
  };
  const ocotillo = (x: number, z: number, s: number, rnd: () => number, y = 0) => {
    const n = 5 + Math.floor(rnd() * 3);
    const bloom = rnd() < 0.6;
    for (let k = 0; k < n; k++) {
      const a = rnd() * TAU;
      const tilt = 0.12 + rnd() * 0.22;
      const L = (2.6 + rnd() * 1.4) * s;
      const g = cylG(0.06, 0.08, L, 4).rotateZ(tilt).rotateY(a);
      put('branch', g, x, y, z);
      if (bloom) {
        const tx = x - Math.sin(tilt) * L * Math.cos(a);
        const tz = z + Math.sin(tilt) * L * Math.sin(a);
        put('flowerRed', boxG(0.16, 0.3, 0.16), tx, y + Math.cos(tilt) * L - 0.05, tz);
      }
    }
  };
  const cholla = (x: number, z: number, s: number, rnd: () => number, y = 0) => {
    put('dryGrass', cylG(0.16 * s, 0.18 * s, 0.9 * s, 5), x, y, z);
    for (let k = 0; k < 3; k++) {
      const a = rnd() * TAU;
      const g = cylG(0.13 * s, 0.14 * s, 0.55 * s, 5)
        .rotateZ(0.7)
        .rotateY(a);
      put('dryGrass', g, x, y + (0.45 + k * 0.12) * s, z);
    }
  };
  // 烟树、假紫荆：几种造型各做一份几何，实例化摆（第二轮：原来每棵树十来团各自合进区域的大网格，河床那片永远剔不掉，三角形超预算）
  const treeKinds = (() => {
    const rnd = d.rng('valley:south:treeKinds');
    const smoke: { trunk: THREE.BufferGeometry; crown: THREE.BufferGeometry }[] = [];
    for (let v = 0; v < 2; v++) {
      const n = 6 + v;
      const blobs: THREE.BufferGeometry[] = [];
      for (let k = 0; k < n; k++) {
        const a = (k / n) * TAU + rnd() * 0.6;
        const rr = k === 0 ? 0 : 0.7 + rnd() * 0.6;
        const y = k === 0 ? 2.5 : 1.5 + rnd() * 1.2;
        blobs.push(prep(blobG(0.75 + rnd() * 0.4, 1, 0.85, 1).translate(Math.cos(a) * rr, y, Math.sin(a) * rr)));
      }
      smoke.push({ trunk: cylG(0.1, 0.15, 1.3, 5), crown: mergeGeometries(blobs) });
    }
    const palo: { limbs: THREE.BufferGeometry; green: THREE.BufferGeometry; bloom: THREE.BufferGeometry | null }[] = [];
    for (let v = 0; v < 2; v++) {
      const limbs: THREE.BufferGeometry[] = [];
      for (let k = 0; k < 3; k++)
        limbs.push(
          prep(
            cylG(0.1, 0.16, 2.3, 5)
              .rotateZ(0.42 + rnd() * 0.2)
              .rotateY((k / 3) * TAU + rnd()),
          ),
        );
      const bloom = v === 1;
      const n = 5 + (v % 2);
      const green: THREE.BufferGeometry[] = [];
      const yellow: THREE.BufferGeometry[] = [];
      for (let k = 0; k < n; k++) {
        const a = (k / n) * TAU + rnd() * 0.5;
        const rr = k === 0 ? 0 : 1.1 + rnd() * 0.7;
        const g = prep(
          blobG(1.0 + rnd() * 0.35, 1, 0.5, 1).translate(Math.cos(a) * rr, 2.5 + rnd() * 0.6, Math.sin(a) * rr),
        );
        (bloom && k % 2 ? yellow : green).push(g);
      }
      palo.push({
        limbs: mergeGeometries(limbs),
        green: mergeGeometries(green),
        bloom: yellow.length ? mergeGeometries(yellow) : null,
      });
    }
    return { smoke, palo };
  })();
  const smokeItems: InstItem[][] = treeKinds.smoke.map(() => []);
  const paloItems: InstItem[][] = treeKinds.palo.map(() => []);
  /** 烟树：灰蓝的一团烟（几小团），细干 */
  const smokeTree = (x: number, z: number, rnd: () => number, s = 1) => {
    smokeItems[Math.floor(rnd() * smokeItems.length)].push({ x, z, s, reg: reg(x, z), rot: rnd() * TAU });
    blockC(x, z, 0.35 * s);
  };
  /** 假紫荆（palo verde）：绿皮的干分三杈，冠扁而宽，开花的撒黄 */
  const paloVerde = (x: number, z: number, rnd: () => number, s = 1) => {
    paloItems[Math.floor(rnd() * paloItems.length)].push({ x, z, s, reg: reg(x, z), rot: rnd() * TAU });
    blockC(x, z, 0.4 * s);
  };

  // ── 棕榈：实例化（扇叶棕榈有一圈枯叶裙；观赏棕榈细干、无裙） ──
  const fanPalms: InstItem[] = [];
  const ornPalms: InstItem[] = [];
  const fanPalm = (x: number, z: number, s: number, rnd: () => number) => {
    fanPalms.push({ x, z, s, reg: reg(x, z), rot: rnd() * TAU });
    blockC(x, z, 0.5 * s);
  };
  const ornPalm = (x: number, z: number, s: number, rnd: () => number) => {
    ornPalms.push({ x, z, s, reg: reg(x, z), rot: rnd() * TAU });
    blockC(x, z, 0.35 * s);
  };

  // ── 酒店扩张地的东西：跟着"酒店盖好"的开关一起藏（挂到 build 的空地组上） ──
  /** 键 = `材质|投不投影` */
  const hotelBits = new Map<string, THREE.BufferGeometry[]>();
  const putHotel = (key: PalKey, g: THREE.BufferGeometry, x: number, y: number, z: number, rot = 0, cast = true) => {
    if (rot) g.rotateY(rot);
    g.translate(x, y, z);
    const k = `${key}|${cast && !['path', 'sandDrift', 'sandHigh'].includes(key) ? 1 : 0}`;
    const l = hotelBits.get(k) ?? [];
    l.push(prep(g));
    hotelBits.set(k, l);
  };

  /**
   * 夜里亮的东西（clubsite/daylight 的 userData.night）：每组 [白天的材质, 亮着的材质, 自发光色, 几何]，天黑换成自发光的那套；
   * pool = 地上的一圈灯光 [x, z, 半径, 照到的最高 y]。自发光的材质从 d.mat 复制一份（不动共用的那份）
   */
  function nightGlow(
    name: string,
    parts: [PalKey, PalKey, number, THREE.BufferGeometry[]][],
    pool?: [number, number, number, number],
  ) {
    const g = new THREE.Group();
    g.name = `valley:${name}`;
    const sets: { m: THREE.Mesh; off: THREE.Material; on: THREE.Material }[] = [];
    for (const [offKey, onKey, emissive, list] of parts) {
      if (!list.length) continue;
      const geo = mergeGeometries(list.map(prep));
      for (const x of list) x.dispose();
      if (!geo) continue;
      const base = d.mat(onKey) as THREE.MeshToonMaterial & { defines?: Record<string, string> };
      const on = base.clone() as typeof base;
      on.onBeforeCompile = base.onBeforeCompile;
      on.customProgramCacheKey = base.customProgramCacheKey;
      on.userData = base.userData; // 法线 pass 的材质（描边）共用
      on.defines = { ...base.defines };
      on.emissive = new THREE.Color(emissive);
      const off = d.mat(offKey);
      const m = new THREE.Mesh(geo, off);
      m.castShadow = true;
      m.receiveShadow = true;
      g.add(m);
      sets.push({ m, off, on });
    }
    g.userData.night = {
      setOn: (lit: boolean) => {
        for (const s of sets) s.m.material = lit ? s.on : s.off;
      },
      ...(pool ? { pool: () => pool } : {}),
    };
    d.root.add(g);
  }

  // build 的散撒灌木、大道棕榈让开这几块铺过 / 摆满的地
  // （原尺寸的框：中心过 S，大小照旧；酒店工地不缩；汽车旅馆的停车场在 motel() 里按楼和路算）
  const clearS = (x0: number, x1: number, z0: number, z1: number) => {
    const [cx, cz] = S((x0 + x1) / 2, (z0 + z1) / 2);
    d.clear({ x0: cx - (x1 - x0) / 2, x1: cx + (x1 - x0) / 2, z0: cz - (z1 - z0) / 2, z1: cz + (z1 - z0) / 2 });
  };
  d.clear({ x0: 141, x1: 234, z0: 22, z1: 102 }); // 酒店工地
  clearS(4, 28, -622, -598); // 瀑布潭
  clearS(26, 40, -626, -606); // 铭牌、踏石
  clearS(615, 632, -455, -440); // 木拍
  clearS(200, 213, -555, -547); // 峡谷步道口
  clearS(266, 286, -26, -14); // 俱乐部名牌
  clearS(300, 317, 261, 276); // 绿洲的潭
  clearS(284, 314, 180, 189); // 峡谷入口门柱
  clearS(885, 926, 155, 182); // 高尔夫的水障碍
  mountainFoot();
  washBanks();
  washFloor();
  racket();
  canyon();
  oasis();
  yards();
  motel();
  golf();
  drive();
  hotelSite();
  spur();
  museumTrail();

  // ── 收尾：三角形、实例、酒店组 ──
  for (const [k, pos] of tris) {
    const [r, key, f] = k.split('|') as [string, PalKey, string?];
    if (f) {
      const l = flats.get(k) ?? [];
      l.push(upTris(pos));
      flats.set(k, l);
    } else d.put(r, key, upTris(pos));
  }
  for (const [k, list] of rocks) {
    const [r, key] = k.split('|') as [string, PalKey];
    const g = mergeGeometries(list);
    for (const x of list) x.dispose();
    if (g) d.instance(g, key, [{ x: 0, z: 0, s: 1, reg: r }], true);
  }
  for (const [k, list] of flats) {
    const [r, key] = k.split('|') as [string, PalKey];
    const g = mergeGeometries(list);
    for (const x of list) x.dispose();
    if (g) d.instance(g, key, [{ x: 0, z: 0, s: 1, reg: r }], false);
  }
  {
    const trunk = new THREE.CylinderGeometry(0.3, 0.46, 9, 6).translate(0, 4.5, 0);
    const skirt = new THREE.CylinderGeometry(0.85, 1.2, 3.6, 7).translate(0, 6.9, 0);
    const crown = fronds(10, 2.9, 0.62, 8.8);
    d.instance(trunk, 'palmTrunk', fanPalms);
    d.instance(skirt, 'palmSkirt', fanPalms);
    d.instance(crown, 'palm', fanPalms);
    const t2 = new THREE.CylinderGeometry(0.2, 0.3, 7.4, 5).translate(0, 3.7, 0);
    const c2 = fronds(8, 3, 0.55, 7.4);
    d.instance(t2, 'palmTrunk', ornPalms);
    d.instance(c2, 'palm', ornPalms);
    treeKinds.smoke.forEach((t, v) => {
      if (!smokeItems[v].length) return;
      d.instance(t.trunk, 'branch', smokeItems[v]);
      d.instance(t.crown, 'silverBlue', smokeItems[v]);
    });
    treeKinds.palo.forEach((t, v) => {
      if (!paloItems[v].length) return;
      d.instance(t.limbs, 'cactus', paloItems[v]);
      d.instance(t.green, 'yellowGreen', paloItems[v]);
      if (t.bloom) d.instance(t.bloom, 'flowerYellow', paloItems[v]);
    });
  }
  {
    const stakes = d.mat('toolOrange');
    const plot = d.root.children.find(
      (o) => o instanceof THREE.Group && o.children.some((c) => (c as THREE.Mesh).material === stakes),
    );
    for (const [k, list] of hotelBits) {
      const [key, cast] = k.split('|') as [PalKey, string];
      const g = mergeGeometries(list);
      for (const x of list) x.dispose();
      if (!g) continue;
      const m = new THREE.Mesh(g, d.mat(key));
      m.name = `valley:hotelSite:${key}`;
      m.castShadow = cast === '1';
      m.receiveShadow = true;
      (plot ?? d.root).add(m);
    }
  }

  // ════════════════════════════════════════════════════════════════════
  /** 山脚的碎石坡：沿平地边一簇一簇（不是一整条），一半压在山坡上 —— 平地和山之间不再是一条干净的线 */
  function mountainFoot() {
    const rnd = d.rng('valley:south:foot');
    for (let i = 0; i < FLOOR.length; i++) {
      const [ax, az] = FLOOR[i === 0 ? FLOOR.length - 1 : i - 1];
      const [bx, bz] = FLOOR[i];
      const mx = (ax + bx) / 2;
      const mz = (az + bz) / 2;
      const [ux, uz] = U(mx, mz);
      const mine = (ux < 200 && uz < -50 && uz > -800) || (uz > 80 && ux > 100 && ux <= 1100);
      if (!mine) continue;
      const L = Math.hypot(bx - ax, bz - az);
      const tx = (bx - ax) / L;
      const tz = (bz - az) / L;
      // 朝山的那一侧
      let nx = -tz;
      let nz = tx;
      if (inFloor(mx + nx * 3, mz + nz * 3)) {
        nx = -nx;
        nz = -nz;
      }
      for (let u = rnd() * 20; u < L; u += 14 + rnd() * 34) {
        const out = -3 + rnd() * 10;
        const cx = ax + tx * u + nx * out;
        const cz = az + tz * u + nz * out;
        if (inClubBox(cx, cz) || inHotel(cx, cz, 4)) continue;
        const n = 3 + Math.floor(rnd() * 6);
        for (let k = 0; k < n; k++) {
          const r = k === 0 ? 1.2 + rnd() * 1.4 : 0.35 + rnd() * rnd() * 1.4;
          const x = cx + (rnd() - 0.5) * 9 * tx + (rnd() - 0.3) * 5 * nx;
          const z = cz + (rnd() - 0.5) * 9 * tz + (rnd() - 0.3) * 5 * nz;
          if (inClubBox(x, z) || nearRoad(x, z, r + 1) || nearBldg(x, z, r + 1.5)) continue;
          const fl = inFloor(x, z);
          rock(x, z, r, rnd, rnd() < 0.3 ? 'rockCool' : 'rock', fl ? 0 : Math.max(0, mountainY(x, z)) - r * 0.2);
          if (fl && r > 0.8) blockC(x, z, r * 0.85);
        }
        // 石堆北边（影子落不到的一侧）长一两丛
        const px = cx - nz * 0 + (rnd() - 0.5) * 4;
        const pz = cz - 2.5 - rnd() * 2;
        if (free(px, pz, 1)) {
          const pick = rnd();
          if (pick < 0.35) brittle(px, pz, 0.9 + rnd() * 0.5, rnd);
          else if (pick < 0.6) ocotillo(px, pz, 0.9 + rnd() * 0.3, rnd);
          else if (pick < 0.8) agave(px, pz, 1 + rnd() * 0.4, rnd);
          else shrub(px, pz, 1 + rnd() * 0.6, 'olive');
        }
      }
    }
  }

  // ════════════════════════════════════════════════════════════════════
  /**
   * 河床两岸的冲刷坎：自然冲出来的土坎，不是一道墙。
   * 第二轮（用户截图：桥边一条又长又直的棕色斜带）改成：
   * - 只有一段一段（北岸约一半、南岸四分之一有坎），两头慢慢缓下去，中间是缓坡（能下河床的地方）；
   * - 坎线在平面上大幅摆动（±4.5 米）+ 一口口被水啃进去的"咬口"，不跟着河床边那条直线走；
   * - 矮（北岸 0.2～0.9 米、南岸 0.15～0.5 米），高低沿河变；咬口处陡（朝镜头落暗档），别处是缓坡（落中档）——暗的只是一截截、宽窄不一；
   * - 坎面用深一档的积沙（和沙同一套颜色），不用崖壁的靛紫；没有亮的坎沿条带；
   * - 离路面边 3 米内、步道 1.5 米内、楼边、平地外都没有（过河的地方是平的）；咬口下面零星几块塌下来的土团。
   */
  function washBanks() {
    const rnd = d.rng('valley:south:banks');
    const samp = washSamples(2, S(995, 0)[0]);
    const n = samp.length;
    /** 离路面边多远（步道只要让 1.5 米：算成多 1.5 米，和车道的 3 米用同一个门槛） */
    const roadEdge = (x: number, z: number) => {
      let best = Number.POSITIVE_INFINITY;
      for (const q of ROADS) {
        const dd = distToLine(q.pts, x, z) - q.w / 2 + (q.kind === 'trail' ? 1.5 : 0);
        if (dd < best) best = dd;
      }
      return best;
    };
    for (const side of [-1, 1] as const) {
      const north = side < 0;
      const phA = [rnd() * TAU, rnd() * TAU, rnd() * TAU];
      const phB = [rnd() * TAU, rnd() * TAU, rnd() * TAU];
      const phC = [rnd() * TAU, rnd() * TAU, rnd() * TAU];
      const phD = [rnd() * TAU, rnd() * TAU];
      const thr = north ? 0.0 : 0.32;
      const hs = new Float64Array(n);
      const bites = new Float64Array(n);
      const pts: { o: V2[]; r: string }[] = [];
      for (let i = 0; i < n; i++) {
        const q = samp[i];
        const nx = -q.tz * side;
        const nz = q.tx * side;
        // 有没有坎：慢的起伏过了门槛才有，过门槛那一段（约 8～15 米）缓缓长出来
        const pres = smooth01((wav(q.s, phC, 1.7) - thr) / 0.28);
        // 咬口：两个正弦相乘取正的部分 —— 隔一阵一口，宽窄不一
        const bite = Math.max(0, Math.sin(q.s / 10.3 + phD[0]) * Math.sin(q.s / 4.1 + phD[1]));
        const hh = (north ? 0.55 + 0.32 * wav(q.s * 1.9, phB) : 0.32 + 0.16 * wav(q.s * 1.9, phB)) * (0.8 + 0.4 * bite);
        const off = q.h - 1.2 + 4.5 * wav(q.s, phA, 1.3) + bite * 2.4;
        // 坎面的水平跨度：咬口处陡（≈ 60°），别处缓（≈ 30°）
        const run = hh * (0.55 + 1.2 * (1 - bite));
        const back = 2.2 + hh * 5;
        const ks = [off, off + run, off + run + back];
        const o = ks.map((k) => [q.x + nx * k, q.z + nz * k] as V2);
        pts.push({ o, r: reg(q.x + nx * off, q.z + nz * off) });
        // 离路面、步道、楼、平地边：近了就没有
        let room = Number.POSITIVE_INFINITY;
        for (const [x, z] of [...o, [q.x + nx * (off - 1.5), q.z + nz * (off - 1.5)] as V2])
          room = Math.min(room, roadEdge(x, z));
        const outer = o[2];
        const ok = inFloor(outer[0], outer[1]) && !inClubBox(outer[0], outer[1]) && !nearBldg(outer[0], outer[1], 1.5);
        const fade = ok ? smooth01((room - 3) / 6) : 0;
        hs[i] = hh * pres * fade;
        bites[i] = bite;
      }
      for (let i = 1; i < n; i++) {
        const h0 = hs[i - 1];
        const h1 = hs[i];
        // 两头都要有（缓下去的那头 h 很小但不为 0）：一头为 0 的段不画，免得斜着拖进路面
        if (h0 <= 0 || h1 <= 0 || (h0 < 0.03 && h1 < 0.03)) continue;
        const A = pts[i - 1].o;
        const B = pts[i].o;
        const P = (o: V2[], k: number, h: number): V3 => [
          o[k][0],
          k === 1 ? h + 0.006 : k === 0 ? 0.004 : 0.006,
          o[k][1],
        ];
        const r = pts[i].r;
        fquad(r, 'sandDrift', P(A, 0, h0), P(B, 0, h1), P(B, 1, h1), P(A, 1, h0));
        fquad(r, 'sand', P(A, 1, h0), P(B, 1, h1), P(B, 2, h1), P(A, 2, h0));
      }
      // 挡路：坎顶那条线（高过 0.4 米的连成一段段胶囊）
      let segStart = -1;
      for (let i = 0; i <= n; i++) {
        const tall = i < n && hs[i] > 0.4;
        if (tall && segStart < 0) segStart = i;
        if (!tall && segStart >= 0) {
          for (let k = segStart + 1; k < i; k += 2) {
            const a = pts[k - 1].o[1];
            const b = pts[Math.min(i - 1, k + 1)].o[1];
            blocked({ a, b, r: 0.4 });
          }
          segStart = -1;
        }
      }
      // 咬口下面：塌下来的土团（扁的积沙团，偶尔一块石头），零星
      for (let i = 2; i < n - 2; i += 3) {
        if (hs[i] < 0.35 || bites[i] < 0.6 || rnd() < 0.55) continue;
        const q = samp[i];
        const nx = -q.tz * side;
        const nz = q.tx * side;
        const [fx, fz] = pts[i].o[0];
        const m = 1 + Math.floor(rnd() * 3);
        for (let k = 0; k < m; k++) {
          const t = (rnd() - 0.5) * 3;
          const inw = 0.3 + rnd() * 1.2;
          const x = fx + q.tx * t - nx * inw;
          const z = fz + q.tz * t - nz * inw;
          if (roadEdge(x, z) < 2) continue;
          const s = 0.35 + rnd() * 0.45;
          put('sandDrift', blobG(s, 1.4, 0.45, 1.1), x, 0.02, z, rnd() * TAU);
        }
        if (rnd() < 0.3) rock(fx - nx * 0.8, fz - nz * 0.8, 0.3 + rnd() * 0.3, rnd, 'rock', 0);
      }
    }
  }

  // ════════════════════════════════════════════════════════════════════
  /** 河床里：两三条干了的水道（深一档的沙）、几块沙洲、成簇的卵石和大石头、烟树、岸上的假紫荆 */
  function washFloor() {
    const rnd = d.rng('valley:south:washfloor');
    const samp = washSamples(4, S(1000, 0)[0]);
    const trail = ROADS.find((q) => q.id === 'wash_trail')?.pts ?? [];
    const offTrail = (x: number, z: number, pad: number) => distToLine(trail, x, z) > 1.3 + pad && !nearRoad(x, z, pad);
    // 干水道：时断时续（辫状），宽窄变
    for (let ch = 0; ch < 3; ch++) {
      const ph = [rnd() * TAU, rnd() * TAU, rnd() * TAU];
      const base = (ch - 1) * 0.35;
      let prev: { l: V3; r: V3 } | null = null;
      for (const q of samp) {
        // 一截截（30～90 米），不是一条贯穿几百米的长带
        const on = Math.sin(q.s / 23 + ph[0] * 3) + 0.5 * Math.sin(q.s / 9.7 + ph[2]) > 0.1 + ch * 0.25;
        const off = q.h * (base + 0.38 * wav(q.s, ph, 0.9));
        const hw = 0.6 + 0.9 * (0.5 + 0.5 * Math.sin(q.s / 23 + ph[1]));
        const nx = -q.tz;
        const nz = q.tx;
        const cx = q.x + nx * off;
        const cz = q.z + nz * off;
        // 高度：河床 0.012 之上 1 厘米；步道（0.02）、路面（0.03）和它差不到 1 厘米 —— 碰到就断开，不叠
        const clear = offTrail(cx, cz, hw + 0.6);
        const cur = { l: [cx + nx * hw, 0.024, cz + nz * hw] as V3, r: [cx - nx * hw, 0.024, cz - nz * hw] as V3 };
        if (on && clear && prev) fquad(reg(cx, cz), 'sandDrift', prev.l, cur.l, cur.r, prev.r);
        prev = on && clear ? cur : null;
      }
    }
    // 沙洲：几块长条的亮沙（水道 0.024 之上 1 厘米；整块离步道、路面远，不叠在上面）
    for (let k = 0; k < 9; k++) {
      const q = samp[Math.floor(rnd() * samp.length)];
      const off = (rnd() - 0.5) * q.h;
      const x = q.x - q.tz * off;
      const z = q.z + q.tx * off;
      const a = 9 + rnd() * 10;
      const b = 2.5 + rnd() * 2;
      let ok = true;
      for (let t = -1; t <= 1; t += 0.25) if (!offTrail(x + q.tx * a * t, z + q.tz * a * t, b + 1)) ok = false;
      if (!ok) continue;
      const g = new THREE.CircleGeometry(1, 14)
        .rotateX(-Math.PI / 2)
        .scale(a, 1, b)
        .rotateY(-Math.atan2(q.tz, q.tx));
      put('sandHigh', g, x, 0.034, z);
    }
    // 卵石滩：成簇
    const cobbles: InstItem[] = [];
    const cobblesCool: InstItem[] = [];
    for (let k = 0; k < 26; k++) {
      const q = samp[Math.floor(rnd() * samp.length)];
      const off = (rnd() - 0.5) * 1.5 * q.h;
      const cx = q.x - q.tz * off;
      const cz = q.z + q.tx * off;
      if (!offTrail(cx, cz, 2)) continue;
      const m = 5 + Math.floor(rnd() * 7);
      for (let j = 0; j < m; j++) {
        const x = cx + (rnd() - 0.5) * 5;
        const z = cz + (rnd() - 0.5) * 3;
        const s = 0.18 + rnd() * 0.24;
        (rnd() < 0.4 ? cobblesCool : cobbles).push({ x, z, s, y: s * 0.12, reg: reg(x, z), rot: rnd() * TAU });
      }
    }
    const cg = new THREE.DodecahedronGeometry(1, 0).scale(1.1, 0.55, 0.9);
    d.instance(cg, 'rock', cobbles, false);
    d.instance(cg, 'rockCool', cobblesCool, false);
    // 大石头：一簇 1～4 块，挡路
    for (let k = 0; k < 20; k++) {
      const q = samp[Math.floor(rnd() * samp.length)];
      const off = (rnd() < 0.5 ? -1 : 1) * (0.35 + rnd() * 0.55) * q.h;
      const cx = q.x - q.tz * off;
      const cz = q.z + q.tx * off;
      if (!offTrail(cx, cz, 5) || washDist(cx, cz) > -1.5) continue;
      const m = 1 + Math.floor(rnd() * 4);
      for (let j = 0; j < m; j++) {
        const r = j === 0 ? 1.4 + rnd() * 1.3 : 0.6 + rnd() * 0.9;
        const x = cx + (rnd() - 0.5) * 4.5;
        const z = cz + (rnd() - 0.5) * 3.5;
        rock(x, z, r, rnd, rnd() < 0.35 ? 'rockCool' : 'rock', 0, 0.68);
        blockC(x, z, r * 0.85);
      }
      // 石头挡住冲下来的枯枝
      for (let j = 0; j < 3; j++) {
        const L = 1.6 + rnd() * 2;
        const g = boxG(0.2, 0.2, L).rotateX((rnd() - 0.5) * 0.3);
        put('branch', g, cx - 2 + rnd() * 4, 0, cz - 2.5 - rnd(), rnd() * TAU);
      }
    }
    // 烟树：河床里一丛一丛
    for (let k = 0; k < 11; k++) {
      const q = samp[Math.floor(rnd() * samp.length)];
      const off = (rnd() - 0.5) * 1.3 * q.h;
      const cx = q.x - q.tz * off;
      const cz = q.z + q.tx * off;
      const m = 1 + Math.floor(rnd() * 3);
      for (let j = 0; j < m; j++) {
        const x = cx + (rnd() - 0.5) * 7;
        const z = cz + (rnd() - 0.5) * 5;
        if (!offTrail(x, z, 2.5) || washDist(x, z) > -2) continue;
        smokeTree(x, z, rnd, 0.9 + rnd() * 0.35);
      }
    }
    // 岸上的假紫荆（两岸，坎后面）+ 脚下的灌木
    for (let k = 0; k < 22; k++) {
      const q = samp[Math.floor(rnd() * samp.length)];
      const side = rnd() < 0.5 ? -1 : 1;
      const off = side * (q.h + 5 + rnd() * 6);
      const x = q.x - q.tz * off;
      const z = q.z + q.tx * off;
      if (!free(x, z, 2.5)) continue;
      paloVerde(x, z, rnd, 0.85 + rnd() * 0.35);
      // 北边（不在自己影子里）一丛
      if (rnd() < 0.7 && free(x + 1, z - 3.5, 1))
        shrub(x + 1, z - 3.5, 0.9 + rnd() * 0.5, rnd() < 0.5 ? 'olive' : 'sage');
    }
  }

  // ════════════════════════════════════════════════════════════════════
  /** 河床里的木拍（p_racket）：半埋在冲积沙里的一把老木拍，手柄翘出来；旁边两块石头挡住的一道枯枝线、一只褪色的球 */
  function racket() {
    const rnd = d.rng('valley:south:racket');
    const poi = POIS.find((p) => p.id === 'p_racket');
    const [px0, pz0] = poi ? [poi.x, poi.z] : S(620, -444);
    const X = px0 + 2.5;
    const Z = pz0 - 2;
    const r = reg(X, Z);
    const K = 2.2; // 比真的大一号（0.045 米/纹素下真尺寸只有几纹素）
    const parts: [PalKey, THREE.BufferGeometry][] = [];
    // 拍面：竖在 xy 平面上，中心 (0, −0.36)；手柄朝上 (0…0.55)。弦面是一整块浅色（不画一根根 1 纹素的弦）
    parts.push(['wood', new THREE.TorusGeometry(0.27, 0.05, 5, 16).scale(1, 1.25, 1).translate(0, -0.36, 0)]);
    parts.push([
      'signPaint',
      new THREE.CylinderGeometry(0.25, 0.25, 0.03, 14)
        .rotateX(Math.PI / 2)
        .scale(1, 1.25, 1)
        .translate(0, -0.36, 0),
    ]);
    parts.push(['wood', new THREE.BoxGeometry(0.08, 0.24, 0.06).translate(0, 0.02, 0)]);
    parts.push(['wood', new THREE.BoxGeometry(0.085, 0.2, 0.07).translate(0, 0.22, 0)]);
    parts.push(['rust', new THREE.BoxGeometry(0.095, 0.24, 0.08).translate(0, 0.44, 0)]);
    for (const [key, g] of parts) {
      g.rotateX(-1.3).rotateZ(0.12).scale(K, K, K).rotateY(0.5).translate(X, 0.24, Z);
      d.put(r, key, g);
    }
    // 埋着拍面一边的沙堆（亮一档的冲积沙）：拍子一半露着、一半在沙里
    put('sandHigh', blobG(0.8, 1.5, 0.3, 0.9), X + 0.9, 0, Z + 0.9, 0.5, r);
    put('sandHigh', blobG(0.55, 1.2, 0.22, 1), X - 0.6, 0, Z + 1.4, 0.2, r);
    // 一只褪色的旧球（半埋）
    put('dryGrass', blobG(0.13), X + 1.5, 0.05, Z + 0.9, 0, r);
    // 两块石头和一道洪水留下的枯枝线（弧形）
    rock(X + 4.5, Z - 2.5, 1.5, rnd, 'rock', 0, 0.7);
    blockC(X + 4.5, Z - 2.5, 1.3);
    rock(X - 4, Z - 3.2, 1.1, rnd, 'rockCool', 0, 0.7);
    blockC(X - 4, Z - 3.2, 1);
    for (let k = 0; k < 9; k++) {
      const a = -0.9 + k * 0.22;
      const x = X + Math.sin(a) * 6.5;
      const z = Z - 4 + Math.cos(a) * 2.5 - 3;
      put('branch', boxG(0.18, 0.18, 1.2 + rnd() * 1.6), x, 0, z, a + Math.PI / 2 + (rnd() - 0.5) * 0.6, r);
      if (k % 3 === 1) put('dryGrass', blobG(0.35, 1.3, 0.5, 1), x, 0.12, z + 0.4, 0, r);
    }
    smokeTree(X + 12, Z + 1, rnd, 1.1);
    smokeTree(X - 10, Z - 7, rnd, 0.95);
  }

  // ════════════════════════════════════════════════════════════════════
  /**
   * 塔奎兹峡谷：瀑布下的潭（一圈石头）、潭里流出一道细水（踏石、一座小木桥）、峡谷北壁朝南的岩檐（暗带）、
   * 扇叶棕榈、藏在棕榈后面石头上的老俱乐部铭牌（p_falls）、步道口的告示棚。
   */
  function canyon() {
    const rnd = d.rng('valley:south:canyon');
    // 河床接到潭：峡谷里的沙床
    const bed: V2[] = SL([
      [14, -612],
      [40, -615],
      [70, -616],
      [100, -615],
      [130, -607],
      [152, -598],
    ]);
    const bedHalf = [5, 6, 6.5, 7, 8, 9];
    for (let i = 1; i < bed.length; i++) {
      const [ax, az] = bed[i - 1];
      const [bx, bz] = bed[i];
      const L = Math.hypot(bx - ax, bz - az);
      const nx = -(bz - az) / L;
      const nz = (bx - ax) / L;
      const ha = bedHalf[i - 1];
      const hb = bedHalf[i];
      quad(
        reg(ax, az),
        'sandPatch',
        [ax + nx * ha, 0.011, az + nz * ha],
        [bx + nx * hb, 0.011, bz + nz * hb],
        [bx - nx * hb, 0.011, bz - nz * hb],
        [ax - nx * ha, 0.011, az - nz * ha],
      );
      const g = new THREE.CircleGeometry(hb, 10).rotateX(-Math.PI / 2);
      put('sandPatch', g, bx, 0.011, bz);
    }
    // 潭里流出的细水：越往下越细，到河床头渗进沙里
    const creek: V2[] = SL([
      [21, -613.5],
      [34, -617],
      [52, -616],
      [70, -619],
      [92, -616.5],
      [112, -617.5],
      [130, -611],
      [146, -603],
      [160, -597],
    ]);
    for (let i = 1; i < creek.length; i++) {
      const [ax, az] = creek[i - 1];
      const [bx, bz] = creek[i];
      const L = Math.hypot(bx - ax, bz - az);
      const nx = -(bz - az) / L;
      const nz = (bx - ax) / L;
      const ha = 1.1 - (i - 1) * 0.1;
      const hb = 1.1 - i * 0.1;
      fquad(
        reg(ax, az),
        'water',
        [ax + nx * ha, 0.045, az + nz * ha],
        [bx + nx * hb, 0.045, bz + nz * hb],
        [bx - nx * hb, 0.045, bz - nz * hb],
        [ax - nx * ha, 0.045, az - nz * ha],
      );
      putF('water', new THREE.CircleGeometry(hb, 8).rotateX(-Math.PI / 2), bx, 0.045, bz);
      // 水边湿沙（深一档）
      if (i < creek.length - 1)
        putF('sandDrift', new THREE.CircleGeometry(hb + 1, 8).rotateX(-Math.PI / 2), bx, 0.033, bz); // 步道 0.02 之上、水之下
    }
    // 潭边一圈大石头（东边开口：水从那儿流走、步道从那儿进来）
    const [PX, PZ] = S(16, -610); // 潭（build.ts 的 FALLS）
    // 瀑布落在潭的西北角：峡谷尽头那段山壁是西北—东南斜的（平地边 (8,−610)→(26,−628)），面朝东南 = 斜着朝镜头
    const [FX, FZ] = S(12, -614); // S 是仿射的：原来在山壁线上的点缩完还在山壁线上
    /** 沿壁（东南）、出壁（朝东南，离开山） */
    const ALONG: V2 = [Math.SQRT1_2, -Math.SQRT1_2];
    const OUT: V2 = [Math.SQRT1_2, Math.SQRT1_2];
    for (let k = 0; k < 13; k++) {
      const a = 0.55 + (k / 12) * (TAU - 1.6);
      const rr = 7.4 + rnd() * 1.2;
      const x = PX + Math.cos(a) * rr;
      const z = PZ + Math.sin(a) * rr;
      const r = 0.8 + rnd() * 1.2;
      if (!inFloor(x, z) || Math.hypot(x - FX, z - FZ) < 4.5) continue;
      rock(x, z, r, rnd, k % 3 ? 'rock' : 'rockCool', 0, 0.75);
      blockC(x, z, r * 0.85);
    }
    // 晒太阳的一块平石板（潭南边，能坐）
    put('flagstone', rockG(1.6, rnd, 0.22), ...xyS(21, 0.05, -601.5));
    // 峡谷尽头的岩壁（瀑布背后）：一层层往山里退的大石块垒到 15 米，沿壁两边各 9 米；水落下来的那道槽往里凹。
    // 第二轮：原来瀑布挂在最西头、朝东（镜头朝北只看得到 1.2 米宽的侧边，读成一根白杆），而且站在潭边时在画面外
    const wallAt = (u: number, back: number): V2 => [
      FX + ALONG[0] * u - OUT[0] * back,
      FZ + ALONG[1] * u - OUT[1] * back,
    ];
    for (let L = 0; L < 5; L++)
      for (let u = -9; u <= 9; u += 3.2 + rnd() * 1.6) {
        const slot = Math.abs(u) < 2.6 ? 1.6 : 0;
        const [x, z] = wallAt(u + (rnd() - 0.5), 1.2 + L * 1.4 + slot + rnd() * 0.8);
        const rr = 2.3 + rnd() * 1.3;
        const y = Math.max(L * 3, mountainY(x, z) - rr * 0.6);
        putC(L % 2 ? 'cliff' : 'rock', rockG(rr, rnd, 0.85), x, y + rr * 0.25, z, 0, 'none');
      }
    // 瀑布：一片 4.5 米宽的水（贴着岩槽，往后仰 0.25）+ 前面窄一点的白水；顶上两块岩檐
    // 往后仰：朝镜头的面带一点朝上的法线，落中档而不是暗档（白水读得出来）
    {
      const rot = Math.PI / 4; // 本地 +z → 朝东南（出壁），本地 x → 沿壁
      const [wx, wz] = wallAt(0, 1.1);
      put('water', boxG(4.5, 15, 0.8).rotateX(-0.25), wx, 0, wz, rot, reg(PX, PZ));
      put('foam', boxG(3, 14.6, 0.6).rotateX(-0.25), wx + OUT[0] * 0.45, 0.2, wz + OUT[1] * 0.45, rot, reg(PX, PZ));
      for (const u of [-2.9, 2.9]) {
        const [lx, lz] = wallAt(u, 3.2);
        putC(u < 0 ? 'rock' : 'cliff', rockG(2.4, rnd, 0.5), lx, 14.2, lz, 0, 'none');
      }
    }
    const mist: InstItem[] = [];
    for (let k = 0; k < 9; k++) {
      const s = 0.4 + rnd() * 0.5;
      const [x, z] = wallAt((rnd() - 0.5) * 4, -0.6 - rnd() * 2.2);
      mist.push({ x, z, y: 0.1 + rnd() * 1.2, s, reg: reg(PX, PZ) });
    }
    d.instance(blobG(1), 'foam', mist, false);
    // 潭边的蕨（湿的地方才有的绿）
    for (const [x, z] of SL([
      [10.5, -603.5],
      [11, -617],
      [24.5, -617.5],
      [27, -621.5],
    ]))
      put('yellowGreen', blobG(0.6, 1.3, 0.55, 1), x, 0.25, z);
    // 铭牌：潭北边、贴着峡谷北壁的一块大石头，朝南的一面钉着铜牌；前面一棵扇叶棕榈挡着一半
    {
      const [qx, qz] = S(30, -623.2);
      rock(qx, qz, 1.8, rnd, 'rockCool', 0, 0.8);
      blockC(qx, qz, 1.6);
      put('rust', boxG(0.85, 0.6, 0.08).rotateX(-0.35), qx + 0.2, 0.65, qz + 1.7);
      put('signPaint', boxG(0.55, 0.08, 0.04).rotateX(-0.35), qx + 0.2, 0.95, qz + 1.78);
      put('signPaint', boxG(0.4, 0.08, 0.04).rotateX(-0.35), qx + 0.2, 0.8, qz + 1.83);
      fanPalm(qx - 2.5, qz + 3.7, 1.0, rnd);
    }
    // 踏石：从步道过细水到铭牌那块石头
    for (const [x, z] of SL([
      [35.6, -609.5],
      [36.3, -612],
      [35.4, -614.6],
      [36.1, -617.2],
      [34.6, -619.6],
    ]))
      put('flagstone', cylG(0.5, 0.56, 0.16, 7), x, 0, z, rnd());
    // 小木桥：过细水，通到北壁下一块能坐的石头
    {
      const [bx, bz] = S(94, -616.6);
      const r = reg(bx, bz);
      for (let k = 0; k < 7; k++) put('woodWeathered', boxG(1.5, 0.12, 0.62), bx, 0.12, bz - 2.1 + k * 0.7, 0, r);
      for (const sx of [-0.8, 0.8]) {
        put('wood', boxG(0.2, 0.14, 4.6), bx + sx, 0.8, bz, 0, r);
        for (const sz of [-2.2, 0, 2.2]) put('wood', boxG(0.18, 0.9, 0.18), bx + sx, 0, bz + sz, 0, r);
        blocked({ a: [bx + sx, bz - 2.3], b: [bx + sx, bz + 2.3], r: 0.12 });
      }
      rock(bx + 1, bz - 5.9, 1.2, rnd, 'rock', 0, 0.55);
    }
    // 扇叶棕榈：沿细水两边，一丛丛
    for (const [ox, oz, s] of [
      [44, -620.5, 1.1],
      [48, -622.5, 0.9],
      [62, -597, 1.05],
      [80, -621, 1.15],
      [84, -623, 0.85],
      [108, -621.5, 1],
      [118, -594, 0.95],
      [122, -591.5, 1.1],
    ] as [number, number, number][]) {
      const [x, z] = S(ox, oz);
      if (inFloor(x, z)) fanPalm(x, z, s, rnd);
    }
    // 峡谷两壁脚下的崩石堆：北壁（朝南、朝镜头）多、大，石头的前脸落暗档；南壁（挡镜头的那边）零星几块、小
    for (let ox = 22; ox < 135; ox += (6 + rnd() * 8) / SCALE) {
      const [x, zc] = S(ox, -607);
      for (const side of [-1, 1]) {
        if (side > 0 && rnd() < 0.55) continue;
        // 找平地边：从峡谷中线往外走到山脚
        let z = zc;
        while (inFloor(x, z) && Math.abs(z - zc) < 40) z += side * 0.5;
        const m = side < 0 ? 2 + Math.floor(rnd() * 3) : 1 + Math.floor(rnd() * 2);
        for (let k = 0; k < m; k++) {
          const rr = (side < 0 ? 1.1 + rnd() * 1.6 : 0.6 + rnd() * 0.8) * (k === 0 ? 1 : 0.65);
          const px = x + (rnd() - 0.5) * 6;
          const pz = z + side * (1 + rnd() * 10);
          const y = groundY(px, pz);
          put(rnd() < 0.45 ? 'cliff' : rnd() < 0.5 ? 'rock' : 'rockCool', rockG(rr, rnd, 0.72), px, y + rr * 0.15, pz);
        }
        if (side < 0 && rnd() < 0.4) {
          const px = x + (rnd() - 0.5) * 4;
          const pz = z - 0.6;
          if (inFloor(px, pz)) put('olive', blobG(0.7, 1.2, 0.7, 1), px, 0.35, pz);
        }
      }
    }
    // 步道口：告示棚（地图板）+ 一张长椅
    {
      const [x, z] = S(207, -551);
      const r = reg(x, z);
      for (const [dx, dz] of [
        [-1.6, -1.1],
        [1.6, -1.1],
        [-1.6, 1.1],
        [1.6, 1.1],
      ] as V2[]) {
        put('woodWeathered', boxG(0.22, 2.5, 0.22), x + dx, 0, z + dz, 0, r);
        blockC(x + dx, z + dz, 0.2);
      }
      put('woodWeathered', boxG(4.2, 0.22, 3.2).rotateX(0.08), x, 2.5, z, 0, r);
      put('signBoard', boxG(2, 1.2, 0.12), x, 0.9, z + 0.2, 0, r);
      put('signPaint', boxG(1.6, 0.18, 0.04), x, 1.75, z + 0.27, 0, r);
      // 棚下一盏灯（夜里步道口有一圈暖光）
      nightGlow(
        'trailhead:lamp',
        [['ironwork', 'flowerYellow', 0x3a2c08, [boxG(0.3, 0.36, 0.3).translate(x + 1.3, 2.05, z + 1)]]],
        [x, z + 1.5, 4.5, 3],
      );
      put('wood', boxG(2.2, 0.45, 0.6), x + 3.6, 0, z + 1.8, 0, r);
      blocked({ a: [x + 2.6, z + 1.8], b: [x + 4.6, z + 1.8], r: 0.3 });
      agave(x - 3.2, z - 1.5, 1.1, rnd);
      barrel(x - 2.6, z + 1.9, 1.1);
    }
  }

  // ════════════════════════════════════════════════════════════════════
  /** 印第安峡谷口：入口的土坯门柱和横梁、收费亭的抬杆、贸易站的门廊、绿洲的潭和小溪、扇叶棕榈（p_oasis） */
  function oasis() {
    const rnd = d.rng('valley:south:oasis');
    // 入口：两根土坯柱 + 木横梁 + 牌子（朝南、朝镜头）。牌子底边 4.5 米：车从底下过（路面上 4 米以下不放东西）
    {
      // 门的中心过 S，两根柱子离中心 ±10.4 米（路宽 14 米不缩）
      const [gx, z] = S(299, 184);
      for (const x of [gx - 10.4, gx + 10.4]) {
        put('adobe', boxG(1.8, 5.4, 1.8), x, 0, z);
        put('cap', boxG(2.1, 0.3, 2.1), x, 5.4, z);
        blocked({ x0: x - 0.95, x1: x + 0.95, z0: z - 0.95, z1: z + 0.95 });
        agave(x + (x < gx ? -2.2 : 2.2), z + 1.2, 1.2, rnd);
      }
      put('woodWeathered', boxG(22.6, 0.45, 0.5), gx, 5.95, z);
      put('signBoard', boxG(9, 1.4, 0.2), gx, 4.55, z + 0.35);
      put('signPaint', boxG(7, 0.22, 0.05), gx, 5.4, z + 0.47);
      put('signPaint', boxG(5, 0.22, 0.05), gx, 4.95, z + 0.47);
    }
    // 收费亭的抬杆（抬着的：红白相间）
    {
      // 收费亭北边、偏西（缩完以后亭子离路口近了：杆子往西挪，抬起来的杆不伸进路面）
      const toll = BUILDINGS.find((o) => o.id === 'toll');
      const [tx, tz] = toll ? [toll.x, toll.z] : S(288, 214);
      const px = tx + 1.6;
      const pz = tz - 4.5;
      put('metal', boxG(0.45, 1.1, 0.45), px, 0, pz);
      blockC(px, pz, 0.3);
      const arm = (key: PalKey, a: number, b: number) =>
        put(key, new THREE.BoxGeometry(b - a, 0.2, 0.2).translate((a + b) / 2, 0, 0).rotateZ(1.05), px, 1.05, pz);
      for (let k = 0; k < 4; k++) arm(k % 2 ? 'clothRed' : 'clothWhite', k * 2, k * 2 + 2);
    }
    // 贸易站（316, 250）：朝步道（西）的木门廊、门廊上的长椅、木桶、挂着的毯子、拴马的横杆
    {
      const tp = BUILDINGS.find((o) => o.id === 'trading') ?? { x: 316, z: 250, w: 16, d: 12 };
      const x0 = tp.x - tp.w / 2;
      const zc = tp.z;
      d.clear({ x0: x0 - 7.5, x1: x0, z0: zc - 7, z1: zc + 7 });
      const r = reg(x0, zc);
      put('woodWeathered', boxG(4.4, 0.18, 11.6), x0 - 2.2, 0, zc, 0, r);
      for (const dz of [-5.4, -1.8, 1.8, 5.4]) {
        put('wood', boxG(0.24, 3.1, 0.24), x0 - 4.1, 0.18, zc + dz, 0, r);
        blockC(x0 - 4.1, zc + dz, 0.2);
      }
      put('woodWeathered', boxG(5, 0.22, 12.6).rotateZ(-0.12), x0 - 2.2, 3.15, zc, 0, r);
      put('signBoard', boxG(0.15, 1, 7), x0 - 4.45, 3.4, zc, 0, r);
      put('signPaint', boxG(0.06, 0.2, 5.6), x0 - 4.55, 3.85, zc, 0, r);
      // 门廊檐下挂一盏马灯（夜里门廊一圈暖光）
      nightGlow(
        'trading:lamp',
        [['ironwork', 'flowerYellow', 0x3a2c08, [boxG(0.32, 0.42, 0.32).translate(x0 - 3.9, 2.35, zc + 0.6)]]],
        [x0 - 2.6, zc + 1, 6, 3.4],
      );
      put('wood', boxG(0.55, 0.45, 2.4), x0 - 0.6, 0.18, zc + 3.2, 0, r);
      for (const [dx, dz] of [
        [-3.3, -3.4],
        [-3.1, -4.4],
      ] as V2[]) {
        put('wood', cylG(0.38, 0.38, 0.9, 8), x0 + dx, 0.18, zc + dz, 0, r);
        blockC(x0 + dx, zc + dz, 0.4);
      }
      const rugs: PalKey[] = ['clothRed', 'canvasStripe', 'clothTeal'];
      rugs.forEach((k, i) => {
        put(k, boxG(0.08, 1.4, 1.2), x0 - 0.12, 1.0, zc - 2.4 + i * 1.6, 0, r);
      });
      // 拴马横杆
      // （缩完以后贸易站离步道只有 7 米：横杆贴着门廊外沿，不压步道）
      put('woodWeathered', boxG(0.2, 0.2, 4), x0 - 5.3, 0.95, zc - 1, 0, r);
      for (const dz of [-2.8, 0.8]) put('woodWeathered', boxG(0.22, 1.05, 0.22), x0 - 5.3, 0, zc + dz, 0, r);
      blocked({ a: [x0 - 5.3, zc - 3], b: [x0 - 5.3, zc + 1], r: 0.15 });
    }
    // 绿洲的潭（贸易站南边）
    // 缩完以后峡谷口窄了（潭离步道只剩 6.5 米）：潭小一圈、往东挪一点
    const [OX, OZ] = [S(308.5, 268.5)[0] + 0.8, S(308.5, 268.5)[1]];
    const pond = blobPoly(OX, OZ, 3.6, 2.8, rnd, 12, 0.18);
    const rim = blobPoly(OX, OZ, 4.8, 3.8, rnd, 12, 0.15);
    putF('sandDrift', topGeo(rim, 0), 0, 0.009, 0, 0, reg(OX, OZ));
    putF('water', topGeo(pond, 0), 0, 0.034, 0, 0, reg(OX, OZ));
    putF(
      'foam',
      new THREE.RingGeometry(2.5, 2.85, 14, 1, 0.4, 2.4).rotateX(-Math.PI / 2).scale(1.3, 1, 0.95),
      OX,
      0.046,
      OZ,
    );
    blocked({ poly: pond });
    // 小溪：从峡谷里流进潭，再从潭的西北角流出去，穿过步道（木板桥），沿步道西边渗进沙里
    const streams: [V2[], number][] = [
      [
        SL([
          [313, 293],
          [311, 285],
          [309.5, 277],
          [309, 272],
        ]),
        0.7,
      ],
      [
        SL([
          [304.5, 266],
          [300, 263],
          [295, 260.5],
          [291, 256],
          [289.5, 248],
          [290.5, 240],
          [288.5, 231],
        ]),
        0.8,
      ],
    ];
    for (const [line, w0] of streams) {
      for (let i = 1; i < line.length; i++) {
        const [ax, az] = line[i - 1];
        const [bx, bz] = line[i];
        const L = Math.hypot(bx - ax, bz - az);
        const nx = -(bz - az) / L;
        const nz = (bx - ax) / L;
        const ha = w0 * (1 - (i - 1) / line.length) + 0.2;
        const hb = w0 * (1 - i / line.length) + 0.2;
        const r = reg(ax, az);
        fquad(
          r,
          'sandDrift',
          [ax + nx * (ha + 0.8), 0.009, az + nz * (ha + 0.8)],
          [bx + nx * (hb + 0.8), 0.009, bz + nz * (hb + 0.8)],
          [bx - nx * (hb + 0.8), 0.009, bz - nz * (hb + 0.8)],
          [ax - nx * (ha + 0.8), 0.009, az - nz * (ha + 0.8)],
        );
        fquad(
          r,
          'water',
          [ax + nx * ha, 0.032, az + nz * ha],
          [bx + nx * hb, 0.032, bz + nz * hb],
          [bx - nx * hb, 0.032, bz - nz * hb],
          [ax - nx * ha, 0.032, az - nz * ha],
        );
        putF('water', new THREE.CircleGeometry(hb, 8).rotateX(-Math.PI / 2), bx, 0.032, bz);
      }
    }
    // 步道过溪的木板
    {
      const [kx, kz] = S(297.6, 259.4);
      for (let k = 0; k < 4; k++) put('woodWeathered', boxG(2.6, 0.1, 0.5), kx, 0.04, kz + k * 0.62, -0.35);
    }
    // 水边的石头、芦苇（一丛丛）
    for (const [x, z] of SL([
      [303.5, 271.5],
      [313.5, 266],
      [312, 273],
      [305, 264.5],
      [311.5, 283],
      [292, 254],
    ])) {
      if (inPoly(pond, x, z) || nearRoad(x, z, 0.9)) continue;
      rock(x, z, 0.5 + rnd() * 0.5, rnd, rnd() < 0.5 ? 'rockCool' : 'rock', 0, 0.6);
      for (let k = 0; k < 3; k++)
        put('olive', blobG(0.28, 1, 2.4, 1), x + (rnd() - 0.5) * 1.6, 0.4, z - 0.8 - rnd() * 0.6);
    }
    // 扇叶棕榈：潭边、峡谷壁下（build 已经有一丛野棕榈，这几棵带枯叶裙、更粗）
    for (const [x, z, s] of [
      [302, 276, 1.15],
      [315.5, 263.5, 1.0],
      [305, 286, 1.25],
      [292.5, 289, 1.1],
      [301.5, 264.5, 0.85],
      [286, 270, 1.0],
    ] as [number, number, number][]) {
      const [px, pz] = S(x, z);
      if (inFloor(px, pz) && !inPoly(rim, px, pz) && !nearRoad(px, pz, 1.4)) fanPalm(px, pz, s, rnd);
    }
  }

  // ════════════════════════════════════════════════════════════════════
  /**
   * 双棕榈、梅萨、峡谷高尔夫小区的院子：中世纪现代的房子 —— 蝶形 / 单坡屋顶、彩色的门、镂空砖墙、
   * 后院的矮砖墙（朝南的那面是暗带）和泳池、车棚和车、前院的碎石和龙舌兰；双棕榈每家门口两棵棕榈（街区的名字），
   * 梅萨的院子里有大石头（贴着山脚）。每家的组合按种子挑，不是每家一样。
   */
  function yards() {
    const ROAD_IDS = ['twin_palms', 'twin_palms_loop', 'mesa', 'mesa_cul', 'canyon_golf'];
    const DOORS: PalKey[] = ['clothTeal', 'flowerYellow', 'clothRed', 'toolOrange', 'clothBlue', 'seat'];
    const CARS: PalKey[] = ['carRed', 'clothTeal', 'clothBlue', 'flowerYellow', 'clothWhite', 'seat'];
    const WALLS: PalKey[] = ['stucco', 'adobe', 'concrete'];
    for (const o of HOUSES) {
      const rid = o.id.slice(0, o.id.lastIndexOf('_'));
      if (!ROAD_IDS.includes(rid)) continue;
      const road = ROADS.find((q) => q.id === rid);
      if (!road) continue;
      const rnd = d.rng(`valley:south:house:${o.id}`);
      const th = o.rot ?? 0;
      const c = Math.cos(th);
      const s = Math.sin(th);
      const W = (lx: number, lz: number): V2 => [o.x + lx * c + lz * s, o.z - lx * s + lz * c];
      const [qx, qz] = closest(road.pts, o.x, o.z);
      const lzq = (qx - o.x) * s + (qz - o.z) * c;
      const f = lzq >= 0 ? 1 : -1;
      const D = Math.abs(lzq);
      const r = reg(o.x, o.z);
      const hw = o.w / 2;
      const hd = o.d / 2;
      /** 本地盒子（沿房子的轴） */
      const lb = (
        key: PalKey,
        w: number,
        h: number,
        dd: number,
        lx: number,
        y: number,
        lz: number,
        g?: THREE.BufferGeometry,
      ) => {
        const [x, z] = W(lx, lz);
        const geo = (g ?? boxG(w, h, dd)).rotateY(th).translate(x, y, z);
        d.put(r, key, geo);
      };
      /** 贴地的薄片（碎石、车道）：不投影 */
      const lbF = (key: PalKey, w: number, h: number, dd: number, lx: number, y: number, lz: number) => {
        const [x, z] = W(lx, lz);
        putF(key, boxG(w, h, dd).rotateY(th), x, y, z, 0, r);
      };
      const ok = (lx: number, lz: number, pad = 0.4) => {
        const [x, z] = W(lx, lz);
        return (
          inFloor(x, z) &&
          !inClubBox(x, z) &&
          !nearRoad(x, z, pad) &&
          !nearBldg(x, z, pad, o) &&
          washDist(x, z) > 0.5 &&
          !inGreen(x, z) &&
          !inHotel(x, z)
        );
      };
      const okLine = (ax: number, az: number, bx: number, bz: number, pad = 0.4) => {
        const n = Math.max(2, Math.ceil(Math.hypot(bx - ax, bz - az) / 1.5));
        for (let k = 0; k <= n; k++) if (!ok(ax + ((bx - ax) * k) / n, az + ((bz - az) * k) / n, pad)) return false;
        return true;
      };

      // 屋顶：蝶形（两片往里斜）、单坡、或者平顶加一根石头烟囱
      const roofY = o.h + 0.35;
      const pick = rnd();
      const roofKey: PalKey = rnd() < 0.5 ? 'cap' : 'concrete';
      if (pick < 0.35) {
        for (const sd of [-1, 1]) {
          const g = new THREE.BoxGeometry(hw + 0.8, 0.22, o.d + 1.6).rotateZ(sd * 0.15);
          lb(roofKey, 0, 0, 0, sd * (hw / 2 + 0.4), roofY + 0.1 + (hw / 2) * 0.15, 0, g);
        }
      } else if (pick < 0.6) {
        const g = new THREE.BoxGeometry(o.w + 1.4, 0.22, o.d + 1.8).rotateX(f * 0.12);
        lb(roofKey, 0, 0, 0, 0, roofY + 0.15 + hd * 0.12, 0, g);
      } else if (pick < 0.85) {
        lb('flagstone', 1.1, 1.6, 1.1, (rnd() - 0.5) * o.w * 0.6, o.h, -f * hd * 0.4);
      }
      // 彩色的门 + 门边一截镂空砖墙（三排方块，中间留缝）
      const doorX = (rnd() - 0.5) * (o.w - 4);
      lb(DOORS[Math.floor(rnd() * DOORS.length)], 1.15, 2.2, 0.14, doorX, 0, f * (hd + 0.04));
      if (rnd() < 0.6) {
        const sx = doorX + (doorX > 0 ? -2.6 : 2.6);
        const zz = f * (hd + 1.4);
        if (ok(sx, zz, 0.2)) {
          for (let row = 0; row < 3; row++)
            for (let col = 0; col < 4; col++)
              lb('signPaint', 0.5, 0.5, 0.25, sx - 0.93 + col * 0.62, 0.1 + row * 0.62, zz);
          const [bx, bz] = W(sx, zz);
          blockC(bx, bz, 1.2);
        }
      }
      // 前院：碎石（不是每家都铺）+ 龙舌兰 / 仙人球 / 石头成一小簇
      const front = D - road.w / 2 - hd - 1.2;
      if (front > 2 && rnd() < 0.6) {
        const gk: PalKey = (['sandHigh', 'path', 'sandDrift'] as PalKey[])[Math.floor(rnd() * 3)];
        lbF(gk, o.w * 0.85, 0.02, front, 0, 0.004, f * (hd + front / 2));
        const cx = (rnd() - 0.5) * o.w * 0.5;
        const cz = f * (hd + front * 0.55);
        if (ok(cx, cz, 0.6)) {
          const [x, z] = W(cx, cz);
          agave(x, z, 0.9 + rnd() * 0.4, rnd, 0);
          if (rnd() < 0.6) barrel(x + 1.2, z - 0.6, 1);
          if (rnd() < 0.5) rock(x - 1.4, z - 0.5, 0.5 + rnd() * 0.4, rnd, 'rockCool', 0);
        }
      }
      // 双棕榈：门口两棵
      if (rid.startsWith('twin_palms') && front > 1.5) {
        for (const sd of [-1, 1]) {
          const lx = sd * hw * (0.55 + rnd() * 0.25);
          const lz = f * (hd + 1.5 + rnd() * Math.max(0.5, front - 2.5));
          if (ok(lx, lz, 1.3)) {
            const [x, z] = W(lx, lz);
            ornPalm(x, z, 0.9 + rnd() * 0.25, rnd);
          }
        }
      }
      // 梅萨：院子里一两块大石头（山上滚下来的）
      if (rid.startsWith('mesa')) {
        const m = 1 + Math.floor(rnd() * 2);
        // 第二轮：原来离自家墙只留 1.5 米、半径却到 2.5 米（石头插进墙里），而且 ok() 不查自家的房子；
        // 现在按半径让开，自家和别家的房子都查；仙人掌长在石头旁边（原来在石头正北，屏幕上像从石头顶上长出来）
        for (let k = 0; k < m; k++) {
          const rr = 1.1 + rnd() * 1.0;
          const lx = (rnd() < 0.5 ? -1 : 1) * (hw + rr + 1.5 + rnd() * 2);
          const lz = (rnd() - 0.5) * o.d * 1.4;
          const [x, z] = W(lx, lz);
          if (!ok(lx, lz, rr + 0.5) || nearBldg(x, z, rr + 1)) continue;
          rock(x, z, rr, rnd, rnd() < 0.5 ? 'rock' : 'rockCool', 0, 0.75);
          blockC(x, z, rr * 0.85);
          const [ox, oz] = W(lx + (lx > 0 ? 1 : -1) * (rr + 1.3), lz);
          if (rnd() < 0.5 && ok(lx + (lx > 0 ? 1 : -1) * (rr + 1.3), lz, 0.8) && !nearBldg(ox, oz, 1.5))
            ocotillo(ox, oz, 0.85, rnd);
        }
      }
      // 后院：矮砖墙围一圈（朝南的那面落暗档），里面多半有个泳池
      let depth = 9 + rnd() * 4;
      const wx = hw + 0.4;
      while (depth > 5.5 && !okLine(-wx, -f * (hd + depth), wx, -f * (hd + depth))) depth -= 1.5;
      const sidesOk =
        depth > 5.5 && okLine(-wx, -f * hd, -wx, -f * (hd + depth)) && okLine(wx, -f * hd, wx, -f * (hd + depth));
      if (sidesOk && rnd() < 0.85) {
        const wk = WALLS[Math.floor(rnd() * WALLS.length)];
        const wh = 1.4 + rnd() * 0.4;
        const bz = -f * (hd + depth);
        lb(wk, o.w + 0.8, wh, 0.3, 0, 0, bz);
        lb('cap', o.w + 1, 0.12, 0.42, 0, wh, bz);
        for (const sd of [-1, 1]) {
          lb(wk, 0.3, wh, depth, sd * wx, 0, -f * (hd + depth / 2));
          lb('cap', 0.42, 0.12, depth, sd * wx, wh, -f * (hd + depth / 2));
        }
        const A = W(-wx, -f * hd);
        const B = W(-wx, bz);
        const C = W(wx, bz);
        const E = W(wx, -f * hd);
        blocked({ a: A, b: B, r: 0.2 });
        blocked({ a: B, b: C, r: 0.2 });
        blocked({ a: C, b: E, r: 0.2 });
        if (rnd() < 0.7) {
          const pw = Math.min(8, o.w - 3);
          const pd = Math.min(4, depth - 3);
          const px = (rnd() - 0.5) * (o.w - pw - 2);
          const pz = -f * (hd + depth / 2 + 0.3);
          const [x, z] = W(px, pz);
          const kidney = rnd() < 0.4;
          const poly = kidney ? blobPoly(x, z, pw / 2, pd / 2, rnd, 12, 0.12) : roundRect(x, z, pw, pd, 0.7, th);
          const rim = kidney
            ? blobPoly(x, z, pw / 2 + 0.6, pd / 2 + 0.6, rnd, 12, 0.08)
            : roundRect(x, z, pw + 1.2, pd + 1.2, 1.1, th);
          putF('concrete', topGeo(rim, 0.05), 0, 0, 0, 0, r);
          putF('water', topGeo(poly, 0.07), 0, 0, 0, 0, r);
          // 跳板和两张躺椅
          lb('clothWhite', 0.5, 0.12, 2, px - pw / 2 + 0.8, 0.35, pz + f * (pd / 2 + 0.2));
          for (const k of [0, 1])
            lb('clothWhite', 0.7, 0.35, 1.8, px + pw / 2 - 0.6 - k * 1.1, 0, pz + f * (pd / 2 + 1.6));
        } else {
          // 没泳池的：一块草（奢侈的）或一棵柑橘
          const [x, z] = W((rnd() - 0.5) * o.w * 0.5, -f * (hd + depth / 2));
          if (rnd() < 0.5) d.put(r, 'lawn', topGeo(blobPoly(x, z, o.w * 0.3, depth * 0.3, rnd, 10, 0.1), 0.02));
          else {
            put('branch', cylG(0.12, 0.16, 1.2, 5), x, 0, z, 0, r);
            put('olive', blobG(1.3, 1, 0.9, 1), x, 2, z, 0, r);
            for (let k = 0; k < 4; k++)
              put('toolOrange', blobG(0.16), x + (rnd() - 0.5) * 2, 1.4 + rnd() * 1.2, z + 0.9 + rnd() * 0.4, 0, r);
            blockC(x, z, 0.3);
          }
        }
      }
      // 车棚（房子一侧，平顶四根柱）+ 车道；车有时停在棚里，有时停在车道上
      const sd = rnd() < 0.5 ? -1 : 1;
      const cpx = sd * (hw + 3.3);
      const cpz = f * (hd - 3);
      const drive = D - road.w / 2 - (hd - 6);
      const canPort =
        okLine(cpx - 2.8, cpz - 3, cpx + 2.8, cpz - 3, 0.3) &&
        okLine(cpx - 2.8, cpz + 3, cpx + 2.8, cpz + 3, 0.3) &&
        okLine(cpx + sd * 2.8, cpz - 3, cpx + sd * 2.8, cpz + 3, 0.3);
      const carKey = CARS[Math.floor(rnd() * CARS.length)];
      const car = (lx: number, lz: number) => {
        lb(carKey, 1.9, 0.75, 4.4, lx, 0.28, lz);
        lb('ironwork', 1.6, 0.6, 2.3, lx, 1.03, lz - f * 0.2);
        lb(carKey, 1.62, 0.1, 2.2, lx, 1.63, lz - f * 0.2);
        const [x, z] = W(lx, lz);
        const [ax, az] = W(lx, lz - 2);
        const [bx, bz] = W(lx, lz + 2);
        blocked({ a: [ax, az], b: [bx, bz], r: 1 });
        void x;
        void z;
      };
      if (canPort && rnd() < 0.7) {
        for (const [dx, dz] of [
          [-2.6, -2.8],
          [2.6, -2.8],
          [-2.6, 2.8],
          [2.6, 2.8],
        ] as V2[]) {
          lb('metal', 0.16, 2.55, 0.16, cpx + dx, 0, cpz + dz);
          const [x, z] = W(cpx + dx, cpz + dz);
          blockC(x, z, 0.12);
        }
        lb(rnd() < 0.5 ? 'concrete' : 'cap', 6.2, 0.22, 6.8, cpx, 2.55, cpz);
        if (drive > 1) lbF('concrete', 4, 0.02, drive, cpx, 0.016, f * (hd - 6 + drive / 2));
        if (rnd() < 0.65) car(cpx, cpz);
      } else if (front > 4.5 && rnd() < 0.5) {
        const lx = sd * hw * 0.55;
        if (ok(lx, f * (hd + front / 2), 0.3)) {
          lbF('concrete', 3.6, 0.02, front + 1, lx, 0.016, f * (hd + (front + 1) / 2));
          if (rnd() < 0.6) car(lx, f * (hd + 2.8));
        }
      }
      // 路边的信箱
      if (rnd() < 0.55) {
        const lx = sd * -(hw * 0.7);
        const lz = f * (D - road.w / 2 - 1);
        if (ok(lx, lz, 0.2)) {
          lb('woodWeathered', 0.16, 1, 0.16, lx, 0, lz);
          lb('metal', 0.32, 0.3, 0.55, lx, 1, lz);
        }
      }
    }
  }

  // ════════════════════════════════════════════════════════════════════
  /** 路边汽车旅馆（340, −320）：两层的外廊（朝南的暗带）、一排彩色的门、楼梯、停车场和车、泳池和栅栏、路边的霓虹招牌 */
  function motel() {
    const rnd = d.rng('valley:south:motel');
    // 楼从 layout 来（缩放后的位置，40 × 18 米）；停车场、招牌按楼和棕榈谷大道算（缩完以后楼离大道近了 13 米）
    const mo = BUILDINGS.find((o) => o.id === 'motel') ?? { x: S(340, -320)[0], z: S(340, -320)[1], w: 40, d: 18 };
    const MX = mo.x;
    const X0 = MX - mo.w / 2;
    const X1 = MX + mo.w / 2;
    const ZF = mo.z + mo.d / 2; // 正面（朝南）
    const r = reg(MX, mo.z);
    const LZ0 = ZF + 3;
    const LZ1 = ZF + 22;
    const avenue = ROADS.find((q) => q.id === 'palm_canyon');
    const roadE = avenue ? closest(avenue.pts, X0, (LZ0 + LZ1) / 2)[0] + avenue.w / 2 : X0 - 20;
    const lotW = Math.max(X0 - 13, roadE + 1.5);
    const lotE = X0 + 27;
    d.clear({ x0: lotW - 1, x1: X1 + 8, z0: ZF - 1, z1: LZ1 + 8 });
    // 外廊：一层的顶 = 二层的走廊；二层的栏杆是一整条带子
    put('concrete', boxG(40, 0.28, 2.6), MX, 2.9, ZF + 1.3, 0, r);
    put('ironwork', boxG(40, 0.85, 0.14), MX, 3.18, ZF + 2.52, 0, r);
    put('cap', boxG(40.6, 0.14, 0.26), MX, 4.03, ZF + 2.52, 0, r);
    put('concrete', boxG(40.6, 0.3, 2.9), MX, 6.0, ZF + 1.2, 0, r); // 二层的檐
    for (let x = X0 + 0.3; x <= X1; x += 6.6) {
      put('metal', boxG(0.2, 6, 0.2), x, 0, ZF + 2.45, 0, r);
      blockC(x, ZF + 2.45, 0.16);
    }
    // 门和窗：两层各 8 间。窗夜里亮（有一半房间住了人）
    const winOn: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 8; i++) {
      const x = X0 + 3 + i * 4.9;
      for (const y of [0, 3.18]) {
        put(i % 3 === 1 ? 'flowerYellow' : 'clothTeal', boxG(1.05, 2.15, 0.1), x, y, ZF + 0.05, 0, r);
        const w = boxG(1.5, 1.0, 0.08).translate(x + 1.75, y + 1.0, ZF + 0.04);
        if (rnd() < 0.55) winOn.push(w);
        else put('ironwork', w, 0, 0, 0, 0, r);
        put('signPaint', boxG(0.3, 0.2, 0.05), x, y + 2.3, ZF + 0.07, 0, r);
      }
    }
    nightGlow('motel:windows', [['ironwork', 'flowerYellow', 0x3a2808, winOn]]);
    // 西头的楼梯（一级级的块）
    for (let k = 0; k < 8; k++) put('concrete', boxG(1.4, 0.4, 0.7), X0 - 1, k * 0.4, ZF + 8 - k * 0.7 - 2.9, 0, r);
    blocked({ x0: X0 - 1.8, x1: X0 - 0.2, z0: ZF - 0.5, z1: ZF + 5.4 });
    put('clothWhite', boxG(1, 1.6, 0.9), X0 - 1, 0, ZF + 6.4, 0, r); // 制冰机
    blockC(X0 - 1, ZF + 6.4, 0.6);
    // 停车场：沥青 + 车位线 + 几辆车（车头朝房间）
    put('asphalt', boxG(lotE - lotW, 0.02, LZ1 - LZ0), (lotW + lotE) / 2, 0.012, (LZ0 + LZ1) / 2, 0, r);
    const nLines = Math.floor((lotE - lotW - 3) / 3.2);
    for (let k = 0; k <= nLines; k++) {
      put('line', boxG(0.18, 0.02, 5.2), lotW + 2.5 + k * 3.2, 0.026, LZ0 + 2.8, 0, r);
      put('line', boxG(0.18, 0.02, 5.2), lotW + 2.5 + k * 3.2, 0.026, LZ1 - 2.8, 0, r);
    }
    const cars: PalKey[] = ['carRed', 'clothBlue', 'clothWhite', 'flowerYellow', 'seat'];
    for (let k = 0; k < nLines; k++) {
      if (rnd() < 0.5) continue;
      // 靠房间那排只停两三辆（门露出来），其余停在南边那排
      const x = lotW + 4.1 + k * 3.2;
      const z = k % 4 === 1 ? LZ0 + 3 : LZ1 - 3;
      const key = cars[Math.floor(rnd() * cars.length)];
      put(key, boxG(1.9, 0.75, 4.4), x, 0.28, z, 0, r);
      put('ironwork', boxG(1.6, 0.6, 2.3), x, 1.03, z + 0.2, 0, r);
      put(key, boxG(1.62, 0.1, 2.2), x, 1.63, z + 0.2, 0, r);
      blocked({ x0: x - 1, x1: x + 1, z0: z - 2.3, z1: z + 2.3 });
    }
    // 泳池：东头的院子，水泥地 + 池 + 一圈铁栅栏（一条暗带）+ 躺椅 + 遮阳伞
    {
      const cx = X1 - 3;
      const cz = ZF + 12;
      putF('concrete', boxG(18, 0.05, 16), cx, 0, cz, 0, r);
      putF('water', topGeo(roundRect(cx, cz, 10, 5, 0.6, 0), 0.07), 0, 0, 0, 0, r);
      put('clothWhite', boxG(0.5, 0.12, 2), cx - 5.6, 0.35, cz, Math.PI / 2, r);
      const fence = (ax: number, az: number, bx: number, bz: number) => {
        const L = Math.hypot(bx - ax, bz - az);
        const g = boxG(L, 1.1, 0.12).rotateY(-Math.atan2(bz - az, bx - ax));
        put('ironwork', g, (ax + bx) / 2, 0, (az + bz) / 2, 0, r);
        blocked({ a: [ax, az], b: [bx, bz], r: 0.15 });
      };
      fence(cx - 9, cz - 8, cx - 9, cz + 2);
      fence(cx - 9, cz + 5, cx - 9, cz + 8);
      fence(cx - 9, cz + 8, cx + 9, cz + 8);
      fence(cx + 9, cz + 8, cx + 9, cz - 8);
      for (let k = 0; k < 4; k++) {
        const x = cx - 4.5 + k * 2.6;
        put('clothWhite', boxG(0.75, 0.38, 1.9), x, 0, cz + 4.6, 0, r);
      }
      put('metal', boxG(0.12, 2.4, 0.12), cx + 6.5, 0, cz + 4.5, 0, r);
      put('canvasStripe', new THREE.ConeGeometry(1.6, 0.6, 8).translate(0, 0.3, 0), cx + 6.5, 2.2, cz + 4.5, 0, r);
      blockC(cx + 6.5, cz + 4.5, 0.2);
      ornPalm(cx + 7.2, cz - 6, 1, rnd);
      ornPalm(cx - 7.6, cz - 6.4, 0.9, rnd);
    }
    // 路边的霓虹招牌：高杆 + 红底牌子 + 黄箭头 + 青色的"有空房"
    {
      const x = Math.max(lotW + 0.5, roadE + 2.2);
      const z = LZ1 + 3.5;
      const rr = reg(x, z);
      put('metal', boxG(0.4, 9.2, 0.4), x, 0, z, 0, rr);
      blockC(x, z, 0.35);
      // 招牌夜里亮（霓虹：白天是本色，天黑换成自发光、地上一圈暖光）
      nightGlow(
        'motel:neon',
        [
          ['clothRed', 'clothRed', 0x3a0c10, [boxG(5.4, 2.5, 0.45).translate(x + 1.2, 7.0, z)]],
          ['signPaint', 'signPaint', 0x2a2420, [boxG(4.4, 0.55, 0.08).translate(x + 1.2, 8.4, z + 0.25)]],
          [
            'flowerYellow',
            'flowerYellow',
            0x3a2c08,
            [
              boxG(4.6, 0.3, 0.08).translate(x + 1.2, 7.35, z + 0.25),
              new THREE.BoxGeometry(2.2, 0.45, 0.2).rotateZ(-0.5).translate(x + 3.9, 6.3, z + 0.1),
            ],
          ],
          ['clothTeal', 'clothTeal', 0x0a2a2a, [boxG(3, 0.75, 0.3).translate(x + 0.9, 5.6, z)]],
        ],
        [x + 1.5, z + 2, 5.5, 9.5],
      );
      // 杆脚一圈石头和龙舌兰
      for (let k = 0; k < 4; k++)
        rock(x + Math.cos(k * 1.7) * 1.4, z + Math.sin(k * 1.7) * 1.4, 0.45, rnd, 'rockCool', 0);
      agave(x + 1.6, z + 1.6, 1.1, rnd);
    }
  }

  // ════════════════════════════════════════════════════════════════════
  /** 峡谷高尔夫：果岭上的旗、修剪的条纹、蜿蜒的球车道、发球台、水障碍、一辆停着的球车、几丛棕榈 */
  function golf() {
    const q = GREENS.find((g) => g.id === 'canyon_golf');
    if (!q) return;
    const rnd = d.rng('valley:south:golf');
    const [cx, cz] = q.poly.reduce(([a, b], [x, z]) => [a + x / q.poly.length, b + z / q.poly.length], [0, 0]);
    const r = reg(cx, cz);
    const spots: V2[] = [];
    for (let k = 0; k < 7; k++) {
      const a = k * 2.4;
      spots.push([cx + Math.cos(a) * (35 + k * 10), cz + Math.sin(a) * (24 + k * 5)]);
    }
    const nearSpot = (x: number, z: number, pad: number) =>
      spots.some(([sx, sz]) => Math.hypot(sx - x, (sz - z) * 1.3) < 13 + pad);
    // 修剪的条纹：斜着的一条条（四个角都在球场里才画）
    const rot = 0.38;
    for (let i = -14; i <= 14; i++) {
      if (i % 2) continue;
      for (let j = -6; j <= 6; j++) {
        const lx = i * 6;
        const lz = j * 9;
        const [ox, oz] = S(800, 150);
        const x = ox + lx * Math.cos(rot) + lz * Math.sin(rot);
        const z = oz - lx * Math.sin(rot) + lz * Math.cos(rot);
        const corners: V2[] = [
          [-3, -4.5],
          [3, -4.5],
          [3, 4.5],
          [-3, 4.5],
        ].map(([a, b]) => [x + a * Math.cos(rot) + b * Math.sin(rot), z - a * Math.sin(rot) + b * Math.cos(rot)] as V2);
        if (!corners.every(([a, b]) => inPoly(q.poly, a, b))) continue;
        if (nearSpot(x, z, 0)) continue;
        putF('lawnStripe', boxG(6, 0.01, 9.1), x, 0.025, z, rot, r); // 草地 0.015：错开 1 厘米（原来 0.016，只差 1 毫米，傍晚一片麻点）
      }
    }
    // 果岭上的旗
    spots.forEach(([x, z], k) => {
      if (k % 2 || !inPoly(q.poly, x, z)) return;
      put('clothWhite', boxG(0.14, 2.8, 0.14), x, 0, z, 0, r);
      put(k % 4 ? 'flowerYellow' : 'clothRed', boxG(1, 0.6, 0.06), x + 0.55, 2.1, z, 0, r);
      blockC(x, z, 0.12);
    });
    // 球车道（水泥，弯弯的）
    const path: V2[] = SL([
      [700, 76],
      [714, 92],
      [742, 102],
      [776, 96],
      [810, 104],
      [840, 128],
      [828, 168],
      [790, 186],
      [752, 182],
      [728, 196],
    ]);
    for (let i = 1; i < path.length; i++) {
      const [ax, az] = path[i - 1];
      const [bx, bz] = path[i];
      const L = Math.hypot(bx - ax, bz - az);
      const nx = (-(bz - az) / L) * 1.3;
      const nz = ((bx - ax) / L) * 1.3;
      fquad(
        r,
        'concrete',
        [ax + nx, 0.045, az + nz],
        [bx + nx, 0.045, bz + nz],
        [bx - nx, 0.045, bz - nz],
        [ax - nx, 0.045, az - nz],
      );
      putF('concrete', new THREE.CircleGeometry(1.3, 8).rotateX(-Math.PI / 2), bx, 0.045, bz, 0, r);
    }
    // 发球台（亮一档的草块）+ 两个发球标
    for (const [ox, oz, a] of [
      [720, 84, 0.3],
      [846, 140, 1.2],
      [744, 190, -0.2],
    ] as [number, number, number][]) {
      const [x, z] = S(ox, oz);
      put('green', boxG(9, 0.03, 5), x, 0.056, z, a, r); // 球车道 0.045 之上 1 厘米（发球台压着车道）
      put('clothBlue', blobG(0.22), x - 1.5, 0.15, z, 0, r);
      put('clothBlue', blobG(0.22), x + 1.5, 0.15, z, 0, r);
    }
    // 水障碍：一个不规则的潭 + 岸石
    {
      const [px, pz] = S(905, 168);
      const poly = blobPoly(px, pz, 17, 9, rnd, 14, 0.18);
      put('sandHigh', topGeo(blobPoly(px, pz, 19.5, 11, rnd, 14, 0.12), 0), 0, 0.045, 0, 0, r);
      putF('water', topGeo(poly, 0), 0, 0.057, 0, 0, r);
      blocked({ poly });
      for (let k = 0; k < 7; k++) {
        const a = rnd() * TAU;
        rock(px + Math.cos(a) * 17.5, pz + Math.sin(a) * 9.5, 0.5 + rnd() * 0.6, rnd, 'rockCool', 0);
      }
      put('foam', blobG(0.6, 1, 0.3, 1), px + 2, 0.06, pz, 0, r); // 喷泉
      put('foam', boxG(0.25, 1.4, 0.25), px + 2, 0, pz, 0, r);
    }
    // 球车：停在车道边（白车身、帆布顶、四根柱、一袋球杆）
    {
      const [x, z] = S(746, 106.5);
      const a = 0.15;
      const g = (key: PalKey, geo: THREE.BufferGeometry, lx: number, y: number, lz: number) => {
        const c = Math.cos(a);
        const s = Math.sin(a);
        put(key, geo, x + lx * c + lz * s, y, z - lx * s + lz * c, a, r);
      };
      g('clothWhite', boxG(1.3, 0.6, 2.5), 0, 0.3, 0);
      g('seat', boxG(1.2, 0.5, 0.7), 0, 0.9, 0.1);
      for (const [dx, dz] of [
        [-0.6, -1],
        [0.6, -1],
        [-0.6, 0.8],
        [0.6, 0.8],
      ] as V2[])
        g('metal', boxG(0.1, 1.4, 0.1), dx, 0.9, dz);
      g('canvas', boxG(1.5, 0.12, 2.3), 0, 2.3, -0.1);
      g('clothRed', cylG(0.22, 0.22, 1.1, 6), 0, 0.9, 1.1);
      for (const [dx, dz] of [
        [-0.65, -0.85],
        [0.65, -0.85],
        [-0.65, 0.85],
        [0.65, 0.85],
      ] as V2[])
        g(
          'ironwork',
          cylG(0.28, 0.28, 0.22, 8)
            .rotateZ(Math.PI / 2)
            .translate(0, 0.28, 0),
          dx,
          0,
          dz,
        );
      blocked({ a: [x - 1.2 * Math.sin(a), z - 1.2], b: [x + 1.2 * Math.sin(a), z + 1.2], r: 0.8 });
    }
    // 棕榈丛（三棵一组，不排队）
    for (const [x, z] of SL([
      [640, 96],
      [668, 186],
      [790, 80],
      [880, 205],
      [960, 135],
      [870, 98],
    ])) {
      const m = 2 + Math.floor(rnd() * 2);
      for (let k = 0; k < m; k++) {
        const px = x + (rnd() - 0.5) * 8;
        const pz = z + (rnd() - 0.5) * 6;
        if (inPoly(q.poly, px, pz) && !nearSpot(px, pz, 0)) ornPalm(px, pz, 0.95 + rnd() * 0.35, rnd);
      }
    }
  }

  // ════════════════════════════════════════════════════════════════════
  /** 俱乐部车道（出山湾）：路口的俱乐部名牌矮墙、沿路的夹竹桃绿篱（断成几截）、棕榈丛和石头花坛 */
  function drive() {
    const rnd = d.rng('valley:south:drive');
    const road = ROADS.find((q) => q.id === 'drive');
    if (!road) return;
    // 名牌矮墙：车道北边、棕榈谷大道路口，牌子朝南（朝车道、朝镜头）
    {
      // x 过 S；z 按车道：北边路沿往北 7 米（缩完以后离棕榈谷大道的路口也是按路算的）
      const x = S(276, -18.5)[0];
      const z = closest(road.pts, x, -30)[1] - road.w / 2 - 7;
      const a = 0;
      put('stucco', boxG(10, 1.4, 1.1), x, 0, z, a);
      put('roofTile', boxG(10.5, 0.28, 1.4), x, 1.4, z, a);
      put('signBoard', boxG(6, 0.8, 0.12), x, 0.35, z + 0.6, a);
      put('signPaint', boxG(4.6, 0.18, 0.05), x, 0.65, z + 0.68, a);
      put('flowerYellow', blobG(0.25), x - 2.6, 0.75, z + 0.68, a); // 网球（俱乐部的标）
      blocked({ x0: x - 5.1, x1: x + 5.1, z0: z - 0.6, z1: z + 0.6 });
      // 夜里花坛里的地灯照着名牌（只有一圈光，不画灯具）
      nightGlow('club-sign', [], [x, z + 2.4, 5, 2.2]);
      // 墙前的花坛：石头、龙舌兰、仙人球；墙后两棵棕榈
      putF('sandDrift', topGeo(blobPoly(x, z + 2.2, 7, 1.8, rnd, 10, 0.1), 0.012), 0, 0, 0, 0, reg(x, z));
      agave(x - 4, z + 2.1, 1.2, rnd);
      agave(x + 3.6, z + 2.4, 1, rnd);
      barrel(x + 1.2, z + 2.6, 1.1);
      barrel(x - 1.5, z + 2.2, 0.9);
      rock(x + 5.6, z + 2, 0.8, rnd, 'rockCool', 0);
      ornPalm(x - 6.5, z - 2.5, 1.1, rnd);
      ornPalm(x + 6.8, z - 2, 1, rnd);
    }
    // 沿车道北边的夹竹桃绿篱：几截，高矮不一（一团团，球面法线）
    const hedges: [number, number][] = (
      [
        [146, 172],
        [184, 196],
        [226, 246],
      ] as [number, number][]
    ).map(([a, b]) => [S(a, 0)[0], S(b, 0)[0]]);
    // 第二轮：原来每 1.6 米一团、一样大，读成一排等距的绿球。改成一丛丛（3～8 米长）、团的大小 / 前后 / 高矮都不一样，丛间留空
    for (const [xa, xb] of hedges) {
      let x = xa + rnd() * 3;
      while (x < xb) {
        const len = 3 + rnd() * 5;
        let prev: V2 | null = null;
        for (let u = 0; u <= len && x + u <= xb; u += 1.0 + rnd() * 1.1) {
          const px = x + u;
          const [, zr] = closest(road.pts, px, -10);
          const z = zr - 8.5 - Math.sin(px / 9) * 0.8 + (rnd() - 0.5) * 1.1;
          if (!free(px, z, 0.5)) {
            prev = null;
            continue;
          }
          const r = 0.75 + rnd() * 0.65;
          const h = 0.8 + rnd() * 0.6;
          put('olive', blobG(r, 1, h, 0.9), px, r * h * 0.85, z);
          if (rnd() < 0.22) put('flowerRed', blobG(0.25), px + (rnd() - 0.5) * r, r * h * 1.55, z + 0.5 * r);
          if (prev) blocked({ a: prev, b: [px, z], r: 0.8 });
          prev = [px, z];
        }
        x += len + 4 + rnd() * 7;
      }
    }
    // 棕榈丛和石头：路两边，一簇簇
    for (const [ox, oz, n] of [
      [160, 12, 2],
      [176, -20, 3],
      [252, 12, 2],
      [262, -18, 1],
    ] as [number, number, number][]) {
      const [x, z] = S(ox, oz);
      for (let k = 0; k < n; k++) {
        const px = x + (rnd() - 0.5) * 6;
        const pz = z + (rnd() - 0.5) * 4;
        if (!inClubBox(px, pz) && !nearRoad(px, pz, 1.5)) ornPalm(px, pz, 1 + rnd() * 0.3, rnd);
      }
      for (let k = 0; k < 3; k++) {
        const px = x + (rnd() - 0.5) * 8;
        const pz = z - 2 + (rnd() - 0.5) * 3;
        if (!inClubBox(px, pz) && !nearRoad(px, pz, 1.5)) rock(px, pz, 0.5 + rnd() * 0.7, rnd, 'rock', 0);
      }
    }
  }

  // ════════════════════════════════════════════════════════════════════
  /** 酒店扩张地：推平的土台、几道土垄、工地板房、流动厕所、一摞砖、挖掘机、路边的效果图大牌子（都跟着开关藏） */
  function hotelSite() {
    const x0 = 143;
    const x1 = HOTEL_PLOT.x1 - 4;
    const z0 = HOTEL_PLOT.z0 + 6;
    const z1 = HOTEL_PLOT.z1 - 4;
    // 推平的土台（钙质土的亮色，跟沙分得开）
    const pad: V2[] = [
      [x0, z0 + 3],
      [x0 + 20, z0],
      [x1 - 6, z0 + 1],
      [x1, z0 + 8],
      [x1 - 2, z1 - 6],
      [x1 - 14, z1],
      [x0 + 10, z1 - 1],
      [x0, z1 - 12],
    ];
    // 第二轮：原来铺的是步道的钙质土（一整片 90 × 80 米的浅色碎石纹，发白、发噪），换成略偏玫瑰的台地沙
    putHotel('sandHigh', topGeo(pad, 0.014), 0, 0, 0);
    // 土堆（推出来的土）：一溜三四个圆鼓鼓的堆，大小不一（原来是一块压扁的圆盘，像浮在地上的碟子）
    {
      const rnd = d.rng('valley:south:hotelPiles');
      for (const [x0, z0, n] of [
        [146, 92, 4],
        [226, 38, 3],
      ] as [number, number, number][])
        for (let k = 0; k < n; k++) {
          const r = 1.6 + rnd() * 1.2;
          putHotel(
            'sandDrift',
            blobG(r, 1.2, 0.55 + rnd() * 0.2, 1),
            x0 + k * 3.1 + rnd(),
            0,
            z0 + (rnd() - 0.5) * 2.4,
          );
        }
    }
    // 板房（工地办公室）+ 流动厕所
    putHotel('canvas', boxG(8, 2.6, 3), 221, 0.4, 90);
    putHotel('ironwork', boxG(1.6, 0.8, 0.08), 219, 1.6, 91.55);
    putHotel('woodWeathered', boxG(1.4, 0.4, 1.2), 222, 0, 92.1);
    putHotel('clothBlue', boxG(1.2, 2.3, 1.2), 228, 0, 94);
    // 一摞摞的砖（托盘）和钢筋
    for (let k = 0; k < 4; k++) {
      putHotel('woodWeathered', boxG(1.4, 0.15, 1.4), 200 + k * 2, 0, 90.5);
      putHotel('concrete', boxG(1.3, 0.9 + (k % 2) * 0.4, 1.3), 200 + k * 2, 0.15, 90.5);
    }
    for (let k = 0; k < 6; k++) putHotel('rust', boxG(6, 0.1, 0.1), 182, 0.1 + k * 0.12, 94 + k * 0.18);
    // 挖掘机（黄的车身、深色履带、伸出去的臂和斗）
    {
      const x = 176;
      const z = 58;
      putHotel('ironwork', boxG(3.4, 0.7, 1), x, 0, z - 1.3);
      putHotel('ironwork', boxG(3.4, 0.7, 1), x, 0, z + 1.3);
      putHotel('flowerYellow', boxG(2.8, 1.3, 2.6), x, 0.7, z);
      putHotel('flowerYellow', boxG(1.3, 1.2, 1.3), x - 0.6, 2, z + 0.5);
      putHotel('ironwork', boxG(1.1, 0.8, 0.06), x - 0.6, 2.25, z + 1.18);
      putHotel(
        'flowerYellow',
        new THREE.BoxGeometry(4, 0.4, 0.45).translate(2, 0, 0).rotateZ(0.6),
        x + 1.2,
        2.2,
        z - 0.3,
      );
      putHotel(
        'flowerYellow',
        new THREE.BoxGeometry(3.2, 0.35, 0.4).translate(1.6, 0, 0).rotateZ(-1.1),
        x + 4.4,
        4.5,
        z - 0.3,
      );
      putHotel('ironwork', boxG(0.9, 0.7, 0.9), x + 5.7, 0, z - 0.3);
    }
    // 路边牌子（车道北边，朝南）：酒店效果图。第二轮：原来 9 × 3.8 米、离地 2.4 米，投下一整块方的影子；
    // 缩成 6 × 2.4 米、离地 1.2 米，板子不投影（只有两根腿投）
    {
      const x = 205;
      const z = -15.5;
      for (const dx of [-2.3, 2.3]) putHotel('wood', boxG(0.28, 1.5, 0.28), x + dx, 0, z);
      putHotel('signBoard', boxG(6, 2.4, 0.22), x, 1.2, z, 0, false);
      putHotel('stucco', boxG(3.2, 1.0, 0.08), x - 1, 1.75, z + 0.14, 0, false);
      putHotel('roofTile', boxG(3.6, 0.25, 0.08), x - 1, 2.75, z + 0.14, 0, false);
      putHotel('water', boxG(2, 0.25, 0.08), x - 1, 1.45, z + 0.15, 0, false);
      putHotel('signPaint', boxG(1.4, 0.25, 0.06), x + 1.9, 3.0, z + 0.14, 0, false);
      putHotel('flowerYellow', boxG(1.6, 0.4, 0.06), x + 1.9, 1.9, z + 0.14, 0, false);
    }
  }

  // ════════════════════════════════════════════════════════════════════
  /** 山嘴上的石堆（p_spur）：一摞扁石头、一条晒白的木头长椅（看得见整个湾）、小路拐角的几块石头 */
  function spur() {
    const rnd = d.rng('valley:south:spur');
    const poi = POIS.find((p) => p.id === 'p_spur') ?? { x: 148, z: -100 };
    // 旗杆立在 (x, z + 3)：石堆在旗后面（北）一点
    const X = poi.x + 3;
    const Z = poi.z - 3.5;
    d.clear({ x0: X - 4, x1: X + 8, z0: Z - 4, z1: Z + 8 });
    let y = 0;
    const sizes = [1.25, 1.02, 0.82, 0.65, 0.5, 0.36];
    sizes.forEach((r, k) => {
      const h = r * 0.5;
      put(k % 2 ? 'rockCool' : 'rock', rockG(r, rnd, 0.42), X + (rnd() - 0.5) * 0.15, y + h * 0.5, Z, 0, 'club');
      y += h * 0.92;
    });
    blockC(X, Z, 1);
    for (let k = 0; k < 5; k++) {
      const a = rnd() * TAU;
      rock(X + Math.cos(a) * 1.8, Z + Math.sin(a) * 1.4, 0.3 + rnd() * 0.3, rnd, 'rock', 0);
    }
    // 长椅：一根劈开的木头（朝南，看湾里）
    if (!nearRoad(X + 5.5, Z + 6.5, 0.8)) {
      put('woodWeathered', boxG(2.6, 0.45, 0.55), X + 5.5, 0, Z + 6.5, -0.3, 'club');
      blocked({ a: [X + 4.3, Z + 6.1], b: [X + 6.7, Z + 6.9], r: 0.35 });
    }
    // 植物在石堆两边（原来在正北 3.5 米，屏幕上叠在石堆顶上，像从石头里长出来）
    if (inFloor(X + 3.4, Z + 0.6)) brittle(X + 3.4, Z + 0.6, 1.1, rnd);
    if (inFloor(X - 4, Z + 0.4)) ocotillo(X - 4, Z + 0.4, 1, rnd);
    // 小路拐角：路边几块石头（不是一整排）
    const tr = ROADS.find((q) => q.id === 'spur_trail')?.pts ?? [];
    for (let i = 1; i < tr.length - 1; i++) {
      const [x, z] = tr[i];
      if (inClubBox(x, z)) continue;
      for (let k = 0; k < 4; k++) {
        const a = rnd() * TAU;
        const px = x + Math.cos(a) * (2 + rnd());
        const pz = z + Math.sin(a) * (2 + rnd());
        if (distToLine(tr, px, pz) > 1.6 && !inClubBox(px, pz)) rock(px, pz, 0.3 + rnd() * 0.35, rnd, 'rock', 0);
      }
    }
    // 小路起点的路牌
    // 小路起点的路牌：出俱乐部那块后的第一个拐点西边 2 米
    if (tr.length > 1) {
      const [sx, sz] = [tr[1][0] - 2.2, tr[1][1] + 0.4];
      put('woodWeathered', boxG(0.18, 1.5, 0.18), sx, 0, sz, 0, 'club');
      put('signBoard', boxG(0.9, 0.4, 0.1), sx + 0.4, 1.1, sz + 0.1, 0, 'club');
      blockC(sx, sz, 0.15);
    }
  }

  // ════════════════════════════════════════════════════════════════════
  /** 美术馆步道：起点路牌、每个拐角一根木桩路标和一堆石头、路边的石头时有时无、半山一张长椅、坡上的龙舌兰和仙人掌、观景台的投币望远镜 */
  function museumTrail() {
    const rnd = d.rng('valley:south:trail');
    const tr = ROADS.find((q) => q.id === 'museum_trail')?.pts ?? [];
    if (tr.length < 2) return;
    const cum = [0];
    for (let i = 1; i < tr.length; i++)
      cum.push(cum[i - 1] + Math.hypot(tr[i][0] - tr[i - 1][0], tr[i][1] - tr[i - 1][1]));
    const regAt = (s: number, x: number, z: number) => (trailY(s) > 0.3 ? 'mountain' : reg(x, z));
    // 起点路牌（朝南）
    {
      const [x, z] = tr[0];
      const r = reg(x, z);
      for (const dx of [-0.8, 0.8]) put('woodWeathered', boxG(0.18, 1.8, 0.18), x + 3 + dx, 0, z + 3, 0, r);
      put('signBoard', boxG(2, 1, 0.12), x + 3, 1, z + 3.05, 0, r);
      put('signPaint', boxG(1.5, 0.18, 0.05), x + 3, 1.6, z + 3.13, 0, r);
      blocked({ a: [x + 2.2, z + 3], b: [x + 3.8, z + 3], r: 0.15 });
    }
    // 拐角：木桩路标 + 石堆（外侧）
    for (let i = 1; i < tr.length - 1; i++) {
      const [x, z] = tr[i];
      const s = cum[i];
      const y = trailY(s) - 0.25;
      const [ax, az] = tr[i - 1];
      const [bx, bz] = tr[i + 1];
      // 外侧 = 两段方向的平分线反方向
      let ox = (x - ax) / Math.hypot(x - ax, z - az) - (bx - x) / Math.hypot(bx - x, bz - z);
      let oz = (z - az) / Math.hypot(x - ax, z - az) - (bz - z) / Math.hypot(bx - x, bz - z);
      const ol = Math.hypot(ox, oz) || 1;
      ox /= ol;
      oz /= ol;
      const r = regAt(s, x, z);
      const px = x + ox * 2.3;
      const pz = z + oz * 2.3;
      put('woodWeathered', boxG(0.2, 1.2, 0.2), px, y, pz, 0, r);
      put('signBoard', boxG(0.45, 0.32, 0.08), px, y + 0.95, pz + 0.13, 0, r);
      let cy = y;
      for (const rr of [0.55, 0.42, 0.3, 0.2]) {
        put(rr > 0.4 ? 'rock' : 'rockCool', rockG(rr, rnd, 0.45), px + ox * 1.2, cy + rr * 0.25, pz + oz * 1.2, 0, r);
        cy += rr * 0.42;
      }
    }
    // 路边的石头：一段有、一段没有
    const ph = [rnd() * TAU, rnd() * TAU, rnd() * TAU];
    for (const [s, p, t] of along(tr, 2.2)) {
      if (wav(s, ph, 0.6) < 0.1) continue;
      for (const sd of [-1, 1]) {
        if (rnd() < 0.45) continue;
        const off = 1.55 + rnd() * 0.4;
        const x = p[0] - t[1] * sd * off;
        const z = p[1] + t[0] * sd * off;
        put(
          rnd() < 0.3 ? 'rockCool' : 'rock',
          rockG(0.22 + rnd() * 0.16, rnd, 0.55),
          x,
          trailY(s) - 0.12,
          z,
          0,
          regAt(s, x, z),
        );
      }
    }
    // 半山的长椅（第三个拐角往前一点，朝南）
    {
      const i = Math.max(0, Math.min(3, tr.length - 2));
      const s = cum[i] + 6;
      const [ax, az] = tr[i];
      const [bx, bz] = tr[i + 1];
      const L = Math.hypot(bx - ax, bz - az);
      const x = ax + ((bx - ax) / L) * 6;
      const z = az + ((bz - az) / L) * 6 + 2.2;
      const y = trailY(s) - 0.2;
      const r = regAt(s, x, z);
      put('wood', boxG(2, 0.12, 0.55), x, y + 0.45, z, 0, r);
      put('wood', boxG(2, 0.5, 0.1), x, y + 0.55, z - 0.3, 0, r);
      for (const dx of [-0.8, 0.8]) put('wood', boxG(0.14, 0.45, 0.5), x + dx, y, z, 0, r);
    }
    // 坡上的植物：离步道 5～14 米，成簇
    const steps = along(tr, 3);
    for (let k = 0; k < 16; k++) {
      const [, p, t] = steps[Math.floor(rnd() * steps.length)];
      const sd = rnd() < 0.5 ? -1 : 1;
      const off = 5 + rnd() * 9;
      const x = p[0] - t[1] * sd * off;
      const z = p[1] + t[0] * sd * off;
      const y = inFloor(x, z) ? 0 : Math.max(0, mountainY(x, z));
      if (inFloor(x, z) && nearBldg(x, z, 2)) continue;
      const pick = rnd();
      if (pick < 0.35) agave(x, z, 1 + rnd() * 0.3, rnd, y - 0.1);
      else if (pick < 0.6) cholla(x, z, 1.1, rnd, y - 0.1);
      else if (pick < 0.8) brittle(x, z, 1, rnd, y - 0.1);
      else ocotillo(x, z, 0.9, rnd, y - 0.1);
    }
    // 观景台：投币望远镜 + 外沿几块石头
    {
      const x = LOOKOUT.x + LOOKOUT.r * 0.6;
      const z = LOOKOUT.z + LOOKOUT.r * 0.5;
      const y = LOOKOUT.y;
      put('metal', boxG(0.2, 1.1, 0.2), x, y, z, 0, 'mountain');
      put('metal', new THREE.BoxGeometry(0.35, 0.35, 0.8).rotateX(0.35), x, y + 1.25, z - 0.1, 0, 'mountain');
      blockC(x, z, 0.25);
      for (let k = 0; k < 6; k++) {
        const a = 1.2 + k * 0.5;
        const rx = LOOKOUT.x + Math.cos(a) * (LOOKOUT.r + 1.5);
        const rz = LOOKOUT.z + Math.sin(a) * (LOOKOUT.r + 1.5);
        put('rock', rockG(0.6 + rnd() * 0.6, rnd, 0.6), rx, Math.max(0, mountainY(rx, rz)) - 0.1, rz, 0, 'mountain');
      }
    }
  }
}
