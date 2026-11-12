// 信号道具：备餐台上一摞没洗的脏锅（#86，"该洗了"）：0.84 × 0.39 × 0.5 米 ≈ 9 × 4 × 5.5 纹素；本地 y 0 = 台面（场景里 y +0.9）。
// 西边一只深靛的铸铁平底锅（柄朝西伸出去），锅里摞着一只深色的汤锅（锅里一圈橙棕的剩酱，斜插一把木勺）；
// 东边一只铜煎锅斜靠在上面，柄翘向东上方。到处是脏的：锅里棕色的油渍，锅沿和台面上几团浅青的洗洁精泡沫。
// 深色的锅 + 伸出来的柄 + 泡沫，一眼是"脏锅堆"。全部不接投影。三角形 ≈ 170（预算 200）。没有 userData。
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
  const disc = (m: THREE.Material, r: number, x: number, y: number, z: number, lift = 0.004) =>
    put(m, new THREE.CircleGeometry(r * T, 8).rotateX(-Math.PI / 2).translate(x * T, y * T + lift, z * T));
  /** 锅 / 碗：不建底的圆柱 + 沿 + 里面的东西（圆片） */
  const pot = (m: THREE.Material, inside: THREE.Material, r: number, h: number, x: number, y: number, z: number) => {
    put(m, new THREE.CylinderGeometry(r * T, r * T, h * T, 8, 1, true).translate(x * T, (y + h / 2) * T, z * T));
    disc(m, r, x, y + h, z, 0);
    disc(inside, r - 0.5, x, y + h, z);
  };

  const iron = flat('ironwork', [0x7070b8, 0x54509c, 0x322e68]);
  const pan2 = flat('ironwork', [0x6068a8, 0x464890, 0x2a2a60]);
  const copper = flat('fabricStripe', [0xe88c5c, 0xc06848, 0x7a3a5a]);
  const grime = ctx.mat('timber', { ramp: [0xa87048, 0x885444, 0x4e3054], noShadowReceive: true });
  const sauce = ctx.mat('toolOrange', { ramp: [0xe89040, 0xc87038, 0x7a3456], noShadowReceive: true });
  const suds = flat('jug', [0xc8f0f0, 0xa0d4e8, 0x6890c0], { bands: [-0.9, -0.6] });
  const spoon = flat('canvas', [0xeebc7c, 0xc88a64, 0x7a5a84]);

  // 铸铁平底锅 + 柄（朝西）
  pot(iron, grime, 2.3, 0.9, -0.9, 0, 0);
  box(iron, 1.5, 0.6, 0.9, -3.6, 0.3, 0.2, [NY]);
  // 摞在里面的汤锅 + 两只耳 + 斜插的木勺
  pot(pan2, sauce, 1.7, 1.7, -1.2, 0.9, -0.4);
  box(pan2, 4.4, 0.5, 0.8, -1.2, 2.0, -0.4, [NY]);
  put(spoon, new THREE.BoxGeometry(0.7 * T, 2.6 * T, 0.7 * T).rotateZ(0.5).translate(-1.9 * T, 3.0 * T, -0.4 * T));
  // 斜靠着的铜煎锅（柄翘向东上方）
  {
    const gs: G[] = [
      new THREE.CylinderGeometry(1.6 * T, 1.6 * T, 0.8 * T, 8, 1, true),
      new THREE.CircleGeometry(1.6 * T, 8).rotateX(-Math.PI / 2).translate(0, 0.4 * T, 0),
      new THREE.BoxGeometry(1.9 * T, 0.5 * T, 0.8 * T).translate(2.4 * T, 0.1 * T, 0),
    ];
    for (const g of gs) put(copper, g.rotateZ(0.42).translate(1.9 * T, 1.1 * T, 0.7 * T));
    put(
      grime,
      new THREE.CircleGeometry(1.1 * T, 8)
        .rotateX(-Math.PI / 2)
        .translate(0, 0.4 * T + 0.004, 0)
        .rotateZ(0.42)
        .translate(1.9 * T, 1.1 * T, 0.7 * T),
    );
  }
  // 泡沫：汤锅沿上一团、铜锅脚下一团、台面前沿一滩
  box(suds, 1.5, 0.7, 1.2, -2.3, 2.6, 0.7);
  box(suds, 1.3, 0.8, 1.1, 0.6, 0.9, 1.5);
  disc(suds, 1.0, -0.2, 0, 2.2);

  const root = new THREE.Group();
  root.name = 'up-dirty-pans';
  for (const [m, gs] of bins) root.add(new THREE.Mesh(gs.length > 1 ? mergeGeometries(gs) : gs[0], m));
  ctx.mats.prepare(root);
  return root;
}
