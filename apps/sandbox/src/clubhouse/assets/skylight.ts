// skylight：拱廊前沙地上的天窗（B1 有氧区的天光）。3.0 × 0.45 × 2.2 米（33 × 5 × 24 设计纹素）。
// 白灰泥的窗台（0.3 米高的一圈，stucco，顶上一层陶砖压顶 cap）+ 上面一个很平的人字玻璃顶（屋脊沿 x，0.3 → 0.45 米），两道竖梃 + 屋脊一道 + 一圈压条（ironwork），
// 玻璃（palette 的 glass，元素 = 一片片反光，三成的上沿有天光亮边）上面压两条斜的天光（浅青的平行四边形）。
// 三角形 146（窗台 12 + 压顶 12 + 玻璃 6 + 梃和压条 9 × 12 + 天光 4 × 2）。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { AssetCtx } from '../ctx';

const W = 3.0;
const D = 2.2;
const CURB = 0.3;
const PEAK = 0.45;
const IN = 0.2; // 玻璃离窗台外沿

export function build(ctx: AssetCtx): THREE.Object3D {
  const g = new THREE.Group();
  const t = ctx.texel;
  // 窗台：白灰泥的盒子（朝镜头的侧面背光 = 白灰泥的暗档）+ 顶上 6 厘米一层陶砖压顶（露出 0.2 米一圈，cap）
  const COPE = 0.06;
  g.add(
    new THREE.Mesh(
      new THREE.BoxGeometry(W, CURB - COPE, D).translate(0, (CURB - COPE) / 2, 0),
      ctx.mat('stucco', { elem: { kind: 'stones', size: [24, 12], seam: 0, hi: 0 } }),
    ),
  );
  g.add(
    new THREE.Mesh(
      new THREE.BoxGeometry(W + 0.04, COPE, D + 0.04).translate(0, CURB - COPE / 2, 0),
      ctx.mat('cap', { elem: { kind: 'stones', size: [9, 5], seam: 0.6, hi: 0.6 }, convex: 0.3 }),
    ),
  );

  // 玻璃：两片斜面 + 两头的山墙三角
  const gx = W / 2 - IN;
  const gz = D / 2 - IN;
  const y0 = CURB + 0.005;
  const P = (x: number, y: number, z: number) => [x, y, z];
  const tri = (pos: number[], a: number[], b: number[], c: number[]) => pos.push(...a, ...b, ...c);
  const pos: number[] = [];
  const nw = P(-gx, y0, -gz);
  const ne = P(gx, y0, -gz);
  const sw = P(-gx, y0, gz);
  const se = P(gx, y0, gz);
  const rw = P(-gx, PEAK, 0);
  const re = P(gx, PEAK, 0);
  tri(pos, nw, rw, re); // 北坡
  tri(pos, nw, re, ne);
  tri(pos, rw, sw, se); // 南坡（朝镜头）
  tri(pos, rw, se, re);
  tri(pos, nw, sw, rw); // 西山墙
  tri(pos, ne, re, se); // 东山墙
  const glassGeo = new THREE.BufferGeometry();
  glassGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  glassGeo.computeVertexNormals();
  g.add(
    new THREE.Mesh(
      glassGeo,
      ctx.mat('glass', { elem: { kind: 'stones', size: [14, 9], seam: 0, hi: 0.3 }, noShadowReceive: true, edge: 0.4 }),
    ),
  );

  // 斜面上一点的高度（压天光、梃用）
  const slopeY = (z: number) => y0 + (PEAK - y0) * (1 - Math.abs(z) / gz);
  // 竖梃：每片斜面两道（x = ±gx/3），屋脊一道；1 设计纹素宽、0.05 米厚
  const bars: THREE.BufferGeometry[] = [];
  const len = Math.hypot(gz, PEAK - y0);
  const ang = Math.atan2(PEAK - y0, gz);
  for (const x of [-gx / 3, gx / 3])
    for (const s of [-1, 1])
      bars.push(
        new THREE.BoxGeometry(t, 0.05, len).rotateX(s * ang).translate(x, (y0 + PEAK) / 2 + 0.02, (s * gz) / 2),
      );
  bars.push(new THREE.BoxGeometry(2 * gx, 0.06, t * 1.5).translate(0, PEAK + 0.01, 0));
  // 玻璃一圈的压条（窗台内沿，背光的暗边：玻璃和白窗台之间一道暗线）
  const fw = t * 1.2;
  bars.push(new THREE.BoxGeometry(2 * gx + fw, 0.06, fw).translate(0, CURB, -gz));
  bars.push(new THREE.BoxGeometry(2 * gx + fw, 0.06, fw).translate(0, CURB, gz));
  bars.push(new THREE.BoxGeometry(fw, 0.06, 2 * gz).translate(-gx, CURB, 0));
  bars.push(new THREE.BoxGeometry(fw, 0.06, 2 * gz).translate(gx, CURB, 0));
  g.add(new THREE.Mesh(mergeGeometries(bars), ctx.mat('ironwork', { convex: 0.3 })));

  // 天光：两条斜的平行四边形（宽 0.24 / 0.12 米），从屋脊斜着往下，南北两坡各一段
  const streak: number[] = [];
  const band = (xa: number, w: number, dx: number, s: number) => {
    // 从屋脊 (xa, z 0) 到檐 (xa + dx, z s·gz)，宽 w（沿 x）
    const z1 = s * (gz - 0.02);
    const a = [xa, slopeY(0) + 0.006, 0];
    const b = [xa + w, slopeY(0) + 0.006, 0];
    const c = [xa + w + dx, slopeY(z1) + 0.006, z1];
    const d = [xa + dx, slopeY(z1) + 0.006, z1];
    if (s > 0) streak.push(...a, ...d, ...c, ...a, ...c, ...b);
    else streak.push(...a, ...b, ...c, ...a, ...c, ...d);
  };
  band(-gx + 0.25, 0.24, 0.45, 1);
  band(-gx + 0.62, 0.12, 0.45, 1);
  band(0.35, 0.24, -0.45, -1);
  band(0.72, 0.12, -0.45, -1);
  const sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.Float32BufferAttribute(streak, 3));
  sg.computeVertexNormals();
  g.add(
    new THREE.Mesh(
      sg,
      ctx.mat('glass', { ramp: [0x9ae6ee, 0x7ccce0, 0x5a86bc], noShadowReceive: true, edge: 0, convex: 0 }),
    ),
  );
  ctx.mats.prepare(g);
  return g;
}
