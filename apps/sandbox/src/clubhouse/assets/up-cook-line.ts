// 2F 后厨北墙的一排灶台（#83）：3.24 × 0.95 × 0.81 米 = 36 × 7.5 行 × 9 纹素（锅和后面的瓷砖挡板到 1.26 米），朝南（+z 对镜头）。
// 从西往东三台各 12 纹素宽：两台带烤箱的灶（西边那台烤箱亮着橙色的火光）+ 一台煎板 / 炸炉。
// 元素：偏蓝的不锈钢机身（正面中档、顶面亮档）+ 1 行深靛踢脚；烤箱门（深一号的钢蓝）上一扇玻璃窗、门上一根亮的拉手；
// 最上面一行深色的控制条，上面一排番茄红的旋钮（炸炉那台是橙的）。灶面是石板蓝的炉盘，上面：番茄红的汤锅（橙色的汤）、
// 铜煎锅（煎蛋黄）、蓝搪瓷锅（带盖、红钮）、铜炒锅（一锅青菜）；煎板是暖棕的铁板 + 三块肉饼一片芝士，炸炉两格金黄的油。
// 后沿一条 2 行的青绿瓷砖挡板（strata 墙空间，一行行错缝），顶上一条钢压条 —— 厨房不至于一片灰。
// 竖直方向按屏幕行排（1 行 = 1.414 纹素）。三角形 ≈ 280（预算 350）。没有 userData。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { AssetCtx } from '../ctx';

type G = THREE.BufferGeometry;
type C3 = [number, number, number];
const FACE = { lightUp: 0.55, bands: [-0.45, 0.35] as [number, number], noShadowReceive: true };
/** BoxGeometry 的面序：+x −x +y −y +z −z */
const PY = 2;
const NY = 3;
const NZ = 5;

export function build(ctx: AssetCtx): THREE.Object3D {
  const T = ctx.texel;
  const R = Math.SQRT2; // 竖面上的 1 屏幕行（纹素）
  const bins = new Map<THREE.Material, G[]>();
  const put = (m: THREE.Material, g: G) => {
    const a = bins.get(m);
    if (a) a.push(g);
    else bins.set(m, [g]);
  };
  /** 盒子（纹素；x、z 是中心，y 是底）；默认不建朝下、朝北的面 */
  const box = (
    m: THREE.Material,
    w: number,
    h: number,
    d: number,
    x: number,
    y: number,
    z: number,
    drop: number[] = [NY, NZ],
  ) => {
    const g = new THREE.BoxGeometry(w * T, h * T, d * T);
    const src = g.getIndex()!.array;
    const keep: number[] = [];
    for (let f = 0; f < 6; f++) if (!drop.includes(f)) for (let i = 0; i < 6; i++) keep.push(src[f * 6 + i]);
    g.setIndex(keep);
    g.clearGroups();
    put(m, g.translate(x * T, (y + h / 2) * T, z * T));
  };
  /** 正面上的贴片（纹素；x 是中心、y 是底） */
  const decal = (m: THREE.Material, w: number, h: number, x: number, y: number, z: number, lift = 0.004) =>
    put(m, new THREE.PlaneGeometry(w * T, h * T).translate(x * T, (y + h / 2) * T, z * T + lift));
  /** 顶面上的贴片（纹素；x、z 是中心） */
  const plate = (m: THREE.Material, w: number, d: number, x: number, y: number, z: number, lift = 0.004) =>
    put(m, new THREE.PlaneGeometry(w * T, d * T).rotateX(-Math.PI / 2).translate(x * T, y * T + lift, z * T));
  const disc = (m: THREE.Material, r: number, x: number, y: number, z: number, lift = 0.004) =>
    put(m, new THREE.CircleGeometry(r * T, 8).rotateX(-Math.PI / 2).translate(x * T, y * T + lift, z * T));
  /** 锅：不建底的圆柱 + 里面的东西（圆片，低于锅沿一点） */
  const pot = (m: THREE.Material, inside: THREE.Material, r: number, h: number, x: number, y: number, z: number) => {
    put(m, new THREE.CylinderGeometry(r * T, r * T, h * T, 8, 1, true).translate(x * T, (y + h / 2) * T, z * T));
    disc(m, r, x, y + h, z, 0);
    disc(inside, r - 0.6, x, y + h, z);
  };
  const flat = (key: Parameters<AssetCtx['mat']>[0], ramp: C3, extra: object = {}) =>
    ctx.mat(key, { ...FACE, ramp, convex: 0.3, ...extra });

  // ── 材质 ──
  const steel = flat('metal', [0x98c4f6, 0x7098dc, 0x445498]);
  const door = flat('metal', [0x8cb4e4, 0x6488cc, 0x3e4c8c]);
  const handle = flat('metal', [0xc4dcf4, 0x9cc0ec, 0x6478a8]);
  const kick = flat('ironwork', [0x4a4a9a, 0x3a3480, 0x262458]);
  const strip = flat('ironwork', [0x5a64b4, 0x4a52a0, 0x2a2c68]);
  const glass = flat('ironwork', [0x5a6ad0, 0x4450b0, 0x262c70]);
  const fire = ctx.mat('toolOrange', {
    ramp: [0xffa040, 0xff8a38, 0xe06030],
    emissive: 0x401808,
    noShadowReceive: true,
  });
  const red = flat('fabricStripe', [0xf4664c, 0xe04a40, 0x7a2850]);
  const orange = flat('toolOrange', [0xffa848, 0xf48434, 0x7a3456]);
  const hob = ctx.mat('ironwork', { ramp: [0x6a7ac4, 0x5462a8, 0x2e3270], noShadowReceive: true });
  const copper = flat('fabricStripe', [0xf09a64, 0xd0704c, 0x7a3a5a]);
  const blue = flat('clothBlue', [0x5aa0f0, 0x3c7ce0, 0x2a3274]);
  const blueLid = flat('clothBlue', [0x8cc4fa, 0x5a94e8, 0x2a3274]);
  const soup = ctx.mat('toolOrange', { ramp: [0xffb44c, 0xf08c3c, 0x8a4458], noShadowReceive: true });
  const egg = ctx.mat('flowerYellow', { ramp: [0xffe070, 0xf4c050, 0x9a7050], noShadowReceive: true });
  const greens = ctx.mat('clothTeal', { ramp: [0x6ad860, 0x3cb050, 0x22604e], noShadowReceive: true });
  const griddle = ctx.mat('timber', { ramp: [0xc07858, 0x9a584c, 0x54345c], noShadowReceive: true });
  const patty = flat('timber', [0xa04a3c, 0x823a3c, 0x4a2850]);
  const oil = ctx.mat('flowerYellow', { ramp: [0xffc848, 0xf0a438, 0x8a5a50], noShadowReceive: true });
  // 瓷砖挡板：青绿（中档 L ≈ 140；缝、亮边 ±22；暗档冷蓝）
  const tile = ctx.mat('windscreen', {
    ramp: [0x3cd0c8, 0x18a8b4, 0x1e5a8c],
    tones: {
      bands: [
        [0x3cd0c8, 0x48dad2, 0x30c4bc],
        [0x18a8b4, 0x24b2be, 0x109ca8],
        [0x1e5a8c, 0x246496, 0x1a5080],
      ],
      seam: [0x2aaca8, 0x0e8494, 0x164474],
      hi: [0x70e8dc, 0x48c8d0, 0x2e78a8],
    },
    elem: { kind: 'strata', space: 'wall', size: [4, 2], hi: 0.4, q: [0, 1e6, 0, 0], seed: 5 },
    ...FACE,
    bands: [-0.9, -0.6],
    convex: 0.2,
  });

  const W = 36;
  const D = 9;
  const zf = D / 2;
  const YT = 7.5 * R; // 灶面（0.955 米）

  // ── 机身 ──
  box(kick, W - 1, R, D - 1, 0, 0, -0.5, [NY, NZ, PY]);
  box(steel, W, 6.5 * R, D, 0, R, 0);
  // 控制条（最上面 1.5 行）
  decal(strip, W - 1, 1.5 * R, 0, 5.8 * R, zf);

  for (let i = 0; i < 3; i++) {
    const cx = -12 + i * 12;
    const fryer = i === 2;
    // 旋钮：一台四个
    for (let k = 0; k < 4; k++) decal(fryer ? orange : red, 1.5, R, cx - 4.2 + k * 2.8, 6.05 * R, zf, 0.008);
    if (!fryer) {
      // 烤箱门 + 玻璃窗（西边那台亮着火）+ 拉手
      decal(door, 10.4, 4 * R, cx, 1.3 * R, zf);
      decal(i === 0 ? fire : glass, 7, 1.8 * R, cx, 1.9 * R, zf, 0.008);
      box(handle, 8.4, 0.9, 0.6, cx, 4.3 * R, zf + 0.3, [NY, NZ]);
    } else {
      // 炸炉 / 煎板下面：两扇柜门
      for (const sx of [-1, 1]) {
        decal(door, 5, 4 * R, cx + sx * 2.75, 1.3 * R, zf);
        decal(handle, 0.9, 1.6 * R, cx + sx * 0.9, 3.2 * R, zf, 0.008);
      }
    }
  }

  // ── 灶面 ──
  plate(hob, 11, 7, -12, YT, -0.4);
  plate(hob, 11, 7, 0, YT, -0.4);
  // 西灶：番茄红汤锅（后）+ 铜煎锅（前，柄朝东南）
  pot(red, soup, 2.3, 3.2, -14.4, YT, -1.6);
  pot(copper, egg, 2.0, 0.9, -9.4, YT, 0.9);
  box(copper, 3, 0.6, 0.9, -6.4, YT + 0.3, 0.9, [NY]);
  // 中灶：蓝搪瓷锅（盖着，红钮）+ 铜炒锅里一锅青菜
  pot(blue, blueLid, 2.1, 2.4, -2.9, YT, -1.5);
  box(red, 1, 0.6, 1, -2.9, YT + 2.4, -1.5, [NY]);
  pot(copper, greens, 2.2, 1.2, 2.6, YT, 0.7);
  box(copper, 0.9, 0.6, 2.2, 2.6, YT + 0.6, 3.5, [NY]);
  // 东：煎板（暖棕的铁板，三块肉饼、一片芝士）+ 两格炸炉
  plate(griddle, 7, 7, 9.9, YT, -0.4);
  box(patty, 1.8, 0.5, 1.8, 8.2, YT, -2);
  box(patty, 1.8, 0.5, 1.8, 11.2, YT, -1.6);
  box(patty, 1.8, 0.5, 1.8, 9.2, YT, 1.2);
  plate(egg, 1.6, 1.6, 9.2, YT + 0.5, 1.2);
  plate(oil, 3.2, 3, 15.6, YT, -2.2);
  plate(oil, 3.2, 3, 15.6, YT, 1.2);

  // ── 后沿的瓷砖挡板（2 行，落亮档）+ 钢压条 ──
  {
    const h = 2 * R * T;
    const w = W * T;
    const g = new THREE.PlaneGeometry(w, h).translate(0, YT * T + h / 2, (-zf + 0.8) * T);
    const p = g.getAttribute('position');
    const uv = g.getAttribute('uv');
    for (let k = 0; k < p.count; k++) uv.setXY(k, p.getX(k) + w / 2, YT * T + h - p.getY(k));
    put(tile, g);
  }
  box(steel, W, 0.6, 0.8, 0, YT + 2 * R, -zf + 0.4, [NY, NZ]);

  const root = new THREE.Group();
  root.name = 'up-cook-line';
  for (const [m, gs] of bins) root.add(new THREE.Mesh(gs.length > 1 ? mergeGeometries(gs) : gs[0], m));
  ctx.mats.prepare(root);
  return root;
}
