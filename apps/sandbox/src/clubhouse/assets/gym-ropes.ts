// gym-ropes · 战绳（B1 功能草道，slots-b1 的 gym-ropes，noBlock）：两根粗绳平铺在草皮上，北头（−z）绕在一根锚柱上，南头（+z）是握把。
// 尺寸：0.63 × 0.45 × 6.03 米（7 × 5 × 67 纹素，w × h × d；绳身只有 1 纹素高，5 纹素是锚柱）；规格 0.6 × 0.1 × 6。
// 每根绳 2 纹素宽：东边一列深蓝的绳身 + 西边一列亮脊，亮脊每 4 纹素断一格（= 绞股），读成"一根圆的粗绳"，不是一条线。
// 两根绳反着缓缓摆（按整纹素错 1 格，中间的草 1～3 纹素宽），北头一起绕进锚柱脚下的绳套；南头黑握把 + 一圈黄胶布。
// 颜色：草皮是亮黄绿（L ≈ 185 / 130），绳身用 L ≈ 118 的深蓝（再暗就和草、地砖的亮度差 > 60，满条都是强边缘），亮脊 L ≈ 165。
// 几何：只建看得见的面（yaw 0 下绳的 ±x 侧面是一条线，看不见）：绳身每段 顶 + 前 + 后，亮脊只有顶面。
// 三角形：绳身 2 × 10 段 × 6 = 120，亮脊 2 × 14 × 2 = 56，锚柱 + 绳套 2 × 10 = 20，握把 + 胶布 4 × 4 = 16，共 212（预算 250）。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { AssetCtx } from '../ctx';

type Face = 'top' | 'front' | 'back' | 'left' | 'right';

export function build(ctx: AssetCtx): THREE.Object3D {
  const T = ctx.texel;
  const flat = { noShadowReceive: true, edge: 0.2, convex: 0.1 };
  const face = { lightUp: 0.55, bands: [-0.45, 0.35] as [number, number], noShadowReceive: true, edge: 0.3 };
  const ropeM = ctx.mat('clothBlue', {
    ...flat,
    lightUp: 0.55,
    bands: [-0.45, 0.35],
    ramp: [0x4876ea, 0x3456c0, 0x24307c],
  });
  const lipM = ctx.mat('clothBlue', { ...flat, ramp: [0x80b0fa, 0x5e88dc, 0x36509c] });
  const gripM = ctx.mat('ironwork', { ...face, ramp: [0x4a4a86, 0x363468, 0x24224a] });
  const tapeM = ctx.mat('flowerYellow', { ...face });
  const steel = ctx.mat('metal', { ...face, ramp: [0xa8baf6, 0x7686d2, 0x40449a], convex: 0.25 });

  const parts = new Map<THREE.Material, THREE.BufferGeometry[]>();
  /** 只建给出的面（纹素坐标的最小 / 最大），非索引几何体 */
  const quads = (
    m: THREE.Material,
    x0: number,
    x1: number,
    y0: number,
    y1: number,
    z0: number,
    z1: number,
    faces: Face[],
    lift = 0,
  ) => {
    const [a, b, c, d, e, f] = [x0 * T, x1 * T, y0 * T + lift, y1 * T + lift, z0 * T, z1 * T];
    const pos: number[] = [];
    const nor: number[] = [];
    const quad = (p: number[][], n: number[]) => {
      for (const i of [0, 1, 2, 0, 2, 3]) {
        pos.push(...p[i]);
        nor.push(...n);
      }
    };
    for (const fc of faces) {
      if (fc === 'top')
        quad(
          [
            [a, d, f],
            [b, d, f],
            [b, d, e],
            [a, d, e],
          ],
          [0, 1, 0],
        );
      if (fc === 'front')
        quad(
          [
            [a, c, f],
            [b, c, f],
            [b, d, f],
            [a, d, f],
          ],
          [0, 0, 1],
        );
      if (fc === 'back')
        quad(
          [
            [b, c, e],
            [a, c, e],
            [a, d, e],
            [b, d, e],
          ],
          [0, 0, -1],
        );
      if (fc === 'left')
        quad(
          [
            [a, c, e],
            [a, c, f],
            [a, d, f],
            [a, d, e],
          ],
          [-1, 0, 0],
        );
      if (fc === 'right')
        quad(
          [
            [b, c, f],
            [b, c, e],
            [b, d, e],
            [b, d, f],
          ],
          [1, 0, 0],
        );
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    const l = parts.get(m) ?? [];
    l.push(g);
    parts.set(m, l);
  };
  const BOX: Face[] = ['top', 'front', 'back', 'left', 'right'];

  // ── 两根绳：z −28 … 29（57 纹素）分 10 段，每段一个整纹素的 x（左沿）；A 在西、B 在东，反着摆（中间的草时宽时窄）──
  const Z0 = -28;
  const Z1 = 29;
  const segs = [6, 6, 5, 6, 6, 5, 6, 6, 5, 6];
  const ax = [-3, -3, -3, -2, -2, -2, -2, -3, -3, -3];
  const bx = [1, 1, 2, 2, 2, 1, 1, 1, 2, 2];
  for (const xs of [ax, bx]) {
    let z = Z0;
    segs.forEach((len, i) => {
      quads(ropeM, xs[i], xs[i] + 2, 0, 1, z, z + len, ['top', 'front', 'back']);
      z += len;
    });
    // 亮脊（西边那一列）：每 4 纹素一截 3 纹素长（绞股之间断一格），跟着这一段的 x
    for (let k = Z0 + 1; k + 3 <= Z1; k += 4) {
      let acc = Z0;
      let i = 0;
      while (i < segs.length - 1 && acc + segs[i] <= k) acc += segs[i++];
      quads(lipM, xs[i], xs[i] + 1, 0, 1, k, k + 3, ['top'], 0.004);
    }
    // 南头：一圈黄胶布 + 黑握把
    const xe = xs[xs.length - 1];
    quads(tapeM, xe, xe + 2, 0, 2, Z1, Z1 + 1, ['top', 'front']);
    quads(gripM, xe, xe + 2, 0, 2, Z1 + 1, Z1 + 4, ['top', 'front']);
  }

  // ── 北头的锚柱 + 绳套（两根绳在这里绕柱子一圈）──
  quads(ropeM, -3, 4, 0, 2, -34, -28, BOX);
  quads(steel, -1, 3, 0, 5, -33, -30, BOX);

  const root = new THREE.Group();
  for (const [m, gs] of parts) root.add(new THREE.Mesh(mergeGeometries(gs), m));
  ctx.mats.prepare(root);
  return root;
}
