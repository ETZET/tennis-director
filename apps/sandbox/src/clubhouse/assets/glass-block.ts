// glass-block：地面上的玻璃砖带（B1 的天光，和地面平、能走）。0.9 × 0.04 × 30 米（10 × 0.4 × 333 设计纹素），长边沿本地 z。
// 用在 s 1（西巷，沿 z）和 s 0.37（拱廊前，rotY 东 → 沿 x、0.33 米宽）。
// 画法：顶面 6 段（每段 5 米）的玻璃（palette 的 glass：亮档本色 L 153 青蓝、鼓面高一级 L 179、背光的低一级 L 120，亮边 = 天光）+
// strata 当砖格：一排排砖（一排 4 行 ≈ 0.25 米），每排 5 × (0.75～1.35) 纹素一块，竖缝八成、横缝八成，缝下一行四成亮（鼓面的光）。
// strata 是墙空间元素（uv 米）：uv 在第一次渲染时按世界坐标写（uv = (世界 x, 离这一段北沿的世界米数)），
// 所以 s 0.37、转向东都不变形，砖还是 ≈ 4～7 纹素；一段 5 米 = strata 一次最多数的 24 排以内。
// 侧面 0.04 米（不到一行）不画。三角形 12（6 段 × 2）。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { AssetCtx } from '../ctx';

const W = 0.9;
const H = 0.04;
const D = 30;
const SEG = 6;

export function build(ctx: AssetCtx): THREE.Object3D {
  const segs: THREE.BufferGeometry[] = [];
  for (let i = 0; i < SEG; i++)
    segs.push(
      new THREE.PlaneGeometry(W, D / SEG).rotateX(-Math.PI / 2).translate(0, H + 0.002, -D / 2 + (i + 0.5) * (D / SEG)),
    );
  const geo = mergeGeometries(segs);
  const m = ctx.mat('glass', {
    elem: { kind: 'strata', space: 'wall', size: [5, 4], hi: 0.4, q: [0, 1e6, 0, 0] },
    edge: 0.15,
    convex: 0.1,
  });
  const mesh = new THREE.Mesh(geo, m);
  // 第一次渲染时按世界坐标写 uv（每段 4 个顶点，PlaneGeometry 1×1 段）
  let done = false;
  mesh.onBeforeRender = () => {
    if (done) return;
    done = true;
    const p = geo.getAttribute('position');
    const uv = geo.getAttribute('uv') as THREE.BufferAttribute;
    const v = new THREE.Vector3();
    for (let s = 0; s < SEG; s++) {
      let z0 = Infinity;
      for (let k = 0; k < 4; k++)
        z0 = Math.min(z0, v.fromBufferAttribute(p, s * 4 + k).applyMatrix4(mesh.matrixWorld).z);
      for (let k = 0; k < 4; k++) {
        v.fromBufferAttribute(p, s * 4 + k).applyMatrix4(mesh.matrixWorld);
        uv.setXY(s * 4 + k, v.x, v.z - z0);
      }
    }
    uv.needsUpdate = true;
  };
  const g = new THREE.Group();
  g.add(mesh);
  ctx.mats.prepare(g, { cast: false });
  return g;
}
