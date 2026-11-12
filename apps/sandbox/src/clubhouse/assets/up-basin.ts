// 二层卫生间的洗手台（#89）：1.2 × 0.9 × 0.5 米 = 13 × 10 × 5.5 纹素（台面 0.9 米；后面墙上的镜子到 1.74 米），朝南（+z 对镜头），靠北墙。
// 元素：柜身正面贴塔拉韦拉钴蓝砖（瓷砖 4 纹素 × 3 行一块，贴图只做明暗）+ 台面下一行赭黄腰线 + 深色踢脚；奶白的石台面；
// 中间一只白瓷盆（一圈白沿 + 水青的盆底）、后沿一只钢色的龙头（立柱 + 往前伸的出水嘴）、东边一块珊瑚色的肥皂、西边台沿垂下一条青绿的擦手巾；
// 墙上一面木框镜子（冷青的镜面 + 一道斜的白反光）。和隔间（up-stalls）、B1 的 gym-wet 一家。
// 竖直方向按屏幕行排（1 行 = 1.414 纹素）。三角形 78（预算 350）。没有 userData。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { AssetCtx } from '../ctx';

type Ramp = [number, number, number];
const FACE = { lightUp: 0.55, bands: [-0.45, 0.35] as [number, number], noShadowReceive: true };
/** 正面落亮档（瓷砖、镜面） */
const BRIGHT = { lightUp: 0.55, bands: [-0.9, -0.6] as [number, number], noShadowReceive: true };
/** BoxGeometry 的面序：e +x、w −x、t +y、b −y、s +z、n −z */
const FACES = 'ewtbsn';

/** 瓷砖贴图：4 × 3 纹素一块，第一列、最下一行是缝（0.87），其余 1.0（只做明暗，颜色来自三档） */
function tileTexture(): THREE.Texture {
  const W = 4;
  const H = 3;
  const d = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const v = x === 0 || y === 0 ? 222 : 255;
      d.set([v, v, v, 255], (y * W + x) * 4);
    }
  const t = new THREE.DataTexture(d, W, H, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = t.minFilter = THREE.NearestFilter;
  t.needsUpdate = true;
  return t;
}

export function build(ctx: AssetCtx): THREE.Object3D {
  const T = ctx.texel;
  const R = Math.SQRT2 * T; // 竖面上的 1 屏幕行（米）
  const bins = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const put = (m: THREE.Material, g: THREE.BufferGeometry) => {
    const a = bins.get(m);
    if (a) a.push(g);
    else bins.set(m, [g]);
  };
  /** 盒子（米）：x、z 是中心，y 是底；skip = 不要的面（默认去掉底面和背面） */
  const box = (m: THREE.Material, w: number, h: number, d: number, x: number, y: number, z: number, skip = 'bn') => {
    const g = new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z);
    const src = Array.from(g.index?.array ?? []);
    const idx: number[] = [];
    for (let f = 0; f < 6; f++) if (!skip.includes(FACES[f])) idx.push(...src.slice(f * 6, f * 6 + 6));
    g.setIndex(idx);
    g.clearGroups();
    put(m, g);
  };
  /** 贴在朝南的面上的薄片（米）：x0 左、y0 底；tiled = uv 按瓷砖铺 */
  const decal = (m: THREE.Material, w: number, h: number, x0: number, y0: number, z: number, tiled = false) => {
    const g = new THREE.PlaneGeometry(w, h).translate(x0 + w / 2, y0 + h / 2, z + 0.004);
    if (tiled) {
      const p = g.getAttribute('position');
      const uv = g.getAttribute('uv');
      for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / (4 * T), p.getY(i) / (3 * R));
    }
    put(m, g);
  };
  /** 平放的薄片 */
  const flat = (m: THREE.Material, w: number, d: number, x: number, y: number, z: number) =>
    put(m, new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2).translate(x, y, z));

  // ── 材质 ──
  const blueRamp: Ramp = [0x4e96f0, 0x3470d4, 0x2a4494];
  const body = ctx.mat('talavera', { ...FACE, ramp: blueRamp, tones: undefined });
  const blueTile = ctx.mat('talavera', { ...BRIGHT, map: tileTexture(), ramp: blueRamp, tones: undefined });
  const band = ctx.mat('flowerYellow', { ...BRIGHT, ramp: [0xf6b83c, 0xd88a34, 0x8a4a48] });
  const kick = ctx.mat('talavera', { ...FACE, ramp: [0x2e4a9a, 0x263a80, 0x1e2a60], tones: undefined });
  // 台面：奶白的石板（亮档 L ≈ 222），不接投影
  const top = ctx.mat('clothWhite', {
    ramp: [0xf6e2c4, 0xd6c0c0, 0x9484a8],
    edge: 0.5,
    convex: 0.4,
    noShadowReceive: true,
  });
  const china = ctx.mat('clothWhite', { ramp: [0xf8fcfc, 0xcce4ec, 0x8aa8cc], edge: 0, noShadowReceive: true });
  const water = ctx.mat('floorCool', {
    ramp: [0x3cb4cc, 0x2a8cb0, 0x2c5a94],
    tones: undefined,
    edge: 0,
    convex: 0,
    noShadowReceive: true,
  });
  const steel = ctx.mat('metal', { ...BRIGHT, ramp: [0xb8d4dc, 0x7aa0b0, 0x3e5a78], convex: 0.5 });
  const soap = ctx.mat('clothRed', { ...BRIGHT, ramp: [0xff8a6a, 0xd85a50, 0x7a2e5a] });
  const towel = ctx.mat('clothTeal', { ...BRIGHT, ramp: [0x3cc8aa, 0x2a9690, 0x24567a], convex: 0.3 });
  const frame = ctx.mat('timber', { ...FACE, ramp: [0xe89a60, 0xc06c52, 0x7a4468], tones: undefined, convex: 0.3 });
  const mirror = ctx.mat('glass', { ...BRIGHT, ramp: [0x8ad8ec, 0x5aaccc, 0x3a6aa0], tones: undefined });
  const glint = ctx.mat('clothWhite', { ...BRIGHT, ramp: [0xf4fcfc, 0xd8f0f4, 0x8aa8cc] });

  // ── 柜身：踢脚（收进去）+ 蓝砖正面 + 腰线 ──
  const TOP = 0.9;
  const SLAB = 0.08;
  const ZF = 0.2; // 柜身正面
  box(kick, 1.1, 0.1, 0.4, 0, 0, -0.03, 'bnt');
  box(body, 1.16, TOP - SLAB - 0.1, 0.45, 0, 0.1, ZF - 0.225, 'bnt');
  decal(blueTile, 1.16, TOP - SLAB - 0.1 - R, -0.58, 0.1, ZF, true);
  decal(band, 1.16, R, -0.58, TOP - SLAB - R, ZF);
  // 擦手巾：从台沿垂下来
  box(towel, 0.2, 0.36, 0.03, -0.4, TOP - SLAB - 0.34, ZF + 0.03, 'bn');

  // ── 台面 + 盆 + 龙头 + 肥皂 ──
  box(top, 1.2, SLAB, 0.5, 0, TOP - SLAB, 0, 'b');
  flat(china, 0.54, 0.34, 0.05, TOP + 0.004, 0.04);
  flat(water, 0.36, 0.2, 0.05, TOP + 0.008, 0.04);
  box(steel, 0.08, 0.16, 0.07, 0.05, TOP, -0.19, 'bn');
  box(steel, 0.08, 0.05, 0.16, 0.05, TOP + 0.13, -0.12, 'bn');
  box(soap, 0.12, 0.04, 0.09, 0.45, TOP, 0.08, 'bn');

  // ── 镜子：贴着北墙，木框 + 冷青镜面 + 一道斜的反光 ──
  const MY = 1.1;
  const ZM = -0.25;
  box(frame, 0.84, 0.64, 0.04, 0, MY, ZM + 0.02, 'bn');
  decal(mirror, 0.66, 0.46, -0.33, MY + 0.09, ZM + 0.04);
  for (const [k, gx] of [0.02, 0.11, 0.2].entries()) decal(glint, T, 0.14, gx, MY + 0.14 + k * 0.1, ZM + 0.044);

  const root = new THREE.Group();
  root.name = 'up-basin';
  for (const [m, gs] of bins) root.add(new THREE.Mesh(gs.length > 1 ? mergeGeometries(gs) : gs[0], m));
  ctx.mats.prepare(root);
  return root;
}
