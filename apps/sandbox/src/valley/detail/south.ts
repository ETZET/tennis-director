// valley 细节：平地边的山脚碎石坡、住宅（只有外景：镇子外面一圈 res_* 小街两边的院子）、酒店扩张地。
// 2026-11-21 小镇压紧：河床、峡谷和瀑布、绿洲、高尔夫、汽车旅馆、山嘴石堆、美术馆步道、车道口的名牌都删了。
// 接口见 build.ts 的 DetailCtx。只改这个文件。
//
// 照 pixel-scene 的构图规矩（lessons.md「沙漠失败复盘」）：
// - 平地留白，细节成簇放，不满地撒；
// - 朝镜头（南）的竖直面自动落暗档 = 免费的暗带：院墙、后院的矮砖墙都朝南；
// - 可见的东西 ≥ 3 纹素（杆子 ≥ 0.14 米），栏杆、篱笆用一整条带子，不画一根根细杆；
// - 树冠、灌木用球面法线的团（不是面法线的多面体）；石头用面法线的切面；
// - 小植物不放在大东西的影子里（太阳在北边偏高，影子落向镜头 = 南边）。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Shape } from '../../clubsite/play';
import { smoothLine, topGeo as topGeoW } from '../../clubsite/render/geo';
import { vnoise } from '../../clubsite/render/noise';
import { type DetailCtx, type InstItem, palmCrownGeo } from '../build';
import {
  type Bldg,
  BUILDINGS_RAW as BUILDINGS,
  distToLine,
  FLOOR,
  GREENS,
  HOTEL_PLOT,
  housesRaw as houses,
  inPoly,
  ROADS,
  regionAt,
  type V2,
} from '../layout';
import { EL, type PalKey } from '../reuse';
import { floorDist, inClubBox, mountainY } from '../terrain';
import { TOWN_K } from '../townscale';

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
/** 一团（detail 0，20 面）：球面法线，按 y 压扁 —— 实例化很多的灌木用（一丛 5 团 ≈ 100 三角形，细节靠叶团元素） */
function blob0(r: number, sy = 1): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(r, 0);
  const p = g.attributes.position as THREE.BufferAttribute;
  const n = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const v = new THREE.Vector3(p.getX(i), p.getY(i), p.getZ(i)).normalize();
    n.set([v.x, v.y, v.z], i * 3);
  }
  g.setAttribute('normal', new THREE.BufferAttribute(n, 3));
  g.deleteAttribute('uv');
  return g.scale(1, sy, 1);
}
/** 石头：面法线的十二面体，压扁、转一下 */
function rockG(r: number, rnd: () => number, flat = 0.62): THREE.BufferGeometry {
  const g = new THREE.DodecahedronGeometry(r, 0);
  g.scale(0.85 + rnd() * 0.35, flat * (0.8 + rnd() * 0.4), 0.85 + rnd() * 0.35);
  g.rotateY(rnd() * TAU);
  g.rotateX((rnd() - 0.5) * 0.3);
  return g;
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

export function detailSouth(d: DetailCtx): void {
  const HOUSES = houses();
  const BLD: Bldg[] = [...BUILDINGS, ...HOUSES];
  const reg = (x: number, z: number) => d.regionOf(x, z);
  /**
   * 别的模块在 south 之前占下的地（店、广场、五金的停车场和货场、townWrap 缩过的框；build.ts 的 takenSoFar）。
   * 撒的东西（石头、木焦油灌木、ocotillo、brittlebush、簇脚的碎石、河沟边的树）落在里面就不放 —— 原来 free() 只看楼、路、绿地，
   * 店后货场这种只 clear 过、没有楼的地照样撒进去。在"放"那一步丢，不在挑位置那一步跳过：随机流照旧往下走，别处撒的东西一件不变
   */
  const others = d.takenSoFar?.() ?? (() => false);
  let mute = false;

  // ── 攒几何：三角形按（区域, 材质），零件直接 put ──
  const tris = new Map<string, number[]>();
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
    if (mute) {
      g.dispose();
      return;
    }
    if (rot) g.rotateY(rot);
    g.translate(x, y, z);
    d.put(r ?? reg(x, z), key, g);
  };
  /**
   * 散在大片地上的石头：按 320 米一块分开合并、走 instance（投影），视锥外的块不画。
   * 原来合进（区域, 材质）一个网格：山脚一圈几百块石头横跨整张图，在哪都全画（第二轮：河床那边三角形超预算）
   */
  const rocks = new Map<string, THREE.BufferGeometry[]>();
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
  const brittle = (x: number, z: number, s: number, rnd: () => number, y = 0) => {
    mute = others(x, z, 0.8 * s);
    put('silverBlue', blobG(0.6 * s, 1.1, 0.7, 1), x, y + 0.3 * s, z);
    for (let k = 0; k < 3; k++) {
      const a = rnd() * TAU;
      put('flowerYellow', blobG(0.18 * s), x + Math.cos(a) * 0.35 * s, y + 0.62 * s, z + Math.sin(a) * 0.3 * s);
    }
    mute = false;
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
    mute = others(x, z, 1.2 * s);
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
    mute = false;
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

  // ── 棕榈：实例化（扇叶棕榈有一圈枯叶裙；观赏棕榈细干、无裙） ──
  const fanPalms: InstItem[] = [];
  const ornPalms: InstItem[] = [];
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

  // ── edge 区（2026-11-21 小镇精细化：俱乐部 → 镇子、山脚、镇外沙漠）的材质和攒几何 ──
  /** 石头：面法线的切面 + 石块元素（material-1 第 4 条：edge ≤ 0.25、convex ≤ 0.3、stones [7, 5]）；按（区域, 材质, 30 米一格）合并 */
  const ROCK_OPTS = {
    edge: 0.25,
    convex: 0.3,
    elem: { kind: 'stones', size: [7, 5], seam: 0.6, hi: 0.3 },
  } as const satisfies Parameters<typeof d.actx.mat>[1];
  const edgeRocks = new Map<string, THREE.BufferGeometry[]>();
  const rockE = (x: number, z: number, r0: number, rnd: () => number, cool: boolean, y?: number, flat = 0.62) => {
    // 尺寸按小镇的比例（TOWN_K）先缩好：这些网格走 addOwn，不让 townWrap 再缩
    const r = r0 * TOWN_K;
    const gy = y ?? groundY(x, z);
    const g = rockG(r, rnd, flat).translate(x, gy + r * flat * 0.35, z);
    if (others(x, z, r)) {
      g.dispose();
      return;
    }
    // 30 米一格一组（包围球小，露一点不会整组都画；lead 第 3 轮）
    // 一格一种石头（红 / 灰紫按格子的哈希挑，三成灰紫）：一格一个网格，绘制少一半
    const gx = Math.floor(x / 30);
    const gz = Math.floor(z / 30);
    void cool;
    const cellCool = (((gx * 73856093) ^ (gz * 19349663)) >>> 0) % 10 < 3;
    const k = `${reg(x, z)}|${cellCool ? 'rockCool' : 'rock'}|${gx}_${gz}`;
    const l = edgeRocks.get(k) ?? [];
    l.push(prep(g));
    edgeRocks.set(k, l);
  };
  /**
   * 木焦油灌木（creosote）：一丛 4～6 团合成一个圆顶，法线 = 团法线 × 0.45 + 整丛椭球法线 × 0.55（池塘第四轮的灌木：
   * 整丛一个亮顶，不是一颗颗绿二十面体）；叶团元素。lightUp 0.4 量过：整丛全落亮档、没有暗底（像一块平的绿贴纸）→ 0.22。一种造型实例化（30 米一格一组：包围球小，露一点不会整组都画），每丛按位置拉一点长宽、转一下
   */
  const CREO_OPTS = {
    lightUp: 0.22,
    noise: 0.35,
    bands: [0.12, 0.5],
    elem: { kind: 'leaves', size: [2.1, 2.1], hi: 0.15 },
  } as const satisfies Parameters<typeof d.actx.mat>[1];
  const creoKinds = [1].map((v) => {
    const rnd = d.rng(`valley:south:creo:${v}`);
    const parts: THREE.BufferGeometry[] = [];
    const n = 4 + v;
    for (let k = 0; k < n; k++) {
      const a = (k / n) * TAU + rnd() * 0.8;
      const rr = k === 0 ? 0 : 0.42 + rnd() * 0.25;
      const r = k === 0 ? 0.6 : 0.4 + rnd() * 0.16;
      parts.push(prep(blob0(r, 0.85).translate(Math.cos(a) * rr, r * 0.7 + (k === 0 ? 0.14 : 0), Math.sin(a) * rr)));
    }
    const g = mergeGeometries(parts);
    for (const x of parts) x.dispose();
    const p = g.attributes.position as THREE.BufferAttribute;
    const nn = g.attributes.normal as THREE.BufferAttribute;
    const v3 = new THREE.Vector3();
    const e3 = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      e3.set(p.getX(i) / 1.21, (p.getY(i) - 0.25) / 0.64, p.getZ(i) / 1.21).normalize();
      v3.set(nn.getX(i), nn.getY(i), nn.getZ(i)).multiplyScalar(0.45).addScaledVector(e3, 0.55).normalize();
      nn.setXYZ(i, v3.x, v3.y, v3.z);
    }
    return g;
  });
  const creoItems: InstItem[][] = creoKinds.map(() => []);
  const creosote = (x: number, z: number, s: number, rnd: () => number, y = 0) =>
    creoItems[Math.floor(rnd() * creoItems.length)].push({ x, z, y, s: s * TOWN_K, reg: reg(x, z), rot: rnd() * TAU });
  /**
   * 自己建的网格交给 build（归区域、锁着压暗、投影）但不让 townWrap 缩：townWrap 按整件的包围盒挑"小件 / 长条"，
   * 合并成一块的世界坐标网格（原点在 (0, 0)）被当成小件就绕原点缩 0.62 —— 整块挪走（石头、灌木跑到路上）；
   * 长条就 y × 0.62（土坎矮一截、坎上的石头沉进台面）。尺寸在这边按 TOWN_K 先算好，交过去以后把位置、缩放还原
   */
  const addOwn = (obj: THREE.Object3D, region: string) => {
    const p = obj.position.clone();
    const sc = obj.scale.clone();
    d.asset(obj, region);
    obj.position.copy(p);
    obj.scale.copy(sc);
    obj.updateMatrixWorld(true);
  };
  /** 路灯头（夜里换自发光）和灯光圈 */
  const lampHeads: THREE.BufferGeometry[] = [];
  const lampPools: [number, number, number][] = [];
  /**
   * 镇外的干河沟：仙人掌巷南边第二排房子（res_s3）的后院墙外、贴着南山脚：从山里冲出来，顺着山脚往西流，
   * 到西头又钻回山脚的冲积扇里
   */
  const WASH: V2[] = smoothLine(
    [
      [333, 165],
      [323, 151],
      [307, 143],
      [289, 137.5],
      [273, 132.5],
      [259, 127],
    ],
    2,
  );
  const washD = (x: number, z: number) => distToLine(WASH, x, z);

  d.clear({ x0: 141, x1: 234, z0: 22, z1: 102 }); // 酒店工地
  clubToTown();
  mountainFoot();
  yards();
  hotelSite();
  dryWash();
  outerDesert();
  edgeFinish();

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
    // 全镇一种棕榈冠（build.ts 的 palmCrownGeo）：大道的加州蒲葵同 build.ts（干 8 米、枯叶裙、冠 (10, 3.4)）
    const trunk = new THREE.CylinderGeometry(0.24, 0.36, 8, 6).translate(0, 4, 0);
    const skirt = new THREE.CylinderGeometry(0.75, 0.95, 2.4, 8).translate(0, 6.95, 0);
    const crown = palmCrownGeo(10, 3.4, 8.15, 3);
    // 干不投影（同 build.ts 的大道棕榈：低太阳下 9 米的干投出几十米的直黑带），冠和裙照投
    d.instance(trunk, 'palmTrunk', fanPalms, false);
    d.instance(skirt, 'palmSkirt', fanPalms);
    d.instance(crown, 'palm', fanPalms);
    const t2 = new THREE.CylinderGeometry(0.2, 0.3, 7.4, 5).translate(0, 3.7, 0);
    // 观赏棕榈：细干、无裙，冠 (8, 2.6)
    const c2 = palmCrownGeo(8, 2.6, 7.4, 5);
    d.instance(t2, 'palmTrunk', ornPalms);
    d.instance(c2, 'palm', ornPalms);
    for (const l of [...smokeItems, ...paloItems]) {
      const keep = l.filter((it) => !others(it.x, it.z, 1.5));
      l.length = 0;
      l.push(...keep);
    }
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
  /**
   * 山脚收边（2026-11-21 小镇精细化，composition-1 第 10 条、material-1 第 16 条）：平地边外 2～6 米一道 0.8～1.5 米的
   * 土坎（红岩层）/ 毛石挡土墙（住家背后），轮廓跟着平地边弯；朝南的段落暗档 = 一条暗带，墙脚一条投影（沙漠复盘 2）。
   * 坎上一条碎石台面一直接到山坡，台面上成簇的石头和沙漠植物（镇子里唯一密撒的地方）。一段 26～76 米，段间断开 8～18 米：
   * 断口是山沟冲下来的冲积扇（沙斑 + 碎石，往平地里伸几米）。
   * 南边的平地边（朝外的法线朝南）不做坎：朝北的墙面在镜头背面看不见，只剩一条台面 —— 那边是冲积扇和成簇的植物。
   */
  function mountainFoot() {
    const rnd = d.rng('valley:south:foot');
    // 平地边一圈按 2 米重采样
    const ring: { x: number; z: number; s: number }[] = [];
    let arc = 0;
    for (let i = 0; i < FLOOR.length; i++) {
      const [ax, az] = FLOOR[i];
      const [bx, bz] = FLOOR[(i + 1) % FLOOR.length];
      const L = Math.hypot(bx - ax, bz - az);
      for (let t = 0; t < L; t += 2)
        ring.push({ x: ax + ((bx - ax) * t) / L, z: az + ((bz - az) * t) / L, s: arc + t });
      arc += L;
    }
    const N = ring.length;
    interface Smp {
      x: number;
      z: number;
      nx: number;
      nz: number;
      s: number;
      ok: boolean;
    }
    const smp: Smp[] = ring.map((p, i) => {
      // 朝外的法线：前后 6 米的切线（拐角处圆一点）
      const a = ring[(i - 3 + N) % N];
      const b = ring[(i + 3) % N];
      const tl = Math.hypot(b.x - a.x, b.z - a.z) || 1;
      let nx = -(b.z - a.z) / tl;
      let nz = (b.x - a.x) / tl;
      if (inFloor(p.x + nx * 2, p.z + nz * 2)) {
        nx = -nx;
        nz = -nz;
      }
      let o = 2 + 4 * vnoise(p.s / 23, 0.5, 61);
      let x = p.x + nx * o;
      let z = p.z + nz * o;
      let ok =
        nz < 0.45 &&
        !(p.x > 340 && p.x < 465 && p.z < -196) &&
        !inFloor(x, z) &&
        inFloor(p.x - nx * 2, p.z - nz * 2) &&
        !inClubBox(p.x, p.z) &&
        !inClubBox(x, z) &&
        !inHotel(x, z, 8) &&
        Math.abs(floorDist(x, z) - o) < 1.2;
      // 山已经长起来了：往平地这边收（墙要站在山脚外沿的平地带上）
      while (ok && o > 1.6 && mountainY(x, z) > 0.3) {
        o -= 0.5;
        x = p.x + nx * o;
        z = p.z + nz * o;
      }
      ok &&= mountainY(x, z) <= 0.3;
      return { x, z, nx, nz, s: p.s, ok };
    });
    // 分段：一段 13～38 个点（26～76 米），段间空 4～9 个点；断口中间那个点放冲积扇
    const runs: Smp[][] = [];
    const fans: Smp[] = [];
    let cur: Smp[] = [];
    let want = 13 + Math.floor(rnd() * 26);
    for (let i = 0; i < N; i++) {
      const p = smp[i];
      if (!p.ok) {
        if (cur.length >= 5) runs.push(cur);
        cur = [];
        continue;
      }
      cur.push(p);
      if (cur.length >= want) {
        runs.push(cur);
        cur = [];
        want = 13 + Math.floor(rnd() * 26);
        const gap = 4 + Math.floor(rnd() * 6);
        const mid = smp[i + Math.ceil(gap / 2)];
        if (mid?.ok) fans.push(mid);
        i += gap;
      }
    }
    if (cur.length >= 5) runs.push(cur);

    // 墙：土坎（红岩层，strata 墙面元素，uv = [沿墙米, 离墙顶米]，aElem.x = 露出高度）和毛石墙（住家背后，石块元素）
    const wall = { cliff: { pos: [] as number[], nor: [] as number[], uv: [] as number[], ex: [] as number[] } };
    const rubble: number[] = [];
    const bench: number[] = [];
    for (const run of runs) {
      const n = run.length;
      const nearHome = run.some((p) => nearBldg(p.x, p.z, 12));
      const pts = run.map((p, i) => {
        // 两头 7 米收成矮坎、钻进地里（不是一刀切的端面）
        const end = Math.min(i, n - 1 - i) * 2;
        const h = (1.0 + 0.6 * vnoise(p.s / 15, 3.5, 63)) * Math.min(1, 0.18 + end / 7);
        // 台面往山那边铺到山坡高过台面
        let w = 1.5;
        while (w < 18 && mountainY(p.x + p.nx * w, p.z + p.nz * w) < h + 0.25) w += 1;
        return { ...p, h, w: w + 0.6 };
      });
      let along = 0;
      for (let i = 0; i + 1 < n; i++) {
        const a = pts[i];
        const b = pts[i + 1];
        const L = Math.hypot(b.x - a.x, b.z - a.z);
        // 墙面：法线朝平地（−n）；绕向按段的切线定，正面朝平地
        const tx = b.x - a.x;
        const tz = b.z - a.z;
        const facing = -tz * -a.nx + tx * -a.nz > 0;
        const yb = -0.15;
        const A = [a.x, a.h, a.z];
        const B = [a.x, yb, a.z];
        const C = [b.x, b.h, b.z];
        const D = [b.x, yb, b.z];
        const tri = facing ? [A, B, C, B, D, C] : [A, C, B, B, C, D];
        if (nearHome) for (const v of tri) rubble.push(...v);
        else {
          const W = wall.cliff;
          for (const v of tri) {
            W.pos.push(...v);
            const isA = v === A || v === B;
            const u = isA ? along : along + L;
            const hh = isA ? a.h : b.h;
            W.uv.push(u, v[1] === yb ? hh - yb : 0);
            W.nor.push(-(isA ? a.nx : b.nx), 0, -(isA ? a.nz : b.nz));
            W.ex.push(hh, 0, 0, 0);
          }
        }
        along += L;
        // 台面（墙顶那条线往山那边，平的）
        const qa = [a.x + a.nx * a.w, a.h, a.z + a.nz * a.w];
        const qb = [b.x + b.nx * b.w, b.h, b.z + b.nz * b.w];
        bench.push(...A, ...qa, ...C, ...qa, ...qb, ...C);
      }
      // 台面上成簇的石头和植物：每 10～16 米一簇
      for (let i = 2 + Math.floor(rnd() * 3); i < n - 2; i += 5 + Math.floor(rnd() * 3)) {
        const p = pts[i];
        const out = 1.2 + rnd() * Math.max(0.5, Math.min(4.5, p.w - 2));
        const cx = p.x + p.nx * out;
        const cz = p.z + p.nz * out;
        const y = Math.max(p.h, mountainY(cx, cz));
        cluster(cx, cz, rnd, y, p.nx, p.nz);
      }
    }
    if (wall.cliff.pos.length) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(wall.cliff.pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(wall.cliff.nor, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(wall.cliff.uv, 2));
      g.setAttribute('aElem', new THREE.Float32BufferAttribute(wall.cliff.ex, 4));
      const m = new THREE.Mesh(
        g,
        d.actx.mat('cliff', { elem: { ...EL.strata, q: [9, 999, 0, 0] }, noShadowReceive: true }),
      );
      m.name = 'valley:edge:footBank';
      addOwn(m, 'none');
    }
    if (rubble.length) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(rubble, 3));
      g.computeVertexNormals();
      const m = new THREE.Mesh(
        g,
        d.actx.mat('desertStone', {
          elem: { kind: 'stones', size: [9, 5], seam: 0.6, hi: 0.4 },
          noShadowReceive: true,
        }),
      );
      m.name = 'valley:edge:footWall';
      addOwn(m, 'none');
    }
    if (bench.length) {
      const m = new THREE.Mesh(
        upTris(bench),
        d.actx.mat('sandPatch', {
          elem: {
            kind: 'pebbles',
            size: [8, 5],
            seam: 0.6,
            density: [0, 0.05],
            patch: 3,
            pebbles: 0.16,
            accent: [0xc07a68, 0x9a5e66, 0x6e4a84],
          },
        }),
      );
      m.name = 'valley:edge:footBench';
      m.userData.noCast = true;
      addOwn(m, 'none');
    }

    // 冲积扇：断口外 7 米一个尖，往平地这边扇开 7～10 米（沙斑）；里面一把碎石，越往扇尖越大
    for (const g of fans) {
      const ax = g.x + g.nx * 7;
      const az = g.z + g.nz * 7;
      let R = 8 + rnd() * 3;
      let poly: V2[] = [];
      for (let tries = 0; tries < 4; tries++, R *= 0.8) {
        poly = [];
        const th0 = Math.atan2(-g.nz, -g.nx);
        for (let k = 0; k <= 10; k++) {
          const th = th0 + (k / 10 - 0.5) * 1.9;
          const rr = R * (0.85 + rnd() * 0.25);
          poly.push([ax + Math.cos(th) * rr, az + Math.sin(th) * rr]);
        }
        if (poly.every(([x, z]) => !inFloor(x, z) || (!nearRoad(x, z, 1) && !nearBldg(x, z, 2) && !inGreen(x, z))))
          break;
        poly = [];
      }
      if (!poly.length) continue;
      const back = Math.atan2(g.nz, g.nx);
      poly.push([ax + Math.cos(back + 0.5) * 3, az + Math.sin(back + 0.5) * 3]);
      poly.push([ax + Math.cos(back - 0.5) * 3, az + Math.sin(back - 0.5) * 3]);
      putF('sandPatch', topGeo(poly, 0.012), 0, 0, 0, 0, 'none');
      const m = 7 + Math.floor(rnd() * 5);
      for (let k = 0; k < m; k++) {
        const t = 0.15 + rnd() * 0.85;
        const th = Math.atan2(-g.nz, -g.nx) + (rnd() - 0.5) * 1.5;
        const x = ax + Math.cos(th) * R * t;
        const z = az + Math.sin(th) * R * t;
        if (inFloor(x, z) && (nearRoad(x, z, 1.5) || nearBldg(x, z, 2))) continue;
        rockE(x, z, 0.18 + (1 - t) * 0.55 * rnd() + 0.1, rnd, rnd() < 0.45);
      }
      if (rnd() < 0.7) {
        const th = Math.atan2(-g.nz, -g.nx) + (rnd() < 0.5 ? -0.8 : 0.8);
        const x = ax + Math.cos(th) * R * 0.75;
        const z = az + Math.sin(th) * R * 0.75;
        if (groundY(x, z) < 0.05 && (!inFloor(x, z) || free(x, z, 1.5))) {
          if (rnd() < 0.5) ocotillo(x, z, 0.95, rnd, groundY(x, z));
          else brittle(x, z, 1.1, rnd, groundY(x, z));
        }
      }
    }
  }

  /**
   * 一簇沙漠植物（5～8 件，簇间留空）：一块大石头或一丛大木焦油灌木领头，旁边两三丛小的、几块碎石，三成带一棵 ocotillo。
   * 植物放在大石头的北边（太阳在北，影子落南边 —— 小植物不进大东西的影子）。y：地面高（坎上的台面给台面高）
   */
  function cluster(x: number, z: number, rnd: () => number, y = 0, nx = 0, nz = -1) {
    const okAt = (px: number, pz: number, r: number) => !inFloor(px, pz) || free(px, pz, r);
    const big = rnd() < 0.5;
    // 一半的簇脚下一片碎石（石头滚下来、风吹掉了沙的那种"沙漠铺面"）：冷灰粉，地面不是一整片橙
    if (rnd() < 0.5) {
      const apron = blobPoly(x, z, 2.6 + rnd() * 1.6, 1.8 + rnd() * 1.2, rnd, 12, 0.25);
      if (apron.every(([px, pz]) => okAt(px, pz, 0.3) && !others(px, pz, 0.3)))
        putF('gravelYard', topGeo(apron, y + 0.01), 0, 0, 0);
    }
    if (big) {
      const r = 0.9 + rnd() * 0.7;
      rockE(x, z, r, rnd, rnd() < 0.3, y, 0.7);
      if (inFloor(x, z)) blockC(x, z, r * 0.85);
    } else creosote(x, z, 1.0 + rnd() * 0.25, rnd, y);
    // 往"北"（台面上 = 往山那边）偏
    const fx = big ? nx : 0;
    const fz = big ? nz : 0;
    const m = 2 + Math.floor(rnd() * 2);
    for (let k = 0; k < m; k++) {
      const a = rnd() * TAU;
      const rr = 1.8 + rnd() * 1.5;
      const px = x + Math.cos(a) * rr + fx * 1.4;
      const pz = z + Math.sin(a) * rr * 0.7 + fz * 1.4;
      if (okAt(px, pz, 1)) creosote(px, pz, 0.6 + rnd() * 0.3, rnd, y);
    }
    const pick = rnd();
    if (pick < 0.3) {
      const px = x + (rnd() - 0.5) * 4 + fx * 2.2;
      const pz = z - 1.4 - rnd() * 1.5 + fz * 1.2;
      if (y < 0.05 && okAt(px, pz, 1.2)) ocotillo(px, pz, 0.9 + rnd() * 0.25, rnd, y);
    } else if (pick < 0.51) {
      const px = x + (rnd() - 0.5) * 4;
      const pz = z - 1.2 - rnd();
      if (y < 0.05 && okAt(px, pz, 1)) brittle(px, pz, 1 + rnd() * 0.3, rnd, y);
    }
    const q = 2 + Math.floor(rnd() * 3);
    for (let k = 0; k < q; k++) {
      const px = x + (rnd() - 0.5) * 5;
      const pz = z + (rnd() - 0.5) * 3.5;
      if (okAt(px, pz, 0.6)) rockE(px, pz, 0.2 + rnd() * 0.3, rnd, rnd() < 0.4, y);
    }
  }

  // ════════════════════════════════════════════════════════════════════
  /**
   * 俱乐部 → 镇子（composition-1 第 7 条）：x 140 车道接缝读成一道门（门槛石条 + 两根毛石门柱 + 斜出去的矮翼墙；俱乐部车道
   * 8 米、镇里 10 米，多出来的两条边用沙压成 12 米的喇叭口）；140…205 两边每 14 米一棵加州蒲葵（棕榈大道）；路北进镇牌
   * （毛石矮墙 + 太阳，不写字）；进镇路口 x 205 两边方花池 + 路灯。酒店地的施工围挡在 hotelSite()。
   */
  function clubToTown() {
    const rnd = d.rng('valley:south:gate');
    const R = 'club';
    // 车道两边到酒店围挡、到路北的住家之间：手摆的，撒点别进来
    d.clear({ x0: 141, x1: 205, z0: -14, z1: 22 });
    // ── 喇叭口 + 门槛 ──
    put(
      'sand',
      topGeo(
        [
          [139.9, -5.25],
          [152, -5.25],
          [139.9, -3.98],
        ],
        0.034,
      ),
      0,
      0,
      0,
      0,
      R,
    );
    put(
      'sand',
      topGeo(
        [
          [139.9, 3.98],
          [152, 5.25],
          [139.9, 5.25],
        ],
        0.034,
      ),
      0,
      0,
      0,
      0,
      R,
    );
    put('desertStone', boxG(0.6, 0.045, 10.6), 140.4, 0, 0, 0, R);
    // ── 门柱、翼墙：朝南的面是暗档（门的暗带）；柱头一颗太阳球 ──
    for (const sz of [-1, 1]) {
      const z = sz * 6.7;
      put('desertStone', boxG(2, 4.4, 2), 141.6, 0, z, 0, R);
      put('cap', boxG(2.35, 0.32, 2.35), 141.6, 4.4, z, 0, R);
      put('sunEnamel', blobG(0.7, 1, 0.92, 1), 141.6, 5.32, z, 0, R);
      blockC(141.6, z, 0.85);
      // 翼墙：从门柱斜着往东、往外收到地里
      const ex = 147.2;
      const ez = sz * 10.2;
      const L = Math.hypot(ex - 141.6, ez - z);
      const th = Math.atan2(ex - 141.6, ez - z);
      const mx = (ex + 141.6) / 2;
      const mz = (ez + z) / 2;
      put('desertStone', boxG(0.7, 1.6, L), mx, 0, mz, th, R);
      put('cap', boxG(0.9, 0.2, L + 0.1), mx, 1.6, mz, th, R);
      blocked({ a: [141.6, z], b: [ex, ez], r: 0.35 });
    }
    // ── 棕榈大道：路两边 148…190 每 14 米一棵（进镇牌、酒店的效果图牌子退到树后面 z −12.7）；树坑一圈压顶 + 碎石 ──
    const palm = (x: number, z: number) => {
      fanPalms.push({ x, z, s: 0.86 + rnd() * 0.14, reg: R, rot: rnd() * TAU });
      blockC(x, z, 0.5);
      put('gravelYard', boxG(1.6, 0.03, 1.6), x, 0, z, 0, R);
      for (const [dx, dz, w, dd] of [
        [0, -0.88, 1.92, 0.16],
        [0, 0.88, 1.92, 0.16],
        [-0.88, 0, 0.16, 1.6],
        [0.88, 0, 0.16, 1.6],
      ])
        put('cap', boxG(w, 0.14, dd), x + dx, 0, z + dz, 0, R);
    };
    for (const x of [148, 162, 176, 190]) palm(x, 7.4 + (rnd() - 0.5) * 0.4);
    for (const x of [148, 162, 176, 190]) palm(x, -7.4 - (rnd() - 0.5) * 0.4);
    // ── 进镇牌（路北，过了门 10 米）：毛石矮墙 + 压顶 + 太阳（半圆 + 一圈光芒，往后仰 0.9 接光：太阳在北边，竖着的牌面是暗档）；两头桶形仙人掌、龙舌兰 ──
    {
      const sx = 152.5;
      const sz = -12.6;
      put('gravelYard', boxG(10, 0.03, 2.8), sx, 0, sz + 0.2, 0, R);
      put('desertStone', boxG(4.8, 1.4, 0.9), sx, 0, sz, 0, R);
      put('cap', boxG(5.1, 0.2, 1.1), sx, 1.4, sz, 0, R);
      const tilt = -0.9;
      const sun = new THREE.CylinderGeometry(1.5, 1.5, 0.2, 18, 1, false, -Math.PI / 2, Math.PI)
        .rotateX(-Math.PI / 2)
        .rotateX(tilt);
      put('sunEnamel', sun, sx, 1.6, sz, 0, R);
      for (let k = 0; k < 7; k++) {
        const a = ((k + 0.5) / 7) * Math.PI;
        const ray = new THREE.BoxGeometry(0.26, 0.8, 0.14)
          .translate(0, 2.0, 0)
          .rotateZ(a - Math.PI / 2)
          .rotateX(tilt);
        put('sunEnamel', ray, sx, 1.6, sz, 0, R);
      }
      blocked({ x0: sx - 2.5, x1: sx + 2.5, z0: sz - 0.6, z1: sz + 0.6 });
      for (const sd of [-1, 1]) {
        barrel(sx + sd * 3.0, sz + 0.1, 1.1);
        barrel(sx + sd * 3.7, sz - 0.6, 0.8);
        agave(sx + sd * 4.2, sz + 0.7, 1, rnd);
      }
    }
    // ── 进镇路口：两边方花池（adobe 矮边 + 碎石 + 观赏棕榈 + 仙人掌）+ 一盏路灯（同 town.ts 的灯：铁杆、灯头朝路） ──
    for (const sd of [-1, 1]) {
      const px = 200.6;
      const pz = sd * 8.9;
      put('desertStone', boxG(2.6, 0.45, 2.6), px, 0, pz, 0, R);
      put('gravelYard', boxG(2.3, 0.02, 2.3), px, 0.45, pz, 0, R);
      ornPalm(px + 0.2, pz + sd * 0.2, 0.82, rnd);
      barrel(px - 0.7, pz - sd * 0.7, 0.85, 0.45);
      agave(px + 0.75, pz - sd * 0.75, 0.75, rnd, 0.45);
      blocked({ x0: px - 1.3, x1: px + 1.3, z0: pz - 1.3, z1: pz + 1.3 });
      lamp(196.4, sd * 6.4, -sd, 4.8);
    }
    // ── 路南（车道和工地围挡之间那条沙）：三簇，让开酒店地块的小路 ──
    for (const [x, z] of [
      [144.5, 14.5],
      [181, 13.5],
      [192, 15],
    ] as V2[])
      cluster(x, z, rnd);
    // ── 门外大道的路灯：每两棵棕榈中间一盏（两边），光圈小一点（r 3）——夜里门外一屏有两三个光圈 ──
    for (const x of [155, 169, 183])
      for (const sd of [-1, 1]) {
        // 路南 169 正好是酒店地块小路的路口：往西让 3.5 米
        const lx = sd > 0 && x === 169 ? 165.5 : x;
        lamp(lx, sd * 6.6, -sd, 3);
      }
    // ── 路北（进镇牌、效果图牌子后面到住家、山脚）：成簇的沙漠植物，簇间 8～12 米；撒点不进来 ──
    d.clear({ x0: 141, x1: 188, z0: -62, z1: -14 });
    const crnd = d.rng('valley:south:gateNorth');
    for (let gx = 142; gx < 202; gx += 10)
      for (let gz = -60; gz < -15; gz += 10) {
        const x = gx + crnd() * 7;
        const z = gz + crnd() * 7;
        if (!inFloor(x, z) || inClubBox(x, z)) continue;
        // 牌子前后、住家院子、路边让开
        if (x > 146 && x < 159 && z > -19) continue;
        if (x > 176 && x < 190 && z > -19) continue;
        if (nearBldg(x, z, 6) || nearRoad(x, z, 4.5)) continue;
        cluster(x, z, crnd);
      }
  }
  /** 一盏路灯（同 town.ts 的灯：铁杆 + 臂 + 灯头，灯头朝路）；toRoad = 灯头朝 +z（1）还是 −z（−1）；r = 夜里的光圈半径 */
  function lamp(lx: number, lz: number, toRoad: number, r: number) {
    const R = reg(lx, lz);
    (d.putThin ?? d.put)(R, 'ironwork', boxG(0.18, 4.4, 0.18).translate(lx, 0, lz));
    (d.putThin ?? d.put)(R, 'ironwork', boxG(0.12, 0.12, 0.8).translate(lx, 4.25, lz + toRoad * 0.35));
    // 杆、臂走 townWrap（小件，绕杆脚缩 TOWN_K）；灯头自己挂在 root 上，按同样的比例摆
    const K = TOWN_K;
    lampHeads.push(prep(boxG(0.42 * K, 0.3 * K, 0.42 * K).translate(lx, 3.98 * K, lz + toRoad * 0.7 * K)));
    lampPools.push([lx, lz + toRoad * 0.7 * K, r]);
    blockC(lx, lz, 0.2);
  }

  // ════════════════════════════════════════════════════════════════════
  /**
   * 干河沟（composition-1 第 10 条"沿住宅后墙一条干沟"）：第二排房子的后院墙外，从南山脚冲出来顺着山脚往西流。沟底钙质土（比沙亮、
   * 冷）+ 一溜卵石；北岸一道 0.4 米的冲刷坎（朝南的陡面落暗档 = 一条细暗带）；两岸烟树（棕榈泉的干沟里长的就是它）、
   * 偶尔一棵假紫荆。整片手摆，撒点不进来
   */
  function dryWash() {
    const rnd = d.rng('valley:south:wash');
    d.clear({ x0: 250, x1: 336, z0: 124, z1: 176 });
    const n = WASH.length;
    const r = reg(WASH[Math.floor(n / 2)][0], WASH[Math.floor(n / 2)][1]);
    const bed: number[] = [];
    const berm: number[] = [];
    const nrm = (i: number): V2 => {
      const a = WASH[Math.max(0, i - 1)];
      const b = WASH[Math.min(n - 1, i + 1)];
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      // 朝北的那一侧
      let nx = -(b[1] - a[1]) / L;
      let nz = (b[0] - a[0]) / L;
      if (nz > 0) {
        nx = -nx;
        nz = -nz;
      }
      return [nx, nz];
    };
    const hw = (i: number) => 1.7 - 0.5 * (i / (n - 1)) + 0.25 * Math.sin(i * 0.9);
    for (let i = 0; i + 1 < n; i++) {
      const [ax, az] = WASH[i];
      const [bx, bz] = WASH[i + 1];
      const [anx, anz] = nrm(i);
      const [bnx, bnz] = nrm(i + 1);
      const ha = hw(i);
      const hb = hw(i + 1);
      const y = 0.012;
      bed.push(ax + anx * ha, y, az + anz * ha, ax - anx * ha, y, az - anz * ha, bx + bnx * hb, y, bz + bnz * hb);
      bed.push(ax - anx * ha, y, az - anz * ha, bx - bnx * hb, y, bz - bnz * hb, bx + bnx * hb, y, bz + bnz * hb);
      // 北岸的冲刷坎：沟边 → 0.3 米外坎顶（0.4 米高，朝南的陡面）→ 1.6 米外回到地面
      if (!inFloor(ax, az) || !inFloor(bx, bz)) continue;
      const P = (x: number, z: number, nx: number, nz: number, o: number, yy: number) => [x + nx * o, yy, z + nz * o];
      const a0 = P(ax, az, anx, anz, ha, 0);
      const a1 = P(ax, az, anx, anz, ha + 0.3, 0.6);
      const a2 = P(ax, az, anx, anz, ha + 1.7, 0);
      const b0 = P(bx, bz, bnx, bnz, hb, 0);
      const b1 = P(bx, bz, bnx, bnz, hb + 0.3, 0.6);
      const b2 = P(bx, bz, bnx, bnz, hb + 1.7, 0);
      berm.push(...a0, ...a1, ...b0, ...a1, ...b1, ...b0, ...a1, ...a2, ...b1, ...a2, ...b2, ...b1);
    }
    putF('path', upTris(bed), 0, 0, 0, 0, r);
    {
      // 坎：两个坡各自的面法线（陡面朝南落暗档）
      for (let i = 0; i < berm.length; i += 9) {
        const ax = berm[i + 3] - berm[i];
        const ay = berm[i + 4] - berm[i + 1];
        const az = berm[i + 5] - berm[i + 2];
        const bx = berm[i + 6] - berm[i];
        const by = berm[i + 7] - berm[i + 1];
        const bz = berm[i + 8] - berm[i + 2];
        if (ay * bz - az * by === 0 && ax === 0) continue;
        // 法线 y 分量 < 0 → 翻
        if (az * bx - ax * bz < 0) {
          for (let k = 0; k < 3; k++) {
            const t = berm[i + 3 + k];
            berm[i + 3 + k] = berm[i + 6 + k];
            berm[i + 6 + k] = t;
          }
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(berm, 3));
      g.computeVertexNormals();
      d.put(r, 'sand', g);
    }
    // 沟底一溜卵石
    for (let i = 0; i < n; i++) {
      if (rnd() < 0.35) continue;
      const [x, z] = WASH[i];
      const [nx, nz] = nrm(i);
      const o = (rnd() - 0.5) * hw(i) * 1.4;
      rockE(x + nx * o + (rnd() - 0.5) * 1.5, z + nz * o, 0.14 + rnd() * rnd() * 0.32, rnd, rnd() < 0.6, 0);
    }
    // 两岸的烟树、假紫荆：每 14～22 米一棵，南北岸轮着
    let side = rnd() < 0.5 ? 1 : -1;
    for (let i = 3 + Math.floor(rnd() * 4); i < n - 2; i += 7 + Math.floor(rnd() * 4)) {
      const [x0, z0] = WASH[i];
      const [nx, nz] = nrm(i);
      const o = side > 0 ? hw(i) + 2.8 : -(hw(i) + 1.6);
      const x = x0 + nx * o;
      const z = z0 + nz * o;
      side = -side;
      if (!free(x, z, 2.5)) continue;
      if (rnd() < 0.75)
        smokeItems[Math.floor(rnd() * smokeItems.length)].push({
          x,
          z,
          s: 0.85 + rnd() * 0.3,
          reg: reg(x, z),
          rot: rnd() * TAU,
        });
      else
        paloItems[Math.floor(rnd() * paloItems.length)].push({
          x,
          z,
          s: 0.8 + rnd() * 0.2,
          reg: reg(x, z),
          rot: rnd() * TAU,
        });
      blockC(x, z, 0.35);
      // 树脚一两块石头、一丛灌木（北边，不进树影）
      rockE(x + 1.2, z - 0.6, 0.3 + rnd() * 0.3, rnd, rnd() < 0.5);
      if (free(x - 0.8, z - 2.2, 1)) creosote(x - 0.8, z - 2.2, 0.8, rnd);
    }
  }

  // ════════════════════════════════════════════════════════════════════
  /**
   * 镇外的沙漠（composition-1 第 10 条）：住宅圈外到山脚那一圈（平地边往里 3.5～36 米、离房子 14 米以上），
   * 一簇一簇（cluster：木焦油灌木、大石头、ocotillo），簇间 8～15 米；簇和簇之间留真空。公园、学校归 campus，不进去
   */
  function outerDesert() {
    const rnd = d.rng('valley:south:outer');
    const C = 11;
    // 两遍：第二遍错开半格、只补住宅东那一大片（第 3 轮：25 号点真沙 0.45 → ≤ 0.40）
    for (const pass of [0, 1])
      for (let gx = 140 + pass * 5.5; gx < 680; gx += C)
        for (let gz = -215 + pass * 5.5; gz < 180; gz += C) {
          const x = gx + rnd() * C * 0.75;
          const z = gz + rnd() * C * 0.75;
          if (rnd() > 0.8) continue;
          if (pass && !(x > 595 && x < 672 && z > -150 && z < -30)) continue;
          if (!inFloor(x, z) || inClubBox(x, z) || inHotel(x, z, 3)) continue;
          const fd = floorDist(x, z);
          if (fd > -3.5) continue;
          // 第 3 轮（lead）：住宅北（山脚路两排房子之间、后面）、住宅东（东环西边那一大片）也成簇；离房子 11 米（院子）
          const north = x > 275 && x < 620 && z > -195 && z < -118;
          const east = x > 595 && x < 672 && z > -150 && z < -30;
          const band = fd >= -36;
          if (!band && !north && !east) continue;
          if (nearRoad(x, z, east ? 3.5 : 4.5) || nearBldg(x, z, east ? 9 : band ? 14 : 11) || inGreen(x, z)) continue;
          const rg = regionAt(x, z)?.id;
          // 公园、学校归 campus；公园南边贴山脚 22 米那一条（山脚南）算镇外的沙漠
          if (rg === 'school' || (rg === 'park' && fd < -22)) continue;
          if (x < 212 && z > -16 && z < 24) continue;
          if (washD(x, z) < 6) continue;
          cluster(x, z, rnd);
        }
  }

  // ════════════════════════════════════════════════════════════════════
  /** edge 区的收尾：石头（带石块元素）按块合并、木焦油灌木实例化、路口的灯（夜里灯头自发光 + 灯光圈） */
  function edgeFinish() {
    for (const [k, list] of edgeRocks) {
      const [r, key] = k.split('|') as [string, PalKey];
      const g = mergeGeometries(list);
      for (const x of list) x.dispose();
      if (!g) continue;
      const m = new THREE.Mesh(g, d.actx.mat(key, ROCK_OPTS));
      m.name = `valley:edge:${key}`;
      addOwn(m, r);
    }
    creoKinds.forEach((g, v) => {
      const byReg = new Map<string, InstItem[]>();
      for (const it of creoItems[v]) {
        if (others(it.x, it.z, 0.9 * (it.s / TOWN_K))) continue;
        const k = `${it.reg}|${Math.floor(it.x / 30)}|${Math.floor(it.z / 30)}`;
        const l = byReg.get(k) ?? [];
        l.push(it);
        byReg.set(k, l);
      }
      const M = new THREE.Matrix4();
      const Q = new THREE.Quaternion();
      const up = new THREE.Vector3(0, 1, 0);
      for (const [k, list] of byReg) {
        const r = k.split('|')[0];
        const im = new THREE.InstancedMesh(g, d.actx.mat('olive', CREO_OPTS), list.length);
        list.forEach((it, i) => {
          Q.setFromAxisAngle(up, it.rot ?? 0);
          const jx = 0.8 + ((0.4 * (((it.x * 7.13 + it.z * 3.7) % 1) + 1)) % 1);
          const jz = 0.8 + ((0.4 * (((it.x * 2.31 - it.z * 5.9) % 1) + 1)) % 1);
          M.compose(new THREE.Vector3(it.x, it.y ?? 0, it.z), Q, new THREE.Vector3(it.s * jx, it.s, it.s * jz));
          im.setMatrixAt(i, M);
        });
        im.computeBoundingSphere();
        im.name = 'valley:edge:creosote';
        addOwn(im, r);
      }
    });
    if (lampHeads.length) {
      const g = mergeGeometries(lampHeads);
      const day = d.mat('signPaint') as THREE.MeshToonMaterial;
      const glow = day.clone();
      glow.onBeforeCompile = day.onBeforeCompile;
      glow.customProgramCacheKey = day.customProgramCacheKey;
      glow.userData = { ...day.userData };
      glow.emissive = new THREE.Color(0x6a5a30);
      const m = new THREE.Mesh(g, day);
      m.name = 'valley:edge:lampHead';
      m.receiveShadow = true;
      d.root.add(m);
      let on = false;
      const lights = new THREE.Group();
      lights.name = 'valley:edge:lights';
      lights.userData.night = {
        setOn(v: boolean) {
          on = v;
          m.material = v ? glow : day;
        },
      };
      for (const [x, z, r] of lampPools) {
        const o = new THREE.Object3D();
        const pool: [number, number, number, number] = [x, z, r, 4.6];
        const none: [number, number, number, number] = [x, z, 0, 0];
        o.userData.night = { pool: () => (on ? pool : none) };
        lights.add(o);
      }
      d.root.add(lights);
    }
  }

  // ════════════════════════════════════════════════════════════════════
  /**
   * 住宅的院子：2026-11-21 起整栋房子连院子在 assets/houses.ts 的 placeHouses（build.ts 在细节模块之后直接调，
   * 不过 townWrap —— 这里拿到的 d 包了 townWrap，院子的东西会按房子 / 小件各缩各的，和房子对不上）。这里不画了。
   */
  function yards() {}

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
    // 第二轮：原来铺的是步道的钙质土（一整片 90 × 80 米的浅色碎石纹，发白、发噪），换成略偏玫瑰的台地沙。
    putHotel('sandHigh', topGeo(pad, 0.014), 0, 0, 0);
    // 第 3 轮：一整块台地沙读成空沙 → 大门里一块碎石堆料场（gravelYard），中间一块打好的混凝土底板（以后的酒店楼座），
    // 底板 0.3 米厚（朝南的侧面落暗档）；土台只剩边上一圈
    {
      const yard: V2[] = [
        [142, 23],
        [176, 22.5],
        [179, 40],
        [168, 56],
        [150, 58],
        [142, 48],
      ];
      putHotel('gravelYard', topGeo(yard, 0.02), 0, 0, 0);
      // 挖掘机在 (176, 58)，底板放它东边
      const sx0 = 184;
      const sx1 = 226;
      const sz0 = 44;
      const sz1 = 70;
      putHotel('concrete', boxG(sx1 - sx0, 0.3, sz1 - sz0), (sx0 + sx1) / 2, 0, (sz0 + sz1) / 2);
      // 底板上一格格露出来的钢筋（只画几道 0.12 米宽的锈色条，不画网）
      for (let x = sx0 + 6; x < sx1 - 2; x += 8)
        putHotel('rust', boxG(0.14, 0.04, sz1 - sz0 - 4), x, 0.3, (sz0 + sz1) / 2, 0, false);
    }
    // 施工围挡（2026-11-21，composition-1 第 7 条）：地块北沿（对着车道）、东沿一圈 2 米高的木板墙，顶上一条橙色警示带，
    // 北沿 x 146…157 是工地大门（酒店地块那条小路进来），两扇铁门敞着。跟着"酒店盖好"的开关一起藏
    {
      const zN = 19.6;
      const xE = 234.6;
      const panel = (x: number, z: number, along: 'x' | 'z', w: number) => {
        const g = along === 'x' ? boxG(w, 2, 0.1) : boxG(0.1, 2, w);
        putHotel('woodWeathered', g, x, 0, z);
        const t = along === 'x' ? boxG(w, 0.24, 0.14) : boxG(0.14, 0.24, w);
        putHotel('toolOrange', t, x, 1.88, z);
      };
      for (let x = 141.4; x < xE - 1; x += 2.4) {
        if (x > 144.5 && x < 157.5) continue;
        panel(x + 1.2, zN, 'x', 2.38);
      }
      for (let z = zN; z < 99; z += 2.4) panel(xE, z + 1.2, 'z', 2.38);
      // 大门：两根门柱 + 两扇推开贴着围挡的铁栅门（一整片暗带，不画栅条；不伸进小路）
      for (const [x, sd] of [
        [146, -1],
        [156.6, 1],
      ] as [number, number][]) {
        putHotel('ironwork', boxG(0.24, 2.4, 0.24), x, 0, zN);
        putHotel('ironwork', boxG(4.2, 1.7, 0.08), x + sd * 2.2, 0.25, zN - 0.3);
      }
    }
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
    // 2026-11-21：x 205 → 178（小镇压紧以后 x 207 起是棕榈巷）
    {
      const x = 183;
      const z = -12.8;
      for (const dx of [-2.3, 2.3]) putHotel('wood', boxG(0.28, 1.5, 0.28), x + dx, 0, z);
      putHotel('signBoard', boxG(6, 2.4, 0.22), x, 1.2, z, 0, false);
      putHotel('stucco', boxG(3.2, 1.0, 0.08), x - 1, 1.75, z + 0.14, 0, false);
      putHotel('roofTile', boxG(3.6, 0.25, 0.08), x - 1, 2.75, z + 0.14, 0, false);
      putHotel('water', boxG(2, 0.25, 0.08), x - 1, 1.45, z + 0.15, 0, false);
      putHotel('signPaint', boxG(1.4, 0.25, 0.06), x + 1.9, 3.0, z + 0.14, 0, false);
      putHotel('flowerYellow', boxG(1.6, 0.4, 0.06), x + 1.9, 1.9, z + 0.14, 0, false);
    }
  }
}
