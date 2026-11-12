// B1 更衣室南头的淋浴 + 厕位一面（#141，男 / 女各一面）：3.47 × 1.91 × 0.99 米 = 38.5 × 21 × 11 纹素，朝南（+z 对镜头）。
// 元素：靠北一道贴白瓷砖的墙（瓷砖 4 纹素 × 3 行一块、1 纹素灰缝：贴图只做明暗；墙裙两排、腰线一排水青砖，墙顶一行深青压条）；
// 西半边两个淋浴间：水青色的淋浴盘、钢色的花洒（墙上一根短臂 + 一个宽的喷头）和阀门、中间一道冷青色的玻璃隔断 + 每间前沿半扇玻璃门（一道亮的反光）；
// 东半边两个厕位：三块隔板（离地 1 行）+ 两扇朝镜头的深色门（v0 砖红 / v1 紫），门锁一红（有人）一绿（空）。
// 竖直方向按屏幕行排（1 行 = 1.414 纹素）。三角形 188（预算 350）。没有 userData。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { AssetCtx } from '../ctx';

const FACE = { lightUp: 0.55, bands: [-0.45, 0.35] as [number, number], noShadowReceive: true };
/** 正面落亮档（瓷砖墙、玻璃） */
const BRIGHT = { lightUp: 0.55, bands: [-0.9, -0.6] as [number, number], noShadowReceive: true };

/** 瓷砖贴图：4 × 3 纹素一块，第一列、最下一行是缝（0.87），其余 1.0（贴图只做接近白的明暗，颜色来自三档） */
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
  const R = Math.SQRT2; // 竖面上的 1 屏幕行（纹素）
  const bins = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const put = (m: THREE.Material, g: THREE.BufferGeometry) => {
    const a = bins.get(m);
    if (a) a.push(g);
    else bins.set(m, [g]);
  };
  const box = (m: THREE.Material, w: number, h: number, d: number, x: number, y: number, z: number) =>
    put(m, new THREE.BoxGeometry(w * T, h * T, d * T).translate(x * T, (y + h / 2) * T, z * T));
  /** 贴在正面上的薄片（纹素）：宽 w、高 h，左下角 x、y；tiled = uv 按瓷砖（4 纹素 × 3 行一块）铺 */
  const decal = (m: THREE.Material, w: number, h: number, x: number, y: number, z: number, tiled = false) => {
    const g = new THREE.PlaneGeometry(w * T, h * T).translate((x + w / 2) * T, (y + h / 2) * T, z * T + 0.004);
    if (tiled) {
      const p = g.getAttribute('position');
      const uv = g.getAttribute('uv');
      for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / (4 * T), p.getY(i) / (3 * R * T));
    }
    put(m, g);
  };

  const women = ctx.variant % 2 === 1;
  const tex = tileTexture();
  // ── 材质 ──
  // 白瓷砖（借 clothWhite → 偏水青的白：L 232 / 196 / 120），正面落亮档
  const tile = ctx.mat('clothWhite', { ...BRIGHT, map: tex, ramp: [0xdaf6ec, 0xb0dcd8, 0x6a8aa8] });
  // 水青砖（腰线、墙脚）：L 190
  const aqua = ctx.mat('floorCool', { ...BRIGHT, map: tex, ramp: [0x2ad0c2, 0x22a8b8, 0x3a5a94] });
  const wallBody = ctx.mat('floorCool', { ...FACE, ramp: [0x9ce6dc, 0x5ec0c4, 0x3a5a94] });
  const tray = ctx.mat('floorCool', { ...FACE, ramp: [0x34c8c0, 0x22a0b4, 0x3a5a94], convex: 0.3 });
  // 玻璃：冷青（L 200 / 170），前沿亮
  const glass = ctx.mat('jug', { ...FACE, ramp: [0x6ad0f4, 0x3ab0e4, 0x3a6aa8], convex: 0.8 });
  const glint = ctx.mat('clothWhite', { ...BRIGHT, ramp: [0xf4fcfc, 0xd8f0f4, 0x8aa8cc] });
  const trim = ctx.mat('floorCool', { ...FACE, ramp: [0x3a8a9a, 0x2c6a84, 0x24466a] });
  const steel = ctx.mat('metal', { ...FACE, ramp: [0xb8d4dc, 0x7aa0b0, 0x3e5a78], convex: 0.6 });
  const valve = ctx.mat('ironwork', { ...FACE, ramp: [0x4a5a8a, 0x3a4470, 0x262a50] });
  // 隔板：比门浅一档的同色系
  const partition = women
    ? ctx.mat('clothPurple', { ...FACE, ramp: [0xb478f0, 0x8a48e0, 0x4a3486] })
    : ctx.mat('fabricStripe', { ...FACE, ramp: [0xf08a62, 0xd8664a, 0x7a3a6a] });
  // 门：深一档（中档 L ≈ 95），厕位这一半是这面墙的暗块
  const door = women
    ? ctx.mat('clothPurple', { ...FACE, ramp: [0x9a5ae8, 0x6a2ed0, 0x3a2a7a] })
    : ctx.mat('fabricStripe', { ...FACE, ramp: [0xd85a48, 0xb83c40, 0x6a2a5a] });
  const busy = ctx.mat('clothRed', { ...BRIGHT, ramp: [0xff6a4a, 0xd84a3a, 0x6a2a5a] });
  const free = ctx.mat('turf', { ...BRIGHT, ramp: [0x9ae86a, 0x5aba5a, 0x2e5a56] });

  // ── 墙：x −19…+19.5，z −5.5…−4.5（1 纹素厚），15 行高 ──
  const X0 = -19;
  const X1 = 19.5;
  const W = X1 - X0;
  const XC = (X0 + X1) / 2;
  const ZW = -5; // 墙中心 z
  const zf = ZW + 0.5; // 墙的正面
  box(wallBody, W, 15 * R, 1, XC, 0, ZW);
  decal(tile, W, 14 * R, X0, 0, zf, true); // 白砖：墙裙和腰线之间一排、腰线上面两行
  decal(aqua, W, 6 * R, X0, 0, zf + 0.01, true); // 墙裙两排水青砖
  decal(aqua, W, 3 * R, X0, 9 * R, zf + 0.01, true); // 腰线一排
  decal(trim, W, R, X0, 14 * R, zf); // 墙顶一行深色压条

  // ── 淋浴（x −19…−1，两间各 9 纹素）──
  box(tray, 18, 0.5 * R, 9, -10, 0, zf + 4.5);
  for (const cx of [-14.5, -5.5]) {
    box(steel, 1, R, 2, cx, 13 * R, zf + 1); // 墙上的短臂
    box(steel, 3, 0.5 * R, 2, cx, 12.5 * R, zf + 2.5); // 喷头（宽、扁）
    decal(valve, 1, R, cx - 0.5, 7 * R, zf + 0.02); // 阀门
  }
  // 玻璃：两间中间一道隔断（侧面只露一条亮边）+ 每间前沿半扇玻璃门（朝镜头，1 纹素一道亮的反光）
  box(glass, 1, 11 * R, 8, -10, 0.5 * R, zf + 4.5);
  for (const gx of [-19, -10]) {
    box(glass, 5, 10 * R, 1, gx + 3, 0.5 * R, zf + 8.5);
    decal(glint, 1, 6 * R, gx + 2, 3 * R, zf + 9);
  }

  // ── 厕位（x −1…+19.5，两间各 ~10 纹素）：隔板离地 1 行，门在前沿（z +5）──
  const ZD = 5; // 门中心 z
  for (const px of [-1, 9, 19]) box(partition, 1, 12 * R, 10, px, R, zf + 5);
  for (const [i, cx] of [-1 + 5, 9 + 5].entries()) {
    box(door, 9, 11 * R, 1, cx, R, ZD);
    decal(i === 0 ? busy : free, 1, R, cx + 3, 6 * R, ZD + 0.5);
  }

  const root = new THREE.Group();
  root.name = 'gym-wet';
  for (const [m, gs] of bins) root.add(new THREE.Mesh(gs.length > 1 ? mergeGeometries(gs) : gs[0], m));
  ctx.mats.prepare(root);
  return root;
}
