// 车用的几何体小工具：都输出"非索引 + 平面法线 + color"的几何体（color 是顶点色乘子），这样同一个材质的零件能直接合并成一个网格
// （一个材质一个网格 → 一辆车 5 个 draw call；以后做 InstancedMesh 时每个零件的几何体原样拿去用）。
import * as THREE from 'three';
import { ConvexGeometry } from 'three/examples/jsm/geometries/ConvexGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export type V3 = [number, number, number];
export type RGB = [number, number, number];
export const WHITE: RGB = [1, 1, 1];

/** 统一格式：非索引、平面法线、只留 position / normal / color（color = 顶点色乘子） */
export function prep(g: THREE.BufferGeometry, color: RGB = WHITE, keepNormals = false): THREE.BufferGeometry {
  let out = g.index ? g.toNonIndexed() : g;
  for (const k of Object.keys(out.attributes)) if (k !== 'position' && k !== 'normal') out.deleteAttribute(k);
  if (!keepNormals || !out.getAttribute('normal')) out.computeVertexNormals();
  const n = out.getAttribute('position').count;
  const c = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) c.set(color, i * 3);
  out.setAttribute('color', new THREE.BufferAttribute(c, 3));
  if (out !== g) g.dispose();
  out = out as THREE.BufferGeometry;
  return out;
}

/** 凸包（车舱玻璃、车顶、柱子：几个矩形环一包，就是带斜面的块） */
export function hull(pts: V3[], color: RGB = WHITE): THREE.BufferGeometry {
  return prep(new ConvexGeometry(pts.map((p) => new THREE.Vector3(...p))), color, true);
}

/** 两个水平矩形环（下 y0、上 y1）包成的块：[x 半宽, z0, z1] 各一组 —— 上面收窄就是倒角/内倾 */
export function frustum(
  y0: number,
  lo: [number, number, number],
  y1: number,
  hi: [number, number, number],
  color: RGB = WHITE,
  cx = 0,
): THREE.BufferGeometry {
  const ring = (y: number, [hw, z0, z1]: [number, number, number]): V3[] => [
    [cx - hw, y, z0],
    [cx + hw, y, z0],
    [cx + hw, y, z1],
    [cx - hw, y, z1],
  ];
  return hull([...ring(y0, lo), ...ring(y1, hi)], color);
}

/** 轴对齐的盒子（世界单位：两端坐标） */
export function box(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, color: RGB = WHITE) {
  const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0);
  g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  return prep(g, color);
}

/** 四个点围的平面块（逆时针朝外），用来贴车窗反光条、门洞 */
export function quad(a: V3, b: V3, c: V3, d: V3, color: RGB = WHITE): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([...a, ...b, ...c, ...a, ...c, ...d]), 3));
  return prep(g, color);
}

/**
 * 车身下半：侧面轮廓（车的 [z, y]，车头在 −z）沿车宽挤出，带一圈 45° 倒角。
 * 轮廓 = 侧板（盖面）的外形；倒角往外再长 bevel（顶、车头车尾、底），侧板在 x = ±halfW。
 */
export function sideExtrude(profile: [number, number][], halfW: number, bevel: number, color: RGB = WHITE) {
  // Shape 的 (u, v) = (−z, y)；挤出方向是 Shape 的 +Z，转 90° 以后正好是车宽 x，u = −z 回到车的 z
  const shape = new THREE.Shape(profile.map(([z, y]) => new THREE.Vector2(-z, y)));
  const depth = 2 * (halfW - bevel);
  const g = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 1,
    curveSegments: 1,
    steps: 1,
  });
  g.translate(0, 0, -depth / 2);
  g.rotateY(Math.PI / 2);
  return prep(g, color);
}

/** 轮子：沿 x 的圆柱（平面切面，转起来轮廓一格一格地跳） */
export function wheel(r: number, w: number, seg: number, x: number, color: RGB = WHITE) {
  const g = new THREE.CylinderGeometry(r, r, w, seg, 1);
  g.rotateZ(Math.PI / 2);
  g.rotateX(Math.PI / seg);
  g.translate(x, 0, 0);
  return prep(g, color);
}

/** 沿 z 的圆柱（备胎，盘面朝 ±z） */
export function disc(r: number, d: number, seg: number, at: V3, color: RGB = WHITE) {
  const g = new THREE.CylinderGeometry(r, r, d, seg, 1);
  g.rotateX(Math.PI / 2);
  g.rotateZ(Math.PI / seg);
  g.translate(...at);
  return prep(g, color);
}

export function merge(gs: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const m = mergeGeometries(gs, false);
  for (const g of gs) g.dispose();
  if (!m) throw new Error('vehicle: mergeGeometries failed');
  m.computeBoundingSphere();
  return m;
}

export function tris(g: THREE.BufferGeometry): number {
  return (g.index ? g.index.count : g.getAttribute('position').count) / 3;
}
