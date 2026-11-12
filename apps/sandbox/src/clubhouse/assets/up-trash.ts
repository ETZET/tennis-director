// 2F 后厨东南角的垃圾桶（#87，满了走货梯）：0.63 × 0.98 × 0.66 米 = 6.6 × 10.8 × 7 纹素，和后门边那排带轮桶（shop-trash-bins）一家的绿。
// 元素：绿桶身 5 行（正面中档；脚下一行暗的轮子 / 底座带，正面一张浅一号的分类贴），桶口翻出来一圈浅紫的垃圾袋边，
// 袋子鼓出桶口一截（装满了）；桶盖同色更亮，后沿是铰链、前沿翘起来（盖不上），盖子和桶口之间露着袋子。
// 三角形 ≈ 40（预算 150）。没有 userData。
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
  const body = flat('clothTeal', [0x4ac868, 0x22a04c, 0x1e5a4a]);
  const lid = flat('clothTeal', [0x6ae068, 0x38b458, 0x22604e]);
  const sticker = flat('clothTeal', [0xa8e8a0, 0x6ac080, 0x2e6a5a]);
  const kick = flat('ironwork', [0x5a5a8a, 0x3e3c6a, 0x26244a]);
  const bag = flat('clothBlue', [0xc8c0f4, 0xa094e0, 0x5a4a98]);

  const W = 6.6;
  const H = 5 * R;
  const zf = W / 2;
  box(body, W, H, W, 0, 0, 0);
  decal(kick, W, R, 0, 0, zf);
  decal(sticker, 3.4, R, 0, 2 * R, zf);
  // 翻出来的袋边（比桶身大半纹素的一圈）+ 鼓出来的袋子
  box(bag, W + 0.4, 0.9, W + 0.4, 0, H - 0.9, 0);
  box(bag, 5.2, 1.6, 5.2, 0, H, 0);
  // 桶盖：绕后沿翘起 ≈ 20°
  put(
    lid,
    new THREE.BoxGeometry((W + 0.4) * T, 0.9 * T, (W + 0.4) * T)
      .translate(0, 0.45 * T, ((W + 0.4) / 2) * T)
      .rotateX(-0.36)
      .translate(0, (H + 0.5) * T, (-(W + 0.4) / 2) * T),
  );

  const root = new THREE.Group();
  root.name = 'up-trash';
  for (const [m, gs] of bins) root.add(new THREE.Mesh(gs.length > 1 ? mergeGeometries(gs) : gs[0], m));
  ctx.mats.prepare(root);
  return root;
}
