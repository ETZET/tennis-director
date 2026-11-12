// B1 前台 · 毛巾台（#135）：朝南（+z 对镜头），前台站在北边（台后）。3.51 × 1.53 × 0.72 米 = 39 × 17 × 8 纹素（台面 1.15 米，毛巾摞、冒尖的脏毛巾到 1.5 米）。
// 元素：会所青绿的台身（竖向面板，planks 每 6 纹素一道缝）+ 1 行深靛的踢脚 + 柠檬黄的人造石台面（前沿出 1 纹素）；
// 台身正面一块亮着的灯箱（不写字：青色球拍 + 荧光球的像素图标）；台面西头一摞叠好的毛巾（青、白、青）；
// 东头地上一只蓝色脏毛巾筐，冒尖 + 一条挂出筐沿的毛巾 = 信号（→ 去洗衣房推干净的来）。
// 竖直方向按屏幕行排（1 行 = 1.414 纹素）。三角形 208（预算 350）。
// userData：setStack(n)（台面上的干净毛巾 0…3，默认 3）、setBin(full)（脏毛巾筐冒尖，默认 true）、stack()、binFull()。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { blobNormals, type Tones } from '../../clubsite/render/toon';
import type { AssetCtx } from '../ctx';

/** 朝镜头的竖直面：留在中档（太阳在后方，不抬就全黑） */
const FACE = { lightUp: 0.55, bands: [-0.45, 0.35] as [number, number], noShadowReceive: true };
/** 灯箱：正面落亮档 */
const GLOW = { lightUp: 0.55, bands: [-0.9, -0.6] as [number, number], noShadowReceive: true };

export function build(ctx: AssetCtx): THREE.Object3D {
  const T = ctx.texel;
  /** 竖面上的 1 屏幕行（纹素）：俯角 45° 时竖直 1 纹素 = 0.707 行 */
  const R = Math.SQRT2;
  // 分组：台子（一直在）、台面上的三条干净毛巾（各一组）、冒尖的脏毛巾（一组）—— stage 3 的开关切 visible
  type Bucket = Map<THREE.Material, THREE.BufferGeometry[]>;
  const baseBin: Bucket = new Map();
  const towelBins: Bucket[] = [new Map(), new Map(), new Map()];
  const dirtyBin: Bucket = new Map();
  let bins = baseBin;
  const put = (m: THREE.Material, g: THREE.BufferGeometry) => {
    const a = bins.get(m);
    if (a) a.push(g);
    else bins.set(m, [g]);
  };
  /** 盒子（纹素）：宽、高、深，x / z 中心，y 底 */
  const box = (m: THREE.Material, w: number, h: number, d: number, x: number, y: number, z: number) =>
    put(m, new THREE.BoxGeometry(w * T, h * T, d * T).translate(x * T, (y + h / 2) * T, z * T));
  /** 一团（纹素）：低多边形团块，球面法线（毛巾堆） */
  const lump = (m: THREE.Material, r: number, sx: number, sy: number, sz: number, x: number, y: number, z: number) => {
    const g = new THREE.IcosahedronGeometry(r * T, 0).scale(sx, sy, sz).translate(x * T, y * T, z * T);
    put(m, blobNormals(g, new THREE.Vector3(x * T, (y - r * 0.4) * T, z * T)));
  };

  // ── 材质 ──
  // 会所青绿（借 clothTeal，三档手挑：亮 L 172 / 中 L 128 / 暗 L 84，暗档偏蓝）
  const tealTones: Tones = {
    bands: [
      [0x46c8b0, 0x52d0b8, 0x3cbaa6],
      [0x2c9e96, 0x34a89e, 0x26928e],
      [0x22607a, 0x286a82, 0x1e5672],
    ],
    // 缝和缝后的亮条只差本色 20～25（竖缝每行都算横向相邻差，> 60 就是强边缘）
    seam: [0x34a69a, 0x24807e, 0x1a4e66],
    hi: [0x5cd2bc, 0x3cb2a4, 0x2a7088],
  };
  const body = ctx.mat('clothTeal', {
    ...FACE,
    ramp: [0x46c8b0, 0x2c9e96, 0x22607a],
    tones: tealTones,
    elem: { kind: 'planks', space: 'local', p: [1, 0, 0, 6 * T], seam: 1, hi: 1 },
  });
  // 台面：浅柠檬黄的人造石（借 counterTop，L 222 / 168 / 104；会所的青 + 球的黄）。木色、奶油色都和前台大厅的陶砖地分不开
  const top = ctx.mat('counterTop', { ramp: [0xf4e080, 0xcca864, 0x76628a], convex: 0.5 });
  const kick = ctx.mat('ironwork', { ...FACE, ramp: [0x4a4a7a, 0x34345e, 0x262448] });
  const glow = ctx.mat('signPaint', GLOW);
  const racket = ctx.mat('clothTeal', { ...GLOW, ramp: [0x2c9e96, 0x22807e, 0x22607a] });
  const ball = ctx.mat('ball', { ...FACE, ramp: [0xe8ff50, 0xc8e030, 0x6a8a5a] });
  const towel = ctx.mat('clothWhite', { ...GLOW, bands: [-0.45, -0.25], convex: 0.3 });
  const stripe = ctx.mat('clothTeal', { ...GLOW, bands: [-0.45, -0.25], convex: 0.3 });
  const bin = ctx.mat('clothBlue', { ...FACE, convex: 0.3 });
  const binIn = ctx.mat('clothBlue', { ...FACE, ramp: [0x2a3274, 0x262c64, 0x201f50], edge: 0.2 });
  const dirty = ctx.mat('clothWhite', { lightUp: 0.4, bands: [-0.5, 0.3], noShadowReceive: true, convex: 0.25 });
  const grey = ctx.mat('clothWhite', {
    lightUp: 0.4,
    bands: [-0.5, 0.3],
    noShadowReceive: true,
    convex: 0.25,
    ramp: [0xdcc8dc, 0xaa90b8, 0x6c5c96],
  });

  // ── 台身：x −19…+11（30 纹素），z −4…+3。竖直方向按屏幕行排（R = 1 行 = 1.414 纹素，竖面上 1 纹素只有 0.7 行，
  //    1 纹素高的东西 45° 下时有时无）：踢脚 1 行（往里收 1 纹素）、台身 7 行、台面 1 行（前沿出 1 纹素）──
  const BX = -4; // 台身中心 x
  box(kick, 28, R, 6, BX, 0, -0.5);
  box(body, 30, 7 * R, 7, BX, R, -0.5);
  box(top, 31, R, 8, BX, 8 * R, 0);
  // 灯箱（正面凸出 1 纹素，6 行高）+ 图标（1 纹素 × 1 行一格的像素画，再凸出 1 纹素）= 青色球拍（拍框一圈 + 斜柄）+ 荧光球
  //   x 0123456789A（相对灯箱左沿）
  //   4 ..RR.......
  //   3 .R..R...YY.
  //   2 ..RR...YYYY
  //   1 ....R...YY.
  const L0 = BX - 6; // 灯箱 11 纹素宽：x −6…+5
  box(glow, 11, 6 * R, 1, BX - 0.5, 1.5 * R, 3.5);
  // 图标是贴在灯箱正面的薄片（凸出的小盒子会露出顶面，45° 下把拍框的洞填上）
  const px = (m: THREE.Material, x: number, r: number, w: number) =>
    put(m, new THREE.PlaneGeometry(w * T, R * T).translate((L0 + x + w / 2) * T, (2 + r) * R * T, 4 * T + 0.004));
  px(racket, 2, 4, 2);
  px(racket, 1, 3, 1);
  px(racket, 4, 3, 1);
  px(racket, 2, 2, 2);
  px(racket, 4, 1, 1);
  px(ball, 8, 3, 2);
  px(ball, 7, 2, 4);
  px(ball, 8, 1, 2);

  // ── 台面西头：一摞叠好的毛巾（3 条，每条 6 纹素宽 × 1 行 × 4 纹素深：会所青、白、会所青）──
  for (let i = 0; i < 3; i++) {
    bins = towelBins[i];
    box(i === 1 ? towel : stripe, 6, R, 4, -15 + (i === 1 ? 1 : 0), (9 + i) * R, -0.5);
  }
  bins = baseBin;

  // ── 东头地上：脏毛巾筐（6 × 7 × 6，沿 7 × 1 × 7）+ 冒尖的一堆 + 挂出前沿的一条 ──
  const KX = 15.5;
  box(bin, 6, 5 * R, 6, KX, 0, 0);
  box(bin, 7, R, 7, KX, 5 * R, 0);
  box(binIn, 5, 1, 5, KX, 6 * R - 0.8, 0);
  bins = dirtyBin;
  lump(dirty, 2.8, 1.2, 0.85, 1.1, KX - 1, 6 * R + 0.6, 0.4);
  lump(grey, 2.4, 1.2, 0.9, 1.1, KX + 1.5, 6 * R + 1, -0.8);
  lump(dirty, 2.0, 1.1, 1.0, 1.0, KX + 0.2, 6 * R + 2.8, -0.6);
  box(dirty, 3, 3 * R, 1, KX - 1, 3 * R, 3.5); // 挂出筐沿的一条（正面）

  const root = new THREE.Group();
  root.name = 'gym-desk';
  const fill = (to: THREE.Object3D, b: Bucket) => {
    for (const [m, gs] of b) {
      const list = gs.some((g) => !g.index) ? gs.map((g) => (g.index ? g.toNonIndexed() : g)) : gs;
      to.add(new THREE.Mesh(list.length > 1 ? mergeGeometries(list) : list[0], m));
    }
    return to;
  };
  fill(root, baseBin);
  const stack = towelBins.map((b) => fill(new THREE.Group(), b));
  const dirtyG = fill(new THREE.Group(), dirtyBin);
  root.add(...stack, dirtyG);
  ctx.mats.prepare(root);
  // 开关（stage 3）：setStack(n) 台面上还剩几条干净毛巾（0…3，默认 3）；setBin(full) 脏毛巾筐冒不冒尖（默认 true）
  root.userData.setStack = (n: number) => {
    stack.forEach((g, i) => {
      g.visible = i < n;
    });
  };
  root.userData.setBin = (full: boolean) => {
    dirtyG.visible = full;
  };
  root.userData.stack = () => stack.filter((g) => g.visible).length;
  root.userData.binFull = () => dirtyG.visible;
  return root;
}
