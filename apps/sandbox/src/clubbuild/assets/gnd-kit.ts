// 地面组（泳池、停车场、遮阳、棕榈、仙人掌花坛、喷泉）共用的小工具。文件名 gnd- 开头，不导出 build（assets/index.ts 只收导出 build 的文件）。
// - Bucket：按"材质名 + 参数"收几何体，最后每种材质合并成一个网格（手机上省 draw call）；
// - pmat / proxyCtx：clubbuild 的 kit.ts 没有 clubpool / clubplaza 那套 PROXY + SUN_SKIP（池水、花砖不在配色方案的 GROUP 表里，
//   午后配色会把池水染成薄荷绿、暗档染成玫瑰褐）。这里照 clubpool/scene.ts 的做法补上：借同组材质名过调色（池水借 jug = club 组，
//   花砖借 signBoard），颜色整个换成原材质的；水的亮档先除掉太阳色的 0.75 份（水面亮处是天光）。
//   复用的喷泉（clubplaza 的 palm-fountain / fountain-spray）直接 ctx.mat('fountainWater')，所以给它一个包了一层的 ctx（proxyCtx）。
// - 几何小工具：圆角矩形轮廓、带"到岸距离"属性的水面格子（toon 的 water 元素用）、放进占地里的复用资产。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Swatch } from '../../clubsite/render/palette';
import { schemeById } from '../../clubsite/render/palettes';
import type { ToonOpts } from '../../clubsite/render/toon';
import type { AssetBuild, AssetCtx } from '../ctx';
import type { Pal } from '../palette';

export type Key = keyof Pal;
export type V2 = [number, number];

// ── 材质：借组调色 ─────────────────────────────────────────

/** 不在 GROUP 表里的材质借哪个名字过调色（同 clubpool/palette.ts 的 PROXY） */
const PROXY: Partial<Record<Key, Key>> = {
  poolWater: 'jug',
  fountainWater: 'jug',
  talavera: 'signBoard',
  accCushion: 'toolOrange',
  accFlamingo: 'flowerRed',
};
/** 亮档要除掉多少太阳色（1 = 一点不染）：水面亮处是反射的天光 */
const SUN_SKIP: Partial<Record<Key, number>> = { poolWater: 0.75, fountainWater: 0.75 };

/** toon 的亮档会乘太阳色：先除掉 k 份（照 clubpool/scene.ts 的 unSun；颜色管理是关的，逐通道除就是精确的） */
function unSun(o: ToonOpts, sunHex: number, k: number): ToonOpts {
  const sc = new THREE.Color(sunHex);
  const m = Math.max(sc.r, sc.g, sc.b, 1e-3);
  const f = [sc.r, sc.g, sc.b].map((c) => 1 / (1 + (c / m - 1) * 0.35 * k));
  const fix = (c: THREE.ColorRepresentation) => {
    const h = new THREE.Color(c).getHex();
    const ch = [(h >> 16) & 255, (h >> 8) & 255, h & 255].map((v, i) => Math.min(255, Math.round(v * f[i])));
    return (ch[0] << 16) | (ch[1] << 8) | ch[2];
  };
  const out: ToonOpts = { ...o };
  if (o.ramp) out.ramp = [fix(o.ramp[0]), o.ramp[1], o.ramp[2]];
  if (o.tones) {
    const t = o.tones;
    out.tones = {
      bands: [t.bands[0].map(fix), t.bands[1], t.bands[2]] as typeof t.bands,
      seam: [fix(t.seam[0]), t.seam[1], t.seam[2]],
      hi: [fix(t.hi[0]), t.hi[1], t.hi[2]],
    };
  }
  return out;
}

/** 拿材质：PROXY 里的名字借组调色（颜色还是自己的），别的照常 ctx.mat */
export function pmat(ctx: AssetCtx, key: Key, extra?: ToonOpts): THREE.MeshToonMaterial {
  const via = PROXY[key];
  if (!via) return ctx.mat(key, extra);
  const sw = ctx.pal[key] as Swatch;
  // 借来的名字自己的 opts（jug 的 ROUND：lightUp、bands）要盖掉，回到默认
  let o: ToonOpts = {
    ramp: sw.ramp,
    edge: sw.edge,
    convex: sw.convex,
    tones: sw.tones,
    lightUp: 0,
    bands: [0.1, 0.5],
    ...(sw.opts ?? {}),
    ...extra,
  };
  const k = SUN_SKIP[key];
  const scheme = schemeById(ctx.params.get('pal'));
  if (k && scheme) o = unSun(o, scheme.sun, k);
  return ctx.mat(via, o);
}

/** 给复用资产的 ctx：mat 走 pmat（池水、花砖借组调色） */
export function proxyCtx(ctx: AssetCtx): AssetCtx {
  return { ...ctx, mat: (key: Key, extra?: ToonOpts) => pmat(ctx, key, extra) };
}

/** 复用别的场景的资产：按它自己的 Pal 写的，这里的表是超集 → 照现有代码 cast */
export function reuse(build: unknown, ctx: AssetCtx, variant = ctx.variant): THREE.Object3D {
  return (build as AssetBuild)({ ...ctx, variant });
}

// ── 几何体合并 ─────────────────────────────────────────────

interface Entry {
  key: Key;
  extra?: ToonOpts;
  geos: THREE.BufferGeometry[];
  cast: boolean;
  recv: boolean;
  keep: string[];
}

/** 按材质收几何体，最后每种材质一个网格（同 clubpool/terrain.ts 的 Bucket）。tag 区分同材质不同参数 */
export class Bucket {
  private m = new Map<string, Entry>();
  add(
    key: Key,
    g: THREE.BufferGeometry,
    o: { extra?: ToonOpts; cast?: boolean; recv?: boolean; tag?: string; keep?: string[] } = {},
  ) {
    const id = `${key}|${o.tag ?? ''}`;
    let e = this.m.get(id);
    if (!e) {
      e = { key, extra: o.extra, geos: [], cast: o.cast ?? true, recv: o.recv ?? true, keep: o.keep ?? [] };
      this.m.set(id, e);
    }
    const n = g.index ? g.toNonIndexed() : g;
    for (const a of Object.keys(n.attributes))
      if (a !== 'position' && a !== 'normal' && !e.keep.includes(a)) n.deleteAttribute(a);
    if (!n.getAttribute('normal')) n.computeVertexNormals();
    e.geos.push(n);
  }
  /** 建网格放进 root；投影 / 受影写在 userData 上，finish() 统一设 */
  build(ctx: AssetCtx, root: THREE.Object3D, prefix = '') {
    for (const [id, e] of this.m) {
      const mesh = new THREE.Mesh(mergeGeometries(e.geos), pmat(ctx, e.key, e.extra));
      mesh.name = `${prefix}${id}`;
      mesh.userData.cast = e.cast;
      mesh.userData.recv = e.recv;
      root.add(mesh);
    }
  }
}

/** ctx.mats.prepare（投影用的深度材质）以后，按 userData.cast / recv 设回投影、受影 */
export function finish(ctx: AssetCtx, root: THREE.Object3D) {
  ctx.mats.prepare(root);
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    if (m.userData.cast !== undefined) m.castShadow = m.userData.cast;
    if (m.userData.recv !== undefined) m.receiveShadow = m.userData.recv;
  });
}

// ── 轮廓 ───────────────────────────────────────────────────

/** 圆角矩形（逆时针看俯视的 x、z），每个角 seg 段 */
export function roundRect(x0: number, z0: number, x1: number, z1: number, r: number, seg = 5): V2[] {
  const pts: V2[] = [];
  const c: [number, number, number][] = [
    [x1 - r, z1 - r, 0],
    [x0 + r, z1 - r, Math.PI / 2],
    [x0 + r, z0 + r, Math.PI],
    [x1 - r, z0 + r, (Math.PI * 3) / 2],
  ];
  for (const [cx, cz, a0] of c)
    for (let i = 0; i <= seg; i++) {
      const a = a0 + (i / seg) * (Math.PI / 2);
      pts.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r]);
    }
  return pts;
}

/** 圆（n 段） */
export function circle(cx: number, cz: number, r: number, n = 24): V2[] {
  return Array.from({ length: n }, (_, i): V2 => {
    const a = (i / n) * Math.PI * 2;
    return [cx + Math.cos(a) * r, cz + Math.sin(a) * r];
  });
}

/** 点到折线（闭合）的最短距离 */
function distToLoop([x, z]: V2, loop: V2[]): number {
  let d = Number.POSITIVE_INFINITY;
  for (let i = 0; i < loop.length; i++) {
    const [ax, az] = loop[i];
    const [bx, bz] = loop[(i + 1) % loop.length];
    const dx = bx - ax;
    const dz = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
    d = Math.min(d, Math.hypot(x - ax - t * dx, z - az - t * dz));
  }
  return d;
}

function inside([x, z]: V2, poly: V2[]): boolean {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i];
    const [xj, zj] = poly[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c;
  }
  return c;
}

/**
 * 水面格子（朝上，y 高）：在轮廓 shore 的包围盒里铺 step 米的方格，格子的中心在 shore 往外 pad 米以内的留下
 * （边上的锯齿藏在池壁 / 压顶下面）。aElem = [往北到岸的距离 × northK, 到岸的距离]（米），toon 的 water 元素用：
 * 北岸脚下一条天光亮带、离岸远的深处是缝色。
 */
export function waterGrid(shore: V2[], y: number, step = 0.3, pad = 0.3, northK = 1): THREE.BufferGeometry {
  let x0 = Number.POSITIVE_INFINITY;
  let x1 = Number.NEGATIVE_INFINITY;
  let z0 = Number.POSITIVE_INFINITY;
  let z1 = Number.NEGATIVE_INFINITY;
  for (const [x, z] of shore) {
    x0 = Math.min(x0, x);
    x1 = Math.max(x1, x);
    z0 = Math.min(z0, z);
    z1 = Math.max(z1, z);
  }
  x0 -= pad;
  z0 -= pad;
  const nx = Math.ceil((x1 + pad - x0) / step);
  const nz = Math.ceil((z1 + pad - z0) / step);
  const pos: number[] = [];
  const el: number[] = [];
  const keepCell = (i: number, j: number) => {
    const c: V2 = [x0 + (i + 0.5) * step, z0 + (j + 0.5) * step];
    return inside(c, shore) || distToLoop(c, shore) < pad;
  };
  const attr = (x: number, z: number): [number, number] => {
    const sd = inside([x, z], shore) ? distToLoop([x, z], shore) : 0;
    // 往北走到岸的距离（步进 0.1 米）
    let nd = 0;
    while (nd < 6 && inside([x, z - nd - 0.1], shore)) nd += 0.1;
    return [nd * northK, sd];
  };
  const memo = new Map<number, [number, number]>();
  const at = (i: number, j: number) => {
    const k = j * (nx + 1) + i;
    let v = memo.get(k);
    if (!v) {
      v = attr(x0 + i * step, z0 + j * step);
      memo.set(k, v);
    }
    return v;
  };
  const vert = (i: number, j: number) => {
    pos.push(x0 + i * step, y, z0 + j * step);
    const [a, b] = at(i, j);
    el.push(a, b, 0, 0);
  };
  for (let j = 0; j < nz; j++)
    for (let i = 0; i < nx; i++) {
      if (!keepCell(i, j)) continue;
      // 逆时针（从上往下看，法线朝上）
      vert(i, j);
      vert(i, j + 1);
      vert(i + 1, j);
      vert(i + 1, j);
      vert(i, j + 1);
      vert(i + 1, j + 1);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aElem', new THREE.Float32BufferAttribute(el, 4));
  g.computeVertexNormals();
  return g;
}

/** 斜杆 / 横杆：两点之间一根方杆（粗 t） */
export function bar(a: THREE.Vector3, b: THREE.Vector3, t: number, t2 = t): THREE.BufferGeometry {
  const d = new THREE.Vector3().subVectors(b, a);
  const g = new THREE.BoxGeometry(t, d.length(), t2);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize()));
  const m = a.clone().add(b).multiplyScalar(0.5);
  g.translate(m.x, m.y, m.z);
  return g;
}

/** 放一个子物件（复用资产）：位置、朝向、缩放 */
export function place(root: THREE.Object3D, o: THREE.Object3D, x: number, z: number, ry = 0, s = 1, y = 0) {
  o.position.set(x, y, z);
  o.rotation.y = ry;
  o.scale.setScalar(s);
  root.add(o);
  return o;
}
