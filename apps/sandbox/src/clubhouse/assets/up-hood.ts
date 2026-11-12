// 2F 后厨灶台上面挂着的油烟罩（#84）：2.97 × 0.57 × 0.72 米 = 33 × 4.5 行 × 8 纹素；本地 y 0 = 罩子的下沿（场景里挂在离地 1.9 米）。
// 元素：偏蓝的不锈钢。最下面 1 行的罩唇，正面是一条深靛的滤网带（三段，中间隔 1 纹素的钢）；上面 1.5 行的斜罩（顶比底窄、前脸往后收，
// 斜面朝天吃亮档）；罩顶偏东一根方的排烟管往上 2 行，管脚一圈铜箍。罩唇东头一盏橙色的运行灯。
// 0.7 米深、贴着北墙，45° 下只挡墙，不挡灶面。三角形 ≈ 40（预算 200）。没有 userData。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { AssetCtx } from '../ctx';

type G = THREE.BufferGeometry;
type C3 = [number, number, number];
const FACE = { lightUp: 0.55, bands: [-0.45, 0.35] as [number, number], noShadowReceive: true };
/** BoxGeometry 的面序：+x −x +y −y +z −z */
const NY = 3;
const NZ = 5;

export function build(ctx: AssetCtx): THREE.Object3D {
  const T = ctx.texel;
  const bins = new Map<THREE.Material, G[]>();
  const put = (m: THREE.Material, g: G) => {
    const a = bins.get(m);
    if (a) a.push(g);
    else bins.set(m, [g]);
  };
  /** 去掉朝下、朝北的面（镜头在南上方，看不见） */
  const trim = (g: THREE.BoxGeometry, drop: number[]) => {
    const src = g.getIndex()!.array;
    const keep: number[] = [];
    for (let f = 0; f < 6; f++) if (!drop.includes(f)) for (let i = 0; i < 6; i++) keep.push(src[f * 6 + i]);
    g.setIndex(keep);
    g.clearGroups();
    return g;
  };
  /** 盒子（纹素；x、z 是中心，y 是底） */
  const box = (
    m: THREE.Material,
    w: number,
    h: number,
    d: number,
    x: number,
    y: number,
    z: number,
    drop: number[] = [NY, NZ],
  ) => put(m, trim(new THREE.BoxGeometry(w * T, h * T, d * T), drop).translate(x * T, (y + h / 2) * T, z * T));
  const flat = (key: Parameters<AssetCtx['mat']>[0], ramp: C3, extra: object = {}) =>
    ctx.mat(key, { ...FACE, ramp, convex: 0.3, ...extra });
  /** 正面上的贴片（纹素；x 是中心、y 是底） */
  const decal = (m: THREE.Material, w: number, h: number, x: number, y: number, z: number, lift = 0.004) =>
    put(m, new THREE.PlaneGeometry(w * T, h * T).translate(x * T, (y + h / 2) * T, z * T + lift));

  const R = Math.SQRT2;
  const steel = flat('metal', [0xa4ccf8, 0x7ca4e4, 0x4a5a9c]);
  const slope = flat('metal', [0x80b0ee, 0x6890d8, 0x3e4c90], { bands: [-0.9, -0.6] });
  const filter = flat('ironwork', [0x5a64b4, 0x4a52a0, 0x2a2c68]);
  const duct = flat('metal', [0x8cb8f0, 0x6488d0, 0x3e4c8c]);
  const copper = flat('fabricStripe', [0xf09a64, 0xd0704c, 0x7a3a5a]);
  const lamp = ctx.mat('toolOrange', {
    ramp: [0xffb048, 0xff9438, 0xe06830],
    emissive: 0x401808,
    noShadowReceive: true,
  });

  const W = 33;
  const D = 8;
  const zf = D / 2;
  // 罩唇（1 行）+ 滤网带
  box(steel, W, R, D, 0, 0, 0);
  for (let i = 0; i < 3; i++) decal(filter, 9, R * 0.8, -10 + i * 10, 0.1 * R, zf);
  decal(lamp, 1.5, R * 0.8, 15.2, 0.1 * R, zf, 0.008);
  // 斜罩：盒子的顶收窄、前脸往后收
  {
    const h = 1.5 * R;
    const g = new THREE.BoxGeometry(W * T, h * T, D * T);
    const p = g.getAttribute('position');
    for (let i = 0; i < p.count; i++) {
      if (p.getY(i) > 0) {
        p.setX(i, p.getX(i) * (27 / W));
        if (p.getZ(i) > 0) p.setZ(i, 0.5 * T);
      }
    }
    g.computeVertexNormals();
    put(slope, trim(g, [NY, NZ]).translate(0, (R + h / 2) * T, 0));
  }
  // 排烟管 + 铜箍
  box(copper, 7, 0.7, 4.4, 6, 2.5 * R, -1.6);
  box(duct, 6, 2 * R, 3.6, 6, 2.5 * R, -1.8);

  const root = new THREE.Group();
  root.name = 'up-hood';
  for (const [m, gs] of bins) root.add(new THREE.Mesh(gs.length > 1 ? mergeGeometries(gs) : gs[0], m));
  ctx.mats.prepare(root);
  return root;
}
