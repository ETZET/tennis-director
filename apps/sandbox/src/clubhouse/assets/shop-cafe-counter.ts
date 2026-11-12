// shop-cafe-counter：咖啡吧的吧台（1F 前段宽拱后面，正面朝南对着商店街；咖啡师站在北边 −z 1.45 米）。
// 尺寸 2.4 × 1.1 × 0.7 米（w × h × d）≈ 27 × 12 × 8 设计纹素；台面 y 1.1（糕点柜 shop-pastry-case 摆在台面西半 x −1.15…−0.25）。
// 台面东半：番茄红 + 铜顶的意式咖啡机（0.7 米 ≈ 8 纹素宽：机身 + 铜顶 + 钢的冲煮头横条 + 两个黑手柄 + 东侧蒸汽棒 + 正面一盏暖黄的蒸汽灯）、
// 机顶一摞白杯子（一纹素一层）、东头一台磨豆机（铜身 + 装着咖啡豆的料斗）。
// 元素：正面是翡翠绿的釉面砖（windscreen 借 club 组调色，strata 墙空间：一行行错缝的砖，缝 −24、四成砖上沿亮），
// 两头一纹素多的木框 + 底下一条暗的踢脚（timber）；台面是浅蜂蜜色的木板（canvas 借 club 组，planks 三块板）。
// 朝镜头的立面都是 lightUp + 低 bands（落中档）；小件不接投影。蒸汽灯 userData 里没有动画（静态的红灯）。
// 三角形 128（画廊实测）。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { AssetCtx } from '../ctx';

type G = THREE.BufferGeometry;
/** BoxGeometry 的面序：+x −x +y −y +z −z；默认不建朝下、朝北（−z）的面（镜头在南上方，看不见） */
const PY = 2;
const NY = 3;
const NZ = 5;
function boxG(w: number, h: number, d: number, x: number, y: number, z: number, drop: number[] = [NY, NZ]): G {
  const g = new THREE.BoxGeometry(w, h, d);
  const src = g.getIndex()!.array;
  const keep: number[] = [];
  for (let f = 0; f < 6; f++) if (!drop.includes(f)) for (let i = 0; i < 6; i++) keep.push(src[f * 6 + i]);
  g.setIndex(keep);
  g.clearGroups();
  return g.translate(x, y + h / 2, z);
}
/** 朝 +z 的竖直矩形（x0..x1、y0..y1，在 z）；uv = (沿墙米, 离顶米)，给 strata 墙空间用 */
function faceG(x0: number, x1: number, y0: number, y1: number, z: number): G {
  const g = new THREE.PlaneGeometry(x1 - x0, y1 - y0).translate((x0 + x1) / 2, (y0 + y1) / 2, z);
  const p = g.getAttribute('position');
  const uv = g.getAttribute('uv');
  for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) - x0, y1 - p.getY(i));
  return g;
}

const W = 2.4;
const D = 0.7;
/** 台面顶 */
const H = 1.1;
/** 台面板厚（前沿露 1 纹素） */
const SLAB = 0.09;
/** 正面（砖）在 z；台面往前出 0.04 */
const FZ = D / 2 - 0.04;
/** 踢脚高、往里缩 */
const KICK = 0.14;
/** 两头木框宽 */
const POST = 0.14;

export function build(ctx: AssetCtx): THREE.Object3D {
  const tile: G[] = [];
  const wood: G[] = [];
  const top: G[] = [];
  const copper: G[] = [];
  const brass: G[] = [];
  const steel: G[] = [];
  const cups: G[] = [];
  const dark: G[] = [];
  const beans: G[] = [];
  const lamp: G[] = [];

  // ── 柜身：踢脚 + 两头木框 + 砖面 + 台面 ──
  wood.push(faceG(-W / 2 + 0.03, W / 2 - 0.03, 0, KICK, FZ - 0.05));
  for (const sx of [-1, 1]) wood.push(boxG(POST, H - SLAB, 0.06, sx * (W / 2 - 0.02 - POST / 2), 0, FZ, [NY, NZ, PY]));
  tile.push(faceG(-W / 2 + 0.02 + POST, W / 2 - 0.02 - POST, KICK, H - SLAB, FZ - 0.01));
  top.push(boxG(W, SLAB, D, 0, H - SLAB, 0));

  // ── 咖啡机（台面东半，x 0.01…0.71；机身前脸 z 0.15）：番茄红的机身（正面 4 行）+ 铜顶 + 底下一条钢的冲煮头横条、两个黑手柄 ──
  const MX = 0.36;
  const MW = 0.7;
  const MZ = -0.06;
  const MD = 0.42;
  const mf = MZ + MD / 2;
  copper.push(boxG(MW, 0.5, MD, MX, H, MZ));
  // 铜顶（暖杯盘）
  brass.push(boxG(MW + 0.04, 0.07, MD + 0.04, MX, H + 0.5, MZ));
  // 冲煮头横条（钢）+ 下面两个黑手柄往前伸
  steel.push(boxG(MW - 0.1, 0.09, 0.06, MX, H + 0.12, mf + 0.03));
  for (const gx of [-0.16, 0.16]) dark.push(boxG(0.09, 0.09, 0.13, MX + gx, H + 0.03, mf + 0.065));
  // 东侧蒸汽棒（1 纹素，从机身伸出来往下）
  steel.push(boxG(0.09, 0.3, 0.09, MX + MW / 2 + 0.045, H + 0.08, mf - 0.06, [NY, NZ, PY]));
  // 蒸汽灯：正面右上，2 × 2 纹素的灯（自发光的暖黄）
  lamp.push(faceG(MX + 0.11, MX + 0.29, H + 0.3, H + 0.44, mf + 0.002));
  // 机顶一摞白杯子（两层，一层 0.09 = 一纹素一行，planks 横缝）
  cups.push(boxG(0.36, 0.18, 0.2, MX - 0.1, H + 0.57, MZ + 0.02));

  // ── 磨豆机（东头 x 0.86…1.14）：铜身 + 黑出粉口 + 透着咖啡豆的料斗 ──
  const GX = 1.0;
  copper.push(boxG(0.27, 0.3, 0.27, GX, H, -0.08));
  dark.push(boxG(0.12, 0.09, 0.08, GX, H + 0.1, 0.09));
  beans.push(new THREE.CylinderGeometry(0.16, 0.1, 0.22, 8, 1, true).translate(GX, H + 0.41, -0.08));
  beans.push(new THREE.CircleGeometry(0.16, 8).rotateX(-Math.PI / 2).translate(GX, H + 0.52, -0.08));
  brass.push(boxG(0.14, 0.05, 0.14, GX, H + 0.52, -0.08));

  const root = new THREE.Group();
  root.name = 'shop-cafe-counter';
  const add = (gs: G[], m: THREE.Material) => root.add(new THREE.Mesh(mergeGeometries(gs), m));
  const FACE = { lightUp: 0.55, bands: [-0.45, 0.35] as [number, number] };

  // 砖面：翡翠绿（中档 L 138 / 147 / 128；缝 −24、亮边 +22；暗档冷蓝绿）
  add(
    tile,
    ctx.mat('windscreen', {
      ramp: [0x20cc8c, 0x00b07a, 0x105c7c],
      tones: {
        bands: [
          [0x20cc8c, 0x2ad496, 0x16c080],
          [0x00b07a, 0x0aba84, 0x00a46e], // L 135 / 143 / 126
          [0x22607a, 0x286a84, 0x1e5670],
        ],
        seam: [0x18a876, 0x008a5e, 0x0e4864],
        hi: [0x50e4a8, 0x34cc96, 0x207896],
      },
      elem: { kind: 'strata', space: 'wall', size: [5, 3], hi: 0.4, q: [0, 1e6, 0, 0], seed: 7 },
      ...FACE,
      edge: 0.4,
      convex: 0.2,
      noShadowReceive: true,
    }),
  );
  // 木框、踢脚：深一点的胡桃木（中档 L ≈ 110）
  add(
    wood,
    ctx.mat('timber', {
      ramp: [0xc87a50, 0xa65a4c, 0x5c3a64],
      ...FACE,
      edge: 0.4,
      convex: 0.3,
      noShadowReceive: true,
    }),
  );
  // 台面：浅蜂蜜色木板（亮档 L ≈ 196），三块顺着 x 的板
  add(
    top,
    ctx.mat('canvas', {
      ramp: [0xeebc7c, 0xc88a64, 0x7a5a84],
      tones: {
        bands: [
          [0xeebc7c, 0xf4c688, 0xe4b070], // L 196 / 205 / 186
          [0xc88a64, 0xd2946c, 0xbc805c],
          [0x7a5a84, 0x84628e, 0x70527a],
        ],
        seam: [0xd09c62, 0xa86e50, 0x5c4468],
        hi: [0xffd496, 0xe0a47a, 0x94709c],
      },
      elem: { kind: 'planks', space: 'local', p: [0, 0, 1, 0.235], q: [1, 0, 0, 0], seam: 1, hi: 0 },
      ...FACE,
      edge: 0.45,
      convex: 0.5,
    }),
  );
  // 机身、磨豆机身：番茄红的搪瓷（朝镜头中档 L ≈ 105；顶面亮档 L ≈ 135）
  add(
    copper,
    ctx.mat('fabricStripe', {
      ramp: [0xf4664c, 0xd8443c, 0x7a2850],
      ...FACE,
      edge: 0.45,
      convex: 0.35,
      noShadowReceive: true,
    }),
  );
  // 铜：机顶、料斗盖（亮档 L ≈ 165 的玫瑰铜，比蜂蜜色台面偏红、暗一截）
  add(
    brass,
    ctx.mat('fabricStripe', {
      ramp: [0xf0946c, 0xc8664c, 0x7a3a5a],
      ...FACE,
      edge: 0.45,
      convex: 0.5,
      noShadowReceive: true,
    }),
  );
  add(steel, ctx.mat('steel', { ...FACE, edge: 0.45, convex: 0.5, noShadowReceive: true }));
  // 白杯子：一纹素一层（planks 沿 y 每 0.09 米一道缝）
  add(
    cups,
    ctx.mat('counterTop', {
      ramp: [0xfaf2e6, 0xf2e6de, 0x9a88b0],
      tones: {
        bands: [
          [0xfaf2e6, 0xfffaf0, 0xf0e6dc],
          [0xf2e6de, 0xfaeee6, 0xe8dcd4], // L 232 / 240 / 222
          [0x9a88b0, 0xa492ba, 0x8e7ea4],
        ],
        seam: [0xd8cabc, 0xbcaaae, 0x7a6c94],
        hi: [0xffffff, 0xf4e8e2, 0xb0a0c4],
      },
      elem: { kind: 'planks', space: 'local', p: [0, 1, 0, 0.09], q: [1, 0, 0, 0], seam: 1, hi: 0 },
      ...FACE,
      edge: 0.35,
      convex: 0.3,
      noShadowReceive: true,
    }),
  );
  add(
    dark,
    ctx.mat('ironwork', {
      ramp: [0x6a5a80, 0x4e4068, 0x34284a],
      ...FACE,
      edge: 0.4,
      convex: 0.3,
      noShadowReceive: true,
    }),
  );
  // 料斗里的咖啡豆：深棕（中档 L ≈ 100）
  add(
    beans,
    ctx.mat('timber', { ramp: [0xa86a48, 0x8a5048, 0x4e3054], ...FACE, edge: 0.4, convex: 0.3, noShadowReceive: true }),
  );
  // 蒸汽灯：自发光的暖黄（机身红上最亮的一点）
  add(
    lamp,
    ctx.mat('flowerYellow', { ramp: [0xffe070, 0xffd060, 0xf0b850], emissive: 0x302008, noShadowReceive: true }),
  );

  ctx.mats.prepare(root);
  return root;
}
