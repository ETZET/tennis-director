// valley 细节：小镇的空当和街上的生活（2026-11-21 小镇压紧 · 美术精细化 plaza 区）。**世界坐标**（米，压紧以后、缩完的）。
// - G1 报社西的发报院子（发报台 + 送报车 + 报纸捆 + 员工车位 + 朝主街的矮花砖墙、花池）
// - G4 横街对面的小广场（陶砖 + 水磨石圆心 + 大棕榈 + 两条长椅 + 公交站棚）
// - 银行 drive-up 东边的员工车位 + 花池岛、餐馆后院（垃圾箱、牛奶箱、员工长椅、送货车）
// - G2 市政厅东边的公共停车场 + 后街尽头去校队球场西北门的小门（门柱、自行车架、长椅、大树、队旗）
// - 体育店前场铺到楼两侧、店门口道具（球拍展示架、球拍形立地招牌、自行车架、花盆）
// - 街道家具成套（报箱、消防栓、邮筒、电话、菜单牌、垃圾桶、自行车架、街角大花盆）、主街北侧平行停车、画面上的静态路人（烘成静态网格）
// 资产在 assets/plaza.ts（批 PZ），别的批的现成资产只读复用。
//
// ── 为什么烘成几大块（Bake）──
// 小镇的细节都过 townWrap（townwrap.ts）：贴着三家店 FRAMES 框里的东西会被"按楼的相似变换"挪向楼的门口（报社框 219…266 × −57…−13 里
// 放在 x 225 的小件会被挪到 x 240），所以 G1、银行东、餐馆后院这些框里的空当用 d.asset 一件一件放是放不到的。这里把每一片的东西
// （资产按 TOWN_K 缩好、人不缩）按材质烘成一大块世界坐标的网格，整块当"长条"交给 townWrap（只把 y × TOWN_K → 组先 y × 1/TOWN_K 抵掉），
// 位置就是写的位置；绘制也省（一片一材质一次）。挡路的形状照 townWrap 的规矩反推（框里那条缩不到的带子放不了就跳过，记数）。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { build as fanPalm } from '../../clubsite/nature/fan-palm';
import { kid, player } from '../../clubsite/people';
import type { Shape } from '../../clubsite/play';
import type { BaseCtx } from '../../clubsite/render/ctx';
import { box } from '../../clubsite/render/geo';
import type { Elem, ToonOpts } from '../../clubsite/render/toon';
import { makeAsset } from '../assets';
import type { DetailCtx } from '../build';
import { bldgFrames } from '../layout';
import { EL, PAL, TOWN_EL } from '../palette';
import type { PalKey } from '../reuse';
import { FRAMES, keepScale, LONG_M, TOWN_K } from '../townscale';
import { siteState } from './sites/kit';

const K = TOWN_K;
type V2 = readonly [number, number];
interface Box2 {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

// ═══════════════ townWrap 的规矩（照 townwrap.ts 的 modeOf / frameFor 抄一份，只读用来反推）═══════════════
const PAD = 2;
interface WF {
  px: number;
  pz: number;
  k: number;
  maxW: number;
  maxD: number;
  has(x: number, z: number): boolean;
}
let WFS: WF[] | null = null;
function frames(): WF[] {
  if (WFS) return WFS;
  WFS = FRAMES.map((f) => ({
    px: f.px,
    pz: f.pz,
    k: K,
    maxW: f.zone.x1 - f.zone.x0 + 1,
    maxD: f.zone.z1 - f.zone.z0 + 1,
    has: (x: number, z: number) => x >= f.zone.x0 && x <= f.zone.x1 && z >= f.zone.z0 && z <= f.zone.z1,
  }));
  for (const b of bldgFrames()) {
    const hw = b.hw + PAD;
    const hd = b.hd + PAD;
    const ex = Math.abs(b.c) * hw + Math.abs(b.s) * hd;
    const ez = Math.abs(b.s) * hw + Math.abs(b.c) * hd;
    WFS.push({
      px: b.px,
      pz: b.pz,
      k: b.k,
      maxW: 2 * ex + 1,
      maxD: 2 * ez + 1,
      has: (x, z) => {
        const dx = x - b.cx;
        const dz = z - b.cz;
        return Math.abs(dx * b.c - dz * b.s) <= hw && Math.abs(dx * b.s + dz * b.c) <= hd;
      },
    });
  }
  return WFS;
}
type Mode = { kind: 'frame'; f: WF } | { kind: 'small' } | { kind: 'long' } | { kind: 'keep' };
/** 一块包围盒（xz 中心、宽深、高）townWrap 会怎么处理（townwrap.ts 的 modeOf） */
function modeOf(cx: number, cz: number, w: number, d: number, h: number): Mode {
  if (keepScale(cx, cz)) return { kind: 'keep' };
  const f = frames().find((q) => q.has(cx, cz) && w <= q.maxW && d <= q.maxD);
  if (f) return { kind: 'frame', f };
  if (h < 0.15) return { kind: 'keep' };
  if (w < LONG_M && d < LONG_M) return { kind: 'small' };
  return { kind: 'long' };
}

// ═══════════════ 烘焙：一片一块（按材质 + 投不投影合并）═══════════════
class Bake {
  private by = new Map<string, { m: THREE.Material; cast: boolean; gs: THREE.BufferGeometry[] }>();
  private nights: [THREE.Material, THREE.Material][] = [];
  /** 这些材质一律不投影：杆、架子、栏杆（截面 < 0.2 米，傍晚投出来是一条条麻点细线，material 第 12 条） */
  readonly thin = new Set<THREE.Material>();
  readonly bb = new THREE.Box3();
  constructor(readonly name: string) {}
  /** 放好位置的物体（世界、最终大小）：每个网格乘世界矩阵，按（材质, 投影）攒 */
  obj(o: THREE.Object3D): void {
    o.updateMatrixWorld(true);
    const shown = (x: THREE.Object3D | null): boolean => !x || (x.visible && shown(x.parent));
    o.traverse((c) => {
      const pairs = c.userData.nightPairs as [THREE.Material, THREE.Material][] | undefined;
      if (pairs) for (const p of pairs) if (!this.nights.some(([a]) => a === p[0])) this.nights.push(p);
      const m = c as THREE.Mesh;
      if (!m.isMesh || Array.isArray(m.material) || !shown(m)) return;
      const g = flatAttrs(m.geometry.clone().applyMatrix4(m.matrixWorld));
      const cast = m.castShadow && !m.userData.noCast;
      this.geo(g, m.material, cast);
    });
  }
  geo(g: THREE.BufferGeometry, m: THREE.Material, cast: boolean): void {
    const ng = flatAttrs(g);
    ng.computeBoundingBox();
    this.bb.union(ng.boundingBox as THREE.Box3);
    // 按 14 米一格分块（每块自己的包围球 → 镜头外的格子不画；一屏只画看得见的几格里的材质）
    const bb = ng.boundingBox as THREE.Box3;
    const cell = `${Math.floor((bb.min.x + bb.max.x) / 2 / CELL)}|${Math.floor((bb.min.z + bb.max.z) / 2 / CELL)}`;
    // 一个材质一个网格（投不投影按"有一块投就投"：分开就是两次绘制）
    if (this.thin.has(m)) cast = false;
    const k = `${cell}|${m.uuid}`;
    const e = this.by.get(k) ?? { m, cast, gs: [] };
    e.cast ||= cast;
    e.gs.push(ng);
    this.by.set(k, e);
  }
  get empty(): boolean {
    return this.by.size === 0;
  }
  /** 交给 build：组在原点，几何是世界坐标；按 townWrap 的规矩先抵掉它要做的缩放 */
  flush(d: DetailCtx): THREE.Group | null {
    if (!this.by.size) return null;
    const out = new THREE.Group();
    if (d.raw) {
      // 不缩的那一层：几何就是世界里的样子，不用再跟 townWrap 斗
      for (const { m, cast, gs } of this.by.values()) {
        const mesh = new THREE.Mesh(mergeGeometries(gs) as THREE.BufferGeometry, m);
        mesh.name = `valley:plaza:${this.name}`;
        mesh.castShadow = cast;
        mesh.receiveShadow = true;
        if (!cast) mesh.userData.noCast = true;
        out.add(mesh);
      }
      out.name = `valley:plaza:${this.name}`;
      this.night(out);
      out.userData.mode = 'raw';
      d.raw.asset(out, d.regionOf(280, -30));
      return out;
    }
    out.name = `valley:plaza:${this.name}`;
    for (const { m, cast, gs } of this.by.values()) {
      const mesh = new THREE.Mesh(mergeGeometries(gs) as THREE.BufferGeometry, m);
      mesh.name = `valley:plaza:${this.name}:${(m as THREE.Material).name || 'm'}`;
      mesh.castShadow = cast;
      mesh.receiveShadow = true;
      if (!cast) mesh.userData.noCast = true;
      out.add(mesh);
    }
    const b = this.bb;
    const cx = (b.min.x + b.max.x) / 2;
    const cz = (b.min.z + b.max.z) / 2;
    let mode = modeOf(cx, cz, b.max.x - b.min.x, b.max.z - b.min.z, b.max.y - b.min.y);
    if (mode.kind === 'frame' || mode.kind === 'small') {
      // 包围盒落进了某栋楼的框：往外撑一个看不见的点（退化三角形），让它成"长条"
      const far = cx + 60;
      const tri = new THREE.BufferGeometry();
      tri.setAttribute('position', new THREE.Float32BufferAttribute([far, 0.5, cz, far, 0.5, cz, far, 0.5, cz], 3));
      tri.setAttribute('normal', new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0], 3));
      const first = out.children[0] as THREE.Mesh;
      first.geometry = mergeGeometries([first.geometry, tri]) as THREE.BufferGeometry;
      b.expandByPoint(new THREE.Vector3(far, 0.5, cz));
      mode = modeOf((b.min.x + b.max.x) / 2, (b.min.z + b.max.z) / 2, b.max.x - b.min.x, b.max.z - b.min.z, 9);
    }
    if (mode.kind === 'long') out.scale.y = 1 / K;
    this.night(out);
    out.userData.mode = mode.kind;
    d.asset(out, d.regionOf(cx, cz));
    return out;
  }
  private night(out: THREE.Group): void {
    if (this.nights.length) {
      const pairs = this.nights;
      out.userData.night = {
        setOn(on: boolean) {
          out.traverse((o) => {
            const m = o as THREE.Mesh;
            if (!m.isMesh) return;
            for (const [day, night] of pairs)
              if (m.material === day || m.material === night) m.material = on ? night : day;
          });
        },
      };
    }
  }
}
/** 分块（米）：每格自己的包围球 → 镜头外的格子不画（lead 第 3 轮：28 米） */
const CELL = 28;

/**
 * 画面上的人：按格合成一个网格、一个材质（顶点色 × 白底的三档 ramp，同 town.ts 的车）。不投影：脚下贴一小团影（傍晚也只是脚下一团，
 * 不拉长条 —— 人的长影是 18.1 点强边缘的大户）。
 */
const FOOT = 0x5a4878;
class PeopleBake {
  private cells = new Map<string, THREE.BufferGeometry[]>();
  tris = 0;
  constructor(private litOf: (m: THREE.Material) => number) {}
  private push(g: THREE.BufferGeometry, col: number) {
    const o = g.index ? g.toNonIndexed() : g;
    for (const k of Object.keys(o.attributes)) if (k !== 'position' && k !== 'normal') o.deleteAttribute(k);
    if (!o.attributes.normal) o.computeVertexNormals();
    const c = new THREE.Color(col);
    const n = o.attributes.position.count;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) arr.set([c.r, c.g, c.b], i * 3);
    o.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    o.computeBoundingBox();
    const bb = o.boundingBox as THREE.Box3;
    const key = `${Math.floor((bb.min.x + bb.max.x) / 2 / CELL)}|${Math.floor((bb.min.z + bb.max.z) / 2 / CELL)}`;
    this.cells.set(key, [...(this.cells.get(key) ?? []), o]);
    this.tris += n / 3;
  }
  obj(o: THREE.Object3D, x: number, z: number): void {
    o.updateMatrixWorld(true);
    const shown = (q: THREE.Object3D | null): boolean => !q || (q.visible && shown(q.parent));
    o.traverse((c) => {
      const m = c as THREE.Mesh;
      if (!m.isMesh || Array.isArray(m.material) || !shown(m)) return;
      this.push(m.geometry.clone().applyMatrix4(m.matrixWorld), this.litOf(m.material));
    });
    // 脚下一团影（扁的 10 边形，贴地）
    this.push(
      new THREE.CircleGeometry(0.42, 10)
        .scale(1, 0.62, 1)
        .rotateX(-Math.PI / 2)
        .translate(x, 0.075, z + 0.05),
      FOOT,
    );
  }
  flush(d: DetailCtx, mat: THREE.Material): void {
    if (!this.cells.size) return;
    const out = new THREE.Group();
    out.name = 'valley:plaza:people';
    for (const gs of this.cells.values()) {
      const mesh = new THREE.Mesh(mergeGeometries(gs) as THREE.BufferGeometry, mat);
      mesh.name = 'valley:plaza:people';
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      mesh.userData.noCast = true;
      out.add(mesh);
    }
    if (d.raw) d.raw.asset(out, d.regionOf(280, -30));
    else d.asset(out);
  }
}
function flatAttrs(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const o = g.index ? g.toNonIndexed() : g;
  for (const k of Object.keys(o.attributes)) if (k !== 'position' && k !== 'normal') o.deleteAttribute(k);
  if (!o.attributes.normal) o.computeVertexNormals();
  return o;
}

/** 平面多边形（世界 xz，任意绕向）→ 朝上的几何，高 y */
function polyGeo(pts: readonly V2[], y: number): THREE.BufferGeometry {
  const sh = new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, -z)));
  const g = new THREE.ShapeGeometry(sh).rotateX(-Math.PI / 2).translate(0, y, 0);
  const n = g.attributes.normal as THREE.BufferAttribute;
  for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0);
  return g;
}

/** 平铺层：车道 0.03、人行道 0.02（town.ts 的 Y）；这里的铺面压在人行道上一层，上面的漆、油渍再一层 */
const YP = { pave: 0.05, paint: 0.064, stain: 0.058, plaza: 0.072 } as const;

export function detailPlaza(d: DetailCtx): void {
  const st = siteState(d);
  const A0 = d.actx;
  // 材质收拢：一屏的绘制 = 2 × 材质数（描边的法线 pass 再画一遍）。资产里同一个键的各种"道具明暗"（PROP、SIGN_FACE、ROUND、LIT……）
  // 在这么小的东西上看不出差别，统一成一份；带元素的只留元素和 lightUp；手挑 ramp、自发光的原样
  const PROP_C: ToonOpts = { lightUp: 0.45, bands: [-0.3, 0.4], noShadowReceive: true };
  const usedKeys = new Map<string, number>();
  /** 材质 → 亮档颜色（路人烘成顶点色用） */
  const LIT = new Map<THREE.Material, number>();
  const litFrom = (key: PalKey, extra?: ToonOpts) => {
    const r = extra?.ramp?.[0] ?? (PAL as unknown as Record<string, { ramp: readonly number[] }>)[key]?.ramp[0];
    return typeof r === 'number' ? r : new THREE.Color(r ?? 0x999999).getHex();
  };
  const tagMat = (m: THREE.Material, key: PalKey, extra?: ToonOpts) => {
    if (!LIT.has(m)) LIT.set(m, litFrom(key, extra));
    return m;
  };
  /** 这么小的东西上分不出来的颜色并成一个 */
  const ALIAS: Partial<Record<string, PalKey>> = {
    canvas: 'clothWhite',
    stucco: 'clothWhite',
    jug: 'silverBlue',
    carRed: 'clothRed',
    hwNavy: 'clothBlue',
    ball: 'flowerYellow',
    schoolGold: 'flowerYellow',
    campusConcrete: 'concrete',
    tiltup: 'concrete',
    woodWeathered: 'wood',
    windscreenOld: 'clothTeal',
    signBoard: 'clothBlue',
  };
  const cmat = ((key0: PalKey, extra?: ToonOpts) => {
    const special = !!extra && (!!extra.ramp || extra.emissive !== undefined || extra.side !== undefined);
    const key = special ? key0 : (ALIAS[key0] ?? key0);
    const el = !special && extra?.elem && !ALIAS[key0] ? extra.elem : undefined;
    const tag = `${key}${special ? '~s' : el ? '~el' : ''}`;
    usedKeys.set(tag, (usedKeys.get(tag) ?? 0) + 1);
    if (special) return tagMat(A0.mat(key, extra), key, extra);
    if (el)
      return tagMat(
        A0.mat(
          key,
          extra?.lightUp
            ? { elem: el, lightUp: extra.lightUp, ...(extra.bands ? { bands: extra.bands } : {}) }
            : { elem: el },
        ),
        key,
      );
    return tagMat(A0.mat(key, PROP_C), key);
  }) as typeof A0.mat;
  const A = { ...A0, mat: cmat };
  const rnd = d.rng('valley:plaza');
  let blocksSkipped = 0;

  // ── 地面材质（同 build.ts 的铺地：valley 的表 + 元素）──
  const ground = (key: PalKey) => {
    const el = (TOWN_EL as Partial<Record<string, Elem>>)[key] ?? (EL as Partial<Record<string, Elem>>)[key];
    return A0.mat(key, el ? { elem: el } : undefined);
  };

  // ── 挡路：按 townWrap 的规矩反推（要的是世界里的形状）──
  const shapeBox = (s: Shape): Box2 => {
    if ('poly' in s) {
      const xs = s.poly.map((p) => p[0]);
      const zs = s.poly.map((p) => p[1]);
      return { x0: Math.min(...xs), x1: Math.max(...xs), z0: Math.min(...zs), z1: Math.max(...zs) };
    }
    if ('a' in s)
      return {
        x0: Math.min(s.a[0], s.b[0]) - s.r,
        x1: Math.max(s.a[0], s.b[0]) + s.r,
        z0: Math.min(s.a[1], s.b[1]) - s.r,
        z1: Math.max(s.a[1], s.b[1]) + s.r,
      };
    if ('r' in s) return { x0: s.x - s.r, x1: s.x + s.r, z0: s.z - s.r, z1: s.z + s.r };
    return s;
  };
  const mapShape = (s: Shape, fx: (x: number, z: number) => [number, number], kr: number): Shape => {
    if ('poly' in s) return { ...s, poly: s.poly.map(([x, z]) => fx(x, z)) };
    if ('a' in s) return { ...s, a: fx(s.a[0], s.a[1]), b: fx(s.b[0], s.b[1]), r: s.r * kr };
    if ('r' in s) {
      const [x, z] = fx(s.x, s.z);
      return { ...s, x, z, r: s.r * kr };
    }
    const [x0, z0] = fx(s.x0, s.z0);
    const [x1, z1] = fx(s.x1, s.z1);
    return { x0: Math.min(x0, x1), x1: Math.max(x0, x1), z0: Math.min(z0, z1), z1: Math.max(z0, z1) };
  };
  /** townWrap 对挡路形状做的事（townwrap.ts 的 mapShape） */
  const fwd = (s: Shape): Shape => {
    const b = shapeBox(s);
    const cx = (b.x0 + b.x1) / 2;
    const cz = (b.z0 + b.z1) / 2;
    const m = modeOf(cx, cz, b.x1 - b.x0, b.z1 - b.z0, 1);
    if (m.kind === 'frame')
      return mapShape(s, (x, z) => [m.f.px + (x - m.f.px) * m.f.k, m.f.pz + (z - m.f.pz) * m.f.k], m.f.k);
    if (m.kind === 'small') return mapShape(s, (x, z) => [cx + (x - cx) * K, cz + (z - cz) * K], K);
    return s;
  };
  const same = (a: Shape, b: Shape) => {
    const p = shapeBox(a);
    const q = shapeBox(b);
    return Math.abs(p.x0 - q.x0) + Math.abs(p.x1 - q.x1) + Math.abs(p.z0 - q.z0) + Math.abs(p.z1 - q.z1) < 0.05;
  };
  const block = (want: Shape) => {
    // 挡路形状是世界坐标、照写的样子：走不缩的那一层（d.raw）；没有 raw（不过 townWrap）就照 townWrap 的规矩反推
    if (d.raw) {
      d.raw.block(want);
      return;
    }
    const b = shapeBox(want);
    const cx = (b.x0 + b.x1) / 2;
    const cz = (b.z0 + b.z1) / 2;
    const cands: Shape[] = [want, mapShape(want, (x, z) => [cx + (x - cx) / K, cz + (z - cz) / K], 1 / K)];
    for (const f of frames())
      cands.push(mapShape(want, (x, z) => [f.px + (x - f.px) / f.k, f.pz + (z - f.pz) / f.k], 1 / f.k));
    const ok = cands.find((c) => same(fwd(c), want));
    if (ok) d.block(ok);
    else blocksSkipped++;
  };
  const blockRect = (x: number, z: number, w: number, dd: number, rot = 0) => {
    const c = Math.cos(rot);
    const s = Math.sin(rot);
    const poly = [
      [-w / 2, -dd / 2],
      [w / 2, -dd / 2],
      [w / 2, dd / 2],
      [-w / 2, dd / 2],
    ].map(([a, b]) => [x + a * c + b * s, z - a * s + b * c] as const);
    block({ poly });
  };
  /** 撒点别进来（build.ts 的灌木、大道棕榈）+ town.ts 的街边家具躲开。townWrap 会把框里放得下的矩形挪走：撑大到框装不下 */
  const claim = (r: Box2, furniture = true) => {
    if (furniture) st.claims.push(r);
    const cx = (r.x0 + r.x1) / 2;
    const cz = (r.z0 + r.z1) / 2;
    let w = r.x1 - r.x0;
    const dd = r.z1 - r.z0;
    while (modeOf(cx, cz, w, dd, 1).kind === 'frame') w += 4;
    d.clear({ x0: cx - w / 2, x1: cx + w / 2, z0: r.z0, z1: r.z1 });
  };
  const pool = (x: number, z: number, r?: number, h?: number) => st.pools.push({ x, z, reg: d.regionOf(x, z), r, h });

  // ── 片：西（G1、体育店、报社门口、主街西段）、中（G4、横街口、银行、市政厅前庭）、东（银行东、餐馆、G2、后街尽头）、远（五金门口的推车人）──
  // 一块就好：三块各自的包围盒都在镜头里的时候，同一个材质要画三次（实测 250 次绘制 → 一块 ~130）
  const ALL = new Bake('all');
  const PEOPLE = new PeopleBake((m) => LIT.get(m) ?? (m as THREE.MeshToonMaterial).color?.getHex?.() ?? 0x999999);
  /** 骨骼人的 ctx：材质原样，只记下亮档颜色 */
  const tagCtx = { ...A0, mat: ((k: PalKey, e?: ToonOpts) => tagMat(A0.mat(k, e), k, e)) as typeof A0.mat };
  for (const k of ['metal', 'ironwork'] as PalKey[]) ALL.thin.add(cmat(k, PROP_C));
  const B = { w: ALL, c: ALL, e: ALL };
  const bakeAt = (_x: number): Bake => ALL;
  const tagMats = { people: new Set<string>(), other: new Set<string>() };
  const tris = { people: 0 };

  /** 放一件资产（真尺寸画的，这里 × K）：原点 = 落地点；y = 落在多高（已缩的世界米） */
  const place = (
    id: string,
    x: number,
    z: number,
    o: { rot?: number; v?: number; y?: number; s?: number; blk?: [number, number] | number } = {},
  ) => {
    const { obj } = makeAsset(id, o.v ? { ...A, variant: o.v } : A);
    obj.position.set(x, o.y ?? 0, z);
    obj.rotation.y = o.rot ?? 0;
    obj.scale.setScalar((o.s ?? 1) * K);
    if (id === 'civic-person') PEOPLE.obj(obj, x, z);
    else bakeAt(x).obj(obj);
    if (typeof o.blk === 'number') block({ x, z, r: o.blk });
    else if (o.blk) blockRect(x, z, o.blk[0], o.blk[1], o.rot ?? 0);
    return obj;
  };
  /** clubsite 的现成资产（BaseCtx 的 build 函数） */
  const placeFn = (fn: (c: BaseCtx) => THREE.Object3D, v: number, x: number, z: number, rot = 0, s = 1) => {
    const obj = fn({ ...A, variant: v } as unknown as BaseCtx);
    obj.position.set(x, 0, z);
    obj.rotation.y = rot;
    obj.scale.setScalar(s * K);
    bakeAt(x).obj(obj);
    return obj;
  };
  /** 平的一块（多边形）：材质键 + 高 */
  const flatPoly = (key: PalKey, pts: readonly V2[], y: number, bake?: Bake) => {
    const x = pts.reduce((s, p) => s + p[0], 0) / pts.length;
    (bake ?? bakeAt(x)).geo(polyGeo(pts, y), ground(key), false);
  };
  const flatRect = (key: PalKey, x0: number, x1: number, z0: number, z1: number, y: number, bake?: Bake) =>
    flatPoly(
      key,
      [
        [x0, z0],
        [x1, z0],
        [x1, z1],
        [x0, z1],
      ],
      y,
      bake,
    );
  /** 盒子（世界米，已是最终大小）：路缘、矮墙 */
  const bx = (
    m: THREE.Material,
    w: number,
    h: number,
    dd: number,
    x: number,
    y: number,
    z: number,
    cast = true,
    rot = 0,
  ) => bakeAt(x).geo(box(w, h, dd, 0, 0, 0).rotateY(rot).translate(x, y, z), m, cast);
  const M = {
    kerb: A0.mat('concrete'),
    paint: A0.mat('lotPaint'),
    stain: A0.mat('lotPave', { elem: TOWN_EL.lotPave, ramp: [0xd8b690, 0xb68e86, 0x5e4e86] }),
    stainSt: A0.mat('street', { elem: TOWN_EL.street, ramp: [0x847e72, 0x545e74, 0x323f58] }),
    wall: A.mat('adobe'),
    cap: A0.mat('cap'),
  };
  /** 车位：一条 2 纹素的漆线（lotPaint，0.09 米宽），从 (x, z0) 到 (x, z1)（沿 z）或沿 x */
  const paintZ = (x: number, z0: number, z1: number, b?: Bake) =>
    (b ?? bakeAt(x)).geo(
      new THREE.PlaneGeometry(0.09, Math.abs(z1 - z0)).rotateX(-Math.PI / 2).translate(x, YP.paint, (z0 + z1) / 2),
      M.paint,
      false,
    );
  const paintX = (x0: number, x1: number, z: number, b?: Bake) =>
    (b ?? bakeAt((x0 + x1) / 2)).geo(
      new THREE.PlaneGeometry(Math.abs(x1 - x0), 0.09).rotateX(-Math.PI / 2).translate((x0 + x1) / 2, YP.paint, z),
      M.paint,
      false,
    );
  /** 油渍：车位中间一块低一级的方块（6×4 纹素 ≈ 0.27 × 0.18 米，按车头方向） */
  const stain = (x: number, z: number, along: 'x' | 'z', b?: Bake, onStreet = false) =>
    (b ?? bakeAt(x)).geo(
      new THREE.PlaneGeometry(along === 'x' ? 0.72 : 0.45, along === 'x' ? 0.45 : 0.72)
        .rotateX(-Math.PI / 2)
        .translate(x, YP.stain, z),
      onStreet ? M.stainSt : M.stain,
      false,
    );
  /** 路缘：矩形一圈 0.25 宽 × 0.12 高（开口 = 不画的边） */
  const kerbRect = (r: Box2, open: ('n' | 's' | 'w' | 'e')[] = []) => {
    const h = 0.12;
    const t = 0.25;
    if (!open.includes('n')) bx(M.kerb, r.x1 - r.x0, h, t, (r.x0 + r.x1) / 2, 0, r.z0, false);
    if (!open.includes('s')) bx(M.kerb, r.x1 - r.x0, h, t, (r.x0 + r.x1) / 2, 0, r.z1, false);
    if (!open.includes('w')) bx(M.kerb, t, h, r.z1 - r.z0, r.x0, 0, (r.z0 + r.z1) / 2, false);
    if (!open.includes('e')) bx(M.kerb, t, h, r.z1 - r.z0, r.x1, 0, (r.z0 + r.z1) / 2, false);
  };
  /** 车（六种色轮流，相邻不同色）：本地 +z = 车头 */
  let carN = Math.floor(rnd() * 6);
  const car = (x: number, z: number, rot: number) => {
    carN = (carN + 1 + Math.floor(rnd() * 2)) % 6;
    place('pz-car', x, z, { rot, v: carN, blk: [1.3, 3.05] });
  };

  // ── 画面上的人（骨骼人定格一个姿势；不缩：人在小镇里是真尺寸）──
  type Make = (c: BaseCtx) => THREE.Object3D;
  // 人的材质也算绘制：四套大人的衣服（球员 v0..3），孩子只在门口的长椅上坐一个
  const MAKERS: [Make, number][] = [
    [player, 0],
    [player, 3],
  ];
  let who = Math.floor(rnd() * MAKERS.length);
  const person = (
    x: number,
    z: number,
    rot: number,
    pose: string,
    o: { seat?: [number, number]; phase?: number; look?: [number, number]; pick?: number; make?: [Make, number] } = {},
  ) => {
    who = o.pick ?? (who + 1 + Math.floor(rnd() * 3)) % MAKERS.length;
    const [make, v] = o.make ?? MAKERS[who % MAKERS.length];
    const p = make({ ...tagCtx, variant: v } as unknown as BaseCtx);
    p.userData.setProp?.(null);
    if (o.seat) p.userData.setSeat?.(o.seat[0], o.seat[1]);
    p.userData.pose?.(pose, o.phase ?? rnd());
    p.position.set(x, o.seat ? o.seat[0] : 0, z);
    p.rotation.y = rot;
    p.updateMatrixWorld(true);
    if (o.look) p.userData.lookAt?.(new THREE.Vector3(o.look[0], 1.5, o.look[1]));
    PEOPLE.obj(p, x, z);
    p.traverse((c) => {
      const mm = c as THREE.Mesh;
      const m = mm.material as THREE.Material | undefined;
      if (mm.isMesh && m) {
        tagMats.people.add(m.uuid);
        const g = mm.geometry;
        tris.people += (g.index ? g.index.count : g.attributes.position.count) / 3;
      }
    });
    block({ x, z, r: 0.3 });
  };
  /** 朝向：rot 0 = 脸朝南（+z）；E = 朝东 */
  const R = { S: 0, N: Math.PI, E: Math.PI / 2, W: -Math.PI / 2 } as const;

  // ══ G1 报社西：发报院子 ══════════════════════════════════════════
  {
    // 铺面：西边贴着棕榈巷（离路沿 0.8 米），南到主街人行道北沿，北到后街人行道，东接报社的货场（一起铺）
    const yard: V2[] = [
      [216.6, -10.6],
      [233.2, -10.6],
      [233.2, -16.4],
      [241.4, -16.4],
      [241.4, -45.6],
      [209.2, -45.6],
      [211.4, -28],
    ];
    // 院子 = 浅的 lotPave；送报车进出、停在台前的那条（从棕榈巷进来到发报台前）是沥青（和主街一个材质）：一眼是"车走的道"。
    // 整片沥青试过：正午饱和度掉到 0.32（< 0.35）
    flatPoly('lotPave', yard, YP.pave);
    flatPoly(
      'street',
      [
        [209.6, -35.0],
        [233.6, -35.0],
        [233.6, -41.0],
        [209.3, -41.0],
      ],
      YP.stain + 0.004,
    );
    claim({ x0: 209, x1: 241.5, z0: -45.6, z1: -10.4 });
    // 朝主街的矮花砖墙（1.4 米 × K），中间一个人走的口；墙头压顶
    const wallY = -10.75;
    const breeze = A.mat('breezeBlock', { elem: TOWN_EL.breezeBlock });
    for (const [a, b] of [
      [216.8, 223.6],
      [226.0, 233.0],
    ] as const) {
      bx(breeze, b - a, 0.8, 0.22, (a + b) / 2, 0, wallY);
      bx(M.cap, b - a + 0.06, 0.08, 0.3, (a + b) / 2, 0.8, wallY);
      blockRect((a + b) / 2, wallY, b - a, 0.3);
    }
    // 口两边一对花池（人行道上，挨着墙）
    place('pz-planter', 222.4, -9.0, { v: 2, blk: [1.0, 1.0] });
    place('pz-planter', 227.2, -9.0, { v: 1, blk: [1.0, 1.0] });
    // 发报台（北沿）+ 两辆送报车倒在台前（车头朝南）+ 台上三摞报纸、台边一托新闻纸卷
    place('pz-dock', 223.0, -41.4, { blk: [7.6, 2.4] });
    blockRect(223, -43.8, 7.8, 0.4);
    place('paper-van', 220.6, -39.2, { blk: [1.4, 3.4] });
    place('paper-van', 225.4, -39.5, { blk: [1.4, 3.4] });
    for (const [x, v] of [
      [218.6, 0],
      [222.9, 1],
      [227.6, 0],
    ] as const)
      place('paper-bundles', x, -42.3, { v, y: 1.2 * K });
    place('newsprint-rolls', 230.4, -42.4, { blk: [1.7, 0.9] });
    place('paper-bundles', 229.9, -40.6, { v: 1, blk: 0.5 });
    // 搬报纸的人（台边）、一个骑车送报的孩子推着车出门
    place('civic-person', 228.4, -40.1, { rot: R.W, v: 1, blk: 0.3 });
    // 员工车位：墙里一排 4 格（车头朝北），两格停车；地上漆线 + 油渍
    const sx = [218.6, 220.4, 222.2, 228.8, 230.6];
    for (const x of sx) paintZ(x - 0.9, -15.6, -12.4);
    paintZ(sx[sx.length - 1] + 0.9, -15.6, -12.4);
    car(219.5, -14.0, R.N);
    car(229.7, -14.0, R.N);
    stain(221.3, -14.2, 'z');
    stain(223.1, -14.4, 'z');
    // 院子中间一个长条花池岛（一棵大遮阴树 + 九重葛），树下一条员工长椅（朝南）
    place('pz-planter', 225.0, -27.6, { v: 4, blk: [2.6, 1.3] });
    place('pz-tree', 224.2, -27.8, { s: 0.9 });
    place('pz-bench', 225.4, -25.6, { rot: R.S, blk: [1.3, 0.5] });
    // 西边贴着棕榈巷一排员工车位（车头朝西，跟着路斜），两格停车
    const edgeX = (z: number) => 214 - (7 * (-z - 5)) / 23 + 4.3;
    for (const [i, z] of [-18.4, -20.4, -22.4, -24.4].entries()) {
      const x = edgeX(z) + 1.7;
      paintX(x - 1.6, x + 1.6, z - 1.0);
      if (i === 3) paintX(x - 1.6, x + 1.6, z + 1.0);
      if (i === 0 || i === 2) car(x, z, R.W);
      else stain(x, z, 'x');
    }
    // 送报孩子的自行车架（墙里）、一个垃圾箱 + 牛奶箱贴印刷车间西墙、台子东头三托新闻纸卷
    place('pz-bikerack', 216.6, -36.6, { rot: R.E, v: 1, blk: [0.6, 1.7] });
    place('pz-dumpster', 239.4, -19.2, { rot: R.W, blk: [0.8, 1.2] });
    place('pz-crates', 239.6, -21.4, { rot: R.W, blk: 0.45 });
    for (const z of [-40.6, -42.8, -45.0]) place('newsprint-rolls', 239.4, z, { rot: R.W, blk: [0.9, 1.7] });
    // 第三辆送报车停在院子当中等着装车
    place('paper-van', 231.0, -32.0, { rot: 0.25, blk: [1.5, 3.4] });
    // 第 3 轮：再一辆送报车（倒向台子东头）+ 台前两堆报纸
    place('paper-van', 229.8, -38.9, { rot: 0.1, blk: [1.4, 3.4] });
    for (const [x, z, v] of [
      [217.2, -39.6, 0],
      [227.6, -36.2, 1],
    ] as const) {
      place('paper-bundles', x, z, { v, blk: 0.5 });
      place('paper-bundles', x + 0.7, z + 0.2, { v: 1 - v, blk: 0.5 });
    }
    pool(223, -38.5, 5, 4);
  }

  // ══ 体育店前场：铺到楼两侧和楼脚，店门口道具 ══════════════════════════
  {
    const tile = (x0: number, x1: number, z0: number, z1: number) => {
      flatRect('tile', x0, x1, z0, z1, YP.pave);
      claim({ x0, x1, z0, z1 });
    };
    // 西侧（到 G3 那两栋房前）、东侧（接市政厅西边的前庭）、楼前那块的东头补到 x 252
    tile(223.2, 230.6, -76.4, -64.2);
    tile(244.0, 252.2, -76.4, -57.7);
    tile(246.4, 252.2, -64.2, -57.7);
    // 店门口：穿线台和长椅之间一架球拍展示架、前场东南角朝后街一块球拍形立地招牌、西头自行车架、两个大花盆
    place('pz-racquet-rack', 236.6, -62.9, { blk: [0.9, 0.5] });
    place('pz-racquet-sign', 248.6, -59.0, { rot: -0.25, blk: 0.4 });
    place('pz-bikerack', 226.6, -60.2, { v: 0, blk: [1.7, 0.6] });
    place('pz-pot', 224.4, -63.4, { v: 3, blk: 0.55 });
    place('pz-pot', 250.6, -62.6, { v: 0, blk: 0.55 });
    place('pz-planter', 248.4, -70.0, { v: 2, blk: [1.0, 1.0] });
    place('pz-planter', 226.9, -70.4, { v: 1, blk: [1.0, 1.0] });
    // 看球拍的人
  }

  // ══ G4 横街对面：小广场 + 公交站棚 ══════════════════════════════════
  {
    const X0 = 263.8;
    const X1 = 285.0;
    const Z0 = 9.6;
    const Z1 = 16.8;
    flatRect('tile', X0, X1, Z0, Z1, YP.pave, B.c);
    claim({ x0: X0, x1: X1, z0: Z0 - 4.6, z1: Z1 });
    // 圆心一圈水磨石（横街往南的轴线上），中间一个圆花池 + 一棵大棕榈
    const C: V2 = [274.4, 13.0];
    const ring: V2[] = [];
    for (let i = 0; i < 20; i++)
      ring.push([C[0] + Math.cos((i / 20) * Math.PI * 2) * 3.0, C[1] + Math.sin((i / 20) * Math.PI * 2) * 2.6]);
    flatPoly('terrazzo', ring, YP.plaza, B.c);
    const potM = A.mat('adobe', { lightUp: 0.2 });
    B.c.geo(new THREE.CylinderGeometry(1.15, 1.2, 0.36, 14).translate(C[0], 0.18, C[1]), potM, true);
    B.c.geo(new THREE.CylinderGeometry(1.2, 1.2, 0.06, 14).translate(C[0], 0.39, C[1]), M.cap, false);
    B.c.geo(
      polyGeo(
        ring.map(([x, z]) => [C[0] + (x - C[0]) * 0.36, C[1] + (z - C[1]) * 0.42] as const),
        0.37,
      ),
      ground('gravelYard'),
      false,
    );
    placeFn(fanPalm, 1, C[0], C[1], 0.4);
    block({ x: C[0], z: C[1], r: 1.25 });
    // 两条长椅朝主街（北），水磨石圈两边
    place('pz-bench', 269.0, 12.4, { rot: R.N, blk: [1.3, 0.5] });
    place('pz-bench', 279.8, 12.4, { rot: R.N, blk: [1.3, 0.5] });
    // 公交站棚：东半边的路缘里，开口朝北对着主街；站牌在东头
    place('pz-shelter', 281.0, 7.3, { blk: [2.3, 0.9] });
    person(280.2, 7.4, R.N, 'sit', { seat: [0.45 * K + 0.02, 0.0], look: [270, 0] });
    // 南沿一排长条花池（九重葛 + 小棕榈）收边
    for (const x of [267.2, 274.4, 281.6]) place('pz-planter', x, 16.0, { v: 4, blk: [2.5, 1.3] });
    // 西北角一个消防栓、东北角自行车架
    place('pz-hydrant', 264.6, 6.4, { blk: 0.3 });
    place('pz-bin', 285.6, 8.8, { blk: 0.3 });
    pool(274.4, 11.5, 4.6, 4);
  }

  // ══ 银行 drive-up 东边：员工车位（两排各 3 格）+ 花池岛 ══════════════════════
  {
    const X0 = 306.9;
    const X1 = 316.6;
    const Z0 = -45.2;
    const Z1 = -22.6;
    flatRect('lotPave', X0, X1, Z0, Z1, YP.pave, B.e);
    kerbRect({ x0: X0, x1: X1, z0: Z0, z1: Z1 }, ['w', 'n']);
    claim({ x0: X0, x1: X1, z0: Z0, z1: Z1 });
    // 西排（车头朝东）、东排（车头朝西），每排 3 格 × 1.9 米；花池岛在两排之间往北
    const zs = [-26.2, -28.1, -30.0];
    for (const z of [...zs.map((z) => z + 0.95), zs[2] - 0.95]) {
      paintX(X0 + 0.3, X0 + 3.5, z, B.e);
      paintX(X1 - 3.5, X1 - 0.3, z, B.e);
    }
    car(X0 + 1.9, zs[0], R.E);
    car(X0 + 1.9, zs[2], R.E);
    car(X1 - 1.9, zs[1], R.W);
    stain(X0 + 2.1, zs[1], 'x', B.e);
    stain(X1 - 2.1, zs[0], 'x', B.e);
    // 花池岛（2×4 长条转 90°）+ 两棵棕榈
    place('pz-planter', 311.8, -35.4, { v: 4, rot: Math.PI / 2, blk: [1.3, 2.5] });
    place('pz-pot', 311.6, -33.4, { v: 3, s: 1.5, blk: 0.6 });
    place('pz-pot', 312.0, -37.6, { v: 3, s: 1.3, blk: 0.6 });
    place('pz-pot', 309.0, -42.6, { v: 1, blk: 0.55 });
  }

  // ══ 餐馆后院（餐馆北，接后街人行道）══════════════════════════════════
  // 第 3 轮：铺面缩到一半（后门那一截），北边一条碎石花池带接后街人行道；送货车倒在后门、牛奶箱、员工长椅（有人坐着歇）
  {
    const X0 = 316.6;
    const X1 = 330.2;
    const Z0 = -37.4;
    const Z1 = -28.6;
    flatRect('lotPave', X0, X1, Z0, Z1, YP.pave, B.e);
    kerbRect({ x0: X0, x1: X1, z0: Z0, z1: Z1 }, ['s', 'w']);
    claim({ x0: X0, x1: X1, z0: -45.6, z1: Z1 });
    // 北边：碎石带 + 两条长花池 + 一棵树（树影落在铺面北沿）
    flatRect('gravelYard', X0, X1, -45.6, Z0, YP.pave, B.e);
    place('pz-planter', 320.0, -41.4, { v: 4, blk: [2.5, 1.3] });
    place('pz-planter', 327.0, -42.2, { v: 4, blk: [2.5, 1.3] });
    place('pz-tree', 323.6, -40.0, { s: 0.85, blk: 0.45 });
    // 后门的一条陶砖小路到后街
    flatRect('tile', 322.8, 324.4, -45.6, Z1, YP.plaza, B.e);
    place('pz-dumpster', 328.4, -30.2, { blk: [1.2, 0.8] });
    place('pz-crates', 325.8, -29.8, { blk: 0.45 });
    place('pz-crates', 326.6, -31.0, { v: 0, rot: 0.4, blk: 0.45 });
    place('pz-bench', 319.4, -30.0, { rot: R.S, blk: [1.3, 0.5] });
    person(319.0, -29.9, R.S, 'sit', { seat: [0.52 * K + 0.02, 0], look: [321, -26], pick: 1 });
    // 送货车（车头朝南，倒在后门边）+ 搬牛奶箱的人
    place('paper-van', 321.0, -34.6, { rot: 0.15, blk: [1.4, 3.4] });
    place('civic-person', 323.2, -32.2, { rot: R.W, v: 2, blk: 0.3 });
    pool(323.6, -31.0, 4, 3.4);
  }

  // ══ G2 市政厅东：公共停车场 + 后街尽头的小门 ══════════════════════════════
  {
    const X0 = 302.8;
    const X1 = 333.6;
    const Z0 = -84.6;
    const Z1 = -58.6;
    flatRect('lotPave', X0, X1, Z0, Z1, YP.pave, B.e);
    kerbRect({ x0: X0, x1: X1, z0: Z0, z1: Z1 }, ['s']);
    claim({ x0: X0, x1: X1, z0: Z0, z1: Z1 });
    // 两排车位：南排车头朝北（z −63.4…−66.6），北排车头朝南（−69.0…−72.2），中间花池岛；北边一条碎石带 + 树
    const SW = 1.85;
    const xs: number[] = [];
    for (let x = X0 + 1.4; x + SW < X1 - 1; x += SW) xs.push(x);
    for (const [z0, z1] of [
      [-66.6, -63.4],
      [-72.2, -69.0],
    ] as const) {
      for (const x of xs) paintZ(x, z0, z1, B.e);
      paintZ(xs[xs.length - 1] + SW, z0, z1, B.e);
    }
    // 花池岛
    flatRect('gravelYard', X0 + 1.2, X1 - 1.2, -68.8, -66.8, YP.plaza, B.e);
    kerbRect({ x0: X0 + 1.2, x1: X1 - 1.2, z0: -68.8, z1: -66.8 });
    const prnd = d.rng('valley:plaza:g2cars');
    xs.forEach((x, i) => {
      if (prnd() < 0.5) car(x + SW / 2, -65.0, R.N);
      else stain(x + SW / 2, -65.2, 'z', B.e);
      if (prnd() < 0.45 && (i < 5 || i > 9)) car(x + SW / 2, -70.6, R.S);
      else if (i % 3 === 0) stain(x + SW / 2, -70.4, 'z', B.e);
    });
    for (const x of [306.6, 318.2, 329.8]) place('pz-tree', x, -67.8, { s: 0.8, blk: 0.45 });
    for (const x of [312.4, 324.0]) {
      place('pz-planter', x, -67.8, { v: 1, blk: [1.0, 1.0] });
    }
    // 两盏高杆灯
    for (const x of [309.0, 327.4]) {
      place('lot-light', x, -67.8, { blk: 0.3 });
      pool(x - 0.6, -67.6, 6, 5);
      pool(x + 0.6, -67.6, 6, 5);
    }
    // 北边：碎石带 + 一排树 + 桶形仙人掌，再北一道 1.8 米灰泥墙（朝南的面是暗带）挡住后面的住家
    flatRect('gravelYard', X0, X1, -84.6, -74.2, YP.plaza, B.e);
    kerbRect({ x0: X0, x1: X1, z0: -84.6, z1: -74.2 }, ['n']);
    for (const [x, z, v] of [
      [305.8, -78.6, 0],
      [312.0, -80.6, 1],
      [319.4, -78.2, 3],
      [327.0, -80.2, 0],
      [331.6, -77.6, 2],
    ] as const)
      place('pz-pot', x, z, { v, s: 0.9, blk: 0.5 });
    for (const x of [309.0, 323.0]) place('pz-tree', x, -81.6, { blk: 0.45 });
    bx(M.wall, X1 - X0, 1.8 * K, 0.3, (X0 + X1) / 2, 0, -85.0);
    bx(M.cap, X1 - X0 + 0.1, 0.08, 0.4, (X0 + X1) / 2, 1.8 * K, -85.0);
    blockRect((X0 + X1) / 2, -85.0, X1 - X0, 0.4);
    // 入口（回车圈北边）：公告栏 + 垃圾桶
    place('pz-menu', 316.2, -59.6, { blk: [0.7, 0.3] });
    place('pz-bin', 318.0, -59.6, { blk: 0.3 });
    // 停车场西边的人行（陶砖）接市政厅前庭
    flatRect('tile', 300.8, X0, -84.6, -57.6, YP.pave, B.e);
    claim({ x0: 300.8, x1: X0, z0: -84.6, z1: -57.6 });

    // 后街尽头 → 校队球场西北门：3 米的铺地小径、两根门柱、自行车架、长椅、一棵大树、一面队旗
    flatRect('tile', 331.6, 338.6, -53.2, -50.2, YP.plaza, B.e);
    place('pz-gate', 336.2, -51.7, { rot: R.E });
    blockRect(336.2, -50.0, 0.5, 0.5);
    blockRect(336.2, -53.4, 0.5, 0.5);
    place('pz-pennant', 337.0, -54.3, { blk: 0.15 });
    place('pz-bikerack', 333.0, -55.4, { v: 2, blk: [1.7, 0.6] });
    place('pz-tree', 331.4, -46.6, { blk: 0.5 });
    place('pz-bench', 333.4, -46.2, { rot: R.S, blk: [1.3, 0.5] });
  }

  // ══ 主街：北侧平行停车（G1 墙外的路边让出来的车湾）══════════════════════════
  {
    const Z0 = -5.0;
    const Z1 = -6.9;
    flatRect('street', 217.4, 234.8, Z1, Z0, YP.pave, B.w);
    bx(M.kerb, 234.8 - 217.4, 0.12, 0.25, 226.1, 0, Z1, false);
    claim({ x0: 217, x1: 235.2, z0: Z1 - 0.3, z1: Z0 });
    // 西头离棕榈巷路口留 3 米（车头不压进巷口）
    for (let i = 0; i < 5; i++) {
      const x = 219.6 + i * 3.4;
      if (i > 0) paintZ(x - 1.7, Z1 + 0.1, Z0 - 0.4, B.w);
      if (i !== 2) car(x, (Z0 + Z1) / 2, R.E);
    }
  }

  // ══ 市政厅北：员工停车场（6 格一半停车）+ 碎石沙漠花园（第 3 轮，镇中心外第二圈的沙）══════════════
  {
    const X0 = 258.0;
    const X1 = 290.0;
    const Z0 = -92.6;
    const Z1 = -80.6;
    flatRect('lotPave', X0, X1, Z0, Z1, YP.pave, B.c);
    kerbRect({ x0: X0, x1: X1, z0: Z0, z1: Z1 });
    claim({ x0: X0, x1: X1, z0: Z0, z1: Z1 });
    const SW = 1.9;
    for (let i = 0; i <= 6; i++) paintZ(264.0 + i * SW, -91.8, -88.6, B.c);
    for (const i of [0, 2, 5]) car(264.0 + (i + 0.5) * SW, -90.2, R.N);
    for (const i of [1, 4]) stain(264.0 + (i + 0.5) * SW, -90.0, 'z', B.c);
    // 车位两头：西头一个大花池（小棕榈 + 九重葛）、东头一棵树
    place('pz-planter', 260.6, -89.6, { v: 4, rot: Math.PI / 2, blk: [1.3, 2.5] });
    place('pz-tree', 279.6, -90.4, { s: 0.85, blk: 0.45 });
    place('lot-light', 284.6, -86.6, { blk: 0.3 });
    pool(284.0, -86.4, 6, 5);
    // 北边 + 东边：碎石沙漠花园（桶形仙人掌、龙舌兰、九重葛的大盆，两棵树，一条石子小径）
    flatRect('gravelYard', 255.0, 300.6, -104.0, Z0, YP.pave, B.c);
    flatRect('gravelYard', X1, 300.6, Z0, -80.0, YP.pave, B.c);
    claim({ x0: 255, x1: 300.6, z0: -104, z1: Z0 });
    claim({ x0: X1, x1: 300.6, z0: Z0, z1: -80 });
    flatRect('tile', 272.6, 274.2, -104.0, Z0, YP.plaza, B.c);
    for (const [x, z, v, sc] of [
      [258.6, -96.4, 0, 1.1],
      [263.4, -100.6, 1, 1.2],
      [268.4, -95.6, 2, 1.0],
      [277.8, -97.4, 0, 1.3],
      [282.6, -101.2, 1, 1.0],
      [287.6, -96.0, 3, 1.1],
      [293.4, -99.8, 2, 1.2],
      [297.4, -94.2, 0, 1.0],
      [295.0, -86.0, 1, 1.1],
    ] as const)
      place('pz-pot', x, z, { v, s: sc, blk: 0.55 * sc });
    for (const [x, z] of [
      [266.0, -102.0],
      [291.0, -103.0],
      [297.0, -83.6],
    ] as const)
      place('pz-tree', x, z, { blk: 0.45 });
    place('pz-bench', 276.4, -99.6, { rot: R.W, blk: [0.5, 1.3] });
    place('civic-person', 270.6, -86.4, { rot: R.S, v: 8, blk: 0.3 });
  }
  // ══ 横街两侧：各一组长椅 + 垃圾桶 / 花盆 + 人（第 3 轮）══════════════════════
  // 横街只有 10 米宽、默认镜头 17 米：东西放在路缘里侧 1 米（人行道靠路的一半），不然出画
  place('pz-bench', 268.5, -26.4, { rot: R.E, blk: [0.5, 1.3] });
  place('pz-bin', 268.6, -24.0, { blk: 0.3 });
  person(268.6, -26.0, R.E, 'sit', { seat: [0.52 * K + 0.02, 0], look: [280, -26], pick: 0 });
  place('civic-person', 268.8, -36.6, { rot: R.S, v: 4, blk: 0.3 });
  claim({ x0: 267.6, x1: 269.4, z0: -37.2, z1: -23.4 });
  place('pz-bench', 280.3, -33.8, { rot: R.W, blk: [0.5, 1.3] });
  place('pz-pot', 280.4, -31.2, { v: 2, blk: 0.55 });
  place('civic-person', 280.4, -36.4, { rot: R.N, v: 5, blk: 0.3 });
  place('civic-person', 280.2, -22.6, { rot: R.S, v: 10, blk: 0.3 });
  claim({ x0: 279.4, x1: 281.4, z0: -37, z1: -22 });

  // ══ 主街东段（x 380～620）：学校门口、公园门口的公交站、五金门前（第 3 轮）══════════════════
  // 学校车道口（x ≈ 450）西边：自行车架 + 两个学生；路口东边一个消防栓、一个垃圾桶
  place('pz-bikerack', 434.6, -8.2, { v: 0, blk: [1.7, 0.6] });
  person(432.4, -6.8, R.E, 'idle', { make: [kid, 1], look: [434, -7] });
  person(433.6, -6.2, R.W, 'idle', { make: [kid, 2], phase: 0.5, look: [432.4, -6.8] });
  place('pz-hydrant', 457.6, -6.4, { blk: 0.3 });
  place('pz-bin', 447.8, -8.6, { blk: 0.3 });
  claim({ x0: 431.4, x1: 436.6, z0: -9.2, z1: -5.6 });
  claim({ x0: 447, x1: 448.6, z0: -9.2, z1: -8 });
  claim({ x0: 456.8, x1: 458.4, z0: -7.2, z1: -5.6 });
  // 公园门口西边（南人行道）：长椅、垃圾桶、大花盆，两个人
  place('pz-bench', 445.2, 8.2, { rot: R.N, blk: [1.3, 0.5] });
  place('pz-bin', 447.6, 8.6, { blk: 0.3 });
  place('pz-pot', 442.4, 8.2, { v: 0, blk: 0.55 });
  place('civic-person', 446.4, 6.6, { rot: R.E, v: 9, blk: 0.3 });
  place('civic-person', 450.6, 6.8, { rot: R.W, v: 2, blk: 0.3 });
  claim({ x0: 441.6, x1: 451.2, z0: 6, z1: 9.2 });
  // 公园门口（石柱 x ≈ 452～458）东边：公交站棚（开口朝北）+ 长椅 + 垃圾桶，两个人等车
  place('pz-shelter', 467.2, 7.3, { blk: [2.3, 0.9] });
  person(466.4, 7.4, R.N, 'sit', { seat: [0.45 * K + 0.02, 0], look: [450, 0], pick: 0 });
  place('civic-person', 469.8, 6.4, { rot: R.W, v: 1, blk: 0.3 });
  place('pz-bench', 474.2, 8.0, { rot: R.N, blk: [1.3, 0.5] });
  place('pz-bin', 476.2, 8.4, { blk: 0.3 });
  claim({ x0: 465, x1: 477, z0: 6, z1: 9.2 });
  // 五金门前（停车场南沿）：购物车回收架、推车的人、一条长椅、垃圾桶
  place('cart-corral', 538.0, -10.4, { blk: [2.0, 0.9] });
  person(541.6, -12.6, R.S, 'push', { phase: 0.3, pick: 1 });
  place('pz-bench', 546.2, -8.3, { rot: R.S, blk: [1.3, 0.5] });
  place('pz-bin', 548.4, -8.4, { blk: 0.3 });
  place('civic-person', 552.4, -7.4, { rot: R.E, v: 6, blk: 0.3 });
  place('civic-person', 543.6, 12.4, { rot: R.W, v: 1, blk: 0.3 });
  claim({ x0: 536.8, x1: 549, z0: -11.2, z1: -7.6 });
  // 走路的人（东段两侧人行道）
  for (const [x, z, rot, v] of [
    [396.0, -7.4, R.E, 0],
    [421.0, 7.6, R.W, 4],
    [452.0, -7.6, R.W, 9],
    [486.0, -7.2, R.E, 2],
    [512.0, 7.4, R.W, 10],
    [583.0, -7.6, R.E, 5],
    [598.0, 7.8, R.W, 8],
  ] as const)
    place('civic-person', x, z, { rot, v, blk: 0.3 });

  // ══ 街道家具（每个路口一套 + 店门口一套）══════════════════════════════════
  // 横街口西北角：三个不同色的报箱 + 垃圾桶 + 大花盆；东北角（银行人行台西头）：消防栓
  for (const [i, x] of [266.4, 267.1, 267.8].entries()) place('paper-newsrack', x, -8.9, { v: i + 1 });
  blockRect(267.1, -8.9, 2.2, 0.4);
  claim({ x0: 265.6, x1: 270.6, z0: -9.6, z1: -8.2 });
  place('pz-bin', 269.3, -8.9, { blk: 0.3 });
  place('pz-pot', 264.2, -8.0, { v: 2, blk: 0.55 });
  place('pz-hydrant', 281.0, -6.3, { blk: 0.3 });
  claim({ x0: 263.2, x1: 265.2, z0: -9.2, z1: -6.8 });
  // 市政厅前庭（后街北边人行道）：蓝邮筒 + 垃圾桶；两个人站着说话
  place('pz-mailbox', 285.4, -57.4, { blk: 0.35 });
  place('pz-bin', 263.0, -57.4, { blk: 0.3 });
  claim({ x0: 284.6, x1: 286.2, z0: -58.2, z1: -56.6 });
  place('civic-person', 270.4, -58.6, { rot: R.E, v: 6, blk: 0.3 });
  place('civic-person', 271.8, -58.4, { rot: R.W, v: 9, blk: 0.3 });
  // 餐馆：西头路边一个电话亭、门口一块户外菜单牌、东头一个垃圾桶
  place('pz-phone', 310.6, -8.4, { blk: [0.6, 0.4] });
  place('pz-menu', 330.6, -10.6, { rot: -0.3, blk: [0.7, 0.3] });
  place('pz-bin', 331.6, -8.2, { blk: 0.3 });
  claim({ x0: 309.8, x1: 332.2, z0: -11.2, z1: -7.6 });
  // 报社门口的长椅那头一个垃圾桶 + 主街西头路口的大花盆（G1 墙角）、消防栓
  place('pz-pot', 217.6, -8.4, { v: 0, blk: 0.55 });
  place('pz-hydrant', 235.2, -7.8, { blk: 0.3 });
  claim({ x0: 214.4, x1: 236, z0: -9.4, z1: -7.2 });
  // 主街南人行道（车位后面）：两个垃圾桶、一个自行车架
  place('pz-bin', 262.0, 12.6, { blk: 0.3 });
  place('pz-bin', 300.0, 12.6, { blk: 0.3 });
  place('pz-bikerack', 287.6, 12.4, { v: 1, blk: [1.7, 0.6] });
  claim({ x0: 286.4, x1: 289, z0: 11.6, z1: 13.4 });
  // ══ 路人 ══════════════════════════════════════════════════════════════
  // 走路的路人用市政厅那批方块人（civic-person，84 个三角形；骨骼人一个 2400，十几个就是 4 万多 × 两个 pass），
  // 停下来做事的（排队、坐着、说话、拿报纸）用骨骼人摆姿势。北人行道（z −7.4 一带）、南人行道（车位后面 z 12.3）
  let wv = 0;
  for (const [x, z, rot] of [
    [229.6, -7.6, R.E],
    [244.2, -7.2, R.W],
    [258.8, -7.8, R.E],
    [296.6, -7.4, R.W],
    [305.2, -7.8, R.E],
    [252.6, 12.3, R.W],
    [304.6, 12.4, R.E],
    [318.4, 12.2, R.W],
  ] as const) {
    // 变体的姿势 v % 4：0 站、1 拿张纸、2 叉腰（3 举手不要）
    wv += 1 + (wv % 4 === 2 ? 1 : 0) + Math.floor(rnd() * 2) * 4;
    if (wv % 4 === 3) wv++;
    place('civic-person', x, z, { rot, v: wv, blk: 0.3 });
  }
  // 报社门口拿报纸（报箱前，朝北）
  place('civic-person', 251.4, -9.4, { rot: R.N, v: 1, blk: 0.3 });
  // 银行门口排队（朝北对着门）
  place('civic-person', 292.2, -23.3, { rot: R.N, v: 4, blk: 0.3 });
  place('civic-person', 292.9, -21.9, { rot: R.N, v: 10, blk: 0.3 });
  // 餐馆门口：门前一条长椅，坐两个人
  place('pz-bench', 326.6, -10.4, { rot: R.S, blk: [1.3, 0.5] });
  person(326.1, -10.3, R.S, 'sit', { seat: [0.55 * K + 0.02, 0], look: [324, -2], pick: 0 });
  person(327.2, -10.3, R.S, 'sit', { seat: [0.55 * K + 0.02, 0], phase: 0.4, look: [326.1, -9.6], pick: 1 });
  // 五金停车场推车的人
  place('civic-person', 552.0, -24.0, { rot: R.S, v: 5, blk: 0.3 });

  ALL.flush(d);
  PEOPLE.flush(
    d,
    A0.mat('clothWhite', {
      ramp: [0xffffff, 0xc0b4cc, 0x6c64a0],
      vertexColors: true,
      lightUp: 0.45,
      bands: [-0.3, 0.4],
      noShadowReceive: true,
    }),
  );
  const info = new THREE.Object3D();
  info.name = 'valley:plaza:info';
  info.userData.blocksSkipped = blocksSkipped;
  info.userData.peopleMats = tagMats.people.size;
  info.userData.peopleTris = tris.people;
  let all = 0;
  d.root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh && m.parent?.name === 'valley:plaza:all')
      all += (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3;
  });
  info.userData.allTris = all;
  info.userData.keys = [...usedKeys.keys()].sort().join(' ');
  d.root.add(info);
}
