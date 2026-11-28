// tease-court：出口外"下一张图的一角"——球场（第四轮「让布局说话」，exit-gates.ts 摆在去球场类图的出口外）。
// 一块 4 × 3 米的球场面（court 蓝，带一个白线的角）+ 沿北边、西边一道 L 形的深绿挡风网（2 米高，4 根铁柱）。
// 只露一角就认得出"那边是球场"：蓝地 + 白线 + 绿网，俱乐部里只有球场长这样。
// 本地：原点在场面的东南角附近；网在 −z（北）和 −x（西）两边。网朝镜头的那面不收影子、往上提光（同挡风网的规范）。三角形 ≈ 80。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { AssetCtx } from '../ctx';

const T = 0.09;
const W = 4.0;
const D = 3.0;
const FH = 1.3;

function box(w: number, h: number, d: number, x: number, y: number, z: number): THREE.BufferGeometry {
  return new THREE.BoxGeometry(w, h, d).translate(x, y, z);
}
function merge(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const g = mergeGeometries(list.map((x) => (x.index ? x.toNonIndexed() : x)));
  if (!g) throw new Error('tease-court: merge failed');
  return g;
}

const FACE = { lightUp: 0.5, bands: [-0.45, 0.3] as [number, number], noShadowReceive: true };

/** surface = 场面的材质（硬地 courtIn；红土 streetClay） */
export function buildTeaseCourt(
  ctx: AssetCtx,
  surface: 'courtIn' | 'streetClay' = 'courtIn',
  fence = true,
): THREE.Object3D {
  const g = new THREE.Group();
  g.name = 'tease-court';
  const x0 = -W;
  const z0 = -D;
  // 场面：薄板（2 厘米）、白线 2 纹素宽：底线（北边往里 0.5 米）和边线（西边往里 0.5 米）交成一个角
  const court = new THREE.Mesh(box(W, 0.02, D, x0 + W / 2, 0.01, z0 + D / 2), ctx.mat(surface, { convex: 0 }));
  court.receiveShadow = true;
  g.add(court);
  const lines = merge([
    box(W - 0.5, 0.01, 2 * T, x0 + 0.5 + (W - 0.5) / 2, 0.025, z0 + 0.5),
    box(2 * T, 0.01, D - 0.5, x0 + 0.5, 0.025, z0 + 0.5 + (D - 0.5) / 2),
  ]);
  const ln = new THREE.Mesh(lines, ctx.mat('line', { convex: 0 }));
  ln.receiveShadow = true;
  g.add(ln);
  // 挡风网：北边一道、西边一道，1 纹素厚
  if (!fence) return g;
  // 第 2 轮：只留北边一道（摆的时候不跟门转，永远在场面的后面）—— 两道 L 形在侧面 / 朝镜头时把场面整个挡成一块深色板
  const net = merge([box(W, FH - 0.3, T, x0 + W / 2, 0.3 + (FH - 0.3) / 2, z0)]);
  const nm = new THREE.Mesh(net, ctx.mat('windscreen', { ...FACE, convex: 0, edge: 0.4 }));
  nm.castShadow = true;
  g.add(nm);
  // 铁柱：角上一根，两头各一根，北边中间一根；柱顶一根 1 纹素的顶管
  const posts = merge([
    box(2 * T, FH + T, 2 * T, x0, (FH + T) / 2, z0),
    box(2 * T, FH + T, 2 * T, x0 + W, (FH + T) / 2, z0),
    box(2 * T, FH + T, 2 * T, x0 + W / 2, (FH + T) / 2, z0),
    box(W, T, T, x0 + W / 2, FH + T / 2, z0),
  ]);
  const pm = new THREE.Mesh(posts, ctx.mat('ironwork', { ...FACE, convex: 0.4, edge: 0.3 }));
  pm.castShadow = false;
  g.add(pm);
  return g;
}

export function build(ctx: AssetCtx): THREE.Object3D {
  return buildTeaseCourt(ctx);
}
