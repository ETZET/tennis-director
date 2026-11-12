// gym-sled · 推雪橇（B1 功能草道南头，slots-b1 的 gym-sled；推的人站在北边 −z、脸朝镜头往南推）。
// 尺寸：1.08 × 1.08 × 1.30 米（12 × 12 × 14 纹素，w × h × d）；规格 1.0 × 1.1 × 1.3。
// 一副矮的雪橇底（两条灰钢滑橇，前头上翘 + 一块橙色的底盘），正中一根挂片的短柱，上面叠三片杠铃片（红 25 / 蓝 20 / 黄 15，
//   八边形片 + 球面法线，一片比一片小）；北头两根 toolOrange 的推杆（2 纹素见方，略往后仰，顶上一截黑胶握把）。
// 元素：底盘 `paint`（漆面的深浅块，草皮上一块饱和的橙）。
// 三角形：6 个盒子 + 推杆和握把 4 个（去掉底面）× 10 + 杠铃片 3 × 24 = 172（预算 250）。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { blobNormals } from '../../clubsite/render/toon';
import type { AssetCtx } from '../ctx';

type Ramp = [number, number, number];

export function build(ctx: AssetCtx): THREE.Object3D {
  const T = ctx.texel;
  const face = { lightUp: 0.55, bands: [-0.45, 0.35] as [number, number], noShadowReceive: true, edge: 0.3 };
  const steel = ctx.mat('metal', { ...face, ramp: [0xa8baf6, 0x7686d2, 0x40449a], convex: 0.25 });
  const orange = ctx.mat('toolOrange', {
    ...face,
    ramp: [0xffa640, 0xec7838, 0x8a3858],
    convex: 0.25,
    elem: { kind: 'paint', size: [5, 3], density: [0, 0.03], patch: 1.5 },
  });
  const gripM = ctx.mat('ironwork', { ...face, ramp: [0x6c5ab0, 0x4e3e8e, 0x342a6a], convex: 0.2 });
  const plate = (key: 'clothRed' | 'clothBlue' | 'flowerYellow', ramp?: Ramp) =>
    ctx.mat(key, {
      lightUp: 0.35,
      bands: [-0.6, 0.4],
      noShadowReceive: true,
      edge: 0.3,
      convex: 0.2,
      ...(ramp ? { ramp } : {}),
    });

  const parts = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const put = (m: THREE.Material, g: THREE.BufferGeometry) => {
    const l = parts.get(m) ?? [];
    l.push(g);
    parts.set(m, l);
  };
  const geo = (w: number, h: number, d: number) => {
    const g = new THREE.BoxGeometry(w * T, h * T, d * T);
    const idx = Array.from(g.index!.array);
    idx.splice(18, 6);
    g.setIndex(idx);
    g.clearGroups();
    return g;
  };
  /** 盒子（纹素坐标的最小 / 最大），去掉底面 */
  const b = (m: THREE.Material, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number) =>
    put(m, geo(x1 - x0, y1 - y0, z1 - z0).translate(((x0 + x1) / 2) * T, ((y0 + y1) / 2) * T, ((z0 + z1) / 2) * T));
  /** 往后（−z）仰 tilt 弧度的竖杆：底面中心 (x, y, z)，w × h × d 纹素 */
  const post = (m: THREE.Material, w: number, h: number, d: number, x: number, y: number, z: number, tilt: number) =>
    put(
      m,
      geo(w, h, d)
        .translate(0, (h / 2) * T, 0)
        .rotateX(-tilt)
        .translate(x * T, y * T, z * T),
    );
  /** 平放的杠铃片：w 纹素宽的八边形（平面朝前），1 纹素厚，底在 y；去掉底面，球面法线（中心压低 → 侧面读成圆边） */
  const disc = (m: THREE.Material, w: number, y: number) => {
    const r = ((w / 2) * T) / Math.cos(Math.PI / 8);
    const g = new THREE.CylinderGeometry(r, r, T, 8, 1, false, Math.PI / 8);
    g.setIndex(Array.from(g.index!.array).slice(0, 8 * 6 + 8 * 3));
    g.clearGroups();
    g.translate(0, (y + 0.5) * T, 0);
    blobNormals(g, new THREE.Vector3(0, (y - 1.5) * T, 0));
    put(m, g);
  };

  // ── 雪橇底：两条滑橇（前头上翘）+ 橙色底盘 ──
  for (const s of [-1, 1]) {
    const [x0, x1] = s < 0 ? [-6, -4] : [4, 6];
    b(steel, x0, x1, 0, 1, -7, 6);
    b(steel, x0, x1, 0, 2, 6, 7); // 上翘的前头
  }
  b(orange, -6, 6, 1, 2, -6, 6);
  // ── 正中挂片的短柱 + 三片杠铃片（下大上小）──
  disc(plate('clothRed', [0xf4523e, 0xc42e42, 0x6a1e54]), 8, 2);
  disc(plate('clothBlue', [0x4a8af0, 0x3460c4, 0x262e7c]), 7, 3);
  disc(plate('flowerYellow'), 6, 4);
  b(steel, -1, 1, 5, 7, -1, 1);
  // ── 北头两根推杆（toolOrange，2 纹素见方，略往后仰）+ 顶上的黑胶握把 ──
  for (const x of [-5, 5]) {
    post(orange, 2, 8, 2, x, 2, -5, 0.15);
    post(gripM, 2, 2, 2, x, 2 + 8 * Math.cos(0.15), -5 - 8 * Math.sin(0.15), 0.15);
  }

  const root = new THREE.Group();
  for (const [m, gs] of parts) root.add(new THREE.Mesh(mergeGeometries(gs), m));
  ctx.mats.prepare(root);
  return root;
}
