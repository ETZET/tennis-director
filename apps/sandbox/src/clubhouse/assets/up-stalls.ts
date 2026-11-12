// 二层卫生间的隔间 ×2（#88）：1.8 × 2.0 × 1.28 米 = 20 × 22 × 14 纹素，朝南（+z 对镜头）；和 B1 的 gym-wet（淋浴 + 厕位）一家。
// 元素：靠北一道瓷砖墙（塔拉韦拉钴蓝的墙裙到 1.1 米、一行赭黄腰线、上面白瓷砖、墙顶一行蓝压条；瓷砖 4 纹素 × 3 行一块，贴图只做明暗）；
// 三道贴蓝釉砖的隔墙（顶上一条白压顶）；西边一间关着门（暖色木门、两块芯板、红色门锁 = 有人），
// 东边一间门朝里半开（空着），看得见里面的白瓷马桶（水箱 + 座圈 + 木盖）。
// 竖直方向按屏幕行排（1 行 = 1.414 纹素）。三角形 100（预算 350）。没有 userData。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { AssetCtx } from '../ctx';

type Ramp = [number, number, number];
const FACE = { lightUp: 0.55, bands: [-0.45, 0.35] as [number, number], noShadowReceive: true };
/** 正面落亮档（瓷砖墙、白瓷） */
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
  const cut = (g: THREE.BufferGeometry, skip: string) => {
    const src = Array.from(g.index?.array ?? []);
    const idx: number[] = [];
    for (let f = 0; f < 6; f++) if (!skip.includes(FACES[f])) idx.push(...src.slice(f * 6, f * 6 + 6));
    g.setIndex(idx);
    g.clearGroups();
    return g;
  };
  /** 盒子（米）：x、z 是中心，y 是底；skip = 不要的面（默认去掉底面和背面） */
  const box = (m: THREE.Material, w: number, h: number, d: number, x: number, y: number, z: number, skip = 'bn') =>
    put(m, cut(new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z), skip));
  /** 贴在朝南的面上的薄片（米）：x0 左、y0 底；tiled = uv 按瓷砖（4 纹素 × 3 行一块）铺 */
  const decal = (m: THREE.Material, w: number, h: number, x0: number, y0: number, z: number, tiled = false) => {
    const g = new THREE.PlaneGeometry(w, h).translate(x0 + w / 2, y0 + h / 2, z + 0.004);
    if (tiled) {
      const p = g.getAttribute('position');
      const uv = g.getAttribute('uv');
      for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / (4 * T), p.getY(i) / (3 * R));
    }
    put(m, g);
  };

  const tex = tileTexture();
  // ── 材质 ──
  const blueRamp: Ramp = [0x4e96f0, 0x3470d4, 0x2a4494];
  const wallBody = ctx.mat('talavera', { ...FACE, ramp: blueRamp, tones: undefined });
  // 墙裙的钴蓝砖（正面落亮档 L ≈ 140）、白砖（偏水青的白）、赭黄腰线
  const blueTile = ctx.mat('talavera', { ...BRIGHT, map: tex, ramp: blueRamp, tones: undefined });
  const whiteTile = ctx.mat('clothWhite', { ...BRIGHT, map: tex, ramp: [0xdaf6ec, 0xb0dcd8, 0x6a8aa8] });
  const band = ctx.mat('flowerYellow', { ...BRIGHT, ramp: [0xf6b83c, 0xd88a34, 0x8a4a48] });
  // 隔墙：蓝釉砖（正面落中档，顶面亮档）+ 白压顶
  const partition = ctx.mat('talavera', { ...FACE, ramp: blueRamp, tones: undefined, convex: 0.3 });
  const cap = ctx.mat('clothWhite', { ...BRIGHT, ramp: [0xe6f8f0, 0xbcdcdc, 0x7090b0], convex: 0.3 });
  // 门：暖色的木门（中档 L ≈ 125）+ 浅一级的芯板
  const door = ctx.mat('timber', { ...FACE, ramp: [0xe89a60, 0xc06c52, 0x7a4468], tones: undefined, convex: 0.3 });
  const panel = ctx.mat('timber', { ...FACE, ramp: [0xf4ac6e, 0xd6845e, 0x8a5074], tones: undefined });
  const busy = ctx.mat('clothRed', { ...BRIGHT, ramp: [0xff6a4a, 0xd84a3a, 0x6a2a5a] });
  // 白瓷：正面落中档的浅水青（L ≈ 215），顶面亮
  const china = ctx.mat('clothWhite', { ...FACE, ramp: [0xf4fcfc, 0xcce4ec, 0x8aa8cc], convex: 0.4 });
  const lid = ctx.mat('timber', { ramp: [0xe89a60, 0xc06c52, 0x7a4468], tones: undefined, noShadowReceive: true });

  // ── 墙：x ±0.9，z −0.65…−0.56，高 2.0 ──
  const ZF = -0.56; // 墙的正面
  box(wallBody, 1.8, 2.0, 0.09, 0, 0, ZF - 0.045);
  decal(whiteTile, 1.8, 2.0 - R, -0.9, 0, ZF, true);
  decal(blueTile, 1.8, 1.1, -0.9, 0, ZF + 0.004, true); // 墙裙
  decal(band, 1.8, R, -0.9, 1.1, ZF + 0.004); // 腰线
  decal(blueTile, 1.8, R, -0.9, 2.0 - R, ZF + 0.004); // 墙顶压条

  // ── 三道隔墙（0.1 厚、高 1.8、z −0.56…+0.6）+ 白压顶 ──
  const ZD = 0.6; // 门的 z（中心）
  const PD = ZD - ZF;
  for (const px of [-0.85, 0, 0.85]) {
    box(partition, 0.1, 1.8, PD, px, 0, (ZD + ZF) / 2, 'bnew');
    box(cap, 0.14, 0.05, PD + 0.02, px, 1.8, (ZD + ZF) / 2 + 0.01, 'bn');
  }

  // ── 西边一间：关着的门（离地 0.15、高 1.55）+ 两块芯板 + 红色门锁 ──
  const DW = 0.72;
  const DH = 1.55;
  const WX = -0.425;
  box(door, DW, DH, 0.05, WX, 0.15, ZD);
  decal(panel, DW - 0.2, 0.52, WX - DW / 2 + 0.1, 0.27, ZD + 0.025);
  decal(panel, DW - 0.2, 0.52, WX - DW / 2 + 0.1, 0.27 + 0.52 + 0.24, ZD + 0.025);
  decal(busy, T, R, WX + 0.2, 0.85, ZD + 0.03);

  // ── 东边一间：门朝里半开（合页在东隔墙，转 72°）；里面的马桶 ──
  const g = cut(new THREE.BoxGeometry(DW, DH, 0.05).translate(-DW / 2, DH / 2, 0), 'b')
    .rotateY((-72 * Math.PI) / 180)
    .translate(0.8, 0.15, ZD);
  put(door, g);
  const TX = 0.36; // 马桶中心（让开半开的门）
  box(china, 0.42, 0.42, 0.16, TX, 0.4, ZF + 0.08); // 水箱
  box(china, 0.36, 0.4, 0.44, TX, 0, ZF + 0.16 + 0.22); // 座
  box(lid, 0.3, 0.03, 0.36, TX, 0.4, ZF + 0.16 + 0.22, 'bn'); // 木盖

  const root = new THREE.Group();
  root.name = 'up-stalls';
  for (const [m, gs] of bins) root.add(new THREE.Mesh(gs.length > 1 ? mergeGeometries(gs) : gs[0], m));
  ctx.mats.prepare(root);
  return root;
}
