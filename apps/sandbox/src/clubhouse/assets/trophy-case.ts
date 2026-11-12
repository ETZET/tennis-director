// 奖杯柜（会员前厅 / 休息室北墙西头，slot 缩放 0.8）：木框玻璃门的陈列柜。3.0 × 2.0 × 0.5 米（模型尺寸；场景里 × 0.8 = 2.4 × 1.6 × 0.4）。
// 建模单位 U = 设计纹素 / 0.8（0.1125 米）：缩放以后线还是整 1 纹素。
// 柚木框：底座、两侧立柱、中间门梃（两扇玻璃门）、顶上的檐口（往前挑 1 U）；柜里衬钴蓝丝绒（后壁 + 每层的搁板面），
// 搁板前沿一条木边。三层（底座面算一层）× 三个位，八个黄铜奖杯（方口杯 ×4、高脚杯 ×2、圆盘 ×2）+ 中层右门一个空着的小木台
// （留给下一座冠军）。两扇门左上角各一道斜的玻璃反光。
// 黄铜和丝绒、木框的亮度差 < 60（丝绒 ≈ 105、黄铜正面 ≈ 146、顶 ≈ 183、木框 ≈ 120）：靠色相（金 / 蓝）分开，不靠强边缘。
// 竖直面不接收投影（lightUp + 低 bands 落中档）。三角形 380（见文件末尾）。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { AssetCtx } from '../ctx';

const box = (w: number, h: number, d: number, x: number, y: number, z: number) =>
  new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z);

export function build(ctx: AssetCtx): THREE.Object3D {
  const U = ctx.texel / 0.8;
  const RU = U / Math.SQRT1_2; // 竖直面上一屏幕行（缩放以后）
  const g = new THREE.Group();
  const add = (gs: THREE.BufferGeometry[], m: THREE.Material) =>
    g.add(new THREE.Mesh(gs.length > 1 ? mergeGeometries(gs.map((x) => (x.index ? x.toNonIndexed() : x))) : gs[0], m));
  const face = { tones: undefined, lightUp: 0.55, bands: [-0.45, 0.35] as [number, number], noShadowReceive: true };

  const W = 3.0;
  const D = 0.5;
  const zb = -D / 2; // 贴墙
  const CD = D - U; // 柜身深（檐口、底座往前挑 1 U）
  const cz = zb + CD / 2;
  const cf = zb + CD; // 柜身正面（玻璃）
  const PL = 0.75 * RU; // 底座高
  const TOPY = 2.0 - 0.75 * RU; // 檐口底
  const CW = W - 2 * U; // 柜身宽
  const PW = 2 * U; // 立柱宽

  // ── 木框：柚木（亮档 L ≈ 175 只在檐口顶上）──
  const teak = ctx.mat('timber', { ...face, ramp: [0xd88a54, 0xa65c48, 0x58345a], edge: 0.6, convex: 0.45 });
  const frame: THREE.BufferGeometry[] = [
    box(W, PL, D, 0, 0, 0),
    box(W, 2.0 - TOPY, D, 0, TOPY, 0),
    box(PW, TOPY - PL, CD, -(CW / 2 - PW / 2), PL, cz),
    box(PW, TOPY - PL, CD, CW / 2 - PW / 2, PL, cz),
    box(PW, TOPY - PL, 2 * U, 0, PL, cf - U),
  ];
  // 搁板：两块（丝绒面 + 前沿一条木边，1 屏幕行）
  const IN = TOPY - PL;
  const SH = RU * 0.5; // 搁板厚（薄：前沿挡住的少）
  const bay = (IN - 2 * SH) / 3;
  const shelfY = [PL + bay, PL + 2 * bay + SH];
  const iw = CW - 2 * PW;
  for (const y of shelfY) frame.push(box(iw, SH, U, 0, y, cf - U / 2));
  add(frame, teak);

  // ── 丝绒：后壁 + 两块搁板面 + 底层的垫 ──
  const velvet = ctx.mat('signBoard', {
    ...face,
    ramp: [0x5a8cf0, 0x4a80e8, 0x2e4494],
    edge: 0.2,
    convex: 0.1,
    elem: { kind: 'stones', size: [10, 6], seam: 0, hi: 0, seed: 9 },
    tones: {
      bands: [
        [0x5a8cf0, 0x6294f4, 0x5484e8],
        [0x4a80e8, 0x5288ee, 0x4478de],
        [0x2e4494, 0x344a9c, 0x2a3e8a],
      ],
      seam: [0x4c7ad8, 0x3c6cc8, 0x22387c],
      hi: [0x6aa0f8, 0x5a92f0, 0x3a50a4],
    },
  });
  add(
    [
      box(iw, IN, 0.04, 0, PL, zb + 0.02),
      ...shelfY.map((y) => box(iw, SH, CD - U - 0.04, 0, y, zb + 0.04 + (CD - U - 0.04) / 2)),
      box(iw, 0.01, CD - 0.04, 0, PL, zb + 0.04 + (CD - 0.04) / 2),
    ],
    velvet,
  );

  // ── 奖杯：黄铜（方口杯 = 四棱台转 45°，口朝上；高脚杯 = 窄高；圆盘 = 立着的八边形盘）──
  // 杯身上宽下窄，侧面法线朝下斜 → bands 再往下挪，正面落中档、杯口落亮档
  const brass = ctx.mat('brass', {
    ...face,
    bands: [-0.9, 0.3],
    ramp: [0xf0c050, 0xe0a840, 0x7a5458],
    edge: 0.6,
    convex: 0.4,
  });
  const teakRiser = ctx.mat('timber', { ...face, ramp: [0xc87a4c, 0x9a5444, 0x58345a], edge: 0.4, convex: 0.3 });
  const tz = cf - 1.5 * U; // 奖杯站的 z（柜里靠前：杯的正面贴着玻璃）
  const decks = [PL, shelfY[0] + SH, shelfY[1] + SH];
  const gold: THREE.BufferGeometry[] = [];
  /** 方口杯：黄铜的方座 + 杯（上宽下窄） */
  const cup = (x: number, y: number, top: number, h: number) => {
    gold.push(box(2 * U, RU * 0.6, 2 * U, x, y, tz));
    gold.push(
      new THREE.CylinderGeometry(top, top * 0.45, h, 4, 1, false, Math.PI / 4).translate(x, y + RU * 0.6 + h / 2, tz),
    );
  };
  /** 立着的圆盘（八边形），靠在丝绒后壁前 */
  const salver = (x: number, y: number, r: number) => {
    gold.push(
      new THREE.CylinderGeometry(r, r, 0.04, 8, 1, false, Math.PI / 8)
        .rotateX(Math.PI / 2)
        .translate(x, y + r, tz - 0.04),
    );
  };
  // 顶层：大杯、圆盘 | 宽杯
  // 杯高 ≤ 0.26：上一层搁板前沿挡住每层最上 0.17 米，杯口要露出来
  cup(-0.95, decks[2], 2 * U, 0.26);
  salver(-0.42, decks[2], 1.5 * U);
  cup(0.68, decks[2], 1.8 * U, 0.2);
  // 中层：高脚杯 | 空位（小木台）、宽杯
  cup(-0.7, decks[1], 1.4 * U, 0.26);
  const empty = box(3 * U, RU * 0.6, 2 * U, 0.42, decks[1], tz);
  cup(0.98, decks[1], 1.7 * U, 0.18);
  // 底层：宽杯、小杯 | 圆盘
  cup(-0.98, decks[0], 1.8 * U, 0.22);
  cup(-0.45, decks[0], 1.4 * U, 0.16);
  salver(0.62, decks[0], 1.7 * U);
  add(gold, brass);
  add([empty], teakRiser);

  // ── 玻璃反光：两扇门左上角各一道斜条（1 U 宽，往右下 45°）──
  const glint = (x: number, y: number) => {
    const s = 3 * U;
    const p = [x, y, x + U, y, x + U + s, y - s, x + s, y - s];
    const geo = new THREE.BufferGeometry();
    const v: number[] = [];
    for (const i of [0, 3, 1, 0, 2, 3]) v.push(p[i * 2], p[i * 2 + 1], cf + 0.005);
    geo.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
    geo.setAttribute(
      'normal',
      new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1], 3),
    );
    return geo;
  };
  add(
    [glint(-CW / 2 + PW + U, TOPY - U), glint(PW / 2 + U, TOPY - U)],
    ctx.mat('glass', { ...face, ramp: [0x8cc4e0, 0x7ab4d8, 0x5878b0], edge: 0, convex: 0 }),
  );

  // 三角形：木框 5 盒 + 2 搁板边 = 84；丝绒 4 盒 48；奖杯 6 杯 × 16 + 2 盘 × 32 = 160；杯座 6 + 空台 1 = 84；反光 4 → 380
  ctx.mats.prepare(g);
  return g;
}
