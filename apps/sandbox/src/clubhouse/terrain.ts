// 地形：地面（clubsite/ground.ts，铺到画外）+ 墙里的压实沙地 + 北围墙、西围墙（土坯、压顶、壁柱）
// + **会所的壳**（buildHouse：墙按 layout.ts 的 WALLS 切开门窗洞、每间房的地面、四坡红瓦屋顶；外观 / 里面两套，setInside 切换）
// + 邻居：餐车院子的地面（clubfood 的 FOOD_COURT、ARCADE_YARD 碎花岗岩、SPINE 石板）、长廊和西步道、泳池（照 clubmap2，clubpool 在重做）、
//   青训西场（场面 + 白线 + 网 + 围网）。家具、钟楼、门窗的装饰都是资产（占位），这里只管墙、地、屋顶。
//
// 外观 / 里面（三层）：每个网格的 userData.houseViews = 在哪几种看法里显示（view.ts：'out' 外观、'b1' / '1f' / '2f' 看某一层的剖面）。
// - 外观：屋顶、二层、朝镜头的（沿 x 的）墙整高；钟楼是占位（slots-ext.ts 的 bell-tower，mode out）。
// - 看某一层：上面的楼层、屋顶藏起来；这一层朝镜头的墙和所有隔墙切到 1 米（顶上 0.1 米 wallCut 深色）；沿 z 的外墙和北外墙留 frame
//   （一层、二层 2.8 米，负一层的挡土墙到地面）；下面的楼层按外观画（看二层时一层的外墙整高、拱廊的瓦）；
//   钟楼的墙（tower: true）外观被钟楼占位盖住，只在剖面里出现。看负一层时脚印挖成坑（切开的土 soilCut）。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { buildFences, type FenceRun } from '../clubdesk/assets/fence-screen';
import { WALL } from '../clubdesk/layout';
import { groundGeo } from '../clubsite/ground';
import { buildMountains } from '../clubsite/mountains';
import { box, quad, topGeo } from '../clubsite/render/geo';
import type { Elem, ToonOpts } from '../clubsite/render/toon';
import { COURT_FENCES, type Court, type FenceLine, fencePieces } from '../clubsite/world';
import type { AssetCtx } from './ctx';
import {
  ARCADE_YARD,
  alongX,
  CLIP,
  COURTS,
  FLOOR_Y,
  type Flight,
  type Floor,
  type FloorKey,
  FOOD_COURT,
  flightsOn,
  frameOf,
  GLASS_S,
  GRADE,
  GROUNDS,
  H,
  isCut,
  levelOf,
  MASS,
  NEWEL,
  NORTH_WALK,
  PATHS,
  PIT_LOOP,
  POOL,
  POOL_DECK,
  type Rect,
  ROOFS,
  ROOMS,
  SKYLIGHTS,
  SOIL,
  SPINE,
  STOREY,
  type V2,
  WALL_T,
  WALLS,
  type Wall,
  wallPieces,
} from './layout';
import { EL, type Pal } from './palette';
import { applyView, type HouseMode, type HouseView, viewOf, viewsFor } from './view';

type Key = keyof Pal;

/**
 * 会所壳的材质 → 元素（stage 2 core，2026-11-11）：Bucket.add 没给 extra 时按材质名取这里的（墙、切墙顶、土、屋顶）。
 * 墙面一律屏幕空间（墙是 box，没有墙的 uv）。
 */
const SHELL: Partial<Record<Key, ToonOpts>> = {
  stucco: { elem: EL.stucco },
  plaster: { elem: EL.plaster },
  castWall: { elem: EL.castWall },
  wallCut: { elem: EL.wallCut },
  soilCut: { elem: { ...EL.soilCut, pebbles: 0.05, accent: [0xc8a080, 0x8a6a6a, 0x5c4a62] } },
  // 筒瓦：每 0.4 米一列（9 纹素），列与列之间一纹素缝、缝后一纹素亮条（断续）；每列自己一个深浅。
  // 0.27 米一列（6 纹素）+ 亮条 = 外观细变化 0.24（太密，像瓦楞板）；0.5 米、无亮条 = 0.12
  roofTile: { elem: { kind: 'planks', space: 'local', seam: 1, hi: 1, p: [1, 0, 0, 0.4], q: [1, 0, 0, 0] } },
};

/** 每种地面（layout.ts 的 FloorKey）用哪个材质、什么元素；木地板是墙空间的 strata（地面要写 uv） */
const FLOORS: Record<FloorKey, { key: Key; elem: Elem; uv?: boolean }> = {
  floorOak: { key: 'floorOak', elem: EL.floorOak, uv: true },
  wood: { key: 'floorWood', elem: EL.floorWood, uv: true },
  tile: { key: 'floorTile', elem: EL.floorTile },
  floorCool: { key: 'floorCool', elem: EL.floorCool },
  concrete: { key: 'floorConcrete', elem: EL.floorConcrete },
  rubber: { key: 'rubber', elem: EL.rubber },
  turf: { key: 'turf', elem: EL.turf },
};
/** 木地板一条最深几米：strata 一条最多数 24 行板（板 4～6 行 × 0.064 米 ≈ 6 米），深的房间切成几条，每条的北沿是一道板缝 */
const STRIP = 5;

/** 水平矩形面 + 墙空间 uv（x 米、离 z0 的米数）：给 strata 木地板用 */
function uvQuad(r: Rect, y: number, z0: number): THREE.BufferGeometry {
  const g = quad(r, y);
  const p = g.getAttribute('position');
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    uv[i * 2] = p.getX(i);
    uv[i * 2 + 1] = p.getZ(i) - z0;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}
/** 矩形按 z 切成 ≤ STRIP 米的几条 */
function strips(r: Rect): Rect[] {
  const n = Math.max(1, Math.ceil((r.z1 - r.z0) / STRIP - 1e-6));
  const d = (r.z1 - r.z0) / n;
  return Array.from({ length: n }, (_, i) => ({ ...r, z0: r.z0 + i * d, z1: i === n - 1 ? r.z1 : r.z0 + (i + 1) * d }));
}

/**
 * 一段梯的踏面元素（treads）：p = (顶端 x, z, 朝下方向 / 每级长)，q = (级数, 顶上那级的上一级高, 每级高)。
 * 踏面分几段陶砖条（8～16 纹素），前沿磨亮条越往下越多；朝镜头的立面背光 = 暗档 → 比踏面深。
 */
function treadsOf(s: Flight): Elem {
  const lo = Math.min(s.from, s.to);
  const hi = Math.max(s.from, s.to);
  const n = Math.max(1, Math.round((hi - lo) / 0.2));
  const run = (s.z1 - s.z0) / n;
  const h = (hi - lo) / n;
  const cx = (s.x0 + s.x1) / 2;
  const down = s.from > s.to; // z0 那头高 → 往 +z 下
  return {
    kind: 'treads',
    size: [8, 16],
    p: [cx, down ? s.z0 : s.z1, 0, (down ? 1 : -1) / run],
    q: [n, hi + h, h, 0],
  };
}

export type { HouseMode, HouseView } from './view';

/** 按材质收几何体，最后每种材质合并成一个网格（同 clubfood/terrain.ts 的 Bucket）；mode 给整桶打外观 / 里面的标 */
class Bucket {
  private m = new Map<string, { key: Key; extra?: ToonOpts; geos: THREE.BufferGeometry[]; cast: boolean }>();
  constructor(
    private views?: HouseView[],
    private castAll = true,
  ) {}
  add(key: Key, g: THREE.BufferGeometry, opts: { extra?: ToonOpts; cast?: boolean; tag?: string; uv?: boolean } = {}) {
    const id = `${key}|${opts.tag ?? ''}`;
    let e = this.m.get(id);
    if (!e) {
      e = { key, extra: opts.extra ?? SHELL[key], geos: [], cast: (opts.cast ?? true) && this.castAll };
      this.m.set(id, e);
    }
    const n = g.index ? g.toNonIndexed() : g;
    // uv 只留给墙空间元素的地面（木地板的 strata：uv = (x, 离这一条北沿的米数)），同一个桶里要么都有要么都没有
    for (const a of Object.keys(n.attributes))
      if (a !== 'position' && a !== 'normal' && !(opts.uv && a === 'uv')) n.deleteAttribute(a);
    if (!n.getAttribute('normal')) n.computeVertexNormals();
    e.geos.push(n);
  }
  build(ctx: AssetCtx, root: THREE.Object3D, prefix: string) {
    for (const [id, e] of this.m) {
      const mesh = new THREE.Mesh(mergeGeometries(e.geos), ctx.mat(e.key, e.extra));
      mesh.name = `${prefix}:${this.views?.join('+') ?? 'all'}:${id}`;
      mesh.castShadow = e.cast;
      mesh.receiveShadow = true;
      if (this.views) mesh.userData.houseViews = this.views;
      root.add(mesh);
    }
  }
}

const FLAT = { cast: false };
/** 白线宽：2 设计纹素（0.18 米），同 clubdesk */
const LW = 0.18;

/** 矩形和裁剪框求交；空 → null */
function clip(r: Rect, c: Rect = CLIP): Rect | null {
  const o = { x0: Math.max(r.x0, c.x0), x1: Math.min(r.x1, c.x1), z0: Math.max(r.z0, c.z0), z1: Math.min(r.z1, c.z1) };
  return o.x1 - o.x0 > 0.05 && o.z1 - o.z0 > 0.05 ? o : null;
}

/** 四坡屋顶（照 clubmap2/build.ts 的 hipRoof）：底在 y，高 h，四边出檐 over；屋脊沿长边 */
function hipRoof(r: Rect, y: number, h: number, over = 0.5): THREE.BufferGeometry {
  const x0 = r.x0 - over;
  const x1 = r.x1 + over;
  const z0 = r.z0 - over;
  const z1 = r.z1 + over;
  const w = x1 - x0;
  const d = z1 - z0;
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  const P = (x: number, yy: number, z: number) => new THREE.Vector3(x, yy, z);
  const a = P(x0, y, z0);
  const b = P(x1, y, z0);
  const c = P(x1, y, z1);
  const dd = P(x0, y, z1);
  const [r0, r1] =
    w >= d
      ? [P(x0 + d / 2, y + h, cz), P(x1 - d / 2, y + h, cz)]
      : [P(cx, y + h, z0 + w / 2), P(cx, y + h, z1 - w / 2)];
  const tris: THREE.Vector3[][] =
    w >= d
      ? [
          [a, r0, r1],
          [a, r1, b],
          [dd, c, r1],
          [dd, r1, r0],
          [a, dd, r0],
          [b, r1, c],
        ]
      : [
          [a, r0, b],
          [dd, c, r1],
          [a, dd, r1],
          [a, r1, r0],
          [b, r0, r1],
          [b, r1, c],
        ];
  const pos: number[] = [];
  for (const t of tris) {
    const n = new THREE.Vector3().subVectors(t[1], t[0]).cross(new THREE.Vector3().subVectors(t[2], t[0]));
    const tt = n.y < 0 ? [t[0], t[2], t[1]] : t;
    for (const v of tt) pos.push(v.x, v.y, v.z);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

/** 一段墙（沿墙坐标 a0…a1、y0…y1）的盒子 */
function pieceGeo(w: Wall, a0: number, a1: number, y0: number, y1: number, tExtra = 0): THREE.BufferGeometry {
  const t = w.t + tExtra;
  const c = alongX(w) ? w.a[1] : w.a[0];
  const len = a1 - a0;
  const mid = (a0 + a1) / 2;
  return alongX(w) ? box(len, y1 - y0, t, mid, y0, c) : box(t, y1 - y0, len, c, y0, mid);
}

/** 墙的起止（沿墙坐标） */
function span(w: Wall): [number, number] {
  return alongX(w)
    ? [Math.min(w.a[0], w.b[0]), Math.max(w.a[0], w.b[0])]
    : [Math.min(w.a[1], w.b[1]), Math.max(w.a[1], w.b[1])];
}

/** 矩形减矩形（轴对齐）：剩下的最多 4 块 */
function subtract(r: Rect, h: Rect): Rect[] {
  if (h.x1 <= r.x0 || h.x0 >= r.x1 || h.z1 <= r.z0 || h.z0 >= r.z1) return [r];
  const out: Rect[] = [];
  if (h.z0 > r.z0) out.push({ ...r, z1: h.z0 });
  if (h.z1 < r.z1) out.push({ ...r, z0: h.z1 });
  const z0 = Math.max(r.z0, h.z0);
  const z1 = Math.min(r.z1, h.z1);
  if (h.x0 > r.x0) out.push({ x0: r.x0, x1: h.x0, z0, z1 });
  if (h.x1 < r.x1) out.push({ x0: h.x1, x1: r.x1, z0, z1 });
  return out.filter((q) => q.x1 - q.x0 > 0.01 && q.z1 - q.z0 > 0.01);
}
const subtractAll = (rs: Rect[], hs: Rect[]) => hs.reduce((acc, h) => acc.flatMap((r) => subtract(r, h)), rs);

/** 一段梯的台阶（剖面里看第 f 层时画到 clipY 为止，切口顶上一条 wallCut）：每级 0.2 米，实心到这一段最低处以下 0.3 */
function addFlight(B: Bucket, cap: Bucket, s: Flight, clipY: number) {
  const lo = Math.min(s.from, s.to);
  const hi = Math.max(s.from, s.to);
  const base = lo - 0.3;
  const w = s.x1 - s.x0;
  const cx = (s.x0 + s.x1) / 2;
  if (hi - lo < 1e-3) {
    // 平台：一块板（陶砖地，同室内）
    if (base >= clipY) return;
    const top = Math.min(hi, clipY);
    B.add('floorTile', box(w, top - base, s.z1 - s.z0, cx, base, (s.z0 + s.z1) / 2), {
      tag: 'landing',
      extra: { elem: { ...EL.floorTile, seed: 11 } },
    });
    if (top < hi) cap.add('wallCut', box(w, STOREY.cutCap, s.z1 - s.z0, cx, top, (s.z0 + s.z1) / 2));
    return;
  }
  const n = Math.max(1, Math.round((hi - lo) / 0.2));
  const run = (s.z1 - s.z0) / n;
  const tread = { tag: `stair-${s.id}`, extra: { elem: treadsOf(s) } };
  for (let i = 0; i < n; i++) {
    const za = s.z0 + i * run;
    const stepTop = Math.max(s.from + ((s.to - s.from) * i) / n, s.from + ((s.to - s.from) * (i + 1)) / n);
    if (base >= clipY) continue;
    const top = Math.min(stepTop, clipY);
    B.add('floorTile', box(w, top - base, run, cx, base, za + run / 2), tread);
    if (top < stepTop) cap.add('wallCut', box(w, STOREY.cutCap, run, cx, top, za + run / 2));
  }
}

/**
 * 会所的壳：三层的墙（外观 / 剖面两套）、每间房的地面、屋顶、露台、拱廊的瓦、楼梯；看负一层时的坑（切开的土）。
 * 只用这个场景调色板里的材质；坐标全是世界坐标（clubwalk 直接 add 进大场景）。每个网格带 userData.houseViews（view.ts），
 * setView(组, 看法) / setInside(组, on, 层) 切换。
 */
export function buildHouse(ctx: AssetCtx): THREE.Group {
  const root = new THREE.Group();
  root.name = 'clubhouse';
  const buckets = new Map<string, Bucket>();
  /** 某几种看法的桶（同一组看法共用一个桶 → 每种材质一个网格） */
  const B = (views: HouseView[], cast = true): Bucket => {
    const k = `${views.join(',')}|${cast}`;
    let b = buckets.get(k);
    if (!b) {
      b = new Bucket(views, cast);
      buckets.set(k, b);
    }
    return b;
  };
  const V = (level: Floor, mode?: HouseMode, tower = false) =>
    viewsFor(level, mode).filter((v) => !(tower && v === 'out'));
  const { cut, cutCap } = STOREY;

  // ── 地面：每间房一块（木地板 / 陶砖 / 冷色瓷砖 / 水泥 / 橡胶垫），铺到脚印边，墙压在上面；楼梯往下走的那一段开洞 ──
  for (const r of ROOMS) {
    if (r.hole) continue;
    const f = FLOORS[r.floor];
    const open = r.id.startsWith('terrace');
    const elem: Elem = { ...(open ? EL.terrace : f.elem), seed: r.r.x0 };
    const y = FLOOR_Y[r.level];
    const b = B(V(r.level), r.level !== -1);
    const holes = flightsOn(r.level).filter((s) => Math.min(s.from, s.to) < y - 0.01);
    for (const q of subtractAll([r.r], holes)) {
      if (f.uv)
        for (const k of strips(q))
          b.add(f.key, uvQuad(k, y + 0.03, k.z0), { ...FLAT, extra: { elem }, tag: r.id, uv: true });
      else b.add(f.key, quad(q, y + 0.03), { ...FLAT, extra: { elem }, tag: r.id });
    }
    // 功能草道：两条白的跑道线（沿长边，离两边 0.8 米，1 设计纹素宽）
    if (r.floor === 'turf')
      for (const x of [r.r.x0 + 0.8, r.r.x1 - 0.8])
        b.add('line', quad({ x0: x - 0.045, x1: x + 0.045, z0: r.r.z0 + 0.3, z1: r.r.z1 - 0.3 }, y + 0.036), FLAT);
  }

  // ── 墙 ──
  for (const w of WALLS) {
    const L = levelOf(w);
    const y0 = FLOOR_Y[L];
    const [s0, s1] = span(w);
    const cast = L !== -1;
    const mat: Key = w.mat ?? (w.t < WALL_T.ext ? 'plaster' : L === -1 ? 'castWall' : 'stucco');
    const add = (b: Bucket, key: Key, a0: number, a1: number, ya: number, yb: number, tExtra = 0) =>
      b.add(key, pieceGeo(w, a0, a1, y0 + ya, y0 + yb, tExtra));
    if (w.upper) {
      for (const v of [V(L, 'out', w.tower)]) if (v.length) add(B(v), mat, s0, s1, w.upper.y0, w.h);
      continue;
    }
    if (w.h <= cut + 1e-3) {
      // 女儿墙、栏板：1 米，外观和剖面一样
      for (const p of wallPieces(w, w.h)) add(B(V(L, undefined, w.tower), cast), mat, p.a0, p.a1, p.y0, p.y1);
      continue;
    }
    if (isCut(w)) {
      // 朝镜头的墙、隔墙：外观整高（门窗洞）；剖面切到 1 米，顶上一条深色
      const vo = V(L, 'out', w.tower);
      if (vo.length) for (const p of wallPieces(w, w.h)) add(B(vo, cast), mat, p.a0, p.a1, p.y0, p.y1);
      const vi = V(L, 'in', w.tower);
      for (const p of wallPieces(w, cut)) {
        const top = p.y1 >= cut - 1e-3;
        add(B(vi, cast), mat, p.a0, p.a1, p.y0, top ? cut - cutCap : p.y1);
        if (top) add(B(vi, false), 'wallCut', p.a0, p.a1, cut - cutCap, cut, 0.02);
      }
      continue;
    }
    // 沿 z 的外墙、北外墙（娃娃屋的三面框）：frame 以下外观和剖面都在；外观再加上面那截（到檐高，门洞照开）；
    // 剖面在 frame 顶上压一条深色（负一层的框 = 整高到地面，不压）。框不留整层：北墙整高时朝镜头那面是一大条阴影里的灰紫
    const fr = Math.min(frameOf(w), w.h);
    for (const p of wallPieces(w, fr)) add(B(V(L, undefined, w.tower), cast), mat, p.a0, p.a1, p.y0, p.y1);
    const vo = V(L, 'out', w.tower);
    if (vo.length && w.h > fr + 1e-3)
      for (const p of wallPieces(w, w.h))
        if (p.y1 > fr + 1e-3) add(B(vo, cast), mat, p.a0, p.a1, Math.max(p.y0, fr), p.y1);
    if (w.h > fr + 1e-3)
      for (const p of wallPieces(w, fr))
        if (p.y1 >= fr - 1e-3) add(B(V(L, 'in', w.tower), false), 'wallCut', p.a0, p.a1, fr, fr + cutCap, 0.02);
  }

  // ── 屋顶（外观）：二层前后两片、东翼，红瓦四坡顶；二层檐下一圈檐口；南拱廊的单坡瓦 ──
  for (const r of ROOFS) B(V(r.level, 'out')).add('roofTile', hipRoof(r, r.eave, r.roof, r.over));
  for (const r of [MASS.upperBack, MASS.upperFront]) {
    const t = 0.25;
    for (const z of [r.z0 - 0.1, r.z1 + 0.1])
      B(V(2, 'out')).add('stucco', box(r.x1 - r.x0 + 0.5, t, 0.3, (r.x0 + r.x1) / 2, r.eave - t, z));
  }
  for (const f of [-1, 1, 2] as Floor[]) {
    const view = FV[f];
    const sb = B([view], f !== -1);
    const cb = B([view], false);
    for (const s of flightsOn(f)) addFlight(sb, cb, s, FLOOR_Y[f] + 2.05);
    // 两跑之间的栏板：从这层最低那段梯的底到这层地面 + 1 米（同切墙）
    const lo = Math.min(...flightsOn(f).map((q) => Math.min(q.from, q.to))) - 0.3;
    const hi = FLOOR_Y[f] + cut;
    sb.add(
      'plaster',
      box(NEWEL.x1 - NEWEL.x0, hi - lo, NEWEL.z1 - NEWEL.z0, (NEWEL.x0 + NEWEL.x1) / 2, lo, (NEWEL.z0 + NEWEL.z1) / 2),
    );
  }

  // ── 地上的地（北巷、西巷、拱廊前的沙地：下面是 B1）：外观、一层、二层画，看负一层时藏起来（地面在 PIT_LOOP 挖了洞）──
  {
    const g = B(['out', '1f', '2f'], false);
    for (const r of GRADE)
      g.add('sandHigh', quad(r, H.ground + 0.004), { ...FLAT, extra: { elem: { ...EL.sand, seed: 7 } } });
  }
  // ── 看负一层：B1 比会所大，整个挖成坑；B1 南沿到池畔那 5 米填着土（顶在切墙的高度 −3），土的三面断面到地面；
  //    坑沿靠围墙的两边（西、北）压一条水泥；天窗、玻璃砖下面的地上一块亮的（天光，B1 不接投影所以要画出来）──
  {
    const soil = B(['b1'], false);
    const yTop = FLOOR_Y[-1] + cut;
    for (const q of SOIL) {
      soil.add('soilCut', quad(q, yTop), FLAT);
      const h = -yTop;
      const T = 0.12;
      soil.add('soilCut', box(T, h, q.z1 - q.z0, q.x0 + T / 2, yTop, (q.z0 + q.z1) / 2));
      soil.add('soilCut', box(T, h, q.z1 - q.z0, q.x1 - T / 2, yTop, (q.z0 + q.z1) / 2));
      soil.add('soilCut', box(q.x1 - q.x0, h, T, (q.x0 + q.x1) / 2, yTop, q.z1 - T / 2));
    }
    const [nw, ne] = [PIT_LOOP[0], PIT_LOOP[1]];
    const sw = PIT_LOOP[PIT_LOOP.length - 1];
    soil.add('castWall', quad({ x0: nw[0] - 0.35, x1: ne[0], z0: nw[1] - 0.35, z1: nw[1] }, 0.02), FLAT);
    soil.add('castWall', quad({ x0: nw[0] - 0.35, x1: nw[0], z0: nw[1], z1: sw[1] }, 0.02), FLAT);
    for (const r of [...SKYLIGHTS, GLASS_S])
      soil.add('sandHigh', quad(r, FLOOR_Y[-1] + 0.04), {
        ...FLAT,
        extra: { elem: { ...EL.sand, seed: 3 } },
        tag: 'sun',
      });
  }

  for (const b of buckets.values()) b.build(ctx, root, 'house');
  ctx.mats.prepare(root);
  return root;
}

const FV: Record<Floor, HouseView> = { [-1]: 'b1', 1: '1f', 2: '2f' };

/** 外观 / 里面某一层：按 userData.houseViews 切 visible。clubwalk 拿会所的组调这个 */
export function setView(root: THREE.Object3D, view: HouseView) {
  applyView(root as never, view);
}
/** 外观 ↔ 里面（旧接口，floor 不给 = 一层） */
export function setInside(root: THREE.Object3D, on: boolean, floor: Floor = 1) {
  setView(root, viewOf(on, floor));
}

export interface Terrain {
  root: THREE.Group;
  house: THREE.Group;
  groundAt(x: number, z: number): number;
}

export function buildTerrain(ctx: AssetCtx): Terrain {
  const root = new THREE.Group();
  root.name = 'terrain';
  const B = new Bucket();
  const groundAt = (_x: number, _z: number) => H.ground;
  const add = (g: THREE.BufferGeometry, m: THREE.Material, name: string) => {
    const mesh = new THREE.Mesh(g, m);
    mesh.name = name;
    mesh.receiveShadow = true;
    mesh.castShadow = false;
    root.add(mesh);
    return mesh;
  };

  // ── 地面：墙外的沙漠沙铺到画外（围墙里挖掉，另铺压实的浅沙）──
  const grounds: V2[] = [
    [GROUNDS.x0, GROUNDS.z0],
    [GROUNDS.x1, GROUNDS.z0],
    [GROUNDS.x1, GROUNDS.z1],
    [GROUNDS.x0, GROUNDS.z1],
  ];
  add(groundGeo([grounds], H.ground), ctx.mat('sand', { elem: EL.sand }), 'top:ground');
  // 会所 + B1 的范围挖掉（会所自己铺每间房的地、坑上面的地 GRADE；看负一层时露出坑）
  add(
    topGeo(grounds, H.ground + 0.004, [PIT_LOOP]),
    ctx.mat('sandHigh', { elem: { ...EL.sand, seed: 7 } }),
    'top:grounds',
  );

  // ── 围墙：北墙（z −43）+ 西墙（x −64）；壁柱同 clubmap2（每段 floor(长/12) 等分）──
  {
    const pier = (x: number, z: number) => {
      B.add('adobe', box(WALL.pier, WALL.pierH, WALL.pier, x, 0, z));
      B.add('cap', box(WALL.pier + 0.2, WALL.pierCap, WALL.pier + 0.2, x, WALL.pierH, z));
    };
    const { x0: a, x1: b, z0: zN, z1: zS } = GROUNDS;
    const e = CLIP.x1 + 2;
    B.add('adobe', box(e - a, WALL.h, WALL.t, (a + e) / 2, 0, zN));
    B.add('cap', box(e - a + 0.2, WALL.cap, WALL.t + 0.2, (a + e) / 2, WALL.h, zN));
    const n = Math.floor((b - a) / 12);
    for (let i = 1; i < n; i++) {
      const px = a + ((b - a) * i) / n;
      if (px < e - 0.6) pier(px, zN);
    }
    pier(a, zN);
    const s1 = CLIP.z1 + 0.6;
    B.add('adobe', box(WALL.t, WALL.h, s1 - zN, a, 0, (zN + s1) / 2));
    B.add('cap', box(WALL.t + 0.2, WALL.cap, s1 - zN, a, WALL.h, (zN + s1) / 2));
    const m = Math.floor((zS - zN) / 12);
    for (let i = 1; i < m; i++) {
      const pz = zN + ((zS - zN) * i) / m;
      if (pz < s1 - 0.6) pier(a, pz);
    }
  }

  // ── 邻居：餐车院子（clubfood）的地面：碎花岗岩、球员通道石板（东头只到 CLIP）──
  const granite = ctx.mat('granite', { elem: EL.granite });
  for (const [i, r] of [FOOD_COURT, ARCADE_YARD].entries()) {
    const k = clip(r);
    if (k) add(quad(k, H.ground + 0.01), granite, `top:food-${i}`);
  }
  {
    const k = clip(SPINE);
    if (k) add(quad(k, H.ground + 0.016), ctx.mat('flagstone', { elem: { ...EL.flagstone, seed: 5 } }), 'top:spine');
  }
  // clubpool 建议的石板小路（拱廊转角 → 泳池北门）：压在 B1 上面，看负一层时藏起来
  add(
    quad(NORTH_WALK, H.ground + 0.016),
    ctx.mat('flagstone', { elem: { ...EL.flagstone, seed: 9 } }),
    'top:north-walk',
  ).userData.houseViews = ['out', '1f', '2f'];
  // 长廊、西步道（碎花岗岩）
  let i = 0;
  for (const p of PATHS) {
    const r = clip(p);
    if (r) add(quad(r, H.ground + 0.012), granite, `path:${i++}`);
  }

  // ── 泳池（邻居：照 clubmap2，clubpool 在重做）：池畔石板、水、池沿、躺椅、三间帐篷 ──
  {
    B.add('flagstone', quad(POOL_DECK, 0.014), { ...FLAT, extra: { elem: EL.flagstone } });
    B.add('water', quad(POOL, 0.05), FLAT);
    const { x0, x1, z0, z1 } = POOL;
    const RIM = 0.6;
    B.add('cap', box(x1 - x0 + 2 * RIM, 0.25, RIM, (x0 + x1) / 2, 0, z0 - RIM / 2));
    B.add('cap', box(x1 - x0 + 2 * RIM, 0.25, RIM, (x0 + x1) / 2, 0, z1 + RIM / 2));
    B.add('cap', box(RIM, 0.25, z1 - z0, x0 - RIM / 2, 0, (z0 + z1) / 2));
    B.add('cap', box(RIM, 0.25, z1 - z0, x1 + RIM / 2, 0, (z0 + z1) / 2));
    for (let x = x0 + 1; x <= x1 - 1; x += 2.6) B.add('clothWhite', box(0.8, 0.35, 1.9, x, 0, z1 + 2.4));
    for (const x of [-57.5, -51, -44.5]) {
      B.add('canvas', box(3.2, 2.6, 2.6, x, 0, 0.6));
      B.add('canvasStripe', hipRoof({ x0: x - 1.6, x1: x + 1.6, z0: -0.7, z1: 1.9 }, 2.6, 0.9, 0.2));
    }
  }

  // ── 球场（邻居）：青训西场（横屏右下角）+ 围网（clubdesk 的 fence-screen）──
  const fenceRuns: FenceRun[] = [];
  for (const c of COURTS) {
    const cell: Rect = { x0: c.x - c.hx, x1: c.x + c.hx, z0: c.z - c.hz, z1: c.z + c.hz };
    if (c.kind === 'stadium' || !clip(cell)) continue;
    paintCourt(B, c);
  }
  for (const f of COURT_FENCES) fenceLine(fenceRuns, f);

  B.build(ctx, root, 'site');
  root.add(buildFences(ctx as never, fenceRuns));
  ctx.mats.prepare(root);
  for (const m of root.children as THREE.Mesh[]) if (m.name.startsWith('top:')) m.castShadow = false;
  root.add(buildMountains((c, o) => ctx.mats.toon(c, o)));

  const house = buildHouse(ctx);
  root.add(house);
  return { root, house, groundAt };
}

/** 一片场（裁到 CLIP）：场边色 + 场内色 + 白线 + 网（同 clubfood/terrain.ts 的 paintCourt） */
function paintCourt(B: Bucket, c: Court) {
  const L = 23.77;
  const DW = 10.97;
  const SW = 8.23;
  const SVC = 6.4;
  const cell: Rect = { x0: c.x - c.hx, x1: c.x + c.hx, z0: c.z - c.hz, z1: c.z + c.hz };
  const q = (r: Rect, y: number, key: Key) => {
    const k = clip(r);
    if (k) B.add(key, quad(k, y), FLAT);
  };
  if (c.kind === 'clay') q(cell, 0.018, 'clay');
  else {
    q(cell, 0.018, 'surround');
    q(
      { x0: c.x - L / 2 - 1.4, x1: c.x + L / 2 + 1.4, z0: c.z - DW / 2 - 0.84, z1: c.z + DW / 2 + 0.84 },
      0.022,
      'court',
    );
  }
  const line = (x0: number, x1: number, z0: number, z1: number) => q({ x0, x1, z0, z1 }, 0.03, 'line');
  for (const s of [-1, 1]) {
    line(c.x + (s * L) / 2 - LW / 2, c.x + (s * L) / 2 + LW / 2, c.z - DW / 2, c.z + DW / 2);
    line(c.x - L / 2, c.x + L / 2, c.z + (s * DW) / 2 - LW / 2, c.z + (s * DW) / 2 + LW / 2);
    line(c.x - L / 2, c.x + L / 2, c.z + (s * SW) / 2 - LW / 2, c.z + (s * SW) / 2 + LW / 2);
    line(c.x + s * SVC - LW / 2, c.x + s * SVC + LW / 2, c.z - SW / 2, c.z + SW / 2);
  }
  line(c.x - SVC, c.x + SVC, c.z - LW / 2, c.z + LW / 2);
  if (c.x < CLIP.x0 || c.x > CLIP.x1 || c.z > CLIP.z1) return;
  const len = DW + 1.8;
  B.add('net', box(0.12, 0.92, len, c.x, 0, c.z), { extra: { noShadowReceive: true }, cast: true });
  B.add('netTape', box(0.14, 0.15, len, c.x, 0.92, c.z), FLAT);
}

/** 一道直的围网（地图的 FenceLine）：按门切开、裁到 CLIP，收成直线段交给 buildFences（clubdesk 的 fence-screen） */
function fenceLine(runs: FenceRun[], f: FenceLine) {
  const ax = Math.abs(f.z1 - f.z0) < 1e-6;
  if (ax ? f.z0 < CLIP.z0 || f.z0 > CLIP.z1 : f.x0 < CLIP.x0 || f.x0 > CLIP.x1) return;
  const [a0, a1] = ax ? [f.x0, f.x1] : [f.z0, f.z1];
  for (const [p, q] of fencePieces(a0, a1, f.doors)) {
    if (ax) {
      const k = clip({ x0: p, x1: q, z0: f.z0 - 0.1, z1: f.z0 + 0.1 });
      if (k) runs.push({ x0: k.x0, z0: f.z0, x1: k.x1, z1: f.z0, h: f.h });
    } else {
      const k = clip({ x0: f.x0 - 0.1, x1: f.x0 + 0.1, z0: p, z1: q });
      if (k) runs.push({ x0: f.x0, z0: k.z0, x1: f.x0, z1: k.z1, h: f.h });
    }
  }
}
