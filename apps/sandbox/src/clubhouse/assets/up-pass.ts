// 2F 后厨靠宴会厅门的出菜架（#85）：1.6 × 1.6 × 0.5 米 = 17.6 × 17.8 × 5.5 纹素，朝南（+z 对镜头）。
// 元素：偏蓝的不锈钢。下面一截矮柜（1 行深靛踢脚 + 两扇钢蓝的柜门、各一根亮拉手），柜顶（y 0.5）是第一层出菜台；
// 两根前柱 + 深一号的背板，中间一层搁板（y 1.0）；最上面一条铜红的保温灯罩，正面一行自发光的暖黄灯带，
// 灯下那层搁板的台面染成暖桃色（被灯照着）。两层上各摆几盘菜：奶白的圆盘 + 番茄红、生菜绿、咖喱黄、三文鱼粉的菜。
// 45° 下两层台面在屏幕上几乎首尾相接，盘子都露得出来。三角形 ≈ 145（预算 300）。没有 userData。
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
  /** 顶面上的贴片（纹素；x、z 是中心） */
  const plate = (m: THREE.Material, w: number, d: number, x: number, y: number, z: number, lift = 0.004) =>
    put(m, new THREE.PlaneGeometry(w * T, d * T).rotateX(-Math.PI / 2).translate(x * T, y * T + lift, z * T));
  const disc = (m: THREE.Material, r: number, x: number, y: number, z: number, lift = 0.004) =>
    put(m, new THREE.CircleGeometry(r * T, 8).rotateX(-Math.PI / 2).translate(x * T, y * T + lift, z * T));

  const R = Math.SQRT2;
  const steel = flat('metal', [0x98c4f6, 0x7098dc, 0x445498]);
  const door = flat('metal', [0x8cb4e4, 0x6488cc, 0x3e4c8c]);
  const handle = flat('metal', [0xc4dcf4, 0x9cc0ec, 0x6478a8]);
  const kick = flat('ironwork', [0x4a4a9a, 0x3a3480, 0x262458]);
  const back = flat('metal', [0x7c9cd4, 0x5c78bc, 0x3a4688]);
  const backWarm = flat('fabricStripe', [0xe8a078, 0xb87c88, 0x6a4a80]);
  const hoodM = flat('fabricStripe', [0xf08a5c, 0xd0604c, 0x7a3a5a]);
  const glow = ctx.mat('flowerYellow', {
    ramp: [0xffe888, 0xffd868, 0xf0b850],
    emissive: 0x403010,
    noShadowReceive: true,
  });
  const warmTop = ctx.mat('canvas', { ramp: [0xf8c890, 0xd8a078, 0x8a6488], noShadowReceive: true });
  const dish = ctx.mat('clothWhite', { ramp: [0xf4ecd8, 0xd4c4c8, 0x8a7ca8], noShadowReceive: true });
  const fRed = flat('fabricStripe', [0xf4604c, 0xd8443c, 0x7a2850]);
  const fGreen = flat('clothTeal', [0x7ae060, 0x44b450, 0x22604e]);
  const fYellow = flat('flowerYellow', [0xffd858, 0xf0b040, 0x8a6058]);
  const fPink = flat('fabricStripe', [0xff9c8c, 0xe8747c, 0x8a4470]);

  const W = 17.6;
  const D = 5.5;
  const zf = D / 2;
  const Y1 = 5.5; // 柜顶（第一层台面）
  const Y2 = 11.2; // 中间搁板的台面
  const Y3 = 16; // 灯罩底
  // 矮柜
  box(kick, W - 1, R, D - 0.6, 0, 0, -0.3);
  box(steel, W, Y1 - R, D, 0, R, 0);
  for (const sx of [-1, 1]) {
    decal(door, 7.6, 2 * R, sx * 4.1, R + 0.3, zf);
    decal(handle, 3.4, 0.8, sx * 4.1, R + 0.3 + 1.5 * R, zf, 0.008);
  }
  // 背板（上半截被灯照暖）+ 前柱 + 中间搁板
  decal(back, W, Y2 - Y1, 0, Y1, -zf + 0.4);
  decal(backWarm, W, Y3 - Y2, 0, Y2, -zf + 0.4);
  for (const sx of [-1, 1]) box(steel, 1, Y3 - Y1, 1, sx * (W / 2 - 0.5), Y1, zf - 0.5);
  box(steel, W, 0.9, D, 0, Y2 - 0.9, 0);
  plate(warmTop, W - 2, D - 1, 0, Y2, 0);
  // 保温灯罩 + 灯带
  box(hoodM, W, 17.8 - Y3, D, 0, Y3, 0);
  decal(glow, W - 2, 0.9, 0, Y3, zf);
  // 盘子和菜（盘 = 贴着台面的圆片，菜 = 一小块）
  const serve = (m: THREE.Material, x: number, y: number, z: number, w = 1.7) => {
    disc(dish, 1.8, x, y, z, 0.008);
    box(m, w, 0.8, 1.5, x, y, z - 0.1);
  };
  serve(fRed, -5.4, Y1, 0.4);
  serve(fGreen, 0, Y1, -0.2, 2);
  serve(fYellow, 5.4, Y1, 0.4);
  serve(fPink, -3.2, Y2, 0.2, 2);
  serve(fGreen, 3.2, Y2, 0.2);

  const root = new THREE.Group();
  root.name = 'up-pass';
  for (const [m, gs] of bins) root.add(new THREE.Mesh(gs.length > 1 ? mergeGeometries(gs) : gs[0], m));
  ctx.mats.prepare(root);
  return root;
}
