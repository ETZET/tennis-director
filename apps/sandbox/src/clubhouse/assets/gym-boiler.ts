// B1 机房的锅炉（#156）：圆的炉身，脚印 1 × 1 米（直径 0.81 米 + 往前的表、往后的管），包围盒 1.03 × 2.23 × 0.94 米 = 11 × 25 × 10 纹素。
// 元素：铜锈色的圆炉身（12 段、侧沿亮、正中中档）+ 两道深一档的铁箍 + 深靛的方底座 1 行 + 顶上一个矮的锥顶；
// 黄铜色的管子（2 纹素粗）：顶上一根往上再往北（贴墙）拐，东侧一根从半腰下到地；正面胸口高一块圆压力表
// （白盘 + 1 纹素的红指针，竖向拉长 √2 倍，屏幕上是圆的）+ 一个红的阀门手轮。竖直方向按屏幕行排（1 行 = 1.414 纹素）。
// 三角形 236（预算 250）。没有 userData。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { AssetCtx } from '../ctx';

const FACE = { lightUp: 0.55, bands: [-0.45, 0.35] as [number, number], noShadowReceive: true };
/** 圆柱：正中中档、两侧沿亮档（太阳在后方，圆柱是逆光的一圈亮边） */
const ROUND = { lightUp: 0.55, bands: [-0.45, -0.1] as [number, number], noShadowReceive: true };
const BRIGHT = { lightUp: 0.55, bands: [-0.9, -0.6] as [number, number], noShadowReceive: true };

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
  const cyl = (m: THREE.Material, r: number, h: number, y: number, open = false, rTop = r) =>
    put(m, new THREE.CylinderGeometry(rTop * T, r * T, h * T, 12, 1, open).translate(0, (y + h / 2) * T, 0));
  const disc = (m: THREE.Material, d: number, x: number, y: number, z: number) =>
    put(m, new THREE.CircleGeometry((d / 2) * T, 10).scale(1, R, 1).translate(x * T, y * T, z * T));
  const decal = (m: THREE.Material, w: number, h: number, x: number, y: number, z: number) =>
    put(m, new THREE.PlaneGeometry(w * T, h * T).translate((x + w / 2) * T, (y + h / 2) * T, z * T));

  // ── 材质 ──
  // 炉身：铜锈（借 rust，三档手挑：亮 L 160 / 中 L 118 / 暗 L 70）
  const shell = ctx.mat('rust', { ...ROUND, ramp: [0xf0945a, 0xcc6a40, 0x6a3454], convex: 0.4 });
  const hoop = ctx.mat('rust', { ...ROUND, ramp: [0xb85a40, 0x96463c, 0x522c4c], convex: 0.3 });
  const base = ctx.mat('ironwork', { ...FACE, ramp: [0x5a5a9a, 0x3a3a80, 0x262458] });
  const cap = ctx.mat('rust', { ramp: [0xf0a468, 0xc0704a, 0x6a3454], noShadowReceive: true, convex: 0.4 });
  const brass = ctx.mat('brass', { ...ROUND, convex: 0.5 });
  const dial = ctx.mat('clothWhite', { ...BRIGHT, edge: 0.2 });
  const dialRim = ctx.mat('ironwork', { ...FACE, ramp: [0x6a6aa0, 0x4a4a86, 0x2c2a5a], edge: 0.2 });
  const needle = ctx.mat('clothRed', { ...BRIGHT, ramp: [0xf04a3a, 0xd03a34, 0x6a2a5a] });
  const wheel = ctx.mat('clothRed', { ...FACE, ramp: [0xf05a48, 0xd0403a, 0x6a2a5a] });

  // ── 炉身：底座 10 × 1 行 × 10，炉身半径 4.5（直径 9 纹素）高 12 行，两道箍，锥顶 1.5 行 ──
  const RAD = 4.5;
  box(base, 10, R, 10, 0, 0, 0);
  cyl(shell, RAD, 12 * R, R);
  cyl(hoop, RAD + 0.3, R, 3 * R, true);
  cyl(hoop, RAD + 0.3, R, 10 * R, true);
  cyl(cap, RAD, 1.5 * R, 13 * R, false, 2);

  // ── 管子（黄铜，2 × 2）：顶上一根往上 3 行再往北拐到墙；东侧一根从 行 8 下到地 ──
  box(brass, 2, 3 * R, 2, 0, 14.5 * R, 0);
  box(brass, 2, 2, 5, 0, 17.5 * R - 2, -3);
  box(brass, 3, 2, 2, RAD + 0.5, 8 * R, 1.5);
  box(brass, 2, 8 * R, 2, RAD + 1, 0, 1.5);

  // ── 压力表：正面 行 7.5 的圆心，外圈 4 纹素、白盘 3 纹素，红指针 1 纹素（指向右上 = 压力偏高）；下面一个红手轮 ──
  const zf = RAD + 0.05;
  disc(dialRim, 4, 0, 7.5 * R, zf + 0.004 / T);
  disc(dial, 3, 0, 7.5 * R, zf + 0.008 / T);
  decal(needle, 1, R, 0, 7.5 * R, zf + 0.012 / T);
  disc(wheel, 3, -2, 4.5 * R, zf + 0.004 / T);

  const root = new THREE.Group();
  root.name = 'gym-boiler';
  for (const [m, gs] of bins) root.add(new THREE.Mesh(gs.length > 1 ? mergeGeometries(gs) : gs[0], m));
  ctx.mats.prepare(root);
  return root;
}
