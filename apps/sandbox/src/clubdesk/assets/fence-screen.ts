// fence-screen：球场围网 + 深绿挡风布（clubdesk 的匹克球四边、西边两片场的北边）。规格见 docs/lab/2026-11-07-3d-pixel/clubdesk.md #8。
// 不画网眼。从上往下：顶杆（metal，顶面一条亮线）→ 顶杆下面露一窄条铁丝网（ironwork 暗条，代表网）→ 挡风布的包边
// （1 纹素亮边）沿绑带一兜一兜地往下垂（每 ~1 米一兜，兜底比绑带低 1～2 行：布是挂上去的，不是贴上去的）→
// 挡风布（windscreen，planks：每 ~2.65 米一幅、每幅一个深浅、1 纹素接缝 + 缝后一纹素断续亮条）→ 贴地一根底杆。
// 柱子 2 设计纹素（metal），每段两头 + 中间不超过 4 米一根。朝镜头的竖直面 lightUp + 低 bands（太阳在画面后方）。
//
// 两种用法：
// 1. 画廊 / SLOTS：`build(ctx)` = 一段沿本地 x 的围网，原点在中点，布朝 +z。
//    v0 = 8 米匹克球（2.2 米高），v1 = 8 米网球（2.6 米），v2 = 8 米匹克球、中间留 3 米的门；
//    画廊里可以用 `&flen=<米>&fh=<米>` 改长度和高度。返回对象的 userData.fence = { len, h }。
//    放在 SLOTS 里时，沿 x 以外的方向用 rotY 转；不同长度建议用 buildFences（scale.x 会把柱子、接缝一起拉宽）。
// 2. 地形一次建好整圈（推荐：所有段合并成每种材质一个网格，4 次 draw call）：`buildFences(ctx, runs)`，
//    runs 是世界坐标的直线段（任意方向；yaw 0 下南北走向的段侧对镜头，只露柱顶、顶杆和包边的顶面），
//    门用 `door: { at, gap }`（离起点多少米、口子多宽）。返回的对象放在原点、不要再平移。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { ToonOpts } from '../../clubsite/render/toon';
import type { AssetCtx } from '../ctx';

/** 一段围网（米）：从 (x0, z0) 到 (x1, z1)，高 h；door = 离起点 at 米处留 gap 米宽的口子 */
export interface FenceRun {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  h: number;
  door?: { at: number; gap: number };
}

const POST = 0.18; // 柱 2 设计纹素
const RAIL = 0.18; // 顶杆高 2 纹素
const RAIL_D = 0.12;
const BOT = 0.09; // 底杆高 1 纹素（盖住布脚下那一行亮地：阴影贴图在竖直面脚下会漏一行光）
const BOT_D = 0.16;
const POST_GAP = 4.0; // 柱距上限
const PANEL = 2.65; // 一幅布宽（planks，按世界 x 排）
const HEM = 0.09; // 包边 1 纹素
const SWAG = 1.0; // 绑带间距（一兜多宽）
const SAG = 0.1; // 一兜往下垂多少
const STEP = 1 / 4; // 每兜切几段
const BELLY = 0.12; // 每兜下面布往外鼓多少（鼓包的下半朝下 → 一道暗的弯，读成挂着的布）

export function build(ctx: AssetCtx): THREE.Object3D {
  const v = ctx.variant;
  const len = Number(ctx.params.get('flen') ?? 8);
  const h = Number(ctx.params.get('fh') ?? (v === 1 ? 2.6 : 2.2));
  const run: FenceRun = { x0: -len / 2, z0: 0, x1: len / 2, z1: 0, h };
  if (v === 2) run.door = { at: len / 2, gap: 3 };
  const g = buildFences(ctx, [run]);
  g.userData.fence = { len, h };
  return g;
}

/** 好几段围网合成一个对象：挡风布、包边、铁丝网、钢构各一个网格 */
export function buildFences(ctx: AssetCtx, runs: FenceRun[]): THREE.Object3D {
  const g = new THREE.Group();
  g.name = 'fence-screen';
  const rnd = ctx.rng('fence-screen:swag');
  const cloth: THREE.BufferGeometry[] = [];
  const hems: THREE.BufferGeometry[] = [];
  const mesh: THREE.BufferGeometry[] = [];
  const steel: THREE.BufferGeometry[] = [];

  for (const r of runs) {
    const dx = r.x1 - r.x0;
    const dz = r.z1 - r.z0;
    const L = Math.hypot(dx, dz);
    if (L < 0.3) continue;
    // 段的本地系：u 沿段（0..L），n 水平、朝 +z 那边（yaw 0 下就是朝镜头；南北段朝 +x）
    const ux = dx / L;
    const uz = dz / L;
    let nx = -uz;
    let nz = ux;
    if (nz < -1e-6 || (Math.abs(nz) < 1e-6 && nx < 0)) {
      nx = -nx;
      nz = -nz;
    }
    const at: At = (u, y, off) => [r.x0 + ux * u + nx * off, y, r.z0 + uz * u + nz * off];
    const f: Frame = { at, ux, uz, nx, nz };
    const pieces: [number, number][] = r.door
      ? [
          [0, r.door.at - r.door.gap / 2],
          [r.door.at + r.door.gap / 2, L],
        ]
      : [[0, L]];
    for (const [a, b] of pieces) {
      const pl = b - a;
      if (pl < 0.3) continue;
      // 柱：两头 + 中间按柱距均分；顶杆、底杆
      const np = Math.max(1, Math.ceil(pl / POST_GAP));
      for (let i = 0; i <= np; i++) steel.push(box(f, a + (pl * i) / np, 0, POST, r.h, POST));
      steel.push(box(f, (a + b) / 2, r.h - RAIL, pl + POST, RAIL, RAIL_D));
      steel.push(box(f, (a + b) / 2, 0, pl, BOT, BOT_D));

      // 包边的顶：绑带处贴着顶杆下沿，两根绑带之间往下兜（抛物线）
      const top = r.h - RAIL - 0.01;
      const ns = Math.max(1, Math.round(pl / SWAG));
      // 每一兜自己垂多少、鼓多少（一样的话一排齐刷刷的弯 = 图案）：有的几乎拉平，有的兜得深
      const sag: number[] = [];
      const belly: number[] = [];
      for (let i = 0; i < ns; i++) {
        sag.push(SAG * (0.5 + rnd()));
        belly.push(rnd() < 0.35 ? 0 : BELLY * (0.7 + 0.6 * rnd()));
      }
      const swagOf = (u: number) => Math.min(ns - 1, Math.max(0, Math.floor(((u - a) / pl) * ns)));
      const yTop = (u: number) => {
        const q = ((u - a) / pl) * ns;
        const s = q - Math.min(ns - 1, Math.floor(q));
        return top - sag[swagOf(u)] * 4 * s * (1 - s);
      };
      const us: number[] = [];
      const nu = Math.ceil(ns / STEP);
      for (let i = 0; i <= nu; i++) us.push(a + (pl * i) / nu);
      cloth.push(
        drape(
          f,
          us,
          a,
          ns / pl,
          (u) => belly[swagOf(u)],
          BOT * 0.5,
          (u) => yTop(u) - HEM,
        ),
      );
      hems.push(sheet(f, us, (u) => yTop(u) - HEM, yTop, 0.02, true));
      // 顶杆下面那条铁丝网（在布后面，兜下去的地方露出来）
      mesh.push(
        sheet(
          f,
          [a, b],
          () => top - SAG * 1.5 - HEM,
          () => r.h - RAIL,
          -0.03,
        ),
      );
    }
  }

  // 挡风布：朝镜头的竖直面 → lightUp + 低 bands（落中档）；幅 = planks（沿世界 x；南北段侧对镜头看不到面）
  const clothOpts: ToonOpts = {
    side: THREE.DoubleSide,
    lightUp: 0.6,
    bands: [-0.3, 0.45],
    elem: { kind: 'planks', space: 'local', p: [1, 0, 0, PANEL], q: [1, 0, 0, 0], seam: 1, hi: 1 },
    toneW: [0.3, 0.3],
  };
  add(g, cloth, ctx.mat('windscreen', clothOpts), 'windscreen');
  // 包边：永远落亮档（一行亮边）
  add(g, hems, ctx.mat('windscreen', { side: THREE.DoubleSide, lightUp: 1, bands: [-1, -0.5] }), 'hem');
  const meshOpts: ToonOpts = { side: THREE.DoubleSide, lightUp: 0.6, bands: [-0.3, 0.45], noShadowReceive: true };
  add(g, mesh, ctx.mat('ironwork', meshOpts), 'mesh');
  add(g, steel, ctx.mat('metal', { lightUp: 0.5, bands: [-0.3, 0.45], noShadowReceive: true }), 'steel');
  ctx.mats.prepare(g);
  return g;
}

type At = (u: number, y: number, off: number) => [number, number, number];
interface Frame {
  at: At;
  ux: number;
  uz: number;
  nx: number;
  nz: number;
}

/**
 * 挡风布：一张竖直的网格，每一兜下面往外鼓一道（sin(πs) × 竖向一个包，包在布高的 B0..B1 之间，离包边隔开几行）：
 * 包的下半朝下 → 暗档的一道弯 = 一道褶（上半朝上仍在中档：亮的弯试过，读成一团团亮斑）；法线解析地算。
 * 布的其余部分平（中档 + planks 的幅）。
 */
function drape(
  f: Frame,
  us: number[],
  a: number,
  rate: number,
  bellyAt: (u: number) => number,
  y0: number,
  y1: (u: number) => number,
): THREE.BufferGeometry {
  const B0 = 0.5;
  const B1 = 0.86;
  const T = [0, B0, 0.62, 0.74, B1, 1];
  const pos: number[] = [];
  const nor: number[] = [];
  const idx: number[] = [];
  const up = new THREE.Vector3();
  for (const t of T)
    for (const u of us) {
      const q = (u - a) * rate; // 第几兜（小数部分 = 兜里的位置）
      const s = q - Math.floor(q);
      const B = bellyAt(u);
      const amp = B * Math.sin(Math.PI * s);
      const H = y1(u) - y0;
      const inB = t > B0 && t < B1;
      const k = inB ? (t - B0) / (B1 - B0) : 0;
      const g = Math.sin(Math.PI * k);
      const off = amp * g;
      pos.push(...f.at(u, y0 + H * t, off));
      const dY = inB ? (amp * (Math.PI / (B1 - B0)) * Math.cos(Math.PI * k)) / H : 0;
      const dU = B * Math.PI * Math.cos(Math.PI * s) * g * rate;
      up.set(f.nx - dU * f.ux, -dY, f.nz - dU * f.uz).normalize();
      nor.push(up.x, up.y, up.z);
    }
  const row = us.length;
  for (let j = 0; j < T.length - 1; j++)
    for (let i = 0; i < row - 1; i++) {
      const p = j * row + i;
      idx.push(p, p + 1, p + row, p + row, p + 1, p + row + 1);
    }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setIndex(idx);
  return geo;
}

/** 一张竖直的带子：沿 us 排列，每列从 y0(u) 到 y1(u)，离段中线 off（朝 n）；withTop = 加一个朝上的顶面（南北段从上面看是一条线） */
function sheet(
  f: Frame,
  us: number[],
  y0: (u: number) => number,
  y1: (u: number) => number,
  off: number,
  withTop = false,
): THREE.BufferGeometry {
  const pos: number[] = [];
  const nor: number[] = [];
  const idx: number[] = [];
  for (const u of us) {
    pos.push(...f.at(u, y0(u), off), ...f.at(u, y1(u), off));
    nor.push(f.nx, 0, f.nz, f.nx, 0, f.nz);
  }
  for (let i = 0; i < us.length - 1; i++) {
    const p = i * 2;
    idx.push(p, p + 2, p + 1, p + 1, p + 2, p + 3);
  }
  if (withTop) {
    const base = pos.length / 3;
    const T = 0.03;
    for (const u of us) {
      pos.push(...f.at(u, y1(u), off + T), ...f.at(u, y1(u), off - T));
      nor.push(0, 1, 0, 0, 1, 0);
    }
    for (let i = 0; i < us.length - 1; i++) {
      const p = base + i * 2;
      idx.push(p, p + 2, p + 1, p + 1, p + 2, p + 3);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setIndex(idx);
  return geo;
}

/** 沿段摆的盒子：在 u 处、底 y，宽 w 沿段、高 h、深 d 沿法线 */
function box(f: Frame, u: number, y: number, w: number, h: number, d: number) {
  const geo = new THREE.BoxGeometry(w, h, d);
  geo.translate(0, h / 2, 0);
  geo.rotateY(-Math.atan2(f.uz, f.ux));
  const [x, , z] = f.at(u, 0, 0);
  geo.translate(x, y, z);
  return geo;
}

function add(g: THREE.Group, geos: THREE.BufferGeometry[], m: THREE.Material, name: string) {
  if (!geos.length) return;
  const norm = geos.map((x) => {
    const y = x.index ? x.toNonIndexed() : x;
    for (const k of Object.keys(y.attributes)) if (k !== 'position' && k !== 'normal') y.deleteAttribute(k);
    y.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(y.getAttribute('position').count * 2), 2));
    return y;
  });
  const mesh = new THREE.Mesh(mergeGeometries(norm), m);
  mesh.name = name;
  g.add(mesh);
}
