// bld-kit：会所、球具店、咖啡车、塔可车这几件"预制房子"共用的小工具（不是设施模型：这个文件不 export build）。
// - Bins：按材质收几何体，最后每种材质合并成一个网格（手机上少几次 draw call）；
// - put：把复用的现成资产（别的场景的 build，按它自己的 Pal 写的）建出来、摆到本地坐标；
// - hipRoof / roofPlanks：四坡红瓦顶（照 clubmap2/build.ts 的 hipRoof，坡面一列列筒瓦用 planks 元素）；
// - 几个朝镜头的竖直面常用的材质参数（FACE：落中档、不接投影）；
// - iconSign：开罗式的图标招牌（咖啡杯 / 塔可 / 网球拍），每家小店一个，px 1 下认得出是哪家（美术 r1 C 条）。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Elem, ToonOpts } from '../../clubsite/render/toon';
import type { AssetBuild, AssetCtx } from '../ctx';
import type { Pal } from '../palette';

type G = THREE.BufferGeometry;
export type Key = keyof Pal;

/** 朝镜头的竖直面（太阳在画面后方）：往上偏光 + 低阈值 → 落中档；小件不接投影 */
export const FACE: ToonOpts = { lightUp: 0.55, bands: [-0.45, 0.35], noShadowReceive: true };
/** 大墙面：同样落中档，但接投影（钟楼、屋檐的影子落在墙上） */
export const WALL: ToonOpts = { lightUp: 0.55, bands: [-0.45, 0.35] };

/** 都转成 non-indexed、只留 position / normal / uv，好合并 */
function clean(g0: G): G {
  const g = g0.index ? g0.toNonIndexed() : g0;
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.attributes.uv)
    g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  return g;
}

/** 按（材质名 + 参数标签）收几何体，build 时每组合并成一个网格 */
export class Bins {
  private m = new Map<string, { key: Key; opts?: ToonOpts; geos: G[]; cast: boolean }>();
  constructor(private ctx: AssetCtx) {}
  add(key: Key, g: G, opts?: ToonOpts, tag = '', cast = true) {
    const id = `${key}|${tag}`;
    let e = this.m.get(id);
    if (!e) {
      e = { key, opts, geos: [], cast };
      this.m.set(id, e);
    }
    e.geos.push(clean(g));
  }
  /** 合并、建网格、prepare（投影按 add 的 cast），挂到 root 下面的一个组里 */
  build(root: THREE.Object3D, name: string): THREE.Group {
    const grp = new THREE.Group();
    grp.name = name;
    const casts: [THREE.Mesh, boolean][] = [];
    for (const [id, e] of this.m) {
      const geo = mergeGeometries(e.geos);
      if (!geo) throw new Error(`${name}: merge failed (${id})`);
      const mesh = new THREE.Mesh(geo, this.ctx.mat(e.key, e.opts));
      mesh.name = `${name}:${id}`;
      grp.add(mesh);
      casts.push([mesh, e.cast]);
    }
    this.ctx.mats.prepare(grp);
    for (const [mesh, c] of casts) mesh.castShadow = c;
    root.add(grp);
    return grp;
  }
}

/** 盒子：中心 x、z，底在 y */
export const bx = (w: number, h: number, d: number, x: number, y: number, z: number): G =>
  new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z);

/** 朝 +z 的薄片：左下角 (x0, y0)，宽 w、高 h，在 z */
export const faceZ = (x0: number, y0: number, w: number, h: number, z: number): G =>
  new THREE.PlaneGeometry(w, h).translate(x0 + w / 2, y0 + h / 2, z);

/** 水平矩形（y 高） */
export const flat = (x0: number, x1: number, z0: number, z1: number, y: number): G =>
  new THREE.PlaneGeometry(x1 - x0, z1 - z0).rotateX(-Math.PI / 2).translate((x0 + x1) / 2, y, (z0 + z1) / 2);

/** 朝 +z 的半圆拱洞（拱脚宽 w、拱脚高 y0、圆心在 x），一块扇形片，在 z */
export function archFace(x: number, y0: number, w: number, h: number, z: number, seg = 8): G {
  const s = new THREE.Shape();
  const r = w / 2;
  s.moveTo(x - r, y0);
  s.lineTo(x + r, y0);
  s.lineTo(x + r, y0 + h - r);
  s.absarc(x, y0 + h - r, r, 0, Math.PI, false);
  s.lineTo(x - r, y0);
  return new THREE.ShapeGeometry(s, seg).translate(0, 0, z);
}

/** 复用资产：建出来、摆好（本地 x, y, z，绕 y 转 ry，缩放 s）。build 是别的场景按自己 Pal 写的，这里的 Pal 是超集 */
export function put(
  ctx: AssetCtx,
  root: THREE.Object3D,
  build: unknown,
  x: number,
  y: number,
  z: number,
  ry = 0,
  s = 1,
  variant = ctx.variant,
): THREE.Object3D {
  const o = (build as AssetBuild)({ ...ctx, variant });
  o.position.set(x, y, z);
  o.rotation.y = ry;
  o.scale.setScalar(s);
  root.add(o);
  return o;
}

/**
 * 四坡屋顶：底在 y，高 h，四边出檐 over；屋脊沿长边（照 clubmap2/build.ts 的 hipRoof）。
 * 返回 [朝 ±z 的坡, 朝 ±x 的坡] 两块：筒瓦一列列顺着坡往下，两块的 planks 方向不一样（roofPlanks('x') / roofPlanks('z')）。
 */
export function hipRoof(x0: number, x1: number, z0: number, z1: number, y: number, h: number, over = 0.3): [G, G] {
  x0 -= over;
  x1 += over;
  z0 -= over;
  z1 += over;
  const w = x1 - x0;
  const d = z1 - z0;
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  const P = (x: number, yy: number, z: number) => new THREE.Vector3(x, yy, z);
  const a = P(x0, y, z0);
  const b = P(x1, y, z0);
  const c = P(x1, y, z1);
  const dd = P(x0, y, z1);
  const r0 = w >= d ? P(x0 + d / 2, y + h, cz) : P(cx, y + h, z0 + w / 2);
  const r1 = w >= d ? P(x1 - d / 2, y + h, cz) : P(cx, y + h, z1 - w / 2);
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
  const posZ: number[] = [];
  const posX: number[] = [];
  for (const t of tris) {
    const n = new THREE.Vector3().subVectors(t[1], t[0]).cross(new THREE.Vector3().subVectors(t[2], t[0]));
    const tt = n.y < 0 ? [t[0], t[2], t[1]] : t;
    const to = Math.abs(n.z) >= Math.abs(n.x) ? posZ : posX;
    for (const v of tt) to.push(v.x, v.y, v.z);
  }
  const mk = (pos: number[]) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    return g;
  };
  return [mk(posZ), mk(posX)];
}

/**
 * 红瓦的元素：坡面上一列列筒瓦（每 w 米一列，缝后一纹素亮条；同 clubhouse/terrain.ts 的 roofTile）。
 * axis 'x' = 列沿 x 排（朝 ±z 的坡），'z' = 列沿 z 排（朝 ±x 的坡）。
 */
export const roofPlanks = (axis: 'x' | 'z' = 'x', w = 0.4): Elem => ({
  kind: 'planks',
  space: 'local',
  seam: 1,
  hi: 1,
  p: axis === 'x' ? [1, 0, 0, w] : [0, 0, 1, w],
  q: [1, 0, 0, 0],
});

/** 加一块四坡红瓦顶（两块坡各配自己方向的筒瓦）；opts = 别的材质参数（往上偏光之类） */
export function addRoof(
  B: Bins,
  r: [number, number, number, number],
  y: number,
  h: number,
  over: number,
  opts: ToonOpts = {},
  key: Key = 'roofTile',
) {
  const [gz, gx] = hipRoof(r[0], r[1], r[2], r[3], y, h, over);
  B.add(key, gz, { ...opts, elem: roofPlanks('x') }, 'roofZ');
  B.add(key, gx, { ...opts, elem: roofPlanks('z') }, 'roofX');
}

/** 包围盒（调试 / 摆放用） */
export function bboxOf(o: THREE.Object3D): THREE.Box3 {
  o.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(o);
}

/** 招牌图标的种类：咖啡杯、塔可、网球拍 */
export type IconKind = 'cup' | 'taco' | 'racket';

/**
 * 开罗式的图标招牌（美术 r1 C 条）：一块 2.4 × 1.6 米的彩色底板 + 一个粗体图标（最小特征 ≥ 0.3 米 = 2 纹素），
 * 往后仰 tilt（默认 0.45 弧度，朝镜头多一点），0.149 米/纹素下 ≈ 16 × 9 纹素，眯眼认得出是哪家店。
 * 本地原点 = 底板下沿中点（y 往上），底板朝 +z。底板 / 图标都不接投影，落中/亮档（lightUp + 低阈值）。
 */
export function iconSign(ctx: AssetCtx, kind: IconKind, tilt = 0.45): THREE.Group {
  const g = new THREE.Group();
  g.name = `icon-sign:${kind}`;
  const B = new Bins(ctx);
  const W = 2.4;
  const H = 1.6;
  const LIT: ToonOpts = { lightUp: 0.8, bands: [-0.8, -0.35], noShadowReceive: true, edge: 0.5, convex: 0.2 };
  const board: Key = kind === 'cup' ? 'carMint' : kind === 'taco' ? 'clothRed' : 'counter';
  B.add(board, bx(W, H, 0.16, 0, 0, 0), LIT, 'board');
  // 白边框（0.16 米 ≈ 1 纹素的亮边，底板的轮廓）
  B.add('clothWhite', bx(W + 0.2, 0.16, 0.12, 0, H, 0), LIT, 'rim');
  const z = 0.1;
  const cy = H / 2;
  if (kind === 'cup') {
    // 白杯子（0.9 × 0.85）+ 右边把手 + 杯口一条咖啡色 + 下面的碟
    B.add('clothWhite', bx(0.9, 0.85, 0.08, -0.15, cy - 0.5, z), LIT, 'icon');
    B.add('clothWhite', bx(0.3, 0.45, 0.08, 0.45, cy - 0.3, z), LIT, 'icon');
    B.add('timber', bx(0.9, 0.18, 0.1, -0.15, cy + 0.17, z), LIT, 'icon2');
    B.add('clothWhite', bx(1.5, 0.16, 0.08, -0.05, cy - 0.66, z), LIT, 'icon');
  } else if (kind === 'taco') {
    // 黄色半圆的饼（朝上的圆弧）+ 弧顶一圈绿生菜、两点红番茄
    const s = new THREE.Shape();
    s.absarc(0, 0, 0.85, 0, Math.PI, false);
    s.lineTo(0.85, 0);
    const half = new THREE.ShapeGeometry(s, 8).translate(0, cy - 0.45, z);
    const lettuce = new THREE.ShapeGeometry(
      new THREE.Shape().absarc(0, 0, 0.62, 0.15, Math.PI - 0.15, false).lineTo(0, 0),
      8,
    ).translate(0, cy - 0.25, z - 0.02);
    B.add('lawnStripe', lettuce, LIT, 'icon2');
    B.add('flowerYellow', half, LIT, 'icon');
    B.add('clothRed', bx(0.26, 0.22, 0.08, -0.3, cy + 0.12, z - 0.01), LIT, 'icon3');
    B.add('clothRed', bx(0.26, 0.22, 0.08, 0.25, cy + 0.18, z - 0.01), LIT, 'icon3');
  } else {
    // 网球拍：黄色椭圆拍框（粗 0.2）+ 拍柄 + 一个网球
    const ring = new THREE.TorusGeometry(0.4, 0.11, 4, 12).scale(0.9, 1.15, 0.5).translate(-0.3, cy + 0.15, z);
    B.add('flowerYellow', ring, LIT, 'icon');
    B.add('flowerYellow', bx(0.2, 0.5, 0.08, -0.3, cy - 0.85, z).rotateZ(0), LIT, 'icon');
    B.add('clothWhite', bx(0.2, 0.18, 0.08, -0.3, cy - 0.85, z + 0.02), LIT, 'icon2');
    B.add('ball', new THREE.IcosahedronGeometry(0.24, 1).translate(0.65, cy - 0.3, z + 0.05), LIT, 'ball');
  }
  B.build(g, `icon-sign:${kind}`);
  g.rotation.x = -tilt;
  return g;
}
